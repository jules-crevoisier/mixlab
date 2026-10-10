'use strict';
/* =====================================================================
   Mixlab · moteur audio
   Platines, effets, key lock, sampler, bus master / casque, enregistrement,
   analyse (BPM, grille, tonalité, volume), pistes de démonstration.
   ===================================================================== */
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const frac=x=>x-Math.floor(x);
const wrapHalf=x=>{x=frac(x);return x>=.5?x-1:x;};
const dbToGain=db=>Math.pow(10,db/20);
const AC=window.AudioContext||window.webkitAudioContext;
const ctx=new AC({latencyHint:'interactive'});
function resumeAudio(){if(ctx.state!=='running')ctx.resume().catch(()=>{});}

const S={quantize:true,autoGain:true,xf:.5,curve:'mix',numDecks:2,split:false,hpDevice:null,cueMix:.0,cueVol:.8,masterVol:.8,master:null,samplerVol:.7};

/* ---------- bus master, casque (split cue), enregistrement ---------- */
const bus={};
(function(){
  const g=()=>ctx.createGain();
  bus.sum=g();bus.vol=g();bus.vol.gain.value=S.masterVol;
  bus.lim=ctx.createDynamicsCompressor();
  bus.lim.threshold.value=-1.5;bus.lim.knee.value=0;bus.lim.ratio.value=20;bus.lim.attack.value=.002;bus.lim.release.value=.12;
  bus.sum.connect(bus.vol);bus.vol.connect(bus.lim);
  bus.anL=ctx.createAnalyser();bus.anR=ctx.createAnalyser();bus.anL.fftSize=bus.anR.fftSize=1024;
  const sp=ctx.createChannelSplitter(2);bus.vol.connect(sp);sp.connect(bus.anL,0);sp.connect(bus.anR,1);
  bus.out=g();bus.lim.connect(bus.out);
  bus.cue=g();
  const mono=()=>{const m=g();m.channelCount=1;m.channelCountMode='explicit';m.channelInterpretation='speakers';return m;};
  bus.mMono=mono();bus.hMono=mono();bus.merger=ctx.createChannelMerger(2);
  bus.out.connect(bus.mMono);bus.mMono.connect(bus.merger,0,1);
  bus.cueSide=g();bus.masterSide=g();bus.hp=g();
  bus.cue.connect(bus.cueSide);bus.out.connect(bus.masterSide);bus.cueSide.connect(bus.hp);bus.masterSide.connect(bus.hp);bus.hp.connect(bus.hMono);bus.hMono.connect(bus.merger,0,0);
  bus.rec=ctx.createMediaStreamDestination?ctx.createMediaStreamDestination():null;
  if(bus.rec)bus.lim.connect(bus.rec);
  bus.out.connect(ctx.destination);
})();
/* Trois routages : tout sur la sortie principale, split (casque à gauche, master à droite),
   ou casque sur une deuxième carte son (S.hpDevice, géré par desktop.js). */
function routeOut(){
  try{bus.out.disconnect(ctx.destination);}catch(e){}
  try{bus.merger.disconnect();}catch(e){}
  if(bus.hpDest)try{bus.hp.disconnect(bus.hpDest);}catch(e){}
  if(S.hpDevice&&bus.hpDest){bus.out.connect(ctx.destination);bus.hp.connect(bus.hpDest);}
  else if(S.split)bus.merger.connect(ctx.destination);
  else bus.out.connect(ctx.destination);
}
function setSplit(on){S.split=on;if(on)S.hpDevice=null;routeOut();}
function applyCue(){const t=ctx.currentTime;bus.cueSide.gain.setTargetAtTime(1-S.cueMix,t,.01);bus.masterSide.gain.setTargetAtTime(S.cueMix,t,.01);bus.hp.gain.setTargetAtTime(S.cueVol,t,.01);}
function setMasterVol(v){S.masterVol=v;bus.vol.gain.setTargetAtTime(v,ctx.currentTime,.01);}
applyCue();

const REC={mr:null,chunks:[],t0:0,url:null,onStop:null};
function recToggle(){
  if(REC.mr){REC.mr.stop();return true;}
  if(!bus.rec||typeof MediaRecorder==='undefined')return false;
  const mr=new MediaRecorder(bus.rec.stream);REC.chunks=[];
  mr.ondataavailable=e=>{if(e.data.size)REC.chunks.push(e.data);};
  mr.onstop=()=>{const blob=new Blob(REC.chunks,{type:mr.mimeType||'audio/webm'});if(REC.url)URL.revokeObjectURL(REC.url);REC.url=URL.createObjectURL(blob);REC.mr=null;REC.onStop&&REC.onStop(blob);};
  mr.start(1000);REC.mr=mr;REC.t0=performance.now();return true;
}

/* ---------- key lock / transposition : pitch shifter granulaire à lignes de retard ---------- */
class PitchShifter{
  constructor(c){
    const bt=.1,ft=.05,sr=c.sampleRate,len=Math.round(bt*sr),fl=Math.round(ft*sr);
    const ramp=up=>{const b=c.createBuffer(1,len,sr),p=b.getChannelData(0);for(let i=0;i<len;i++)p[i]=up?(len-i)/len:i/len;return b;};
    const fade=c.createBuffer(1,len,sr),fp=fade.getChannelData(0);
    for(let i=0;i<len;i++)fp[i]=i<fl?Math.sqrt(i/fl):i>=len-fl?Math.sqrt(1-(i-(len-fl))/fl):1;
    const src=b=>{const s=c.createBufferSource();s.buffer=b;s.loop=true;return s;};
    const down=ramp(false),up=ramp(true);
    this.input=c.createGain();this.output=c.createGain();
    const m=[src(down),src(down),src(up),src(up)],mg=m.map(()=>c.createGain());
    mg[2].gain.value=mg[3].gain.value=0;m.forEach((s,i)=>s.connect(mg[i]));
    this.mg=mg;this.modA=c.createGain();this.modB=c.createGain();
    mg[0].connect(this.modA);mg[2].connect(this.modA);mg[1].connect(this.modB);mg[3].connect(this.modB);
    const d1=c.createDelay(1),d2=c.createDelay(1);this.modA.connect(d1.delayTime);this.modB.connect(d2.delayTime);
    const f1=src(fade),f2=src(fade),x1=c.createGain(),x2=c.createGain();x1.gain.value=x2.gain.value=0;f1.connect(x1.gain);f2.connect(x2.gain);
    this.input.connect(d1);this.input.connect(d2);d1.connect(x1);d2.connect(x2);x1.connect(this.output);x2.connect(this.output);
    const t=c.currentTime+.05,t2=t+bt-ft;
    m[0].start(t);m[1].start(t2);m[2].start(t);m[3].start(t2);f1.start(t);f2.start(t2);
    this.c=c;this.set(1);
  }
  /* facteur de hauteur : 1 = inchangé, 1.06 = un demi-ton plus haut */
  set(f){
    const mult=2*(f-1),up=mult>0,t=this.c.currentTime;
    this.mg[0].gain.setValueAtTime(up?0:1,t);this.mg[1].gain.setValueAtTime(up?0:1,t);
    this.mg[2].gain.setValueAtTime(up?1:0,t);this.mg[3].gain.setValueAtTime(up?1:0,t);
    const depth=.5*.1*Math.abs(mult);
    this.modA.gain.setTargetAtTime(depth,t,.01);this.modB.gain.setTargetAtTime(depth,t,.01);
  }
}

/* ---------- effets synchronisés au tempo ---------- */
const FX_TYPES=[['echo','Écho'],['reverb','Reverb'],['flanger','Flanger'],['phaser','Phaser'],['gate','Gate'],['lfo','Filtre LFO']];
const FX_BEATS=[.25,.5,.75,1,2,4,8];
const beatsLabel=b=>b===.25?'1/4':b===.5?'1/2':b===.75?'3/4':String(b);
let IMPULSE=null;
function impulse(){
  if(IMPULSE)return IMPULSE;
  const len=Math.round(ctx.sampleRate*2.6),b=ctx.createBuffer(2,len,ctx.sampleRate);
  for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.8);}
  return IMPULSE=b;
}
function bq(type,f,q){const n=ctx.createBiquadFilter();n.type=type;n.frequency.value=f;if(q!=null)n.Q.value=q;return n;}
function osc(type){const o=ctx.createOscillator();o.type=type;o.frequency.value=1;o.start();return o;}
const FX_BUILD={
  echo(send,ret){const d=ctx.createDelay(5),fb=ctx.createGain(),hp=bq('highpass',280,.7);fb.gain.value=.55;send.connect(d);d.connect(hp);hp.connect(fb);fb.connect(d);hp.connect(ret);
    return{all:[d,fb,hp],update:p=>d.delayTime.setTargetAtTime(clamp(p,.01,4.9),ctx.currentTime,.03)};},
  reverb(send,ret){const c=ctx.createConvolver();c.buffer=impulse();const hp=bq('highpass',220,.7);send.connect(hp);hp.connect(c);c.connect(ret);return{all:[c,hp]};},
  flanger(send,ret){const d=ctx.createDelay(.05);d.delayTime.value=.004;const o=osc('sine'),dp=ctx.createGain();dp.gain.value=.0032;o.connect(dp);dp.connect(d.delayTime);const fb=ctx.createGain();fb.gain.value=.65;send.connect(d);d.connect(fb);fb.connect(d);d.connect(ret);
    return{all:[d,o,dp,fb],update:p=>o.frequency.setTargetAtTime(1/(p*4),ctx.currentTime,.05)};},
  phaser(send,ret){const ap=[0,1,2,3].map(()=>bq('allpass',900,.8));const o=osc('sine'),dp=ctx.createGain();dp.gain.value=700;o.connect(dp);ap.forEach(a=>dp.connect(a.frequency));send.connect(ap[0]);ap[0].connect(ap[1]);ap[1].connect(ap[2]);ap[2].connect(ap[3]);ap[3].connect(ret);
    return{all:[...ap,o,dp],update:p=>o.frequency.setTargetAtTime(1/(p*2),ctx.currentTime,.05)};},
  gate(send,ret){const gg=ctx.createGain();gg.gain.value=0;const o=osc('square'),half=ctx.createGain();half.gain.value=.5;const off=ctx.createConstantSource();off.offset.value=.5;off.start();o.connect(half);half.connect(gg.gain);off.connect(gg.gain);send.connect(gg);gg.connect(ret);
    return{all:[gg,o,half,off],update:p=>o.frequency.setTargetAtTime(1/p,ctx.currentTime,.02)};},
  lfo(send,ret){const f=bq('lowpass',1600,6);const o=osc('sine'),dp=ctx.createGain();dp.gain.value=1300;o.connect(dp);dp.connect(f.frequency);send.connect(f);f.connect(ret);
    return{all:[f,o,dp],update:p=>o.frequency.setTargetAtTime(1/p,ctx.currentTime,.05)};}
};
const FX_INSERT=new Set(['flanger','phaser','gate','lfo']);
class FxUnit{
  constructor(){
    this.in=ctx.createGain();this.out=ctx.createGain();this.dry=ctx.createGain();this.send=ctx.createGain();this.ret=ctx.createGain();
    this.in.connect(this.dry);this.dry.connect(this.out);this.in.connect(this.send);this.ret.connect(this.out);
    this.type='echo';this.beats=1;this.amount=.5;this.on=false;this.fx=null;this.period=0;this.build();this.apply();
  }
  build(){
    if(this.fx){try{this.send.disconnect();}catch(e){}this.fx.all.forEach(n=>{try{n.disconnect();}catch(e){}if(n.stop)try{n.stop();}catch(e){}});}
    this.fx=FX_BUILD[this.type](this.send,this.ret);this.period=0;
  }
  setType(t){if(t===this.type)return;this.type=t;this.build();this.apply();}
  apply(){
    const t=ctx.currentTime,a=this.on?this.amount:0;
    if(FX_INSERT.has(this.type)){this.send.gain.setTargetAtTime(1,t,.01);this.ret.gain.setTargetAtTime(a,t,.01);this.dry.gain.setTargetAtTime(1-a*(this.type==='gate'||this.type==='lfo'?1:.5),t,.01);}
    else{this.send.gain.setTargetAtTime(this.on?1:0,t,.01);this.ret.gain.setTargetAtTime(this.amount*(this.type==='reverb'?1.4:1),t,.01);this.dry.gain.setTargetAtTime(1,t,.01);}
  }
  sync(bpm){if(!this.fx.update||!bpm)return;const p=60/bpm*this.beats;if(Math.abs(p-this.period)>1e-4){this.period=p;this.fx.update(p);}}
}

/* ---------- tonalités ---------- */
const KEY_NAMES=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const WHEEL_MIN=[5,12,7,2,9,4,11,6,1,8,3,10]; // code « A » (mineur) par tonique
const WHEEL_MAJ=[8,3,10,5,12,7,2,9,4,11,6,1]; // code « B » (majeur)
function keyInfo(k){if(!k)return null;const n=k.minor?WHEEL_MIN[k.pc]:WHEEL_MAJ[k.pc];return{name:KEY_NAMES[k.pc]+(k.minor?'m':''),code:n+(k.minor?'A':'B'),num:n,letter:k.minor?'A':'B'};}
function transposeKey(k,semi){if(!k)return null;return{pc:((k.pc+Math.round(semi))%12+12)%12,minor:k.minor};}
function keysCompatible(a,b){
  const x=keyInfo(a),y=keyInfo(b);if(!x||!y)return false;
  if(x.num===y.num)return true;
  const d=((x.num-y.num)%12+12)%12;return x.letter===y.letter&&(d===1||d===11);
}

/* ---------- analyse ---------- */
const WF=150,HOP=512,ANALYSIS_OFFSET=.0028;
function detectKey(L,R,sr,n){
  const D=Math.max(1,Math.round(sr/11025)),sr2=sr/D,N=8192,m=Math.floor(n/D);
  if(m<N*2)return null;
  const x=new Float32Array(m);for(let i=0;i<m;i++){let s=0;for(let j=0;j<D;j++){const k=i*D+j;s+=L[k]+R[k];}x[i]=s/(2*D);}
  const win=new Float32Array(N);for(let i=0;i<N;i++)win[i]=.5-.5*Math.cos(2*Math.PI*i/N);
  const chroma=new Float64Array(12),frames=Math.min(70,Math.floor(m/N)),buf=new Float32Array(N);
  const coefs=[];for(let midi=36;midi<96;midi++){const f=440*Math.pow(2,(midi-69)/12);coefs.push([2*Math.cos(2*Math.PI*f/sr2),midi%12]);}
  for(let fr=0;fr<frames;fr++){
    const st=Math.floor((.05+.9*fr/frames)*(m-N));
    for(let i=0;i<N;i++)buf[i]=x[st+i]*win[i];
    for(const[c,pc]of coefs){let s1=0,s2=0;for(let i=0;i<N;i++){const s0=buf[i]+c*s1-s2;s2=s1;s1=s0;}chroma[pc]+=Math.sqrt(Math.max(0,s1*s1+s2*s2-c*s1*s2));}
  }
  const MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],MIN=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
  const corr=(p,r)=>{let mx=0,my=0;for(let i=0;i<12;i++){mx+=chroma[(i+r)%12];my+=p[i];}mx/=12;my/=12;let a=0,b=0,c=0;for(let i=0;i<12;i++){const u=chroma[(i+r)%12]-mx,v=p[i]-my;a+=u*v;b+=u*u;c+=v*v;}return a/Math.sqrt(b*c+1e-12);};
  let best=-2,key=null;
  for(let r=0;r<12;r++){const a=corr(MAJ,r),b=corr(MIN,r);if(a>best){best=a;key={pc:r,minor:false};}if(b>best){best=b;key={pc:r,minor:true};}}
  return key;
}
function analyze(buf,skipKey){
  const sr=buf.sampleRate,n=buf.length,L=buf.getChannelData(0),R=buf.numberOfChannels>1?buf.getChannelData(1):L;
  const nW=Math.ceil(n*WF/sr)+1,wl=new Float32Array(nW),wm=new Float32Array(nW),wh=new Float32Array(nW);
  const nO=(n>>9)+1,eLow=new Float32Array(nO),eAll=new Float32Array(nO);
  const aL=Math.exp(-2*Math.PI*200/sr),a3=Math.exp(-2*Math.PI*2500/sr),k=WF/sr;
  let lo=0,l3=0,ss=0;
  for(let i=0;i<n;i++){
    const x=(L[i]+R[i])*.5;lo=aL*lo+(1-aL)*x;l3=a3*l3+(1-a3)*x;ss+=x*x;
    const w=(i*k)|0;let v=lo<0?-lo:lo;if(v>wl[w])wl[w]=v;v=l3-lo;if(v<0)v=-v;if(v>wm[w])wm[w]=v;v=x-l3;if(v<0)v=-v;if(v>wh[w])wh[w]=v;
    const o=i>>9;eLow[o]+=lo*lo;eAll[o]+=x*x;
  }
  let mx=1e-6;for(let i=0;i<nW;i++)mx=Math.max(mx,wl[i],wm[i],wh[i]);
  const c=new Float32Array(nO),on=new Float32Array(nO);let cmax=0;
  for(let i=0;i<nO;i++){c[i]=Math.log(1+100*(Math.sqrt(eLow[i]/HOP)+.4*Math.sqrt(eAll[i]/HOP)));if(c[i]>cmax)cmax=c[i];}
  for(let i=1;i<nO;i++){const d=c[i]-c[i-1];on[i]=d>0?d:0;}
  const fps=sr/HOP;
  const score=(bpm,step)=>{const P=fps*60/bpm;let best=-1,bp=0;for(let ph=0;ph<P;ph+=step){let s=0,cnt=0;for(let t=ph;t<nO-1;t+=P){const i=t|0,f=t-i;s+=on[i]*(1-f)+on[i+1]*f;cnt++;}s/=Math.max(1,cnt);if(s>best){best=s;bp=ph;}}return[best,bp];};
  let bestBpm=120,bestS=-1;
  for(let b=87.5;b<175;b+=.25){const[s]=score(b,1);if(s>bestS){bestS=s;bestBpm=b;}}
  let fine=bestBpm;bestS=-1;
  for(let b=bestBpm-.3;b<=bestBpm+.3;b+=.01){const[s]=score(b,1);if(s>bestS){bestS=s;fine=b;}}
  let bpm=Math.round(fine*100)/100;if(Math.abs(bpm-Math.round(bpm))<.06)bpm=Math.round(bpm);
  const[,ph]=score(bpm,.1),beat=60/bpm;
  const first=frac((ph*HOP/sr+ANALYSIS_OFFSET)/beat)*beat;
  let ts=0;for(let i=0;i<nO;i++){if(c[i]>.35*cmax){ts=i*HOP/sr;break;}}
  let grid=first+Math.round((ts-first)/beat)*beat;if(grid<-.05)grid+=beat;
  const rmsDb=10*Math.log10(ss/n+1e-12);
  return{bpm,grid,rmsDb,key:skipKey?null:detectKey(L,R,sr,n),wf:{l:wl,m:wm,h:wh,scale:1/mx}};
}

/* ---------- pistes de démonstration (synthétisées, libres de droits) ---------- */
function synthDemo(def){
  const sr=ctx.sampleRate,B=60/def.bpm,bars=def.bars,n=Math.ceil((bars*4*B+.8)*sr),out=new Float32Array(n);
  let seed=def.seed>>>0;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
  const TAU=Math.PI*2,cache=new Map();
  // chaque son est rendu une seule fois puis recopié : la génération reste rapide
  const snd=(key,len,fn)=>{let a=cache.get(key);if(!a){const m=Math.round(len*sr);a=new Float32Array(m);for(let i=0;i<m;i++)a[i]=fn(i/sr);cache.set(key,a);}return a;};
  const put=(t0,amp,a)=>{const s0=Math.round(t0*sr),m=Math.min(n-s0,a.length);for(let i=0;i<m;i++)out[s0+i]+=amp*a[i];};
  const kick=snd('k',.4,t=>Math.sin(TAU*(46*t+(110/30)*(1-Math.exp(-30*t))))*Math.exp(-6*t)*(t<.002?t/.002:1));
  const noise=(dec)=>{let p=0;return t=>{const v=rnd(),y=v-p;p=v;return y*Math.exp(-t*dec);};};
  const hats=[0,1,2,3].map(i=>snd('h'+i,.08,noise(65)));
  const shk=[0,1].map(i=>snd('s'+i,.05,noise(90)));
  const claps=[0,1].map(i=>{let p=0;return snd('c'+i,.25,t=>{const v=rnd(),y=v-.6*p;p=v;return y*(t<.03?Math.exp(-(t%.01)*320):Math.exp(-(t-.03)*24));});});
  const tone=(f,dec,harm,len)=>snd('t'+f+'/'+dec+'/'+harm+'/'+len.toFixed(3),len,t=>{let s=0;for(let k=1;k<=harm;k++)s+=Math.sin(TAU*f*k*t)/k;return s*Math.min(1,t*300)*Math.exp(-t*dec)*Math.min(1,(len-t)*200);});
  const pad=(f,len)=>snd('p'+f+'/'+len,len,t=>{let s=0;for(let k=1;k<=4;k++)s+=Math.sin(TAU*f*k*t*(1+.002*k))/k;return s*Math.min(1,t/.3)*Math.min(1,(len-t)/.3);});
  const inR=(b,r)=>r&&b>=r[0]&&b<r[1];let hc=0;
  for(let b=0;b<bars;b++){
    const brk=inR(b,def.brk),root=def.roots[Math.floor(b/(def.rootBars||1))%def.roots.length];
    if(brk&&b===def.brk[0]){const len=(def.brk[1]-def.brk[0])*4*B;def.chord.forEach(f=>put(b*4*B,.06,pad(f,len)));}
    for(let q=0;q<4;q++){
      const t=(b*4+q)*B;
      if(!brk){put(t,.95,kick);put(t+B/2,.22,hats[hc++%4]);}
      if(def.clap&&!brk&&(q===1||q===3))put(t,.3,claps[q>>1]);
      if(def.shaker&&b>=8&&!brk)for(let s=1;s<4;s+=2)put(t+s*B/4,.07,shk[s>>1]);
      if(inR(b,def.bass)&&!brk){
        if(def.bassStyle==='roll')for(let s=1;s<4;s++)put(t+s*B/4,.42,tone(root,12,3,B/4*.9));
        else if(def.bassStyle==='synco'){if(q%2===0)put(t+B*.75,.5,tone(root,8,3,B*.5));else put(t+B/2,.45,tone(root*1.5,9,3,B*.4));}
        else put(t+B/2,.5,tone(root,7,3,B*.45));
      }
      if(inR(b,def.stabs)&&(q===0||q===2))def.chord.forEach(f=>put(t+B*.75,.08,tone(f,10,4,.3)));
      if(inR(b,def.arp))for(let s=0;s<4;s++)put(t+s*B/4,.055,tone(def.arpNotes[(q*4+s)%def.arpNotes.length],25,2,.15));
    }
  }
  let pk=0;for(let i=0;i<n;i++){const a=Math.abs(out[i]);if(a>pk)pk=a;}
  const g=.85/pk,buf=ctx.createBuffer(2,n,sr);for(let i=0;i<n;i++)out[i]*=g;
  buf.copyToChannel(out,0);buf.copyToChannel(out,1);return buf;
}
const DEMOS=[
  {title:'Néons',artist:'Démo Mixlab',genre:'House',bpm:124,bars:72,seed:7,key:{pc:9,minor:true},roots:[55,55,65.41,49],bass:[16,64],stabs:[32,48],arp:[32,48],chord:[220,261.63,329.63],arpNotes:[440,523.25,659.25,523.25]},
  {title:'Quai 9',artist:'Démo Mixlab',genre:'Tech house',bpm:127,bars:72,seed:99,key:{pc:5,minor:true},clap:true,shaker:true,roots:[43.65,51.91],rootBars:2,bass:[16,64],bassStyle:'roll',stabs:[32,56],chord:[174.61,207.65,261.63]},
  {title:'Halogène',artist:'Démo Mixlab',genre:'Techno',bpm:126,bars:64,seed:31,key:{pc:0,minor:true},clap:true,roots:[65.41,65.41,77.78,58.27],bass:[8,56],bassStyle:'synco',brk:[32,40],stabs:[40,56],arp:[40,56],chord:[261.63,311.13,392],arpNotes:[523.25,622.25,783.99,622.25]},
  {title:'Ligne 7',artist:'Démo Mixlab',genre:'Deep house',bpm:122,bars:64,seed:58,key:{pc:7,minor:true},shaker:true,roots:[49,49,58.27,43.65],bass:[16,56],stabs:[24,56],chord:[196,233.08,293.66],arp:[32,48],arpNotes:[392,466.16,587.33,466.16]}
];

/* ---------- sampler ---------- */
const SAMPLER={gain:ctx.createGain(),pads:[],playing:[]};
SAMPLER.gain.connect(bus.sum);SAMPLER.gain.gain.value=S.samplerVol;
function buildSamples(){
  const sr=ctx.sampleRate,TAU=Math.PI*2;let seed=12345;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
  const mk=(name,dur,fn)=>{const n=Math.round(dur*sr),d=new Float32Array(n);let st={};for(let i=0;i<n;i++)d[i]=fn(i/sr,st);let pk=1e-6;for(const v of d)pk=Math.max(pk,Math.abs(v));const b=ctx.createBuffer(2,n,sr);for(let i=0;i<n;i++)d[i]*=.8/pk;b.copyToChannel(d,0);b.copyToChannel(d,1);return{name,buf:b};};
  const saw=(f,t)=>2*frac(f*t)-1;
  SAMPLER.pads=[
    mk('Corne',1.6,t=>{const on=(t<.18)||(t>.24&&t<.42)||(t>.48&&t<1.5);const e=on?1:0;return e*[466,587,698].reduce((s,f)=>s+saw(f*(1+.003*Math.sin(TAU*6*t)),t),0)*Math.exp(-Math.max(0,t-1.2)*6);}),
    mk('Sirène',2.4,(t,s)=>{s.p=(s.p||0)+TAU*(700+260*Math.sin(TAU*1.4*t))/sr;return Math.sin(s.p)*Math.min(1,t*20)*Math.min(1,(2.4-t)*4);}),
    mk('Montée',4,(t,s)=>{s.p=(s.p||0)+TAU*(150+1800*Math.pow(t/4,2))/sr;return(Math.sin(s.p)*.5+rnd()*.5*(t/4))*(t/4);}),
    mk('Impact',2.5,(t,s)=>{s.p=(s.p||0)+TAU*(30+70*Math.exp(-t*8))/sr;return Math.sin(s.p)*Math.exp(-t*1.6)+rnd()*Math.exp(-t*14)*.6;}),
    mk('Laser',.7,(t,s)=>{const tt=t%.35;s.p=(s.p||0)+TAU*(2400*Math.exp(-tt*12)+80)/sr;return Math.sign(Math.sin(s.p))*.6*Math.exp(-tt*6);}),
    mk('Rembobinage',1.1,(t,s)=>{s.p=(s.p||0)+TAU*(900*Math.exp(-t*2.5)+40)/sr;return saw(1,s.p/TAU)*.5+rnd()*.25*Math.exp(-t*2);}),
    mk('Crash',2.4,(t,s)=>{const v=rnd(),y=v-(s.q||0);s.q=v;return y*Math.exp(-t*2.2);}),
    mk('Clap',.4,(t,s)=>{const v=rnd(),y=v-.6*(s.q||0);s.q=v;return y*(t<.03?Math.exp(-(t%.01)*320):Math.exp(-(t-.03)*20));})
  ];
}
function playSample(i){
  resumeAudio();
  const p=SAMPLER.pads[i];if(!p)return;
  if(SAMPLER.playing[i]){try{SAMPLER.playing[i].stop();}catch(e){}SAMPLER.playing[i]=null;return;}
  const s=ctx.createBufferSource();s.buffer=p.buf;s.connect(SAMPLER.gain);s.start();SAMPLER.playing[i]=s;s.onended=()=>{if(SAMPLER.playing[i]===s)SAMPLER.playing[i]=null;};
}

/* ---------- platine ---------- */
const DECK_IDS=['A','B','C','D'];
const decks=[];
const revCache=new WeakMap();
function revBuffer(tr){
  let r=revCache.get(tr);if(r)return r;
  const b=tr.buffer;r=ctx.createBuffer(b.numberOfChannels,b.length,b.sampleRate);
  for(let c=0;c<b.numberOfChannels;c++){const s=b.getChannelData(c),d=r.getChannelData(c),n=s.length;for(let i=0;i<n;i++)d[i]=s[n-1-i];}
  revCache.set(tr,r);return r;
}
class Deck{
  constructor(id){
    this.id=id;this.track=null;this.src=null;this.srcGain=null;this.playing=false;this.anchorPos=0;this.anchorTime=0;
    this.pitch=0;this.pitchRange=.08;this.keyLock=false;this.keyShift=0;this.nudgeDir=0;this.jogAcc=0;this.bend=0;
    this.sync=false;this.previewing=false;this.reverse=false;this.slip=false;this.slipShadow=null;this.slipDepth=0;
    this.loop={on:false,start:0,end:0,beats:0};this.lastLoop=null;this.loopIn=null;this.loopSize=4;this.jumpSize=4;this.rolling=0;this.hotHeld=-1;
    this.padMode='hot';this.lastStart=null;this.taps=[];this.cueOn=false;this.xfa=(id==='A'||id==='C')?'A':'B';this.playStart=0;
    const g=()=>ctx.createGain();
    this.srcBus=g();this.klDry=g();this.klWet=g();this.klWet.gain.value=0;this.shifter=new PitchShifter(ctx);
    this.auto=g();this.trim=g();this.low=bq('lowshelf',150);this.mid=bq('peaking',1000,.7);this.high=bq('highshelf',5000);
    this.fx=new FxUnit();this.hp=bq('highpass',10,.7);this.lp=bq('lowpass',22000,.7);this.pre=g();
    this.fader=g();this.xf=g();this.cueSend=g();this.cueSend.gain.value=0;this.an=ctx.createAnalyser();this.an.fftSize=1024;
    this.srcBus.connect(this.klDry);this.klDry.connect(this.auto);this.srcBus.connect(this.shifter.input);this.shifter.output.connect(this.klWet);this.klWet.connect(this.auto);
    this.auto.connect(this.trim);this.trim.connect(this.low);this.low.connect(this.mid);this.mid.connect(this.high);this.high.connect(this.fx.in);
    this.fx.out.connect(this.hp);this.hp.connect(this.lp);this.lp.connect(this.pre);
    this.pre.connect(this.fader);this.fader.connect(this.an);this.fader.connect(this.xf);this.xf.connect(bus.sum);this.pre.connect(this.cueSend);this.cueSend.connect(bus.cue);
    this.p={trim:.5,high:.5,mid:.5,low:.5,filter:.5,fader:.85,kill:{high:false,mid:false,low:false}};
    this.ui={};
  }
  get rate(){return(1+this.pitch)*(1+this.bend);}
  get bpm(){return this.track?this.track.bpm*(1+this.pitch):0;}
  get beatLen(){return 60/this.track.bpm;}
  get active(){return DECK_IDS.indexOf(this.id)<S.numDecks;}
  beatIdx(t){return(t-this.track.grid)/this.beatLen;}
  timeOfBeat(b){return this.track.grid+b*this.beatLen;}
  beatPos(){return this.beatIdx(this.position());}
  snap(t){return S.quantize&&this.track?this.timeOfBeat(Math.round(this.beatIdx(t))):t;}
  keyNow(){if(!this.track||!this.track.key)return null;return transposeKey(this.track.key,this.keyShift+(this.keyLock?0:12*Math.log2(1+this.pitch)));}
  position(){
    if(!this.track)return 0;if(!this.playing)return this.anchorPos;
    const now=ctx.currentTime;if(now<this.anchorTime)return this.anchorPos;
    const el=(now-this.anchorTime)*this.rate;
    if(this.reverse)return Math.max(0,this.anchorPos-el);
    let p=this.anchorPos+el;
    if(this.loop.on&&p>=this.loop.end){const L=this.loop.end-this.loop.start;p=this.loop.start+((p-this.loop.start)%L);}
    return Math.min(p,this.track.duration);
  }
  positionAt(when){return this.position()+Math.max(0,when-ctx.currentTime)*this.rate*(this.reverse?-1:1);}
  reanchor(){if(this.playing&&ctx.currentTime>this.anchorTime){this.anchorPos=this.position();this.anchorTime=ctx.currentTime;}}
  applyRate(){
    const t=ctx.currentTime;if(this.src)this.src.playbackRate.setValueAtTime(this.rate,t);
    const f=Math.pow(2,this.keyShift/12)/(this.keyLock?this.rate:1),wet=Math.abs(f-1)>.0015;
    if(wet)this.shifter.set(f);
    this.klDry.gain.setTargetAtTime(wet?0:1,t,.005);this.klWet.gain.setTargetAtTime(wet?1:0,t,.005);
  }
  load(tr){
    if(this.playing)this.pause();
    if(this.loop.on)this.loop.on=false;
    this.track=tr;this.reverse=false;this.slipShadow=null;this.slipDepth=0;this.anchorPos=tr.cue??tr.grid;this.lastStart=null;this.loopIn=null;this.lastLoop=null;
    this.applyAutoGain();
    if(this.sync)this.matchTempo(true);
    this.onLoad&&this.onLoad(tr);
  }
  applyAutoGain(){const db=S.autoGain&&this.track?clamp(-15-this.track.rmsDb,-9,9):0;this.auto.gain.setTargetAtTime(dbToGain(db),ctx.currentTime,.02);}
  startSource(pos,when){
    this.stopSource(when);
    const s=ctx.createBufferSource(),sg=ctx.createGain();
    const dur=this.track.duration;pos=clamp(pos,0,dur-.001);
    if(this.reverse){s.buffer=revBuffer(this.track);}
    else{s.buffer=this.track.buffer;if(this.loop.on){s.loop=true;s.loopStart=this.loop.start;s.loopEnd=this.loop.end;}}
    s.playbackRate.value=this.rate;
    sg.gain.setValueAtTime(0,when);sg.gain.linearRampToValueAtTime(1,when+.004);
    s.connect(sg);sg.connect(this.srcBus);
    s.start(when,this.reverse?clamp(dur-pos,0,dur-.001):pos);
    s.onended=()=>{if(this.src===s){this.src=null;this.srcGain=null;this.playing=false;this.anchorPos=this.reverse?0:dur;}};
    this.src=s;this.srcGain=sg;this.anchorPos=pos;this.anchorTime=when;this.playing=true;
  }
  stopSource(when){
    if(!this.src)return;
    const s=this.src,g=this.srcGain,t=Math.max(ctx.currentTime,when||0);this.src=null;this.srcGain=null;s.onended=null;
    try{g.gain.cancelScheduledValues(t);g.gain.setValueAtTime(g.gain.value,t);g.gain.linearRampToValueAtTime(0,t+.006);s.stop(t+.01);}catch(e){try{s.stop();}catch(_){}}
    setTimeout(()=>{try{g.disconnect();}catch(e){}},200);
  }
  syncTarget(){
    const m=S.master;if(m&&m!==this&&m.track&&m.active)return m;
    return decks.find(d=>d!==this&&d.active&&d.track&&d.playing)||null;
  }
  play(){
    if(!this.track||this.playing)return;
    resumeAudio();
    let pos=this.anchorPos,when=ctx.currentTime+.005;
    if(!this.reverse&&pos>=this.track.duration-.05)pos=this.track.cue??0;
    const o=this.syncTarget();
    if(this.sync&&o&&o.playing){
      this.matchTempo(true);
      const ob=o.beatPos(),next=Math.ceil(ob+.03);
      when=ctx.currentTime+(next-ob)*o.beatLen/o.rate;
      pos=this.timeOfBeat(Math.round(this.beatIdx(pos)));
    }
    this.startSource(pos,when);this.playStart=performance.now();
    this.lastStart={otherBeat:o&&o.playing?o.beatIdx(o.positionAt(when)):null,synced:this.sync,other:o};
    if(!S.master||!S.master.playing||!S.master.active)S.master=this;
    this.onPlay&&this.onPlay();
  }
  pause(){if(!this.playing)return;this.anchorPos=this.position();this.anchorTime=ctx.currentTime;this.stopSource();this.playing=false;}
  togglePlay(){this.previewing=false;this.playing?this.pause():this.play();}
  seek(pos){
    if(!this.track)return;pos=clamp(pos,0,this.track.duration-.01);
    if(this.loop.on&&(pos<this.loop.start-1e-4||pos>=this.loop.end))this.exitLoop();
    if(this.playing)this.startSource(pos,ctx.currentTime);else this.anchorPos=pos;
  }
  cueDown(){
    if(!this.track)return;
    if(this.playing&&!this.previewing){this.pause();this.seek(this.track.cue);return;}
    const pos=this.position();
    if(Math.abs(pos-this.track.cue)<.02){this.previewing=true;this.play();}
    else{this.track.cue=this.snap(pos);this.seek(this.track.cue);}
  }
  cueUp(){if(this.previewing){this.previewing=false;this.pause();this.seek(this.track.cue);}}
  hotDown(i,clear){
    if(!this.track)return;
    if(clear){this.track.hot[i]=null;return;}
    if(this.track.hot[i]==null){this.track.hot[i]=this.snap(this.position());return;}
    this.previewing=false;
    if(this.slip&&this.playing){this.slipBegin();this.hotHeld=i;}
    this.seek(this.track.hot[i]);
  }
  hotUp(i){if(this.hotHeld===i){this.hotHeld=-1;this.slipEnd();}}
  slipBegin(){
    if(!this.playing)return;
    if(this.slipShadow){this.slipDepth++;return;}
    this.reanchor();this.slipShadow={pos:this.position(),time:ctx.currentTime};this.slipDepth=1;
  }
  slipShadowPos(){const s=this.slipShadow;return s?s.pos+(ctx.currentTime-s.time)*this.rate:null;}
  slipEnd(){
    if(!this.slipShadow)return;if(--this.slipDepth>0)return;
    const target=this.slipShadowPos();this.slipShadow=null;
    if(this.playing)this.seek(target);
  }
  setLoop(start,end,beats){
    if(!this.track||end>this.track.duration||end<=start)return;
    this.reanchor();
    this.loop={on:true,start,end,beats};this.lastLoop={start,end,beats};
    if(this.reverse)this.setReverse(false);
    const p=this.position();
    if(this.src){this.src.loopStart=start;this.src.loopEnd=end;this.src.loop=true;}
    if(this.playing&&p>=end)this.seek(start+((p-start)%(end-start)));
  }
  loopAuto(beats){
    if(!this.track)return;
    beats=beats||this.loopSize;
    if(this.loop.on&&Math.abs(this.loop.beats-beats)<1e-6){this.exitLoop();return;}
    this.loopSize=beats;
    if(this.loop.on){this.setLoop(this.loop.start,this.loop.start+beats*this.beatLen,beats);return;}
    const pos=this.position(),q=Math.min(1,beats);
    const start=S.quantize?this.timeOfBeat(Math.floor(this.beatIdx(pos)/q+1e-6)*q):pos;
    this.setLoop(start,start+beats*this.beatLen,beats);
  }
  loopResize(f){
    const nb=clamp(this.loopSize*f,1/32,32);this.loopSize=nb;
    if(this.loop.on){const s=this.loop.start,e=s+nb*this.beatLen,p=this.position();this.setLoop(s,e,nb);if(this.playing&&p>=e)this.seek(s+((p-s)%(e-s)));}
  }
  loopInSet(){if(!this.track)return;this.loopIn=this.snap(this.position());}
  loopOutSet(){
    if(!this.track||this.loopIn==null)return;
    const e=this.snap(this.position());if(e<=this.loopIn+.02)return;
    this.setLoop(this.loopIn,e,(e-this.loopIn)/this.beatLen);this.loopIn=null;
  }
  reloop(){
    if(this.loop.on){this.exitLoop();return;}
    const l=this.lastLoop;if(!l)return;this.setLoop(l.start,l.end,l.beats);this.seek(l.start);
  }
  exitLoop(){this.reanchor();this.loop.on=false;if(this.src)this.src.loop=false;}
  rollStart(beats){
    if(!this.track||!this.playing)return;
    this.slipBegin();this.rolling=beats;
    const pos=this.position(),start=this.timeOfBeat(Math.floor(this.beatIdx(pos)/beats+1e-6)*beats);
    this.setLoop(start,start+beats*this.beatLen,beats);
  }
  rollEnd(beats){if(!this.rolling||(beats&&beats!==this.rolling))return;this.rolling=0;this.exitLoop();this.slipEnd();}
  beatJump(n){
    if(!this.track)return;const d=n*this.beatLen,p=this.position();
    if(this.loop.on){const l=this.loop;this.loop.on=false;this.seek(p+d);this.setLoop(l.start+d,l.end+d,l.beats);}
    else this.seek(p+d);
  }
  setReverse(on){
    if(!this.track||on===this.reverse)return;
    const p=this.position();
    if(on&&this.loop.on){this.loop.on=false;}
    this.reverse=on;
    if(this.playing)this.startSource(p,ctx.currentTime);else this.anchorPos=p;
  }
  censorDown(){if(!this.playing)return;this.slipBegin();this.setReverse(true);}
  censorUp(){if(!this.reverse)return;this.setReverse(false);this.slipEnd();}
  setPitch(p,user){
    if(user&&this.sync)this.sync=false;
    this.reanchor();this.pitch=clamp(p,-this.pitchRange,this.pitchRange);this.applyRate();
  }
  setRange(r){this.pitchRange=r;this.setPitch(this.pitch);}
  setKeyLock(on){this.keyLock=on;this.applyRate();}
  setKeyShift(s){this.keyShift=clamp(s,-6,6);this.applyRate();}
  matchTempo(quiet){
    const o=this.syncTarget();if(!this.track||!o)return true;
    let tb=o.bpm;const cands=[tb,tb*2,tb/2];tb=cands.reduce((a,b)=>Math.abs(b-this.track.bpm)<Math.abs(a-this.track.bpm)?b:a);
    const want=tb/this.track.bpm-1;
    if(Math.abs(want)>this.pitchRange){
      const r=[.08,.16,.5].find(x=>x>=Math.abs(want));
      if(r&&!quiet){this.setRange(r);this.onNotice&&this.onNotice('Plage de pitch passée à ±'+r*100+' % pour suivre le tempo');}
    }
    if(Math.abs(want-this.pitch)>1e-6)this.setPitch(want);
    return Math.abs(want)<=this.pitchRange;
  }
  toggleSync(){
    if(!this.track)return;
    this.sync=!this.sync;
    if(this.sync){
      const o=this.syncTarget();
      if(!o){this.sync=false;this.onNotice&&this.onNotice('Rien à suivre : charge et lance une autre platine');return;}
      if(!S.master)S.master=o;
      this.matchTempo(false);
      if(this.playing&&o.playing){const d=wrapHalf(o.beatPos()-this.beatPos());this.seek(this.position()+d*this.beatLen);}
    }
  }
  makeMaster(){S.master=S.master===this?null:this;if(S.master===this)this.sync=false;}
  nudge(dir){this.nudgeDir=dir;}
  jog(delta){
    if(!this.track)return;
    if(this.playing)this.jogAcc+=delta;else this.seek(this.position()+delta*.012);
  }
  tap(){
    const now=performance.now();if(this.taps.length&&now-this.taps[this.taps.length-1]>2000)this.taps=[];
    this.taps.push(now);if(this.taps.length>8)this.taps.shift();
    if(this.taps.length>=4&&this.track){const iv=(this.taps[this.taps.length-1]-this.taps[0])/(this.taps.length-1)/1000;this.setBpm(Math.round(6000/iv)/100);}
  }
  setBpm(b){if(!this.track)return;this.track.bpm=clamp(b,40,250);this.track.ov=null;}
  gridHere(){if(!this.track)return;const p=this.position(),ph=32*this.beatLen;this.track.grid=p-ph*Math.floor(p/ph);}
  gridNudge(ms){if(this.track)this.track.grid+=ms/1000;}
  tick(){
    const jb=clamp(this.jogAcc*.004,-.3,.3);this.jogAcc*=.8;if(Math.abs(this.jogAcc)<.05)this.jogAcc=0;
    const b=this.nudgeDir*.04+jb;
    if(b!==this.bend){this.reanchor();this.bend=b;this.applyRate();}
    if(this.sync&&this.track)this.matchTempo(true);
    if(this.track)this.fx.sync(this.track.bpm*(1+this.pitch));
  }
  barInfo(){
    if(!this.track)return null;const b=Math.floor(this.beatPos()+1e-4);
    if(b<0)return{pre:true,beat:0,bar:0,phrase:0,barIn:0};
    const bar=Math.floor(b/4);return{beat:b%4,bar,phrase:Math.floor(bar/8),barIn:bar%8};
  }
}
DECK_IDS.forEach(id=>decks.push(new Deck(id)));

/* ---------- mixer ---------- */
const eqDb=v=>v<=.01?-40:v<.5?Math.max(-40,20*Math.log10(v/.5)):(v-.5)/.5*6;
function applyMix(d){
  const p=d.p,t=ctx.currentTime,tc=.012;
  d.trim.gain.setTargetAtTime(dbToGain((p.trim-.5)*24),t,tc);
  d.high.gain.setTargetAtTime(p.kill.high?-40:eqDb(p.high),t,tc);
  d.mid.gain.setTargetAtTime(p.kill.mid?-40:eqDb(p.mid),t,tc);
  d.low.gain.setTargetAtTime(p.kill.low?-40:eqDb(p.low),t,tc);
  const f=p.filter;
  d.lp.frequency.setTargetAtTime(f<.47?20000*Math.pow(200/20000,(.47-f)/.47):22000,t,tc);
  d.hp.frequency.setTargetAtTime(f>.53?20*Math.pow(6000/20,(f-.53)/.47):10,t,tc);
  d.lp.Q.setTargetAtTime(f<.47?1.4:.7,t,tc);d.hp.Q.setTargetAtTime(f>.53?1.4:.7,t,tc);
  d.fader.gain.setTargetAtTime(p.fader*p.fader,t,tc);
  d.cueSend.gain.setTargetAtTime(d.cueOn?1:0,t,tc);
}
function xfGains(x){
  if(S.curve==='cut')return[x<.96?1:(1-x)/.04,x>.04?1:x/.04];
  if(S.curve==='smooth')return[Math.cos(x*Math.PI/2),Math.sin(x*Math.PI/2)];
  return[Math.min(1,2*(1-x)),Math.min(1,2*x)];
}
const xfGainOf=d=>{const[a,b]=xfGains(S.xf);return d.xfa==='A'?a:d.xfa==='B'?b:1;};
function applyXf(){const t=ctx.currentTime;decks.forEach(d=>d.xf.gain.setTargetAtTime(d.active?xfGainOf(d):0,t,.01));}
const audible=d=>d.active&&d.playing&&d.p.fader>.3&&xfGainOf(d)>.3;
const bassOn=d=>!d.p.kill.low&&d.p.low>.3;
decks.forEach(applyMix);applyXf();

/* ---------- bibliothèque ---------- */
const LIB={tracks:[],seq:0,playlists:[{id:'prep',name:'Préparation',ids:[]},{id:'warm',name:'Warm-up',ids:[]},{id:'peak',name:'Peak time',ids:[]}],history:[]};
function addTrack(buffer,meta){
  const a=analyze(buffer,!!meta.key);
  const tr={id:++LIB.seq,title:meta.title,artist:meta.artist||'',genre:meta.genre||'',buffer,duration:buffer.duration,
    bpm:a.bpm,grid:a.grid,key:meta.key||a.key,rmsDb:a.rmsDb,wf:a.wf,cue:null,hot:Array(8).fill(null),ov:null,demo:!!meta.demo,added:new Date(),plays:0,file:meta.file||null,path:meta.path||null};
  tr.cue=tr.grid;LIB.tracks.push(tr);window.Structure&&Structure.queue(tr);return tr;
}
