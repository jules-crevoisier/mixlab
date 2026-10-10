'use strict';
/* =====================================================================
   Mixlab · coach en direct
   Il écoute le mix pendant que tu joues, sans leçon : niveaux, basses,
   tempo, phase, tonalités, phrases, fin de morceau, effets oubliés.
   Un seul conseil à la fois, sur la commande à toucher (halo à l'écran,
   LED qui clignote sur la table). Chaque transition reçoit un bilan.
   ===================================================================== */
window.MixCoach=(()=>{
  const LEVELS={off:'Coupé',essentiel:'Essentiel',debutant:'Débutant'};
  const SEV={bad:3,warn:2,tip:1};
  const C={level:store.get('coachLevel','debutant'),issues:new Map(),events:[],muted:new Set(),hist:[],target:null,tr:null,
    acc:0,lastAud:-1e9,lv:{},master:{db:-90,before:-90},el:{}};
  const buf=new Float32Array(1024);
  const now=()=>performance.now()/1000;

  /* ---------- mesures ---------- */
  function meter(an){an.getFloatTimeDomainData(buf);let s=0,pk=0;for(let i=0;i<buf.length;i++){const v=buf[i];s+=v*v;const a=Math.abs(v);if(a>pk)pk=a;}return{db:10*Math.log10(s/buf.length+1e-12),pk};}
  const ema=(old,v,dt,tau)=>old+(v-old)*Math.min(1,dt/tau);
  const gainOf=d=>d.p.fader*d.p.fader*xfGainOf(d);
  const on=d=>d.active&&d.track&&d.playing&&gainOf(d)>.05;
  const flat=d=>['low','mid','high'].every(b=>!d.p.kill[b]&&Math.abs(d.p[b]-.5)<.15)&&Math.abs(d.p.filter-.5)<.05;
  const remaining=d=>d.track?(d.track.duration-d.position())/Math.max(.01,d.rate):0;
  const phrasePos=ob=>{const r=((Math.round(ob)%32)+32)%32;return{bar:Math.floor(r/4)+1,beat:r%4+1,ok:r===0};};
  function phaseMs(a,b){
    if(!(a.track&&b.track&&a.playing&&b.playing))return null;
    return wrapHalf(b.beatPos()-a.beatPos())*60000/(a.track.bpm*a.rate);
  }
  const kname=d=>{const k=keyInfo(d.keyNow());return k?k.code:'?';};
  function neighbours(d){
    const k=keyInfo(d.keyNow());if(!k)return'';
    const n=x=>((x-1+12)%12)+1;
    return[`${n(k.num-1)}${k.letter}`,`${k.num}${k.letter}`,`${n(k.num+1)}${k.letter}`,`${k.num}${k.letter==='A'?'B':'A'}`].join(', ');
  }

  /* ---------- règles ----------
     Chaque règle renvoie null (tout va bien) ou {msg, why, target}.
     Elle ne s'affiche que si le problème dure `after` secondes. */
  const RULES=[
    {id:'clip',sev:'bad',after:.2,test(x){
      if(C.master.pk<.98)return null;
      const hot=x.aud.slice().sort((a,b)=>C.lv[b.id].post-C.lv[a.id].post)[0];
      return hot&&hot.p.trim>.45?{msg:'Le son sature',why:`Baisse le GAIN de ${hot.id} : le master est dans le rouge et le limiteur écrase le son.`,target:hot.id+'.trim'}
        :{msg:'Le son sature',why:'Baisse le MASTER : la sortie est dans le rouge.',target:'master'};}},
    {id:'hot',sev:'warn',after:1,test(x){
      const d=x.aud.find(d=>C.lv[d.id].pk>.92);
      return d?{msg:`Voie ${d.id} dans le rouge`,why:`Baisse le GAIN de ${d.id} jusqu’à rester dans le orange sur les parties fortes.`,target:d.id+'.trim'}:null;}},
    {id:'tempo',sev:'bad',after:.6,test(x){
      if(!x.inc)return null;const df=x.inc.bpm-x.main.bpm;if(Math.abs(df)<=.1)return null;
      return{msg:`Tempos pas calés : ${x.inc.id} ${df>0?'plus rapide':'plus lent'} de ${Math.abs(df).toFixed(1)} BPM`,
        why:`Les grosses caisses vont « galoper ». ${df>0?'Descends':'Monte'} le pitch de ${x.inc.id}, ou appuie sur SYNC.`,target:x.inc.id+'.pitch'};}},
    {id:'phase',sev:'warn',after:1,test(x){
      if(!x.inc||Math.abs(x.inc.bpm-x.main.bpm)>.1)return null;
      const ms=phaseMs(x.main,x.inc);if(ms==null||Math.abs(ms)<20)return null;
      return{msg:`Les kicks se décalent : ${x.inc.id} ${ms>0?'en avance':'en retard'} de ${Math.abs(ms).toFixed(0)} ms`,
        why:ms>0?`Retiens ${x.inc.id} un instant avec ‹ ou en freinant la platine.`:`Pousse ${x.inc.id} un instant avec › ou en accélérant la platine.`,target:x.inc.id+(ms>0?'.nudgeL':'.nudgeR')};}},
    {id:'bass',sev:'bad',after:.8,test(x){
      if(!x.inc||!(bassOn(x.main)&&bassOn(x.inc))||gainOf(x.inc)<.25||gainOf(x.main)<.25)return null;
      return{msg:'Deux basses en même temps',why:`Les basses se battent et le mix devient boueux. Coupe le LOW de ${x.inc.id} et échange les basses sur le 1 d’une phrase.`,target:x.inc.id+'.low'};}},
    {id:'key',sev:'warn',after:3,test(x){
      if(!x.inc||gainOf(x.inc)<.3||gainOf(x.main)<.3)return null;
      const a=x.main.keyNow(),b=x.inc.keyNow();if(!a||!b||keysCompatible(a,b))return null;
      return{msg:`Tonalités qui frottent : ${kname(x.main)} et ${kname(x.inc)}`,
        why:`Garde ce passage court ou baisse les MID de ${x.inc.id}. Avec ${kname(x.main)}, ça sonne juste en ${neighbours(x.main)}.`,target:x.inc.id+'.mid'};}},
    {id:'gain',sev:'warn',after:3,test(x){
      if(!x.inc||!flat(x.main)||!flat(x.inc)||x.main.p.fader<.5||x.inc.p.fader<.5)return null;
      const df=C.lv[x.inc.id].pre-C.lv[x.main.id].pre;if(Math.abs(df)<4)return null;
      const loud=df>0?x.inc:x.main;
      return{msg:`${loud.id} est ${Math.abs(df).toFixed(0)} dB plus fort que ${loud===x.inc?x.main.id:x.inc.id}`,
        why:`Règle le GAIN de ${loud.id} pour que les deux pistes aient le même volume, faders en haut. Sinon le public entend un saut.`,target:loud.id+'.trim'};}},
    {id:'overlap',sev:'tip',after:0,test(x){
      if(!x.inc||!C.tr||gainOf(x.main)<.5||gainOf(x.inc)<.5)return null;
      const bars=(now()-C.tr.full)*x.main.bpm/240;if(!(C.tr.full>0)||bars<24)return null;
      return{msg:'Les deux morceaux jouent à fond depuis longtemps',why:`Ça fait ${bars.toFixed(0)} mesures. Termine la transition : sors ${x.main.id} sur la prochaine phrase.`,target:x.main.id+'.fader'};}},
    {id:'ending',sev:'warn',after:0,test(x){
      if(x.inc||!x.main||x.main.loop.on)return null;const r=remaining(x.main);if(r>30)return null;
      const next=decks.find(d=>d!==x.main&&d.active&&d.track&&!d.playing);
      if(!next)return{msg:`${x.main.id} se termine dans ${r.toFixed(0)} s`,why:'Charge le morceau suivant sur une autre platine, maintenant.',target:null,sev:r<12?'bad':'warn'};
      return{msg:`${x.main.id} se termine dans ${r.toFixed(0)} s`,why:`Lance ${next.id} sur le prochain début de phrase (compteur P), fader encore bas.`,target:next.id+'.play',sev:r<12?'bad':'warn'};}},
    {id:'silence',sev:'bad',after:.8,test(x){
      if(x.aud.length||now()-C.lastAud>20)return null;
      const next=decks.find(d=>d.active&&d.track);
      return{msg:'Silence sur la piste de danse',why:next?`Relance du son tout de suite : PLAY sur ${next.id} et fader en haut.`:'Charge un morceau et lance-le.',target:next?next.id+'.play':null};}},
    {id:'filter',sev:'tip',after:15,test(x){
      if(x.inc||!x.main||Math.abs(x.main.p.filter-.5)<.1)return null;
      return{msg:`Le filtre de ${x.main.id} est resté ${x.main.p.filter<.5?'fermé (sons étouffés)':'ouvert (plus de graves)'}`,why:'Un filtre sert de passage. Ramène-le au centre une fois la transition finie.',target:x.main.id+'.filter'};}},
    {id:'fx',sev:'tip',after:25,test(x){
      const d=x.aud.find(d=>d.fx.on&&d.fx.amount>.15);
      return d?{msg:`L’effet de ${d.id} tourne depuis un moment`,why:'Un effet marque un moment. Laissé en continu, il fatigue l’oreille : coupe-le ou baisse son dosage.',target:d.id+'.fxon'}:null;}},
    {id:'eqboost',sev:'tip',after:4,test(x){
      for(const d of x.aud)for(const b of['high','mid','low'])if(d.p[b]>.85&&!d.p.kill[b])
        return{msg:`EQ poussé à fond sur ${d.id}`,why:'En mix, on coupe ce qui gêne plutôt que de booster : le boost fait vite saturer.',target:`${d.id}.${b}`};
      return null;}},
  ];
  const state={};RULES.forEach(r=>state[r.id]={held:0,clear:0,res:null});

  /* ---------- transitions ---------- */
  function trStart(main,inc){
    const ls=inc.lastStart;let start=null;
    if(ls&&ls.otherBeat!=null&&ls.other===main)start=phrasePos(ls.otherBeat);
    C.tr={from:main,to:inc,t0:now(),full:0,clash:0,phaseSum:0,phaseN:0,tempoMax:0,key:null,before:C.master.before,start};
  }
  function trSample(x,dt){
    const t=C.tr;if(!t||!x.inc)return;
    if(!t.full&&gainOf(t.from)>.5&&gainOf(t.to)>.5)t.full=now();
    if(bassOn(x.main)&&bassOn(x.inc)&&gainOf(x.inc)>.25&&gainOf(x.main)>.25)t.clash+=dt;
    t.tempoMax=Math.max(t.tempoMax,Math.abs(x.inc.bpm-x.main.bpm));
    const ms=phaseMs(x.main,x.inc);if(ms!=null&&Math.abs(x.inc.bpm-x.main.bpm)<=.1){t.phaseSum+=Math.abs(ms)*dt;t.phaseN+=dt;}
    const a=x.main.keyNow(),b=x.inc.keyNow();if(a&&b&&gainOf(x.inc)>.3)t.key=t.key===false?false:keysCompatible(a,b);
  }
  function trEnd(winner){
    const t=C.tr;C.tr=null;if(!t||winner!==t.to)return;
    const secs=now()-t.t0,bars=secs*t.to.bpm/240,good=[],tips=[];let score=100;
    if(t.start){if(t.start.ok)good.push('Départ sur le 1 d’une phrase.');else{score-=15;tips.push(`${t.to.id} est parti à la mesure ${t.start.bar}, temps ${t.start.beat} de la phrase : vise le 1 (compteur P).`);}}
    if(t.clash<.5)good.push('Pas de conflit de basses.');else{score-=Math.min(30,Math.round(t.clash*8));tips.push(`Basses superposées pendant ${t.clash.toFixed(1)} s : coupe le LOW de la piste qui entre.`);}
    if(t.tempoMax>.1){score-=20;tips.push(`Tempos décalés de ${t.tempoMax.toFixed(1)} BPM pendant la transition.`);}
    else if(t.phaseN>1){const avg=t.phaseSum/t.phaseN;if(avg<15)good.push(`Calage précis (${avg.toFixed(0)} ms en moyenne).`);else{score-=avg>30?15:8;tips.push(`Kicks décalés de ${avg.toFixed(0)} ms en moyenne : corrige plus tôt avec le nudge.`);}}
    if(t.key===false){score-=10;tips.push('Tonalités peu compatibles : transition plus courte ou morceau voisin sur la roue.');}
    else if(t.key===true)good.push('Tonalités compatibles.');
    const jump=C.master.db-t.before;
    if(t.before>-60&&Math.abs(jump)>3){score-=10;tips.push(`Le volume a ${jump>0?'monté':'baissé'} de ${Math.abs(jump).toFixed(0)} dB après la transition : règle les GAIN avant.`);}
    if(bars<2){score-=5;tips.push('Transition très courte : bien pour une coupe franche, sinon laisse les deux pistes cohabiter 4 à 16 mesures.');}
    score=clamp(score,0,100);
    const r={from:t.from.id,to:t.to.id,title:t.to.track?t.to.track.title:'',bars,score,good,tips,at:new Date()};
    C.hist.unshift(r);C.hist.length=Math.min(C.hist.length,6);
    if(C.level!=='off')toast(`Transition ${r.from} → ${r.to} : ${score}/100`,score>=75?'ok':'');
    renderPanel(true);
  }

  /* ---------- boucle ---------- */
  function measure(dt){
    const m=[meter(bus.anL),meter(bus.anR)],pk=Math.max(m[0].pk,m[1].pk),db=Math.max(m[0].db,m[1].db);
    C.master.pk=pk;C.master.db=ema(C.master.db,db,dt,3);
    for(const d of decks){
      const L=C.lv[d.id]||(C.lv[d.id]={post:-90,pre:-90,pk:0});if(!d.active)continue;
      const r=meter(d.an);L.pk=r.pk;L.post=ema(L.post,r.db,dt,.4);
      const g=d.p.fader*d.p.fader;if(g>.05&&d.playing)L.pre=ema(L.pre,r.db-20*Math.log10(g),dt,1.5);
    }
  }
  // La piste principale est celle qui joue au public depuis le plus longtemps ;
  // l'autre est celle qui entre.
  const since={};
  function situation(){
    const aud=decks.filter(on),t=now();
    for(const d of decks){if(aud.includes(d)){if(since[d.id]==null)since[d.id]=t;}else since[d.id]=null;}
    const main=aud.slice().sort((a,b)=>since[a.id]-since[b.id]||gainOf(b)-gainOf(a))[0]||decks.find(d=>d.active&&d.playing)||null;
    const inc=aud.find(d=>d!==main)||null;
    return{aud,main,inc};
  }
  function tick(dt){
    C.acc+=dt;if(C.acc<.1)return;dt=C.acc;C.acc=0;
    measure(dt);
    const x=situation();
    if(x.aud.length)C.lastAud=now();
    if(!C.tr)C.master.before=ema(C.master.before,C.master.db,dt,4);
    if(x.inc&&!C.tr)trStart(x.main,x.inc);
    if(C.tr){
      if(x.inc){C.tr.single=0;trSample(x,dt);}
      else if((C.tr.single=(C.tr.single||0)+dt)>2)trEnd(x.aud[0]||null);
    }
    for(const r of RULES){
      const s=state[r.id];let res=null;
      if(C.level!=='off'&&!C.muted.has(r.id))try{res=r.test(x);}catch(e){res=null;}
      if(res){s.held+=dt;s.clear=0;s.res=res;}
      else{s.clear+=dt;if(s.clear>.6){s.held=0;s.res=null;}}
      const sev=(s.res&&s.res.sev)||r.sev,show=s.res&&s.held>=r.after&&(C.level==='debutant'||sev!=='tip');
      if(show)C.issues.set(r.id,{...s.res,sev,id:r.id});else C.issues.delete(r.id);
    }
    if(Coach.L.active&&!Coach.L.done)for(const[k,v]of C.issues)if(v.sev!=='bad')C.issues.delete(k);
    if(window.Parcours&&Parcours.active)for(const[k,v]of C.issues)if(!Parcours.keepIssue(v))C.issues.delete(k);
    render();
  }

  /* ---------- affichage ---------- */
  function top(){let best=null;for(const v of C.issues.values())if(!best||SEV[v.sev]>SEV[best.sev])best=v;return best;}
  function setTarget(id){
    if(C.target===id)return;
    if(C.target){const c=ctl(C.target);c&&c.el.classList.remove('coach-target');}
    C.target=id;if(id){const c=ctl(id);c&&c.el.classList.add('coach-target');}
  }
  let lastKey='';
  function render(){
    const b=top(),hud=C.el.hud;setTarget((window.Parcours&&Parcours.target)||(window.Coach&&Coach.target)?null:(b&&b.target||null));
    const key=b?b.id+b.msg+b.why:'';
    if(key!==lastKey){
      lastKey=key;hud.hidden=!b;
      if(b){hud.className='coach-hud '+b.sev;C.el.msg.textContent=b.msg;C.el.why.textContent=b.why;C.el.more.textContent=C.issues.size>1?`+${C.issues.size-1}`:'';}
      renderPanel(false);
    }
  }
  function renderPanel(hist){
    const L=C.el.list;if(!L)return;L.innerHTML='';
    const items=[...C.issues.values()].sort((a,b)=>SEV[b.sev]-SEV[a.sev]);
    if(!items.length)L.append(h('div',{class:'cl-ok'},C.level==='off'?'Coach en direct coupé.':'Rien à signaler. Le coach écoute le mix.'));
    items.forEach(v=>L.append(h('div',{class:'alert '+(v.sev==='bad'?'':v.sev==='warn'?'warn':'tip')},h('b',{},v.msg),' ',v.why)));
    if(!hist)return;
    const H=C.el.hist;H.innerHTML='';
    if(!C.hist.length){H.append(h('div',{class:'cl-ok'},'Le bilan de chaque transition s’affichera ici.'));return;}
    C.hist.forEach((r,i)=>H.append(h('details',{class:'trcard',open:i===0},
      h('summary',{},h('span',{class:'sc '+(r.score>=75?'ok':r.score>=50?'warn':'bad')},String(r.score)),` ${r.from} → ${r.to} · ${r.bars.toFixed(0)} mesures`),
      h('ul',{},r.good.map(g=>h('li',{class:'g'},g)),r.tips.map(t=>h('li',{class:'t'},t))))));
  }
  function setLevel(l){C.level=l;store.set('coachLevel',l);C.el.lvl.value=l;const dt=$('#coachlive-dot');dt&&dt.classList.toggle('on',l!=='off');const cb=$('#coach-btn');cb&&cb.setAttribute('title',l==='off'?'Coach et leçons (conseils en direct coupés)':'Coach et leçons · conseils en direct : '+LEVELS[l]);lastKey='x';renderPanel(true);}
  function build(){
    C.el.msg=h('b',{});C.el.why=h('span',{});C.el.more=h('i',{class:'more',title:'Autres conseils dans le panneau Coach'});
    C.el.hud=h('div',{class:'coach-hud',hidden:true,role:'status','aria-live':'polite'},
      h('span',{class:'dot'}),h('div',{class:'tx'},C.el.msg,C.el.why),C.el.more,
      h('button',{class:'x',title:'Ne plus afficher ce conseil pendant cette session',onclick:()=>{const b=top();if(b){C.muted.add(b.id);toast('Conseil masqué pour cette session','ok');}}},'×'));
    document.body.append(C.el.hud);
    C.el.lvl=h('select',{class:'sel',title:'Ce que le coach signale pendant que tu mixes',onchange:e=>setLevel(e.target.value)},Object.entries(LEVELS).map(([k,v])=>h('option',{value:k},v)));
    C.el.list=h('div',{class:'cl-list'});C.el.hist=h('div',{class:'cl-hist'});
    $('#coach-live').after(h('div',{class:'live',id:'coach-direct'},
      h('div',{class:'lr'},h('span',{class:'lbl',title:'Conseils pendant que tu mixes'},'Conseils'),C.el.lvl),C.el.list,
      h('div',{class:'lbl',style:'margin-top:4px'},'Dernières transitions'),C.el.hist));
    // Un seul bouton Coach : le voyant dit si les conseils en direct sont actifs, le niveau se règle dans le panneau.
    $('#coach-btn').prepend(h('span',{class:'dot',id:'coachlive-dot'}));
    setLevel(C.level);
  }
  return{build,tick,state:C,get target(){return C.target;},RULES,setLevel};
})();
