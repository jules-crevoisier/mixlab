'use strict';
/* =====================================================================
   Mixlab · parcours « De zéro à ton premier set »
   14 chapitres pour quelqu'un qui n'a jamais touché une platine.
   L'interface grandit : chaque chapitre débloque les commandes qu'il
   enseigne. Chaque étape se vérifie toute seule sur l'état réel de
   l'appli ; on peut toujours la passer. Progression, badges et temps
   passé sont sauvegardés ; on reprend là où on s'était arrêté.
   ===================================================================== */
window.Parcours=(()=>{
  const A=()=>decks[0],B=()=>decks[1];
  const demo=(t,i)=>LIB.tracks.find(x=>x.demo&&x.title===t)||LIB.tracks[i]||LIB.tracks[0];
  const near=(a,b,e)=>Math.abs(a-b)<e;
  const posTxt=d=>{const bi=d.barInfo();return bi&&!bi.pre?`mesure ${bi.barIn+1}/8, temps ${bi.beat+1}`:'';};
  const fmtMin=s=>s<60?Math.round(s)+' s':s<3600?Math.round(s/60)+' min':Math.floor(s/3600)+' h '+String(Math.round(s%3600/60)).padStart(2,'0');
  const pl=(n,w,ws)=>n+' '+(n>1?ws||w+'s':w);
  const energy=t=>clamp(Math.round(1+(t.bpm-116)/14*5+((t.rmsDb||-20)+24)/10*4),1,10);
  const DEF={v:1,active:false,ch:0,step:0,done:{},skips:0,badges:[],time:0,chTime:{},ear:{},score:{},set:[],run:null,sets:[],free:false};
  const prog=Object.assign({},DEF,store.get('parcours',{}));
  const save=()=>store.set('parcours',prog);
  const P={ready:false,steps:[],st:{},hold:0,view:'step',target:null,saved:null,lastSave:0,el:{}};

  /* ---------- glossaire : chaque mot technique entre {accolades} est cliquable ---------- */
  const GLOSS={
    'dj':'Celui ou celle qui enchaîne des morceaux pour faire danser, sans jamais laisser de silence.',
    'platine':'Le lecteur d’un morceau. Ici, A et B. Le disque tourne pendant la lecture.',
    'mixer':'La table qui mélange les platines. Chaque platine y a sa voie : gain, EQ, filtre, fader.',
    'fader':'Le curseur vertical de volume d’une voie. En bas, le public n’entend plus cette platine.',
    'master':'Le volume final, celui qui part vers les enceintes de la salle.',
    'cue':'Le point de départ d’un morceau. En lecture, CUE y ramène la platine et l’arrête.',
    'pré-écoute':'Écouter un morceau au casque, sans que la salle l’entende.',
    'bibliothèque':'La liste de tes morceaux, en bas de l’écran. Bouton A ou B pour charger sur une platine.',
    'gain':'Le volume d’entrée d’une voie. Il égalise les morceaux enregistrés plus ou moins fort.',
    'vu-mètre':'La colonne de voyants qui montre le niveau. Vert : bien. Orange : fort. Rouge : ça sature.',
    'saturation':'Quand le son dépasse le maximum : il craque et se déforme. On l’évite toujours.',
    'casque':'Ton oreille secrète. Tu y prépares le morceau suivant pendant que la salle écoute l’autre.',
    'split':'Casque sur une seule carte son : la pré-écoute à gauche, le master à droite.',
    'temps':'Un coup de grosse caisse. On compte 1, 2, 3, 4.',
    'grosse caisse':'Le « boum » grave qui marque chaque temps. On dit aussi kick.',
    'mesure':'Un groupe de 4 temps : 1-2-3-4.',
    'phrase':'Un bloc de 8 mesures, soit 32 temps. Les morceaux changent souvent au début d’une phrase.',
    'bpm':'Battements par minute : la vitesse du morceau. 124 BPM, c’est 124 temps par minute.',
    'intro':'Le début du morceau, souvent juste le rythme. Pratique pour faire entrer un morceau.',
    'couplet':'La partie principale, qui installe le groove.',
    'break':'Une pause : la grosse caisse s’arrête, la tension monte.',
    'montée':'La fin du break, qui fait monter l’envie avant le retour du rythme.',
    'drop':'Le retour du rythme et des basses après le break. Le moment fort.',
    'outro':'La fin du morceau, souvent juste le rythme. C’est là qu’on fait entrer le suivant.',
    'pitch':'Le curseur qui accélère ou ralentit une platine, donc change son BPM.',
    'sync':'Le bouton qui cale tout seul le tempo d’une platine sur l’autre.',
    'nudge':'Pousser ou retenir une platine un instant pour aligner les temps.',
    'caler':'Mettre deux morceaux au même tempo, temps contre temps.',
    'eq':'L’égaliseur : trois potards par voie. HI pour les aigus, MID pour les médiums, LOW pour les graves.',
    'kill':'Le petit bouton qui coupe complètement une bande de l’EQ.',
    'basses':'Les sons graves : grosse caisse et ligne de basse. Une seule piste à la fois.',
    'échange des basses':'On coupe les graves de l’ancien morceau pendant qu’on rend ceux du nouveau, sur le 1 d’une phrase.',
    'transition':'Le passage d’un morceau au suivant.',
    'crossfader':'Le curseur horizontal du bas : à gauche le côté A, à droite le côté B.',
    'filtre':'Un potard qui étouffe le son (à gauche) ou l’amincit (à droite). Au centre, il ne fait rien.',
    'écho':'Un effet qui répète le son en rythme. Il continue de résonner quand tu coupes la piste.',
    'coupe':'Transition franche : on passe d’un morceau à l’autre d’un coup, sur le 1.',
    'boucle':'Un passage qui se répète. Pratique pour gagner du temps quand l’outro est courte.',
    'tonalité':'La couleur musicale d’un morceau. Deux tonalités voisines sonnent bien ensemble.',
    'roue des tonalités':'Un cercle de 12 positions (1 à 12, A mineur, B majeur). On mixe avec la même case ou une case voisine.',
    'key lock':'Garde la tonalité quand tu changes le tempo. Sans lui, accélérer rend le morceau plus aigu.',
    'hot cue':'Un repère sur un pad. Un appui pour le poser, un appui pour y sauter.',
    'effet':'Un traitement du son : écho, reverb, flanger… calé sur le tempo.',
    'dosage':'La quantité d’effet mélangée au son.',
    'sampler':'Des sons courts (sirène, voix, percussions) à lancer par-dessus le mix.',
    'énergie':'L’intensité d’un morceau, de 1 (calme) à 10 (très fort). Un bon set fait monter l’énergie peu à peu.',
    'set':'Une suite de morceaux mixés sans interruption.',
    'tracklist':'La liste des morceaux joués dans un set, dans l’ordre.',
    'playlist':'Une liste de morceaux préparée à l’avance dans la bibliothèque.',
    'slip':'Mode Slip : pendant une boucle, un scratch ou un hot cue maintenu, le morceau continue d’avancer en silence. Quand tu relâches, il reprend là où il en serait.',
    'reverse':'Lecture à l’envers (REV). Un appui pour inverser, un autre pour revenir.',
    'censor':'Maintiens CENSOR : le morceau joue à l’envers, puis reprend exactement là où il en serait. Sert à masquer un mot ou à faire un effet.',
    '1 ici':'Corrige la grille : la position actuelle devient le premier temps d’une phrase. Utile si la grille de BPM est décalée.',
    'quantize':'Quantize : les cues, hot cues et boucles se calent tout seuls sur le temps le plus proche. Laisse-le allumé.',
    'platine maître':'Bouton MASTER d’une platine : c’est elle qui donne le tempo. Les platines en Sync la suivent.',
    'tap':'Tape 4 fois ou plus en rythme : Mixlab en déduit le BPM du morceau.',
    'reloop':'Relance la dernière boucle, ou en sort.',
    'gain auto':'Gain auto : Mixlab règle le gain de chaque morceau au chargement, pour qu’ils aient tous le même volume.',
    'grille':'Les traits des temps posés sur la waveform. Si elle est décalée, Sync et Quantize se trompent.',
  };
  // Les mots qui intimident sur les boutons : survole-les, la définition apparaît.
  const JARGON=[['[data-ctl$=".slip"]','slip'],['[data-ctl$=".rev"]','reverse'],['[data-ctl$=".censor"]','censor'],['.dk-grid>button:last-child','1 ici'],['#q-btn','quantize'],
    ['[data-ctl$=".keylock"]','key lock'],['[data-ctl$=".sync"]','sync'],['[data-ctl$=".master"]','platine maître'],['[data-ctl$=".tap"]','tap'],['[data-ctl$=".reloop"]','reloop'],
    ['#ag-btn','gain auto'],['[data-ctl="split"]','split'],['.dk-grid>.lbl','grille'],['[data-ctl$=".cuech"]','pré-écoute'],['[data-ctl$=".fxon"]','effet']];
  function annotate(){
    for(const[sel,k]of JARGON)$$(sel).forEach(e=>{if(e.dataset.gloss)return;e.dataset.gloss=k;e.setAttribute('aria-description',GLOSS[k]);e.removeAttribute('title');
      let tm=0;e.addEventListener('mouseenter',()=>{clearTimeout(tm);tm=setTimeout(()=>{if(!document.body.classList.contains('learn'))gloss(k,e);},450);});
      e.addEventListener('mouseleave',()=>{clearTimeout(tm);if(P.el.pop&&P.el.pop.dataset.k===k)closeGloss();});});
  }
  function rich(s){
    const out=[];let i=0;const re=/\{([^}|]+)(?:\|([^}]+))?\}/g;let m;
    while((m=re.exec(s))){out.push(s.slice(i,m.index));const k=(m[2]||m[1]).toLowerCase();out.push(GLOSS[k]?h('button',{class:'pc-gl',type:'button','data-g':k,onclick:e=>{e.stopPropagation();gloss(k,e.currentTarget);}},m[1]):m[1]);i=re.lastIndex;}
    out.push(s.slice(i));return out;
  }
  function gloss(k,at){
    let p=P.el.pop;if(!p){p=P.el.pop=h('div',{class:'pc-pop',role:'tooltip',hidden:true});document.body.append(p);}
    p.innerHTML='';p.dataset.k=k;p.append(h('b',{},k[0].toUpperCase()+k.slice(1)),h('span',{},GLOSS[k]));p.hidden=false;
    const r=at.getBoundingClientRect(),w=Math.min(280,innerWidth-16);p.style.width=w+'px';
    p.style.left=clamp(r.left+r.width/2-w/2,8,innerWidth-w-8)+'px';
    const ph=p.offsetHeight;p.style.top=(r.bottom+8+ph>innerHeight?r.top-ph-8:r.bottom+8)+'px';
  }
  const closeGloss=()=>{if(P.el.pop)P.el.pop.hidden=true;};
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.pc-pop,.pc-gl'))closeGloss();},true);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){closeGloss();if(P.el.wel)welcome('pro');}
    if(!prog.active||e.target.closest('input,textarea,select')||e.metaKey||e.ctrlKey||e.altKey||e.repeat)return;
    if(e.key.toLowerCase()==='t'){const s=P.steps[prog.step];if(s&&s.w==='tap'){tap();e.preventDefault();}}
    if(e.key.toLowerCase()==='m'){const s=P.steps[prog.step];if(s&&s.w==='mark'){mark();e.preventDefault();}}
  });

  /* ---------- l'interface qui grandit ----------
     [chapitre qui débloque (index), sélecteurs, 'hide' pour masquer au lieu de griser] */
  const LOCKS=[
    [1,'#p-lib,[data-ctl="A.cue"],[data-ctl="B.cue"]'],
    [2,'[data-ctl$=".trim"],.fdr .vu,.mvu'],
    [3,'#p-deckB,#ch-B,.ch .cueb,[data-ctl="cuemix"],[data-ctl="cuevol"],[data-ctl="split"]'],
    [4,'#p-wave'],[4,'#coach-live','hide'],
    [6,'.dk-pitch,[data-ctl$=".sync"],[data-ctl$=".master"],.dk-stat:last-child,.mclock'],
    [7,'.ch .eq'],
    [8,'.xf,.xfa'],[8,'#coach-direct','hide'],
    [9,'.dk-loop,[data-ctl$=".filter"]'],
    [10,'.dk-stat.k,.dk-ctr .r:nth-child(2)'],
    [11,'.dk-pads,.dk-ctr .r:nth-child(3),.dk-grid,[data-ctl="samplervol"]'],
    [13,'#rec-btn,#presets,#ndecks,details.menu,#q-btn,#ag-btn'],
  ];
  const PANELS_AT={fx:9};
  function applyLocks(){
    const c=prog.free?99:prog.ch;
    for(const[at,sel,mode]of LOCKS)$$(sel).forEach(e=>{
      const lock=c<at,cls=mode==='hide'?'pc-hide':e.classList.contains('pnl')?'pc-lockp':'pc-lock';
      e.classList.toggle(cls,lock);e.inert=lock;
      if(cls==='pc-lockp'){if(lock)e.dataset.pcLock='Débloqué au chapitre '+(at+1);else delete e.dataset.pcLock;}
    });
    const vis=new Set(['mixer','wave','lib']);for(const[k,at]of Object.entries(PANELS_AT))if(c>=at)vis.add(k);
    if(c>=99)['fx','wave','lib'].forEach(k=>vis.add(k));
    layout.visible=vis;layout.preset='ecole';layout.coach=true;S.numDecks=2;applyLayout();
  }
  function clearLocks(){$$('.pc-lock,.pc-lockp,.pc-hide').forEach(e=>{e.classList.remove('pc-lock','pc-lockp','pc-hide');e.inert=false;delete e.dataset.pcLock;});}
  const blind=on=>document.body.classList.toggle('pc-blind',!!on);

  /* ---------- outils pour les chapitres ---------- */
  function fresh(a,b,o={}){
    resetMixer();S.numDecks=2;
    A().load(a);B().load(b);if(o.aBeat!=null)A().seek(A().timeOfBeat(o.aBeat));
    B().track.cue=B().timeOfBeat(o.bBeat||0);B().seek(B().track.cue);if(o.bFader!=null)B().ui.fader.set(o.bFader);
  }
  const lesson=id=>Coach.LESSONS.find(l=>l.id===id);
  // Reprend les étapes d'une leçon existante (learn.js) : mêmes vérifications, même texte.
  function wrap(id){const les=lesson(id),grp=()=>{les.setup();applyLocks();};return les.steps.map(s=>({...s,grp,target:s.target||null,src:les.title}));}
  const seg=(grp,steps)=>steps.map(s=>({grp,...s}));

  /* ---------- les 14 chapitres ---------- */
  const CH=[
    {title:'Bienvenue',sub:'À quoi sert un DJ. La platine, le mixer.',badge:'Premier son',mins:5,
     steps:()=>seg(()=>fresh(demo('Néons',0),demo('Quai 9',1),{bFader:0}),[
      {t:'Un DJ enchaîne des morceaux sans silence',why:'Ton travail : passer d’un morceau à l’autre sans que la piste de danse s’arrête. Pour ça, tu as deux outils : des {platines} et un {mixer}.',next:true},
      {t:'Voici la platine A',why:'Une {platine} lit un morceau. Le disque tourne pendant la lecture. En haut : le titre et le temps restant. Au centre : les boutons de lecture.',next:true,target:'#p-deckA'},
      {t:'Voici le mixer',why:'Le {mixer} mélange les platines. Chaque platine a sa voie, avec son {fader} de volume. Le MASTER règle le volume de la salle.',next:true,target:'#p-mixer'},
      {t:'Lance la musique : appuie sur ▶ de la platine A',why:'Le bouton ▶ lance et arrête la lecture. Tu peux aussi utiliser la touche Q du clavier.',check:()=>A().playing,target:'A.play'},
      {t:'Baisse le fader de A tout en bas',why:'Le {fader} règle ce que le public entend de cette platine. En bas, la platine joue toujours, mais la salle ne l’entend plus.',check:()=>A().p.fader<.05,target:'A.fader'},
      {t:'Remonte le fader de A tout en haut',why:'Voilà : le son revient. Le fader, c’est le geste que tu feras le plus souvent.',check:()=>A().p.fader>.8,target:'A.fader'},
      {t:'Tourne le potard MASTER',why:'Le {master} règle le volume final, celui des enceintes. Garde-le vers 80 % : tu auras de la marge.',enter:st=>{st.m0=S.masterVol;},check:st=>Math.abs(S.masterVol-st.m0)>.05,target:'master'},
     ])},
    {title:'Lire un morceau',sub:'Play, pause, cue. Charger un morceau.',badge:'Aux commandes',mins:6,
     steps:()=>seg(()=>{if(!A().track)A().load(demo('Néons',0));},[
      {t:'Mets la platine A en pause',why:'Le même bouton ▶ met en pause. La platine garde sa place dans le morceau.',check:st=>{if(A().playing)st.seen=true;return st.seen&&!A().playing;},target:'A.play',hint:()=>A().playing?'':'Lance d’abord A avec ▶.'},
      {t:'Relance la lecture',why:'La lecture reprend exactement là où elle s’était arrêtée.',check:()=>A().playing,target:'A.play'},
      {t:'Appuie sur CUE pendant la lecture',why:'Le {cue} est ton point de départ. En lecture, CUE ramène la platine à ce point et l’arrête. Pratique pour recommencer proprement.',check:()=>!A().playing&&A().track&&near(A().position(),A().track.cue,.05),target:'A.cue'},
      {t:'Pose un nouveau point de cue',why:'Clique dans la vue d’ensemble (la bande sous le titre) pour avancer dans le morceau. Puis, à l’arrêt, appuie sur CUE : c’est ton nouveau départ.',enter:st=>{st.c0=A().track&&A().track.cue;},check:st=>A().track&&!near(A().track.cue,st.c0,.05),target:'A.cue',
       hint:()=>A().playing?'Mets d’abord A en pause.':''},
      {t:'Maintiens CUE enfoncé pour écouter',why:'À l’arrêt sur le cue, maintenir CUE lance la lecture. Tu relâches : retour au cue. C’est une {pré-écoute} rapide.',check:()=>A().previewing,target:'A.cue',hold:.4},
      {t:'Charge « Quai 9 » sur la platine A',why:'Dans la {bibliothèque}, en bas, clique sur le bouton A au bout de la ligne « Quai 9 ». Tu peux aussi glisser la ligne sur la platine.',enter:st=>{st.t0=A().track;},
       check:st=>A().track&&A().track!==st.t0,target:'#p-lib',hint:()=>A().playing&&audible(A())?'A joue à l’antenne : mets-la en pause avant de charger.':''},
      {t:'Lance ce nouveau morceau',why:'Chaque morceau a sa vitesse et son ambiance. Écoute la différence.',check:()=>A().playing,target:'A.play'},
     ])},
    {title:'Le volume',sub:'Fader, gain, VU-mètres. Rester hors du rouge.',badge:'Oreille propre',mins:6,
     steps:()=>seg(()=>{if(!A().track)A().load(demo('Néons',0));},[
      {t:'Regarde le VU-mètre de A',why:'Le {vu-mètre} est la colonne à côté du fader. Vert : tout va bien. Orange : c’est fort. Rouge : ça {sature|saturation}.',next:true,target:'#ch-A .fdr'},
      {t:'Lance A et monte son GAIN jusqu’au rouge',why:'Le {gain} règle le volume d’entrée. Certains morceaux sont enregistrés plus fort que d’autres : le gain les remet au même niveau.',check:()=>A().playing&&A().p.trim>=.85,target:'A.trim'},
      {t:'Redescends le GAIN : le haut doit rester dans l’orange',why:'Dans le rouge, le son craque et fatigue les oreilles. Les DJ règlent le gain pour toucher l’orange sur les passages forts, jamais le rouge.',check:()=>A().p.trim>=.3&&A().p.trim<=.62,target:'A.trim',hold:1},
      {t:'Le master a aussi son VU-mètre',why:'Les deux colonnes au centre montrent ce qui part vers la salle. Même règle : hors du rouge.',next:true,target:'#p-mixer .mvu'},
      {t:'Fader de A en haut, master hors du rouge pendant 2 secondes',why:'Voilà le bon réglage de départ : fader en haut, gain réglé, master vers 80 %.',check:()=>A().playing&&A().p.fader>.8&&(!window.MixCoach||MixCoach.state.master.pk<.99),target:'A.fader',hold:2},
     ])},
    {title:'Le casque',sub:'Pré-écouter sans que la salle entende.',badge:'Oreille secrète',mins:6,
     steps:()=>seg(()=>{if(!A().track)A().load(demo('Néons',0));if(!B().track||B().track===A().track)B().load(LIB.tracks.find(t=>t!==A().track));if(B().playing)B().pause();},[
      {t:'La salle n’entend que le master',why:'Avec le {casque}, tu écoutes la platine B en secret, pendant que A joue pour tout le monde. C’est ce qui permet de préparer la suite.',next:true,target:'#p-deckB'},
      {t:'Baisse le fader de B tout en bas',why:'Fader en bas : la salle n’entendra pas B, même s’il joue.',check:()=>B().p.fader<.05,target:'B.fader'},
      {t:'Active le bouton CUE casque de B',why:'Ce bouton envoie B dans ton casque, quelle que soit la position de son fader.',check:()=>B().cueOn,target:'B.cuech'},
      {t:'Lance B : seul ton casque l’entend',why:'B joue, mais son fader est en bas : la salle n’entend que A. Toi, tu entends B dans le casque.',check:()=>B().playing&&B().p.fader<.05,target:'B.play'},
      {t:'Tourne MIX du casque vers la droite',why:'MIX règle ce que tu entends au casque. À gauche : seulement la pré-écoute. À droite : seulement le master.',check:()=>S.cueMix>.7,target:'cuemix'},
      {t:'Ramène MIX vers la gauche',why:'Au milieu, tu entends les deux. Beaucoup de DJ gardent une oreille sur le casque et l’autre dans la salle.',check:()=>S.cueMix<.3,target:'cuemix'},
      {t:'Une seule carte son ? Le bouton Split',why:'Avec un câble répartiteur, {split} met la pré-écoute à gauche et le master à droite. Le bouton Audio, en haut, permet aussi de choisir une deuxième carte son.',next:true,target:'split'},
      {t:'Coupe le CUE de B et arrête B',why:'On range : B prêt pour plus tard.',check:()=>!B().cueOn&&!B().playing,target:()=>B().cueOn?'B.cuech':'B.play'},
     ])},
    {title:'Le rythme',sub:'Temps, mesures, phrases. Compter 1-2-3-4.',badge:'Métronome',mins:8,
     steps:()=>seg(()=>{const t=demo('Néons',0);if(A().track!==t){if(A().playing)A().pause();A().load(t);}A().ui.fader.set(.9);},[
      {t:'Un temps = un coup de grosse caisse',why:'Écoute le « boum » grave : c’est la {grosse caisse}. Chaque coup est un {temps}. Les traits de la waveform, en haut, montrent les temps.',next:true,target:'#p-wave'},
      {t:'Lance A et compte 1-2-3-4 sur la grosse caisse',why:'4 temps font une {mesure}. Compte à voix haute : 1, 2, 3, 4, 1, 2, 3, 4…',check:st=>{if(!A().playing)return false;if(st.b0==null)st.b0=A().beatPos();return A().beatPos()-st.b0>=8;},target:'A.play',hint:()=>A().playing?posTxt(A()):''},
      {t:'8 mesures font une phrase',why:'Une {phrase} dure 8 mesures, soit 32 temps. Le compteur du coach montre la mesure en cours (les 8 cases) et le temps (les 4 points).',next:true,target:'#coach-live'},
      {t:'Attends le début d’une nouvelle phrase',why:'Les morceaux changent presque toujours au début d’une phrase : un instrument arrive, un autre s’en va. Regarde les cases se remplir.',
       check:st=>{const bi=A().barInfo();if(!A().playing||!bi||bi.pre)return false;if(bi.barIn===7)st.seen=true;return st.seen&&bi.barIn===0;},hint:()=>A().playing?posTxt(A()):'Relance A.',target:'#coach-live'},
      {t:'À l’oreille : tape chaque grosse caisse',why:'Les waveforms et le BPM sont cachés. Écoute, et tape sur le bouton (ou la touche T) à chaque « boum ». 8 coups suffisent.',w:'tap',
       enter:st=>{st.taps=[];blind(true);},check:st=>st.taps.length>=8,hint:()=>A().playing?'':'Lance A d’abord.',target:()=>A().playing?'#pc-tap':'A.play'},
      {t:'Le résultat',why:'Les waveforms reviennent. Voici ce que ton oreille a trouvé.',w:'res',res:'tap',next:true,enter:()=>blind(false)},
     ])},
    {title:'La structure d’un morceau',sub:'Intro, couplet, break, drop, outro.',badge:'Radar',mins:8,
     steps:()=>seg(()=>{const t=demo('Halogène',2);if(A().playing)A().pause();A().load(t);A().ui.fader.set(.9);},[
      {t:'Un morceau se lit en blocs',why:'{Intro}, {couplet}, {break}, {montée}, {drop}, {outro}. Chaque bloc dure une ou plusieurs phrases. Dans la vue d’ensemble, on voit la forme : le break est le creux.',next:true,target:'#p-deckA .dk-ov'},
      {t:'À l’oreille : clique « Break ! » quand la grosse caisse s’arrête',why:'Waveforms cachées. La platine part juste avant le {break} de « Halogène ». Lance A et écoute la {grosse caisse}.',w:'mark',mark:'Break !',
       enter:st=>{blind(true);if(A().playing)A().pause();A().seek(A().timeOfBeat(104));},check:st=>st.mark!=null,target:()=>A().playing?'#pc-mark':'A.play',hint:()=>A().playing?'':'Lance A.'},
      {t:'Clique « Drop ! » quand tout revient',why:'Après le break, le rythme et les {basses} reviennent d’un coup : c’est le {drop}.',w:'mark',mark:'Drop !',check:st=>st.mark!=null,target:'#pc-mark',hint:()=>A().playing?'':'Relance A.'},
      {t:'Le résultat',why:'Les waveforms reviennent : regarde le creux du break dans la vue d’ensemble.',w:'res',res:'mark',next:true,enter:()=>blind(false)},
      {t:'Va dans l’outro : clique dans le dernier huitième de la vue d’ensemble',why:'L’{outro} est faite pour mixer : surtout du rythme, peu de mélodie. C’est là que tu feras entrer le morceau suivant.',check:()=>A().track&&A().position()>=A().timeOfBeat(224)-.2,target:'#p-deckA .dk-ov'},
      {t:'Où mixer ?',why:'Règle simple : le morceau suivant entre sur le 1 d’une phrase, pendant l’outro du morceau qui joue. Les deux blocs rythmiques se superposent sans se gêner.',next:true},
     ])},
    {title:'Le tempo',sub:'BPM, pitch, Sync, puis caler à l’oreille.',badge:'Calé',mins:10,
     steps:()=>[...seg(()=>fresh(demo('Néons',0),demo('Quai 9',1),{aBeat:64,bBeat:64,bFader:0}),[
      {t:'Le BPM, c’est la vitesse',why:'{BPM} : battements par minute. « Néons » est à 124, « Quai 9 » à 127. Pour mixer deux morceaux, il faut le même BPM.',next:true,target:'#p-deckA .dk-stat:last-child'},
      {t:'Bouge le pitch de A et regarde le BPM changer',why:'Le {pitch} accélère ou ralentit la platine. Vers le bas : plus rapide.',check:()=>Math.abs(A().pitch)>.01,target:'A.pitch'},
      {t:'Remets le pitch de A à 0 (double-clic sur le curseur)',why:'Retour à la vitesse d’origine : 124 BPM.',check:()=>Math.abs(A().pitch)<.001,target:'A.pitch'},
      {t:'Lance A, puis appuie sur SYNC de B',why:'{Sync} cale B sur le tempo de A tout seul. Pratique, mais on apprend aussi à s’en passer : sur certaines tables, il n’y en a pas.',check:()=>A().playing&&B().sync,target:()=>A().playing?'B.sync':'A.play'},
      {t:'Regarde : B affiche maintenant le même BPM que A',why:'B est passé de 127 à 124. Désactive SYNC : on va le faire à la main.',check:()=>!B().sync,target:'B.sync'},
     ]),...wrap('tempo')]},
    {title:'L’EQ',sub:'Couper les basses. L’échange des basses.',badge:'Échange réussi',mins:10,
     steps:()=>[...seg(()=>{if(!A().track)A().load(demo('Néons',0));B().ui.fader.set(0);},[
      {t:'Trois potards : HI, MID, LOW',why:'L’{EQ} sépare le son en trois. HI : charleys et cymbales. MID : voix et mélodies. LOW : grosse caisse et basse.',next:true,target:'#ch-A'},
      {t:'Lance A et coupe ses basses : LOW tout à gauche',why:'Écoute : la grosse caisse et la basse disparaissent. Le morceau devient léger.',check:()=>A().playing&&A().p.low<.1,target:'A.low'},
      {t:'Remets LOW au centre',why:'Au centre, l’EQ ne change rien. Double-clic sur un potard pour le recentrer.',check:()=>Math.abs(A().p.low-.5)<.05,target:'A.low'},
      {t:'Appuie sur le petit carré à côté de LOW',why:'C’est le {kill} : il coupe la bande d’un coup, sans tourner le potard.',check:()=>A().p.kill.low,target:'A.killlow'},
      {t:'Rallume-le',why:'Un appui coupe, un appui rallume. Pratique pour un effet sur le 1 d’une phrase.',check:()=>!A().p.kill.low,target:'A.killlow'},
     ]),...wrap('swap')]},
    {title:'Première transition complète',sub:'De A vers B, notée par le coach.',badge:'Première transition',mins:10,coach:'all',
     steps:()=>seg(()=>{fresh(demo('Néons',0),demo('Quai 9',1),{aBeat:160,bFader:0});P.mark=window.MixCoach?MixCoach.state.hist[0]:null;},[
      {t:'Le crossfader : tout à gauche',why:'Le {crossfader} mélange A (à gauche) et B (à droite) en un seul geste. Tout à gauche : seul A passe.',check:()=>S.xf<.08,target:'xf'},
      {t:'Ramène-le au centre',why:'Au centre, les deux passent : ce sont les faders de voie qui décident. On travaille comme ça dans ce parcours.',check:()=>Math.abs(S.xf-.5)<.06,target:'xf'},
      {t:'Lance A',why:'A est à 2 phrases de son outro. À partir de maintenant, le coach t’écoute et notera ta {transition}.',check:()=>A().playing,target:'A.play'},
      {t:'Prépare B : SYNC et basses coupées',why:'Tout ce que tu as appris : même tempo, et B entrera sans ses graves.',check:()=>(B().sync||Math.abs(B().bpm-A().bpm)<.05)&&!bassOn(B()),target:()=>B().sync?'B.low':'B.sync'},
      {t:'Lance B sur le 1 d’une phrase de A',why:'Regarde le compteur de phrase de A. Appuie sur ▶ de B pendant le dernier temps de la mesure 8.',check:()=>B().playing,target:'B.play',hint:()=>A().playing?'A : '+posTxt(A()):''},
      {t:'Monte le fader de B, doucement',why:'Sur 4 à 8 mesures. Les aigus de B se glissent sous A.',check:()=>B().p.fader>=.8,target:'B.fader'},
      {t:'Échange les basses sur le 1 d’une phrase',why:'LOW de A à gauche, LOW de B au centre, en même temps. Une seule basse à la fois.',check:()=>!bassOn(A())&&bassOn(B()),target:()=>bassOn(A())?'A.low':'B.low',hint:()=>A().playing?'A : '+posTxt(A()):''},
      {t:'Sors A : baisse son fader',why:'B porte le morceau. A sort en douceur.',check:()=>A().p.fader<=.05||!A().playing,target:'A.fader'},
      {t:'Lis le bilan du coach',why:'Quelques secondes après la fin de la transition, le coach te donne une note sur 100 et ses conseils.',w:'score',check:()=>!!(window.MixCoach&&MixCoach.state.hist[0]&&MixCoach.state.hist[0]!==P.mark),target:'#coach-direct',
       hint:()=>window.MixCoach&&MixCoach.state.hist[0]!==P.mark?'':'Le bilan arrive quand une seule piste joue depuis 2 secondes.'},
     ])},
    {title:'Les transitions de base',sub:'Au filtre, en écho, en coupe, en boucle.',badge:'Boîte à outils',mins:15,coach:'all',
     steps:()=>[...seg(()=>{fresh(demo('Néons',0),demo('Quai 9',1),{aBeat:160,bFader:.85});},[
      {t:'Lance A',why:'On va essayer quatre façons de passer d’un morceau à l’autre. D’abord, le filtre.',check:()=>A().playing,target:'A.play'},
      {t:'Le filtre : tourne celui de A vers la gauche',why:'À gauche, le {filtre} étouffe le son, comme derrière une porte. Au centre, il ne fait rien.',check:()=>A().p.filter<.2,target:'A.filter',hint:()=>A().playing?'':'Lance A pour entendre.'},
      {t:'Puis vers la droite',why:'À droite, il retire les graves : le son s’amincit.',check:()=>A().p.filter>.8,target:'A.filter'},
      {t:'Transition au filtre : ferme le filtre de B à gauche',why:'B va entrer étouffé, puis s’ouvrir. Remets d’abord le filtre de A au centre.',check:()=>B().p.filter<.2&&Math.abs(A().p.filter-.5)<.06,target:()=>Math.abs(A().p.filter-.5)<.06?'B.filter':'A.filter'},
      {t:'SYNC sur B, puis lance-le sur le 1 d’une phrase',why:'Fader en haut mais filtre fermé : B arrive comme un son lointain.',check:()=>B().playing&&(B().sync||Math.abs(B().bpm-A().bpm)<.05),target:()=>B().sync?'B.play':'B.sync',hint:()=>A().playing?'A : '+posTxt(A()):'Lance A.'},
      {t:'Ouvre B (centre) et amincis A (à droite)',why:'Les deux potards en même temps, sur 8 mesures. B prend la place pendant que A s’efface.',check:()=>Math.abs(B().p.filter-.5)<.06&&A().p.filter>.8,target:()=>Math.abs(B().p.filter-.5)<.06?'A.filter':'B.filter'},
      {t:'Sors A, puis remets son filtre au centre',why:'Un filtre est un passage : on le recentre toujours une fois la transition finie.',check:()=>(A().p.fader<.05||!A().playing)&&Math.abs(A().p.filter-.5)<.06,target:()=>A().p.fader<.05||!A().playing?'A.filter':'A.fader'},
     ]),...wrap('echo'),
     ...seg(null,[
      {t:'Coupe l’effet de A',why:'L’{écho} s’est éteint. On coupe l’effet avant de recharger la platine.',check:()=>!A().fx.on,target:'A.fxon'},
      {t:'La coupe : choisis la courbe « Cut » du crossfader',why:'Une {coupe} passe d’un morceau à l’autre d’un coup. La courbe Cut rend le crossfader très franc.',check:()=>S.curve==='cut',target:'#p-mixer .xf select'},
      {t:'Crossfader tout à droite : seul B passe',why:'A est du côté gauche du crossfader. Tout à droite, il est coupé.',check:()=>S.xf>.95,target:'xf'},
      {t:'Relance A et monte son fader',why:'A joue, mais le crossfader le coupe. Il attend son tour.',check:()=>A().playing&&A().p.fader>.8,target:()=>A().playing?'A.fader':'A.play'},
      {t:'Sur le 1 d’une phrase de B, bascule le crossfader d’un coup vers A',why:'Un geste sec, pile sur le 1. Le public entend un changement net.',check:()=>S.xf<.05,target:'xf',hint:()=>B().playing?'B : '+posTxt(B()):''},
      {t:'La boucle : appuie sur LOOP de A',why:'Une {boucle} de 4 temps répète le même passage. Elle te donne du temps quand l’outro est trop courte.',check:()=>A().loop.on,target:'A.loop'},
      {t:'Sors de la boucle : appuie de nouveau sur LOOP',why:'Le morceau repart, toujours dans le temps.',check:()=>!A().loop.on,target:'A.loop'},
      {t:'Remets le crossfader au centre et la courbe « Mix »',why:'On revient aux réglages de base.',check:()=>S.curve==='mix'&&Math.abs(S.xf-.5)<.06,target:()=>S.curve==='mix'?'xf':'#p-mixer .xf select'},
     ])]},
    {title:'L’harmonie',sub:'Tonalités compatibles et roue des tonalités.',badge:'Bonne note',mins:8,
     steps:()=>seg(()=>{resetMixer();A().load(demo('Halogène',2));B().ui.fader.set(0);lib.compat=false;const cb=$('#p-lib .libbar .tb');cb&&cb.setAttribute('aria-pressed','false');renderTable();},[
      {t:'Chaque morceau a une tonalité',why:'La {tonalité} est la couleur musicale du morceau. Deux tonalités qui ne vont pas ensemble « frottent » : ça sonne faux.',next:true,target:'#p-deckA .dk-stat.k'},
      {t:'La roue des tonalités',why:'Chaque tonalité a une case de la {roue des tonalités}. On mixe sans risque avec la même case, la case d’à côté, ou la case de l’autre anneau.',w:'wheel',next:true},
      {t:'Lance A et active le Key lock',why:'Le {key lock} garde la tonalité quand tu changes le tempo.',check:()=>A().playing&&A().keyLock,target:()=>A().playing?'A.keylock':'A.play'},
      {t:'Monte le pitch de A d’au moins 4 % : la tonalité ne bouge pas',why:'Avec le key lock, le morceau accélère sans devenir plus aigu.',check:()=>A().keyLock&&Math.abs(A().pitch)>.035,target:'A.pitch'},
      {t:'Désactive le Key lock : écoute la différence',why:'Sans key lock, accélérer rend le morceau plus aigu, comme un disque. La tonalité affichée change.',check:()=>!A().keyLock,target:'A.keylock'},
      {t:'Remets le pitch de A à 0',why:'Double-clic sur le curseur de pitch.',check:()=>Math.abs(A().pitch)<.001,target:'A.pitch'},
      {t:'Dans la bibliothèque, active « Compatibles »',why:'Mixlab ne montre plus que les morceaux qui vont bien avec la platine maître : tonalité et tempo.',check:()=>lib.compat,target:'#p-lib .libbar .tb'},
      {t:'Charge sur B un morceau compatible avec A',why:'Bouton B au bout d’une ligne. La tonalité de B s’affiche avec un point vert quand elle est compatible.',check:()=>B().track&&B().track!==A().track&&keysCompatible(A().keyNow(),B().keyNow()),target:'#p-lib',hint:()=>B().track&&B().track!==A().track&&!keysCompatible(A().keyNow(),B().keyNow())?'Ce morceau n’est pas compatible : essaie un autre.':''},
      {t:'Désactive « Compatibles »',why:'Pour revoir toute ta bibliothèque.',check:()=>!lib.compat,target:'#p-lib .libbar .tb'},
     ])},
    {title:'Les outils de scène',sub:'Hot cues, boucles, effets et sampler.',badge:'Performeur',mins:10,
     steps:()=>seg(()=>{if(!A().track)A().load(demo('Néons',0));A().padMode='hot';renderPads(A());},[
      {t:'Lance A et pose un hot cue : appuie sur un pad vide',why:'Un {hot cue} est un repère sur un pad. Le pad s’allume de sa couleur.',enter:st=>{st.h0=A().track?A().track.hot.slice():[];},check:st=>A().playing&&A().track&&A().track.hot.some((x,i)=>x!=null&&st.h0[i]==null),target:()=>A().playing?'A.pad1':'A.play'},
      {t:'Laisse jouer, puis appuie de nouveau sur ce pad',why:'La platine saute au repère, dans le temps. Les DJ s’en servent pour relancer un passage fort.',
       check:st=>{const tr=A().track;if(!tr||!A().playing)return false;const hs=tr.hot.filter(x=>x!=null),p=A().position();if(hs.some(x=>p>x+1.5))st.away=true;return st.away&&hs.some(x=>p>=x-.05&&p<x+.4);},target:'A.pad1'},
      {t:'Boucle de 4 temps : appuie sur LOOP',why:'Le passage se répète en rythme.',check:()=>A().loop.on,target:'A.loop'},
      {t:'Divise la boucle deux fois (÷2)',why:'4, puis 2, puis 1 temps : la tension monte. Un classique avant un drop.',check:()=>A().loop.on&&A().loop.beats<=1,target:'A.loophalf'},
      {t:'Sors de la boucle',why:'Appuie sur LOOP ou RELOOP.',check:()=>!A().loop.on,target:'A.loop'},
      {t:'Effet : choisis « Écho » sur l’unité FX de A et active-le',why:'Un {effet} marque un moment. Il est calé sur le tempo.',check:()=>A().fx.on&&A().fx.type==='echo',target:()=>A().fx.type==='echo'?'A.fxon':'#fxu-'+A().fx.n+' select'},
      {t:'Règle le dosage vers 50 %',why:'Le {dosage} mélange l’effet au son. Trop fort, il noie le morceau.',check:()=>A().fx.amount>=.35&&A().fx.amount<=.65,target:'A.fxamt'},
      {t:'Durée : 1/2 temps',why:'Les flèches ‹ › changent la durée de l’écho, en temps.',check:()=>A().fx.beats===.5,target:()=>'#fxu-'+A().fx.n+' .bt'},
      {t:'Coupe l’effet',why:'Un effet laissé en continu fatigue l’oreille.',check:()=>!A().fx.on,target:'A.fxon'},
      {t:'Le sampler : onglet Sampler, puis un pad',why:'Le {sampler} lance des sons courts par-dessus le mix.',check:()=>SAMPLER.playing.some(Boolean),target:()=>A().padMode==='smp'?'A.pad1':'#p-deckA .tabs [data-m="smp"]'},
      {t:'Reviens à l’onglet Hot cue',why:'Les pads reprennent leur rôle de repères.',check:()=>A().padMode==='hot',target:'#p-deckA .tabs [data-m="hot"]'},
     ])},
    {title:'Préparer un set',sub:'Choisir, ordonner par énergie, poser des cues.',badge:'Programmateur',mins:10,
     steps:()=>seg(()=>{resetMixer();},[
      {t:'Choisis les morceaux de ton set',why:'Un {set} raconte une histoire. Choisis jusqu’à 5 morceaux avec le bouton + .',w:'set',check:()=>setIds().length>=need(),hint:()=>`${setIds().length}/${need()} morceaux.`},
      {t:'Range-les par énergie, du plus calme au plus fort',why:'L’{énergie} va de 1 à 10. Commence calme, monte peu à peu. Utilise ↑ ↓, puis « C’est mon ordre ».',w:'set',order:true,check:st=>!!st.ok,hint:()=>energyTip()},
      {t:'Charge ton premier morceau sur A',why:'Bouton A dans la bibliothèque.',check:()=>A().track&&A().track.id===setIds()[0],target:'#p-lib'},
      {t:'Pose le hot cue 1 au début et le hot cue 2 sur l’outro',why:'Avec ces repères, tu sautes au bon endroit sans chercher, même dans le stress.',check:()=>A().track&&A().track.hot[0]!=null&&A().track.hot[1]!=null,target:()=>A().track&&A().track.hot[0]!=null?'A.pad2':'A.pad1'},
      {t:'Range ton set dans la playlist « Préparation »',why:'Il t’attend dans la bibliothèque, dans l’ordre. Une {playlist}, c’est ta feuille de route.',w:'set',save:true,check:()=>{const pl=LIB.playlists[0];return pl&&pl.ids.join()===setIds().join();}},
     ])},
    {title:'Ton premier set',sub:'Des morceaux, des transitions, enregistré et noté.',badge:'Premier set',mins:20,coach:'all',final:true,
     steps:()=>{const ids=setIds(),n=ids.length,tr=i=>trackOf(ids[i]);
      const s=[
        {t:`Ton set : ${n} morceaux, ${n-1} transitions`,why:'Tout ce que tu as appris, d’un seul trait. Le coach note chaque transition. À la fin, tu as un résumé à partager.',w:'setlist',next:true},
        {t:'Démarre l’enregistrement (REC, en haut)',why:'Tu pourras réécouter ton set. Le fichier arrive dans la bibliothèque, section Enregistrements.',check:()=>!!REC.mr,target:'#rec-btn',hint:()=>typeof MediaRecorder==='undefined'?'Ton navigateur n’enregistre pas : passe l’étape.':''},
        {t:`Lance « ${tr(0).title} » sur la platine A`,why:'Fader en haut, gain réglé. C’est parti.',grp:()=>{fresh(tr(0),tr(1),{bFader:0});startRun(ids);},
         check:()=>decks.some(d=>d.active&&d.playing&&audible(d)&&d.track&&d.track.id===ids[0]),target:()=>A().track&&A().track.id===ids[0]?'A.play':'#p-lib'},
      ];
      for(let k=1;k<n;k++)s.push({t:`Transition ${k}/${n-1} : fais entrer « ${tr(k).title} »`,why:'Charge, cale, lance sur le 1, échange les basses, sors l’ancien. Le coach te guide ligne par ligne.',k,
        check:()=>P.run&&P.run.trs.length>=k,hint:()=>guide(tr(k)).h,target:()=>guide(tr(k)).tg});
      s.push({t:'Arrête l’enregistrement',why:'Appuie de nouveau sur REC. Ton set est fini !',check:()=>!REC.mr,target:'#rec-btn'});
      return s;}},
  ];

  /* ---------- set : sélection et suivi ---------- */
  const need=()=>Math.min(5,LIB.tracks.length);
  const trackOf=id=>LIB.tracks.find(t=>t.id===id)||LIB.tracks[0];
  function setIds(){
    let ids=(prog.set||[]).filter(id=>LIB.tracks.some(t=>t.id===id));
    if(!ids.length&&CH[prog.ch]&&CH[prog.ch].final)ids=LIB.tracks.slice().sort((a,b)=>energy(a)-energy(b)).slice(0,5).map(t=>t.id);
    return ids;
  }
  function energyTip(){
    const e=setIds().map(id=>energy(trackOf(id)));if(e.length<2)return'';
    const drops=e.slice(1).filter((x,i)=>x<e[i]-1).length;
    return e[0]===Math.max(...e)&&e.length>2?'Tu commences par le plus fort : il ne restera plus rien pour monter.':drops?`L’énergie redescend ${drops} fois : c’est voulu ?`:'Belle montée d’énergie.';
  }
  function startRun(ids){
    P.lastH=window.MixCoach?MixCoach.state.hist[0]:null;
    if(P.resuming&&prog.run&&!prog.run.end&&(prog.run.ids||[]).join()===ids.join()){P.run=prog.run;return;}
    P.run={start:Date.now(),ids,trs:[],tracks:[]};prog.run=P.run;save();
  }
  function runTick(){
    const r=P.run;if(!r)return;
    const hh=window.MixCoach&&MixCoach.state.hist[0];
    if(hh&&hh!==P.lastH){P.lastH=hh;r.trs.push({from:hh.from,to:hh.to,title:hh.title,score:hh.score,bars:Math.round(hh.bars),good:hh.good.slice(),tips:hh.tips.slice()});save();render();}
    for(const d of decks)if(d.active&&d.track&&audible(d)&&!r.tracks.some(x=>x.id===d.track.id))r.tracks.push({id:d.track.id,title:d.track.title,artist:d.track.artist,bpm:+d.bpm.toFixed(1),at:(Date.now()-r.start)/1000});
  }
  // Le guide de transition du premier set : une seule consigne à la fois.
  function guide(next){
    const ab=[A(),B()],main=ab.filter(d=>d.playing&&audible(d)).sort((a,b)=>b.p.fader-a.p.fader)[0];
    if(!main)return{h:'Relance la musique : ▶ et fader en haut.',tg:ab.find(d=>d.track)?.id+'.play'};
    const o=main===A()?B():A(),m=main.id,rem=main.track.duration-main.position(),pre=rem<40?`${m} se termine dans ${Math.round(rem)} s. `:'';
    if(o.track!==next)return{h:pre+`Charge « ${next.title} » sur la platine ${o.id} (bouton ${o.id} dans la bibliothèque).`,tg:'#p-lib'};
    if(!o.playing&&!o.sync&&Math.abs(o.bpm-main.bpm)>.05)return{h:pre+`Appuie sur SYNC de ${o.id}.`,tg:o.id+'.sync'};
    if(!o.playing&&bassOn(o))return{h:pre+`Coupe les basses de ${o.id} (LOW à gauche).`,tg:o.id+'.low'};
    if(!o.playing)return{h:pre+`Lance ${o.id} sur le 1 d’une phrase de ${m} : ${posTxt(main)}.`,tg:o.id+'.play'};
    if(o.p.fader<.8)return{h:`Monte le fader de ${o.id} sur 4 à 8 mesures.`,tg:o.id+'.fader'};
    if(bassOn(main)&&!bassOn(o))return{h:`Échange les basses sur le 1 : LOW de ${m} à gauche, LOW de ${o.id} au centre. ${posTxt(main)}`,tg:m+'.low'};
    if(bassOn(main)&&bassOn(o))return{h:`Deux basses en même temps : coupe le LOW de ${m}.`,tg:m+'.low'};
    return{h:`Sors ${m} : baisse son fader. Le bilan arrive 2 secondes après.`,tg:m+'.fader'};
  }
  function summary(){
    const r=prog.run||{trs:[],tracks:[],ids:[]},trs=r.trs||[],avg=trs.length?Math.round(trs.reduce((s,t)=>s+t.score,0)/trs.length):null;
    const tl=(r.tracks&&r.tracks.length?r.tracks:(r.ids||[]).map(id=>{const t=trackOf(id);return{title:t.title,artist:t.artist,at:null};}));
    const dur=r.end&&r.start?(r.end-r.start)/1000:r.start?(Date.now()-r.start)/1000:0;
    const tips=[...new Set(trs.flatMap(t=>t.tips))].slice(0,3),good=[...new Set(trs.flatMap(t=>t.good))].slice(0,3);
    return{avg,trs,tl,dur,tips,good,best:trs.length?trs.reduce((a,b)=>b.score>a.score?b:a):null};
  }
  function summaryText(){
    const s=summary(),L=[];
    L.push('Mon premier set sur Mixlab');
    L.push(`${pl(s.tl.length,'morceau','morceaux')} · ${pl(s.trs.length,'transition')} · ${fmtMin(s.dur)}`+(s.avg!=null?` · note moyenne ${s.avg}/100`:''));
    L.push('','Tracklist');s.tl.forEach((t,i)=>L.push(`${i+1}. ${t.at!=null?fmtTime(t.at,false)+'  ':''}${t.artist?t.artist+' – ':''}${t.title}`));
    if(s.trs.length){L.push('','Transitions');s.trs.forEach((t,i)=>L.push(`${i+1}. ${t.from} → ${t.to} « ${t.title} » : ${t.score}/100 (${t.bars} mesures)`));}
    if(s.good.length){L.push('','Points forts');s.good.forEach(g=>L.push('+ '+g));}
    if(s.tips.length){L.push('','À travailler');s.tips.forEach(g=>L.push('- '+g));}
    L.push('','Mixé avec Mixlab, le logiciel DJ qui apprend à mixer.');
    return L.join('\n');
  }

  /* ---------- exercices à l'oreille ---------- */
  function tap(){
    const s=P.steps[prog.step];if(!s||s.w!=='tap'||!A().playing)return;
    P.st.taps.push({t:performance.now()/1000,b:A().beatPos()});
    const c=$('#pc-tapn');if(c)c.textContent=`${P.st.taps.length}/8`;
    const b=$('#pc-tap');if(b){b.classList.remove('hit');void b.offsetWidth;b.classList.add('hit');}
    if(P.st.taps.length>=8){
      const ts=P.st.taps,iv=ts.slice(1).map((x,i)=>x.t-ts[i].t).sort((a,b)=>a-b),med=iv[iv.length>>1],ub=60/med,tb=A().bpm;
      const ratio=tb/ub,mult=ratio>1.6?2:ratio<.7?.5:1,eb=ub*mult;
      const ms=ts.reduce((s,x)=>{const f=mult===2?x.b/2:x.b;return s+Math.abs(wrapHalf(f))*(mult===2?2:1)*60000/tb;},0)/ts.length;
      const score=Math.round(clamp(100-Math.abs(eb-tb)*6-Math.max(0,ms-30)*.6-(mult!==1?10:0),0,100));
      prog.ear.tap={bpm:+ub.toFixed(1),real:+tb.toFixed(1),ms:Math.round(ms),score,mult};if(score>=80)badge('Oreille d’or');save();
    }
  }
  function mark(){
    const s=P.steps[prog.step];if(!s||s.w!=='mark'||!A().playing)return;
    P.st.mark=A().beatPos();
    const k=s.mark==='Break !'?'brk':'drop',exp=k==='brk'?128:160;
    prog.ear.mark=Object.assign({},prog.ear.mark,{[k]:+(P.st.mark-exp).toFixed(1)});
    const m=prog.ear.mark;if(m.brk!=null&&m.drop!=null&&Math.abs(m.brk)<=2&&Math.abs(m.drop)<=2)badge('Radar à break');save();
  }
  function badge(n){if(!prog.badges.includes(n)){prog.badges.push(n);toast('Badge gagné : '+n,'ok');}}

  /* ---------- navigation ---------- */
  function loadChapter(c,step){
    prog.ch=clamp(c,0,CH.length-1);P.steps=CH[prog.ch].steps();prog.step=clamp(step||0,0,P.steps.length);P.view='step';
    applyLocks();blind(false);
    if(prog.step<P.steps.length)enterStep(true);else render();
    save();
  }
  function enterStep(resume){
    const i=prog.step,s=P.steps[i];P.st={};P.hold=0;
    P.resuming=!!resume;
    if(resume){for(let j=i;j>=0;j--)if(P.steps[j].grp){P.steps[j].grp();break;}}
    else if(s.grp&&(i===0||P.steps[i-1].grp!==s.grp))s.grp();
    P.resuming=false;
    if(s.grp||resume)applyLocks();
    s.enter&&s.enter(P.st);render();
  }
  function advance(skip){
    const s=P.steps[prog.step];if(!s)return;
    if(skip)prog.skips++;else if(!s.next&&P.st._f)toast('✓ '+s.t,'ok');
    if(s.w==='tap'||s.w==='mark')blind(false);
    prog.step++;
    if(prog.step>=P.steps.length)finishChapter();else enterStep(false);
    const now=$('#pc-now');if(now&&!skip)now.classList.add('flash');
    save();
  }
  function finishChapter(){
    const c=prog.ch,ch=CH[c];prog.done[c]=true;badge(ch.badge);
    if(c===8&&window.MixCoach&&MixCoach.state.hist[0]&&MixCoach.state.hist[0]!==P.mark){prog.score.first=MixCoach.state.hist[0].score;}
    if(ch.final&&prog.run){prog.run.end=Date.now();const s=summary();prog.sets.unshift({at:new Date().toISOString(),avg:s.avg,n:s.tl.length});prog.sets.length=Math.min(prog.sets.length,10);if(s.avg!=null&&s.avg>=80)badge('Set à 80+');P.run=null;}
    toast('Chapitre réussi : '+ch.title,'ok');render();
  }
  function open(c,resume){
    if(!prog.active){
      P.saved=resume&&store.get('parcoursSaved',null);
      if(!P.saved){P.saved={preset:layout.preset,visible:[...layout.visible],coach:layout.coach,decks:S.numDecks};store.set('parcoursSaved',P.saved);}
      prog.active=true;document.body.classList.add('parcours');P.el.root.hidden=false;
    }
    if(c!=null)loadChapter(c,0);else loadChapter(prog.ch,prog.step);
    $('#pc-btn').setAttribute('aria-pressed','true');
  }
  function exit(){
    if(!prog.active)return;prog.active=false;save();
    clearLocks();blind(false);setTarget(null);closeGloss();document.body.classList.remove('parcours');P.el.root.hidden=true;
    const sv=P.saved||store.get('parcoursSaved',null);
    if(sv){layout.preset=PRESETS[sv.preset]?sv.preset:'ecole';layout.visible=new Set(sv.visible);layout.coach=sv.coach;S.numDecks=sv.decks||2;}
    else{layout.preset='ecole';layout.visible=new Set(PRESETS.ecole.show);layout.coach=true;}
    store.set('parcoursSaved',null);P.saved=null;
    applyLayout();$('#pc-btn').setAttribute('aria-pressed','false');if(!Coach.L.active&&Coach.render)Coach.render();
    toast('Interface complète. Le parcours t’attend dans le bouton Parcours.');
  }
  function toggleFree(){prog.free=!prog.free;save();applyLocks();render();}
  function reset(){if(!confirm('Effacer toute ta progression dans le parcours ?'))return;Object.assign(prog,JSON.parse(JSON.stringify(DEF)),{active:true});P.run=null;loadChapter(0,0);}

  /* ---------- halo et LED ---------- */
  function elOf(tg){if(!tg)return null;if(/^[#.\[]/.test(tg))return $(tg);const c=ctl(tg);return c?c.el:null;}
  function setTarget(tg){
    const el=elOf(tg);
    if(P.tEl&&P.tEl!==el)P.tEl.classList.remove('coach-target','pc-target');
    P.target=el?tg:null;P.tEl=el;if(el)el.classList.add('coach-target','pc-target');
  }

  /* ---------- affichage ---------- */
  function build(){
    const root=P.el.root=h('section',{id:'pc',class:'pc',hidden:true,'aria-label':'Parcours'});
    P.el.body=h('div',{class:'pc-body'});root.append(P.el.body);
    $('#p-coach h2').after(root);
    const btn=h('button',{class:'tb pcb',id:'pc-btn',type:'button','aria-pressed':'false',title:'Parcours « De zéro à ton premier set »',onclick:()=>{if(!prog.active)open();else{P.view=P.view==='map'?'step':'map';render();}}},'Parcours');
    $('#coach-btn').before(btn);
  }
  const lbl=(t,c)=>h('div',{class:'pc-k'+(c?' '+c:'')},t);
  function dots(){return h('div',{class:'pc-dots',title:'Les 14 chapitres'},CH.map((c,i)=>h('i',{class:prog.done[i]?'d':i===prog.ch?'c':''})));}
  function render(){
    const el=P.el.body;if(!el)return;closeGloss();el.innerHTML='';P.hintEl=null;P.lastHint='';P.live=null;
    if(P.view==='map')return renderMap(el);
    if(P.view==='gloss')return renderGloss(el);
    const ch=CH[prog.ch],n=P.steps.length,done=prog.step>=n;
    el.append(h('div',{class:'pc-head'},
      h('div',{class:'pc-row'},lbl(`Parcours · chapitre ${prog.ch+1}/${CH.length}`),dots()),
      h('div',{class:'pc-title'},ch.title),h('div',{class:'pc-sub'},ch.sub),
      h('div',{class:'prog'},h('i',{style:`width:${Math.min(prog.step,n)/n*100}%`}))));
    if(done){
      const box=h('div',{class:'donebox pc-done flash'},h('b',{},'Chapitre réussi !'),h('div',{class:'pc-badges'},h('span',{class:'pc-badge'},'🏅 '+ch.badge)));
      el.append(box);
      if(ch.final)el.append(summaryCard());
      else if(prog.ch===8&&prog.score.first!=null)box.append(h('p',{},`Ta première transition : ${prog.score.first}/100.`));
      el.append(h('div',{class:'pc-btns'},prog.ch<CH.length-1&&h('button',{class:'go',type:'button',id:'pc-nextch',onclick:()=>loadChapter(prog.ch+1,0)},'Chapitre suivant : '+CH[prog.ch+1].title),
        h('button',{class:'b',type:'button',onclick:()=>loadChapter(prog.ch,0)},'Refaire le chapitre')));
    }else{
      const s=P.steps[prog.step];
      P.hintEl=h('div',{class:'hx'},'');
      const now=h('div',{class:'now pc-now',id:'pc-now'},
        lbl(`Étape ${prog.step+1}/${n}`+(s.src?' · leçon « '+s.src+' »':'')),
        h('div',{class:'t'},s.t),h('div',{class:'why'},rich(s.why)),widget(s),P.hintEl,
        h('div',{class:'pc-btns'},s.next&&h('button',{class:'go',type:'button',id:'pc-next',onclick:()=>advance(false)},'Continuer'),
          h('button',{class:'b',type:'button',id:'pc-skip',title:'Pas de pénalité : tu peux toujours y revenir',onclick:()=>advance(true)},'Passer l’étape')));
      el.append(now);
      el.append(h('details',{class:'pc-all'},h('summary',{},'Toutes les étapes'),h('ol',{class:'steps'},P.steps.map((x,i)=>h('li',{class:i<prog.step?'done':i===prog.step?'cur':''},x.t)))));
    }
    el.append(h('div',{class:'pc-foot'},
      h('button',{class:'b',type:'button',id:'pc-map',onclick:()=>{P.view='map';render();}},'Carte'),
      h('button',{class:'b',type:'button',id:'pc-gloss',onclick:()=>{P.view='gloss';render();}},'Glossaire'),
      h('button',{class:'b'+(prog.free?' on':''),type:'button',title:'Montrer toutes les commandes, quel que soit le chapitre',onclick:toggleFree},'Tout afficher'),
      h('button',{class:'b',type:'button',id:'pc-exit',onclick:exit},'Quitter')));
  }
  function widget(s){
    if(s.w==='tap')return h('div',{class:'pc-ear'},h('button',{class:'pc-tapb',type:'button',id:'pc-tap',onpointerdown:e=>{e.preventDefault();tap();}},'Tape ici',h('small',{},'ou touche T')),h('b',{id:'pc-tapn'},'0/8'));
    if(s.w==='mark')return h('div',{class:'pc-ear'},h('button',{class:'pc-tapb',type:'button',id:'pc-mark',onpointerdown:e=>{e.preventDefault();mark();}},s.mark,h('small',{},'ou touche M')));
    if(s.w==='res')return earResult(s.res);
    if(s.w==='wheel')return wheel();
    if(s.w==='set')return setBuilder(s);
    if(s.w==='setlist')return h('ol',{class:'pc-setl'},setIds().map(id=>{const t=trackOf(id);return h('li',{},h('span',{},t.title),h('i',{class:'pc-en',title:'Énergie'},'⚡'+energy(t)),h('em',{},t.bpm.toFixed(0)+' BPM'));}));
    if(s.w==='score'){const d=h('div',{class:'pc-score'});P.live=()=>{const r=window.MixCoach&&MixCoach.state.hist[0];if(!r||r===P.mark||d.dataset.k===String(r.at))return;d.dataset.k=String(r.at);d.innerHTML='';d.append(h('span',{class:'sc '+(r.score>=75?'ok':r.score>=50?'warn':'bad')},String(r.score)),h('span',{},` /100 · ${r.from} → ${r.to} · ${r.bars.toFixed(0)} mesures`));};return d;}
    return null;
  }
  function earResult(k){
    const box=h('div',{class:'pc-res'});
    if(k==='tap'){const r=prog.ear.tap;if(!r)return box.append('Pas de mesure : tu as passé l’exercice.'),box;
      box.append(h('div',{class:'pc-big '+(r.score>=80?'ok':r.score>=50?'warn':'bad')},String(r.score),h('small',{},'/100')),
        h('ul',{},h('li',{},`Ton tempo : ${r.bpm} BPM. Le vrai : ${r.real} BPM.`),r.mult!==1&&h('li',{},r.mult===2?'Tu as tapé un temps sur deux : c’est un vrai réflexe de DJ, mais vise chaque temps.':'Tu as tapé deux fois par temps : tape seulement sur la grosse caisse.'),
          h('li',{},r.ms<30?`Pile dans le temps (${r.ms} ms d’écart).`:`En moyenne ${r.ms} ms d’écart avec la grosse caisse.`)));}
    else{const m=prog.ear.mark||{},f=(x,n)=>x==null?`${n} : passé.`:Math.abs(x)<=1?`${n} repéré pile au bon moment.`:`${n} repéré ${Math.abs(x).toFixed(1)} temps ${x>0?'en retard':'en avance'}.`;
      box.append(h('ul',{},h('li',{},f(m.brk,'Break')),h('li',{},f(m.drop,'Drop')),h('li',{},'Le break dure 8 mesures (32 temps) : une phrase, comme presque tout dans un morceau.')));}
    return box;
  }
  function wheel(){
    const svg=svgEl('svg',{viewBox:'-100 -100 200 200',class:'pc-wheel',role:'img','aria-label':'Roue des tonalités'});
    const draw=()=>{svg.innerHTML='';const k=keyInfo(A().keyNow());
      for(const[letter,r0,r1]of[['B',62,96],['A',30,62]])for(let n=1;n<=12;n++){
        const a0=(n-1.5)*Math.PI/6-Math.PI/2,a1=(n-.5)*Math.PI/6-Math.PI/2,p=(r,a)=>`${(r*Math.cos(a)).toFixed(2)} ${(r*Math.sin(a)).toFixed(2)}`;
        const me=k&&k.num===n&&k.letter===letter,ok=k&&!me&&(k.num===n||(k.letter===letter&&(Math.abs(k.num-n)===1||Math.abs(k.num-n)===11)));
        const path=svgEl('path',{d:`M${p(r0,a0)} L${p(r1,a0)} A${r1} ${r1} 0 0 1 ${p(r1,a1)} L${p(r0,a1)} A${r0} ${r0} 0 0 0 ${p(r0,a0)}Z`,class:me?'me':ok?'ok':'',style:`fill:hsl(${((n-1)*30+200)%360} 70% ${letter==='A'?42:52}% / ${me?1:ok?.75:.22})`});
        const am=(n-1)*Math.PI/6-Math.PI/2,rm=(r0+r1)/2,tx=svgEl('text',{x:(rm*Math.cos(am)).toFixed(1),y:(rm*Math.sin(am)+3).toFixed(1),class:me||ok?'on':''});tx.textContent=n+letter;svg.append(path,tx);}
      const c=svgEl('text',{x:0,y:4,class:'mid'});c.textContent=k?k.code:'—';svg.append(c);};
    draw();let last='';P.live=()=>{const k=keyInfo(A().keyNow()),c=k?k.code:'';if(c!==last){last=c;draw();}};
    return h('div',{class:'pc-wheelw'},svg,h('div',{class:'pc-legend'},h('span',{class:'me'},'A joue ici'),h('span',{class:'ok'},'Compatibles')));
  }
  function setBuilder(s){
    const box=h('div',{class:'pc-set'}),ids=setIds();
    const mv=(i,d)=>{const a=setIds();const j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];prog.set=a;save();render();};
    box.append(h('ol',{class:'pc-setl'},ids.map((id,i)=>{const t=trackOf(id),e=energy(t);return h('li',{},h('span',{},t.title),h('i',{class:'pc-en',style:`--e:${e*10}%`,title:'Énergie '+e+'/10'},'⚡'+e),
      h('button',{class:'b',type:'button',title:'Monter',onclick:()=>mv(i,-1)},'↑'),h('button',{class:'b',type:'button',title:'Descendre',onclick:()=>mv(i,1)},'↓'),
      h('button',{class:'b',type:'button',title:'Retirer',onclick:()=>{prog.set=setIds().filter(x=>x!==id);save();render();}},'×'));})));
    if(ids.length)box.append(h('div',{class:'pc-curve',title:'Courbe d’énergie'},ids.map(id=>h('i',{style:`height:${energy(trackOf(id))*10}%`}))));
    const rest=LIB.tracks.filter(t=>!ids.includes(t.id));
    if(rest.length&&ids.length<5)box.append(lbl('Ta bibliothèque'),h('ul',{class:'pc-pick'},rest.map(t=>h('li',{},h('span',{},t.title,h('em',{},` · ${t.bpm.toFixed(0)} BPM · ⚡${energy(t)}`)),h('button',{class:'b',type:'button',title:'Ajouter au set','data-add':t.id,onclick:()=>{prog.set=[...setIds(),t.id].slice(0,5);save();render();}},'+')))));
    if(s.order)box.append(h('button',{class:'go',type:'button',id:'pc-order',onclick:()=>{P.st.ok=true;}},'C’est mon ordre'));
    if(s.save)box.append(h('button',{class:'go',type:'button',id:'pc-save',onclick:()=>{const pl=LIB.playlists[0];if(pl){pl.ids=setIds().slice();renderSide();toast('Set rangé dans « '+pl.name+' »','ok');}}},'Ranger dans « Préparation »'));
    return box;
  }
  function summaryCard(){
    const s=summary(),txt=summaryText();
    const card=h('div',{class:'pc-sum',id:'pc-sum'},
      h('div',{class:'pc-sumh'},h('div',{},lbl('Ton premier set'),h('b',{},`${pl(s.tl.length,'morceau','morceaux')} · ${pl(s.trs.length,'transition')} · ${fmtMin(s.dur)}`)),
        s.avg!=null&&h('div',{class:'pc-big '+(s.avg>=75?'ok':s.avg>=50?'warn':'bad')},String(s.avg),h('small',{},'/100'))),
      lbl('Tracklist'),h('ol',{class:'pc-tl'},s.tl.map(t=>h('li',{},t.at!=null&&h('em',{},fmtTime(t.at,false)),h('span',{},t.title),t.artist&&h('i',{},t.artist)))),
      s.trs.length?h('div',{},lbl('Transitions'),h('div',{class:'pc-trs'},s.trs.map(t=>h('div',{class:'pc-tr'},h('span',{class:'sc '+(t.score>=75?'ok':t.score>=50?'warn':'bad')},String(t.score)),h('span',{},`${t.from} → ${t.to} · ${t.title}`))))):h('p',{class:'pc-sub'},'Aucune transition notée : la prochaine fois, laisse une seule piste jouer 2 secondes à la fin de chaque transition.'),
      s.good.length&&h('div',{},lbl('Points forts','ok'),h('ul',{class:'pc-ul g'},s.good.map(x=>h('li',{},x)))),
      s.tips.length&&h('div',{},lbl('À travailler','warn'),h('ul',{class:'pc-ul'},s.tips.map(x=>h('li',{},x)))),
      h('div',{class:'pc-btns'},h('button',{class:'go',type:'button',id:'pc-copy',onclick:()=>copy(txt)},'Copier le résumé'),REC.url&&h('a',{class:'b',href:REC.url,download:'mon-premier-set.webm'},'Télécharger l’enregistrement')));
    return card;
  }
  function copy(txt){
    const ok=()=>toast('Résumé copié : colle-le où tu veux','ok');
    const fb=()=>{const ta=h('textarea',{class:'pc-copyta',readonly:true});ta.value=txt;P.el.body.append(ta);ta.select();try{document.execCommand('copy');ok();}catch(e){toast('Sélectionne le texte et copie-le.');}};
    (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(txt).then(ok,fb):Promise.reject()).catch(fb);
    P.copied=txt;
  }
  function renderMap(el){
    const nDone=Object.keys(prog.done).length;
    el.append(h('div',{class:'pc-head'},lbl('Parcours · de zéro à ton premier set'),h('div',{class:'pc-title'},'La carte'),
      h('div',{class:'pc-stats'},h('span',{},h('b',{},`${nDone}/${CH.length}`),' chapitres'),h('span',{},h('b',{},fmtMin(prog.time)),' de pratique'),h('span',{},h('b',{},String(prog.badges.length)),prog.badges.length>1?' badges':' badge'))));
    el.append(h('div',{class:'pc-map'},CH.map((c,i)=>h('button',{class:'pc-tile'+(prog.done[i]?' d':'')+(i===prog.ch?' c':''),type:'button','data-ch':i,onclick:()=>loadChapter(i,i===prog.ch&&!prog.done[i]?prog.step:0)},
      h('span',{class:'n'},prog.done[i]?'✓':String(i+1)),h('span',{class:'tx'},h('b',{},c.title),h('small',{},c.sub)),h('em',{},prog.chTime[i]?fmtMin(prog.chTime[i]):'~'+c.mins+' min')))));
    if(prog.badges.length)el.append(lbl('Badges'),h('div',{class:'pc-badges'},prog.badges.map(b=>h('span',{class:'pc-badge'},'🏅 '+b))));
    el.append(h('div',{class:'pc-foot'},h('button',{class:'go',type:'button',onclick:()=>{P.view='step';render();}},'Reprendre'),
      h('button',{class:'b',type:'button',onclick:()=>{P.view='gloss';render();}},'Glossaire'),
      h('button',{class:'b',type:'button',onclick:reset},'Tout recommencer'),h('button',{class:'b',type:'button',onclick:exit},'Quitter')));
  }
  function renderGloss(el){
    el.append(h('div',{class:'pc-head'},lbl('Parcours'),h('div',{class:'pc-title'},'Glossaire')));
    el.append(h('dl',{class:'pc-dl'},Object.keys(GLOSS).sort((a,b)=>a.localeCompare(b,'fr')).flatMap(k=>[h('dt',{},k[0].toUpperCase()+k.slice(1)),h('dd',{},GLOSS[k])])));
    el.append(h('div',{class:'pc-foot'},h('button',{class:'go',type:'button',onclick:()=>{P.view='step';render();}},'Retour')));
  }

  /* ---------- carte « parcours » dans la liste des leçons ---------- */
  function card(){
    const started=Object.keys(prog.done).length||prog.step||prog.ch;
    return h('div',{class:'lcard pc-card'},h('span',{class:'mod'},'Parcours · 14 chapitres · ~2 h'),h('b',{},'De zéro à ton premier set'),
      h('p',{},'Tu n’as jamais touché une platine ? L’interface s’ouvre au fur et à mesure, une commande à la fois, jusqu’à ton premier set enregistré.'),
      h('button',{class:'go',type:'button',onclick:()=>open()},started?`Reprendre · chapitre ${prog.ch+1}`:'Commencer'));
  }

  /* ---------- premier lancement ---------- */
  // Je viens d'un autre logiciel : on choisit la disposition la plus proche.
  const FROM={serato:['Serato','perf'],rekordbox:['rekordbox','export'],traktor:['Traktor','studio'],virtualdj:['VirtualDJ','mix']};
  function welcome(choice){
    if(choice){store.set('welcome',choice);if(P.el.wel){P.el.wel.remove();P.el.wel=null;}
      if(choice==='novice'){open(prog.active?null:0);return;}
      const f=FROM[choice];
      if(f){const[name,k]=f,pr=PRESETS[k];layout.preset=k;layout.visible=new Set(pr.show);layout.coach=!!pr.coach;applyLayout();toast(`Disposition « ${pr.name} », la plus proche de ${name}. Le parcours reste dans le bouton Parcours.`,'ok');}
      else toast('Le parcours débutant reste dans le bouton Parcours, en haut.');return;}
    const opt=(id,t,p,c)=>h('button',{class:'pc-opt',type:'button',id,onclick:()=>welcome(c)},h('b',{},t),h('span',{},p));
    P.el.wel=h('div',{class:'pc-wel',role:'dialog','aria-label':'Bienvenue'},h('div',{class:'pc-welc'},
      h('div',{class:'pc-k'},'Bienvenue dans Mixlab'),h('h2',{},'Tu as déjà mixé ?'),
      h('p',{},'Mixlab est un logiciel DJ complet et gratuit, avec un professeur intégré. Dis-nous d’où tu pars.'),
      h('div',{class:'pc-opts'},opt('pc-novice','Je n’ai jamais mixé','Un parcours guidé en 14 chapitres, de ta première note à ton premier set. L’interface s’ouvre petit à petit.','novice'),
        opt('pc-pro','Je sais déjà mixer','L’interface complète tout de suite. Le parcours reste dans le bouton Parcours.','pro')),
      h('div',{class:'pc-from'},h('span',{},'Je mixe déjà sur'),Object.entries(FROM).map(([k,[n]])=>h('button',{class:'pc-fromb',type:'button',id:'pc-from-'+k,onclick:()=>welcome(k)},n)))));
    document.body.append(P.el.wel);$('#pc-novice').focus();
  }

  /* ---------- boucle ---------- */
  function tick(dt){
    if(!P.ready||!prog.active){if(P.target)setTarget(null);return;}
    prog.time+=dt;prog.chTime[prog.ch]=(prog.chTime[prog.ch]||0)+dt;
    const t=performance.now();if(t-P.lastSave>5000){P.lastSave=t;save();}
    runTick();
    if(P.view!=='step'||prog.step>=P.steps.length){setTarget(null);return;}
    const s=P.steps[prog.step];
    let tg=null;try{tg=typeof s.target==='function'?s.target(P.st):s.target;}catch(e){tg=null;}
    setTarget(tg);
    if(P.live)P.live();
    if(s.check){let ok=false;try{ok=!!s.check(P.st);}catch(e){ok=false;}
      if(ok){P.hold+=dt;if(P.hold>=(s.hold||.25)){advance(false);return;}}else{P.hold=0;P.st._f=true;}}
    let ht='';try{ht=s.hint?s.hint(P.st)||'':'';}catch(e){}
    if(P.hintEl&&ht!==P.lastHint){P.hintEl.textContent=ht;P.lastHint=ht;}
  }
  // Ce que le coach en direct a le droit d'afficher pendant le parcours.
  function keepIssue(v){const m=CH[prog.ch]&&CH[prog.ch].coach;return m==='all'||v.id==='clip';}
  function init(){
    build();annotate();P.ready=true;
    if(prog.active){prog.active=false;open(null,true);}
    else if(store.get('welcome',null)==null&&(!navigator.webdriver||/welcome/.test(location.hash)))welcome();
    if(!Coach.L.active&&Coach.render)Coach.render();
  }
  return{init,tick,open,exit,go:(c,s)=>{if(!prog.active)open(c);loadChapter(c,s||0);},skip:()=>advance(true),next:()=>advance(false),tap,mark,card,keepIssue,welcome,
    summaryText,summary,CH,GLOSS,prog,P,get target(){return prog.active?P.target:null;},get active(){return prog.active;}};
})();
