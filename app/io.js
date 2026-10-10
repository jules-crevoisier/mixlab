'use strict';
/* =====================================================================
   Mixlab · entrées, sorties et mastering
   - Latence : taille du buffer (latencyHint) et fréquence choisies au démarrage,
     affichage honnête de ce que le navigateur a vraiment donné, mesure en boucle
     (clic envoyé, clic revenu par le micro ou un câble), son et clic de test.
   - Entrées : platines d'entrée (ligne ou micro dans une voie, avec EQ et fader),
     voie micro avec talkover (la musique baisse quand on parle), enregistrement
     du micro ou d'une entrée.
   - Sorties : booth avec son volume, sorties séparées par platine (mixer externe),
     sur une autre carte son (setSinkId) ou sur les canaux 3-4, 5-6… d'une carte
     multicanal.
   - Mixer : EQ 4 bandes en option, maximiseur de sortie (3 bandes compressées,
     limiteur, plafond jamais dépassé), effet de crossfader.
   - Cue sheet (.cue) et tracklist texte horodatées avec chaque enregistrement.
   Chargé AVANT engine.js : le contexte audio est créé avec les réglages gardés.
   ===================================================================== */
(()=>{
  let o=null;try{o=JSON.parse(localStorage.getItem('mixlab2.ioCtx')||'null');}catch(e){}
  const opt={latencyHint:'interactive'};
  if(o&&o.hint){const n=parseFloat(o.hint);opt.latencyHint=isFinite(n)?n/1000:o.hint;}
  if(o&&+o.sr)opt.sampleRate=+o.sr;
  window.MixlabCtxOpts=opt;window.MixlabCtxStart={hint:(o&&o.hint)||'interactive',sr:(o&&+o.sr)||0};
})();

window.IO=(()=>{
  const DEF={hint:'interactive',sr:0,booth:{vol:.8,target:''},outs:{A:'',B:'',C:'',D:''},extCut:true,
    max:{on:false,ceiling:-1,drive:3},mic:{vol:.8,talk:'auto',depth:12,thr:-45,dev:''},xfx:{type:'off',depth:.8}};
  const rd=(k,d)=>{try{const v=localStorage.getItem('mixlab2.'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}};
  const Q=(()=>{const s=rd('io',{}),c=rd('ioCtx',{})||{};return{...DEF,...s,booth:{...DEF.booth,...s.booth},outs:{...DEF.outs,...s.outs},max:{...DEF.max,...s.max},mic:{...DEF.mic,...s.mic},xfx:{...DEF.xfx,...s.xfx},hint:c.hint||DEF.hint,sr:+c.sr||0};})();
  const save=()=>{try{const{hint,sr,...rest}=Q;localStorage.setItem('mixlab2.io',JSON.stringify(rest));localStorage.setItem('mixlab2.ioCtx',JSON.stringify({hint,sr}));}catch(e){}};
  const N={ok:false},M={src:null,stream:null,on:false,ducked:false,last:-1e9};
  const g=v=>{const n=ctx.createGain();n.gain.value=v==null?1:v;return n;};
  const an=()=>{const a=ctx.createAnalyser();a.fftSize=2048;return a;};
  const T=(p,v,tc=.02)=>p.setTargetAtTime(v,ctx.currentTime,tc);
  const db=v=>20*Math.log10(Math.max(1e-9,v));
  function rmsOf(a){const b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);let s=0;for(const v of b)s+=v*v;return Math.sqrt(s/b.length);}

  /* ---------- graphe : talkover, micro, booth, maximiseur, sorties par platine ----------
     fin de la chaîne d'effets du master → duck (talkover) → volume master → maximiseur → limiteur
                                         └→ booth (son volume, son limiteur)
     micro → passe-haut → volume → on/off → volume master et booth (le micro n'est pas baissé par le talkover) */
  function graph(){
    if(N.ok)return;N.ok=true;
    N.duck=g();N.music=an();N.duck.connect(N.music);
    const inst=typeof FXU!=='undefined'&&FXU.length&&FXU[FXU.length-1].inst.M,end=inst?inst[inst.length-1].out:null;
    if(end){try{end.disconnect(bus.vol);}catch(e){}end.connect(N.duck);}else{try{bus.sum.disconnect(bus.vol);}catch(e){}bus.sum.connect(N.duck);}
    N.duck.connect(bus.vol);
    // micro
    N.micIn=g();N.micHp=bq('highpass',90,.7);N.micVol=g(Q.mic.vol);N.micOn=g(0);N.micAn=an();
    N.micIn.connect(N.micHp);N.micHp.connect(N.micVol);N.micVol.connect(N.micOn);N.micOn.connect(N.micAn);N.micOn.connect(bus.vol);
    // booth : copie du mix avant le volume master
    N.boothIn=g();N.boothVol=g(Q.booth.vol);N.boothLim=ctx.createDynamicsCompressor();
    N.boothLim.threshold.value=-1;N.boothLim.knee.value=0;N.boothLim.ratio.value=20;N.boothLim.attack.value=.002;N.boothLim.release.value=.12;
    N.boothOut=g();N.boothAn=an();
    N.duck.connect(N.boothIn);N.micOn.connect(N.boothIn);N.boothIn.connect(N.boothVol);N.boothVol.connect(N.boothLim);N.boothLim.connect(N.boothOut);N.boothOut.connect(N.boothAn);
    // maximiseur
    buildMax();
    // sorties par platine : après le gain, avant l'EQ et le fader (comme une sortie de platine vers une table)
    N.tap={};decks.forEach(d=>{const t=g();d.trim.connect(t);N.tap[d.id]=t;});
    setInterval(follow,20);
  }

  /* ---------- maximiseur : 3 bandes compressées, limiteur, écrêteur doux au plafond ----------
     Le dernier étage est une courbe fixe : rien ne sort au-dessus du plafond, quelle que soit l'entrée.
     Quand il est actif, le limiteur d'origine du master est mis en position neutre (ratio 1). */
  function clipCurve(ceil){
    const c=dbToGain(ceil),k=.85*c,n=8193,cv=new Float32Array(n);
    for(let i=0;i<n;i++){const x=i/(n-1)*2-1,a=Math.abs(x),y=a<=k?a:k+(c-k)*Math.tanh((a-k)/(c-k));cv[i]=Math.sign(x)*Math.min(y,c);}
    return cv;
  }
  function buildMax(){
    try{bus.vol.disconnect(bus.lim);}catch(e){}
    N.maxIn=g();N.maxDry=g(1);N.maxWet=g(0);bus.vol.connect(N.maxIn);N.maxIn.connect(N.maxDry);N.maxDry.connect(bus.lim);
    N.drive=g(1);N.maxIn.connect(N.drive);
    const xo=(type,f)=>{const a=bq(type,f,.7071),b=bq(type,f,.7071);a.connect(b);return[a,b];};
    const comp=(th,att,rel)=>{const c=ctx.createDynamicsCompressor();c.threshold.value=th;c.ratio.value=2.5;c.knee.value=8;c.attack.value=att;c.release.value=rel;return c;};
    const sum=g();
    const lo=xo('lowpass',200),m1=xo('highpass',200),m2=xo('lowpass',4000),hi=xo('highpass',4000);
    N.bands=[comp(-20,.012,.25),comp(-18,.006,.15),comp(-16,.003,.1)];
    N.drive.connect(lo[0]);lo[1].connect(N.bands[0]);
    N.drive.connect(m1[0]);m1[1].connect(m2[0]);m2[1].connect(N.bands[1]);
    N.drive.connect(hi[0]);hi[1].connect(N.bands[2]);
    N.bands.forEach(b=>b.connect(sum));
    N.glue=ctx.createDynamicsCompressor();N.glue.knee.value=0;N.glue.ratio.value=20;N.glue.attack.value=.001;N.glue.release.value=.08;
    N.clip=ctx.createWaveShaper();N.clip.oversample='none';
    sum.connect(N.glue);N.glue.connect(N.clip);N.clip.connect(N.maxWet);N.maxWet.connect(bus.lim);
    N.lim0={th:bus.lim.threshold.value,ratio:bus.lim.ratio.value,knee:bus.lim.knee.value};
    applyMax();
  }
  function applyMax(){
    const m=Q.max,t=ctx.currentTime;m.ceiling=clamp(+m.ceiling||-1,-12,-.1);m.drive=clamp(+m.drive||0,0,12);
    N.clip.curve=clipCurve(m.ceiling);N.glue.threshold.value=m.ceiling-2.5;
    N.drive.gain.setTargetAtTime(dbToGain(m.drive),t,.02);
    N.maxWet.gain.setTargetAtTime(m.on?1:0,t,.01);N.maxDry.gain.setTargetAtTime(m.on?0:1,t,.01);
    const L=bus.lim;
    if(m.on){L.threshold.setValueAtTime(0,t);L.ratio.setValueAtTime(1,t);L.knee.setValueAtTime(0,t);}
    else{L.threshold.setValueAtTime(N.lim0.th,t);L.ratio.setValueAtTime(N.lim0.ratio,t);L.knee.setValueAtTime(N.lim0.knee,t);}
  }
  function setMax(o){Object.assign(Q.max,o);applyMax();save();render();}
  const maxReduction=()=>Q.max.on?Math.min(0,N.glue.reduction||0)+Math.min(0,...N.bands.map(b=>b.reduction||0)):0;

  /* ---------- talkover : suiveur d'enveloppe du micro ---------- */
  function follow(){
    const now=performance.now();let duck=false;
    if(M.on&&Q.mic.talk!=='off'){
      if(Q.mic.talk==='on')duck=true;
      else{if(db(rmsOf(N.micAn))>Q.mic.thr)M.last=now;duck=now-M.last<450;}
    }
    if(duck!==M.ducked){M.ducked=duck;N.duck.gain.setTargetAtTime(duck?dbToGain(-clamp(Q.mic.depth,0,40)):1,ctx.currentTime,duck?.015:.12);}
    if(now-(follow.c||0)>100){follow.c=now;cueTick();}
  }
  function setMicSource(node,stream){
    if(M.src){try{M.src.disconnect(N.micIn);}catch(e){}}
    if(M.stream&&M.stream!==stream)M.stream.getTracks().forEach(t=>t.stop());
    M.src=node||null;M.stream=stream||null;if(node)node.connect(N.micIn);
  }
  const inputConstraints=dev=>({audio:{deviceId:dev?{exact:dev}:undefined,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  async function micOpen(dev){
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){toast('Ce système ne donne pas accès au micro');return false;}
    try{const s=await navigator.mediaDevices.getUserMedia(inputConstraints(dev??Q.mic.dev));resumeAudio();setMicSource(ctx.createMediaStreamSource(s),s);return true;}
    catch(e){toast('Micro inaccessible : autorise l’accès au micro, ou choisis une autre entrée');return false;}
  }
  async function micSet(on){
    if(on&&!M.src&&!(await micOpen()))on=false;
    M.on=!!on;N.micOn.gain.setTargetAtTime(M.on?1:0,ctx.currentTime,.01);render();return M.on;
  }
  function setMic(o){Object.assign(Q.mic,o);T(N.micVol.gain,Q.mic.vol);save();}

  /* ---------- platines d'entrée : une entrée ligne ou micro dans la voie d'une platine ---------- */
  function attachLive(d,node,stream,label){
    liveClose(d);if(d.playing)d.pause();
    const lg=g();node.connect(lg);lg.connect(d.trim);d.live={node,stream,g:lg,label:label||'Entrée'};
    const P=$('#p-deck'+d.id);if(P){P.classList.add('io-live-on');let b=$('.io-live',P);if(!b){b=h('span',{class:'io-live',title:'Cette platine joue une entrée en direct : ligne, platine vinyle ou micro'});P.prepend(b);}b.textContent='Entrée : '+d.live.label;}
    render();return d.live;
  }
  function liveClose(d){
    const L=d.live;if(!L)return;d.live=null;try{L.node.disconnect(L.g);}catch(e){}try{L.g.disconnect();}catch(e){}
    if(L.stream)L.stream.getTracks().forEach(t=>t.stop());
    const P=$('#p-deck'+d.id);if(P){P.classList.remove('io-live-on');const b=$('.io-live',P);if(b)b.remove();}
    render();
  }
  async function liveOpen(d,dev,label){
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){toast('Ce système ne donne pas accès aux entrées audio');return null;}
    try{const s=await navigator.mediaDevices.getUserMedia(inputConstraints(dev));resumeAudio();return attachLive(d,ctx.createMediaStreamSource(s),s,label);}
    catch(e){toast('Entrée inaccessible : autorise l’accès, ou choisis une autre entrée');return null;}
  }

  /* ---------- enregistrement du micro ou d'une entrée ---------- */
  const RI={};
  function recInput(key){
    if(RI[key]){RI[key].mr.stop();return false;}
    const d=key==='mic'?null:deckById(key),node=key==='mic'?N.micVol:d&&d.live&&d.live.g;
    if(!node){toast(key==='mic'?'Ouvre le micro d’abord':'Branche une entrée sur la platine '+key+' d’abord');return false;}
    if(typeof MediaRecorder==='undefined'){toast('L’enregistrement n’est pas disponible dans ce navigateur.');return false;}
    const dst=ctx.createMediaStreamDestination();node.connect(dst);
    const mr=new MediaRecorder(dst.stream),ch=[],t0=new Date();
    mr.ondataavailable=e=>{if(e.data.size)ch.push(e.data);};
    mr.onstop=()=>{try{node.disconnect(dst);}catch(e){}delete RI[key];
      const blob=new Blob(ch,{type:mr.mimeType||'audio/webm'}),url=URL.createObjectURL(blob),nm=(key==='mic'?'micro':'entree-'+key)+'-'+stamp(t0)+'.webm';
      const item={url,name:nm,label:(key==='mic'?'Micro':'Entrée '+key)+' · '+t0.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+' · '+Math.max(1,Math.round(blob.size/1024))+' Ko',blob};
      if(typeof lib!=='undefined'){lib.recs.push(item);renderSide();}
      RI.last=item;toast('Enregistrement '+(key==='mic'?'du micro':'de l’entrée '+key)+' gardé dans la bibliothèque, section Enregistrements','ok');render();};
    mr.start(500);RI[key]={mr,t0};render();return true;
  }
  const pad2=n=>String(n).padStart(2,'0');
  const stamp=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'-'+pad2(d.getHours())+'h'+pad2(d.getMinutes());

  /* ---------- sorties : booth et platines, vers une autre carte ou des canaux d'une carte multicanal ---------- */
  const R={pairs:{},mc:null,bridges:{}};
  const outNode=k=>k==='booth'?N.boothOut:N.tap[k];
  const maxCh=()=>{try{return ctx.destination.maxChannelCount||2;}catch(e){return 2;}};
  function rebuildMulti(){
    if(R.mc){try{R.mc.m.disconnect();}catch(e){}R.mc.sp.forEach(([k,s])=>{try{outNode(k).disconnect(s);}catch(e){}});R.mc=null;}
    const ent=Object.entries(R.pairs);const dst=ctx.destination;
    if(!ent.length){try{dst.channelCount=2;dst.channelInterpretation='speakers';}catch(e){}return;}
    const need=Math.min(maxCh(),Math.max(...ent.map(([,c])=>c+2)));
    try{dst.channelCount=need;dst.channelInterpretation='discrete';}catch(e){}
    const m=ctx.createChannelMerger(need),sp=[];
    ent.forEach(([k,c])=>{if(c+1>=need)return;const s=ctx.createChannelSplitter(2);outNode(k).connect(s);s.connect(m,0,c);s.connect(m,1,c+1);sp.push([k,s]);});
    m.connect(dst);R.mc={m,sp,need};
  }
  async function bridge(k,dev){
    const node=outNode(k),msd=ctx.createMediaStreamDestination();node.connect(msd);
    const id=dev==='default'?'':dev,b={msd,node};
    try{
      if(typeof AudioContext!=='undefined'&&typeof AudioContext.prototype.setSinkId==='function'){
        const c2=new AudioContext({latencyHint:'interactive',sampleRate:ctx.sampleRate}),s=c2.createMediaStreamSource(msd.stream);s.connect(c2.destination);
        await c2.setSinkId(id);await c2.resume().catch(()=>{});b.c2=c2;
      }else if(typeof HTMLMediaElement!=='undefined'&&'setSinkId' in HTMLMediaElement.prototype){
        const a=new Audio();a.srcObject=msd.stream;await a.setSinkId(id);await a.play();b.el=a;
      }else throw new Error('setSinkId');
    }catch(e){try{node.disconnect(msd);}catch(_){}if(b.c2)b.c2.close().catch(()=>{});return null;}
    return b;
  }
  function unbridge(k){const b=R.bridges[k];if(!b)return;delete R.bridges[k];try{b.node.disconnect(b.msd);}catch(e){}if(b.c2)b.c2.close().catch(()=>{});if(b.el){b.el.pause();b.el.srcObject=null;}}
  function cutFromMaster(id,cut){
    const d=deckById(id);if(!d)return;cut=!!cut;if(!!N.cut?.[id]===cut)return;N.cut=N.cut||{};N.cut[id]=cut;
    try{if(cut)d.xf.disconnect(bus.sum);else d.xf.connect(bus.sum);}catch(e){}
  }
  /* cible : '' coupée, 'ch:2' canaux 3-4 de la carte du master (multicanal), 'dev:<id>' une autre carte */
  async function setOut(k,target){
    target=target||'';const was=k==='booth'?Q.booth.target:Q.outs[k];
    unbridge(k);if(k in R.pairs){delete R.pairs[k];rebuildMulti();}
    let ok=true;
    if(target.startsWith('ch:')){const c=+target.slice(3);if(c+2>maxCh()){toast('Cette carte son n’a que '+maxCh()+' sorties');ok=false;}else{R.pairs[k]=c;rebuildMulti();}}
    else if(target.startsWith('dev:')){const b=await bridge(k,target.slice(4));if(b)R.bridges[k]=b;else{toast('Impossible d’utiliser cette carte son pour '+(k==='booth'?'le booth':'la platine '+k));ok=false;}}
    if(!ok)target='';
    if(k==='booth')Q.booth.target=target;else{Q.outs[k]=target;cutFromMaster(k,!!target&&Q.extCut);}
    save();render();return ok&&(target!==''||was!=='');
  }
  function setExtCut(on){Q.extCut=!!on;Object.keys(Q.outs).forEach(k=>cutFromMaster(k,!!Q.outs[k]&&Q.extCut));save();}
  function setBooth(v){Q.booth.vol=clamp(v,0,1.5);T(N.boothVol.gain,Q.booth.vol,.01);save();}

  /* ---------- latence ---------- */
  const HINTS=[['interactive','Interactif (défaut du navigateur)'],['balanced','Équilibré'],['playback','Lecture (le plus sûr)'],['3','Buffer 3 ms'],['5','Buffer 5 ms'],['10','Buffer 10 ms'],['20','Buffer 20 ms'],['40','Buffer 40 ms']];
  const RATES=[[0,'Celle de la carte son'],[44100,'44,1 kHz'],[48000,'48 kHz'],[88200,'88,2 kHz'],[96000,'96 kHz']];
  function latencyInfo(){
    const b=ctx.baseLatency||0,o=ctx.outputLatency||0,sr=ctx.sampleRate;
    return{sampleRate:sr,wantRate:Q.sr||null,rateOk:!Q.sr||Q.sr===sr,hint:Q.hint,baseMs:b*1000,outMs:o*1000,totalMs:(b+o)*1000,frames:Math.round(b*sr),loop:L.last};
  }
  function setCtxPref(o){Object.assign(Q,o);save();}
  const L={last:null,tone:null};
  const CAP=`class C extends AudioWorkletProcessor{process(i){const x=i[0]&&i[0][0];this.port.postMessage([currentTime,x?x.slice():null]);return true;}}registerProcessor('mixlab-cap',C);`;
  let capP=null;
  // module en blob, ou en data: quand la page n'a pas d'origine (file://)
  const capLoad=()=>capP||(capP=(async()=>{if(!ctx.audioWorklet)return false;
    for(const u of[()=>URL.createObjectURL(new Blob([CAP],{type:'application/javascript'})),()=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(CAP)]){try{await ctx.audioWorklet.addModule(u());return true;}catch(e){}}return false;})());
  /* Mesure en boucle : 6 clics envoyés, on cherche leur retour sur l'entrée.
     Avec le micro devant l'enceinte (ou un câble sortie → entrée), on obtient la latence aller-retour réelle. */
  async function measure(opts={}){
    resumeAudio();
    const input=opts.input||M.src;if(!input)return{error:'no-input'};
    if(!(await capLoad()))return{error:'no-worklet'};
    const out=opts.output||ctx.destination,sr=ctx.sampleRate,n=opts.clicks||6,gap=.4;
    const cap=new AudioWorkletNode(ctx,'mixlab-cap',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]}),sink=g(0);
    input.connect(cap);cap.connect(sink);sink.connect(ctx.destination);
    const blocks=[];cap.port.onmessage=e=>blocks.push(e.data);
    const cb=ctx.createBuffer(1,Math.round(sr*.002),sr),cd=cb.getChannelData(0);for(let i=0;i<cd.length;i++)cd[i]=(i%2?-.9:.9)*(1-i/cd.length);
    const T0=ctx.currentTime+.35,times=[];
    for(let i=0;i<n;i++){const s=ctx.createBufferSource();s.buffer=cb;s.connect(out);const t=T0+i*gap;s.start(t);times.push(t);}
    const endT=T0+n*gap+.4;
    await new Promise(r=>{const w=()=>ctx.currentTime>endT?r():setTimeout(w,40);w();});
    cap.port.onmessage=null;try{input.disconnect(cap);}catch(e){}cap.disconnect();sink.disconnect();
    // bruit de fond avant le premier clic
    let ns=0,nn=0;for(const[t,x]of blocks){if(!x||t>=T0-.02)continue;for(const v of x){ns+=v*v;nn++;}}
    const noise=Math.sqrt(ns/Math.max(1,nn));
    const res=times.map(t0=>{
      let mx=0;const win=[];for(const[t,x]of blocks){if(!x||t+x.length/sr<t0||t>t0+gap-.02)continue;for(let k=0;k<x.length;k++){const tt=t+k/sr;if(tt<t0||tt>=t0+gap-.02)continue;const a=Math.abs(x[k]);win.push([tt,a]);if(a>mx)mx=a;}}
      if(mx<Math.max(.01,noise*6))return null;
      const hit=win.find(([,a])=>a>=mx*.5);return hit?(hit[0]-t0)*1000:null;
    }).filter(v=>v!=null);
    if(!res.length){L.last={error:'silence'};render();return L.last;}
    const s=res.slice().sort((a,b)=>a-b),med=s[s.length>>1];
    L.last={ms:med,spread:s[s.length-1]-s[0],n:res.length,of:n,noise};render();return L.last;
  }
  /* son de test (1 kHz à -18 dBFS) ou clic de métronome à 120 BPM, directement sur la carte du master */
  function testSignal(kind){
    if(L.tone){L.tone.stop();L.tone=null;}
    if(!kind){render();return null;}
    resumeAudio();const gg=g(dbToGain(-18));gg.connect(ctx.destination);let src;
    if(kind==='tone'){src=ctx.createOscillator();src.frequency.value=1000;}
    else{const sr=ctx.sampleRate,b=ctx.createBuffer(1,Math.round(sr*.5),sr),d=b.getChannelData(0);for(let i=0;i<sr*.01;i++)d[i]=Math.sin(2*Math.PI*1500*i/sr)*Math.exp(-i/(sr*.002))*4;src=ctx.createBufferSource();src.buffer=b;src.loop=true;}
    src.connect(gg);src.start();L.tone={kind,stop:()=>{try{src.stop();}catch(e){}gg.disconnect();}};render();return L.tone;
  }

  /* ---------- EQ 4 bandes : graves, bas-médiums, hauts-médiums, aigus ---------- */
  function eq4Setup(){
    decks.forEach(d=>{if(d.mid2)return;d.mid2=bq('peaking',2500,.9);d.mid2.gain.value=0;try{d.mid.disconnect(d.high);}catch(e){}d.mid.connect(d.mid2);d.mid2.connect(d.high);d.p.mid2=d.p.mid2??.5;d.p.kill.mid2=false;});
    const am0=window.applyMix;window.applyMix=function(d){am0(d);eq4Apply(d);};
  }
  function eq4Apply(d){
    if(!d.mid2)return;const on=S.eqMode==='4band',t=ctx.currentTime,tc=.012;
    d.low.frequency.setTargetAtTime(on?100:150,t,tc);d.mid.frequency.setTargetAtTime(on?400:1000,t,tc);d.high.frequency.setTargetAtTime(on?8000:5000,t,tc);
    // en 4 bandes, les médiums s'arrêtent à -40 dB et sont plus étroits : un kill ne creuse pas les graves
    d.mid.Q.setTargetAtTime(on?1.4:.7,t,tc);if(on)d.mid.gain.setTargetAtTime(d.p.kill.mid?-40:Math.max(-40,eqDb(d.p.mid)),t,tc);
    d.mid2.Q.setTargetAtTime(1.4,t,tc);d.mid2.gain.setTargetAtTime(on?(d.p.kill.mid2?-40:Math.max(-40,eqDb(d.p.mid2))):0,t,tc);
    const u=d.ui&&d.ui.k;if(u&&u.mid2){u.mid2.el.closest('.eq').hidden=!on;if(u.mid&&u.mid.lab&&!d.p.kill.mid)u.mid.lab.textContent=on?'L-mid':'Mid';}
  }

  /* ---------- effet de crossfader : il monte sur la platine que le crossfader éloigne ----------
     Filtre (passe-haut qui monte), Écho ou Reverb. L'envoi est pris après le fader de voie et avant
     le crossfader : la queue de l'écho continue quand la platine est coupée. */
  const XFX=[['off','Aucun'],['filter','Filtre'],['echo','Écho'],['reverb','Reverb']];
  function xfxSetup(){
    N.xfx={};
    decks.forEach(d=>{
      const hp=bq('highpass',10,.8),send=g(0),ret=g(1);
      try{d.fader.disconnect(d.xf);}catch(e){}d.fader.connect(hp);hp.connect(d.xf);d.fader.connect(send);ret.connect(bus.sum);
      N.xfx[d.id]={hp,send,ret,fx:null,type:null};
    });
    const ax0=window.applyXf;window.applyXf=function(){ax0();xfxApply();};
  }
  function xfxBuild(d,type){
    const X=N.xfx[d.id];if(X.type===type)return;
    if(X.fx){const old=X.fx;setTimeout(()=>old.forEach(n=>{try{n.disconnect();}catch(e){}}),2500);}
    try{d.fader.disconnect(X.send);}catch(e){}
    X.fx=null;X.type=type;X.send=g(0);d.fader.connect(X.send);
    if(type==='echo'){const dl=ctx.createDelay(4),fb=g(.55),hp=bq('highpass',300,.7);dl.delayTime.value=.75*60/(d.bpm||120);X.send.connect(dl);dl.connect(hp);hp.connect(fb);fb.connect(dl);hp.connect(X.ret);X.fx=[X.send,dl,fb,hp];X.dl=dl;}
    else if(type==='reverb'){const cv=ctx.createConvolver();cv.buffer=impulse();const hp=bq('highpass',200,.7);X.send.connect(hp);hp.connect(cv);cv.connect(X.ret);X.fx=[X.send,hp,cv];X.dl=null;}
  }
  const xfAmt=d=>{if(d.xfa==='T'||!d.active)return 0;let x=S.xf;if(window.DeckPro&&DeckPro.P&&DeckPro.P.xfRev)x=1-x;const a=d.xfa==='A'?x:1-x;return Math.pow(clamp(a,0,1),1.5);};
  function xfxApply(){
    if(!N.xfx)return;const ty=Q.xfx.type,dep=clamp(Q.xfx.depth,0,1),t=ctx.currentTime;
    decks.forEach(d=>{const X=N.xfx[d.id],a=ty==='off'?0:xfAmt(d)*dep;
      X.hp.frequency.setTargetAtTime(ty==='filter'?10*Math.pow(400,a):10,t,.02);
      if((ty==='echo'||ty==='reverb')&&X.type!==ty)xfxBuild(d,ty);
      X.send.gain.setTargetAtTime((ty==='echo'||ty==='reverb')&&X.type===ty?a*(ty==='reverb'?1.6:1):0,t,.02);
      if(X.dl&&d.track){const p=.75*60/(d.bpm||120);if(Math.abs(X.dl.delayTime.value-p)>1e-3)X.dl.delayTime.setTargetAtTime(p,t,.05);}
    });
  }
  function setXfx(o){Object.assign(Q.xfx,o);xfxApply();save();}

  /* ---------- cue sheet : le morceau à l'antenne pendant l'enregistrement ----------
     Toutes les 100 ms : la platine la plus forte (fader × crossfader) qui joue. Un changement
     est daté du moment où le nouveau morceau passe devant, retenu s'il y reste 1 s. */
  const CS={on:false,t0:0,list:[],cand:null,last:null};
  const recNow=()=>(performance.now()-CS.t0)/1000;
  function onAir(){
    let best=null,bv=.05;
    for(const d of decks){if(!d.active||!d.playing||!d.track)continue;const v=faderGain(d.p.fader)*xfGainOf(d);if(v>bv){bv=v;best=d;}}
    return best;
  }
  function cueTick(){
    const rec=typeof REC!=='undefined'&&!!REC.mr;
    if(rec&&!CS.on){CS.on=true;CS.t0=REC.t0||performance.now();CS.list=[];CS.cand=null;}
    if(!rec){if(CS.on){CS.on=false;}return;}
    const d=onAir(),tr=d&&d.track,cur=CS.list.length?CS.list[CS.list.length-1].track:null;
    if(!tr||tr===cur){CS.cand=null;return;}
    if(!CS.cand||CS.cand.track!==tr){const n=recNow();CS.cand={track:tr,deck:d.id,t:!CS.list.length&&n<1.5?0:n};}
    if(!CS.list.length||recNow()-CS.cand.t>=1){CS.list.push(CS.cand);CS.cand=null;}
  }
  const cueTime=s=>{const f=Math.round(Math.max(0,s)*75),m=Math.floor(f/4500),r=f%4500;return pad2(m)+':'+pad2(Math.floor(r/75))+':'+pad2(r%75);};
  const txtTime=s=>{s=Math.max(0,Math.round(s));const hh=Math.floor(s/3600),m=Math.floor(s%3600/60),ss=s%60;return(hh?hh+':'+pad2(m):pad2(m))+':'+pad2(ss);};
  const q=s=>String(s||'').replace(/"/g,'\'').replace(/[\r\n]+/g,' ');
  function cueSheet(list,file,title){
    const ext=(file.split('.').pop()||'').toLowerCase(),typ=ext==='wav'?'WAVE':ext==='mp3'?'MP3':'WAVE';
    const out=['REM COMMENT "Mixlab"','PERFORMER "Mixlab"','TITLE "'+q(title)+'"','FILE "'+q(file)+'" '+typ];
    list.forEach((e,i)=>{out.push('  TRACK '+pad2(i+1)+' AUDIO','    TITLE "'+q(e.track.title)+'"');if(e.track.artist)out.push('    PERFORMER "'+q(e.track.artist)+'"');out.push('    INDEX 01 '+cueTime(e.t));});
    return out.join('\r\n')+'\r\n';
  }
  const tracklist=(list,title)=>[title,''].concat(list.map(e=>txtTime(e.t)+'  '+(e.track.artist?e.track.artist+' - ':'')+e.track.title+'  (platine '+e.deck+')')).join('\n')+'\n';
  function cueFinish(){
    cueTick();CS.on=false;
    const list=CS.list.slice(),r=typeof lib!=='undefined'?lib.recs[lib.recs.length-1]:null;
    const file=(REC.ext==='wav'&&REC.last&&REC.last.name)||(r&&r.name)||'mixlab-mix.webm';
    const base=file.replace(/\.[^.]+$/,''),title='Mix Mixlab du '+new Date().toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});
    const res={list:list.map(e=>({t:e.t,title:e.track.title,artist:e.track.artist,deck:e.deck})),cue:cueSheet(list,file,title),txt:tracklist(list,title),file,base};
    CS.lastSheet=res;
    if(list.length&&typeof lib!=='undefined'){
      const mk=(text,ext,label,type)=>({url:URL.createObjectURL(new Blob([text],{type})),name:base+'.'+ext,label});
      // rangées juste avant l'enregistrement : il reste le dernier de la liste (deck-pro.js le renomme ensuite)
      const mix=r&&r.label?r.label.split(' · ')[0]:'Mix';
      const i=r?lib.recs.indexOf(r):lib.recs.length;
      lib.recs.splice(i<0?lib.recs.length:i,0,mk(res.cue,'cue',mix+' · cue sheet ('+list.length+' morceaux)','application/x-cue'),mk(res.txt,'txt',mix+' · tracklist horodatée','text/plain'));
      setTimeout(renderSide,0);
    }
    render();return res;
  }
  async function exportSheet(kind){
    const s=CS.lastSheet;if(!s)return;const text=kind==='cue'?s.cue:s.txt,name=s.base+'.'+(kind==='cue'?'cue':'txt'),Nn=window.mixlabNative;
    if(Nn&&Nn.saveText){try{const p=await Nn.saveText(name,text);if(p)toast('Enregistré : '+p,'ok');}catch(e){toast('Impossible d’enregistrer : '+e);}return;}
    const a=h('a',{href:URL.createObjectURL(new Blob([text],{type:'text/plain'})),download:name});document.body.append(a);a.click();a.remove();
  }

  /* ---------- interface ---------- */
  const UI={};
  const sel=(label,opts,val,on)=>{const s=h('select',{class:'sel wide','aria-label':label},opts.map(([k,n])=>h('option',{value:k},n)));s.value=String(val);s.addEventListener('change',()=>on(s.value));return s;};
  const rng=(label,min,max,step,val,on,fmt)=>{const out=h('b',{class:'io-v'},fmt(val)),r=h('input',{type:'range',min,max,step,value:val,'aria-label':label});r.addEventListener('input',()=>{on(+r.value);out.textContent=fmt(+r.value);});return h('div',{class:'io-rr'},r,out);};
  const fld=(label,ctl,tip)=>h('label',{class:'io-f',title:tip||''},h('span',{},label),ctl);
  const pct=v=>Math.round(v*100)+' %',dB=v=>(v>0?'+':'')+(+v).toFixed(1)+' dB';
  let devs={in:[],out:[]};
  async function listDevices(){try{const all=await navigator.mediaDevices.enumerateDevices();devs={in:all.filter(d=>d.kind==='audioinput'),out:all.filter(d=>d.kind==='audiooutput'&&d.deviceId!=='communications')};}catch(e){devs={in:[],out:[]};}return devs;}
  const devName=(d,i,kind)=>d.deviceId==='default'?(kind==='in'?'Entrée par défaut du système':'Sortie par défaut du système'):(d.label||(kind==='in'?'Entrée ':'Sortie ')+(i+1));
  function outOptions(){
    const o=[['','Coupée']],mc=maxCh();
    for(let c=2;c+1<mc;c+=2)o.push(['ch:'+c,'Canaux '+(c+1)+'-'+(c+2)+' de la carte du master']);
    devs.out.forEach((d,i)=>o.push(['dev:'+d.deviceId,devName(d,i,'out')]));
    return o;
  }
  function buildModal(){
    const m=h('div',{class:'modal',id:'io-modal',hidden:true});
    const body=h('div',{class:'mgrid'});
    const close=h('button',{class:'b',type:'button',onclick:()=>{m.hidden=true;}},'Fermer');
    m.append(h('div',{class:'mbox',role:'dialog','aria-label':'Entrées, sorties et mastering'},h('h2',{},'Entrées et sorties ',close),body));
    m.addEventListener('click',e=>{if(e.target===m)m.hidden=true;});
    document.body.append(m);UI.modal=m;UI.body=body;
  }
  function fill(){
    const B=UI.body;if(!B)return;B.innerHTML='';const li=latencyInfo(),ms=v=>v.toFixed(1)+' ms';
    // latence
    const lat=h('p',{class:'lat io-lat'},
      (window.MixlabCtxErr?'Réglage refusé par le système, retour au mode interactif. ':'')+'Obtenu : '+li.sampleRate+' Hz'+(li.rateOk?'':' (demandé '+li.wantRate+' Hz : refusé par la carte ou le système)')+' · buffer '+(li.baseMs?ms(li.baseMs)+' ('+li.frames+' échantillons)':'non communiqué')+' · sortie '+(li.outMs?ms(li.outMs):'non communiquée')+(li.totalMs?' · total annoncé '+ms(li.totalMs):''),
      h('br'),L.last?L.last.error?'Mesure : aucun clic revenu. Approche le micro de l’enceinte, ou relie la sortie à l’entrée avec un câble.':'Mesure aller-retour : '+ms(L.last.ms)+' (écart '+ms(L.last.spread)+', '+L.last.n+'/'+L.last.of+' clics)':'Mesure aller-retour : pas encore faite (il faut le micro ou un câble de la sortie vers l’entrée).');
    const st=window.MixlabCtxStart||{hint:'interactive',sr:0},changed=()=>String(Q.hint)!==String(st.hint)||(+Q.sr||0)!==(+st.sr||0);
    const relaunch=h('button',{class:'b',type:'button',hidden:!changed(),onclick:()=>location.reload()},'Relancer pour appliquer');
    B.append(h('div',{},h('h3',{},'Latence'),h('p',{},'Un petit buffer réagit plus vite mais peut craquer sur une machine chargée. Le réglage s’applique au prochain démarrage.'),
      fld('Buffer',sel('Taille du buffer',HINTS,Q.hint,v=>{setCtxPref({hint:v});relaunch.hidden=!changed();})),
      fld('Fréquence',sel('Fréquence d’échantillonnage',RATES,Q.sr||0,v=>{setCtxPref({sr:+v});relaunch.hidden=!changed();})),
      lat,h('div',{class:'io-bt'},relaunch,
        h('button',{class:'b',type:'button',title:'Envoie 6 clics et mesure leur retour sur le micro : latence aller-retour réelle',onclick:async()=>{if(!M.src&&!(await micOpen()))return;toast('Mesure en cours : silence dans la salle');const r=await measure();fill();if(r&&r.ms!=null)toast('Latence aller-retour : '+r.ms.toFixed(1)+' ms','ok');}},'Mesurer'),
        h('button',{class:'b'+(L.tone&&L.tone.kind==='tone'?' on':''),type:'button',onclick:()=>{testSignal(L.tone&&L.tone.kind==='tone'?null:'tone');fill();}},'Son de test'),
        h('button',{class:'b'+(L.tone&&L.tone.kind==='click'?' on':''),type:'button',onclick:()=>{testSignal(L.tone&&L.tone.kind==='click'?null:'click');fill();}},'Clic de test'))));
    // micro
    const inOpts=[['','Entrée par défaut']].concat(devs.in.filter(d=>d.deviceId!=='default').map((d,i)=>[d.deviceId,devName(d,i,'in')]));
    B.append(h('div',{},h('h3',{},'Micro'),h('p',{},'Talkover : la musique baisse quand tu parles, puis remonte. Le micro passe dans le master et le booth.'),
      fld('Entrée',sel('Entrée du micro',inOpts,Q.mic.dev,async v=>{setMic({dev:v});if(M.src)await micOpen(v);})),
      fld('Volume',rng('Volume du micro',0,1.5,.01,Q.mic.vol,v=>setMic({vol:v}),pct)),
      fld('Talkover',sel('Talkover',[['off','Coupé'],['auto','Quand je parle'],['on','Tant que le micro est ouvert']],Q.mic.talk,v=>setMic({talk:v}))),
      fld('Baisse de la musique',rng('Profondeur du talkover',3,30,1,Q.mic.depth,v=>setMic({depth:v}),v=>'-'+v+' dB')),
      h('div',{class:'io-bt'},h('button',{class:'b'+(M.on?' on':''),type:'button',onclick:async()=>{await micSet(!M.on);fill();}},M.on?'Couper le micro':'Ouvrir le micro'),
        h('button',{class:'b'+(RI.mic?' on':''),type:'button',onclick:()=>{recInput('mic');fill();}},RI.mic?'Arrêter l’enregistrement':'Enregistrer le micro'))));
    // platines d'entrée
    const liveRows=decks.filter(d=>d.active).map(d=>h('div',{class:'io-row'},h('b',{},d.id),
      sel('Entrée de la platine '+d.id,[['-','Morceau (pas d’entrée)']].concat(inOpts),d.live?(d.live.dev||''):'-',async v=>{if(v==='-')liveClose(d);else{const x=await liveOpen(d,v,(inOpts.find(o=>o[0]===v)||['',''])[1]);if(x)x.dev=v;}fill();}),
      h('button',{class:'b'+(RI[d.id]?' on':''),type:'button',disabled:!d.live,onclick:()=>{recInput(d.id);fill();}},RI[d.id]?'Stop':'Enregistrer')));
    B.append(h('div',{},h('h3',{},'Platines d’entrée'),h('p',{},'Une platine vinyle, un CD ou un micro dans la voie d’une platine : gain, EQ, filtre, effets et fader s’appliquent.'),...liveRows));
    // booth
    B.append(h('div',{},h('h3',{},'Booth'),h('p',{},'Le retour du DJ : le mix avec son propre volume, indépendant du master.'),
      fld('Volume du booth',rng('Volume du booth',0,1.5,.01,Q.booth.vol,setBooth,pct)),
      fld('Sortie',sel('Sortie booth',outOptions(),Q.booth.target,v=>setOut('booth',v)))));
    // sorties par platine
    const cut=h('input',{type:'checkbox','aria-label':'Retirer du master interne'});cut.checked=Q.extCut;cut.addEventListener('change',()=>setExtCut(cut.checked));
    B.append(h('div',{},h('h3',{},'Mixer externe'),h('p',{},'Chaque platine sur sa propre sortie, après le gain et avant l’EQ, pour une table de mixage.'+(maxCh()<4?' Ta carte du master a '+maxCh()+' canaux : choisis une autre carte son pour chaque platine.':'')),
      ...decks.filter(d=>d.active).map(d=>h('div',{class:'io-row'},h('b',{},d.id),sel('Sortie de la platine '+d.id,outOptions(),Q.outs[d.id],v=>setOut(d.id,v)))),
      h('label',{class:'io-ck'},cut,'Une platine envoyée dehors ne passe plus dans le master interne')));
    // mastering
    const on=h('input',{type:'checkbox','aria-label':'Maximiseur'});on.checked=Q.max.on;on.addEventListener('change',()=>setMax({on:on.checked}));
    UI.red=h('b',{class:'io-v'},'');
    B.append(h('div',{},h('h3',{},'Maximiseur'),h('p',{},'Compresse le master en 3 bandes et le limite sous le plafond : plus fort et plus égal, jamais au-dessus.'),
      h('label',{class:'io-ck'},on,'Maximiseur sur le master'),
      fld('Plafond',rng('Plafond du maximiseur',-6,-.1,.1,Q.max.ceiling,v=>setMax({ceiling:v}),dB)),
      fld('Poussée',rng('Poussée du maximiseur',0,12,.5,Q.max.drive,v=>setMax({drive:v}),dB)),
      fld('Réduction',UI.red)));
    // cue sheet
    const S2=CS.lastSheet;
    B.append(h('div',{},h('h3',{},'Cue sheet'),h('p',{},'À chaque enregistrement du mix, une cue sheet (.cue) et une tracklist horodatée sont créées : elles arrivent dans la bibliothèque, section Enregistrements.'),
      S2?h('div',{class:'io-bt'},h('button',{class:'b',type:'button',onclick:()=>exportSheet('cue')},'Exporter la cue sheet'),h('button',{class:'b',type:'button',onclick:()=>exportSheet('txt')},'Exporter la tracklist')):h('p',{class:'lat'},CS.on?'Enregistrement en cours : '+CS.list.length+' morceaux notés.':'Pas encore d’enregistrement.')));
  }
  function render(){
    if(UI.mic){UI.mic.classList.toggle('on',M.on);UI.mic.setAttribute('aria-pressed',String(M.on));}
    if(UI.modal&&!UI.modal.hidden&&!render.busy){render.busy=true;requestAnimationFrame(()=>{render.busy=false;if(!UI.modal.contains(document.activeElement)||document.activeElement.tagName==='BUTTON')fill();});}
  }
  async function open(){await listDevices();fill();UI.modal.hidden=false;}
  function mixerUi(){
    // micro et entrées/sorties dans les réglages du mixer : la façade garde sa largeur
    const pop=$('#p-mixer .mxpop');
    if(pop&&!UI.mic){
      UI.mic=btn('mic.on','Micro on','Micro','iomic',()=>micSet(!M.on),null,'Ouvre ou coupe le micro. Talkover : la musique baisse quand tu parles.');
      const io=btn('io.open','Entrées et sorties','Entrées et sorties…','',()=>{const d=pop.closest('details');if(d)d.open=false;open();},null,'Micro, platines d’entrée, booth, mixer externe, maximiseur, latence');
      pop.append(h('div',{class:'mxf'},h('span',{class:'lbl'},'Micro et sorties'),h('div',{class:'io-bt'},UI.mic,io)));
    }
    // EQ 4 bandes : option du sélecteur et potard Hi-mid dans chaque voie
    const eqm=$('#p-mixer select.eqm');
    if(eqm&&!eqm.querySelector('option[value="4band"]')){eqm.append(h('option',{value:'4band'},'EQ 4 bandes'));eqm.value=S.eqMode;eqm.addEventListener('change',()=>decks.forEach(applyMix));}
    decks.forEach(d=>{
      const k=d.ui.k;if(!k||!k.mid||k.mid2)return;const D=d.id;
      const tog=()=>{d.p.kill.mid2=!d.p.kill.mid2;kn.lab.classList.toggle('on',d.p.kill.mid2);kn.el.classList.toggle('killed',d.p.kill.mid2);applyMix(d);};
      const kn=knob(D+'.mid2','H-mid',.5,v=>{d.p.mid2=v;applyMix(d);},{title:'Hauts-médiums (EQ 4 bandes) : voix, caisse claire, attaque des synthés',aria:'H-mid '+D,kill:{id:D+'.killmid2',title:'Clic : kill des hauts-médiums',aria:'Kill H-mid '+D,toggle:tog}});
      kn.lab.addEventListener('click',tog);regBtn(D+'.killmid2','Kill H-mid '+D,kn.lab,tog);k.mid2=kn;
      const w=h('div',{class:'eq'},kn.el),mw=k.mid.el.closest('.eq');if(mw)mw.after(w);
    });
    // effet de crossfader dans les réglages du mixer
    if(pop&&!UI.xfx){UI.xfx=sel('Effet de crossfader',XFX,Q.xfx.type,v=>setXfx({type:v}));UI.xfx.classList.remove('wide');UI.xfx.classList.add('mxs');
      pop.append(h('label',{class:'mxf',title:'Un effet monte sur la platine que le crossfader éloigne : filtre, écho ou reverb'},h('span',{class:'lbl'},'Effet de crossfader'),UI.xfx));}
    // et depuis la fenêtre Audio (cartes son)
    const ag=$('#audio-modal .mgrid');
    if(ag&&!UI.aud){UI.aud=h('div',{},h('h3',{},'Entrées, booth, mastering'),h('p',{},'Micro et talkover, platines d’entrée, booth, sorties par platine, maximiseur, réglage de la latence.'),
      h('button',{class:'b',type:'button',onclick:()=>{$('#audio-modal').hidden=true;open();}},'Entrées et sorties…'));ag.append(UI.aud);}
    decks.forEach(applyMix);
  }
  function css(){
    if($('#io-css'))return;
    document.head.append(h('style',{id:'io-css'},`
#io-modal .io-f{display:grid;gap:4px;margin:0 0 8px;font:500 var(--fs-1) var(--ui);color:var(--text-lo)}
#io-modal .io-rr{display:flex;align-items:center;gap:8px}#io-modal .io-rr input{flex:1;min-width:0}
#io-modal .io-v{font:600 var(--fs-1) var(--num);color:var(--text-hi);min-width:56px;text-align:right}
#io-modal .io-bt{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
#io-modal .io-row{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:6px;align-items:center;margin:0 0 6px}
#io-modal .io-ck{display:flex;gap:6px;align-items:center;margin:4px 0 8px;font:400 var(--fs-1) var(--ui);color:var(--text-mid)}
#io-modal .b.on{background:var(--surface-3);color:var(--text-hi)}
.io-live{display:inline-block;margin:0 0 4px;padding:2px 8px;border-radius:var(--r-1);background:var(--surface-3);color:var(--live);font:600 var(--fs-1) var(--ui)}
.fxu .fxfav{background:transparent;color:var(--text-lo);height:24px;font:500 var(--fs-1) var(--ui);padding:0 6px;box-shadow:none}
.mxpop .io-bt{display:flex;gap:6px;flex-wrap:wrap}
.mxpop .iomic.on{background:var(--state-bad);color:var(--surface-0)}`));
  }
  function wrapRec(){
    const prev=REC.onStop;REC.onStop=function(blob){prev&&prev.call(this,blob);cueFinish();};
  }
  function frame(){if(UI.red&&UI.modal&&!UI.modal.hidden)UI.red.textContent=Q.max.on?maxReduction().toFixed(1)+' dB':'arrêt';}
  function init(){
    if(N.init)return;N.init=true;
    graph();eq4Setup();xfxSetup();css();buildModal();mixerUi();wrapRec();xfxApply();
    setBooth(Q.booth.vol);
    // sorties gardées : rétablies si la carte est encore là
    listDevices().then(()=>{for(const k of['booth','A','B','C','D']){const t=k==='booth'?Q.booth.target:Q.outs[k];if(t&&(t.startsWith('ch:')||devs.out.some(d=>'dev:'+d.deviceId===t)))setOut(k,t);else if(t){if(k==='booth')Q.booth.target='';else Q.outs[k]='';}}});
    setInterval(frame,250);
    navigator.mediaDevices&&navigator.mediaDevices.addEventListener&&navigator.mediaDevices.addEventListener('devicechange',()=>{listDevices().then(render);});
  }

  // réglages exposés à la fenêtre Préférences
  window.MixlabSettings=(window.MixlabSettings||[]).concat([
    {tab:'Audio',key:'io.hint',label:'Taille du buffer (au prochain démarrage)',type:'select',options:HINTS,get:()=>Q.hint,set:v=>setCtxPref({hint:v})},
    {tab:'Audio',key:'io.sr',label:'Fréquence d’échantillonnage (au prochain démarrage)',type:'select',options:RATES,get:()=>Q.sr||0,set:v=>setCtxPref({sr:+v})},
    {tab:'Audio',key:'io.booth',label:'Volume du booth',type:'range',options:{min:0,max:1.5,step:.01},get:()=>Q.booth.vol,set:v=>setBooth(+v)},
    {tab:'Audio',key:'io.extCut',label:'Platine envoyée vers un mixer externe : retirée du master interne',type:'checkbox',get:()=>Q.extCut,set:v=>setExtCut(!!v)},
    {tab:'Audio',key:'io.max',label:'Maximiseur sur le master',type:'checkbox',get:()=>Q.max.on,set:v=>setMax({on:!!v})},
    {tab:'Audio',key:'io.ceiling',label:'Plafond du maximiseur (dB)',type:'range',options:{min:-6,max:-.1,step:.1},get:()=>Q.max.ceiling,set:v=>setMax({ceiling:+v})},
    {tab:'Audio',key:'io.talk',label:'Talkover du micro',type:'select',options:[['off','Coupé'],['auto','Quand je parle'],['on','Tant que le micro est ouvert']],get:()=>Q.mic.talk,set:v=>setMic({talk:v})},
    {tab:'Audio',key:'io.depth',label:'Baisse de la musique au talkover (dB)',type:'range',options:{min:3,max:30,step:1},get:()=>Q.mic.depth,set:v=>setMic({depth:+v})},
    {tab:'Mixer',key:'io.xfx',label:'Effet de crossfader',type:'select',options:XFX,get:()=>Q.xfx.type,set:v=>setXfx({type:v})},
  ]);

  return{init,open,Q,N,M,CS,graph,setMax,applyMax,maxReduction,micSet,micOpen,setMicSource,setMic,attachLive,liveOpen,liveClose,recInput,RI,
    setOut,setBooth,setExtCut,maxChannels:maxCh,latencyInfo,setCtxPref,measure,testSignal,setXfx,xfxApply,xfAmt,cueFinish,cueSheet,tracklist,cueTime,exportSheet,listDevices,
    get sheet(){return CS.lastSheet;}};
})();
