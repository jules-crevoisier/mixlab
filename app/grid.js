'use strict';
/* =====================================================================
   Mixlab · grille, tempo et annulation
   - Édition fine de la grille : décalage au ms, étirement, grille sur deux
     points, temps fort (downbeat) ici, BPM saisi au clavier.
   - Grille dynamique : une carte de tempo (plusieurs repères de BPM) pour les
     morceaux joués live. Les numéros de temps, la sync, les boucles, le
     quantize et les effets suivent le tempo local. Analyse automatique du
     tempo variable (suivi des temps sur les attaques).
   - Horloge maître interne : un tempo à suivre sans platine en lecture.
   - Annuler (Ctrl+Z) : dernier point de cue, hot cue, changement de grille
     ou chargement de platine.
   La carte de tempo est gardée par morceau (stockage local), comme le verrou
   de grille de deck-pro.js. Rien n'est figé dans app.js : les commandes sont
   posées par une petite boucle de surveillance.
   ===================================================================== */
window.Grid=(()=>{
  const DP=Deck.prototype;
  const locked=t=>!!(t&&window.DeckPro&&DeckPro.locked&&DeckPro.locked(t));
  const r2=v=>Math.round(v*100)/100;

  /* ---------- carte de tempo ----------
     tr.tempoMap={m:[{t,bpm,b}],off} : repères triés par temps ; b = numéro de temps (entier) du repère,
     recalculé par norm() ; off décale la numérotation (temps fort). Entre deux repères, le BPM est
     celui qui fait tomber un nombre entier de temps : un repère est toujours posé sur un temps. */
  const has=tr=>!!(tr&&tr.tempoMap&&tr.tempoMap.m&&tr.tempoMap.m.length>1);
  function norm(tm){
    const m=tm.m.filter(x=>x&&isFinite(x.t)&&x.bpm>0).map(x=>({t:+x.t,bpm:+x.bpm})).sort((a,b)=>a.t-b.t);
    const out=m.length?[m[0]]:[];
    for(let i=1;i<m.length;i++){const p=out[out.length-1];if(m[i].t-p.t<30/p.bpm)continue;out.push(m[i]);}
    if(out.length)out[0].b=0;
    for(let i=0;i<out.length-1;i++){const a=out[i],dt=out[i+1].t-a.t,n=Math.max(1,Math.round(dt*a.bpm/60));a.bpm=60*n/dt;out[i+1].b=a.b+n;}
    tm.m=out;tm.off=Math.round(tm.off||0);return tm;
  }
  function segAt(m,t){if(t<=m[0].t)return 0;let lo=0,hi=m.length-1;while(lo<hi){const k=(lo+hi+1)>>1;if(m[k].t<=t)lo=k;else hi=k-1;}return lo;}
  function segAtBeat(m,b){if(b<=m[0].b)return 0;let lo=0,hi=m.length-1;while(lo<hi){const k=(lo+hi+1)>>1;if(m[k].b<=b)lo=k;else hi=k-1;}return lo;}
  const rawBeat=(tm,t)=>{const s=tm.m[segAt(tm.m,t)];return s.b+(t-s.t)*s.bpm/60;};
  const rawTime=(tm,b)=>{const s=tm.m[segAtBeat(tm.m,b)];return s.t+(b-s.b)*60/s.bpm;};
  // numéro de temps (réel) à l'instant t, et instant du temps b : grille fixe ou carte de tempo
  function beatOf(tr,t){return has(tr)?rawBeat(tr.tempoMap,t)-tr.tempoMap.off:(t-tr.grid)*tr.bpm/60;}
  function timeOf(tr,b){return has(tr)?rawTime(tr.tempoMap,b+tr.tempoMap.off):tr.grid+b*60/tr.bpm;}
  function bpmAt(tr,t){return has(tr)?tr.tempoMap.m[segAt(tr.tempoMap.m,t)].bpm:tr.bpm;}
  /* Les champs historiques (bpm, grid) restent cohérents : BPM moyen, premier temps.
     La bibliothèque, l'export et l'auto-mix les lisent. */
  function syncFields(tr){
    if(!has(tr))return;const m=tr.tempoMap.m,a=m[0],z=m[m.length-1];
    tr.bpm=r2(z.t>a.t?(z.b-a.b)*60/(z.t-a.t):a.bpm);
    let b=Math.ceil(beatOf(tr,0)-1e-6);b-=((b%4)+4)%4;if(timeOf(tr,b)<-.05)b+=4;tr.grid=timeOf(tr,b);
  }
  function setMap(tr,tm){
    if(!tr)return;
    if(!tm||!tm.m||tm.m.length<2){delete tr.tempoMap;saveTrack(tr);return;}
    tr.tempoMap=norm({m:tm.m.map(x=>({t:x.t,bpm:x.bpm})),off:tm.off||0});
    if(tr.tempoMap.m.length<2){const x=tr.tempoMap.m[0];delete tr.tempoMap;if(x){tr.bpm=r2(x.bpm);tr.grid=x.t;}}
    syncFields(tr);tr.ov=null;saveTrack(tr);dirty(tr);
  }

  /* ---------- platines : tout ce qui compte les temps passe par la carte ---------- */
  DP.beatIdx=function(t){return beatOf(this.track,t);};
  DP.timeOfBeat=function(b){return timeOf(this.track,b);};
  DP.baseBpm=function(){const tr=this.track;return tr?(has(tr)?bpmAt(tr,this.position()):tr.bpm):0;};
  Object.defineProperty(DP,'beatLen',{configurable:true,get(){return 60/this.baseBpm();}});
  Object.defineProperty(DP,'bpm',{configurable:true,get(){return this.track?this.baseBpm()*(1+this.pitch):0;}});
  // Sync : le tempo local du morceau (pas son BPM moyen) est calé sur celui de la cible, à chaque image.
  DP.matchTempo=function(quiet){
    const o=this.syncTarget();if(!this.track||!o)return true;
    const base=this.baseBpm();let tb=o.bpm;tb=[tb,tb*2,tb/2].reduce((a,b)=>Math.abs(b-base)<Math.abs(a-base)?b:a);
    const want=tb/base-1;
    if(Math.abs(want)>this.pitchRange){
      const r=[.08,.16,.5].find(x=>x>=Math.abs(want));
      if(r&&!quiet){this.setRange(r);this.onNotice&&this.onNotice('Plage de pitch passée à ±'+r*100+' % pour suivre le tempo');}
    }
    if(Math.abs(want-this.pitch)>1e-6)this.setPitch(want);
    return Math.abs(want)<=this.pitchRange;
  };
  // BPM changé à la main (½, ×2, tap) sur une carte : toute la carte suit, les repères restent en place.
  const o0={setBpm:DP.setBpm,gridHere:DP.gridHere,gridNudge:DP.gridNudge};
  DP.setBpm=function(b){
    const tr=this.track;if(!tr)return;
    if(!has(tr)){o0.setBpm.call(this,b);saveTrack(tr);dirty(tr);return;}
    if(locked(tr))return o0.setBpm.call(this,b);
    const k=clamp(b,40,250)/tr.bpm;tr.tempoMap.m.forEach(x=>{x.bpm*=k;});norm(tr.tempoMap);syncFields(tr);tr.ov=null;saveTrack(tr);dirty(tr);
  };
  DP.gridNudge=function(ms){
    const tr=this.track;if(!tr)return;
    if(!has(tr)||locked(tr)){o0.gridNudge.call(this,ms);saveTrack(tr);dirty(tr);return;}
    tr.tempoMap.m.forEach(x=>{x.t+=ms/1000;});syncFields(tr);saveTrack(tr);dirty(tr);
  };
  // « 1 ici » sur une carte : le temps le plus proche devient le premier d'une phrase (on renumérote, on ne déplace rien).
  DP.gridHere=function(){
    const tr=this.track;if(!tr)return;
    if(!has(tr)||locked(tr)){o0.gridHere.call(this);saveTrack(tr);dirty(tr);return;}
    const b=Math.round(this.beatIdx(this.position()));tr.tempoMap.off+=((b%32)+32)%32;syncFields(tr);saveTrack(tr);dirty(tr);
  };

  /* ---------- horloge maître interne ----------
     Un tempo qui tourne sans platine : les platines en Sync le suivent (tempo et phase). */
  const clock={id:'Horloge',isClock:true,on:false,active:true,playing:true,pitch:0,bend:0,rate:1,reverse:false,sync:false,loop:{on:false},
    _bpm:120,t0:0,b0:0,track:{bpm:120,grid:0,key:null,duration:1e9,hot:[],title:'Horloge'},taps:[],
    get bpm(){return this._bpm;},get beatLen(){return 60/this._bpm;},
    position(){return ctx.currentTime;},positionAt(w){return w;},
    beatIdx(t){return this.b0+(t-this.t0)*this._bpm/60;},timeOfBeat(b){return this.t0+(b-this.b0)*60/this._bpm;},
    beatPos(){return this.beatIdx(ctx.currentTime);},keyNow(){return null;},baseBpm(){return this._bpm;},
    barInfo(){const b=Math.floor(this.beatPos()+1e-4),bar=Math.floor(b/4);return{beat:((b%4)+4)%4,bar,phrase:Math.floor(bar/8),barIn:((bar%8)+8)%8};},
    setBpm(v){v=clamp(+v||120,40,250);this.b0=this.beatPos();this.t0=ctx.currentTime;this._bpm=v;this.track.bpm=v;store.set('grid.clock',{bpm:v});},
    tap(){const now=performance.now();if(this.taps.length&&now-this.taps[this.taps.length-1]>2000)this.taps=[];this.taps.push(now);if(this.taps.length>8)this.taps.shift();
      if(this.taps.length>=4){const iv=(this.taps[this.taps.length-1]-this.taps[0])/(this.taps.length-1)/1000;this.setBpm(Math.round(6000/iv)/100);}},
    setOn(on){this.on=!!on;if(on){this.b0=0;this.t0=ctx.currentTime;}else if(S.master===this)S.master=null;}};
  clock._bpm=clock.track.bpm=clamp(+(store.get('grid.clock',{}).bpm)||120,40,250);
  const st0=DP.syncTarget,ts0=DP.toggleSync;
  DP.syncTarget=function(){return clock.on?clock:st0.call(this);};
  DP.toggleSync=function(){const r=ts0.apply(this,arguments);if(S.master===clock)S.master=null;return r;};

  /* ---------- analyse du tempo variable ----------
     Enveloppe d'attaques (graves + plein spectre, pas de 256 échantillons), puis suivi des temps : chaque
     temps est cherché autour de la prédiction, la période suit lentement. Un repère tous les 8 temps
     (droite ajustée sur ±8 temps), puis on retire les repères inutiles : une carte n'en garde que là où
     le tempo bouge vraiment (écart au trait < 4 ms). */
  const ONSET_OFS=.0067;
  function onsetEnv(buf){
    const sr=buf.sampleRate,n=buf.length,L=buf.getChannelData(0),R=buf.numberOfChannels>1?buf.getChannelData(1):L,H=256,nO=Math.floor(n/H);
    const aL=Math.exp(-2*Math.PI*200/sr);let lo=0;const eL=new Float32Array(nO),eA=new Float32Array(nO);
    for(let i=0,N=nO*H;i<N;i++){const x=(L[i]+R[i])*.5;lo=aL*lo+(1-aL)*x;const o=(i/H)|0;eL[o]+=lo*lo;eA[o]+=x*x;}
    const c=new Float32Array(nO),on=new Float32Array(nO);
    for(let i=0;i<nO;i++)c[i]=Math.log(1+100*(Math.sqrt(eL[i]/H)+.4*Math.sqrt(eA[i]/H)));
    for(let i=1;i<nO;i++){const d=c[i]-c[i-1];on[i]=d>0?d:0;}
    return{on,fps:sr/H};
  }
  function trackBeats(tr){
    const{on,fps}=onsetEnv(tr.buffer),N=on.length;if(N<64)return null;
    let mx=0;for(let i=0;i<N;i++)if(on[i]>mx)mx=on[i];const thr=mx*.1;
    const peak=(c,w)=>{let best=-1,bi=-1;const a=Math.max(1,Math.floor(c-w)),z=Math.min(N-2,Math.ceil(c+w));
      for(let i=a;i<=z;i++){const u=(i-c)/(w*.6),v=on[i]*Math.exp(-.5*u*u);if(v>best){best=v;bi=i;}}
      if(bi<0||on[bi]<thr)return null;const y0=on[bi-1],y1=on[bi],y2=on[bi+1],den=y0-2*y1+y2;return bi+(den<0?clamp(.5*(y0-y2)/den,-.5,.5):0);};
    const P0=60/tr.bpm*fps;let P=P0;
    // premier temps de la grille fixe qui tombe sur une attaque
    let b=Math.ceil(beatOf(tr,0)),c=null;
    for(let k=0;k<64&&c==null;k++,b++){const p=timeOf(tr,b)*fps;if(p>=N-2)break;c=peak(p,P*.25);}
    if(c==null)return null;
    const beats=[c];
    for(;;){
      const pred=c+P;if(pred>=N-2)break;
      const pk=peak(pred,P*.12);
      if(pk!=null)P=clamp(.8*P+.2*(pk-c),P0*.85,P0*1.15);
      c=pk!=null?pk:pred;beats.push(c);
    }
    return{b0:b-1,times:beats.map(f=>f/fps+ONSET_OFS)};
  }
  function fitAt(T,j,K){
    const a=Math.max(0,j-K),z=Math.min(T.length-1,j+K);let n=0,sx=0,sy=0,sxx=0,sxy=0;
    for(let i=a;i<=z;i++){n++;sx+=i;sy+=T[i];sxx+=i*i;sxy+=i*T[i];}
    const s=(n*sxy-sx*sy)/Math.max(1e-9,n*sxx-sx*sx),o=(sy-s*sx)/n;return o+s*j;
  }
  function detect(tr,tol=.004){
    if(!tr||!tr.buffer)return null;
    const bt=trackBeats(tr);if(!bt||bt.times.length<16)return null;
    const T=bt.times,K=8,pts=[];
    for(let j=0;j<T.length;j+=K)pts.push({i:j,t:fitAt(T,j,K)});
    if(pts[pts.length-1].i!==T.length-1)pts.push({i:T.length-1,t:fitAt(T,T.length-1,K)});
    // on garde un repère seulement s'il est utile : chaque point d'origine reste à moins de tol du trait
    const keep=pts.slice();
    const okWithout=(k)=>{const a=keep[k-1],z=keep[k+1];for(const p of pts){if(p.i<=a.i||p.i>=z.i)continue;const pr=a.t+(z.t-a.t)*(p.i-a.i)/(z.i-a.i);if(Math.abs(pr-p.t)>tol)return false;}return true;};
    for(let ch=true;ch;){ch=false;let best=-1,be=1e9;
      for(let k=1;k<keep.length-1;k++){if(!okWithout(k))continue;const a=keep[k-1],x=keep[k],z=keep[k+1],e=Math.abs(a.t+(z.t-a.t)*(x.i-a.i)/(z.i-a.i)-x.t);if(e<be){be=e;best=k;}}
      if(best>0){keep.splice(best,1);ch=true;}}
    const m=keep.map((p,k)=>({t:p.t,bpm:k<keep.length-1?60*(keep[k+1].i-p.i)/(keep[k+1].t-p.t):0}));
    m[m.length-1].bpm=m.length>1?m[m.length-2].bpm:tr.bpm;
    // numérotation : le premier temps suivi garde son numéro dans l'ancienne grille
    if(m.length<=2){const bpm=60*(keep[keep.length-1].i-keep[0].i)/(keep[keep.length-1].t-keep[0].t);return{kind:'const',bpm,t0:keep[0].t,b0:bt.b0};}
    return{kind:'map',tm:{m,off:-bt.b0},beats:T.length};
  }

  /* ---------- édition (avec annulation) ---------- */
  function dirty(tr){
    if(!tr)return;tr.ov=null;
    for(const d of decks)if(d.track===tr&&d.ui){for(const k of['lane','dw','ov','plat'])if(d.ui[k])d.ui[k]._sig='';}
  }
  function edit(d,label,fn){
    const tr=d&&d.track;if(!tr){toast('Charge d’abord un morceau sur la platine '+(d?d.id:''));return false;}
    if(locked(tr)){toast('Grille verrouillée sur la platine '+d.id+' : déverrouille-la (bouton Verrou) pour la modifier');return false;}
    const s=Undo.snap(tr),r=fn(tr);if(r===false)return false;
    if(tr.tempoMap){if(tr.tempoMap.m&&tr.tempoMap.m.length>1)norm(tr.tempoMap);if(!has(tr)){const x=tr.tempoMap.m&&tr.tempoMap.m[0];delete tr.tempoMap;if(x&&r!=='keep'){tr.bpm=r2(x.bpm);}}else syncFields(tr);}
    tr.ov=null;saveTrack(tr);dirty(tr);Undo.push({kind:'track',tr,s,label});return true;
  }
  const near=(d)=>{const tr=d.track,b=Math.round(d.beatIdx(d.position()));return{b,t:timeOf(tr,b)};};
  function nudge(d,ms){return edit(d,'décalage de la grille',tr=>{if(has(tr))tr.tempoMap.m.forEach(x=>{x.t+=ms/1000;});else tr.grid+=ms/1000;});}
  /* Étirer : le premier temps (ou le repère d'avant sur une carte) reste en place, le BPM change, les temps
     suivants s'écartent ou se resserrent. Sur un segment entre deux repères, les repères suivants glissent ensemble. */
  function stretch(d,db){
    return edit(d,'étirement de la grille',tr=>{
      if(!has(tr)){tr.bpm=clamp(Math.round((tr.bpm+db)*1e4)/1e4,40,250);return;}
      const m=tr.tempoMap.m,k=segAt(m,d.position());
      if(k===m.length-1){m[k].bpm=clamp(m[k].bpm+db,40,250);return;}
      const n=m[k+1].b-m[k].b,dt=m[k].t+n*60/clamp(m[k].bpm+db,40,250)-m[k+1].t;for(let i=k+1;i<m.length;i++)m[i].t+=dt;
    });
  }
  function setBpmExact(d,v){
    v=+String(v).replace(',','.');if(!(v>=40&&v<=250)){toast('BPM entre 40 et 250');return false;}
    return edit(d,'BPM',tr=>{if(!has(tr)){tr.bpm=v;return;}const k=v/tr.bpm;tr.tempoMap.m.forEach(x=>{x.bpm*=k;});});
  }
  // Temps fort : le temps le plus proche devient le 1 d'une mesure (la grille ne bouge pas, la numérotation si).
  function downbeat(d){
    const tr=d.track;if(!tr)return false;const{b}=near(d),k=((b%4)+4)%4;
    if(!k){toast('Ce temps est déjà le premier de sa mesure');return false;}
    return edit(d,'temps fort',tr=>{if(has(tr))tr.tempoMap.off+=k;else tr.grid+=k*60/tr.bpm;});
  }
  /* Grille sur deux points : A et B posés sur deux temps (loin l'un de l'autre), le BPM est celui qui
     fait tomber un nombre entier de temps entre eux ; A reste un temps de la grille. */
  function pointA(d){if(!d.track)return false;d._gpA=d.position();return true;}
  function pointB(d){
    const tr=d.track,a=d._gpA;if(!tr||a==null){toast('Pose d’abord le point A sur un temps');return false;}
    const bz=d.position(),dt=bz-a,bl=60/bpmAt(tr,a);
    if(Math.abs(dt)<2*bl){toast('Points trop proches : éloigne B de A de plusieurs mesures');return false;}
    const t1=Math.min(a,bz),t2=Math.max(a,bz),n=Math.max(1,Math.round((t2-t1)/bl)),bpm=60*n/(t2-t1);
    const ok=edit(d,'grille sur deux points',tr=>{
      if(has(tr)){insertMarker(tr,t1);insertMarker(tr,t2);return;}
      const bA=Math.round(beatOf(tr,t1));tr.bpm=Math.round(bpm*1e4)/1e4;tr.grid=t1-bA*60/tr.bpm;
    });
    if(ok)d._gpA=null;return ok?{n,bpm}:false;
  }
  // Ajoute un repère à l'instant t (posé sur un temps) en gardant la numérotation des temps.
  function insertMarker(tr,t){
    const old=Math.round(beatOf(tr,t));
    if(!has(tr))tr.tempoMap={m:[{t:tr.grid,bpm:tr.bpm}],off:0};
    const tm=tr.tempoMap,i=tm.m.findIndex(x=>Math.abs(x.t-t)<15/bpmAt(tr,t));
    if(i>=0)tm.m[i].t=t;else tm.m.push({t,bpm:bpmAt(tr,t)});
    norm(tm);if(tm.m.length>1)tm.off+=Math.round(rawBeat(tm,t))-tm.off-old;
  }
  function addMarker(d){return edit(d,'repère de tempo',tr=>insertMarker(tr,d.position()));}
  function removeMarker(d){
    const tr=d.track;if(!has(tr)){toast('Pas de repère : la grille de ce morceau est fixe');return false;}
    const p=d.position(),m=tr.tempoMap.m;let k=-1,bd=1e9;m.forEach((x,i)=>{const e=Math.abs(x.t-p);if(e<bd){bd=e;k=i;}});
    if(bd>2*60/bpmAt(tr,p)){toast('Aucun repère tout près : place la tête de lecture sur le repère à retirer');return false;}
    return edit(d,'repère retiré',tr=>{
      const ref=m[k===0?1:0].t,old=Math.round(beatOf(tr,ref));m.splice(k,1);
      if(m.length<2){const x=m[0];tr.bpm=r2(x.bpm);const bx=old;tr.grid=x.t-bx*60/x.bpm;delete tr.tempoMap;return;}
      norm(tr.tempoMap);tr.tempoMap.off+=Math.round(rawBeat(tr.tempoMap,ref))-tr.tempoMap.off-old;
    });
  }
  // Grille fixe : on garde le BPM moyen, le temps sous la tête de lecture reste en place.
  function flatten(d){
    const tr=d.track;if(!has(tr))return false;
    return edit(d,'grille fixe',tr=>{const{b,t}=near(d),bpm=tr.bpm;delete tr.tempoMap;tr.bpm=bpm;tr.grid=t-b*60/bpm;});
  }
  function analyzeTempo(d){
    const tr=d&&d.track;if(!tr||!tr.buffer){toast('Charge d’abord un morceau');return null;}
    const res=detect(tr);if(!res){toast('Pas assez d’attaques nettes pour suivre le tempo de ce morceau');return null;}
    const ok=edit(d,'grille dynamique',tr=>{
      if(res.kind==='const'){delete tr.tempoMap;tr.bpm=Math.round(res.bpm*100)/100;const g=res.t0-res.b0*60/tr.bpm;tr.grid=g;return;}
      tr.tempoMap={m:res.tm.m.map(x=>({...x})),off:res.tm.off};
    });
    if(!ok)return null;
    if(res.kind==='const')toast('Tempo stable : grille fixe à '+tr.bpm.toFixed(2)+' BPM','ok');
    else{const bs=tr.tempoMap.m.map(x=>x.bpm);toast('Grille dynamique : '+tr.tempoMap.m.length+' repères, de '+Math.min(...bs).toFixed(1)+' à '+Math.max(...bs).toFixed(1)+' BPM','ok');}
    return res;
  }

  /* ---------- mémoire par morceau ---------- */
  const TS=store.get('grid.tracks',{});
  const tkey=t=>t.path||t._bk||('m:'+(t.artist||'')+'|'+t.title);
  function saveTrack(tr){
    if(!tr)return;const k=tkey(tr);
    if(has(tr))TS[k]={tm:{m:tr.tempoMap.m.map(x=>({t:+x.t.toFixed(5),bpm:+x.bpm.toFixed(5)})),off:tr.tempoMap.off}};
    else if(TS[k])delete TS[k];else return;
    store.set('grid.tracks',TS);
  }
  function restore(tr){const r=TS[tkey(tr)];if(r&&r.tm&&!tr.tempoMap){tr.tempoMap=norm({m:r.tm.m.map(x=>({...x})),off:r.tm.off});if(tr.tempoMap.m.length<2)delete tr.tempoMap;else syncFields(tr);}}
  const add0=window.addTrack;
  window.addTrack=function(buffer,meta){const t=add0(buffer,meta);try{restore(t);}catch(e){}return t;};

  /* ---------- annulation ---------- */
  const Undo=(()=>{
    const U={stack:[],max:60,busy:false,depth:0};
    const snap=tr=>({cue:tr.cue,hot:(tr.hot||[]).slice(),hotMeta:(tr.hotMeta||[]).map(x=>x?{...x}:null),bpm:tr.bpm,grid:tr.grid,
      tm:tr.tempoMap?{m:tr.tempoMap.m.map(x=>({t:x.t,bpm:x.bpm})),off:tr.tempoMap.off}:null,
      mem:(tr.memCues||[]).filter(m=>!m.type).map(m=>({...m})),loops:(tr.loops||[]).map(l=>({...l}))});
    const sig=s=>JSON.stringify(s);
    function label(a,b){
      if(a.bpm!==b.bpm||a.grid!==b.grid||sig(a.tm)!==sig(b.tm))return'grille';
      if(sig(a.hot)!==sig(b.hot)||sig(a.hotMeta)!==sig(b.hotMeta))return'hot cue';
      if(a.cue!==b.cue)return'point de cue';
      if(sig(a.mem)!==sig(b.mem))return'cue mémoire';
      return'boucle gardée';
    }
    function push(e){if(U.busy)return;U.stack.push(e);if(U.stack.length>U.max)U.stack.shift();}
    function restoreT(tr,s){
      tr.cue=s.cue;tr.hot=s.hot.slice();tr.hotMeta=s.hotMeta.map(x=>x?{...x}:null);tr.bpm=s.bpm;tr.grid=s.grid;
      if(s.tm)tr.tempoMap=norm({m:s.tm.m.map(x=>({...x})),off:s.tm.off});else delete tr.tempoMap;
      tr.memCues=(tr.memCues||[]).filter(m=>m.type).concat(s.mem.map(m=>({...m}))).sort((a,b)=>a.t-b.t);tr.loops=s.loops.map(l=>({...l}));
      tr.ov=null;saveTrack(tr);dirty(tr);
      decks.forEach(d=>{if(d.track===tr&&d.ui&&d.ui.pads&&typeof renderPads==='function')renderPads(d);});
      window.LibPro&&LibPro.saveBrowser&&setTimeout(()=>LibPro.saveBrowser(),0);
    }
    function undo(){
      const e=U.stack.pop();if(!e){toast('Rien à annuler');return null;}
      U.busy=true;
      try{
        if(e.kind==='track'){restoreT(e.tr,e.s);toast('Annulé : '+e.label+' de « '+e.tr.title+' »','ok');}
        else if(e.kind==='load'){
          const d=e.deck;
          if(d.playing&&audible(d)){U.stack.push(e);toast('La platine '+d.id+' est à l’antenne : rien n’est rechargé');return null;}
          if(!LIB.tracks.includes(e.prev)){toast('Ce morceau n’est plus dans la bibliothèque');return null;}
          d.load(e.prev);d.seek(e.pos);toast('Annulé : « '+e.prev.title+' » revient sur la platine '+d.id,'ok');
        }
      }finally{U.busy=false;}
      if(typeof renderTable==='function')renderTable();
      return e;
    }
    // Les commandes qui posent un cue, un hot cue ou touchent la grille sont enregistrées si elles changent quelque chose.
    for(const k of['cueDown','cueUp','hotDown','togglePlay','cuePlay','setBpm','gridNudge','gridHere','tap']){
      const f=DP[k];if(typeof f!=='function')continue;
      DP[k]=function(...a){
        const tr=this.track;if(!tr||U.busy||U.depth)return f.apply(this,a);
        const s=snap(tr),j=sig(s);U.depth++;let r;try{r=f.apply(this,a);}finally{U.depth--;}
        if(this.track===tr){const s2=snap(tr);if(sig(s2)!==j)push({kind:'track',tr,s,label:label(s,s2)});}
        return r;
      };
    }
    const ld=DP.load;
    DP.load=function(tr){
      const prev=this.track,pos=prev?this.position():0,r=ld.apply(this,arguments);
      if(prev&&prev!==tr&&!U.busy)push({kind:'load',deck:this,prev,pos,label:'chargement'});
      return r;
    };
    document.addEventListener('keydown',e=>{
      if(!(e.ctrlKey||e.metaKey)||e.altKey||e.shiftKey||e.key.toLowerCase()!=='z')return;
      if(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]'))return;
      e.preventDefault();undo();
    });
    return{snap,push,undo,get size(){return U.stack.length;},get last(){return U.stack[U.stack.length-1]||null;},clear(){U.stack.length=0;}};
  })();

  /* ---------- interface : éditeur de grille par platine ---------- */
  const P={step:store.get('grid.step',10)};
  let pop=null;
  function closePop(){if(pop){pop.el.remove();pop=null;}}
  function openPop(d,anchor){
    if(pop&&pop.d===d){closePop();return;}closePop();
    const info=h('div',{class:'gx-info'}),bpmIn=h('input',{class:'in gx-bpm',type:'text',inputmode:'decimal','aria-label':'BPM du morceau'});
    bpmIn.addEventListener('keydown',e=>{if(e.key==='Enter'){setBpmExact(d,bpmIn.value);bpmIn.blur();}});
    bpmIn.addEventListener('change',()=>setBpmExact(d,bpmIn.value));
    const stepSel=h('select',{class:'sel','aria-label':'Pas du décalage'},[1,2,5,10,20].map(v=>h('option',{value:v},v+' ms')));stepSel.value=String(P.step);
    stepSel.addEventListener('change',()=>{P.step=+stepSel.value;store.set('grid.step',P.step);});
    const B=(txt,title,fn,cls)=>h('button',{type:'button',class:'b'+(cls?' '+cls:''),title,onclick:()=>{fn();draw();}},txt);
    const ptA=B('Point A','Pose le point A sur un temps (à l’arrêt, cale-toi sur une attaque)',()=>{if(pointA(d))toast('Point A posé : avance de quelques mesures, cale-toi sur un temps, puis Point B');});
    const ptB=B('Point B','Pose le point B sur un autre temps : le BPM est recalculé entre A et B',()=>{const r=pointB(d);if(r)toast('Grille sur deux points : '+r.n+' temps, '+r.bpm.toFixed(3)+' BPM','ok');});
    const el=h('div',{class:'gx-pop',role:'dialog','aria-label':'Grille de la platine '+d.id},
      h('div',{class:'gx-h'},h('b',{},'Grille · platine '+d.id),h('button',{type:'button',class:'b',onclick:closePop,'aria-label':'Fermer'},'×')),
      info,
      h('div',{class:'gx-r'},h('span',{class:'lbl'},'BPM'),bpmIn,
        B('−0,1','Étirer : BPM moins 0,1 (le premier temps reste en place)',()=>stretch(d,-.1)),B('−0,01','Étirer : BPM moins 0,01',()=>stretch(d,-.01)),
        B('+0,01','Étirer : BPM plus 0,01',()=>stretch(d,.01)),B('+0,1','Étirer : BPM plus 0,1',()=>stretch(d,.1))),
      h('div',{class:'gx-r'},h('span',{class:'lbl'},'Décaler'),B('◁','Décaler toute la grille plus tôt',()=>nudge(d,-P.step)),stepSel,B('▷','Décaler toute la grille plus tard',()=>nudge(d,P.step)),
        B('Temps fort ici','Le temps le plus proche devient le premier de sa mesure',()=>downbeat(d)),B('1 ici','La position actuelle devient le premier temps d’une phrase',()=>d.gridHere())),
      h('div',{class:'gx-r'},h('span',{class:'lbl'},'Deux points'),ptA,ptB),
      h('div',{class:'gx-r'},h('span',{class:'lbl'},'Dynamique'),
        B('Analyser le tempo','Suit les temps sur tout le morceau et pose des repères là où le tempo bouge (morceaux joués live)',()=>analyzeTempo(d)),
        B('Repère ici','Ajoute un repère de tempo sur le temps sous la tête de lecture',()=>addMarker(d)),
        B('Retirer','Retire le repère le plus proche de la tête de lecture',()=>removeMarker(d)),
        B('Grille fixe','Remplace la carte de tempo par une grille fixe au BPM moyen',()=>flatten(d))),
      h('div',{class:'gx-r gx-ft'},B('Annuler','Annule la dernière action (Ctrl+Z)',()=>Undo.undo())));
    function draw(){
      const tr=d.track;
      if(document.activeElement!==bpmIn)bpmIn.value=tr?(has(tr)?bpmAt(tr,d.position()):tr.bpm).toFixed(3):'';
      if(!tr){info.textContent='Aucun morceau chargé.';return;}
      const bi=d.barInfo(),pos=bi&&!bi.pre?'mesure '+(bi.bar+1)+', temps '+(bi.beat+1):'avant le premier temps';
      info.textContent=(has(tr)?'Carte de tempo : '+tr.tempoMap.m.length+' repères · BPM moyen '+tr.bpm.toFixed(2):'Grille fixe · '+tr.bpm.toFixed(2)+' BPM')+' · '+pos+(d._gpA!=null?' · point A à '+fmtTime(d._gpA):'')+(locked(tr)?' · verrouillée':'');
      ptB.disabled=d._gpA==null;
    }
    document.body.append(el);
    const r=anchor.getBoundingClientRect(),z=window.View&&View.zoom||1,W=el.offsetWidth,H=el.offsetHeight;
    el.style.left=Math.max(6,Math.min(innerWidth-W-6,r.left/z))+'px';el.style.top=(r.top/z-H-6>6?r.top/z-H-6:Math.min(innerHeight-H-6,r.bottom/z+6))+'px';
    pop={el,d,draw};draw();
  }
  document.addEventListener('pointerdown',e=>{if(pop&&!pop.el.contains(e.target)&&!e.target.closest('.gx-open'))closePop();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closePop();});

  /* ---------- horloge : bouton de la barre du haut ---------- */
  let cpop=null;
  function clockPop(btn){
    if(cpop){cpop.remove();cpop=null;return;}
    const bpm=h('input',{class:'in gx-bpm',type:'text',inputmode:'decimal','aria-label':'Tempo de l’horloge',value:clock.bpm.toFixed(2)});
    const set=v=>{clock.setBpm(v);bpm.value=clock.bpm.toFixed(2);};
    bpm.addEventListener('change',()=>set(+bpm.value.replace(',','.')));
    const on=h('input',{type:'checkbox'});on.checked=clock.on;on.addEventListener('change',()=>{clock.setOn(on.checked);});
    const ref=()=>{const r=refDeck();if(!r||!r.track){toast('Aucune platine maître');return;}set(r.bpm);};
    cpop=h('div',{class:'gx-pop gx-clk',role:'dialog','aria-label':'Horloge maître'},
      h('div',{class:'gx-h'},h('b',{},'Horloge maître'),h('button',{type:'button',class:'b',onclick:()=>{cpop.remove();cpop=null;},'aria-label':'Fermer'},'×')),
      h('p',{class:'gx-info'},'Un tempo qui tourne sans platine : les platines en Sync le suivent, tempo et phase.'),
      h('label',{class:'gx-r'},on,'Les platines en Sync suivent l’horloge'),
      h('div',{class:'gx-r'},h('span',{class:'lbl'},'BPM'),bpm,
        h('button',{type:'button',class:'b',onclick:()=>set(clock.bpm-.1)},'−0,1'),h('button',{type:'button',class:'b',onclick:()=>set(clock.bpm+.1)},'+0,1'),
        h('button',{type:'button',class:'b',title:'Tape le tempo (4 fois ou plus)',onclick:()=>{clock.tap();bpm.value=clock.bpm.toFixed(2);}},'Tap'),
        h('button',{type:'button',class:'b',title:'Prendre le tempo de la platine maître',onclick:ref},'Maître')));
    document.body.append(cpop);
    const r=btn.getBoundingClientRect(),z=window.View&&View.zoom||1;cpop.style.left=Math.max(6,Math.min(innerWidth-cpop.offsetWidth-6,r.left/z))+'px';cpop.style.top=(r.bottom/z+6)+'px';
  }
  document.addEventListener('pointerdown',e=>{if(cpop&&!cpop.contains(e.target)&&!e.target.closest('#clk-btn')){cpop.remove();cpop=null;}},true);

  /* ---------- pose des commandes (et reprise si l'interface est reconstruite) ---------- */
  function attach(){
    for(const d of decks){
      const P0=$('#p-deck'+d.id),row=P0&&$('.dk-grid',P0);if(!row||$('.gx-open',row))continue;
      row.append(h('button',{class:'b gx-open',type:'button',title:'Éditeur de grille : décalage au ms, étirement, deux points, temps fort, grille dynamique',onclick:e=>openPop(d,e.currentTarget)},'Grille…'));
    }
    const top=$('#top');
    if(top&&!$('#clk-btn')){
      const b=h('button',{class:'tb',id:'clk-btn',type:'button',title:'Horloge maître : un tempo à suivre sans platine en lecture',onclick:e=>clockPop(e.currentTarget)},'Horloge');
      const ref=$('#rec-btn',top);if(ref)ref.before(b);else top.append(b);
    }
  }
  // repères de tempo sur la waveform défilante
  function hookLane(){
    const St=window.Structure;if(!St||St._gx)return;St._gx=1;
    const f=St.drawLane;
    St.drawLane=function(g,d,t0,pps,W,H,dpr){
      const r=f.apply(this,arguments),tr=d.track;
      if(has(tr)){g.font=`600 ${10*dpr}px "JetBrains Mono",monospace`;
        for(const x of tr.tempoMap.m){const px=(x.t-t0)*pps;if(px<-60*dpr||px>W)continue;g.fillStyle=rgba(TK['state-warn'],.85);g.fillRect(px-dpr*.5,0,dpr,H*.5);
          const s=x.bpm.toFixed(1),w=g.measureText(s).width+6*dpr;g.fillStyle=rgba(TK['surface-0'],.8);g.fillRect(px,H*.5-12*dpr,w,12*dpr);g.fillStyle=TK['state-warn'];g.fillText(s,px+3*dpr,H*.5-3*dpr);}}
      if(d._gpA!=null){const px=(d._gpA-t0)*pps;g.fillStyle=TK['state-warn'];g.fillRect(px-dpr,0,2*dpr,H);}
      return r;
    };
  }
  let lastAttach=0;
  setInterval(()=>{
    const now=performance.now();
    if(now-lastAttach>600){lastAttach=now;attach();hookLane();}
    const b=$('#clk-btn');if(b){const t=clock.on?'Horloge '+clock.bpm.toFixed(1):'Horloge';if(b.textContent!==t)b.textContent=t;b.classList.toggle('on',clock.on);b.setAttribute('aria-pressed',String(clock.on));}
    if(pop)pop.draw();
  },150);

  document.head.append(h('style',{},`
.gx-pop{position:fixed;z-index:62;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r-2);padding:8px 10px;display:grid;gap:6px;box-shadow:0 16px 40px rgba(0,0,0,.6);max-width:min(520px,calc(100vw - 12px));font:400 var(--fs-2) var(--ui);color:var(--text-mid)}
.gx-pop .gx-h{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--text-hi)}
.gx-pop .gx-info{margin:0;font-size:var(--fs-1);color:var(--text-lo)}
.gx-pop .gx-r{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.gx-pop .gx-r .lbl{min-width:74px}
.gx-pop .gx-bpm{width:80px;font-family:var(--num)}
.gx-pop .gx-ft{justify-content:flex-end}
.gx-pop .b:disabled{opacity:.4}
#clk-btn.on{color:var(--text-hi);border-color:var(--state-warn)}
`));

  window.MixlabSettings=(window.MixlabSettings||[]).concat([
    {tab:'Platines',key:'grid.step',label:'Pas du décalage de grille',type:'select',options:[[1,'1 ms'],[2,'2 ms'],[5,'5 ms'],[10,'10 ms'],[20,'20 ms']],get:()=>P.step,set:v=>{P.step=+v;store.set('grid.step',P.step);}},
    {tab:'Platines',key:'grid.clockBpm',label:'Tempo de l’horloge maître',type:'number',get:()=>clock.bpm,set:v=>clock.setBpm(+v)},
  ]);

  return{has,norm,beatOf,timeOf,bpmAt,setMap,detect,trackBeats,syncFields,
    nudge,stretch,setBpmExact,downbeat,pointA,pointB,addMarker,removeMarker,flatten,analyzeTempo,insertMarker,
    clock,Undo,undo:()=>Undo.undo(),open:openPop,dirty,saveTrack};
})();
