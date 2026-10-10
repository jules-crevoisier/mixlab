'use strict';
/* =====================================================================
   Mixlab · interface
   Platines, mixer, effets, waveforms, bibliothèque, dispositions,
   MIDI (learn + voyants), clavier, boucle d'affichage.
   ===================================================================== */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
function h(tag,attrs,...kids){const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(v==null||v===false)continue;if(k==='class')e.className=v;else if(k.startsWith('on')&&typeof v==='function')e.addEventListener(k.slice(2),v);else e.setAttribute(k,v===true?'':v);}for(const k of kids.flat()){if(k==null||k===false)continue;e.append(k.nodeType?k:document.createTextNode(k));}return e;}
const store={get(k,d){try{const v=localStorage.getItem('mixlab2.'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem('mixlab2.'+k,JSON.stringify(v));}catch(e){}}};
function fmtTime(s,tenths=true){if(!isFinite(s))s=0;const neg=s<0;s=Math.abs(s);const m=Math.floor(s/60),r=s-m*60;return(neg?'-':'')+m+':'+(r<10?'0':'')+(tenths?r.toFixed(1):Math.floor(r));}
function toast(msg,cls){const t=h('div',{class:'toast '+(cls||'')},msg);$('#toasts').append(t);setTimeout(()=>t.remove(),3400);}
function fitCanvas(cv){const r=cv.getBoundingClientRect(),d=window.devicePixelRatio||1;const w=Math.round(r.width*d),hh=Math.round(r.height*d);if(w<2||hh<2)return false;if(cv.width!==w||cv.height!==hh){cv.width=w;cv.height=hh;}return true;}
const COL={A:'#2ec5e8',B:'#ff8f3a',C:'#ff5fa2',D:'#3fd68f'};
// Extensions audio acceptées : la même liste que AUDIO_EXT de src-tauri/src/files.rs et electron/main.js
// (le pont natif donne des fichiers sans type MIME : on se fie à l'extension).
const AUDIO_EXT=['mp3','wav','aif','aiff','flac','ogg','m4a','aac','opus'];
const AUDIO_RE=new RegExp('\\.('+AUDIO_EXT.join('|')+')$','i');
const isAudioFile=f=>!!f&&(/^audio\//.test(f.type||'')||AUDIO_RE.test(f.name||''));
const HOT=['#ff4d5e','#ffa53a','#ffd34d','#3fd679','#31d3c8','#2fa8ff','#7d6bff','#e86bff'];
/* Couleurs des waveforms : convention du métier (graves chauds, médiums verts, aigus froids),
   avec un mode additif « RGB », un mode monochrome et une palette pour daltoniens. */
const WAVE_MODES={
  '3b':{name:'3 bandes',l:'#ff3d55',m:'#36d27e',h:'#58a8ff',op:'source-over'},
  rgb:{name:'RGB',l:'#ff2a3c',m:'#22c55e',h:'#3b82f6',op:'lighter'},
  mono:{name:'Monochrome',l:'#8fa3bd',m:'#b9c7d8',h:'#eef2f7',op:'source-over'},
  cvd:{name:'Daltonien',l:'#ff9a2e',m:'#4a8cff',h:'#f2f4f8',op:'source-over'},
};
let BAND=WAVE_MODES[store.get('wave','3b')]||WAVE_MODES['3b'];
function setWaveMode(k){BAND=WAVE_MODES[k]||WAVE_MODES['3b'];store.set('wave',k);LIB.tracks.forEach(t=>{t.ov=null;});}
/* Couleur de tonalité : une teinte par position de la roue harmonique, la même pour A et B. */
const keyColor=ki=>ki?`hsl(${((ki.num-1)*30+200)%360} 80% ${ki.letter==='A'?64:74}%)`:'';
const ui={zoom:store.get('zoom',8),sel:null};
const deckById=id=>decks.find(d=>d.id===id);
const fracLabel=x=>x>=1?String(x):'1/'+Math.round(1/x);
['pointerdown','keydown'].forEach(ev=>document.addEventListener(ev,resumeAudio,true));

/* ---------- registre des commandes (souris, clavier, MIDI) ---------- */
const controls=new Map();
const regAbs=(id,label,el,set,get)=>controls.set(id,{kind:'abs',label,el,set,get});
const regBtn=(id,label,el,press,release)=>controls.set(id,{kind:'btn',label,el,press,release});
const regRel=(id,label,el,move)=>controls.set(id,{kind:'rel',label,el,move});
const ctl=id=>controls.get(id);

/* ---------- composants ---------- */
const NS='http://www.w3.org/2000/svg';
function svgEl(tag,attrs){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);return e;}
function knob(id,label,init,onChange,o={}){
  const R=12,C=2*Math.PI*R,A=.75*C,bip=o.bip!==false;
  const svg=svgEl('svg',{viewBox:'0 0 30 30',role:'slider','aria-label':o.aria||label,tabindex:0});
  const tr=svgEl('circle',{cx:15,cy:15,r:R,class:'tr','stroke-dasharray':`${A} ${C}`,transform:'rotate(135 15 15)'});
  const vl=svgEl('circle',{cx:15,cy:15,r:R,class:'vl',transform:'rotate(135 15 15)'});
  const cap=svgEl('circle',{cx:15,cy:15,r:8.5,class:'cap'}),ptr=svgEl('line',{x1:15,y1:15,x2:15,y2:8.5,class:'ptr'});
  svg.append(tr,vl,cap,ptr);
  const wrap=h('div',{class:'kn','data-ctl':id,title:o.title},svg,label?h('span',{},label):null);
  if(o.color)wrap.style.setProperty('--kc',o.color);
  let v=init;
  const render=()=>{ptr.setAttribute('transform',`rotate(${-135+270*v} 15 15)`);const s=bip?Math.min(v,.5):0,l=bip?Math.abs(v-.5):v;vl.setAttribute('stroke-dasharray',`${l*A} ${C}`);vl.setAttribute('stroke-dashoffset',String(-s*A));svg.setAttribute('aria-valuenow',Math.round(v*100));};
  const set=nv=>{v=clamp(nv,0,1);if(bip&&Math.abs(v-.5)<.012)v=.5;render();onChange(v);};
  let sy=0,sv=0;
  svg.addEventListener('pointerdown',e=>{svg.setPointerCapture(e.pointerId);sy=e.clientY;sv=v;});
  svg.addEventListener('pointermove',e=>{if(!svg.hasPointerCapture(e.pointerId))return;set(sv+(sy-e.clientY)/(e.shiftKey?600:130));});
  svg.addEventListener('dblclick',()=>set(init));
  svg.addEventListener('wheel',e=>{e.preventDefault();set(v-Math.sign(e.deltaY)*.03);},{passive:false});
  svg.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowRight'){set(v+.02);e.preventDefault();}if(e.key==='ArrowDown'||e.key==='ArrowLeft'){set(v-.02);e.preventDefault();}});
  render();regAbs(id,o.aria||label,wrap,set,()=>v);
  return{el:wrap,set,get:()=>v};
}
function btn(id,label,txt,cls,press,release,title){
  const b=h('button',{class:'b '+(cls||''),type:'button','data-ctl':id,title},txt);
  b.addEventListener('pointerdown',e=>{if(e.button!==0)return;press(e);});
  if(release){b.addEventListener('pointerup',()=>release());b.addEventListener('pointercancel',()=>release());b.addEventListener('pointerleave',e=>{if(e.buttons)release();});}
  b.addEventListener('click',e=>{if(e.detail===0){press(e);release&&release();}});
  regBtn(id,label,b,press,release);return b;
}
function playIcon(){const s=svgEl('svg',{viewBox:'0 0 24 14'});s.append(svgEl('path',{d:'M1 1 L10 7 L1 13 Z'}),svgEl('rect',{x:14,y:1,width:3,height:12}),svgEl('rect',{x:20,y:1,width:3,height:12}));s.style.width='24px';return s;}

/* ---------- effets ---------- */
/* Deux unités FX1 / FX2 : assignation aux platines et au master, mode Simple (1 effet, 3 réglages)
   ou Chaîne (3 effets en série), durée en temps, On quantisé sur le temps suivant quand Q est actif. */
function buildFx(){
  const P=$('#p-fx');P.innerHTML='';
  FXU.forEach(u=>P.append(buildFxUnit(u)));
  for(const d of decks){
    const D=d.id;
    Object.defineProperty(d.ui,'fx',{get:()=>fxOf(d).ui,configurable:true});
    // commandes historiques « Effet on A » / « Dosage effet A » : elles suivent l'unité assignée à la platine
    controls.set(D+'.fxon',{kind:'btn',label:'Effet on '+D,get el(){return fxOf(d).ui.on;},press:()=>{const u=fxOf(d);u.setOn(!u.on);}});
    controls.set(D+'.fxamt',{kind:'abs',label:'Dosage effet '+D,get el(){return fxOf(d).ui.amt.el;},set:v=>fxOf(d).ui.amt.set(v)});
  }
}
function buildFxUnit(u){
  const id=u.id,N='FX'+u.n,el=h('div',{class:'fxu',id:'fxu-'+u.n,'data-u':u.n});
  const asg=h('div',{class:'asg',title:'Où agit '+N+' : platines A à D, M = master'},FX_TARGETS.map(t=>{
    const f=()=>{u.toggle(t);renderFxUnit(u);};
    const b=h('button',{type:'button',class:t==='M'?'':'fxa-'+t,'data-t':t,'data-ctl':id+'.to'+t,'aria-label':N+' sur '+(t==='M'?'le master':'la platine '+t),onclick:f},t);
    regBtn(id+'.to'+t,N+' → '+(t==='M'?'master':t),b,f);return b;}));
  const mode=h('button',{class:'b',type:'button',title:'Simple : un effet et tous ses réglages. Chaîne : jusqu’à 3 effets en série.',onclick:()=>{u.setMode(u.mode==='single'?'chain':'single');renderFxUnit(u);}},'');
  const bv=h('b',{},beatsLabel(u.beats));
  const step=dir=>{const i=clamp(FX_BEATS.indexOf(u.beats)+dir,0,FX_BEATS.length-1);u.beats=FX_BEATS[i];bv.textContent=beatsLabel(u.beats);};
  const on=btn(id+'.on',N+' on','On','fxon',()=>u.setOn(!u.on),null,'Active l’unité. Avec Q, elle démarre sur le temps suivant. L’écho continue de résonner quand tu le coupes.');
  const slots=u.slots.map((c,i)=>{
    const sid=id+'.s'+(i+1),sel=h('select',{class:'sel','aria-label':N+' effet '+(i+1)},FX_TYPES.map(([k,n])=>h('option',{value:k},n)));
    const amt=knob(sid+'.amt','Dosage',c.amount,v=>{u.slots[i].amount=v;u.applyAll();},{bip:false,aria:N+' dosage '+(i+1),title:'Dosage de l’effet',color:'var(--coach)'});
    const k1=knob(sid+'.p1',' ',c.p1,v=>u.setSlot(i,{p1:v}),{bip:false,aria:N+' réglage 1','color':'var(--A)'});
    const k2=knob(sid+'.p2',' ',c.p2,v=>u.setSlot(i,{p2:v}),{bip:false,aria:N+' réglage 2','color':'var(--A)'});
    k1.el.classList.add('kp','kp1');k2.el.classList.add('kp','kp2');
    const so=btn(sid+'.on',N+' effet '+(i+1)+' on',String(i+1),'slon',()=>{u.setSlot(i,{on:!u.slots[i].on});},null,'Active cet effet de la chaîne');
    const box=h('div',{class:'slot'},sel,amt.el,k1.el,k2.el,so);
    sel.addEventListener('change',()=>{u.setSlot(i,{type:sel.value});k1.set(u.slots[i].p1);k2.set(u.slots[i].p2);renderFxUnit(u);});
    return{box,sel,amt,k1,k2,so};
  });
  el.append(h('span',{class:'tag'},N),asg,mode,h('div',{class:'bt',title:'Durée en temps, calée sur le BPM'},h('button',{class:'b',type:'button','aria-label':'Durée plus courte',onclick:()=>step(-1)},'‹'),bv,h('button',{class:'b',type:'button','aria-label':'Durée plus longue',onclick:()=>step(1)},'›')),
    on,h('div',{class:'slots'},slots.map(s=>s.box)));
  u.ui={root:el,on,bv,mode,asg,slots,get sel(){return slots[0].sel;},get amt(){return slots[0].amt;}};
  renderFxUnit(u);return el;
}
function renderFxUnit(u){
  const U=u.ui;if(!U)return;
  U.root.classList.toggle('single',u.mode==='single');U.root.classList.toggle('chain',u.mode==='chain');
  U.mode.textContent=u.mode==='single'?'Simple':'Chaîne';U.bv.textContent=beatsLabel(u.beats);
  $$('button',U.asg).forEach(b=>b.setAttribute('aria-pressed',String(u.targets.has(b.dataset.t))));
  U.slots.forEach((s,i)=>{const c=u.slots[i],P=FX_P[c.type]||[];s.sel.value=c.type;
    s.box.classList.toggle('np1',!P[0]);s.box.classList.toggle('np2',!P[1]);
    if(P[0])$('span',s.k1.el).textContent=P[0][0];if(P[1])$('span',s.k2.el).textContent=P[1][0];});
}
function fxFrame(){
  const now=ctx.currentTime;
  FXU.forEach(u=>{const U=u.ui;if(!U)return;const pend=u.pendAt>now;U.on.classList.toggle('on',u.on&&!pend);U.on.classList.toggle('pend',pend);
    U.slots.forEach((s,i)=>s.so.classList.toggle('on',u.slots[i].on));});
}

/* ---------- waveforms empilées ---------- */
function buildLanes(){
  const P=$('#p-wave');P.innerHTML='';
  const zb=h('div',{class:'zoomb'},h('button',{class:'b',title:'Dézoomer',onclick:()=>setZoom(ui.zoom*1.5)},'−'),h('button',{class:'b',title:'Zoomer',onclick:()=>setZoom(ui.zoom/1.5)},'+'));
  P.append(zb);
  for(const d of decks){const cv=h('canvas');const lane=h('div',{class:'lane','data-deck':d.id,id:'lane-'+d.id,title:'Glisse pour te déplacer dans le morceau'},cv);d.ui.lane=cv;scrubOn(lane,d,()=>cv);P.append(lane);}
}
function setZoom(z){ui.zoom=clamp(z,2,32);store.set('zoom',ui.zoom);}
function scrubOn(el,d,getCv){
  let lx=null;
  el.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;el.setPointerCapture(e.pointerId);lx=e.clientX;});
  el.addEventListener('pointermove',e=>{
    if(lx==null||!el.hasPointerCapture(e.pointerId)||!d.track)return;
    const dx=e.clientX-lx;lx=e.clientX;const cv=getCv();const pps=(cv.width/(window.devicePixelRatio||1))/ui.zoom/d.rate;
    if(d.playing)d.jogAcc-=dx*1.2;else d.seek(d.position()-dx/pps);
  });
  el.addEventListener('pointerup',()=>{lx=null;});
}

/* ---------- platines ---------- */
const ROLLS=[1/16,1/8,1/4,1/2,1,2,4,8],JUMPS=[-1,1,-4,4,-8,8,-16,16],PITCHES=[-5,-3,-2,-1,0,2,3,5];
const PAD_MODES=[['hot','Hot cue','Hot cue : un clic pose le repère, le suivant y saute. Clic droit ou appui long : nom et couleur. Maj+clic : effacer.'],
  ['roll','Roll','Roll : maintiens pour répéter la durée indiquée, le morceau reprend là où il en serait'],
  ['jump','Saut','Saut : avance ou recule du nombre de temps indiqué'],
  ['slice','Slicer','Slicer : les 8 temps en cours découpés en 8 tranches. Maintiens un pad pour rejouer sa tranche, relâche pour reprendre.'],
  ['sloop','Boucles','Boucles gardées : un pad rappelle sa boucle. Pad vide pendant une boucle : la garder. Clic droit : supprimer.'],
  ['pitch','Pitch','Pitch play : rejoue le dernier hot cue utilisé, transposé du nombre de demi-tons indiqué'],
  ['smp','Sampler','Sampler : un clic joue le son. Clic droit ou appui long : charger ton son, volume et mode de lecture.']];
const hotColor=(tr,i)=>tr&&tr.hotMeta&&tr.hotMeta[i]&&tr.hotMeta[i].color||HOT[i];
const hotName=(tr,i)=>tr&&tr.hotMeta&&tr.hotMeta[i]&&tr.hotMeta[i].name||'';
const sameLoop=(a,b)=>a&&b&&Math.abs(a.start-b.start)<1e-3&&Math.abs(a.end-b.end)<1e-3;
function padLoop(d,i){
  const tr=d.track;if(!tr)return;tr.loops=tr.loops||[];const l=tr.loops[i];
  if(l){if(d.loop.on&&sameLoop(d.loop,l))d.exitLoop();else d.recallLoop(l);return;}
  const cur=d.loop.on?d.loop:d.lastLoop;
  if(!cur){toast('Lance une boucle, puis appuie sur un pad vide pour la garder');return;}
  tr.loops.push({start:cur.start,end:cur.end,label:'Boucle '+(tr.loops.length+1)});renderPads(d);toast('Boucle gardée sur le pad '+tr.loops.length,'ok');
}
function padDown(d,i,e){
  const m=d.padMode;
  if(m==='hot')d.hotDown(i,e&&e.shiftKey);
  else if(m==='roll')d.rollStart(ROLLS[i]);
  else if(m==='jump')d.beatJump(JUMPS[i]);
  else if(m==='slice')d.sliceStart(i);
  else if(m==='sloop')padLoop(d,i);
  else if(m==='pitch')d.pitchPlay(PITCHES[i]);
  else samplerDown(i);
  if(m==='hot')renderPads(d);
}
function padUp(d,i){const m=d.padMode;if(m==='hot')d.hotUp(i);else if(m==='roll')d.rollEnd(ROLLS[i]);else if(m==='slice')d.sliceEnd(i);else if(m==='smp')samplerUp(i);}
const short=(t,n)=>t.length>n?t.slice(0,n-1)+'…':t;
function renderPads(d){
  const m=d.padMode,tr=d.track,M=PAD_MODES.find(x=>x[0]===m);
  d.ui.tabs.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.m===m)));
  d.ui.pads.forEach((p,i)=>{
    p.className='b pad'+(m==='hot'?'':' m-'+m);p.title=M[2];
    p.style.setProperty('--hc',m==='hot'?hotColor(tr,i):'');if(m!=='hot')p.style.removeProperty('--hc');
    const l=tr&&tr.loops&&tr.loops[i];
    p.textContent=m==='hot'?(hotName(tr,i)?short(hotName(tr,i),11):String(i+1)):m==='roll'?fracLabel(ROLLS[i]):m==='jump'?(JUMPS[i]>0?'+':'−')+Math.abs(JUMPS[i])
      :m==='slice'?String(i+1):m==='sloop'?(l?short(l.label||fracLabel((l.end-l.start)/d.beatLen),11):'·'):m==='pitch'?(PITCHES[i]>0?'+':PITCHES[i]<0?'−':'')+Math.abs(PITCHES[i])
      :SAMPLER.pads[i]?short(SAMPLER.pads[i].name,11):'';
  });
}
function padLights(d){
  const tr=d.track,m=d.padMode;let cur=-1;
  if(m==='slice'&&tr){const sb=d.beatIdx(d.slipShadowPos()??d.position());cur=((Math.floor(sb)%8)+8)%8;}
  d.ui.pads.forEach((p,i)=>{
    let set=false,lit=false;
    if(m==='hot'){set=!!(tr&&tr.hot[i]!=null);lit=d.hotHeld===i;}
    else if(m==='roll')lit=d.rolling===ROLLS[i];
    else if(m==='slice'){lit=d.slicing===i;set=cur===i;}
    else if(m==='sloop'){const l=tr&&tr.loops&&tr.loops[i];set=!!l;lit=!!(l&&d.loop.on&&sameLoop(d.loop,l));}
    else if(m==='pitch')lit=d.keyShift===PITCHES[i];
    else if(m==='smp')lit=!!SAMPLER.playing[i];
    p.classList.toggle('set',set);p.classList.toggle('lit',lit);
  });
}
function buildDeck(d){
  const P=$('#p-deck'+d.id),D=d.id;P.innerHTML='';
  d.ui.title=h('div',{class:'dk-title'},'Aucune piste');d.ui.artist=h('div',{class:'dk-artist'},'Glisse un morceau depuis la bibliothèque');
  d.ui.key=h('b',{class:'key'},'—');d.ui.bpm=h('b',{},'—');d.ui.time=h('b',{class:'time'},'—');
  P.append(h('div',{class:'dk-head'},h('div',{class:'dk-id'},D),h('div',{style:'min-width:0'},d.ui.title,d.ui.artist),
    h('div',{class:'dk-stat t'},h('span',{class:'lbl'},'Restant'),d.ui.time),
    h('div',{class:'dk-stat k',title:'Tonalité actuelle. En vert : compatible avec la platine maître.'},h('span',{class:'lbl'},'Tonalité'),d.ui.key),
    h('div',{class:'dk-stat'},h('span',{class:'lbl'},'BPM'),d.ui.bpm)));
  d.ui.ov=h('canvas');
  const ov=h('div',{class:'dk-ov',title:'Vue d’ensemble : clique pour te déplacer'},d.ui.ov);
  ov.addEventListener('pointerdown',e=>{if(!d.track)return;const r=ov.getBoundingClientRect();d.seek((e.clientX-r.left)/r.width*d.track.duration);});
  d.ui.dw=h('canvas');const dw=h('div',{class:'dk-wave'},d.ui.dw);scrubOn(dw,d,()=>d.ui.dw);
  // platine (jog)
  d.ui.plat=h('canvas');
  const plat=h('div',{class:'dk-plat','data-ctl':D+'.jog',title:'Platine : en lecture elle freine ou pousse (nudge), à l’arrêt elle déplace la tête de lecture'},d.ui.plat);
  let la=null;const ang=e=>{const r=plat.getBoundingClientRect();return Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2));};
  plat.addEventListener('pointerdown',e=>{plat.setPointerCapture(e.pointerId);la=ang(e);});
  plat.addEventListener('pointermove',e=>{if(la==null||!plat.hasPointerCapture(e.pointerId))return;const a=ang(e);let da=a-la;if(da>Math.PI)da-=2*Math.PI;if(da<-Math.PI)da+=2*Math.PI;la=a;d.jog(da/(2*Math.PI)*128);});
  plat.addEventListener('pointerup',()=>{la=null;});
  regRel(D+'.jog','Platine '+D,plat,v=>d.jog(v));
  // commandes centrales
  const B={};
  B.sync=btn(D+'.sync','Sync '+D,'Sync','',()=>d.toggleSync(),null,'Sync : cale le tempo et la phase sur la platine maître');
  B.master=btn(D+'.master','Master '+D,'Master','',()=>d.makeMaster(),null,'Master : les autres platines en Sync suivent celle-ci');
  B.kl=btn(D+'.keylock','Key lock '+D,'Key lock','',()=>d.setKeyLock(!d.keyLock),null,'Key lock : garde la tonalité quand tu changes le tempo');
  d.ui.keyd=h('span',{class:'keyd',title:'Transposition en demi-tons'},'0');
  const km=h('button',{class:'b',type:'button',title:'Transposer d’un demi-ton vers le bas',onclick:()=>d.setKeyShift(d.keyShift-1)},'−');
  const kp=h('button',{class:'b',type:'button',title:'Transposer d’un demi-ton vers le haut',onclick:()=>d.setKeyShift(d.keyShift+1)},'+');
  B.slip=btn(D+'.slip','Slip '+D,'Slip','',()=>{d.slip=!d.slip;},null,'Slip : après une boucle, un roll ou un hot cue maintenu, le morceau reprend là où il en serait');
  B.rev=btn(D+'.rev','Reverse '+D,'Rev','',()=>d.setReverse(!d.reverse),null,'Lecture à l’envers');
  B.cen=btn(D+'.censor','Censor '+D,'Censor','',()=>d.censorDown(),()=>d.censorUp(),'Maintiens : lecture à l’envers, puis reprise là où le morceau en serait');
  B.cue=btn(D+'.cue','Cue '+D,'Cue','big cue',()=>d.cueDown(),()=>d.cueUp(),'Cue : à l’arrêt, pose le point de départ. En lecture, y revient. Maintiens pour pré-écouter.');
  B.play=btn(D+'.play','Play '+D,playIcon(),'big play',()=>d.togglePlay(),null,'Lecture / pause');
  d.ui.b=B;
  const ctr=h('div',{class:'dk-ctr'},h('div',{class:'r dk-sm'},B.sync,B.master),h('div',{class:'r dk-ks'},B.kl,km,d.ui.keyd,kp),h('div',{class:'r dk-sl'},B.slip,B.rev,B.cen),h('div',{class:'r dk-tr'},B.cue,B.play));
  // colonne pitch
  d.ui.pv=h('span',{class:'pv'},'0.00%');
  const pitch=h('input',{type:'range',class:'fd v pitch',min:-1,max:1,step:.0005,value:0,'aria-label':'Pitch '+D});
  pitch.addEventListener('input',()=>d.setPitch(+pitch.value*d.pitchRange,true));
  pitch.addEventListener('dblclick',()=>d.setPitch(0,true));
  d.ui.pitch=pitch;
  const pw=h('div',{'data-ctl':D+'.pitch',style:'height:100%;display:flex;justify-content:center',title:'Pitch : en haut plus lent, en bas plus rapide. Double-clic : retour à 0.'},pitch);
  regAbs(D+'.pitch','Pitch '+D,pw,v=>d.setPitch((-1+2*v)*d.pitchRange,true),()=>(d.pitch/d.pitchRange+1)/2);
  const rng=h('select',{class:'sel','aria-label':'Plage du pitch '+D,title:'Plage du pitch'},[8,16,50].map(r=>h('option',{value:r},'±'+r)));
  rng.addEventListener('change',()=>d.setRange(+rng.value/100));d.ui.rng=rng;
  const nL=btn(D+'.nudgeL','Nudge − '+D,'‹','',()=>d.nudge(-1),()=>d.nudge(0),'Maintiens pour freiner un instant');
  const nR=btn(D+'.nudgeR','Nudge + '+D,'›','',()=>d.nudge(1),()=>d.nudge(0),'Maintiens pour pousser un instant');
  const pcol=h('div',{class:'dk-pitch'},d.ui.pv,pw,rng,h('div',{class:'r fixed'},nL,nR));
  // pads
  d.ui.tabs=PAD_MODES.map(([m,n,t])=>h('button',{class:'b',type:'button','data-m':m,title:t,onclick:()=>{d.padMode=m;renderPads(d);}},n));
  const listB=h('button',{class:'b lst',type:'button',title:'Cues mémoire et boucles gardées de ce morceau','aria-label':'Cues mémoire et boucles '+D,onclick:e=>Perf.cueList(d,e.currentTarget)},'☰');
  d.ui.pads=[];
  for(let i=0;i<8;i++){
    const p=btn(D+'.pad'+(i+1),'Pad '+(i+1)+' '+D,String(i+1),'pad',e=>padDown(d,i,e),()=>padUp(d,i),'');
    p.addEventListener('contextmenu',e=>{e.preventDefault();Perf.padMenu(d,i,p);});
    Perf.longPress(p,()=>Perf.padMenu(d,i,p));
    p.addEventListener('drop',e=>{if(d.padMode!=='smp'||!e.dataTransfer.files.length)return;e.preventDefault();e.stopPropagation();document.body.classList.remove('dragging');Perf.loadSampleFile(i,e.dataTransfer.files[0]);});
    d.ui.pads.push(p);
  }
  // boucles et saut
  d.ui.lsz=h('span',{class:'sz'},'4');d.ui.jsz=h('span',{class:'sz'},'4');
  B.lin=btn(D+'.loopin','Loop in '+D,'In','',()=>d.loopInSet(),null,'Début de boucle manuelle');
  B.lout=btn(D+'.loopout','Loop out '+D,'Out','',()=>d.loopOutSet(),null,'Fin de boucle manuelle : la boucle démarre');
  B.relp=btn(D+'.reloop','Reloop '+D,'Reloop','',()=>d.reloop(),null,'Relance la dernière boucle, ou en sort');
  B.lhalf=btn(D+'.loophalf','Boucle /2 '+D,'/2','',()=>d.loopResize(.5),null,'Divise la boucle par deux');
  B.ldbl=btn(D+'.loopdbl','Boucle ×2 '+D,'×2','',()=>d.loopResize(2),null,'Double la boucle');
  B.loop=btn(D+'.loop','Boucle auto '+D,'Loop','',()=>d.loopAuto(),null,'Boucle automatique de la taille affichée');
  B.jb=btn(D+'.jumpback','Saut arrière '+D,'◀','',()=>d.beatJump(-d.jumpSize),null,'Recule du nombre de temps affiché');
  B.jf=btn(D+'.jumpfwd','Saut avant '+D,'▶','',()=>d.beatJump(d.jumpSize),null,'Avance du nombre de temps affiché');
  d.ui.jsz.title='Clique pour changer la taille du saut';d.ui.jsz.style.cursor='pointer';
  d.ui.jsz.addEventListener('click',()=>{const L=[1,2,4,8,16,32];d.jumpSize=L[(L.indexOf(d.jumpSize)+1)%L.length];});
  const loopRow=h('div',{class:'r dk-loop'},B.lin,B.lout,B.relp,B.lhalf,d.ui.lsz,B.ldbl,B.loop,h('span',{class:'lbl',style:'margin-left:4px'},'Saut'),B.jb,d.ui.jsz,B.jf);
  const gridRow=h('div',{class:'r dk-grid'},h('span',{class:'lbl',style:'margin-right:2px'},'Grille'),
    btn(D+'.tap','Tap '+D,'Tap','',()=>d.tap(),null,'Tape le tempo (4 fois ou plus)'),
    h('button',{class:'b',type:'button',title:'Diviser le BPM par deux',onclick:()=>d.setBpm(d.track.bpm/2)},'BPM /2'),
    h('button',{class:'b',type:'button',title:'Doubler le BPM',onclick:()=>d.setBpm(d.track.bpm*2)},'BPM ×2'),
    h('button',{class:'b',type:'button',title:'Décaler la grille plus tôt (10 ms)',onclick:()=>d.gridNudge(-10)},'◁'),
    h('button',{class:'b',type:'button',title:'Décaler la grille plus tard (10 ms)',onclick:()=>d.gridNudge(10)},'▷'),
    h('button',{class:'b',type:'button',title:'La position actuelle devient le premier temps d’une phrase',onclick:()=>d.gridHere()},'1 ici'));
  P.append(ov,dw,h('div',{class:'dk-mid'},plat,ctr,pcol),h('div',{class:'dk-pads'},h('div',{class:'tabs'},d.ui.tabs,listB),h('div',{class:'pads'},d.ui.pads)),loopRow,gridRow);
  renderPads(d);
  d.onLoad=tr=>{d.ui.title.textContent=tr.title;d.ui.artist.textContent=[tr.artist,tr.genre].filter(Boolean).join(' · ');d.logged=false;renderPads(d);renderTable();window.Coach&&Coach.onLoad&&Coach.onLoad(d);};
  d.onNotice=m=>toast(m);
  P.addEventListener('dragover',e=>{e.preventDefault();});
  P.addEventListener('drop',e=>{
    e.preventDefault();e.stopPropagation();document.body.classList.remove('dragging');
    const id=e.dataTransfer.getData('text/mixlab-track');
    if(id){const tr=LIB.tracks.find(t=>t.id===+id);if(tr)loadTo(d,tr);return;}
    importFiles([...e.dataTransfer.files],d);
  });
}
function loadTo(d,tr){if(d.playing&&audible(d)){toast('La platine '+d.id+' est à l’antenne : mets-la en pause ou baisse son fader avant de charger');return;}d.load(tr);}

/* ---------- mixer ---------- */
function buildMixer(){
  const M=$('#p-mixer');M.innerHTML='';
  const mx=h('div',{class:'mx'}),chs={};
  const tips={trim:'Gain : règle-le pour que le VU-mètre reste sous le rouge',high:'Aigus : charleys, cymbales',mid:'Médiums : voix, synthés, mélodies',low:'Graves : kick et basse. Une seule piste à la fois avec les graves à fond.',filter:'Filtre et effet de voie : à gauche passe-bas (étouffé), à droite passe-haut (aminci). L’effet choisi sous MASTER (écho, bruit, espace) monte avec.'};
  for(const d of decks){
    const D=d.id,ch=h('div',{class:'ch','data-deck':D,id:'ch-'+D});d.ui.k={};d.ui.kill={};
    const mk=(param,label,o={})=>{const k=knob(D+'.'+param,label,.5,v=>{d.p[param]=v;applyMix(d);},{title:tips[param],aria:label+' '+D,...o});d.ui.k[param]=k;return k.el;};
    ch.append(h('div',{class:'nm'},D),mk('trim','GAIN'));
    for(const[band,label]of[['high','HI'],['mid','MID'],['low','LOW']]){
      const kb=h('button',{class:'kill',type:'button','data-ctl':D+'.kill'+band,title:'Kill : coupe complètement la bande','aria-label':'Kill '+label+' '+D});
      const tog=()=>setKill(d,band,!d.p.kill[band]);kb.addEventListener('click',tog);regBtn(D+'.kill'+band,'Kill '+label+' '+D,kb,tog);d.ui.kill[band]=kb;
      ch.append(h('div',{class:'eq'},mk(band,label),kb));
    }
    ch.append(mk('filter',colorLabel(),{color:'var(--coach)'}));
    const cue=btn(D+'.cuech','Casque '+D,'Cue','cueb',()=>{d.cueOn=!d.cueOn;applyMix(d);},null,'Écoute au casque (en mode Split : oreille gauche)');d.ui.cueb=cue;
    const vu=h('canvas',{class:'vu'});d.ui.vu=vu;
    const fd=h('input',{type:'range',class:'fd v up',min:0,max:1,step:.001,value:d.p.fader,'aria-label':'Fader '+D});
    const setF=v=>{d.p.fader=clamp(v,0,1);fd.value=d.p.fader;applyMix(d);};
    fd.addEventListener('input',()=>setF(+fd.value));
    const fw=h('div',{'data-ctl':D+'.fader',style:'display:flex',title:'Fader de voie'},fd);regAbs(D+'.fader','Fader '+D,fw,setF,()=>d.p.fader);d.ui.fader={set:setF};
    const xa=h('div',{class:'xfa',title:'Côté du crossfader : A, milieu (pas affecté) ou B'},['A','T','B'].map(s=>h('button',{type:'button','data-s':s,onclick:()=>{d.xfa=s;applyXf();renderXfa();}},s==='T'?'·':s)));d.ui.xfa=xa;
    ch.append(cue,h('div',{class:'fdr'},vu,fw),xa);chs[D]=ch;applyMix(d);
  }
  const mvuL=h('canvas',{class:'vu'}),mvuR=h('canvas',{class:'vu'});ui.mvu=[mvuL,mvuR];
  ui.lim=h('canvas',{class:'vu lim'});ui.limL=h('span',{class:'limt',title:'Limiteur du master : s’allume quand il réduit le volume pour éviter la saturation. Baisse les gains si ça reste allumé.'},'LIM');
  const cfx=h('select',{class:'sel mxs cfx','aria-label':'Effet de voie',title:'Effet de voie : ce que fait le potard FILTRE de chaque voie'},COLOR_FX.map(([k,n])=>h('option',{value:k},n)));
  cfx.value=S.colorFx;cfx.addEventListener('change',()=>setColorFx(cfx.value));ui.cfx=cfx;
  const eqm=h('select',{class:'sel mxs eqm','aria-label':'Mode d’EQ',title:'Isolateur : les potards coupent complètement la bande. Classique : plancher à -26 dB, comme un mixer de club.'},h('option',{value:'iso'},'EQ iso'),h('option',{value:'classic'},'EQ classique'));
  eqm.value=S.eqMode;eqm.addEventListener('change',()=>{S.eqMode=eqm.value;store.set('eqMode',S.eqMode);decks.forEach(applyMix);});
  const mk=knob('master','MASTER',S.masterVol,v=>setMasterVol(v),{bip:false,title:'Volume général'});
  const cm=knob('cuemix','MIX',S.cueMix,v=>{S.cueMix=v;applyCue();},{bip:false,title:'Casque : à gauche le cue seul, à droite le master'});
  const cv=knob('cuevol','CASQUE',S.cueVol,v=>{S.cueVol=v;applyCue();},{bip:false,title:'Volume du casque'});
  const sv=knob('samplervol','SAMPLER',S.samplerVol,v=>{S.samplerVol=v;SAMPLER.gain.gain.setTargetAtTime(v,ctx.currentTime,.01);},{bip:false,title:'Volume du sampler'});
  const split=btn('split','Split cue','Split','',()=>{setSplit(!S.split);},null,'Split : casque à gauche, master à droite, sur une seule carte son (câble répartiteur)');ui.split=split;
  const mst=h('div',{class:'mst'},h('div',{class:'nm'},'MASTER'),mk.el,h('div',{class:'mvu'},mvuL,mvuR,ui.lim),ui.limL,cm.el,cv.el,split,sv.el,cfx,eqm);
  mx.append(chs.C,chs.A,mst,chs.B,chs.D);
  const xf=h('input',{type:'range',class:'fd h',min:0,max:1,step:.001,value:S.xf,'aria-label':'Crossfader'});
  const setX=v=>{S.xf=clamp(v,0,1);xf.value=S.xf;applyXf();};
  xf.addEventListener('input',()=>setX(+xf.value));xf.addEventListener('dblclick',()=>setX(.5));
  const xw=h('div',{'data-ctl':'xf',title:'Crossfader. Double-clic : centrer.'},xf);regAbs('xf','Crossfader',xw,setX,()=>S.xf);ui.setX=setX;
  const curve=h('select',{class:'sel','aria-label':'Courbe du crossfader',title:'Courbe du crossfader'},h('option',{value:'mix'},'Mix'),h('option',{value:'smooth'},'Douce'),h('option',{value:'cut'},'Cut'));
  curve.value=S.curve;curve.addEventListener('change',()=>{S.curve=curve.value;applyXf();});
  M.append(mx,h('div',{class:'xf'},h('span',{class:'e',style:'color:var(--A)'},'A'),xw,h('span',{class:'e',style:'color:var(--B)'},'B'),curve));
  renderXfa();
}
const colorLabel=()=>S.colorFx==='filter'?'FILTRE':(COLOR_FX.find(c=>c[0]===S.colorFx)||['',''])[1].toUpperCase();
function setColorFx(ty){S.colorFx=ty;store.set('colorFx',ty);if(ui.cfx)ui.cfx.value=ty;decks.forEach(d=>{applyMix(d);const sp=d.ui.k&&$('span',d.ui.k.filter.el);if(sp)sp.textContent=colorLabel();});}
function drawLim(){const cv=ui.lim;if(!cv||!fitCanvas(cv))return;const g=cv.getContext('2d'),W=cv.width,H=cv.height,r=-(bus.lim.reduction||0);g.fillStyle='#050608';g.fillRect(0,0,W,H);g.fillStyle=r>3?'#ff4d5e':'#f5b83d';g.fillRect(0,0,W,H*clamp(r/12,0,1));ui.limL.classList.toggle('on',r>.5);}
function renderXfa(){decks.forEach(d=>$$('button',d.ui.xfa).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.s===d.xfa))));}
function setKill(d,band,on){d.p.kill[band]=on;d.ui.kill[band].classList.toggle('on',on);applyMix(d);}
function resetMixer(){
  for(const d of decks){
    for(const k of['trim','high','mid','low','filter'])d.ui.k[k].set(.5);
    for(const b of['high','mid','low'])setKill(d,b,false);
    d.ui.fader.set(.85);d.sync=false;d.setPitch(0);d.keyShift=0;d.applyRate();if(d.loop.on)d.exitLoop();d.fx.on=false;d.fx.apply();d.cueOn=false;applyMix(d);
    if(d.playing)d.pause();
  }
  S.master=null;ui.setX(.5);
}

/* ---------- bibliothèque ---------- */
const lib={view:'all',sort:{k:'added',dir:1},q:'',compat:false,recs:[],rows:[],rh:0,headSig:''};
const coll=new Intl.Collator('fr',{numeric:true,sensitivity:'base'});
/* Colonnes : k, intitulé n, cellule td(r), valeur de tri sv(t) (sans sv, pas de tri).
   library-pro.js en ajoute (note, couleur, énergie…) et permet d'en masquer. */
const COLS=[
  {k:'deck',n:'',td:r=>h('td',{},decks.filter(d=>d.active&&d.track===r.t).map(d=>h('span',{class:'ondeck',style:'background:'+COL[d.id]},d.id)))},
  {k:'idx',n:'#',td:r=>h('td',{class:'n'},r.when?r.when.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):String(r.n))},
  {k:'title',n:'Titre',td:r=>h('td',{style:'color:var(--white)'},r.t.title),sv:t=>t.title},
  {k:'artist',n:'Artiste',td:r=>h('td',{},r.t.artist),sv:t=>t.artist},
  {k:'bpm',n:'BPM',td:r=>h('td',{class:'n'+(r.bpmOk?' okb':'')},r.t.bpm.toFixed(2)),sv:t=>t.bpm},
  {k:'key',n:'Tonalité',td:r=>{const ki=keyInfo(r.t.key);return h('td',{class:'n'+(r.keyOk?' okk':''),title:r.keyOk?'Compatible avec la platine maître':''},ki?h('span',{class:'kchip',style:'--kc:'+keyColor(ki)},ki.code):'—',ki?' '+ki.name:'');},sv:t=>(keyInfo(t.key)?.num??99)+(t.key?.minor?0:.5)},
  {k:'dur',n:'Durée',td:r=>h('td',{class:'n'},fmtTime(r.t.duration,false)),sv:t=>t.duration},
  {k:'genre',n:'Genre',td:r=>h('td',{},r.t.genre),sv:t=>t.genre},
  {k:'plays',n:'Joué',td:r=>h('td',{class:'n'},String(r.t.plays)),sv:t=>t.plays},
  {k:'load',n:'Charger',td:r=>h('td',{},decks.filter(d=>d.active).map(d=>h('button',{class:'b ld',type:'button',style:'color:'+COL[d.id],title:'Charger sur la platine '+d.id,onclick:e=>{e.stopPropagation();loadTo(d,r.t);}},d.id)))},
];
const visCols=()=>COLS.filter(c=>!(window.LibPro&&LibPro.hidden(c.k)));
function buildLib(){
  const P=$('#p-lib');P.innerHTML='';
  const side=h('nav',{class:'side',id:'lib-side','aria-label':'Collection'});
  const q=h('input',{type:'search',placeholder:'Rechercher (/ ou Ctrl+F)',title:'Mots libres, ou par champ : bpm:120-126 key:8A key:~8A rating:>=4 tag:peak genre:house energie:>=7 couleur:rouge','aria-label':'Rechercher'});
  q.addEventListener('input',()=>{lib.q=q.value.trim().toLowerCase();lib.tw.scrollTop=0;renderTable();});
  const comp=h('button',{class:'tb compat',type:'button','aria-pressed':'false',title:'Ne montrer que les morceaux compatibles (tonalité et tempo) avec la platine maître'},'Compatibles');
  comp.addEventListener('click',()=>{lib.compat=!lib.compat;comp.setAttribute('aria-pressed',String(lib.compat));renderTable();});
  const addTo=h('select',{class:'sel','aria-label':'Ajouter le morceau sélectionné à une playlist'});
  addTo.addEventListener('change',()=>{const pl=LIB.playlists.find(p=>p.id===addTo.value);if(pl&&ui.sel){if(!pl.ids.includes(ui.sel))pl.ids.push(ui.sel);toast('Ajouté à « '+pl.name+' »','ok');renderSide();}addTo.value='';});
  lib.addTo=addTo;
  const file=h('label',{class:'tb filebtn imp'},'Importer',h('input',{type:'file',multiple:true,accept:'audio/*,'+AUDIO_EXT.map(e=>'.'+e).join(','),onchange:e=>{importFiles([...e.target.files],null);e.target.value='';}}));
  lib.count=h('span',{class:'count'},'');
  lib.thead=h('thead');lib.tbody=h('tbody');
  lib.tw=h('div',{class:'tw'},h('table',{class:'lt'},lib.thead,lib.tbody));
  lib.tw.addEventListener('scroll',()=>{if(!lib.raf)lib.raf=requestAnimationFrame(()=>{lib.raf=0;paintRows();});});
  P.append(side,h('div',{class:'libmain'},h('div',{class:'libbar'},q,comp,addTo,(window.Desktop&&Desktop.importButtons())||file,window.LibPro&&LibPro.bar(),lib.count),lib.tw));
  renderSide();renderTable();
}
function renderSide(){
  const s=$('#lib-side');if(!s)return;s.innerHTML='';
  const it=(view,name,count,extra)=>{const b=h('button',{class:'it',type:'button','aria-current':String(lib.view===view),onclick:()=>{lib.view=view;lib.tw.scrollTop=0;renderSide();renderTable();}},name,count!=null?h('span',{},String(count)):null);if(extra)extra(b);return b;};
  const dropTo=pl=>b=>{b.addEventListener('dragover',e=>{e.preventDefault();b.classList.add('drop');});b.addEventListener('dragleave',()=>b.classList.remove('drop'));b.addEventListener('drop',e=>{e.preventDefault();b.classList.remove('drop');const id=+e.dataTransfer.getData('text/mixlab-track');if(id&&!pl.ids.includes(id)){pl.ids.push(id);renderSide();toast('Ajouté à « '+pl.name+' »','ok');}});};
  s.append(h('div',{class:'sec lbl'},'Collection'),it('all','Tous les morceaux',LIB.tracks.length),it('demo','Démos',LIB.tracks.filter(t=>t.demo).length),it('imported','Importés',LIB.tracks.filter(t=>!t.demo).length));
  s.append(h('div',{class:'sec lbl'},'Playlists'));
  LIB.playlists.forEach(pl=>s.append(it('pl:'+pl.id,pl.name,pl.ids.length,b=>{dropTo(pl)(b);window.LibPro&&LibPro.plItem(b,pl);})));
  s.append(h('button',{class:'it',type:'button',style:'color:var(--mu)',onclick:()=>{const n=LIB.playlists.length+1;LIB.playlists.push({id:'p'+Date.now(),name:'Playlist '+n,ids:[]});renderSide();}},'+ Nouvelle playlist'));
  window.LibPro&&LibPro.side(s,it,'crates');
  s.append(h('div',{class:'sec lbl'},'Historique'),it('hist','Ce set',LIB.history.length));
  window.LibPro&&LibPro.side(s,it,'end');
  if(lib.recs.length){s.append(h('div',{class:'sec lbl'},'Enregistrements'));lib.recs.forEach(r=>s.append(h('a',{class:'it',href:r.url,download:r.name,style:'display:block;padding:4px 10px;color:var(--tx);font-size:12px'},r.label)));}
  if(lib.addTo){lib.addTo.innerHTML='';lib.addTo.append(h('option',{value:''},'Ajouter à…'),...LIB.playlists.map(p=>h('option',{value:p.id},p.name)));}
}
function refDeck(){const m=S.master;if(m&&m.active&&m.track)return m;return decks.find(d=>d.active&&d.playing&&d.track)||null;}
function trackRows(){
  let rows;
  if(lib.view==='hist')rows=LIB.history.map((x,i)=>({t:x.track,n:i+1,when:x.time}));
  else{
    let ts=LIB.tracks;
    if(lib.view==='demo')ts=ts.filter(t=>t.demo);else if(lib.view==='imported')ts=ts.filter(t=>!t.demo);
    else if(lib.view.startsWith('pl:')){const ix=new Map(LIB.tracks.map(t=>[t.id,t])),pl=LIB.playlists.find(p=>'pl:'+p.id===lib.view);ts=pl?pl.ids.map(id=>ix.get(id)).filter(Boolean):[];}
    else if(window.LibPro&&LibPro.owns(lib.view))ts=LibPro.viewTracks(lib.view);
    rows=ts.map((t,i)=>({t,n:i+1}));
  }
  const ref=refDeck();
  markCompat(rows);
  // Chaque mot doit se trouver dans un des champs, dans n'importe quel ordre (« 124 house » = « house 124 »).
  if(lib.q)rows=window.LibPro?LibPro.filter(rows,lib.q):rows.filter(({t})=>{const s=[t.title,t.artist,t.genre,t.bpm.toFixed(0),keyInfo(t.key)?.name,keyInfo(t.key)?.code].join(' ').toLowerCase();return lib.q.split(/\s+/).every(w=>s.includes(w));});
  if(lib.compat&&ref)rows=rows.filter(r=>r.keyOk&&r.bpmOk&&r.t!==ref.track);
  const k=lib.sort.k,dir=lib.sort.dir,c=COLS.find(c=>c.k===k),val=c&&c.sv?r=>c.sv(r.t):r=>r.n;
  if(!(k==='added'&&(lib.view==='hist'||(window.LibPro&&LibPro.keepOrder(lib.view)))))rows.sort((a,b)=>{const x=val(a),y=val(b);return(typeof x==='string'||typeof y==='string'?coll.compare(x||'',y||''):x-y)*dir;});
  return rows;
}
function markCompat(rows){
  const ref=refDeck(),rk=ref&&ref.keyNow(),rb=ref&&ref.bpm;
  rows.forEach(r=>{r.keyOk=!!(rk&&r.t.key&&keysCompatible(rk,r.t.key));r.bpmOk=!!(rb&&[1,2,.5].some(f=>Math.abs(r.t.bpm*f-rb)/rb<.06));});
}
/* La platine maître a bougé : on met à jour les pastilles des lignes affichées sans reconstruire la table. */
function refreshCompat(){
  if(!lib.tbody)return;markCompat(lib.rows);
  const cols=visCols(),ix=k=>cols.findIndex(c=>c.k===k),bi=ix('bpm'),ki=ix('key'),di=ix('deck');
  for(const tr of lib.tbody.children){
    const r=tr._r;if(!r)continue;
    if(bi>=0)tr.children[bi].classList.toggle('okb',r.bpmOk);
    if(ki>=0){const td=tr.children[ki];td.classList.toggle('okk',r.keyOk);td.title=r.keyOk?'Compatible avec la platine maître':'';}
    if(di>=0)tr.children[di].replaceWith(cols[di].td(r));
  }
}
function buildHead(){
  const cols=visCols(),sig=cols.map(c=>c.k).join();if(sig===lib.headSig)return;lib.headSig=sig;
  lib.thead.innerHTML='';
  lib.thead.append(h('tr',{},cols.map(c=>{const th=h('th',{'data-k':c.k,class:'c-'+c.k},c.n);if(c.sv)th.addEventListener('click',()=>{lib.sort=lib.sort.k===c.k?{k:c.k,dir:-lib.sort.dir}:{k:c.k,dir:1};renderTable();});return th;})));
}
function renderTable(){
  if(!lib.tbody)return;
  buildHead();
  $$('th',lib.thead).forEach(th=>th.classList.toggle('sorted',th.dataset.k===lib.sort.k));
  lib.rows=trackRows();
  lib.count.textContent=lib.rows.length+' morceau'+(lib.rows.length>1?'x':'');
  paintRows();
}
/* Seules les lignes visibles (et une marge) sont dans le DOM : la table reste fluide avec des milliers de morceaux. */
function paintRows(){
  const rows=lib.rows,cols=visCols(),tb=lib.tbody,rh=lib.rh||28;
  const n=Math.ceil((lib.tw.clientHeight||600)/rh)+30;
  let a=Math.max(0,Math.min(Math.floor(lib.tw.scrollTop/rh)-10,rows.length-n));a-=a%2;
  const b=Math.min(rows.length,a+n),pad=px=>h('tr',{class:'vpad','aria-hidden':'true'},h('td',{colspan:cols.length,style:'height:'+px+'px'}));
  tb.innerHTML='';tb.append(pad(a*rh));
  for(let i=a;i<b;i++){
    const r=rows[i],t=r.t;
    const tr=h('tr',{draggable:'true',class:ui.sel===t.id?'sel':''},cols.map(c=>c.td(r)));tr._r=r;
    tr.addEventListener('click',()=>{ui.sel=t.id;$$('tr.sel',tb).forEach(x=>x.classList.remove('sel'));tr.classList.add('sel');});
    tr.addEventListener('dblclick',e=>{if(window.LibPro){LibPro.autoLoad(t,e);return;}const d=decks.find(x=>x.active&&!x.playing)||null;if(d)loadTo(d,t);else toast('Toutes les platines jouent : glisse le morceau sur celle que tu veux remplacer');});
    tr.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/mixlab-track',String(t.id));e.dataTransfer.effectAllowed='copy';});
    window.LibPro&&LibPro.row(tr,r);
    tb.append(tr);
  }
  tb.append(pad((rows.length-b)*rh));
  if(b-a>1&&!lib.rh){const x=(tb.children[b-a].getBoundingClientRect().bottom-tb.children[1].getBoundingClientRect().top)/(b-a);if(x>10){lib.rh=x;paintRows();}}
  if(!rows.length)tb.append(h('tr',{},h('td',{colspan:cols.length,style:'padding:16px;color:var(--mu)'},lib.compat?'Aucun morceau compatible avec la platine maître.':lib.view.startsWith('pl:')?'Playlist vide : glisse des morceaux dessus.':(window.LibPro&&LibPro.empty(lib.view))||'Aucun morceau.')));
}
async function importFiles(files,deck){
  for(const f of files){
    if(!isAudioFile(f))continue;
    const path=window.Desktop?await Desktop.pathOf(f):null;
    if(path&&LIB.tracks.some(t=>t.path===path)){toast('« '+f.name+' » est déjà dans la bibliothèque');continue;}
    try{
      toast('Analyse de « '+f.name+' »…');
      await new Promise(r=>setTimeout(r,30));
      const ab=await f.arrayBuffer(),pre=window.Persist?await Persist.pre(ab,f.name):null; // tags et cache d'analyse
      const buf=await ctx.decodeAudioData(ab);
      const name=f.name.replace(/\.[^.]+$/,''),m=/^(.+?)\s+-\s+(.+)$/.exec(name);
      const tr=addTrack(buf,{title:m?m[2]:name,artist:m?m[1]:'',file:f.name,path,...(pre?pre.meta:{})});
      if(pre)await Persist.post(tr,pre);
      const ki=keyInfo(tr.key);toast('« '+tr.title+' » : '+tr.bpm.toFixed(2)+' BPM'+(ki?' · '+ki.code:''),'ok');
      renderSide();renderTable();
      if(deck){loadTo(deck,tr);deck=null;}
    }catch(e){toast('Impossible de lire « '+f.name+' » : format non pris en charge.');}
  }
}

/* ---------- dispositions ----------
   Chaque preset reprend les emplacements et les conventions d'une famille de logiciels
   du métier (jamais leurs noms, logos ou couleurs). Rien ne défile : View.fit répartit
   la hauteur entre waveforms, platines et bibliothèque, et réduit les platines si besoin. */
const PANELS={fx:'Effets',wave:'Waveforms',mixer:'Mixer',lib:'Bibliothèque'};
const twoRows=n=>n===2?[['deckA','mixer','deckB']]:[['deckA','mixer','deckB'],['deckC','mixer','deckD']];
const PRESETS={
  perf:{name:'Performance',title:'Waveforms parallèles sur toute la largeur, grandes platines, petit mixer et grande bibliothèque. Pensé pour jouer sur une table.',
    order:['fx','wave','BLOCK','lib'],block:n=>n===2?[['deckA','mixer','deckB']]:[['deckC','deckA','mixer','deckB','deckD']],show:['fx','wave','mixer','lib'],mixer:'compact',lane:{2:70,4:40},jog:{2:170,4:120},lib:.45},
  export:{name:'Préparation',title:'Préparer ses morceaux : un grand lecteur avec la structure, la liste des cues, l’éditeur de grille et la bibliothèque en grand. Pas de mixer ni d’effets.',
    order:['BLOCK','lib'],block:n=>n===2?[['big','m1','prep']]:[['big','m1','prep'],['big','m2','prep'],['big','m3','prep']],show:['lib'],prep:true,noJog:true,lane:{2:110,4:96},lib:.42},
  studio:{name:'Studio',title:'Effets en haut, A et C à gauche, B et D à droite autour du mixer complet, une waveform par platine. Dense.',
    order:['fx','BLOCK','lib'],block:twoRows,show:['fx','mixer','lib'],deckWaves:true,noJog:true,lane:{2:84,4:48},lib:.34},
  mix:{name:'Mix',title:'Waveforms parallèles avec compteur de temps et de phrase, grandes platines, mixer au centre, panneau latéral à onglets.',
    order:['wave','BLOCK','fx','lib'],block:twoRows,show:['wave','mixer','lib'],beatBar:true,side:true,lane:{2:62,4:38},jog:{2:190,4:120},lib:.34},
  ecole:{name:'École',title:'La disposition Mix en plus simple, avec le coach et ses leçons à droite.',
    order:['wave','BLOCK','fx','lib'],block:twoRows,show:['wave','mixer','lib'],coach:true,simple:true,beatBar:true,lane:{2:50,4:36},jog:{2:160,4:110},lib:.34}
};
const layout={preset:store.get('preset','ecole'),visible:new Set(store.get('visible',null)||PRESETS[store.get('preset','ecole')]?.show||PRESETS.ecole.show),coach:false,focus:'A',rows:[]};
if(!PRESETS[layout.preset])layout.preset='ecole';
function applyLayout(){
  const P=PRESETS[layout.preset],n=S.numDecks,vis=layout.visible,app=$('#app');
  let block=P.block(n);if(!vis.has('mixer'))block=block.map(r=>r.filter(x=>x!=='mixer'));
  // Préparation : la platine choisie occupe le grand lecteur, les autres se rangent dessous.
  const act=decks.filter(d=>d.active),big=act.find(d=>d.id===layout.focus)||act[0],rest=act.filter(d=>d!==big),slot={big,m1:rest[0],m2:rest[1],m3:rest[2]};
  decks.forEach(d=>{const el=$('#p-deck'+d.id),s=P.prep?Object.keys(slot).find(k=>slot[k]===d):null;el.style.gridArea=s||'deck'+d.id;el.classList.toggle('big',s==='big');});
  const ncol=block[0].length,rows=[],line=(a,kind)=>rows.push({a:Array(ncol).fill(a),kind});
  for(const it of P.order){
    if(it==='BLOCK'){if(rows.length&&rows[rows.length-1].kind==='wave')line('spw','split');block.forEach(r=>rows.push({a:r,kind:'deck'}));}
    else if(vis.has(it)){if(it==='lib')line('spl','split');line(it,it);}
  }
  if(!vis.has('lib'))line('.','fill');
  layout.rows=rows;
  app.style.gridTemplateColumns=block[0].map(x=>x==='mixer'?'auto':x==='prep'?'minmax(260px,.85fr)':x==='big'?'minmax(0,1.6fr)':'minmax(0,1fr)').join(' ');
  app.style.gridTemplateAreas=rows.map(r=>'"'+r.a.join(' ')+'"').join(' ');
  for(const k of Object.keys(PANELS))$('#p-'+k).hidden=!vis.has(k)||(k==='mixer'?!block.flat().includes('mixer'):!P.order.includes(k));
  decks.forEach(d=>{
    const on=d.active;$('#p-deck'+d.id).hidden=!on;$('#lane-'+d.id).hidden=!on;$$('.fxa-'+d.id).forEach(b=>b.hidden=!on);$('#ch-'+d.id).hidden=!on;
    if(!on&&d.playing)d.pause();
  });
  app.classList.toggle('deck-waves',!!P.deckWaves);app.classList.toggle('no-jog',!!P.noJog);
  if(window.View)View.layout();
  else{app.style.gridTemplateRows=rows.map(r=>r.kind==='lib'?'minmax(150px,1fr)':r.kind==='fill'?'1fr':r.kind==='split'?'0':'auto').join(' ');document.documentElement.style.setProperty('--lane',P.lane[n]+'px');document.documentElement.style.setProperty('--jog',(P.jog&&P.jog[n]||120)+'px');}
  $('#p-coach').hidden=!layout.coach;$('#coach-btn').setAttribute('aria-pressed',String(layout.coach));
  $$('#presets button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.p===layout.preset)));
  $$('#ndecks button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.n===n)));
  $$('#panels-pop input[value]').forEach(c=>{if(c.value in PANELS)c.checked=vis.has(c.value);});
  applyXf();renderTable();
  store.set('preset',layout.preset);store.set('visible',[...vis]);store.set('decks',n);
}
function setCoach(on){layout.coach=on;applyLayout();}
function buildTop(){
  const seg=$('#presets');
  for(const[k,p]of Object.entries(PRESETS))seg.append(h('button',{type:'button','data-p':k,title:p.title,onclick:()=>{layout.preset=k;layout.visible=new Set(p.show);layout.coach=!!p.coach;applyLayout();}},p.name));
  $$('#ndecks button').forEach(b=>b.addEventListener('click',()=>{S.numDecks=+b.dataset.n;if(S.master&&!S.master.active)S.master=null;applyLayout();}));
  const pop=$('#panels-pop');
  for(const[k,n]of Object.entries(PANELS))pop.append(h('label',{},h('input',{type:'checkbox',value:k,onchange:e=>{e.target.checked?layout.visible.add(k):layout.visible.delete(k);applyLayout();}}),n));
  const wm=h('select',{class:'sel wide','aria-label':'Couleurs des waveforms'},Object.entries(WAVE_MODES).map(([k,m])=>h('option',{value:k},m.name)));
  wm.value=store.get('wave','3b');wm.addEventListener('change',()=>setWaveMode(wm.value));
  pop.append(h('div',{class:'lbl',style:'margin-top:6px'},'Waveforms'),wm);
  const q=$('#q-btn');q.setAttribute('aria-pressed',String(S.quantize));q.addEventListener('click',()=>{S.quantize=!S.quantize;q.setAttribute('aria-pressed',String(S.quantize));});
  const ag=$('#ag-btn');ag.setAttribute('aria-pressed',String(S.autoGain));ag.addEventListener('click',()=>{S.autoGain=!S.autoGain;ag.setAttribute('aria-pressed',String(S.autoGain));decks.forEach(d=>d.applyAutoGain());});
  $('#coach-btn').addEventListener('click',()=>setCoach(!layout.coach));
  $('#coach-close').addEventListener('click',()=>setCoach(false));
  $('#rec-btn').addEventListener('click',()=>{
    const was=!!REC.mr;
    if(!recToggle()){toast('L’enregistrement n’est pas disponible dans ce navigateur.');return;}
    $('#rec-btn').classList.toggle('on',!was);
    if(!was)toast('Enregistrement du mix démarré');
  });
  REC.onStop=blob=>{
    const n=lib.recs.length+1,stamp=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    lib.recs.push({url:REC.url,name:'mixlab-mix-'+n+'.webm',label:'Mix '+n+' · '+stamp+' · '+Math.round(blob.size/1024)+' Ko'});
    $('#rec-time').textContent='REC';renderSide();toast('Mix enregistré : retrouve-le dans la bibliothèque, section Enregistrements','ok');
  };
  $('#midi-btn').addEventListener('click',()=>{$('#midi-modal').hidden=false;});
  $('#midi-close').addEventListener('click',()=>{$('#midi-modal').hidden=true;});
  $('#midi-modal').addEventListener('click',e=>{if(e.target.id==='midi-modal')$('#midi-modal').hidden=true;});
}

/* ---------- dessin ---------- */
/* Waveform défilante. Les trois bandes sont dessinées une seule fois par morceau, par zoom
   et par taille dans des tuiles hors écran (le max de chaque colonne : pas de scintillement
   au dézoom). Chaque frame ne fait que recopier les tuiles, puis pose la grille, les cues
   et la tête de lecture. Le cache vit sur le canvas : deux vues d'un même morceau ne se gênent pas. */
const TILE=1024;
const uiScale=()=>(window.devicePixelRatio||1)*(window.View?View.zoom:1);
function waveTile(wc,i){
  let c=wc.t.get(i);if(c)return c;
  if(wc.t.size>40)wc.t.delete(wc.t.keys().next().value);
  c=document.createElement('canvas');c.width=TILE;c.height=wc.H;
  const g=c.getContext('2d'),wf=wc.tr.wf,n=wf.l.length,mid=wc.H/2,sc=wf.scale*mid*.92,x0=i*TILE,k=WF/wc.pB;
  g.globalCompositeOperation=wc.band.op;
  for(const[arr,col,mul]of[[wf.l,wc.band.l,1],[wf.m,wc.band.m,.82],[wf.h,wc.band.h,.5]]){
    g.fillStyle=col;g.beginPath();
    for(let x=0;x<TILE;x++){
      let m=0;
      if(k<1){const f=(x0+x+.5)*k-.5,j=Math.floor(f),u=f-j;if(j<0||j+1>=n)continue;m=arr[j]+(arr[j+1]-arr[j])*u;}
      else{const i0=Math.floor((x0+x)*k),i1=Math.min(n,Math.max(i0+1,Math.floor((x0+x+1)*k)));if(i0>=n)break;for(let j=Math.max(0,i0);j<i1;j++)if(arr[j]>m)m=arr[j];}
      const hh=m*sc*mul;if(hh>.25)g.rect(x,mid-hh,1,hh*2);
    }
    g.fill();
  }
  wc.t.set(i,c);return c;
}
function drawWave(d,cv,lane){
  if(!fitCanvas(cv))return;
  const g=cv.getContext('2d',{alpha:false}),W=cv.width,H=cv.height,mid=H/2,dpr=uiScale();
  g.fillStyle='#050608';g.fillRect(0,0,W,H);
  if(!d.track){g.fillStyle='#8a919c';g.font=`500 ${11*dpr}px Inter,sans-serif`;g.fillText('PLATINE '+d.id+' · glisse un morceau ici',12*dpr,mid+4*dpr);return;}
  const tr=d.track,pos=d.position(),pB=W/ui.zoom,pps=pB/d.rate,t0=pos-(W/2)/pps,t1=pos+(W/2)/pps;
  if(d.loop.on){g.fillStyle='rgba(63,214,121,.14)';const x0=(d.loop.start-t0)*pps,x1=(d.loop.end-t0)*pps;g.fillRect(x0,0,x1-x0,H);g.fillStyle='rgba(63,214,121,.8)';g.fillRect(x0,0,dpr,H);g.fillRect(x1-dpr,0,dpr,H);}
  if(d.loopIn!=null){g.fillStyle='rgba(63,214,121,.8)';g.fillRect((d.loopIn-t0)*pps,0,2*dpr,H);}
  const b0=Math.ceil(d.beatIdx(t0)),b1=Math.floor(d.beatIdx(t1));
  g.font=`500 ${9.5*dpr}px "JetBrains Mono",monospace`;
  for(let b=b0;b<=b1;b++){
    const x=Math.round((d.timeOfBeat(b)-t0)*pps),m4=((b%4)+4)%4,m32=((b%32)+32)%32;
    if(m32===0){g.fillStyle='rgba(167,139,250,.75)';g.fillRect(x-dpr,0,2*dpr,H);g.fillStyle='rgba(167,139,250,.18)';g.fillRect(x,0,(d.timeOfBeat(b+32)-d.timeOfBeat(b))*pps,3*dpr);}
    else if(m4===0){g.fillStyle='rgba(255,255,255,.22)';g.fillRect(x-dpr*.5,0,1.5*dpr,H);}
    else{g.fillStyle='rgba(255,255,255,.07)';g.fillRect(x,0,dpr,H);}
    if(m4===0&&b>=0){g.fillStyle=m32===0?'#b9a6ff':'rgba(255,255,255,.55)';g.fillText(m32===0?'P'+(b/32+1):String(b/4+1),x+3*dpr,H-4*dpr);}
  }
  // bandes : recopie des tuiles
  let wc=cv._wc;if(!wc||wc.tr!==tr||wc.wf!==tr.wf||wc.pB!==pB||wc.H!==H||wc.band!==BAND)wc=cv._wc={tr,wf:tr.wf,pB,H,band:BAND,t:new Map()};
  const i0=Math.max(0,Math.floor(t0*pB/TILE)),i1=Math.floor(t1*pB/TILE),tw=TILE/d.rate;
  for(let i=i0;i<=i1;i++){if(i*TILE/pB>tr.duration)break;g.drawImage(waveTile(wc,i),Math.round((i*TILE/pB-t0)*pps),0,tw,H);}
  window.Structure&&Structure.drawLane(g,d,t0,pps,W,H,dpr);
  g.fillStyle='rgba(6,7,9,.42)';g.fillRect(0,0,W/2,H);
  const mark=(t,col,label)=>{const x=(t-t0)*pps;if(x<-30||x>W+30)return;g.fillStyle=col;g.fillRect(x-dpr*.5,0,1.5*dpr,H);g.beginPath();g.moveTo(x-5*dpr,0);g.lineTo(x+5*dpr,0);g.lineTo(x,7*dpr);g.fill();if(label){const lw=Math.max(12*dpr,g.measureText(label).width+6*dpr);g.fillRect(x,8*dpr,lw,12*dpr);g.fillStyle='#05070a';g.fillText(label,x+3*dpr,17*dpr);}};
  (tr.memCues||[]).forEach(c=>{const x=(c.t-t0)*pps;if(x<-10||x>W+10)return;g.fillStyle=c.color||'#f4f6f9';g.globalAlpha=.5;g.fillRect(x,0,dpr,H);g.globalAlpha=1;g.beginPath();g.moveTo(x-5*dpr,H);g.lineTo(x+5*dpr,H);g.lineTo(x,H-7*dpr);g.fill();});
  mark(tr.cue,'#f4f6f9');tr.hot.forEach((t,i)=>{if(t!=null)mark(t,hotColor(tr,i),String(i+1)+(hotName(tr,i)?' '+short(hotName(tr,i),14):''));});
  const sp=d.slipShadowPos();if(sp!=null){g.fillStyle='rgba(255,255,255,.45)';g.fillRect(W/2+(sp-pos)*pps,0,2*dpr,H);}
  g.fillStyle='rgba(255,255,255,.18)';g.fillRect(W/2-3*dpr,0,6*dpr,H);g.fillStyle='#fff';g.fillRect(W/2-dpr,0,2*dpr,H);
  if(lane){
    const ki=keyInfo(d.keyNow()),bi=d.barInfo(),cnt=(bi&&!bi.pre?`  ·  ${bi.barIn+1}.${bi.beat+1}  ·  P${bi.phrase+1}`:'')+(window.Structure?Structure.tag(tr,pos):''),txt=`${tr.title}  ·  ${d.bpm.toFixed(2)}  ·  ${ki?ki.code:'—'}${cnt}${d.sync?'  ·  SYNC':''}${S.master===d?'  ·  MASTER':''}`;
    const fs=Math.min(11,Math.max(9,H/dpr*.2)),lh=(fs+5)*dpr;
    g.font=`600 ${fs*dpr}px Inter,sans-serif`;const tw2=g.measureText(txt).width;
    g.fillStyle='rgba(5,6,8,.78)';g.fillRect(0,0,tw2+30*dpr,lh);
    g.fillStyle=COL[d.id];g.fillRect(0,0,16*dpr,lh);g.fillStyle='#05070a';g.fillText(d.id,4.5*dpr,lh-4.5*dpr);
    g.fillStyle='#e4e7ec';g.fillText(txt,22*dpr,lh-4.5*dpr);
    const rem=fmtTime(pos-tr.duration);g.font=`500 ${fs*dpr}px "JetBrains Mono",monospace`;const rw=g.measureText(rem).width;
    g.fillStyle='rgba(5,6,8,.78)';g.fillRect(W-rw-60*dpr,0,rw+10*dpr,lh);g.fillStyle=tr.duration-pos<30?'#ff4d5e':'#e4e7ec';g.fillText(rem,W-rw-55*dpr,lh-4.5*dpr);
  }
}
function drawOverview(d){
  const cv=d.ui.ov;if(!fitCanvas(cv))return;
  const g=cv.getContext('2d'),W=cv.width,H=cv.height;g.fillStyle='#07080a';g.fillRect(0,0,W,H);if(!d.track)return;
  const tr=d.track;
  if(!tr.ov||tr.ov.width!==W||tr.ov.height!==H){
    const oc=document.createElement('canvas');oc.width=W;oc.height=H;const og=oc.getContext('2d'),wf=tr.wf,n=wf.l.length,mid=H/2,sc=wf.scale*mid*.95;
    og.globalCompositeOperation=BAND.op;
    for(const[arr,col,mul]of[[wf.l,BAND.l,1],[wf.m,BAND.m,.82],[wf.h,BAND.h,.5]]){og.fillStyle=col;og.beginPath();for(let x=0;x<W;x++){const i0=Math.floor(x/W*n),i1=Math.max(i0+1,Math.floor((x+1)/W*n));let m=0;for(let i=i0;i<i1;i++)if(arr[i]>m)m=arr[i];const hh=Math.max(.5,m*sc*mul);og.rect(x,mid-hh,1,hh*2);}og.fill();}
    og.globalCompositeOperation='source-over';
    og.fillStyle='rgba(167,139,250,.5)';for(let b=0;;b+=32){const t=tr.grid+b*60/tr.bpm;if(t>tr.duration)break;og.fillRect(t/tr.duration*W,0,1,H);}
    window.Structure&&Structure.drawOv(og,tr,W,H);
    tr.ov=oc;
  }
  g.drawImage(tr.ov,0,0);
  const px=d.position()/tr.duration*W;g.fillStyle='rgba(5,6,8,.6)';g.fillRect(0,0,px,H);
  if(d.loop.on){g.fillStyle='rgba(63,214,121,.35)';g.fillRect(d.loop.start/tr.duration*W,0,Math.max(2,(d.loop.end-d.loop.start)/tr.duration*W),H);}
  tr.hot.forEach((t,i)=>{if(t!=null){g.fillStyle=hotColor(tr,i);g.fillRect(t/tr.duration*W-1,0,3,H*.3);}});
  (tr.memCues||[]).forEach(c=>{g.fillStyle=c.color||'#f4f6f9';g.fillRect(c.t/tr.duration*W-1,H*.78,2,H*.22);});
  g.fillStyle='#f4f6f9';g.fillRect(tr.cue/tr.duration*W-1,H*.7,3,H*.3);
  g.fillStyle=tr.duration-d.position()<30&&d.playing&&Math.floor(performance.now()/400)%2?'#ff4d5e':'#fff';g.fillRect(px-1,0,2,H);
}
function drawPlatter(d){
  const cv=d.ui.plat;if(!fitCanvas(cv))return;
  const g=cv.getContext('2d'),W=cv.width,H=cv.height,cx=W/2,cy=H/2,R=Math.min(W,H)/2-2,dpr=window.devicePixelRatio||1;
  g.clearRect(0,0,W,H);
  const lw=Math.max(4,R*.07);
  g.lineWidth=lw;g.strokeStyle='#1b1e25';g.beginPath();g.arc(cx,cy,R-lw/2,0,Math.PI*2);g.stroke();
  const tr=d.track;
  if(tr){
    const pos=Math.max(0,d.position()),f=clamp(pos/tr.duration,0,1),end=tr.duration-pos<30&&Math.floor(performance.now()/400)%2;
    g.strokeStyle=end?'#ff4d5e':COL[d.id];g.beginPath();g.arc(cx,cy,R-lw/2,-Math.PI/2,-Math.PI/2+f*Math.PI*2);g.stroke();
    const dot=(t,col)=>{const a=-Math.PI/2+t/tr.duration*Math.PI*2;g.fillStyle=col;g.beginPath();g.arc(cx+Math.cos(a)*(R-lw/2),cy+Math.sin(a)*(R-lw/2),lw*.45,0,Math.PI*2);g.fill();};
    tr.hot.forEach((t,i)=>{if(t!=null)dot(t,hotColor(tr,i));});dot(tr.cue,'#f4f6f9');
  }
  const r2=R-lw-3*dpr;
  const grd=g.createRadialGradient(cx-r2*.3,cy-r2*.3,r2*.1,cx,cy,r2);grd.addColorStop(0,'#2a2e37');grd.addColorStop(1,'#111318');
  g.fillStyle=grd;g.beginPath();g.arc(cx,cy,r2,0,Math.PI*2);g.fill();
  g.strokeStyle='rgba(255,255,255,.035)';g.lineWidth=1;for(let r=r2*.45;r<r2;r+=r2*.07){g.beginPath();g.arc(cx,cy,r,0,Math.PI*2);g.stroke();}
  if(tr){
    const rot=d.position()*(100/3/60)*Math.PI*2*(d.reverse?1:1)-Math.PI/2;
    g.strokeStyle=COL[d.id];g.lineWidth=Math.max(2,r2*.05);g.lineCap='round';g.beginPath();g.moveTo(cx+Math.cos(rot)*r2*.42,cy+Math.sin(rot)*r2*.42);g.lineTo(cx+Math.cos(rot)*r2*.92,cy+Math.sin(rot)*r2*.92);g.stroke();
    const sp=d.slipShadowPos();if(sp!=null){const a=sp*(100/3/60)*Math.PI*2-Math.PI/2;g.strokeStyle='rgba(255,255,255,.4)';g.beginPath();g.moveTo(cx+Math.cos(a)*r2*.6,cy+Math.sin(a)*r2*.6);g.lineTo(cx+Math.cos(a)*r2*.92,cy+Math.sin(a)*r2*.92);g.stroke();}
  }
  g.fillStyle='#0b0c0f';g.beginPath();g.arc(cx,cy,r2*.34,0,Math.PI*2);g.fill();
  g.fillStyle=tr?'#f4f6f9':'#5b616c';g.textAlign='center';g.textBaseline='middle';
  if(tr){g.font=`600 ${Math.max(10,r2*.16)}px "JetBrains Mono",monospace`;g.fillText(fmtTime(Math.max(0,d.position()),false),cx,cy-r2*.06);g.font=`600 ${Math.max(8,r2*.1)}px Inter,sans-serif`;g.fillStyle=COL[d.id];g.fillText(d.id,cx,cy+r2*.17);}
  else{g.font=`600 ${Math.max(10,r2*.2)}px Inter,sans-serif`;g.fillText(d.id,cx,cy);}
  g.textAlign='start';g.textBaseline='alphabetic';
}
const lvBuf=new Float32Array(1024);
function level(an){an.getFloatTimeDomainData(lvBuf);let pk=0;for(let i=0;i<lvBuf.length;i++){const v=Math.abs(lvBuf[i]);if(v>pk)pk=v;}return pk;}
function drawVu(cv,pk,store){
  if(!fitCanvas(cv))return;const g=cv.getContext('2d'),W=cv.width,H=cv.height;g.fillStyle='#050608';g.fillRect(0,0,W,H);
  const db=20*Math.log10(Math.max(pk,1e-5)),f=clamp((db+45)/48,0,1),segs=24,sh=H/segs;
  store.hold=Math.max(f,(store.hold||0)-.006);
  for(let i=0;i<segs;i++){const on=i/segs<f,y=H-(i+1)*sh,c=i>=22?'#ff4d5e':i>=18?'#f5b83d':'#3fd679';g.fillStyle=on?c:'#14171c';g.fillRect(0,y+1,W,sh-1.5);}
  const hy=H-Math.ceil(store.hold*segs)*sh;if(store.hold>.02){g.fillStyle='#f4f6f9';g.fillRect(0,hy+1,W,sh-1.5);}
}

/* ---------- MIDI ---------- */
const midi={access:null,learn:false,target:null,map:store.get('midimap',{}),last:{}};
function midiKeyText(k){const m=/^([ncp])(\d+)\.?(\d+)?$/.exec(k);if(!m)return k;const ch=+m[2]+1;return m[1]==='n'?`Note ${m[3]} · canal ${ch}`:m[1]==='c'?`CC ${m[3]} · canal ${ch}`:`Pitch bend · canal ${ch}`;}
async function connectMidi(){
  const ul=$('#midi-devs');
  if(!navigator.requestMIDIAccess){ul.innerHTML='';ul.append(h('li',{style:'color:var(--warn)'},'Ce navigateur ne gère pas le MIDI. Utilise Chrome ou Edge.'));return;}
  try{midi.access=await navigator.requestMIDIAccess({sysex:false});midi.access.onstatechange=listMidi;listMidi();}
  catch(e){ul.innerHTML='';ul.append(h('li',{style:'color:var(--warn)'},'Accès MIDI refusé ou bloqué dans cette page. Ouvre index.html directement dans Chrome ou Edge et autorise le MIDI.'));}
}
function listMidi(){
  const ul=$('#midi-devs');ul.innerHTML='';let n=0;
  midi.access.inputs.forEach(inp=>{inp.onmidimessage=onMidi;n++;ul.append(h('li',{},'● '+(inp.manufacturer?inp.manufacturer+' ':'')+inp.name));});
  if(!n)ul.append(h('li',{style:'color:var(--mu)'},'Aucun contrôleur détecté. Branche-le, il apparaîtra ici.'));
  $('#midi-dot').classList.toggle('on',n>0);midi.last={};
  window.Controllers&&Controllers.onDevices();
}
function onMidi(e){
  const[st,d1,d2=0]=e.data;if(st>=0xF0)return;
  const type=st&0xF0,ch=st&15;let key;
  if(type===0x90||type===0x80)key=`n${ch}.${d1}`;else if(type===0xB0)key=`c${ch}.${d1}`;else if(type===0xE0)key=`p${ch}`;else return;
  $('#midi-mon').textContent='Dernier message : '+midiKeyText(key)+' = '+(type===0xE0?((d2<<7)|d1):d2);
  if(window.Controllers)return Controllers.onMidi(e,key,type,ch,d1,d2);
  if(midi.learn&&midi.target){
    if(type===0x80||(type===0x90&&d2===0))return;
    midi.map[key]=midi.target;store.set('midimap',midi.map);
    toast('Mappé : '+ctl(midi.target).label+' ← '+midiKeyText(key),'ok');selectLearn(null);renderMaps();return;
  }
  const id=midi.map[key];if(!id)return;const c=ctl(id);if(!c)return;
  const isNote=type===0x90||type===0x80,on=type===0x90&&d2>0;
  if(c.kind==='abs')c.set(isNote?(on?1:0):type===0xE0?((d2<<7)|d1)/16383:d2/127);
  else if(c.kind==='btn'){if(isNote?on:d2>0)c.press({});else c.release&&c.release();}
  else if(c.kind==='rel'&&!isNote)c.move(d2<64?d2:d2-128);
}
function selectLearn(id){
  $$('[data-ctl].sel').forEach(e=>e.classList.remove('sel'));midi.target=id;
  if(id){ctl(id).el.classList.add('sel');$('#learnbar-txt').textContent='Bouge maintenant la commande pour « '+ctl(id).label+' » sur ta table';}
  else $('#learnbar-txt').textContent='MIDI Learn : clique une commande du logiciel';
}
function setLearn(on){
  midi.learn=on;document.body.classList.toggle('learn',on);$('#learnbar').hidden=!on;selectLearn(null);
  $('#learn-btn').textContent=on?'Terminer MIDI Learn':'Activer MIDI Learn';
  if(on){$('#midi-modal').hidden=true;if(!midi.access)connectMidi();}
}
function renderMaps(){
  if(window.Controllers)return Controllers.renderMaps();
  const ul=$('#map-list');ul.innerHTML='';const mapped=new Set(Object.values(midi.map));
  controls.forEach((c,id)=>c.el.classList.toggle('mapped',mapped.has(id)));
  const ents=Object.entries(midi.map);if(!ents.length)ul.append(h('li',{style:'color:var(--mu)'},'Aucun mapping pour l’instant.'));
  for(const[k,id]of ents){const c=ctl(id);ul.append(h('li',{},h('span',{},(c?c.label:id)+' ← '+midiKeyText(k)),h('button',{title:'Supprimer',onclick:()=>{delete midi.map[k];store.set('midimap',midi.map);renderMaps();}},'×')));}
  $('#map-json').value=JSON.stringify({format:'mixlab-mapping',version:1,map:midi.map},null,1);
}
function ledState(id){
  if((window.Parcours&&Parcours.target===id)||(window.Coach&&Coach.target===id)||(window.MixCoach&&MixCoach.target===id))return Math.floor(performance.now()/250)%2===0;
  const m=/^([A-D])\.(.+)$/.exec(id);if(!m)return null;const d=deckById(m[1]),a=m[2];if(!d)return null;
  if(a==='play')return d.playing;if(a==='sync')return d.sync;if(a==='master')return S.master===d;if(a==='keylock')return d.keyLock;if(a==='slip')return d.slip;
  if(a==='cue')return!!d.track&&!d.playing&&Math.abs(d.position()-d.track.cue)<.02;if(a==='cuech')return d.cueOn;if(a==='loop')return d.loop.on;if(a==='fxon')return d.fx.on;
  const p=/^pad(\d)$/.exec(a);if(p){const i=+p[1]-1;return d.padMode==='hot'?!!(d.track&&d.track.hot[i]!=null):d.padMode==='roll'?d.rolling===ROLLS[i]:false;}
  return null;
}
function ledTick(){
  if(!midi.access)return;
  if(window.Controllers)return Controllers.ledTick();
  const outs=[...midi.access.outputs.values()];if(!outs.length)return;
  for(const[key,id]of Object.entries(midi.map)){
    const st=ledState(id);if(st==null||midi.last[key]===st)continue;midi.last[key]=st;
    const m=/^([nc])(\d+)\.(\d+)$/.exec(key);if(!m)continue;
    const msg=[(m[1]==='n'?0x90:0xB0)|+m[2],+m[3],st?127:0];outs.forEach(o=>{try{o.send(msg);}catch(e){}});
  }
}
function buildMidi(){
  $('#midi-connect').addEventListener('click',connectMidi);
  $('#learn-btn').addEventListener('click',()=>setLearn(!midi.learn));
  $('#learnbar-stop').addEventListener('click',()=>setLearn(false));
  document.addEventListener('pointerdown',e=>{if(!midi.learn)return;const t=e.target.closest('[data-ctl]');if(!t||t.closest('.modal,.learnbar'))return;e.preventDefault();e.stopPropagation();selectLearn(t.dataset.ctl);},true);
  document.addEventListener('click',e=>{if(midi.learn&&e.target.closest('[data-ctl]')&&!e.target.closest('.modal,.learnbar')){e.preventDefault();e.stopPropagation();}},true);
  $('#map-export').addEventListener('click',()=>{const ta=$('#map-json');(navigator.clipboard?navigator.clipboard.writeText(ta.value):Promise.reject()).then(()=>toast('Mapping copié','ok'),()=>ta.select());});
  $('#map-import').addEventListener('click',()=>{if(window.Controllers)return Controllers.importText($('#map-json').value);try{const j=JSON.parse($('#map-json').value);if(!j.map)throw 0;midi.map=j.map;store.set('midimap',midi.map);renderMaps();toast('Mapping importé','ok');}catch(e){toast('Ce texte n’est pas un mapping Mixlab valide.');}});
  $('#map-clear').addEventListener('click',()=>{window.Controllers&&Controllers.clearMeta();midi.map={};store.set('midimap',midi.map);renderMaps();});
  window.Controllers&&Controllers.build();
  renderMaps();
}

/* ---------- clavier ---------- */
/* Touches physiques (e.code) : mêmes positions en AZERTY, QWERTY ou QWERTZ. Modifiables dans la fenêtre Contrôleur. */
const KEYS_DEF={KeyQ:'A.play',KeyW:'A.cue',KeyE:'A.sync',KeyA:'A.nudgeL',KeyS:'A.nudgeR',Digit1:'A.pad1',Digit2:'A.pad2',Digit3:'A.pad3',Digit4:'A.pad4',
  KeyP:'B.play',KeyO:'B.cue',KeyI:'B.sync',KeyK:'B.nudgeL',KeyL:'B.nudgeR',Digit7:'B.pad1',Digit8:'B.pad2',Digit9:'B.pad3',Digit0:'B.pad4',KeyZ:'xf-',KeyX:'xf+'};
let KEYS=store.get('keys',null)||{...KEYS_DEF};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){const m=$$('.modal').filter(x=>!x.hidden).pop();if(m){m.hidden=true;e.preventDefault();return;}if(midi.learn){setLearn(false);return;}}
  if(e.target.closest('input,textarea,select')||e.metaKey||e.ctrlKey||e.altKey)return;
  const id=KEYS[e.code];if(!id)return;
  if(id==='xf-'||id==='xf+'){ui.setX(S.xf+(id==='xf-'?-.05:.05));e.preventDefault();return;}
  if(e.repeat)return;const c=ctl(id);if(c){c.press(e);e.preventDefault();}
});
document.addEventListener('keyup',e=>{const id=KEYS[e.code];if(!id||id[0]==='x')return;const c=ctl(id);if(c&&c.release)c.release();});
document.addEventListener('dragenter',e=>{if(e.dataTransfer&&[...e.dataTransfer.types].some(t=>t==='Files'||t==='text/mixlab-track'))document.body.classList.add('dragging');});
document.addEventListener('dragend',()=>document.body.classList.remove('dragging'));
document.addEventListener('dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('dragging');});
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('dragging');if(e.dataTransfer.files.length)importFiles([...e.dataTransfer.files],null);});

/* ---------- boucle d'affichage ---------- */
let lastT=performance.now(),lastSec=-1,libRefKey='';
const vuStore={};
function frame(){
  const t=performance.now(),dt=Math.min(.1,(t-lastT)/1000);lastT=t;
  const app=$('#app'),waveVis=!$('#p-wave').hidden,dw=app.classList.contains('deck-waves'),jog=!app.classList.contains('no-jog')&&!app.classList.contains('compact');
  const ref=refDeck(),rk=ref&&ref.keyNow();
  for(const d of decks){
    d.tick();if(!d.active)continue;
    if(d.playing&&!d.logged&&d.track&&t-d.playStart>30000){d.logged=true;d.track.plays++;d.track.lastPlayed=new Date();LIB.history.push({track:d.track,time:new Date(Date.now()-(t-d.playStart)),deck:d.id});renderSide();}
    if(waveVis)drawWave(d,d.ui.lane,true);
    if(d.ui.dwOn??dw)drawWave(d,d.ui.dw,false);
    drawOverview(d);if(d.ui.jogOn??jog)drawPlatter(d);
    const tr=d.track,B=d.ui.b;
    if(tr){
      const pos=d.position(),rem=tr.duration-pos,ki=keyInfo(d.keyNow());
      d.ui.bpm.textContent=d.bpm.toFixed(2);d.ui.time.textContent=fmtTime(-rem);d.ui.time.classList.toggle('end',rem<30);
      d.ui.key.textContent=ki?ki.code:'—';d.ui.key.style.color=keyColor(ki);d.ui.key.classList.toggle('ok',!!(ref&&ref!==d&&rk&&d.keyNow()&&keysCompatible(rk,d.keyNow())));
      B.cue.classList.toggle('on',!d.playing&&Math.abs(pos-tr.cue)<.02);
    }
    d.ui.pv.textContent=(d.pitch>=0?'+':'')+(d.pitch*100).toFixed(2)+'%';
    if(document.activeElement!==d.ui.pitch)d.ui.pitch.value=String(d.pitch/d.pitchRange);
    if(+d.ui.rng.value!==Math.round(d.pitchRange*100))d.ui.rng.value=String(Math.round(d.pitchRange*100));
    d.ui.keyd.textContent=(d.keyShift>0?'+':'')+d.keyShift;
    B.play.classList.toggle('on',d.playing);B.sync.classList.toggle('on',d.sync);B.master.classList.toggle('on',S.master===d);
    B.kl.classList.toggle('on',d.keyLock);B.slip.classList.toggle('on',d.slip);B.rev.classList.toggle('on',d.reverse);
    B.loop.classList.toggle('on',d.loop.on);B.loop.classList.toggle('loopon',d.loop.on);B.relp.classList.toggle('on',d.loop.on);B.lin.classList.toggle('on',d.loopIn!=null);
    d.ui.lsz.textContent=fracLabel(d.loopSize);d.ui.jsz.textContent=String(d.jumpSize);
    d.ui.cueb.classList.toggle('on',d.cueOn);
    (d.ui.panel||(d.ui.panel=$('#p-deck'+d.id))).classList.toggle('isMaster',S.master===d);
    padLights(d);
  }
  if(!$('#p-mixer').hidden){
    decks.forEach(d=>{if(d.active)drawVu(d.ui.vu,level(d.an),vuStore[d.id]||(vuStore[d.id]={}));});
    drawVu(ui.mvu[0],level(bus.anL),vuStore.L||(vuStore.L={}));drawVu(ui.mvu[1],level(bus.anR),vuStore.R||(vuStore.R={}));
    ui.split.classList.toggle('on',S.split);drawLim();
  }
  fxFrame();
  $('#master-bpm').textContent=ref?ref.bpm.toFixed(2):'—';
  if(REC.mr)$('#rec-time').textContent=fmtTime((t-REC.t0)/1000,false);
  const sec=Math.floor(t/1000);
  if(sec!==lastSec){
    lastSec=sec;$('#clock').textContent=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    $('#audio-note').textContent=ctx.state==='running'?'':'Clique n’importe où pour activer le son';
    const rkStr=ref?ref.id+(rk?rk.pc+'/'+rk.minor:'')+ref.bpm.toFixed(1)+decks.map(d=>d.track?d.track.id:0).join():'';
    if(rkStr!==libRefKey){libRefKey=rkStr;lib.compat||(window.LibPro&&LibPro.liveView(lib.view))?renderTable():refreshCompat();}
  }
  ledTick();
  if(window.View)View.tick();
  if(window.Coach)Coach.tick(dt);
  if(window.MixCoach)MixCoach.tick(dt);
  if(window.Parcours)Parcours.tick(dt);
  requestAnimationFrame(frame);
}

/* ---------- démarrage ---------- */
async function boot(){
  buildSamples();
  S.numDecks=store.get('decks',2);
  buildTop();buildFx();buildLanes();decks.forEach(buildDeck);buildMixer();buildLib();buildMidi();Perf.init();
  window.View&&View.build();
  window.Desktop&&Desktop.init();
  layout.coach=!!PRESETS[layout.preset].coach;
  applyLayout();
  window.Coach&&Coach.build();
  window.MixCoach&&MixCoach.build();
  window.Structure&&Structure.build();
  window.AutoMix&&AutoMix.build();
  requestAnimationFrame(frame);
  for(let i=0;i<DEMOS.length;i++){
    await new Promise(r=>setTimeout(r,20));
    const def=DEMOS[i];addTrack(synthDemo(def),{...def,demo:true});
    if(i===1){decks[0].load(LIB.tracks[0]);decks[1].load(LIB.tracks[1]);$('#loading').hidden=true;}
    if(i===3){decks[2].load(LIB.tracks[2]);decks[3].load(LIB.tracks[3]);}
    const prep=LIB.playlists.find(p=>p.id==='prep');if(prep&&!prep.ids.includes(LIB.tracks[i].id)&&!(window.LibPro&&LibPro.hasSaved))prep.ids.push(LIB.tracks[i].id);
    renderSide();renderTable();
  }
  window.Coach&&Coach.ready&&Coach.ready();
  window.Parcours&&Parcours.init();
  window.Academie&&Academie.init();
  window.Desktop&&Desktop.boot();
}
// On attend que tous les scripts de la page (library-pro, coach…) soient exécutés.
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
