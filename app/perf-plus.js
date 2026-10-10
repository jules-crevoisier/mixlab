'use strict';
/* =====================================================================
   Mixlab · pads et sampler de performance
   - 16 hot cues par morceau (banques 1-8 et 9-16), hot cue maintenu à l'arrêt
     (Play pendant l'appui verrouille la lecture), séquences de hot cues
     enregistrées avec leur rythme, gardées par morceau, rejouées ou en boucle ;
   - boucles : réglage fin du début et de la fin (ms ou temps), ½ et ×2 depuis
     chaque bord, boucles actives (la boucle s'enclenche quand la tête de
     lecture arrive dessus) dessinées sur la waveform, pads Boucle auto ;
   - pads d'effets (Pad FX, Roll FX) : un effet des unités FX tant que le pad
     est maintenu ;
   - temps de retour du slip (fondu entre la boucle et la position fantôme) ;
   - sampler : 4 banques de 8, routage dans une voie (EQ, fader, crossfader),
     sampler au casque et pré-écoute d'un son au casque seul, capture de la
     boucle d'une platine, boucles calées qui suivent le tempo, séquenceur de
     16 pas calé sur la platine maître, styles de rythmes (kit synthétisé),
     looper par platine ou sur le master (N mesures, overdub).
   Rien n'est figé dans app.js : les fonctions de pads sont enveloppées et
   les boutons posés (et reposés) par une petite boucle de surveillance.
   ===================================================================== */
window.PerfPlus=(()=>{
  const DEF={hotStop:'hold',slipMs:0,smpRoute:'M',smpCue:false,smpBank:0,smpBeats:{},pfx:null,
    seq:{bank:1,genre:'house',bpm:124,steps:null},lpBars:2,lpVol:.9,adjStep:'b16'};
  const P={...DEF,...store.get('perfplus',{})};
  const save=()=>store.set('perfplus',P);
  const DP=Deck.prototype;
  const now=()=>ctx.currentTime;
  const BANK_N=4;
  // 8 couleurs de plus pour les hot cues 9 à 16
  if(HOT.length<16)HOT.push('#ff8a5c','#c9a227','#8bd450','#2ec4a0','#5ab0ff','#9a8cff','#d070ff','#ff6fa8');
  const ref=()=>{const m=S.master;if(m&&m.active&&m.playing&&m.track)return m;return decks.find(d=>d.active&&d.playing&&d.track)||null;};
  const spbOf=d=>d.beatLen/d.rate;

  /* ---------- infos gardées par morceau : hot cues 9-16, séquences, boucles actives ---------- */
  const T=store.get('perfplus.tracks',{});
  const tkey=t=>t.path||t._bk||('m:'+(t.artist||'')+'|'+t.title);
  function ensure16(tr){
    if(!tr)return;if(!Array.isArray(tr.hot))tr.hot=[];while(tr.hot.length<16)tr.hot.push(null);
    if(!Array.isArray(tr.hotMeta))tr.hotMeta=[];while(tr.hotMeta.length<16)tr.hotMeta.push(null);
    tr.cueSeqs=tr.cueSeqs||[];tr.loops=tr.loops||[];
  }
  const activeStarts=tr=>(tr.loops||[]).filter(l=>l.active).map(l=>+l.start.toFixed(4));
  function restoreTrack(tr){
    const short=tr.hot.length<16;ensure16(tr);
    const r=T[tkey(tr)];
    if(r){
      if(short||!tr._pp){(r.hb||[]).forEach((v,i)=>{if(i<8)tr.hot[8+i]=v==null?null:+v;});(r.hm||[]).forEach((m,i)=>{if(i<8)tr.hotMeta[8+i]=m||null;});}
      if(!tr._pp&&Array.isArray(r.seqs))tr.cueSeqs=r.seqs.map(s=>({name:s.name,len:+s.len,hits:(s.hits||[]).map(x=>({b:+x.b,i:+x.i}))}));
      if(Array.isArray(r.al))tr.loops.forEach(l=>{if(r.al.some(s=>Math.abs(s-l.start)<1e-3))l.active=true;});
    }
    tr._pp=1;tr._ppSig=null;
  }
  function saveTrack(tr){
    const k=tkey(tr),hb=tr.hot.slice(8,16),hm=tr.hotMeta.slice(8,16),al=activeStarts(tr);
    const o={};if(hb.some(v=>v!=null)){o.hb=hb;o.hm=hm;}if(tr.cueSeqs&&tr.cueSeqs.length)o.seqs=tr.cueSeqs;if(al.length)o.al=al;
    if(Object.keys(o).length)T[k]=o;else delete T[k];
    store.set('perfplus.tracks',T);
  }
  function syncTracks(){
    for(const d of decks){
      const tr=d.track;if(!tr)continue;
      if(!tr._pp||tr.hot.length<16||!tr.hotMeta||tr.hotMeta.length<16)restoreTrack(tr);
      const sig=JSON.stringify([tr.hot.slice(8),tr.hotMeta.slice(8),tr.cueSeqs,activeStarts(tr)]);
      if(sig!==tr._ppSig){if(tr._ppSig!=null)saveTrack(tr);tr._ppSig=sig;}
    }
  }
  const load0=DP.load;
  DP.load=function(tr){
    const r=load0.apply(this,arguments);
    if(this.ppSeq)this.ppSeq.play=null;
    if(this.track){restoreTrack(this.track);syncTracks();if(this.ui&&this.ui.pads)renderPads(this);}
    return r;
  };

  /* ---------- hot cues : banques, maintien à l'arrêt, verrou ---------- */
  const HOT_STOP=[['seek','Déplace seulement la tête de lecture'],['hold','Joue tant que le pad est maintenu (Play verrouille)'],['play','Lance la lecture']];
  const hotIdx=(d,i)=>i+8*(d.ppBank||0);
  function seqState(d){return d.ppSeq||(d.ppSeq={rec:null,play:null});}
  function hotPress(d,idx,e){
    const tr=d.track;if(!tr)return;ensure16(tr);
    if(e&&e.shiftKey){d.hotDown(idx,true);syncTracks();return;}
    const set=tr.hot[idx]!=null;
    if(set){const R=seqState(d).rec;if(R){if(R.t0==null){R.t0=now();R.bpm=d.bpm||120;}R.hits.push({b:(now()-R.t0)*R.bpm/60,i:idx});}}
    if(set&&!d.playing&&P.hotStop!=='seek'){d.hotDown(idx);d.play();d.ppLatch={i:idx,latched:P.hotStop==='play'};}
    else d.hotDown(idx);
    if(!set)syncTracks();
  }
  function hotRelease(d,idx){
    d.hotUp(idx);
    const L=d.ppLatch;if(!L||L.i!==idx)return;d.ppLatch=null;
    if(!L.latched&&d.track&&d.track.hot[idx]!=null){d.pause();d.seek(d.track.hot[idx]);}
  }
  const togglePlay0=DP.togglePlay;
  DP.togglePlay=function(){
    const L=this.ppLatch;
    if(L&&!L.latched&&this.playing){L.latched=true;return;}
    return togglePlay0.apply(this,arguments);
  };

  /* ---------- séquences de hot cues ---------- */
  function seqRecToggle(d){
    const st=seqState(d),tr=d.track;if(!tr){toast('Charge un morceau sur la platine '+d.id+' d’abord');return null;}
    if(!st.rec){st.rec={t0:null,hits:[],bpm:d.bpm||120};st.play=null;toast('Séquence : appuie sur tes hot cues, l’enregistrement démarre au premier appui');return null;}
    const R=st.rec;st.rec=null;
    if(R.t0==null||!R.hits.length){toast('Séquence vide : rien n’a été gardé');return null;}
    let len=(now()-R.t0)*R.bpm/60;
    if(S.quantize){len=Math.max(1,Math.round(len));R.hits.forEach(x=>{x.b=Math.round(x.b*4)/4;});R.hits=R.hits.filter(x=>x.b<len);}
    len=Math.max(len,R.hits[R.hits.length-1].b+.25);
    ensure16(tr);const s={name:'Séquence '+(tr.cueSeqs.length+1),len:+len.toFixed(4),hits:R.hits.map(x=>({b:+x.b.toFixed(4),i:x.i}))};
    tr.cueSeqs.push(s);syncTracks();toast('« '+s.name+' » gardée : '+s.hits.length+' appuis sur '+fmtBeats(s.len),'ok');return s;
  }
  const fmtBeats=b=>{const r=Math.round(b*100)/100;return(r%1?r.toFixed(2).replace(/0$/,''):r)+' temps';};
  function seqPlay(d,n,loop){
    const tr=d.track,st=seqState(d);if(!tr||!tr.cueSeqs||!tr.cueSeqs[n])return false;
    st.rec=null;
    let t0=now()+CLOOK;
    if(S.quantize&&d.playing){const bp=d.beatPos();t0=now()+(Math.ceil(bp+CLOOK/spbOf(d))-bp)*spbOf(d);}
    st.play={n,seq:tr.cueSeqs[n],t0,spb:60/(d.bpm||120),k:0,loop:!!loop};return true;
  }
  function seqStop(d){const st=seqState(d);st.play=null;}
  /* saut planifié à la date exacte ; s'il part en retard (machine chargée), on part plus loin dans le cue pour rester dans le temps */
  const CLOOK=.1;
  function fireHot(d,idx,when){
    const tr=d.track;if(!tr||tr.hot[idx]==null)return;const late=Math.max(0,now()-when),pos=tr.hot[idx]+(d.playing?late*d.rate:0);d.ppCue=idx;d.previewing=false;
    if(d.loop.on&&(pos<d.loop.start-1e-4||pos>=d.loop.end))d.exitLoop();
    if(!d.playing){d.seek(pos);d.play();return;}
    if(d.spinSt){d.seek(pos);return;}
    d.startSource(pos,Math.max(now(),when));
  }
  function cueSeqTick(d){
    const st=d.ppSeq;if(!st||!st.play)return;const p=st.play,H=p.seq.hits,t=now();
    while(p.k<H.length){const th=p.t0+H[p.k].b*p.spb;if(th>t+CLOOK)break;fireHot(d,H[p.k].i,th);p.k++;}
    if(p.k>=H.length&&t>=p.t0+p.seq.len*p.spb-CLOOK){
      if(!p.loop){st.play=null;return;}
      p.t0+=p.seq.len*p.spb;p.spb=60/(d.bpm||120);p.k=0;
    }
  }

  /* ---------- boucles : réglage fin, ½ et ×2 depuis chaque bord, boucles actives ---------- */
  const STEPS=[['ms1','1 ms',1,'ms'],['ms10','10 ms',10,'ms'],['b16','1/16 temps',1/16,'b'],['b4','1/4 temps',1/4,'b'],['b1','1 temps',1,'b']];
  const curLoop=d=>d.loop.on?d.loop:null;
  function stepSec(d,key){const s=STEPS.find(x=>x[0]===key)||STEPS[2];return s[3]==='ms'?s[2]/1000:s[2]*d.beatLen;}
  function loopSet(d,a,b){
    if(!d.track)return false;a=Math.max(0,a);b=Math.min(d.track.duration-.001,b);if(b-a<.01)return false;
    const p=d.position();d.setLoop(a,b,(b-a)/d.beatLen);
    if(d.playing&&(p<a-1e-4))d.seek(a);
    return true;
  }
  /* edge : 'start', 'end' ou 'both' ; n pas (négatif = plus tôt) */
  function loopAdjust(d,edge,n,key){
    const l=curLoop(d);if(!l){toast('Lance une boucle d’abord');return false;}
    const dt=n*stepSec(d,key||P.adjStep);let a=l.start,b=l.end;
    if(edge==='start'||edge==='both')a+=dt;if(edge==='end'||edge==='both')b+=dt;
    return loopSet(d,a,b);
  }
  /* from : 'start' (le début reste) ou 'end' (la fin reste) */
  function loopHalf(d,from){const l=curLoop(d);if(!l)return false;const L=(l.end-l.start)/2;return from==='end'?loopSet(d,l.end-L,l.end):loopSet(d,l.start,l.start+L);}
  function loopDouble(d,from){const l=curLoop(d);if(!l)return false;const L=(l.end-l.start)*2;return from==='end'?loopSet(d,l.end-L,l.end):loopSet(d,l.start,l.start+L);}
  function nextActive(d,pos){let best=null;for(const l of(d.track&&d.track.loops)||[])if(l.active&&l.start>pos&&(!best||l.start<best.start))best=l;return best;}
  function activeTick(d){
    if(!d.track||!d.playing||d.reverse){d._ppPrev=null;return;}
    const p=d.position(),q=d._ppPrev;d._ppPrev=p;
    if(q==null||d.loop.on||p<q||p-q>.5)return;
    for(const l of d.track.loops||[])if(l.active&&q<l.start&&p>=l.start&&p<l.end){d.setLoop(l.start,l.end,(l.end-l.start)/d.beatLen);break;}
  }
  function setActive(d,i,on){const l=d.track&&d.track.loops&&d.track.loops[i];if(!l)return;if(on)l.active=true;else delete l.active;syncTracks();}
  // repères sur la waveform : boucles actives, la prochaine avec le nombre de temps restant
  if(window.Structure&&Structure.drawLane){
    const dl0=Structure.drawLane;
    Structure.drawLane=function(g,d,t0,pps,W,H,dpr){
      const r=dl0.apply(this,arguments);
      try{
        const tr=d.track;if(!tr||!tr.loops||!tr.loops.some(l=>l.active))return r;
        const col=(window.TK&&TK['state-warn'])||'#ffb020',pos=d.position(),nx=nextActive(d,pos);
        for(const l of tr.loops){if(!l.active)continue;const x0=(l.start-t0)*pps,x1=(l.end-t0)*pps;if(x1<0||x0>W)continue;
          g.fillStyle=rgba(col,.10);g.fillRect(x0,H*.72,x1-x0,H*.28);g.fillStyle=rgba(col,.9);g.fillRect(x0,H*.72,x1-x0,2*dpr);g.fillRect(x0,H*.6,2*dpr,H*.4);
          if(l===nx){const n=Math.ceil(d.beatIdx(l.start)-d.beatIdx(pos)),t='Boucle dans '+n+' t';g.font=`600 ${10*dpr}px Inter,sans-serif`;g.fillText(t,x0+4*dpr,H*.72-4*dpr);}}
      }catch(e){}
      return r;
    };
  }

  /* ---------- slip : temps de retour ---------- */
  const SLIP_MS=[[0,'Immédiat'],[20,'20 ms'],[50,'50 ms'],[100,'100 ms'],[250,'250 ms'],[500,'500 ms']];
  const slipEnd0=DP.slipEnd;
  DP.slipEnd=function(){
    const ms=+P.slipMs||0;
    if(!ms||!this.slipShadow||this.slipDepth>1||!this.playing||!this.src||this.spinSt||!this.track)return slipEnd0.apply(this,arguments);
    const t=now(),T1=t+ms/1000,old=this.src,p=clamp(this.position(),0,this.track.duration-.01);
    const s=ctx.createBufferSource(),g=ctx.createGain();
    s.buffer=old.buffer;if(!this.reverse&&old.loop){s.loop=true;s.loopStart=old.loopStart;s.loopEnd=old.loopEnd;}
    s.playbackRate.value=this.rate;s.connect(g);g.connect(this.srcBus);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(1,t+.006);g.gain.linearRampToValueAtTime(0,T1);
    s.start(t,this.reverse?clamp(this.track.duration-p,0,this.track.duration-.001):p);s.stop(T1+.02);s.onended=()=>{try{g.disconnect();}catch(e){}};
    const r=slipEnd0.apply(this,arguments);
    if(this.srcGain){const sg=this.srcGain.gain;sg.cancelScheduledValues(t);sg.setValueAtTime(0,t);sg.linearRampToValueAtTime(1,T1);}
    this.ppGhost={s,g,until:T1};
    return r;
  };

  /* ---------- pads Boucle auto et Pad FX ---------- */
  const BLOOPS=[1/8,1/4,1/2,1,2,4,8,16];
  const PFX_DEF=[['echo',.5],['echo',.75],['reverb',1],['gate',.25],['lfo',1],['crush',1],['repeat',.25],['repeat',1/8]];
  const fxName=t=>{const f=FX_TYPES.find(x=>x[0]===t);return f?f[1]:t;};
  const pfxPad=i=>{const a=(Array.isArray(P.pfx)&&P.pfx[i])||PFX_DEF[i];return FX_TYPES.some(x=>x[0]===a[0])?a:['echo',a[1]];};
  const restoreTimers=new Map();
  function pfxDown(d,i){
    resumeAudio();
    if(d.ppFx)pfxUp(d,d.ppFx.i);
    const[type,beats]=pfxPad(i);
    const own=fxOf(d),other=FXU.find(u=>u!==own&&!u.on),u=!own.on?own:(other||own);
    if(restoreTimers.has(u)){clearTimeout(restoreTimers.get(u).t);restoreTimers.get(u).f();}
    const snap={on:u.on,mode:u.mode,beats:u.beats,slot:{...u.slots[0]},had:u.targets.has(d.id)};
    u.setMode('single');u.beats=beats;
    u.setSlot(0,{type,amount:FX_KIND[type]==='send'?.8:1});
    u.toggle(d.id,true);u.setOn(true);
    d.ppFx={i,u,snap,type};if(u.ui&&window.renderFxUnit)renderFxUnit(u);
  }
  function pfxUp(d,i){
    const F=d.ppFx;if(!F||F.i!==i)return;d.ppFx=null;
    const{u,snap}=F,q=S.quantize;S.quantize=false;try{u.setOn(false);}finally{S.quantize=q;}
    u.beats=snap.beats;u.setMode(snap.mode);u.toggle(d.id,snap.had);
    const back=()=>{restoreTimers.delete(u);if(!u.on){u.setSlot(0,snap.slot);if(u.ui&&window.renderFxUnit)renderFxUnit(u);}};
    if(snap.on){u.setSlot(0,snap.slot);u.setOn(true);}
    else if(snap.slot.type!==u.slots[0].type){const t=setTimeout(back,2500);restoreTimers.set(u,{t,f:()=>{clearTimeout(t);back();}});}
    else u.setSlot(0,snap.slot);
    if(u.ui&&window.renderFxUnit)renderFxUnit(u);
  }
  function pfxEditor(d,i,anchor){
    const cur=pfxPad(i);
    const ty=h('select',{class:'sel','aria-label':'Effet du pad'},FX_TYPES.map(([k,n])=>h('option',{value:k},n)));ty.value=cur[0];
    const bt=h('select',{class:'sel','aria-label':'Durée de l’effet'},FX_BEATS.map(b=>h('option',{value:b},beatsLabel(b)+' t')));bt.value=String(cur[1]);
    const upd=()=>{const L=(Array.isArray(P.pfx)?P.pfx:PFX_DEF).map(x=>x.slice());L[i]=[ty.value,+bt.value];P.pfx=L;save();renderPads(d);};
    ty.addEventListener('change',upd);bt.addEventListener('change',upd);
    Perf.popover(anchor,'Pad FX '+(i+1),[h('label',{class:'prow'},h('span',{class:'lbl'},'Effet'),ty),h('label',{class:'prow'},h('span',{class:'lbl'},'Durée'),bt),
      h('div',{class:'pe'},'L’effet passe par une unité FX libre (celle de la platine en priorité) et elle retrouve ses réglages au relâchement.'),
      h('div',{class:'pa'},h('button',{class:'b',type:'button',onclick:()=>{const L=(Array.isArray(P.pfx)?P.pfx:PFX_DEF).map(x=>x.slice());L[i]=PFX_DEF[i].slice();P.pfx=L;save();renderPads(d);Perf.close();}},'Effet d’origine'))]);
  }

  /* ---------- sampler : banques, routage, casque ---------- */
  const smpIdx=i=>i+8*(P.smpBank||0);
  const buildSamples0=window.buildSamples;
  window.buildSamples=function(){
    buildSamples0.apply(this,arguments);
    const add=kit();SAMPLER.pads.length=8;SAMPLER.pads.push(...add);
    SAMPLER.defaults=SAMPLER.pads.map(p=>({name:p.name,buf:p.buf}));
  };
  function kit(){
    const sr=ctx.sampleRate,TAU=Math.PI*2;let seed=777;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
    const mk=(name,dur,fn)=>{const n=Math.round(dur*sr),d=new Float32Array(n),st={};for(let i=0;i<n;i++)d[i]=fn(i/sr,st);let pk=1e-6;for(const v of d)pk=Math.max(pk,Math.abs(v));for(let i=0;i<n;i++)d[i]*=.85/pk;
      for(let i=0;i<Math.min(n,64);i++)d[n-1-i]*=i/64;const b=ctx.createBuffer(2,n,sr);b.copyToChannel(d,0);b.copyToChannel(d,1);return{name,buf:b,vol:.8,mode:'shot',custom:false};};
    const sweep=(f0,f1,k)=>(t,s)=>{s.p=(s.p||0)+TAU*(f1+(f0-f1)*Math.exp(-t*k))/sr;return Math.sin(s.p);};
    const hp=(t,s)=>{const v=rnd(),y=v-(s.q||0);s.q=v;return y;};
    const atk=t=>Math.min(1,t/.0015);
    const A=[ // banque 2 : kit de batterie (le séquenceur et les styles l'utilisent)
      mk('Kick',.5,(t,s)=>sweep(160,48,32)(t,s)*Math.exp(-t*7)*atk(t)),
      mk('Snare',.35,(t,s)=>(Math.sin(TAU*185*t)*.6*Math.exp(-t*22)+hp(t,s)*Math.exp(-t*15))*atk(t)),
      mk('Clap',.4,(t,s)=>{const v=rnd(),y=v-.6*(s.q||0);s.q=v;return y*(t<.03?Math.exp(-(t%.01)*320):Math.exp(-(t-.03)*20));}),
      mk('Charley',.09,(t,s)=>hp(t,s)*Math.exp(-t*55)),
      mk('Charley ouvert',.45,(t,s)=>hp(t,s)*Math.exp(-t*7)),
      mk('Tom',.45,(t,s)=>sweep(150,95,12)(t,s)*Math.exp(-t*8)*atk(t)),
      mk('Rim',.08,(t,s)=>(Math.sin(TAU*1700*t)+hp(t,s)*.4)*Math.exp(-t*60)),
      mk('Shaker',.14,(t,s)=>hp(t,s)*Math.sin(Math.PI*Math.min(1,t/.14))*.8)];
    const sq=(f,t)=>Math.sign(Math.sin(TAU*f*t));
    const B=[ // banque 3 : percussions et notes
      mk('Cloche',.4,t=>(sq(540,t)+sq(800,t))*.5*Math.exp(-t*9)),
      mk('Conga',.35,(t,s)=>sweep(330,220,25)(t,s)*Math.exp(-t*11)*atk(t)),
      mk('Clave',.12,t=>Math.sin(TAU*2500*t)*Math.exp(-t*45)),
      mk('Sub',.9,t=>Math.sin(TAU*55*t)*Math.min(1,t*200)*Math.exp(-t*2.5)),
      mk('Accord',.9,t=>[261.63,329.63,392].reduce((a,f)=>a+Math.sin(TAU*f*t)+.3*Math.sin(TAU*2*f*t),0)*Math.exp(-t*4)*atk(t)),
      mk('Stab mineur',.5,t=>[220,261.63,329.63].reduce((a,f)=>a+(2*frac(f*t)-1),0)*Math.exp(-t*9)*atk(t)),
      mk('Zap',.3,(t,s)=>sweep(3000,120,18)(t,s)*Math.exp(-t*8)),
      mk('Cymbale inversée',1.6,(t,s)=>hp(t,s)*Math.pow(t/1.6,3))];
    const C=Array.from({length:8},(_,i)=>({name:'Libre '+(i+1),buf:null,vol:.8,mode:'shot',custom:false}));
    return[...A,...B,...C];
  }
  // routage : master ou une voie (le son passe par le gain, l'EQ, le filtre, les FX, le fader et le crossfader)
  SAMPLER.cue=ctx.createGain();SAMPLER.cue.gain.value=0;SAMPLER.cue.connect(bus.cue);
  function routeNode(r){const d=decks.find(x=>x.id===r);return d?d.trim:bus.sum;}
  function setRoute(r){
    if(r!=='M'&&!DECK_IDS.includes(r))r='M';
    try{SAMPLER.gain.disconnect();}catch(e){}
    SAMPLER.gain.connect(routeNode(r));SAMPLER.gain.connect(SAMPLER.cue);P.smpRoute=r;save();
  }
  function setCue(on){P.smpCue=!!on;SAMPLER.cue.gain.setTargetAtTime(on?1:0,now(),.01);save();}
  setRoute(P.smpRoute);setCue(P.smpCue);
  // pré-écoute d'un son au casque seulement
  let pv=null;
  function preview(i){
    resumeAudio();const p=SAMPLER.pads[i];if(pv){try{pv.s.stop();}catch(e){}pv=null;}if(!p||!p.buf)return false;
    const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=p.buf;g.gain.value=p.vol??.8;s.connect(g);g.connect(bus.cue);s.start();
    pv={s,g,i};s.onended=()=>{try{g.disconnect();}catch(e){}if(pv&&pv.s===s)pv=null;};return true;
  }
  function setBank(b){P.smpBank=clamp(b|0,0,BANK_N-1);save();decks.forEach(d=>{if(d.ui&&d.ui.pads&&d.padMode==='smp')renderPads(d);});}
  // boucles calées : la durée en temps est connue, la lecture suit le tempo et garde la phase de la grille
  const samplerDown0=window.samplerDown;
  window.samplerDown=function(i){
    const p=SAMPLER.pads[i];if(!p||!p.buf||p.mode!=='loop')return samplerDown0.apply(this,arguments);
    resumeAudio();if(SAMPLER.playing[i]){samplerStop(i);return;}
    const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=p.buf;s.loop=true;g.gain.value=p.vol??.8;s.connect(g);g.connect(SAMPLER.gain);
    const r=ref(),dur=p.buf.duration;let t=now(),off=0,beats=p.beats||P.smpBeats[i]||null;
    if(r){const spb=spbOf(r);if(!beats)beats=Math.max(1,Math.pow(2,Math.round(Math.log2(dur/spb))));
      s.playbackRate.value=clamp(dur/(beats*spb),.25,4);
      const bp=r.beatPos(),nb=S.quantize?Math.ceil(bp+1e-3):bp;t=now()+(nb-bp)*spb;
      off=(((nb%beats)+beats)%beats)/beats*dur;}
    s.start(t,off);const v={s,g,t,beats,i,off};SAMPLER.playing[i]=v;s.onended=()=>{if(SAMPLER.playing[i]===v)SAMPLER.playing[i]=null;};
  };
  function loopFollow(){
    const r=ref();if(!r)return;const spb=spbOf(r);
    SAMPLER.playing.forEach(v=>{if(!v||!v.beats||!v.s.loop)return;const rt=clamp(v.s.buffer.duration/(v.beats*spb),.25,4);if(Math.abs(rt-(v.rt||0))>1e-4){v.rt=rt;v.s.playbackRate.setTargetAtTime(rt,now(),.03);}});
  }
  const saveSmpCfg=()=>store.set('sampler',SAMPLER.pads.map(p=>({name:p.name,vol:p.vol,mode:p.mode,custom:!!p.custom})));
  function wav(chs,sr){
    const n=chs[0].length,c=chs.length,b=new ArrayBuffer(44+n*c*2),v=new DataView(b);const s=(o,t)=>{for(let i=0;i<t.length;i++)v.setUint8(o+i,t.charCodeAt(i));};
    s(0,'RIFF');v.setUint32(4,36+n*c*2,true);s(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,c,true);v.setUint32(24,sr,true);v.setUint32(28,sr*c*2,true);v.setUint16(32,c*2,true);v.setUint16(34,16,true);s(36,'data');v.setUint32(40,n*c*2,true);
    let o=44;for(let i=0;i<n;i++)for(let k=0;k<c;k++){v.setInt16(o,clamp(chs[k][i],-1,1)*32767,true);o+=2;}return b;
  }
  const freeSlot=()=>{for(let i=24;i<32;i++)if(SAMPLER.pads[i]&&!SAMPLER.pads[i].buf)return i;return smpIdx(0);};
  async function toSampler(slot,chs,sr,name,beats){
    const ok=await Perf.loadSample(slot,wav(chs,sr),name);if(!ok)return null;
    const p=SAMPLER.pads[slot];p.mode='loop';p.beats=beats;P.smpBeats[slot]=beats;save();saveSmpCfg();
    decks.forEach(d=>{if(d.ui&&d.ui.pads&&d.padMode==='smp')renderPads(d);});return p;
  }
  /* capture la boucle en cours (ou la dernière) de la platine dans un slot du sampler */
  async function capture(d,slot){
    const l=d.loop.on?d.loop:d.lastLoop;if(!d.track||!l){toast('Lance une boucle sur la platine '+d.id+' d’abord');return null;}
    if(slot==null)slot=freeSlot();
    const b=d.track.buffer,sr=b.sampleRate,a=Math.round(l.start*sr),n=Math.round((l.end-l.start)*sr);
    const chs=[0,1].map(c=>b.getChannelData(Math.min(c,b.numberOfChannels-1)).slice(a,a+n));
    const beats=Math.round((l.end-l.start)/d.beatLen*1000)/1000;
    return toSampler(slot,chs,sr,'Boucle '+d.id+' '+fracLabel(beats)+' t',beats);
  }

  /* ---------- prise de son : AudioWorklet (repli ScriptProcessor) qui donne la date exacte des échantillons ---------- */
  let wk=null;
  function worklet(){
    if(wk)return wk;
    const code=`class T extends AudioWorkletProcessor{constructor(){super();this.on=true;this.n=0;this.f0=0;this.L=new Float32Array(2048);this.R=new Float32Array(2048);this.port.onmessage=e=>{if(e.data==='stop'){this.on=false;}};}
      process(ins){if(!this.on)return false;const x=ins[0];if(x&&x.length){const l=x[0],r=x[1]||x[0];if(this.n===0)this.f0=currentFrame;this.L.set(l,this.n);this.R.set(r,this.n);this.n+=l.length;
      if(this.n>=1024){this.port.postMessage({f:this.f0,l:this.L.slice(0,this.n),r:this.R.slice(0,this.n)});this.n=0;}}else this.n=0;return true;}}
      registerProcessor('pp-tap',T);`;
    // blob: d'abord ; data: quand la page vient d'un fichier (file://), où le blob est refusé
    const W=ctx.audioWorklet;
    wk=!W?Promise.resolve(false):W.addModule(URL.createObjectURL(new Blob([code],{type:'application/javascript'})))
      .catch(()=>W.addModule('data:application/javascript,'+encodeURIComponent(code))).then(()=>true,()=>false);
    return wk;
  }
  const sink=ctx.createGain();sink.gain.value=0;sink.connect(ctx.destination);
  /* tap(node, cb) : cb({t, l, r}) où t est la date (ctx) du premier échantillon ; renvoie {stop} */
  async function tap(node,cb){
    const ok=await worklet();
    if(ok){
      const n=new AudioWorkletNode(ctx,'pp-tap',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:2,channelCountMode:'explicit'});
      n.port.onmessage=e=>cb({t:e.data.f/ctx.sampleRate,l:e.data.l,r:e.data.r});node.connect(n);n.connect(sink);
      return{stop(){try{node.disconnect(n);}catch(e){}n.port.postMessage('stop');try{n.disconnect();}catch(e){}}};
    }
    const B=1024,sp=ctx.createScriptProcessor(B,2,1);
    sp.onaudioprocess=e=>{const x=e.inputBuffer;cb({t:e.playbackTime-B/ctx.sampleRate,l:x.getChannelData(0).slice(),r:x.getChannelData(1).slice()});};
    node.connect(sp);sp.connect(sink);
    return{stop(){try{node.disconnect(sp);}catch(e){}try{sp.disconnect();}catch(e){}}};
  }

  /* ---------- séquenceur 16 pas et styles de rythmes ---------- */
  const GENRES=[['house','House',124,{0:'x...x...x...x...',2:'....x.......x...',3:'.x.x.x.x.x.x.x.x',4:'..x...x...x...x.'}],
    ['techno','Techno',130,{0:'x...x...x...x...',2:'....x.......x...',3:'xxxxxxxxxxxxxxxx',4:'..x...x...x...x.',6:'......x.......x.'}],
    ['tech','Tech house',126,{0:'x...x...x...x...',2:'....x.......x...',3:'x.x.x.x.x.x.x.x.',4:'..x...x...x...x.',7:'.xx..xx..xx..xxx'}],
    ['hiphop','Hip-hop',90,{0:'x......xx.x.....',1:'....x.......x...',3:'x.x.x.x.x.x.x.x.'}],
    ['trap','Trap',140,{0:'x......x..x.....',2:'........x.......',3:'xxxxxxxxxxxxxxxx',6:'.......x.....x..'}],
    ['dnb','Drum and bass',174,{0:'x.........x.....',1:'....x.......x...',3:'x.x.x.x.x.x.x.x.',6:'.......x.x......'}],
    ['breaks','Breakbeat',130,{0:'x.....x..x......',1:'....x.......x...',3:'x.x.x.x.x.x.x.x.',4:'..............x.'}],
    ['dembow','Reggaeton',96,{0:'x...x...x...x...',1:'...x..x....x..x.',3:'x.x.x.x.x.x.x.x.'}],
    ['afro','Afro house',122,{0:'x...x...x...x...',5:'...x......x..x..',6:'..x..x....x..x..',7:'xxxxxxxxxxxxxxxx'}]];
  const emptySteps=()=>Array.from({length:8},()=>Array(16).fill(0));
  const SQ={on:false,last:null,clock:null,mode:null,hits:0};
  if(!P.seq||typeof P.seq!=='object')P.seq={...DEF.seq};
  if(!Array.isArray(P.seq.steps)||P.seq.steps.length!==8)P.seq.steps=stepsOf('house');
  function stepsOf(g){const G=GENRES.find(x=>x[0]===g);const s=emptySteps();if(G)for(const r in G[3])[...G[3][r]].forEach((c,k)=>{s[r][k]=c==='x'?1:0;});return s;}
  function setGenre(g){const G=GENRES.find(x=>x[0]===g);if(!G)return;P.seq.genre=g;P.seq.bank=1;P.seq.steps=stepsOf(g);P.seq.bpm=G[2];save();}
  function seqToggleStep(r,k){P.seq.steps[r][k]=P.seq.steps[r][k]?0:1;P.seq.genre='custom';save();}
  function seqStart(){resumeAudio();SQ.on=true;SQ.last=null;SQ.mode=null;SQ.clock={t0:now()+.05,bpm:+P.seq.bpm||120};}
  function seqHalt(){SQ.on=false;}
  function hit(slot,when){
    const p=SAMPLER.pads[slot];if(!p||!p.buf)return;
    const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=p.buf;g.gain.value=p.vol??.8;s.connect(g);g.connect(SAMPLER.gain);s.start(when);SQ.hits++;
    s.onended=()=>{try{g.disconnect();}catch(e){}};
  }
  const LOOK=.2;
  function seqClock(){
    const r=ref(),t=now();
    if(r){const spb=spbOf(r);return{bp:r.beatPos(),spb,mode:'deck:'+r.id,ref:r};}
    const c=SQ.clock;if(!c)return null;const spb=60/(c.bpm||120);return{bp:(t-c.t0)/spb,spb,mode:'int'};
  }
  function seqTick(){
    if(!SQ.on)return;const c=seqClock();if(!c)return;const t=now();
    if(c.mode!==SQ.mode){SQ.mode=c.mode;SQ.last=null;if(c.mode==='int'){SQ.clock={t0:t+.03,bpm:+P.seq.bpm||120};return;}}
    const lb=c.bp*4;
    if(SQ.last==null||lb<SQ.last-3||lb>SQ.last+8)SQ.last=Math.ceil(lb-1e-6)-1;
    for(let s=SQ.last+1;;s++){
      const tt=t+(s/4-c.bp)*c.spb;if(tt>t+LOOK)break;
      if(tt>=t-.03){const k=((s%16)+16)%16,b=clamp(P.seq.bank|0,0,BANK_N-1);for(let r=0;r<8;r++)if(P.seq.steps[r][k])hit(b*8+r,Math.max(t,tt));}
      SQ.last=s;
    }
  }
  const seqStepNow=()=>{const c=seqClock();if(!c||!SQ.on)return -1;return((Math.floor(c.bp*4)%16)+16)%16;};

  /* ---------- looper : N mesures du master ou d'une platine, overdub ---------- */
  class Looper{
    constructor(id){this.id=id;this.state='idle';this.dub=false;this.first=false;this.buf=null;this.len=0;this.t0=0;this.k=0;this.seg=0;this.srcs=[];this.tap=null;this.out=ctx.createGain();this.out.gain.value=P.lpVol;this.out.connect(bus.vol);this.bars=P.lpBars;this.beats=0;}
    source(){const d=decks.find(x=>x.id===this.id);return d?d.pre:bus.sum;}
    refDeck(){const d=decks.find(x=>x.id===this.id);return d&&d.playing&&d.track?d:ref();}
    /* départ : prochaine mesure de la platine de référence (avec Quantize), aligné sur un échantillon */
    startAt(){const r=this.refDeck(),sr=ctx.sampleRate;let t0=now()+.06;if(r&&S.quantize){const spb=spbOf(r),bp=r.beatPos(),nb=Math.ceil(bp/4+.015)*4;t0=now()+(nb-bp)*spb;}return Math.round(t0*sr)/sr;}
    async rec(bars){
      this.stop();resumeAudio();this.bars=+bars||this.bars||2;
      const r=this.refDeck(),spb=r?spbOf(r):.5,sr=ctx.sampleRate,N=Math.round(this.bars*4*spb*sr);
      this.len=N/sr;this.beats=this.bars*4;this.buf=[new Float32Array(N),new Float32Array(N)];this.t0=this.startAt();this.k=1;this.seg=0;this.state='rec';this.first=true;this.dub=false;
      const tp=await tap(this.source(),c=>this.write(c));if(this.state!=='rec'){tp.stop();return;}this.tap=tp;
    }
    write(c){
      if(!this.buf)return;
      const sr=ctx.sampleRate,N=this.buf[0].length,o=Math.round((c.t-this.t0)*sr),n=c.l.length,L=this.buf[0],R=this.buf[1];
      for(let j=0;j<n;j++){let x=o+j;if(x<0)continue;
        if(this.first&&x<N){L[x]+=c.l[j];R[x]+=c.r[j];}
        else if(this.dub&&x>=N){x%=N;L[x]+=c.l[j];R[x]+=c.r[j];}}
    }
    /* chaque passage est joué en deux morceaux : le dernier demi-seconde est copié plus tard, une fois enregistré */
    tick(){
      if(!this.buf||this.state==='idle')return;const t=now(),sr=ctx.sampleRate,N=this.buf[0].length;
      if(this.state==='rec'&&t>=this.t0+this.len)this.state='play';
      if(this.first&&t>this.t0+this.len+.3){this.first=false;if(!this.dub&&this.tap){this.tap.stop();this.tap=null;}}
      const cut=Math.max(1,N-Math.round(Math.min(.5,this.len/2)*sr)),segs=[[0,cut],[cut,N]];
      for(let guard=0;guard<8;guard++){
        const[a,b]=segs[this.seg],ts=this.t0+(this.k*N+a)/sr,te=ts+(b-a)/sr;
        if(ts-t>=.15)break;
        if(te>t+.005){
          const buf=ctx.createBuffer(2,b-a,sr);buf.copyToChannel(this.buf[0].subarray(a,b),0);buf.copyToChannel(this.buf[1].subarray(a,b),1);
          const s=ctx.createBufferSource();s.buffer=buf;s.connect(this.out);s.start(Math.max(t,ts),Math.max(0,t-ts));
          this.srcs.push(s);s.onended=()=>{this.srcs=this.srcs.filter(x=>x!==s);};
        }
        if(++this.seg>1){this.seg=0;this.k++;}
      }
    }
    async setDub(on){
      if(!this.buf||this.state==='idle')return false;
      this.dub=!!on;
      if(on&&!this.tap){const tp=await tap(this.source(),c=>this.write(c));if(this.dub&&!this.tap)this.tap=tp;else tp.stop();}
      return true;
    }
    stop(){this.srcs.forEach(s=>{try{s.stop();}catch(e){}});this.srcs=[];if(this.tap){this.tap.stop();this.tap=null;}this.state='idle';this.dub=false;this.first=false;}
    play(){
      if(!this.buf)return false;this.stop();resumeAudio();
      this.t0=this.startAt()-this.len;this.k=1;this.seg=0;this.state='play';return true;
    }
    clear(){this.stop();this.buf=null;this.len=0;}
    get status(){
      if(this.state==='rec')return now()<this.t0?'Départ à la prochaine mesure':'Enregistrement · '+this.bars+' mesure'+(this.bars>1?'s':'');
      if(this.state==='play')return this.dub?'Lecture et overdub':'Lecture en boucle';
      return this.buf?'Arrêté · boucle de '+this.bars+' mesure'+(this.bars>1?'s':'')+' prête':'Vide';
    }
  }
  const LOOPERS={};['M',...DECK_IDS].forEach(id=>LOOPERS[id]=new Looper(id));
  function setLpVol(v){P.lpVol=v;save();Object.values(LOOPERS).forEach(l=>l.out.gain.setTargetAtTime(v,now(),.02));}
  function looperToSampler(id,slot){
    const l=LOOPERS[id];if(!l||!l.buf){toast('Le looper est vide');return null;}
    return toSampler(slot==null?freeSlot():slot,l.buf,ctx.sampleRate,'Looper '+(id==='M'?'master':id),l.beats);
  }

  /* ---------- pads : enveloppes de app.js ---------- */
  PAD_MODES.push(['bloop','Loop','Boucle auto : un pad lance une boucle de la taille indiquée, le même pad l’arrête'],
    ['pfx','Pad FX','Pad FX : maintiens un pad pour lancer l’effet, relâche pour l’arrêter. Clic droit : choisir l’effet et la durée.']);
  const padDown0=window.padDown,padUp0=window.padUp,renderPads0=window.renderPads,padLights0=window.padLights;
  window.padDown=function(d,i,e){
    const m=d.padMode;
    if(m==='hot'){hotPress(d,hotIdx(d,i),e);renderPads(d);return;}
    if(m==='smp'){samplerDown(smpIdx(i));return;}
    if(m==='bloop'){if(d.track)d.loopAuto(BLOOPS[i]);return;}
    if(m==='pfx'){pfxDown(d,i);return;}
    return padDown0.apply(this,arguments);
  };
  window.padUp=function(d,i){
    const m=d.padMode;
    if(m==='hot'){hotRelease(d,hotIdx(d,i));return;}
    if(m==='smp'){samplerUp(smpIdx(i));return;}
    if(m==='bloop')return;
    if(m==='pfx'){pfxUp(d,i);return;}
    return padUp0.apply(this,arguments);
  };
  window.renderPads=function(d){
    renderPads0.apply(this,arguments);
    const m=d.padMode,tr=d.track;if(!d.ui||!d.ui.pads)return;
    d.ui.pads.forEach((p,i)=>{
      if(m==='hot'&&d.ppBank){const k=hotIdx(d,i);p.style.setProperty('--hc',hotColor(tr,k));p.textContent=hotName(tr,k)?short(hotName(tr,k),11):String(k+1);}
      else if(m==='smp'){const s=SAMPLER.pads[smpIdx(i)];p.textContent=s&&s.buf?short(s.name,11):'';}
      else if(m==='bloop')p.textContent=fracLabel(BLOOPS[i]);
      else if(m==='pfx'){const[t,b]=pfxPad(i);p.textContent=short(fxName(t).split(' / ')[0],9)+' '+beatsLabel(b);}
    });
    paintTools(d);
  };
  window.padLights=function(d){
    const m=d.padMode;if(!['hot','smp','bloop','pfx'].includes(m))return padLights0.apply(this,arguments);
    const tr=d.track;
    d.ui.pads.forEach((p,i)=>{
      let set=false,lit=false;
      if(m==='hot'){const k=hotIdx(d,i);set=!!(tr&&tr.hot[k]!=null);lit=d.hotHeld===k||!!(d.ppLatch&&d.ppLatch.i===k);}
      else if(m==='smp'){const s=SAMPLER.pads[smpIdx(i)];set=!!(s&&s.buf);lit=!!SAMPLER.playing[smpIdx(i)];}
      else if(m==='bloop')lit=d.loop.on&&Math.abs(d.loop.beats-BLOOPS[i])<1e-6;
      else if(m==='pfx')lit=!!(d.ppFx&&d.ppFx.i===i);
      p.classList.toggle('set',set);p.classList.toggle('lit',lit);
    });
  };
  const padMenu0=Perf.padMenu;
  Perf.padMenu=function(d,i,anchor){
    const m=d.padMode;
    if(m==='hot')return Perf.cueEditor(d,hotIdx(d,i),anchor);
    if(m==='smp')return Perf.sampleEditor(smpIdx(i),anchor);
    if(m==='pfx')return pfxEditor(d,i,anchor);
    if(m==='bloop')return tools(d,anchor,'loop');
    return padMenu0.apply(this,arguments);
  };
  const cueEditor0=Perf.cueEditor;
  Perf.cueEditor=function(d,i){if(d.track)ensure16(d.track);const r=cueEditor0.apply(this,arguments);setTimeout(syncTracks,0);return r;};
  // l'éditeur d'un son gagne la pré-écoute au casque
  const sampleEditor0=Perf.sampleEditor;
  Perf.sampleEditor=function(i){
    const r=sampleEditor0.apply(this,arguments);
    const pa=$('.popx .pa');if(pa&&SAMPLER.pads[i]&&SAMPLER.pads[i].buf)pa.prepend(h('button',{class:'b',type:'button',title:'Écoute ce son au casque seulement, sans l’envoyer au master',onclick:()=>preview(i)},'Casque'));
    return r;
  };

  /* ---------- boutons sur chaque platine : banque et outils ---------- */
  function bankPress(d){
    if(d.padMode==='smp'){setBank(((P.smpBank||0)+1)%BANK_N);return;}
    if(d.padMode!=='hot')d.padMode='hot';
    d.ppBank=d.ppBank?0:1;renderPads(d);
  }
  function paintTools(d){
    const X=d.ui&&d.ui.pp;if(!X)return;
    const smp=d.padMode==='smp';
    X.bank.textContent=smp?'S'+((P.smpBank||0)+1):(d.ppBank?'9-16':'1-8');
    X.bank.title=smp?'Banque du sampler ('+((P.smpBank||0)+1)+' sur '+BANK_N+') : clic pour passer à la suivante':'Banque de hot cues : 1 à 8 ou 9 à 16';
    X.bank.setAttribute('aria-label',smp?'Banque du sampler':'Banque de hot cues '+d.id);
  }
  // commandes sans bouton à l'écran (MIDI, clavier) : un élément détaché porte l'identifiant
  const ghost=id=>h('i',{'data-ctl':id});
  function attach(){
    for(const d of decks){
      if(!d.ui||!d.ui.tabs||!d.ui.tabs[0])continue;
      const row=d.ui.tabs[0].parentElement;if(!row)continue;
      if(!d.ui.pp||!row.contains(d.ui.pp.bank)){
        const D=d.id,X={};
        X.bank=h('button',{class:'b lst pp-bank',type:'button','data-ctl':D+'.hotbank'},'1-8');
        X.bank.addEventListener('click',()=>bankPress(d));
        X.tools=h('button',{class:'b lst pp-tools',type:'button','data-ctl':D+'.pptools',title:'Outils de performance : séquences de cues, réglage fin des boucles, sampler, séquenceur, looper','aria-label':'Outils de performance '+D},'⋯');
        X.tools.addEventListener('click',e=>tools(d,e.currentTarget));
        row.append(X.bank,X.tools);d.ui.pp=X;
        regBtn(D+'.hotbank','Banque de pads '+D,X.bank,()=>bankPress(d));
        regBtn(D+'.cueseqrec','Séquence de cues : enregistrer '+D,ghost(D+'.cueseqrec'),()=>seqRecToggle(d));
        regBtn(D+'.cueseqplay','Séquence de cues : lire '+D,ghost(D+'.cueseqplay'),()=>{const st=seqState(d);if(st.play)seqStop(d);else if(d.track&&d.track.cueSeqs&&d.track.cueSeqs.length)seqPlay(d,d.track.cueSeqs.length-1,true);});
        regBtn(D+'.loopstartback','Début de boucle plus tôt '+D,ghost(D+'.loopstartback'),()=>loopAdjust(d,'start',-1));
        regBtn(D+'.loopstartfwd','Début de boucle plus tard '+D,ghost(D+'.loopstartfwd'),()=>loopAdjust(d,'start',1));
        regBtn(D+'.loopendback','Fin de boucle plus tôt '+D,ghost(D+'.loopendback'),()=>loopAdjust(d,'end',-1));
        regBtn(D+'.loopendfwd','Fin de boucle plus tard '+D,ghost(D+'.loopendfwd'),()=>loopAdjust(d,'end',1));
        regBtn(D+'.looperrec','Looper : enregistrer '+D,ghost(D+'.looperrec'),()=>LOOPERS[D].rec(P.lpBars));
        paintTools(d);
      }
    }
    if(!ctl('seq.play'))regBtn('seq.play','Séquenceur : lecture',ghost('seq.play'),()=>{SQ.on?seqHalt():seqStart();});
  }

  /* ---------- fenêtre d'outils ---------- */
  let TL=null;
  const seg=(opts,cur,pick,aria)=>h('div',{class:'pp-seg',role:'group','aria-label':aria},opts.map(([v,l])=>h('button',{class:'b',type:'button','aria-pressed':String(v===cur),onclick:()=>pick(v)},l)));
  const sel=(opts,cur,pick,aria)=>{const s=h('select',{class:'sel','aria-label':aria},opts.map(([v,l])=>h('option',{value:v},l)));s.value=String(cur);s.addEventListener('change',()=>pick(s.value));return s;};
  const row=(l,...k)=>h('div',{class:'prow'},h('span',{class:'lbl'},l),h('div',{class:'pp-r'},k));
  const B=(txt,fn,title,cls)=>h('button',{class:'b'+(cls?' '+cls:''),type:'button',title:title||null,onclick:fn},txt);
  const TABS=[['cues','Cues'],['loop','Boucle'],['smp','Sampler'],['seq','Séquenceur'],['looper','Looper']];
  function tools(d,anchor,tab){
    const el=Perf.popover(anchor,'Platine '+d.id+' · performance',[h('div',{class:'pp-tabs'}),h('div',{class:'pp-body'})],()=>{TL=null;});
    el.classList.add('ppx');TL={d,el,anchor,tab:tab||(TL&&TL.tab)||store.get('perfplus.tab','cues')};render();
    return el;
  }
  // même placement que Perf.popover, refait quand le contenu change de taille
  function place(){
    const{el,anchor}=TL;if(!anchor||!anchor.isConnected)return;
    const r=anchor.getBoundingClientRect(),w=el.offsetWidth,hh=el.offsetHeight;
    let x=clamp(r.left+r.width/2-w/2,8,innerWidth-w-8),y=r.bottom+6;
    if(y+hh>innerHeight-8)y=r.top-hh-6>=8?r.top-hh-6:Math.max(8,innerHeight-hh-8);
    el.style.left=x+'px';el.style.top=y+'px';
  }
  function render(){
    if(!TL||!TL.el.isConnected){TL=null;return;}
    const{d,el}=TL,tabs=$('.pp-tabs',el),body=$('.pp-body',el);
    tabs.replaceChildren(seg(TABS,TL.tab,v=>{TL.tab=v;store.set('perfplus.tab',v);render();},'Outils'));
    body.replaceChildren(...({cues:vCues,loop:vLoop,smp:vSmp,seq:vSeq,looper:vLooper}[TL.tab]||vCues)(d));
    place();
  }
  const rr=fn=>(...a)=>{const r=fn(...a);if(r&&r.then)r.then(()=>render());else render();return r;};
  function vCues(d){
    const tr=d.track,st=seqState(d),out=[];
    out.push(row('Banque',seg([[0,'1 à 8'],[1,'9 à 16']],d.ppBank||0,rr(v=>{d.ppBank=v;if(d.padMode!=='hot')d.padMode='hot';renderPads(d);}),'Banque de hot cues')));
    out.push(row('À l’arrêt',sel(HOT_STOP,P.hotStop,v=>{P.hotStop=v;save();},'Hot cue à l’arrêt')));
    out.push(h('div',{class:'ps'},h('span',{class:'lbl'},'Séquences de hot cues'),
      B(st.rec?'Arrêter et garder':'Enregistrer',rr(()=>seqRecToggle(d)),'Enregistre tes appuis sur les hot cues avec leur rythme',st.rec?'pp-rec on':'pp-rec')));
    if(st.rec)out.push(h('div',{class:'pe pp-msg'},st.rec.t0==null?'Prêt : l’enregistrement démarre à ton premier hot cue.':'Enregistrement : '+st.rec.hits.length+' appui'+(st.rec.hits.length>1?'s':'')));
    const L=h('div',{class:'pl'});
    ((tr&&tr.cueSeqs)||[]).forEach((s,n)=>{
      const on=st.play&&st.play.n===n;
      const nm=h('input',{type:'text',class:'pin',value:s.name,maxlength:24,'aria-label':'Nom de la séquence'});nm.addEventListener('input',()=>{s.name=nm.value;syncTracks();});
      L.append(h('div',{class:'pr pp-sq'},nm,h('span',{class:'pn'},fmtBeats(s.len)),
        B(on?'Stop':'Lire',rr(()=>on?seqStop(d):seqPlay(d,n,false)),'Rejoue la séquence une fois',on&&!st.play.loop?'on':''),
        B('Boucle',rr(()=>on&&st.play.loop?seqStop(d):seqPlay(d,n,true)),'Rejoue la séquence en boucle',on&&st.play.loop?'on':''),
        B('×',rr(()=>{if(on)seqStop(d);tr.cueSeqs.splice(n,1);syncTracks();}),'Supprimer la séquence')));
    });
    if(!tr||!tr.cueSeqs||!tr.cueSeqs.length)L.append(h('div',{class:'pe'},'Aucune séquence. Enregistre une suite de hot cues : elle est gardée avec le morceau, suit le tempo et peut tourner en boucle.'));
    out.push(L);return out;
  }
  function vLoop(d){
    const l=curLoop(d),out=[];
    out.push(h('div',{class:'pe pp-msg'},l?'Boucle de '+fmtBeats((l.end-l.start)/d.beatLen)+' · '+fmtTime(l.start)+' à '+fmtTime(l.end):'Aucune boucle en cours.'));
    out.push(row('Pas',sel(STEPS.map(s=>[s[0],s[1]]),P.adjStep,v=>{P.adjStep=v;save();},'Pas du réglage fin')));
    const mv=(e,n)=>rr(()=>loopAdjust(d,e,n));
    out.push(row('Début',B('◁',mv('start',-1),'Début plus tôt'),B('▷',mv('start',1),'Début plus tard')));
    out.push(row('Fin',B('◁',mv('end',-1),'Fin plus tôt'),B('▷',mv('end',1),'Fin plus tard')));
    out.push(row('Déplacer',B('◁',mv('both',-1),'Toute la boucle plus tôt'),B('▷',mv('both',1),'Toute la boucle plus tard')));
    out.push(row('½',B('Garder le début',rr(()=>loopHalf(d,'start'))),B('Garder la fin',rr(()=>loopHalf(d,'end')))));
    out.push(row('×2',B('Vers l’avant',rr(()=>loopDouble(d,'start'))),B('Vers l’arrière',rr(()=>loopDouble(d,'end')))));
    const L=h('div',{class:'pl'}),tr=d.track;
    ((tr&&tr.loops)||[]).forEach((x,i)=>{const cb=h('input',{type:'checkbox','aria-label':'Boucle active '+(i+1)});cb.checked=!!x.active;cb.addEventListener('change',()=>setActive(d,i,cb.checked));
      L.append(h('label',{class:'pp-ck'},cb,h('span',{},(x.label||'Boucle '+(i+1))+' · '+fmtTime(x.start)+' · '+fmtBeats((x.end-x.start)/d.beatLen))));});
    out.push(h('div',{class:'ps'},h('span',{class:'lbl'},'Boucles actives'),B('+ Garder la boucle',rr(()=>{const c=d.loop.on?d.loop:d.lastLoop;if(!tr||!c)return toast('Lance une boucle d’abord');if(!tr.loops.some(y=>sameLoop(y,c)))tr.loops.push({start:c.start,end:c.end,label:'Boucle '+(tr.loops.length+1)});renderPads(d);}))));
    if(!tr||!tr.loops||!tr.loops.length)L.append(h('div',{class:'pe'},'Une boucle active s’enclenche toute seule quand la tête de lecture arrive dessus. Elle est dessinée sous la waveform.'));
    out.push(L);
    out.push(row('Retour du slip',sel(SLIP_MS,P.slipMs,v=>{P.slipMs=+v;save();},'Temps de retour du slip')));
    return out;
  }
  function vSmp(d){
    const out=[],b=P.smpBank||0;
    out.push(row('Banque',seg([0,1,2,3].map(i=>[i,String(i+1)]),b,rr(v=>setBank(v)),'Banque du sampler')));
    out.push(row('Sortie',sel([['M','Master'],...DECK_IDS.filter((id,i)=>i<S.numDecks).map(id=>[id,'Voie '+id+' (EQ, fader, crossfader)'])],P.smpRoute,v=>setRoute(v),'Sortie du sampler')));
    const cb=h('input',{type:'checkbox','aria-label':'Sampler au casque'});cb.checked=!!P.smpCue;cb.addEventListener('change',()=>setCue(cb.checked));
    out.push(h('label',{class:'pp-ck'},cb,h('span',{},'Sampler aussi au casque')));
    const L=h('div',{class:'pl'});
    for(let i=0;i<8;i++){const k=b*8+i,p=SAMPLER.pads[k];
      L.append(h('div',{class:'pr pp-sm'},h('span',{class:'pn'},String(i+1)),h('span',{class:'pp-nm'},p&&p.buf?p.name+(p.mode==='loop'?' · boucle':''):'Libre'),
        B('Casque',()=>preview(k),'Écouter au casque seulement'),B('Capturer',rr(()=>capture(d,k)),'Copie ici la boucle en cours de la platine '+d.id)));}
    out.push(L,h('div',{class:'pa'},B('Capturer la boucle de '+d.id,rr(()=>capture(d)),'Dans le premier slot libre de la banque 4')));
    return out;
  }
  function vSeq(){
    const out=[],c=seqClock();
    out.push(row('Style',sel([['custom','Personnalisé'],...GENRES.map(g=>[g[0],g[1]+' · '+g[2]])],P.seq.genre||'custom',v=>{if(v!=='custom')setGenre(v);render();},'Style de rythme')));
    out.push(row('Sons',sel([0,1,2,3].map(i=>[i,'Banque '+(i+1)]),P.seq.bank,v=>{P.seq.bank=+v;save();render();},'Banque du séquenceur')));
    const bpm=h('input',{type:'number',class:'pin pp-bpm',min:60,max:200,step:1,value:P.seq.bpm,'aria-label':'Tempo interne'});
    bpm.addEventListener('change',()=>{P.seq.bpm=clamp(+bpm.value||120,60,200);save();if(SQ.clock)SQ.clock.bpm=P.seq.bpm;});
    out.push(row('Tempo',bpm,h('span',{class:'pe'},'quand aucune platine ne joue')));
    const G=h('div',{class:'pp-grid',role:'grid','aria-label':'Pas du séquenceur'}),bk=P.seq.bank|0;
    for(let r=0;r<8;r++){const p=SAMPLER.pads[bk*8+r];G.append(h('span',{class:'pp-gl'},p&&p.buf?short(p.name,9):'—'));
      for(let k=0;k<16;k++){const on=!!P.seq.steps[r][k];G.append(h('button',{class:'pp-st'+(on?' on':'')+(k%4===0?' q':''),type:'button','aria-pressed':String(on),'aria-label':'Pas '+(k+1)+' '+(p?p.name:''),'data-k':k,onclick:e=>{seqToggleStep(r,k);e.currentTarget.classList.toggle('on');e.currentTarget.setAttribute('aria-pressed',String(!!P.seq.steps[r][k]));}}));}}
    out.push(G);
    out.push(h('div',{class:'pa'},B(SQ.on?'Stop':'Lecture',rr(()=>SQ.on?seqHalt():seqStart()),'Lance le séquenceur, calé sur la platine maître',SQ.on?'on':''),B('Effacer',rr(()=>{P.seq.steps=emptySteps();P.seq.genre='custom';save();}))));
    out.push(h('div',{class:'pe pp-msg pp-seqst'},seqStatus(c)));
    return out;
  }
  const seqStatus=c=>!SQ.on?'Arrêté':c&&c.ref?'Calé sur la platine '+c.ref.id+' · '+c.ref.bpm.toFixed(2)+' BPM':'Tempo interne · '+(+P.seq.bpm||120)+' BPM';
  function vLooper(d){
    const out=[];TL.lp=TL.lp||d.id;const L=LOOPERS[TL.lp];
    out.push(row('Source',sel([[d.id,'Platine '+d.id],['M','Master']],TL.lp,v=>{TL.lp=v;render();},'Source du looper')));
    out.push(row('Longueur',seg([1,2,4,8].map(n=>[n,n+(n>1?' mes.':' mes.')]),+P.lpBars,rr(v=>{P.lpBars=v;save();}),'Longueur du looper')));
    out.push(h('div',{class:'pa'},
      B(L.state==='rec'?'Enregistre…':'Enregistrer',rr(()=>L.rec(+P.lpBars)),'Enregistre la longueur choisie, départ à la prochaine mesure',L.state==='rec'?'pp-rec on':'pp-rec'),
      B('Overdub',rr(()=>L.setDub(!L.dub)),'Ajoute par-dessus la boucle pendant qu’elle tourne',L.dub?'on':''),
      B(L.state==='play'?'Stop':'Lire',rr(()=>L.state==='play'?L.stop():L.play()),'',L.state==='play'?'on':''),
      B('Effacer',rr(()=>L.clear()))));
    const vol=h('input',{type:'range',class:'prg',min:0,max:1,step:.01,value:P.lpVol,'aria-label':'Volume du looper'});vol.addEventListener('input',()=>setLpVol(+vol.value));
    out.push(row('Volume',vol));
    out.push(h('div',{class:'pa'},B('Vers le sampler',rr(()=>looperToSampler(TL.lp)),'Copie la boucle du looper dans le premier slot libre de la banque 4')));
    out.push(h('div',{class:'pe pp-msg pp-lpst'},L.status));
    return out;
  }
  function liveTools(){
    if(!TL)return;if(!TL.el.isConnected){TL=null;return;}
    if(TL.tab==='seq'){const s=$('.pp-seqst',TL.el);if(s)s.textContent=seqStatus(seqClock());const k=seqStepNow();$$('.pp-grid .pp-st',TL.el).forEach(b=>b.classList.toggle('now',+b.dataset.k===k));}
    if(TL.tab==='looper'){const s=$('.pp-lpst',TL.el),L=LOOPERS[TL.lp];if(s&&L)s.textContent=L.status;}
  }

  /* ---------- boucles de surveillance ---------- */
  let lastSlow=0;
  setInterval(()=>{
    for(const d of decks){cueSeqTick(d);activeTick(d);}
    seqTick();Object.values(LOOPERS).forEach(l=>l.tick());loopFollow();
    const t=performance.now();
    if(t-lastSlow>400){lastSlow=t;attach();syncTracks();liveTools();}
  },15);

  /* ---------- réglages pour la fenêtre Préférences ---------- */
  window.MixlabSettings=(window.MixlabSettings||[]).concat([
    {tab:'Performance',key:'perfplus.hotStop',label:'Hot cue à l’arrêt',type:'select',options:HOT_STOP,get:()=>P.hotStop,set:v=>{P.hotStop=v;save();}},
    {tab:'Performance',key:'perfplus.slipMs',label:'Temps de retour du slip',type:'select',options:SLIP_MS,get:()=>P.slipMs,set:v=>{P.slipMs=+v;save();}},
    {tab:'Performance',key:'perfplus.smpRoute',label:'Sortie du sampler',type:'select',options:[['M','Master'],...DECK_IDS.map(id=>[id,'Voie '+id])],get:()=>P.smpRoute,set:v=>setRoute(v)},
    {tab:'Performance',key:'perfplus.smpCue',label:'Sampler aussi au casque',type:'toggle',get:()=>!!P.smpCue,set:v=>setCue(!!v)},
    {tab:'Performance',key:'perfplus.lpBars',label:'Longueur du looper (mesures)',type:'select',options:[[1,'1'],[2,'2'],[4,'4'],[8,'8']],get:()=>P.lpBars,set:v=>{P.lpBars=+v;save();}}
  ]);

  /* ---------- styles ---------- */
  document.head.append(h('style',{},`
.pad.m-bloop{--hc:#3fd679}.pad.m-pfx{--hc:#ffb020}
.pad.m-bloop,.pad.m-pfx{color:color-mix(in srgb,var(--hc) 80%,#fff);border-color:color-mix(in srgb,var(--hc) 35%,#2a2e37)}
.tabs .pp-bank{min-width:34px;font:600 10px var(--num)}
.popx.ppx{width:min(470px,calc(100vw - 16px));max-height:min(600px,calc(100vh - 16px))}
.ppx .pp-seg{display:flex;gap:3px;flex-wrap:wrap}.ppx .pp-seg .b{flex:1 1 auto;height:24px}
.ppx .pp-seg .b[aria-pressed="true"]{color:var(--white);background:var(--s3);border-color:var(--ln2)}
.ppx .pp-tabs .pp-seg .b{height:26px}
.ppx .pp-body{display:grid;gap:7px}
.ppx .prow{grid-template-columns:86px minmax(0,1fr)}
.ppx .pp-r{display:flex;gap:5px;align-items:center;min-width:0}.ppx .pp-r>.b{flex:1;height:24px}.ppx .pp-r>.sel{flex:1;min-width:0}
.ppx .b.on{color:var(--white);border-color:var(--coach)}
.ppx .pp-rec.on{color:#fff;background:color-mix(in srgb,var(--warn) 45%,transparent)}
.ppx .pp-sq{grid-template-columns:minmax(0,1fr) auto auto auto auto}
.ppx .pp-sm{grid-template-columns:16px minmax(0,1fr) auto auto}
.ppx .pp-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.ppx .pp-ck{display:flex;gap:7px;align-items:center;font-size:12px;cursor:pointer}
.ppx .pp-bpm{width:70px;flex:none}
.ppx .pp-grid{display:grid;grid-template-columns:62px repeat(16,minmax(0,1fr));gap:2px;align-items:center}
.ppx .pp-gl{font-size:10px;color:var(--mu);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ppx .pp-grid .pp-st{height:18px;min-width:0;padding:0;border-radius:3px;border:1px solid var(--ln2);background:#14161a;cursor:pointer}
.ppx .pp-grid .pp-st.q{background:#1b1e24}
.ppx .pp-grid .pp-st.on{background:var(--coach);border-color:var(--coach)}
.ppx .pp-grid .pp-st.now{outline:1px solid var(--white)}
`));

  return{P,save,T,tkey,ensure16,syncTracks,hotPress,hotRelease,seqRecToggle,seqPlay,seqStop,seqState,
    loopAdjust,loopHalf,loopDouble,loopSet,setActive,nextActive,STEPS,BLOOPS,PFX_DEF,pfxPad,pfxDown,pfxUp,
    setRoute,setCue,preview,setBank,smpIdx,capture,toSampler,wav,tap,worklet,
    GENRES,setGenre,stepsOf,seqStart,seqHalt,seqToggleStep,get seq(){return SQ;},LOOPERS,setLpVol,looperToSampler,
    tools,attach,render:()=>render()};
})();
