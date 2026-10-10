'use strict';
/* =====================================================================
   Mixlab · auto-mix et suggestion du morceau suivant
   Suggest : classe la bibliothèque par compatibilité avec une platine
   (tonalité, tempo à ±6 % y compris moitié / double, énergie, historique).
   AutoMix : une file d'attente jouée toute seule, comme un DJ : le morceau
   suivant est chargé sur la platine libre, synchronisé, lancé sur le 1
   d'une phrase calée sur l'outro de celui qui sort, puis la transition
   (basses, filtre, écho ou coupe) passe par les mêmes commandes que la
   souris : l'interface bouge. Si tu touches une commande pendant une
   transition, l'auto-mix te laisse la main jusqu'au morceau suivant.
   ===================================================================== */
window.Suggest=(()=>{
  const recentIds=()=>{const s=new Set();LIB.history.slice(-15).forEach(x=>s.add(x.track.id));if(window.AutoMix)AutoMix.state.played.slice(-15).forEach(id=>s.add(id));return s;};
  const bpmGap=(a,b)=>Math.min(...[1,2,.5].map(f=>Math.abs(b*f-a)/a));
  function refOf(x){
    if(typeof x==='string')x=deckById(x);
    if(!x)return null;
    if(x instanceof Deck)return x.track?{t:x.track,key:x.keyNow(),bpm:x.bpm,energy:x.track.energy}:null;
    return{t:x,key:x.key,bpm:x.bpm,energy:x.energy};
  }
  // note sur 100 : tonalité 40, tempo 30, énergie 20, pas encore joué 10
  function rate(ref,t,rec=new Set()){
    const why=[],ka=keyInfo(ref.key),kb=keyInfo(t.key);let s=0,keyOk=false;
    if(ka&&kb){
      if(ka.code===kb.code){s+=40;keyOk=true;why.push('même tonalité '+kb.code);}
      else if(keysCompatible(ref.key,t.key)){s+=34;keyOk=true;why.push(ka.code+' → '+kb.code);}
      else why.push(kb.code+' peu compatible avec '+ka.code);
    }else s+=12;
    const g=bpmGap(ref.bpm,t.bpm),bpmOk=g<=.06;
    if(bpmOk)s+=30*(1-g/.06);
    why.push(t.bpm.toFixed(0)+' BPM'+(bpmOk?'':' (trop loin)'));
    if(ref.energy&&t.energy){const de=t.energy-ref.energy;s+=20*clamp(1-Math.abs(de-.5)/4,0,1);why.push('énergie '+t.energy+(de>0?' ↑':de<0?' ↓':''));}else s+=10;
    if(rec.has(t.id)){s-=50;why.push('déjà joué');}else s+=10;
    return{t,score:clamp(Math.round(s),0,100),keyOk,bpmOk,why};
  }
  function next(deck,o={}){
    const ref=refOf(deck||refDeck());if(!ref)return[];
    const busy=new Set(decks.filter(d=>d.active&&d.track&&d.playing).map(d=>d.track.id));busy.add(ref.t.id);
    const rec=recentIds();
    return(o.pool||LIB.tracks).filter(t=>!busy.has(t.id)).map(t=>rate(ref,t,rec)).sort((a,b)=>b.score-a.score).slice(0,o.n||5);
  }
  return{next,rate,refOf,bpmGap};
})();

window.AutoMix=(()=>{
  const STYLES={auto:'Auto',bass:'Basses',filter:'Filtre',echo:'Écho',cut:'Coupe'};
  const WHY={bass:'Échange des basses au milieu de la transition.',filter:'Passe-haut sur la piste qui entre, passe-bas sur celle qui sort.',echo:'La piste qui sort s’éteint dans un écho.',cut:'Coupe nette sur le 1 de la phrase.'};
  const PAIR={A:'B',B:'A',C:'D',D:'C'};
  const A={on:false,st:'off',queue:[],style:store.get('amStyle','auto'),bars:store.get('amBars',16),fill:store.get('amFill',true),played:[],
    main:null,inc:null,plan:null,w:{},f0:1,msg:'',lastTry:0,takeT:0,glide:false,echoOn:false,done:0,b0:0,timer:null,open:false,el:{}};
  const trk=id=>LIB.tracks.find(t=>t.id===id);
  const P=(d,k)=>d.id+'.'+k;
  const nowS=()=>performance.now()/1000;
  const kc=k=>{const i=keyInfo(k);return i?i.code:'?';};

  /* ---------- commandes : on passe par le registre, comme la souris ou le MIDI ---------- */
  function val(id){if(id==='xf')return S.xf;const[dd,k]=id.split('.'),d=deckById(dd);return k==='fxamt'?d.fx.amount:d.p[k];}
  function set(id,v){const c=ctl(id);if(!c)return;if(A.w[id]!=null&&Math.abs(val(id)-v)<.004)return;c.set(v);A.w[id]=val(id);}
  const press=id=>{const c=ctl(id);c&&c.press({});};
  // une valeur qui n'est plus celle qu'on a posée : quelqu'un a touché la commande
  function touched(){for(const id in A.w)if(Math.abs(val(id)-A.w[id])>.02)return id;return null;}
  function neutral(d,fader){
    for(const b of['high','mid','low']){set(P(d,b),.5);if(d.p.kill[b])press(P(d,'kill'+b));}
    set(P(d,'filter'),.5);set(P(d,'fader'),fader);
    if(d.fx.on)press(P(d,'fxon'));
  }

  /* ---------- file d'attente ---------- */
  function takeNext(){
    const ref=A.main,playing=new Set(decks.filter(d=>d.track&&d.playing).map(d=>d.track.id));
    A.queue=A.queue.filter(id=>trk(id));
    const cand=A.queue.filter(id=>!playing.has(id)).slice(0,3);
    if(cand.length){
      // on suit l'ordre de la file, sauf si un des deux suivants colle nettement mieux
      let best=cand[0];
      const r=ref&&Suggest.refOf(ref);
      if(r&&cand.length>1){let bs=-1e9;cand.forEach((id,i)=>{const sc=Suggest.rate(r,trk(id)).score+[15,5,0][i];if(sc>bs){bs=sc;best=id;}});}
      A.queue.splice(A.queue.indexOf(best),1);renderQueue();return trk(best);
    }
    if(A.fill&&ref){const s=Suggest.next(ref,{n:1})[0];if(s)return s.t;}
    return null;
  }
  function freeDeck(m){
    const ok=d=>d&&d.active&&d!==m;
    const p=deckById(PAIR[m.id]);if(ok(p)&&!p.playing)return p;
    return decks.find(d=>ok(d)&&!d.playing)||decks.find(d=>ok(d)&&!audible(d))||null;
  }

  /* ---------- plan de la transition ----------
     Elle se termine à la fin de la musique du morceau qui sort et démarre sur un
     début de phrase (32 temps) : en pratique, sur son outro ou sa dernière phrase. */
  function plan(out,inc){
    let style=A.style,why;
    const ko=out.keyNow(),ki=inc.keyNow(),compat=!ko||!ki||keysCompatible(ko,ki);
    const gap=Suggest.bpmGap(out.bpm,inc.track.bpm);
    const outro=[...(out.track.sections||[])].reverse().find(s=>s.type==='outro'),intro=(inc.track.sections||[]).find(s=>s.type==='intro');
    if(style==='auto'){
      if(gap>.08){style='cut';why='Tempos trop éloignés : coupe nette sur le 1.';}
      else if(!compat){style='echo';why=`Tonalités peu compatibles (${kc(ko)} → ${kc(ki)}) : transition courte, sortie en écho.`;}
      else if((outro&&outro.bars>=A.bars/2)||(intro&&intro.bars>=A.bars/2)){style='bass';why=`Tonalités compatibles (${kc(ko)} → ${kc(ki)}) : mélange long avec échange des basses.`;}
      else{style='filter';why='Intro et outro courtes : le filtre fait de la place à la piste qui entre.';}
    }else why=WHY[style];
    let len=style==='cut'?4:style==='echo'?Math.min(A.bars*4,32):A.bars*4;
    const endT=Math.min(out.track.duration,out.track.musicEnd||out.track.duration);
    const endBeat=Math.floor((out.beatIdx(endT)+.25)/4)*4,cur=out.beatPos();
    let start=Math.floor((endBeat-len)/32)*32;
    if(start<cur+1.5){start=Math.ceil((cur+1.5)/4)*4;len=Math.max(4,Math.min(len,Math.floor((endBeat-start)/4)*4));}
    const swap=Math.min(len,Math.round(len/8)*4||4);
    const res={start,len,style,why,swapP:swap/len};
    return window.Planner?Planner.linkPlan(out,inc,res):res; // point de mix préparé (planner.js)
  }
  function prepare(){
    const m=A.main,d=freeDeck(m);
    if(!d){A.msg='Aucune platine libre pour le morceau suivant.';return false;}
    const tr=takeNext();
    if(!tr){A.msg='File vide : l’auto-mix s’arrêtera à la fin de ce morceau.';return false;}
    if(d.playing)d.pause();
    d.load(tr);A.w={};
    neutral(d,0);set(P(d,'low'),0);
    if(!d.sync)press(P(d,'sync'));
    const ip=window.Planner&&Planner.inPoint(m.track,tr);d.seek(ip!=null?ip:d.timeOfBeat(0));
    A.inc=d;A.plan=plan(m,d);A.msg='';
    renderQueue();renderSug();return true;
  }
  function replan(){if(A.st==='play'&&A.inc&&A.main)A.plan=plan(A.main,A.inc);}

  /* ---------- déroulé ---------- */
  function startMix(){
    const m=A.main,i=A.inc,p=A.plan,ob=m.beatPos();
    if(ob>p.start-.05)p.start=Math.ceil(ob+.03);
    A.w={};A.echoOn=false;A.f0=m.p.fader;
    set(P(i,'fader'),0);set(P(i,'low'),0);set(P(i,'filter'),p.style==='filter'?.8:.5);
    for(const k of['fader','low','filter'])A.w[P(m,k)]=val(P(m,k));
    if(!i.sync)press(P(i,'sync'));
    A.b0=Math.round(i.beatIdx(i.position()));
    press(P(i,'play'));
    A.played.push(i.track.id);A.st='mix';
  }
  // avancement en temps de la piste qui entre (elle reste calée, même quand l'autre s'est arrêtée)
  const progress=()=>A.inc&&A.plan?(A.inc.beatPos()-A.b0)/A.plan.len:0;
  function automate(p){
    const o=A.main,i=A.inc,st=A.plan.style,r=(a,b)=>clamp((p-a)/(b-a),0,1);
    const swap=()=>{set(P(o,'low'),0);set(P(i,'low'),.5);};
    if(st==='bass'){set(P(i,'fader'),r(0,.25));if(p>=A.plan.swapP)swap();set(P(o,'fader'),A.f0*(1-r(.75,1)));}
    else if(st==='filter'){set(P(i,'filter'),.5+.3*(1-r(0,.5)));set(P(i,'fader'),r(0,.15));if(p>=A.plan.swapP)swap();set(P(o,'filter'),.5-.32*r(.5,1));set(P(o,'fader'),A.f0*(1-r(.85,1)));}
    else if(st==='echo'){
      set(P(i,'fader'),r(0,.25));if(p>=A.plan.swapP)swap();
      if(p>=.625&&!A.echoOn){A.echoOn=true;o.fx.setType('echo');o.fx.beats=1;o.ui.fx.sel.value='echo';o.ui.fx.bv.textContent=beatsLabel(1);set(P(o,'fxamt'),.55);if(!o.fx.on)press(P(o,'fxon'));}
      if(p>=.75&&o.playing)press(P(o,'play'));
    }
    else{if(p>0)set(P(i,'fader'),1);if(p>=1){set(P(o,'fader'),0);swap();}}
  }
  function finish(){
    const o=A.main,i=A.inc,echo=A.plan.style==='echo';
    if(o.track&&!A.played.includes(o.track.id))A.played.push(o.track.id);
    set(P(i,'low'),.5);set(P(i,'filter'),.5);set(P(i,'fader'),1);
    if(o.playing)press(P(o,'play'));
    const reset=()=>{A.w={};neutral(o,0);if(o.sync)press(P(o,'sync'));};
    // l'écho garde sa traîne : on range la platine sortante un peu plus tard
    if(echo){A.lastTry=nowS()+3;setTimeout(()=>{if(!o.playing){reset();A.w={};}},2800);}else reset();
    if(S.master!==i)press(P(i,'master'));
    A.main=i;A.inc=null;A.plan=null;A.st='play';A.w={};A.glide=true;A.done++;
  }
  function adopt(d){
    A.main=d;A.inc=null;A.plan=null;A.st='play';A.w={};A.takeT=0;A.glide=false;
    if(S.master!==d)press(P(d,'master'));
  }
  // après une transition synchronisée, la piste revient doucement à son tempo d'origine
  function glide(m){if(!A.glide||m.sync||Math.abs(m.pitch)<1e-4)return;m.setPitch(m.pitch-Math.sign(m.pitch)*Math.min(Math.abs(m.pitch),.00004));}

  function tick(){
    if(!A.on)return;
    if(window.Coach&&Coach.L&&Coach.L.active&&!Coach.L.done){stop('Leçon en cours : auto-mix arrêté.');return;}
    const m=A.main;
    if(A.st==='play'){
      if(!m||!m.track||!m.active){stop('La platine principale n’a plus de morceau : auto-mix arrêté.');return;}
      if(!m.playing){stop(A.inc?'Lecture arrêtée : auto-mix en pause.':'Fin de la file : auto-mix terminé.');return;}
      if(A.inc&&(A.inc.playing||!A.inc.track||A.inc===m)){A.inc=null;A.plan=null;}
      if(!A.inc&&nowS()>A.lastTry){A.lastTry=nowS()+1;prepare();}
      if(A.inc&&A.plan){if(m.beatPos()>=A.plan.start-.9)startMix();else glide(m);}
      else glide(m);
    }else if(A.st==='mix'){
      const id=touched();
      if(id||!A.inc.playing){A.st='take';A.takeT=0;A.msg=id?`Tu as pris la main (${ctl(id).label}) : je te laisse finir cette transition.`:'Tu as pris la main : je te laisse finir cette transition.';toast(A.msg);renderStatus();return;}
      const p=progress();
      automate(clamp(p,0,1));
      if(p>=1)finish();
    }else if(A.st==='take'){
      const aud=decks.filter(d=>d.active&&d.playing&&audible(d));
      if(aud.length===1){A.takeT+=.04;if(A.takeT>1.5)adopt(aud[0]);}else A.takeT=0;
      if(!decks.some(d=>d.active&&d.playing))stop('Plus rien ne joue : auto-mix arrêté.');
    }
  }
  function start(){
    if(A.on)return true;
    resumeAudio();
    let m=decks.find(d=>d.active&&d.track&&d.playing&&audible(d))||decks.find(d=>d.active&&d.track&&d.playing);
    if(!m){
      m=decks.find(d=>d.active);
      const tr=A.queue.length?takeNext():m.track;
      if(!tr){toast('Ajoute des morceaux à la file d’attente pour lancer l’auto-mix.');return false;}
      if(m.track!==tr)m.load(tr);
      if(m.position()>=m.track.duration-30)m.seek(m.timeOfBeat(0));
      A.w={};neutral(m,1);if(m.sync)press(P(m,'sync'));
      if(Math.abs(S.xf-.5)>.01)ctl('xf').set(.5);
      press(P(m,'play'));
    }
    if(!A.played.includes(m.track.id))A.played.push(m.track.id);
    A.on=true;A.main=m;A.st='play';A.inc=null;A.plan=null;A.w={};A.lastTry=0;A.glide=false;A.msg='';
    if(S.master!==m)press(P(m,'master'));
    A.timer=setInterval(tick,40);
    render();return true;
  }
  function stop(msg){
    if(A.st==='play'&&A.inc&&!A.inc.playing)set(P(A.inc,'low'),.5);
    A.on=false;A.st='off';clearInterval(A.timer);A.timer=null;A.msg=msg||'';A.w={};
    if(msg)toast(msg);render();
  }

  /* ---------- panneau ---------- */
  const sel=(opts,v,on)=>{const s=h('select',{class:'sel'},Object.entries(opts).map(([k,n])=>h('option',{value:k},n)));s.value=String(v);s.addEventListener('change',()=>on(s.value));return s;};
  const meta=t=>{const ki=keyInfo(t.key);return h('span',{class:'am-meta'},t.bpm.toFixed(0)+' BPM',ki?h('span',{class:'kchip',style:'--kc:'+keyColor(ki)},ki.code):null,t.energy?'E'+t.energy:null);};
  function setOpen(o){A.open=o;A.el.panel.hidden=!o;A.el.btn.setAttribute('aria-pressed',String(o));if(o)render();}
  function build(){
    const E=A.el;
    E.dot=h('span',{class:'dot'});
    E.btn=h('button',{class:'tb',id:'am-btn',title:'Auto-mix : enchaîne la file d’attente tout seul, sur les phrases','aria-pressed':'false',onclick:()=>setOpen(!A.open)},E.dot,'Auto-mix');
    $('#coach-btn').before(E.btn);
    E.go=h('button',{class:'b am-go',type:'button',onclick:()=>{A.on?stop():start();}},'Démarrer');
    E.st=h('div',{class:'am-st'});E.why=h('div',{class:'am-why'});E.prog=h('i');
    E.style=sel(STYLES,A.style,v=>{A.style=v;store.set('amStyle',v);replan();renderStatus();});
    E.bars=sel({4:'4 mesures',8:'8 mesures',16:'16 mesures',32:'32 mesures'},A.bars,v=>{A.bars=+v;store.set('amBars',A.bars);replan();renderStatus();});
    E.src=h('select',{class:'sel','aria-label':'Remplir la file depuis'});
    E.q=h('ol',{class:'am-q'});E.sug=h('ol',{class:'am-sug'});E.ref=h('span',{class:'am-ref'});
    const fill=h('input',{type:'checkbox'});fill.checked=A.fill;fill.addEventListener('change',()=>{A.fill=fill.checked;store.set('amFill',A.fill);});
    E.q.addEventListener('dragover',e=>e.preventDefault());
    E.q.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();const id=+e.dataTransfer.getData('text/mixlab-track');if(id)add(id);});
    E.panel=h('aside',{class:'am-panel',id:'p-automix',hidden:true,'aria-label':'Auto-mix'},
      h('h2',{},'Auto-mix',E.go,h('button',{class:'b x',type:'button',title:'Fermer le panneau (l’auto-mix continue)',onclick:()=>setOpen(false)},'Fermer')),
      h('div',{class:'am-box'},E.st,h('div',{class:'am-prog'},E.prog),E.why),
      h('div',{class:'am-row'},h('span',{class:'lbl'},'Style'),E.style,h('span',{class:'lbl'},'Durée'),E.bars),
      h('div',{class:'am-sec'},h('span',{class:'lbl'},'File d’attente'),h('span',{class:'am-acts'},
        h('button',{class:'b',type:'button',title:'Ajouter le morceau sélectionné dans la bibliothèque',onclick:()=>{if(ui.sel)add(ui.sel);else toast('Sélectionne d’abord un morceau dans la bibliothèque');}},'+ Sélection'),
        E.src,h('button',{class:'b',type:'button',title:'Remplacer la file par cette playlist',onclick:()=>fillFrom(E.src.value)},'Remplir'),
        h('button',{class:'b',type:'button',title:'Vider la file',onclick:()=>{A.queue=[];renderQueue();}},'Vider'))),
      E.q,
      h('label',{class:'am-fill'},fill,'File vide : continuer avec les suggestions'),
      h('div',{class:'am-sec'},h('span',{class:'lbl'},'Suivant suggéré'),E.ref),
      E.sug,
      h('div',{class:'am-leg',title:'Sections détectées, en couleur sous les waveforms'},Object.values(Structure.TYPES).map(t=>h('span',{style:'--c:'+t.col},t.label))));
    document.body.append(E.panel);
    setInterval(()=>{if(A.open)renderStatus();E.dot.classList.toggle('on',A.on);},250);
    setInterval(()=>{if(A.open)renderSug();},2500);
    render();
  }
  function fillFrom(v){
    const ids=v==='all'?LIB.tracks.map(t=>t.id):(LIB.playlists.find(p=>p.id===v)||{ids:[]}).ids.slice();
    const cur=new Set(decks.filter(d=>d.playing&&d.track).map(d=>d.track.id));
    A.queue=ids.filter(id=>!cur.has(id));renderQueue();
    if(!A.queue.length)toast('Cette playlist est vide.');
  }
  function add(id,front){A.queue=A.queue.filter(x=>x!==id);front?A.queue.unshift(id):A.queue.push(id);renderQueue();}
  function renderQueue(){
    const E=A.el;if(!E.q)return;E.q.innerHTML='';
    const v=E.src.value;E.src.innerHTML='';E.src.append(...LIB.playlists.map(p=>h('option',{value:p.id},p.name)),h('option',{value:'all'},'Toute la collection'));E.src.value=v||LIB.playlists[0].id;
    if(A.on&&A.inc&&A.inc.track)E.q.append(h('li',{class:'cur'},h('span',{class:'n'},A.inc.id),h('span',{class:'t'},A.inc.track.title,meta(A.inc.track)),h('span',{class:'am-tag'},'chargé')));
    A.queue.forEach((id,i)=>{const t=trk(id);if(!t)return;
      E.q.append(h('li',{},h('span',{class:'n'},String(i+1)),h('span',{class:'t'},t.title,meta(t)),
        h('span',{},i?h('button',{class:'b',type:'button',title:'Monter',onclick:()=>{A.queue.splice(i,1);A.queue.splice(i-1,0,id);renderQueue();}},'↑'):null,
          h('button',{class:'b',type:'button',title:'Retirer de la file',onclick:()=>{A.queue.splice(i,1);renderQueue();}},'×'))));});
    if(!A.queue.length&&!(A.on&&A.inc&&A.inc.track))E.q.append(h('li',{class:'empty'},'Glisse des morceaux ici, ou remplis la file depuis une playlist.'));
  }
  function renderSug(){
    const E=A.el;if(!E.sug)return;E.sug.innerHTML='';
    const ref=A.main&&A.main.track?A.main:refDeck()||decks.find(d=>d.active&&d.track);
    E.ref.textContent=ref?'d’après '+ref.id+' · '+ref.track.title:'';
    // jamais un morceau déjà chargé sur une platine
    const loaded=new Set(decks.filter(d=>d.active&&d.track).map(d=>d.track.id));
    const list=ref?Suggest.next(ref,{n:5+loaded.size}).filter(s=>!loaded.has(s.t.id)).slice(0,5):[];
    list.forEach(s=>E.sug.append(h('li',{title:s.why.join(' · ')},h('span',{class:'sc '+(s.score>=75?'ok':s.score>=50?'warn':'')},String(s.score)),
      h('span',{class:'t'},s.t.title,h('span',{class:'am-meta'},s.why.join(' · '))),
      h('button',{class:'b',type:'button',title:'Jouer ce morceau ensuite',onclick:()=>{add(s.t.id,true);toast('« '+s.t.title+' » passera ensuite','ok');}},'Ensuite'))));
    if(!list.length)E.sug.append(h('li',{class:'empty'},'Charge un morceau pour voir les suggestions.'));
  }
  function renderStatus(){
    const E=A.el;if(!E.st)return;
    E.go.textContent=A.on?'Arrêter':'Démarrer';E.go.classList.toggle('on',A.on);
    let st='',why='',pr=0;const m=A.main,p=A.plan;
    if(!A.on){st=A.msg||'Auto-mix à l’arrêt';why='Remplis la file puis lance-le : il enchaîne les morceaux sur les phrases, comme un DJ. Touche une commande pendant une transition pour reprendre la main.';}
    else if(A.st==='play'){
      if(A.inc&&p&&m.track){const bars=Math.max(0,Math.ceil((p.start-m.beatPos())/4));st=`${m.id} → ${A.inc.id} dans ${bars} mesure${bars>1?'s':''} · ${STYLES[p.style]} · ${p.len/4} mesures`;why=`Ensuite : ${A.inc.track.title}. ${p.why}`;}
      else{st=m&&m.track?`${m.id} à l’antenne · ${m.track.title}`:'En attente';why=A.msg;}
    }else if(A.st==='mix'&&p){pr=clamp(progress(),0,1);const b=pr*p.len/4;st=`Transition ${m.id} → ${A.inc.id} · ${Math.floor(b)}/${p.len/4} mesures · ${STYLES[p.style]}`;why=p.why;}
    else if(A.st==='take'){st='À toi de jouer';why=A.msg;}
    E.st.textContent=st;E.why.textContent=why||'';E.prog.parentElement.hidden=A.st!=='mix';E.st.parentElement.className='am-box'+(A.on?' on':'')+(A.st==='take'?' take':'');E.prog.style.width=(pr*100).toFixed(1)+'%';
  }
  function render(){renderStatus();renderQueue();renderSug();}
  function onAnalyzed(tr){if(A.inc&&A.inc.track===tr||A.main&&A.main.track===tr)replan();}

  return{build,start,stop,add,tick,plan,setOpen,onAnalyzed,STYLES,state:A,
    get queue(){return A.queue;},set queue(v){A.queue=v.slice();renderQueue();},
    setStyle(v){A.style=v;if(A.el.style)A.el.style.value=v;replan();},setBars(n){A.bars=n;if(A.el.bars)A.el.bars.value=String(n);replan();}};
})();
