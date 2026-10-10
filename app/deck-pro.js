'use strict';
/* =====================================================================
   Mixlab · platines et mixer « pro »
   Réglages de jeu (fenêtre Réglages, ouverte depuis Panneaux) :
   - mode du bouton Cue (CDJ, Denon, Numark), Cue Play, sens du pitch ;
   - sync calée sur le temps, la mesure ou la phrase de 8 mesures ;
   - courbe des faders de voie, courbe réglable et inversion du crossfader,
     résonance du filtre, balance du master ;
   - chargement automatique du morceau suivant ;
   - enregistrement du master en WAV 16 ou 24 bits.
   Sur chaque platine : Cue Play, platine doublée (instant double), key sync,
   ton fin en cents, tonalité corrigée à la main, verrou de grille,
   métronome au casque et compte à rebours jusqu'au prochain cue.
   Dans la bibliothèque : un lecteur de pré-écoute au casque.
   Rien n'est figé dans app.js : les commandes sont posées (et reposées si
   l'interface est reconstruite) par une petite boucle de surveillance.
   ===================================================================== */
window.DeckPro=(()=>{
  const DEF={cueMode:'cdj',pitchDir:'down',syncUnit:'beat',autoNext:false,faderCurve:'prog',xfCurve:'mix',xfShape:.5,xfRev:false,
    filterQ:1.4,balance:0,recFormat:'wav16',metroVol:.6};
  const P={...DEF,...store.get('deckpro',{})};
  const save=()=>store.set('deckpro',P);
  const SYNC_U={beat:1,bar:4,phrase:32};
  const CUE_MODES=[['cdj','CDJ'],['denon','Denon'],['numark','Numark']];
  const CUE_TIPS={cdj:'Cue : à l’arrêt, pose le point de départ. En lecture, y revient et s’arrête. Maintiens-le sur le cue pour pré-écouter, appuie sur Play pendant ce temps pour continuer.',
    denon:'Cue (mode Denon) : à l’arrêt, pose le point de départ là où tu es. En lecture, y revient et s’arrête. Pas de pré-écoute en maintenant.',
    numark:'Cue (mode Numark) : revient toujours au point de départ et s’arrête. Le point de départ se pose quand tu appuies sur Play.'};
  const FADER_CURVES=[['soft','Douce (lente au début)',v=>v*v*v],['prog','Progressive',v=>v*v],['lin','Linéaire',v=>v],['fast','Rapide (forte tout de suite)',v=>Math.sqrt(v)]];
  const REC_FORMATS=[['wav16','WAV 16 bits (qualité CD)'],['wav24','WAV 24 bits (studio)'],['webm','WebM / Opus (compressé, léger)']];

  /* ---------- infos gardées par morceau (verrou de grille) ---------- */
  const T=store.get('deckpro.tracks',{});
  const tkey=t=>t.path||t._bk||('m:'+(t.artist||'')+'|'+t.title);
  const saveT=()=>store.set('deckpro.tracks',T);
  const locked=t=>{if(!t)return false;if(t.gridLock==null)t.gridLock=!!(T[tkey(t)]&&T[tkey(t)].gl);return t.gridLock;};
  function setLock(t,on){
    if(!t)return;t.gridLock=!!on;const k=tkey(t);
    if(on)T[k]={...(T[k]||{}),gl:1};else if(T[k]){delete T[k].gl;if(!Object.keys(T[k]).length)delete T[k];}
    saveT();
  }

  /* ---------- comportements des platines ---------- */
  const DP=Deck.prototype,orig={cueDown:DP.cueDown,cueUp:DP.cueUp,togglePlay:DP.togglePlay,play:DP.play,toggleSync:DP.toggleSync,
    setBpm:DP.setBpm,gridNudge:DP.gridNudge,gridHere:DP.gridHere,tap:DP.tap};
  DP.cueDown=function(){
    if(!this.track)return;
    if(P.cueMode==='cdj')return orig.cueDown.call(this);
    if(this.playing&&!this.previewing){this.pause();this.seek(this.track.cue);return;}
    if(P.cueMode==='denon'){this.track.cue=this.snap(this.position());this.seek(this.track.cue);}
    else this.seek(this.track.cue);
  };
  DP.cueUp=function(){if(P.cueMode==='cdj')return orig.cueUp.call(this);};
  DP.togglePlay=function(){
    // Play pendant la pré-écoute au cue : la lecture continue quand on relâche Cue (comme sur un CDJ)
    if(this.previewing&&this.playing){this.previewing=false;return;}
    if(P.cueMode==='numark'&&this.track&&!this.playing&&this.anchorPos<this.track.duration-.05)this.track.cue=this.snap(this.anchorPos);
    return orig.togglePlay.call(this);
  };
  /* Cue Play : retour au cue et lecture tout de suite ; appuis répétés = stutter */
  DP.cuePlay=function(){if(!this.track)return;this.previewing=false;this.seek(this.track.cue);if(!this.playing)this.play();};
  DP.setKeyFine=function(c){this.keyFine=clamp(Math.round(c),-50,50);this.applyRate();};
  /* Sync à la mesure ou à la phrase : au départ, le temps de la mesure (ou de la phrase) est le même que sur la platine suivie */
  const wrapU=(n,U)=>{n=((n%U)+U)%U;return n>U/2?n-U:n;};
  DP.play=function(){
    const U=SYNC_U[P.syncUnit]||1;
    if(U>1&&this.track&&!this.playing&&this.sync&&!this.reverse){
      const o=this.syncTarget();
      if(o&&o.playing&&o.track){
        let pos=this.anchorPos;if(pos>=this.track.duration-.05)pos=this.track.cue??0;
        const next=Math.ceil(o.beatPos()+.03),mb=Math.round(this.beatIdx(pos));
        let nb=mb+wrapU(next-mb,U);if(this.timeOfBeat(nb)<-.01)nb+=U;
        if(this.timeOfBeat(nb)<this.track.duration-1)this.anchorPos=Math.max(0,this.timeOfBeat(nb));
      }
    }
    return orig.play.call(this);
  };
  DP.toggleSync=function(){
    orig.toggleSync.call(this);
    const U=SYNC_U[P.syncUnit]||1;if(U<2||!this.sync||!this.playing)return;
    const o=this.syncTarget();if(!o||!o.playing||!o.track)return;
    const n=wrapU(Math.round(o.beatPos()-this.beatPos()),U);if(n)this.seek(this.position()+n*this.beatLen);
  };
  /* Verrou de grille : BPM, tap et grille ne bougent plus */
  let lockT=0;
  const lockMsg=d=>{const n=performance.now();if(n-lockT<2500)return;lockT=n;toast('Grille verrouillée sur la platine '+d.id+' : déverrouille-la (bouton Verrou) pour la modifier');};
  for(const k of['setBpm','gridNudge','gridHere','tap'])DP[k]=function(...a){if(locked(this.track)){lockMsg(this);return;}return orig[k].apply(this,a);};

  /* ---------- key sync ---------- */
  function keyRef(d){const m=S.master;if(m&&m!==d&&m.active&&m.track&&m.track.key)return m;return decks.find(x=>x!==d&&x.active&&x.track&&x.track.key&&x.playing)||null;}
  /* transposition (en demi-tons, cents compris) qui rend la tonalité compatible avec la platine suivie, la plus petite possible */
  function keySyncCalc(d){
    const o=keyRef(d);if(!o||!d.track||!d.track.key)return null;
    const tk=o.keyNow(),ps=d.keyLock?0:12*Math.log2(1+d.pitch),code=keyInfo(tk).code;let best=null;
    for(let n=-7;n<=7;n++){
      const k=transposeKey(d.track.key,n);if(!keysCompatible(k,tk))continue;
      const need=n-ps;if(Math.abs(need)>6.49)continue;
      const sc=Math.abs(need)-(keyInfo(k).code===code?.6:0);
      if(!best||sc<best.sc)best={sc,need};
    }
    if(!best)return null;
    const ks=Math.round(best.need);return{ks,fine:Math.round((best.need-ks)*100),ref:o};
  }
  function applyKeySync(d,quiet){
    const r=keySyncCalc(d);
    if(!r){if(!quiet)toast(keyRef(d)?'Aucune tonalité compatible à moins de 6 demi-tons':'Key sync : il faut une autre platine avec une tonalité (la platine maître)');return false;}
    if(r.ks!==d.keyShift||r.fine!==(d.keyFine||0)){d.keyFine=r.fine;d.setKeyShift(r.ks);}
    return true;
  }
  function setKeySync(d,on){
    if(on&&!applyKeySync(d,false))on=false;
    d.keySync=!!on;if(!on){d.keyFine=0;d.setKeyShift(0);}
  }

  /* ---------- platine doublée (instant double) ---------- */
  const PARTNER={A:'B',B:'A',C:'D',D:'C'};
  function cloneSource(d){
    const ok=x=>x&&x!==d&&x.active&&x.track;
    if(ok(S.master))return S.master;
    const p=deckById(PARTNER[d.id]);if(ok(p))return p;
    return decks.find(x=>ok(x)&&x.playing)||decks.find(ok)||null;
  }
  function clone(dst,src){
    src=src||cloneSource(dst);
    if(!src||!src.track){toast('Rien à doubler : charge un morceau sur une autre platine');return false;}
    if(dst.playing&&audible(dst)){toast('La platine '+dst.id+' est à l’antenne : mets-la en pause ou baisse son fader avant de la doubler');return false;}
    dst.sync=false;dst.keySync=false;dst.load(src.track);
    dst.setRange(src.pitchRange);dst.keyLock=src.keyLock;dst.keyShift=src.keyShift;dst.keyFine=src.keyFine||0;dst.setPitch(src.pitch);
    dst.loopSize=src.loopSize;dst.lastLoop=src.lastLoop?{...src.lastLoop}:null;
    if(src.loop.on)dst.loop={...src.loop};
    if(src.playing&&!src.spinSt){
      const when=ctx.currentTime+.012;let p=src.positionAt(when);
      if(src.reverse){dst.reverse=true;}
      else if(dst.loop.on&&p>=dst.loop.end){const L=dst.loop.end-dst.loop.start;p=dst.loop.start+((p-dst.loop.start)%L);}
      dst.startSource(p,when);dst.playStart=performance.now();dst.lastStart=null;
    }else dst.anchorPos=src.position();
    toast('Platine '+dst.id+' : double de '+src.id,'ok');
    return true;
  }

  /* ---------- tonalité corrigée à la main ---------- */
  const ALL_KEYS=(()=>{const o=[];for(let n=1;n<=12;n++)for(const L of['A','B']){const minor=L==='A';o.push({pc:(minor?WHEEL_MIN:WHEEL_MAJ).indexOf(n),minor});}return o;})();
  function setTrackKey(tr,k){
    if(tr._k0===undefined)tr._k0=tr.key; // tonalité d'origine (détectée ou lue dans les tags)
    tr.key=k?{pc:k.pc,minor:k.minor}:null;tr.keyUser=!!k;
    if(window.LibPro&&LibPro.saveBrowser)setTimeout(()=>LibPro.saveBrowser(),0);
    renderTable();
  }
  function keyEditor(d,anchor){
    const tr=d.track;if(!tr){toast('Charge un morceau sur la platine '+d.id+' d’abord');return;}
    const det=tr._k0!==undefined?tr._k0:(tr._a&&tr._a.key)||(tr.keyUser?null:tr.key),ki=keyInfo(tr.key),dk=keyInfo(det);
    const sel=h('select',{class:'sel wide','aria-label':'Tonalité du morceau'},h('option',{value:''},'Inconnue'),ALL_KEYS.map((k,i)=>{const x=keyInfo(k);return h('option',{value:i},x.code+' · '+x.name);}));
    sel.value=tr.key?String(ALL_KEYS.findIndex(k=>k.pc===tr.key.pc&&!!k.minor===!!tr.key.minor)):'';
    sel.addEventListener('change',()=>{setTrackKey(tr,sel.value===''?null:ALL_KEYS[+sel.value]);});
    const step=n=>{if(!tr.key)return;setTrackKey(tr,transposeKey(tr.key,n));sel.value=String(ALL_KEYS.findIndex(k=>k.pc===tr.key.pc&&!!k.minor===!!tr.key.minor));};
    Perf.popover(anchor,'Tonalité · '+short(tr.title,24),[
      h('p',{class:'pe'},'Si la tonalité détectée sonne faux, corrige-la ici. Elle est gardée avec le morceau.'),sel,
      h('div',{class:'pa'},h('button',{class:'b',type:'button',title:'Un demi-ton plus bas',onclick:()=>step(-1)},'−1 demi-ton'),h('button',{class:'b',type:'button',title:'Un demi-ton plus haut',onclick:()=>step(1)},'+1 demi-ton')),
      h('div',{class:'pe'},'D’origine : '+(dk?dk.code+' · '+dk.name:'aucune')+(ki&&tr.keyUser?' · corrigée par toi':'')),
      det?h('div',{class:'pa'},h('button',{class:'b',type:'button',onclick:()=>{setTrackKey(tr,det);tr.keyUser=false;Perf.close();}},'Revenir à la tonalité d’origine')):null]);
  }

  /* ---------- compte à rebours ---------- */
  function countdown(d){
    const tr=d.track;if(!tr||!tr.bpm)return null;
    const pos=d.position(),bp=d.beatIdx(pos);let best=null;
    const add=(t,label)=>{if(t>pos+.03&&(!best||t<best.t))best={t,label};};
    tr.hot.forEach((t,i)=>{if(t!=null)add(t,hotName(tr,i)||'Cue '+(i+1));});
    (tr.memCues||[]).forEach(c=>add(c.t,c.label||'Cue'));
    const ph=d.timeOfBeat(Math.floor(bp/32+1e-6)*32+32);if(!best||ph<best.t)best={t:ph,label:'Phrase'};
    const beats=Math.max(0,d.beatIdx(best.t)-bp),n=Math.ceil(beats-1e-3);
    return{label:best.label,beats,bars:Math.floor(n/4),beat:n%4,text:Math.floor(n/4)+'.'+(n%4)};
  }

  /* ---------- métronome au casque ---------- */
  const metroOut=ctx.createGain();metroOut.connect(bus.hp);
  const metroAn=ctx.createAnalyser();metroAn.fftSize=1024;metroOut.connect(metroAn);
  let clicks=0;
  function click(t,down){
    const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=down?1760:1100;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(P.metroVol,t+.002);g.gain.exponentialRampToValueAtTime(.0001,t+.05);
    o.connect(g);g.connect(metroOut);o.start(t);o.stop(t+.06);o.onended=()=>{try{g.disconnect();}catch(e){}};clicks++;
  }
  setInterval(()=>{
    const now=ctx.currentTime,hz=now+.15;
    for(const d of decks){
      if(!d.metro||!d.active||!d.playing||!d.track||d.reverse||d.spinSt){d._mk=null;continue;}
      const bp=d.beatPos(),spb=d.beatLen/d.rate;let k=Math.ceil(bp-1e-6);
      if(d._mk!=null&&(d._mk<k-2||d._mk>k+1))d._mk=null;
      if(d._mk!=null)k=Math.max(k,d._mk+1);
      for(;;k++){const t=now+(k-bp)*spb;if(t>hz)break;if(t>=now-.002)click(Math.max(t,now),((k%4)+4)%4===0);d._mk=k;}
    }
  },25);

  /* ---------- pré-écoute dans la bibliothèque (casque seulement) ---------- */
  const PV={g:ctx.createGain(),src:null,tr:null,pos:0,t0:0,on:false,el:null,warned:false};
  PV.g.gain.value=.9;PV.g.connect(bus.hp);
  PV.an=ctx.createAnalyser();PV.an.fftSize=1024;PV.g.connect(PV.an);
  const hpRouted=()=>S.split||!!S.hpDevice;
  function pvPos(){if(!PV.tr)return 0;if(!PV.on)return PV.pos;return Math.min(PV.tr.duration,PV.pos+Math.max(0,ctx.currentTime-PV.t0));}
  function pvStop(keep){
    if(PV.src){const s=PV.src,t=ctx.currentTime;PV.src=null;s.onended=null;try{s._g.gain.setTargetAtTime(0,t,.008);s.stop(t+.05);}catch(e){}}
    if(PV.on)PV.pos=pvPos();PV.on=false;if(!keep)PV.tr=null;
  }
  function pvPlay(tr,pos){
    if(!tr||!tr.buffer)return false;resumeAudio();
    pvStop(true);PV.tr=tr;pos=clamp(pos??(tr.cue??0),0,Math.max(0,tr.duration-.05));
    const s=ctx.createBufferSource(),g=ctx.createGain(),t=ctx.currentTime+.005;s.buffer=tr.buffer;s._g=g;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(1,t+.006);s.connect(g);g.connect(PV.g);s.start(t,pos);
    s.onended=()=>{if(PV.src===s){PV.src=null;PV.on=false;PV.pos=tr.duration;}};
    PV.src=s;PV.pos=pos;PV.t0=t;PV.on=true;
    if(!hpRouted()&&!PV.warned){PV.warned=true;toast('Pré-écoute au casque : active Split (mixer) ou choisis une sortie casque (bouton Audio) pour l’entendre');}
    return true;
  }
  const pvSelected=()=>LIB.tracks.find(t=>t.id===ui.sel)||null;
  function pvToggle(){
    if(PV.on){pvStop(true);return;}
    const t=pvSelected()||PV.tr;if(!t){toast('Sélectionne un morceau dans la liste pour le pré-écouter');return;}
    pvPlay(t,t===PV.tr&&PV.pos<t.duration-.1?PV.pos:null);
  }
  function pvSeek(f){const t=PV.tr||pvSelected();if(!t)return;const p=clamp(f,0,1)*t.duration;if(PV.on||!PV.tr)pvPlay(t,p);else{PV.tr=t;PV.pos=p;}}
  function buildPreview(){
    const play=h('button',{class:'tb dp-pvb',type:'button','data-ctl':'preview',title:'Pré-écoute au casque du morceau sélectionné, sans toucher aux platines','aria-label':'Pré-écoute'},'▶ Pré-écoute');
    play.addEventListener('click',pvToggle);
    const cv=h('canvas',{class:'dp-pvc',title:'Clique ou glisse pour te déplacer dans la pré-écoute','aria-label':'Position de la pré-écoute'});
    let drag=false;const at=e=>{const r=cv.getBoundingClientRect();return(e.clientX-r.left)/r.width;};
    cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);drag=true;pvSeek(at(e));});
    cv.addEventListener('pointermove',e=>{if(drag&&cv.hasPointerCapture(e.pointerId))pvSeek(at(e));});
    cv.addEventListener('pointerup',()=>{drag=false;});
    const tm=h('span',{class:'dp-pvt'},'');
    regBtn('preview','Pré-écoute',play,pvToggle);
    PV.el={root:h('div',{class:'dp-pv'},play,cv,tm),play,cv,tm};return PV.el.root;
  }
  function drawPreview(){
    const E=PV.el;if(!E)return;const tr=PV.tr||pvSelected();
    E.play.textContent=PV.on?'■ Pré-écoute':'▶ Pré-écoute';E.play.classList.toggle('on',PV.on);
    E.tm.textContent=tr?fmtTime(pvPos(),false)+' / '+fmtTime(tr.duration,false):'';
    E.root.title=tr?'Pré-écoute : '+(tr.artist?tr.artist+' - ':'')+tr.title:'';
    const cv=E.cv;if(!fitCanvas(cv))return;const g=cv.getContext('2d'),W=cv.width,H=cv.height;
    g.fillStyle='#07080a';g.fillRect(0,0,W,H);if(!tr||!tr.wf)return;
    const wf=tr.wf,n=wf.l.length,mid=H/2,sc=wf.scale*mid*.95;g.fillStyle=PV.tr===tr?'#8fa3bd':'#4a5260';
    for(let x=0;x<W;x++){const i0=Math.floor(x/W*n),i1=Math.max(i0+1,Math.floor((x+1)/W*n));let m=0;for(let i=i0;i<i1;i++)m=Math.max(m,wf.l[i],wf.m[i]);const hh=Math.max(.5,m*sc);g.fillRect(x,mid-hh,1,hh*2);}
    if(PV.tr===tr){const px=pvPos()/tr.duration*W;g.fillStyle='rgba(5,6,8,.55)';g.fillRect(0,0,px,H);g.fillStyle='#a78bfa';g.fillRect(px-1,0,2,H);}
  }

  /* ---------- morceau suivant chargé à la fin ---------- */
  function nextFor(d){
    const busy=new Set(decks.filter(x=>x.active&&x.track).map(x=>x.track.id));
    const A=window.AutoMix&&AutoMix.state;
    if(A&&A.queue&&A.queue.length){const id=A.queue.find(i=>!busy.has(i)&&LIB.tracks.some(t=>t.id===i));if(id!=null){A.queue.splice(A.queue.indexOf(id),1);return{t:LIB.tracks.find(t=>t.id===id),from:'la file d’attente'};}}
    const rows=(lib.rows||[]).map(r=>r.t),i=rows.indexOf(d.track);
    if(i>=0)for(let j=i+1;j<rows.length;j++)if(!busy.has(rows[j].id))return{t:rows[j],from:'la liste'};
    return null;
  }
  function onEnded(d){
    if(!P.autoNext||(window.AutoMix&&AutoMix.state&&AutoMix.state.on))return;
    const n=nextFor(d);if(!n){toast('Fin du morceau sur '+d.id+' : rien à charger après lui dans la liste');return;}
    d.load(n.t);toast('Platine '+d.id+' : « '+n.t.title+' » chargé depuis '+n.from,'ok');
  }

  /* ---------- mixer : courbes, résonance, balance ---------- */
  function applyFaderCurve(){const c=FADER_CURVES.find(x=>x[0]===P.faderCurve)||FADER_CURVES[1];window.faderGain=c[2];decks.forEach(applyMix);}
  const xfGains0=window.xfGains;
  /* courbe réglable : forme 0 = douce (puissance constante sur toute la course), 1 = cut (coupe sur 4 %) */
  function xfCustom(x){const w=1-clamp(P.xfShape,0,1)*.96,a=clamp((1-x)/w,0,1),b=clamp(x/w,0,1);return[Math.sin(a*Math.PI/2),Math.sin(b*Math.PI/2)];}
  window.xfGains=function(x){if(P.xfRev)x=1-x;return S.curve==='custom'?xfCustom(x):xfGains0(x);};
  function setXfCurve(c){S.curve=c;P.xfCurve=c;save();const s=xfSelect();if(s)s.value=c;applyXf();}
  const xfSelect=()=>document.querySelector('#p-mixer select[aria-label="Courbe du crossfader"]');
  const bal={sp:ctx.createChannelSplitter(2),l:ctx.createGain(),r:ctx.createGain(),mg:ctx.createChannelMerger(2)};
  bus.lim.disconnect(bus.out);bus.lim.connect(bal.sp);bal.sp.connect(bal.l,0);bal.sp.connect(bal.r,1);bal.l.connect(bal.mg,0,0);bal.r.connect(bal.mg,0,1);bal.mg.connect(bus.out);
  function setBalance(v){P.balance=clamp(v,-1,1);if(Math.abs(P.balance)<.02)P.balance=0;const t=ctx.currentTime;bal.l.gain.setTargetAtTime(P.balance>0?1-P.balance:1,t,.01);bal.r.gain.setTargetAtTime(P.balance<0?1+P.balance:1,t,.01);}
  function setFilterQ(q){P.filterQ=clamp(q,.5,10);S.filterQ=P.filterQ;decks.forEach(applyMix);}
  // réglages rendus tout de suite (avant la construction du mixer)
  S.curve=P.xfCurve||S.curve;S.filterQ=P.filterQ;setBalance(P.balance);
  {const c=FADER_CURVES.find(x=>x[0]===P.faderCurve);if(c)window.faderGain=c[2];}

  /* ---------- enregistrement WAV du master ---------- */
  const RW={on:false,node:null,sink:null,chunks:[],bytes:0,bits:16,ready:null,flushed:null};
  const WL=`class R extends AudioWorkletProcessor{constructor(){super();this.N=4096;this.n=0;this.L=new Float32Array(this.N);this.R=new Float32Array(this.N);
    this.port.onmessage=e=>{if(e.data==='flush'){this.flush();this.port.postMessage('done');}};}
    flush(){if(this.n){this.port.postMessage([this.L.slice(0,this.n),this.R.slice(0,this.n)]);this.n=0;}}
    process(inp){const i=inp[0],l=i&&i[0],r=i&&(i[1]||i[0]),m=l?l.length:128;for(let k=0;k<m;k++){this.L[this.n]=l?l[k]:0;this.R[this.n]=r?r[k]:0;if(++this.n===this.N)this.flush();}return true;}}
    registerProcessor('mixlab-rec',R);`;
  let wlState=null;
  function loadWorklet(){
    if(wlState)return wlState;
    wlState=(async()=>{if(!ctx.audioWorklet||typeof AudioWorkletNode==='undefined')return false;
      try{const u=URL.createObjectURL(new Blob([WL],{type:'application/javascript'}));await ctx.audioWorklet.addModule(u);return true;}catch(e){return false;}})();
    return wlState;
  }
  function pcm(L,R,bits){
    const n=L.length,B=bits>>3,out=new Uint8Array(n*2*B);let o=0;
    const put=x=>{const v=x>1?1:x<-1?-1:x;if(B===2){const s=Math.round(v<0?v*32768:v*32767);out[o]=s&255;out[o+1]=(s>>8)&255;o+=2;}else{const s=Math.round(v<0?v*8388608:v*8388607);out[o]=s&255;out[o+1]=(s>>8)&255;out[o+2]=(s>>16)&255;o+=3;}};
    for(let i=0;i<n;i++){put(L[i]);put(R[i]);}
    return out;
  }
  function wavHeader(len,sr,bits){
    const b=new ArrayBuffer(44),v=new DataView(b),s=(o,t)=>{for(let i=0;i<4;i++)v.setUint8(o+i,t.charCodeAt(i));};
    s(0,'RIFF');v.setUint32(4,36+len,true);s(8,'WAVE');s(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
    v.setUint32(24,sr,true);v.setUint32(28,sr*2*bits/8,true);v.setUint16(32,2*bits/8,true);v.setUint16(34,bits,true);s(36,'data');v.setUint32(40,len,true);
    return new Uint8Array(b);
  }
  function onChunk(L,R){if(!RW.on)return;const c=pcm(L,R,RW.bits);RW.chunks.push(c);RW.bytes+=c.length;}
  function wavStart(bits){
    RW.on=true;RW.bits=bits;RW.chunks=[];RW.bytes=0;RW.sr=ctx.sampleRate;resumeAudio();
    RW.sink=ctx.createGain();RW.sink.gain.value=0;RW.sink.connect(ctx.destination);
    RW.ready=loadWorklet().then(ok=>{
      if(!RW.on)return;
      if(ok){const n=new AudioWorkletNode(ctx,'mixlab-rec',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'});
        n.port.onmessage=e=>{if(e.data==='done'){RW.flushed&&RW.flushed();return;}onChunk(e.data[0],e.data[1]);};RW.node=n;}
      else{const n=ctx.createScriptProcessor(4096,2,2);n.onaudioprocess=e=>{const b=e.inputBuffer;onChunk(b.getChannelData(0).slice(),(b.numberOfChannels>1?b.getChannelData(1):b.getChannelData(0)).slice());};RW.node=n;}
      bus.lim.connect(RW.node);RW.node.connect(RW.sink);
    });
  }
  async function wavStop(){
    await RW.ready;const n=RW.node;
    if(n&&n.port){await new Promise(res=>{RW.flushed=res;n.port.postMessage('flush');setTimeout(res,500);});RW.flushed=null;}
    RW.on=false;
    if(n){try{bus.lim.disconnect(n);}catch(e){}try{n.disconnect();}catch(e){}if(n.port)n.port.onmessage=null;}
    try{RW.sink.disconnect();}catch(e){}RW.node=null;
    const blob=new Blob([wavHeader(RW.bytes,RW.sr,RW.bits),...RW.chunks],{type:'audio/wav'});RW.chunks=[];
    return blob;
  }
  const pad2=n=>String(n).padStart(2,'0');
  const recName=()=>{const d=new Date();return'mixlab-mix-'+d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'-'+pad2(d.getHours())+'h'+pad2(d.getMinutes())+'.wav';};
  async function saveWav(blob,name){
    const N=window.mixlabNative;
    if(N&&N.saveBinary){try{const p=await N.saveBinary(name,new Uint8Array(await blob.arrayBuffer()));if(p)toast('Mix enregistré : '+p,'ok');else toast('Enregistrement non sauvegardé sur le disque : tu peux encore le télécharger depuis la bibliothèque');}catch(e){toast('Impossible d’enregistrer le mix : '+e);}return;}
    const a=h('a',{href:REC.url,download:name});document.body.append(a);a.click();a.remove();
  }
  const recToggle0=window.recToggle;
  window.recToggle=function(){
    if(REC.mr){REC.mr.stop();return true;}
    if(P.recFormat==='webm'){REC.ext='webm';return recToggle0();}
    const bits=P.recFormat==='wav24'?24:16;
    wavStart(bits);REC.ext='wav';REC.t0=performance.now();
    REC.mr={wav:true,stop:async()=>{
      const was=REC.mr;if(!was||was.stopping)return;was.stopping=true;
      const blob=await wavStop(),name=recName();
      if(REC.url)URL.revokeObjectURL(REC.url);REC.url=URL.createObjectURL(blob);REC.mr=null;REC.last={blob,name,bits};
      REC.onStop&&REC.onStop(blob);
      const r=lib.recs&&lib.recs[lib.recs.length-1];
      if(r&&r.url===REC.url){r.name=name;r.label=r.label.replace(/^Mix (\d+)/,'Mix $1 · WAV '+bits+' bits').replace(/ · (\d+) Ko$/,(m,k)=>' · '+(k>2048?(k/1024).toFixed(1)+' Mo':k+' Ko'));renderSide();}
      await saveWav(blob,name);
    }};
    return true;
  };

  /* ---------- fenêtre Réglages ---------- */
  let modal=null;
  const sel=(label,opts,val,on,tip)=>{const s=h('select',{class:'sel wide','aria-label':label,title:tip||''},opts.map(([k,n])=>h('option',{value:k},n)));s.value=val;s.addEventListener('change',()=>on(s.value));return s;};
  const rng=(label,min,max,step,val,on,fmt)=>{const out=h('b',{class:'dp-v'},fmt(val)),r=h('input',{type:'range',class:'dp-rng',min,max,step,value:val,'aria-label':label});
    r.addEventListener('input',()=>{on(+r.value);out.textContent=fmt(+r.value);});return{el:h('div',{class:'dp-rr'},r,out),r,out};};
  const field=(label,ctl,tip)=>h('label',{class:'dp-f',title:tip||''},h('span',{},label),ctl);
  function buildModal(){
    const m=h('div',{class:'modal',id:'dp-modal',hidden:true});
    const closeB=h('button',{class:'b',type:'button',onclick:()=>{m.hidden=true;}},'Fermer');
    const shape=rng('Forme de la courbe du crossfader',0,1,.01,P.xfShape,v=>{P.xfShape=v;save();applyXf();},v=>v<.2?'Douce':v>.8?'Cut':Math.round(v*100)+' %');
    const xfc=sel('Courbe du crossfader',[['mix','Mix'],['smooth','Douce'],['cut','Cut'],['custom','Réglable']],S.curve,v=>{setXfCurve(v);shape.el.hidden=v!=='custom';},'Mix : les deux à fond au centre. Douce : fondu long. Cut : coupe nette pour le scratch. Réglable : choisis la forme.');
    shape.el.hidden=S.curve!=='custom';
    const rev=h('input',{type:'checkbox','aria-label':'Crossfader inversé'});rev.checked=P.xfRev;rev.addEventListener('change',()=>{P.xfRev=rev.checked;save();applyXf();});
    const q=rng('Résonance du filtre',.5,8,.1,P.filterQ,v=>{setFilterQ(v);save();},v=>v.toFixed(1));
    const bl=rng('Balance du master',-1,1,.01,P.balance,v=>{setBalance(v);save();},v=>Math.abs(v)<.02?'Centre':(v<0?'G ':'D ')+Math.round(Math.abs(v)*100));
    bl.r.addEventListener('dblclick',()=>{bl.r.value='0';setBalance(0);save();bl.out.textContent='Centre';});
    regAbs('balance','Balance master',bl.el,v=>{setBalance(v*2-1);save();bl.r.value=String(P.balance);bl.out.textContent=Math.abs(P.balance)<.02?'Centre':(P.balance<0?'G ':'D ')+Math.round(Math.abs(P.balance)*100);},()=>(P.balance+1)/2);
    const mv=rng('Volume du métronome',0,1,.01,P.metroVol,v=>{P.metroVol=v;save();},v=>Math.round(v*100)+' %');
    const an=h('input',{type:'checkbox','aria-label':'Charger le morceau suivant'});an.checked=P.autoNext;an.addEventListener('change',()=>{P.autoNext=an.checked;save();});
    m.append(h('div',{class:'mbox',role:'dialog','aria-label':'Réglages de jeu'},
      h('h2',{},'Réglages de jeu ',closeB),
      h('div',{class:'mgrid'},
        h('div',{},h('h3',{},'Platines'),
          field('Bouton Cue',sel('Mode du bouton Cue',CUE_MODES.map(([k,n])=>[k,n]),P.cueMode,v=>{P.cueMode=v;save();decks.forEach(decorate);},'Comme sur les lecteurs CDJ, Denon ou Numark'),CUE_TIPS[P.cueMode]),
          field('Sens du pitch',sel('Sens du pitch',[['down','En haut : plus lent'],['up','En haut : plus rapide']],P.pitchDir,v=>{P.pitchDir=v;save();decks.forEach(decorate);}),'S’applique au pitch à l’écran et à celui de ta table'),
          field('Sync calée sur',sel('Sync calée sur',[['beat','Le temps'],['bar','La mesure (4 temps)'],['phrase','La phrase (8 mesures)']],P.syncUnit,v=>{P.syncUnit=v;save();}),'Avec Sync, la platine qui démarre retombe sur le même temps de la mesure (ou de la phrase) que la platine suivie'),
          h('label',{class:'dp-c',title:'Quand un morceau se termine, la platine charge le suivant : file de l’auto-mix, sinon la liste affichée'},an,'Charger le morceau suivant à la fin')),
        h('div',{},h('h3',{},'Mixer'),
          field('Faders de voie',sel('Courbe des faders de voie',FADER_CURVES.map(([k,n])=>[k,n]),P.faderCurve,v=>{P.faderCurve=v;save();applyFaderCurve();})),
          field('Crossfader',xfc),shape.el,
          h('label',{class:'dp-c',title:'Inverse le crossfader (mode « hamster ») : à gauche, tu entends la droite'},rev,'Crossfader inversé (hamster)'),
          field('Résonance du filtre',q.el,'Plus elle est haute, plus le filtre siffle autour de sa fréquence'),
          field('Balance du master',bl.el,'Double-clic : retour au centre. L’enregistrement reste centré.')),
        h('div',{},h('h3',{},'Casque et enregistrement'),
          field('Métronome',mv.el,'Volume des clics du métronome (bouton Métro de chaque platine), au casque seulement'),
          field('Format d’enregistrement',sel('Format d’enregistrement',REC_FORMATS,P.recFormat,v=>{P.recFormat=v;save();}),'WAV : sans perte, enregistré sur ton disque à l’arrêt. WebM : fichier léger, gardé jusqu’à la fermeture.'),
          h('p',{},'Dans l’appli, le fichier WAV s’enregistre là où tu le choisis. Dans le navigateur, il se télécharge.')))));
    m.addEventListener('click',e=>{if(e.target===m)m.hidden=true;});
    document.body.append(m);return m;
  }
  function openSettings(){if(!modal)modal=buildModal();modal.hidden=false;const d=$('#panels-pop');if(d&&d.closest('details'))d.closest('details').open=false;}

  /* ---------- commandes posées sur les platines ---------- */
  function decorate(d){
    const B=d.ui&&d.ui.b;if(!B||!B.cue)return;
    const D=d.id,P0=$('#p-deck'+D);if(!P0)return;
    if(!d.ui.dp||!P0.contains(d.ui.dp.root)){
      const X={};
      X.cup=btn(D+'.cueplay','Cue Play '+D,'CUP','',()=>d.cuePlay(),null,'Cue Play : revient au cue et lance la lecture. Appuie plusieurs fois pour bégayer (stutter).');
      X.dbl=btn(D+'.clone','Doubler '+D,'Doubler','',()=>clone(d),null,'');
      X.ks=btn(D+'.keysync','Key sync '+D,'Key sync','',()=>setKeySync(d,!d.keySync),null,'Key sync : accorde la tonalité sur la platine maître (même tonalité ou compatible, le plus petit écart possible)');
      X.fine=h('span',{class:'keyd dp-fine',title:'Ton fin en cents (100 cents = 1 demi-ton). Double-clic : 0.'},'0');
      X.fine.addEventListener('dblclick',()=>{d.keySync=false;d.setKeyFine(0);});
      const fm=h('button',{class:'b',type:'button',title:'Baisser le ton de 5 cents','aria-label':'Ton fin moins '+D,onclick:()=>{d.keySync=false;d.setKeyFine((d.keyFine||0)-5);}},'−');
      const fp=h('button',{class:'b',type:'button',title:'Monter le ton de 5 cents','aria-label':'Ton fin plus '+D,onclick:()=>{d.keySync=false;d.setKeyFine((d.keyFine||0)+5);}},'+');
      regAbs(D+'.keyfine','Ton fin '+D,X.fine,v=>{d.keySync=false;d.setKeyFine(v*100-50);},()=>((d.keyFine||0)+50)/100);
      X.cd=h('span',{class:'dp-cd',title:'Compte à rebours en mesures.temps jusqu’au prochain cue (hot cue ou cue mémoire) ou à la fin de la phrase'},'');
      const grid=$('.dk-grid',P0);
      X.lock=btn(D+'.gridlock','Verrou de grille '+D,'Verrou','',()=>{if(!d.track)return;setLock(d.track,!locked(d.track));toast(locked(d.track)?'Grille et BPM verrouillés pour « '+d.track.title+' »':'Grille déverrouillée','ok');},null,'Verrouille le BPM et la grille de ce morceau : plus de modification par erreur');
      X.metro=btn(D+'.metro','Métronome '+D,'Métro','',()=>{d.metro=!d.metro;d._mk=null;if(d.metro&&!hpRouted())toast('Métronome au casque : active Split ou choisis une sortie casque (bouton Audio)');},null,'Métronome au casque, calé sur la grille : vérifie qu’elle tombe juste');
      X.root=h('div',{class:'r dk-pro'},X.cup,X.dbl,X.ks,h('span',{class:'dp-kf'},h('span',{class:'lbl'},'ct'),fm,X.fine,fp),X.lock,X.metro,X.cd);
      (grid||$('.dk-loop',P0)||P0.lastElementChild).after(X.root);
      // parcours débutant : la rangée suit le verrou de la rangée Grille
      if(grid&&grid.classList.contains('pc-lock')){X.root.classList.add('pc-lock');X.root.inert=true;}
      d.ui.dp=X;
    }
    const X=d.ui.dp;
    // tonalité : clic pour la corriger
    const ks=d.ui.key&&d.ui.key.parentElement;
    if(ks&&!ks._dp){ks._dp=1;ks.style.cursor='pointer';ks.title+=' Clic : corriger la tonalité du morceau.';ks.addEventListener('click',()=>keyEditor(d,ks));}
    // sens du pitch : à l'écran (CSS) et sur la table (commande inversée)
    if(d.ui.pitch){d.ui.pitch.classList.toggle('up',P.pitchDir==='up');const pw=d.ui.pitch.parentElement;if(pw)pw.title=(P.pitchDir==='up'?'Pitch : en haut plus rapide, en bas plus lent.':'Pitch : en haut plus lent, en bas plus rapide.')+' Double-clic : retour à 0.';}
    const c=ctl(D+'.pitch');
    if(c&&!c._dp){const s0=c.set,g0=c.get;c.set=v=>s0(P.pitchDir==='up'?1-v:v);c.get=()=>{const v=g0();return P.pitchDir==='up'?1-v:v;};c._dp=1;}
    B.cue.title=CUE_TIPS[P.cueMode];
  }
  function attach(){
    if(!modal&&document.body)modal=buildModal();
    decks.forEach(decorate);
    const bar=$('.libbar');if(bar&&(!PV.el||!bar.contains(PV.el.root)))bar.append(PV.el?PV.el.root:buildPreview());
    const pop=$('#panels-pop');
    if(pop&&!$('#dp-open',pop))pop.append(h('div',{class:'lbl',style:'margin-top:6px'},'Réglages'),h('button',{class:'b',id:'dp-open',type:'button',style:'height:26px',title:'Cue, pitch, sync, courbes des faders, filtre, balance, enregistrement',onclick:openSettings},'Réglages de jeu…'));
    const xs=xfSelect();
    if(xs&&!xs._dp){xs._dp=1;if(![...xs.options].some(o=>o.value==='custom'))xs.append(h('option',{value:'custom'},'Réglable'));xs.value=S.curve;xs.addEventListener('change',()=>{P.xfCurve=xs.value;save();});}
  }

  /* ---------- boucle : affichage, fin de morceau, key sync ---------- */
  let lastAttach=0;
  function tick(){
    const now=performance.now();
    if(now-lastAttach>500){lastAttach=now;attach();}
    for(const d of decks){
      const X=d.ui&&d.ui.dp;
      const ended=d._was&&!d.playing&&d.track&&d.track===d._wasT&&d.position()>=d.track.duration-.08;
      d._was=d.playing;d._wasT=d.track;
      if(ended)onEnded(d);
      if(d.keySync&&d.track)applyKeySync(d,true);
      if(!X||!d.active)continue;
      X.cup.classList.toggle('on',d.playing&&!!d.track&&Math.abs(d.position()-d.track.cue)<.25);
      X.ks.classList.toggle('on',!!d.keySync);X.metro.classList.toggle('on',!!d.metro);X.lock.classList.toggle('on',locked(d.track));
      const f=d.keyFine||0;X.fine.textContent=(f>0?'+':'')+f;
      const src=cloneSource(d);X.dbl.title=src?'Instant double : charge ici le morceau de la platine '+src.id+', à la même position, au même tempo, boucle comprise':'Instant double : charge d’abord un morceau sur une autre platine';
      const c=countdown(d);
      X.cd.textContent=c?c.label+' '+c.text:'';X.cd.classList.toggle('soon',!!c&&c.beats<=4);
    }
    drawPreview();
    // la sélection change pendant la pré-écoute : on passe au nouveau morceau
    if(PV.on&&ui.sel!=null&&PV.tr&&ui.sel!==PV.tr.id){const t=pvSelected();if(t)pvPlay(t);}
  }
  setInterval(tick,100);

  /* ---------- styles ---------- */
  document.head.append(h('style',{},`
.dk-pro{flex-wrap:wrap;row-gap:3px}
.dk-pro>.b{flex:1 0 auto}
.dk-pro .dp-kf{display:flex;gap:3px;align-items:center;flex:none}
.dk-pro .dp-kf .lbl{margin:0 1px 0 3px}
.dk-pro .dp-fine{min-width:26px;text-align:center;font:600 11px var(--num);color:var(--tx);cursor:pointer}
.dp-cd{flex:none;margin-left:auto;padding-left:4px;font:600 11px var(--num);color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px}
.dp-cd.soon{color:var(--warn)}
.dp-pv{display:flex;align-items:center;gap:6px;min-width:0}
.dp-pvb.on{color:var(--coach);border-color:var(--coach)}
.dp-pvc{width:150px;height:22px;border:1px solid var(--ln2);border-radius:3px;cursor:pointer;background:#07080a}
.dp-pvt{font:500 10px var(--num);color:var(--mu);min-width:72px}
.dp-f{display:grid;gap:4px;margin:0 0 10px;font-size:12px;color:var(--mu)}
.dp-c{display:flex;gap:7px;align-items:center;margin:0 0 10px;font-size:12px;color:var(--tx);cursor:pointer}
.dp-rr{display:flex;gap:8px;align-items:center}
.dp-rng{flex:1;accent-color:var(--coach)}
.dp-v{font:600 11px var(--num);color:var(--white);min-width:52px;text-align:right}
@media (max-width:700px){.dp-pvc{width:96px}.dp-cd{max-width:96px}}
`));

  return{P,DEF,save,clone,cloneSource,setKeySync,keySyncCalc,applyKeySync,setTrackKey,keyEditor,countdown,setLock,locked,
    pvPlay,pvStop,pvToggle,pvSeek,pvPos,get preview(){return PV;},metroOut,metroAn,get clicks(){return clicks;},
    nextFor,setXfCurve,setFilterQ,setBalance,applyFaderCurve,bal,wavHeader,pcm,openSettings,attach,FADER_CURVES,CUE_MODES,REC_FORMATS};
})();
