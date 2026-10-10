'use strict';
/* =====================================================================
   Mixlab · coach et leçons guidées
   Le coach lit l'état réel des platines et du mixer ; chaque étape d'une
   leçon se valide toute seule quand l'élève l'a réussie.
   ===================================================================== */
window.Coach=(()=>{
  const A=()=>decks[0],B=()=>decks[1];
  const live={},L={active:null,i:0,hold:0,done:false,stats:{},hintEl:null,lastHint:''};
  let clash=0;

  function phaseMs(){
    const a=A(),b=B();if(!(a.track&&b.track&&a.playing&&b.playing))return null;
    return wrapHalf(b.beatPos()-a.beatPos())*60000/(a.track.bpm*a.rate);
  }
  const posText=ob=>{const r=((Math.round(ob)%32)+32)%32;return`mesure ${Math.floor(r/4)+1}, temps ${r%4+1}`;};
  function startOk(){const ls=B().lastStart;if(!ls||ls.otherBeat==null)return false;const r=Math.round(ls.otherBeat);return Math.abs(ls.otherBeat-r)<.2&&((r%32)+32)%32===0;}
  function setFxUi(d){renderFxUnit(d.fx);d.ui.fx.sel.value=d.fx.type;d.ui.fx.bv.textContent=beatsLabel(d.fx.beats);}
  function prep(){
    resetMixer();
    if(S.numDecks!==2){S.numDecks=2;}
    A().load(LIB.tracks[0]);B().load(LIB.tracks[1]);
  }

  const LESSONS=[
    {id:'tempo',lvl:3,mod:'Module 3 · Caler le tempo',title:'Caler le tempo à l’oreille',mins:'5 min',
     intro:'Sans Sync : tu égalises les BPM avec le pitch, puis tu alignes les temps avec le nudge. C’est le geste de base de tous les DJ.',
     setup(){prep();A().seek(A().timeOfBeat(64));B().seek(B().timeOfBeat(64));},
     steps:[
       {t:'Lance la platine A',target:'A.play',why:'A joue « Néons » à 124 BPM. Écoute la grosse caisse : boum, boum, boum, boum.',check:()=>A().playing},
       {t:'Lance la platine B, quand tu veux',target:'B.play',why:'B joue « Quai 9 » à 127 BPM. Les deux grosses caisses ne tombent pas ensemble : on entend un « galop ».',check:()=>B().playing},
       {t:'Égalise les tempos avec le pitch de B',target:()=>B().sync?'B.sync':'B.pitch',why:'B est plus rapide. Le fader de pitch change sa vitesse. Vise moins de 0,05 BPM d’écart.',
        hint(){const df=B().bpm-A().bpm;if(B().sync)return'Désactive SYNC : dans cette leçon on cale à l’oreille.';if(Math.abs(df)<.05)return'Tempos égaux.';return df>0?`B est plus rapide de ${df.toFixed(2)} BPM : monte le pitch de B (vers le haut).`:`B est plus lent de ${(-df).toFixed(2)} BPM : descends le pitch de B (vers le bas).`;},
        check:()=>!B().sync&&Math.abs(B().bpm-A().bpm)<.05,hold:.4},
       {t:'Aligne les grosses caisses avec le nudge',target:()=>{const ms=phaseMs();return ms==null?(A().playing?'B.play':'A.play'):Math.abs(B().bpm-A().bpm)>=.05?'B.pitch':ms>0?'B.nudgeL':'B.nudgeR';},why:'Même tempo ne veut pas dire mêmes temps. Pousse ou retiens B un instant (‹ › ou la platine) jusqu’à ce que les deux kicks n’en fassent plus qu’un.',
        hint(){const ms=phaseMs();if(!A().playing||!B().playing)return'Les deux platines doivent jouer.';if(Math.abs(B().bpm-A().bpm)>=.05)return'Les tempos ont bougé : réajuste le pitch de B.';return Math.abs(ms)<12?'C’est calé. Tiens 4 secondes…':ms>0?`B est en avance de ${ms.toFixed(0)} ms : retiens-le avec ‹.`:`B est en retard de ${(-ms).toFixed(0)} ms : pousse-le avec ›.`;},
        check:()=>{const ms=phaseMs();return ms!=null&&Math.abs(ms)<12&&Math.abs(B().bpm-A().bpm)<.05&&!B().sync;},hold:4}
     ],
     finish:()=>['Tempo calé à moins de 0,05 BPM, sans Sync.','Temps alignés à moins de 12 ms.','En vrai, ce calage se fait au casque : bouton CUE de B, fader de B en bas.']},
    {id:'swap',lvl:1,mod:'Module 4 · Transitions',title:'Première transition : l’échange des basses',mins:'8 min',
     intro:'La transition la plus jouée en house et en techno : B entre sans ses graves, puis on échange les basses des deux pistes sur un début de phrase.',
     setup(){prep();A().seek(A().timeOfBeat(160));B().track.cue=B().timeOfBeat(0);B().seek(B().track.cue);B().ui.fader.set(0);L.stats={tA:null,tB:null};},
     steps:[
       {t:'Lance la platine A',target:'A.play',why:'A est à la mesure 41 : il lui reste une phrase avant son outro. Regarde le compteur de phrase : une phrase = 8 mesures de 4 temps.',check:()=>A().playing},
       {t:'Appuie sur SYNC sur la platine B',target:'B.sync',why:'B prend le tempo de A (124 BPM). Avec Sync, son départ tombera aussi pile sur un temps de A.',check:()=>B().sync||Math.abs(B().bpm-A().bpm)<.05},
       {t:'Coupe les basses de B (LOW à fond à gauche, ou son bouton kill)',target:'B.low',why:'Deux grosses caisses et deux basses en même temps, c’est un mix boueux qui sature. B va entrer sans ses graves.',check:()=>!bassOn(B())},
       {t:'Lance B au début d’une phrase de A',target:()=>B().sync?'B.play':'B.sync',why:'Les morceaux sont construits en phrases de 8 mesures. Démarrer B sur le « 1 » d’une phrase de A fait coïncider leurs structures.',
        hint(){const bi=A().barInfo(),ls=B().lastStart;if(B().playing&&ls&&ls.otherBeat!=null&&!startOk())return`B est parti à la ${posText(ls.otherBeat)} de A. Mets B en pause, appuie sur CUE pour revenir au début, et réessaie.`;if(!B().sync)return'Remets SYNC sur B pour un départ calé.';if(!bi||bi.pre)return'';return`A : mesure ${bi.barIn+1}/8, temps ${bi.beat+1}. Appuie sur PLAY de B pendant le dernier temps de la mesure 8 : B partira sur le 1.`;},
        check:()=>B().playing&&startOk()},
       {t:'Monte le fader de B jusqu’en haut',target:'B.fader',why:'Progressivement, sur 4 à 8 mesures : les aigus et les médiums de B se glissent sous A, sans conflit de basses.',check:()=>B().p.fader>=.8},
       {t:'Échange des basses : coupe celles de A, remets celles de B',target:()=>bassOn(A())?'A.low':'B.low',why:'Sur le 1 d’une phrase, tourne les deux LOW en même temps : A perd ses graves pendant que B récupère les siens. Une seule basse à la fois.',
        hint(){const bi=A().barInfo();return bi&&!bi.pre?`A : mesure ${bi.barIn+1}/8. Vise le prochain 1.`:'';},
        check:()=>!bassOn(A())&&B().p.low>=.45&&!B().p.kill.low,hold:.3},
       {t:'Sors A en baissant son fader',target:'A.fader',why:'B porte maintenant le morceau. Retire A en douceur, ou d’un coup sur un début de phrase.',check:()=>A().p.fader<=.05||!A().playing||xfGainOf(A())<.05}
     ],
     finish(){const s=L.stats,res=['Transition terminée : B a pris le relais de A.'];
       if(s.tA!=null&&s.tB!=null){const gap=Math.abs(s.tA-s.tB)*A().track.bpm*A().rate/60;res.push(gap<1.5?`Échange des basses net : ${gap.toFixed(1)} temps d’écart entre les deux potards.`:`Échange des basses en ${gap.toFixed(1)} temps : essaie de tourner les deux potards ensemble (sur une table, une main sur chaque LOW).`);}
       res.push(clash<.5?'Aucun conflit de basses.':`Basses qui se battent pendant ${clash.toFixed(1)} s : à réduire au prochain essai.`);return res;}},
    {id:'echo',lvl:2,mod:'Module 4 · Transitions',title:'Sortie en écho',mins:'5 min',
     intro:'Pour changer d’ambiance d’un coup : on coupe A sur la fin d’une phrase en laissant résonner un écho calé sur le tempo, puis B démarre sur le 1.',
     setup(){prep();A().seek(A().timeOfBeat(160));B().track.cue=B().timeOfBeat(0);B().seek(B().track.cue);B().ui.fader.set(0);
       A().fx.toggle('A',true);A().fx.setMode('single');A().fx.setType('reverb');A().fx.beats=.5;A().fx.on=false;A().fx.apply();setFxUi(A());layout.visible.add('fx');applyLayout();L.stats={cut:null};},
     steps:[
       {t:'Lance la platine A',target:'A.play',why:'A joue sa dernière phrase avant l’outro. Les effets sont dans la bande FX, sous les platines.',check:()=>A().playing},
       {t:'Sur l’unité FX assignée à A, choisis « Écho » et une durée de 1 temps',target:()=>'#fxu-'+A().fx.n+(A().fx.type==='echo'?' .bseg':' select'),why:'Un écho d’un temps répète chaque son exactement sur le temps suivant : il reste dans le groove.',check:()=>A().fx.type==='echo'&&A().fx.beats===1},
       {t:'Monte le dosage vers 60 % et active l’effet (On)',target:()=>A().fx.amount<.4?'A.fxamt':'A.fxon',why:'L’écho s’ajoute au son de A. Pour l’instant on l’entend à peine : il va prendre toute la place quand A sera coupé.',check:()=>A().fx.on&&A().fx.amount>=.4},
       {t:'Coupe le fader de A d’un coup, sur le dernier temps d’une phrase',target:'A.fader',why:'Le son de A disparaît mais l’écho, placé après le fader dans la chaîne de A, continue de résonner et s’éteint tout seul.',
        hint(){const bi=A().barInfo();return bi&&!bi.pre?`A : mesure ${bi.barIn+1}/8, temps ${bi.beat+1}.`:'';},
        check:()=>A().p.fader<=.05&&A().fx.on},
       {t:'Appuie sur SYNC de B, lance-le et monte son fader',target:()=>!B().sync&&!B().playing?'B.sync':!B().playing?'B.play':'B.fader',why:'B arrive pendant que l’écho s’éteint. Un départ franc sur le 1 marque le changement.',check:()=>B().playing&&B().p.fader>=.6}
     ],
     finish(){const s=L.stats,res=['Sortie en écho réussie.'];if(s.cut!=null){const r=((Math.round(s.cut)%32)+32)%32;res.push(r>=28||r===0?'Coupure bien placée, en fin de phrase.':`A coupé à la ${posText(s.cut)} : essaie plutôt sur la mesure 8, avant le 1 suivant.`);}res.push('Pense à couper l’effet de A avant de recharger cette platine.');return res;}}
  ];
  const SOON=['Module 1 · Le signal : gain, VU-mètres, rester hors du rouge','Module 2 · Structure d’un morceau : intro, break, drop','Module 4 · Transition au filtre, transition en boucle','Module 5 · Harmonie : mixer des tonalités compatibles','Module 6 · Construire un set et gérer l’énergie','Module 7 · Performance : hot cues, rolls, sampler'];

  function build(){
    const el=$('#coach-live');el.innerHTML='';
    const mkPhr=d=>{const bars=h('div',{class:'bars'});for(let i=0;i<8;i++)bars.append(h('i'));const beats=h('div',{class:'beats'});for(let i=0;i<4;i++)beats.append(h('i'));live['p'+d.id]={bars,beats,txt:h('span',{class:'v'},'')};
      return h('div',{class:'lr',style:`--dc:var(--${d.id})`},h('span',{class:'lbl',style:'color:var(--dc)'},'Phrase '+d.id),h('div',{class:'phr'},bars,beats,live['p'+d.id].txt));};
    live.tempo=h('span',{class:'v'},'');live.nd=h('div',{class:'nd'});live.ph=h('span',{class:'v'},'');
    el.append(h('div',{class:'lr'},h('span',{class:'lbl'},'Tempo'),live.tempo),
      h('div',{class:'lr'},h('span',{class:'lbl'},'Phase'),h('div',{style:'display:grid;gap:3px'},h('div',{class:'phase',title:'Décalage entre les temps de A et de B. L’aiguille doit rester dans la zone verte.'},h('div',{class:'okz'}),live.nd),live.ph)),
      mkPhr(A()),mkPhr(B()));
    render();
  }
  function render(){
    const el=$('#coach-body');el.innerHTML='';const les=L.active;
    if(!les){
      if(window.Parcours)el.append(Parcours.card());
      if(window.Academie)el.append(Academie.card());
      el.append(...LESSONS.slice().sort((a,b)=>a.lvl-b.lvl).map(l=>h('div',{class:'lcard'},h('span',{class:'mod'},`Niveau ${l.lvl} · ${l.mod.replace(/^Module \d+ · /,'')} · ${l.mins}`),h('b',{},l.title),h('p',{},l.intro),h('button',{class:'go',onclick:()=>start(l.id)},'Commencer'))));
      el.append(h('div',{},h('div',{class:'lbl',style:'margin-bottom:4px'},'Bientôt'),h('ul',{class:'soon'},SOON.map(s=>h('li',{},s)))));
      return;
    }
    const n=les.steps.length;
    el.append(h('div',{},h('div',{class:'lbl',style:'color:var(--coach)'},les.mod),h('div',{style:'font-weight:600;font-size:13px;color:var(--white)'},les.title),h('div',{class:'prog'},h('i',{style:`width:${(L.done?n:L.i)/n*100}%`}))));
    el.append(h('ol',{class:'steps'},les.steps.map((s,i)=>h('li',{class:L.done||i<L.i?'done':i===L.i?'cur':''},s.t))));
    if(L.done)el.append(h('div',{class:'donebox flash'},h('b',{},'Leçon validée.'),h('ul',{},les.finish().map(x=>h('li',{},x)))));
    else{const s=les.steps[L.i];L.hintEl=h('div',{class:'hx'},'');L.lastHint='';el.append(h('div',{class:'now',id:'coach-now'},h('div',{class:'t'},`Étape ${L.i+1}/${n} · ${s.t}`),h('div',{class:'why'},s.why),L.hintEl));}
    el.append(h('div',{class:'r fixed',style:'flex-wrap:wrap'},h('button',{class:'b',onclick:()=>start(les.id)},'Recommencer'),!L.done&&h('button',{class:'b',onclick:()=>advance(true)},'Passer l’étape'),h('button',{class:'b',onclick:()=>{L.active=null;render();}},'Toutes les leçons')));
  }
  function start(id){
    const les=LESSONS.find(l=>l.id===id);L.active=les;L.i=0;L.hold=0;L.done=false;L.stats={};clash=0;
    if(S.numDecks!==2){S.numDecks=2;}
    les.setup();if(!layout.coach)layout.coach=true;applyLayout();render();
  }
  function advance(skip){
    const les=L.active;L.i++;L.hold=0;
    if(L.i>=les.steps.length){L.done=true;toast('Leçon réussie : '+les.title,'ok');}
    else if(!skip)toast(les.steps[L.i-1].t,'ok');
    render();const now=$('#coach-now');if(now&&!skip)now.classList.add('flash');
  }
  // Halo sur la commande à toucher (même mécanisme que le coach en direct et le parcours).
  let tEl=null,tId=null;
  function setTarget(id){
    const el=!id?null:/^[#.\[]/.test(id)?$(id):(ctl(id)||{}).el||null;
    if(tEl&&tEl!==el)tEl.classList.remove('coach-target');tEl=el;tId=el?id:null;if(el){el.classList.add('coach-target');window.revealCtl&&revealCtl(el);}
  }
  function tick(dt){
    {const s=L.active&&!L.done&&!$('#p-coach').hidden?L.active.steps[L.i]:null;let id=null;try{id=s?(typeof s.target==='function'?s.target():s.target):null;}catch(e){}setTarget(id);}
    if($('#p-coach').hidden||!live.nd)return;
    const a=A(),b=B();
    if(a.track&&b.track){const df=b.bpm-a.bpm;live.tempo.textContent=`A ${a.bpm.toFixed(2)} · B ${b.bpm.toFixed(2)} · écart ${df>=0?'+':''}${df.toFixed(2)}`;live.tempo.style.color=Math.abs(df)<.05?'var(--ok)':'';}
    const ms=phaseMs();
    if(ms==null){live.nd.style.left='50%';live.nd.style.background='var(--dim)';live.ph.textContent='Lance A et B pour mesurer';}
    else{live.nd.style.left=(50+clamp(ms/60,-1,1)*50)+'%';live.nd.style.background=Math.abs(ms)<12?'var(--ok)':Math.abs(ms)<30?'var(--warn)':'var(--bad)';live.ph.textContent=Math.abs(ms)<3?'Calé':`B ${ms>0?'en avance':'en retard'} de ${Math.abs(ms).toFixed(0)} ms`;}
    for(const d of[a,b]){
      const bi=d.barInfo(),p=live['p'+d.id];if(!p)continue;
      [...p.bars.children].forEach((e,i)=>{e.className=bi&&!bi.pre?(i<bi.barIn?'on':i===bi.barIn?'cur':''):'';});
      [...p.beats.children].forEach((e,i)=>{e.className=bi&&!bi.pre&&i<=bi.beat?'on':'';});
      p.txt.textContent=!bi?'—':bi.pre?'intro':`P${bi.phrase+1} · ${bi.barIn+1}/8`;
    }
    if(audible(a)&&audible(b)&&bassOn(a)&&bassOn(b))clash+=dt;
    const les=L.active;if(!les||L.done)return;
    const s=les.steps[L.i];
    if(les.id==='swap'&&L.i===5){const st=L.stats,now=ctx.currentTime;if(st.tA==null&&!bassOn(a))st.tA=now;if(st.tB==null&&b.p.low>=.45&&!b.p.kill.low)st.tB=now;}
    if(les.id==='echo'&&L.i===3&&L.stats.cut==null&&a.p.fader<=.05&&a.fx.on)L.stats.cut=a.beatPos();
    if(s.check()){L.hold+=dt;if(L.hold>=(s.hold||.25)){advance();return;}}else L.hold=0;
    const ht=s.hint?s.hint():'';if(L.hintEl&&ht!==L.lastHint){L.hintEl.textContent=ht;L.lastHint=ht;}
  }
  return{build,tick,start,render,phaseMs,L,LESSONS,get target(){return tId;}};
})();
