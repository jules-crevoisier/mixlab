'use strict';
/* =====================================================================
   Mixlab · cues et sampler
   Éditeur de hot cue (nom, couleur), cues mémoire et boucles gardées,
   sons du sampler choisis par l'utilisateur (gardés dans IndexedDB),
   préférences : plage d'analyse BPM, effet de voie, mode d'EQ.
   ===================================================================== */
window.Perf=(()=>{
  const BPM_RANGES=[['60-120',[60,120]],['70-140',[70,140]],['88-175',[87.5,175]],['100-200',[100,200]]];
  const CUE_COLORS=[...HOT,'#ffffff','#9aa3b0','#ff7a1a','#a3e635'];
  // préférences lues tout de suite : le mixer et l'analyse s'en servent dès le démarrage
  {const r=BPM_RANGES.find(x=>x[0]===store.get('bpmRange','88-175'));if(r)S.bpmRange=r[1];}
  S.colorFx=store.get('colorFx','filter');S.eqMode=store.get('eqMode','iso');

  /* ---------- popover ---------- */
  let open=null;
  function close(){if(!open)return;open.el.remove();document.removeEventListener('pointerdown',open.out,true);document.removeEventListener('keydown',open.esc,true);const f=open.onClose;open=null;f&&f();}
  function popover(anchor,title,kids,onClose){
    close();
    const el=h('div',{class:'popx',role:'dialog','aria-label':title},h('div',{class:'ph'},h('b',{},title),h('button',{class:'x',type:'button','aria-label':'Fermer',onclick:close},'×')),kids);
    document.body.append(el);
    const r=anchor.getBoundingClientRect(),w=el.offsetWidth,hh=el.offsetHeight;
    let x=clamp(r.left+r.width/2-w/2,8,innerWidth-w-8),y=r.bottom+6;if(y+hh>innerHeight-8)y=Math.max(8,r.top-hh-6);
    el.style.left=x+'px';el.style.top=y+'px';
    const out=e=>{if(!el.contains(e.target)&&e.target!==anchor)close();},esc=e=>{if(e.key==='Escape'){close();e.stopPropagation();}};
    document.addEventListener('pointerdown',out,true);document.addEventListener('keydown',esc,true);
    open={el,out,esc,onClose};const f=el.querySelector('input,select');if(f&&matchMedia('(pointer:fine)').matches)f.focus();
    return el;
  }
  function longPress(el,fn){
    let t=null,x=0,y=0;const stop=()=>{clearTimeout(t);t=null;};
    el.addEventListener('pointerdown',e=>{if(e.button!==0||e.pointerType==='mouse')return;x=e.clientX;y=e.clientY;stop();t=setTimeout(()=>{t=null;fn();},550);});
    el.addEventListener('pointermove',e=>{if(t&&Math.hypot(e.clientX-x,e.clientY-y)>10)stop();});
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>el.addEventListener(ev,stop));
  }
  const swatches=(cur,pick)=>{const box=h('div',{class:'sws'});CUE_COLORS.forEach(c=>box.append(h('button',{type:'button',class:'sw','aria-label':'Couleur '+c,'aria-pressed':String(c===cur),style:'--c:'+c,onclick:e=>{$$('.sw',box).forEach(b=>b.setAttribute('aria-pressed',String(b===e.currentTarget)));pick(c);}})));return box;};

  /* ---------- hot cue : nom et couleur ---------- */
  function cueEditor(d,i,anchor){
    const tr=d.track;if(!tr){toast('Charge un morceau sur la platine '+d.id+' d’abord');return;}
    tr.hotMeta=tr.hotMeta||Array(8).fill(null);
    const m={name:hotName(tr,i),color:hotColor(tr,i)};
    const save=()=>{if(tr.hot[i]==null)return;tr.hotMeta[i]={name:m.name,color:m.color};renderPads(d);};
    const name=h('input',{type:'text',class:'pin',maxlength:24,placeholder:'Nom : Drop, Voix, Break…',value:m.name,'aria-label':'Nom du hot cue'});
    name.addEventListener('input',()=>{m.name=name.value.trim();save();});name.addEventListener('keydown',e=>{if(e.key==='Enter')close();});
    const set=tr.hot[i]!=null;
    const acts=h('div',{class:'pa'},
      set?h('button',{class:'b',type:'button',onclick:()=>{tr.hot[i]=d.snap(d.position());save();close();}},'Déplacer ici'):h('button',{class:'b',type:'button',onclick:()=>{tr.hot[i]=d.snap(d.position());save();close();}},'Poser ici'),
      set?h('button',{class:'b red',type:'button',onclick:()=>{d.hotDown(i,true);renderPads(d);close();}},'Effacer'):null);
    popover(anchor,'Hot cue '+(i+1)+(set?' · '+fmtTime(tr.hot[i]):' · libre'),[name,swatches(m.color,c=>{m.color=c;save();}),acts]);
  }

  /* ---------- cues mémoire et boucles gardées ---------- */
  function cueList(d,anchor){
    const tr=d.track;if(!tr){toast('Charge un morceau sur la platine '+d.id+' d’abord');return;}
    tr.memCues=tr.memCues||[];tr.loops=tr.loops||[];
    const mem=h('div',{class:'pl'}),lps=h('div',{class:'pl'});
    const inp=(o,k,ph)=>{const e=h('input',{type:'text',class:'pin',value:o[k]||'',placeholder:ph,maxlength:24});e.addEventListener('input',()=>{o[k]=e.value;renderPads(d);});return e;};
    const render=()=>{
      mem.innerHTML='';lps.innerHTML='';
      tr.memCues.forEach((c,i)=>mem.append(h('div',{class:'pr'},
        h('button',{type:'button',class:'dot',style:'--c:'+(c.color||'#fff'),title:'Changer la couleur',onclick:()=>{const k=CUE_COLORS.indexOf(c.color);c.color=CUE_COLORS[(k+1)%CUE_COLORS.length];render();}}),
        inp(c,'label','Nom'),
        h('button',{type:'button',class:'b tm',title:'Aller à ce cue',onclick:()=>d.seek(c.t)},fmtTime(c.t)),
        h('button',{type:'button',class:'b',title:'Supprimer','aria-label':'Supprimer le cue '+(c.label||i+1),onclick:()=>{tr.memCues.splice(i,1);render();}},'×'))));
      if(!tr.memCues.length)mem.append(h('div',{class:'pe'},'Aucun cue mémoire. Ils repèrent les moments du morceau sans prendre de pad.'));
      tr.loops.forEach((l,i)=>lps.append(h('div',{class:'pr'},
        h('span',{class:'pn'},String(i+1)),inp(l,'label','Nom'),
        h('button',{type:'button',class:'b tm',title:'Rappeler la boucle',onclick:()=>{d.recallLoop(l);}},fracLabel(Math.round((l.end-l.start)/d.beatLen*1000)/1000)+' t'),
        h('button',{type:'button',class:'b',title:'Supprimer','aria-label':'Supprimer la boucle '+(i+1),onclick:()=>{tr.loops.splice(i,1);render();renderPads(d);}},'×'))));
      if(!tr.loops.length)lps.append(h('div',{class:'pe'},'Aucune boucle gardée. Lance une boucle puis garde-la ici ou sur un pad du mode Boucles.'));
    };
    const addMem=()=>{const t=d.snap(d.position());tr.memCues.push({t,label:'Cue '+(tr.memCues.length+1),color:'#ffffff'});tr.memCues.sort((a,b)=>a.t-b.t);render();};
    const addLoop=()=>{const c=d.loop.on?d.loop:d.lastLoop;if(!c){toast('Lance une boucle d’abord');return;}if(tr.loops.some(l=>sameLoop(l,c)))return;tr.loops.push({start:c.start,end:c.end,label:'Boucle '+(tr.loops.length+1)});render();renderPads(d);};
    render();
    popover(anchor,'Platine '+d.id+' · '+short(tr.title,26),[
      h('div',{class:'ps'},h('span',{class:'lbl'},'Cues mémoire'),h('button',{class:'b',type:'button',onclick:addMem},'+ Cue ici')),mem,
      h('div',{class:'ps'},h('span',{class:'lbl'},'Boucles gardées'),h('button',{class:'b',type:'button',onclick:addLoop},'+ Garder la boucle')),lps]);
  }

  /* ---------- sampler : sons de l'utilisateur ---------- */
  const DB={p:null,
    open(){return this.p||(this.p=new Promise((res,rej)=>{const r=indexedDB.open('mixlab-sampler',1);r.onupgradeneeded=()=>r.result.createObjectStore('samples');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}));},
    async run(mode,f){const db=await this.open();return new Promise((res,rej)=>{const tx=db.transaction('samples',mode),q=f(tx.objectStore('samples'));tx.oncomplete=()=>res(q&&q.result);tx.onerror=()=>rej(tx.error);});},
    put(k,v){return this.run('readwrite',s=>s.put(v,k));},get(k){return this.run('readonly',s=>s.get(k));},del(k){return this.run('readwrite',s=>s.delete(k));}};
  const saveCfg=()=>store.set('sampler',SAMPLER.pads.map(p=>({name:p.name,vol:p.vol,mode:p.mode,custom:!!p.custom})));
  const repaint=()=>decks.forEach(d=>{if(d.padMode==='smp')renderPads(d);});
  async function loadSample(i,bytes,name){
    try{await samplerLoad(i,bytes,name);}catch(e){toast('Impossible de lire ce son : format non pris en charge.');return false;}
    saveCfg();repaint();try{await DB.put(i,{name,bytes});}catch(e){toast('Son chargé, mais il ne sera pas gardé après fermeture (stockage indisponible).');}
    toast('« '+name+' » sur le pad '+(i+1)+' du sampler','ok');return true;
  }
  const baseName=n=>n.split(/[\\/]/).pop().replace(/\.[^.]+$/,'');
  async function loadSampleFile(i,f){return loadSample(i,await f.arrayBuffer(),baseName(f.name));}
  async function pickSample(i){
    const N=window.mixlabNative;
    if(N&&N.pickFiles){const fs=await N.pickFiles();if(fs&&fs[0])return loadSample(i,await N.readFile(fs[0].path),baseName(fs[0].name||fs[0].path));return false;}
    const inp=h('input',{type:'file',accept:'audio/*',style:'display:none'});document.body.append(inp);
    inp.addEventListener('change',()=>{const f=inp.files[0];inp.remove();if(f)loadSampleFile(i,f);});inp.click();
  }
  function sampleEditor(i,anchor){
    const p=SAMPLER.pads[i];if(!p)return;
    const name=h('input',{type:'text',class:'pin',value:p.name,maxlength:24,'aria-label':'Nom du son'});
    name.addEventListener('input',()=>{p.name=name.value.trim()||'Son '+(i+1);saveCfg();repaint();});
    const vol=h('input',{type:'range',class:'prg',min:0,max:1,step:.01,value:p.vol??.8,'aria-label':'Volume du son'});
    vol.addEventListener('input',()=>{samplerVol(i,+vol.value);saveCfg();});
    const mode=h('select',{class:'sel','aria-label':'Mode de lecture'},SMP_MODES.map(([k,n])=>h('option',{value:k},n)));mode.value=p.mode||'shot';
    mode.addEventListener('change',()=>{p.mode=mode.value;samplerStop(i);saveCfg();});
    popover(anchor,'Sampler · pad '+(i+1),[name,
      h('label',{class:'prow'},h('span',{class:'lbl'},'Volume'),vol),
      h('label',{class:'prow',title:'Un coup : joue le son, un nouvel appui le coupe. Boucle calée : boucle au tempo de la platine maître, départ sur le temps. Maintien : joue tant que le pad est appuyé.'},h('span',{class:'lbl'},'Lecture'),mode),
      h('div',{class:'pa'},h('button',{class:'b',type:'button',onclick:()=>{close();pickSample(i);}},'Charger un son…'),
        p.custom?h('button',{class:'b',type:'button',onclick:()=>{samplerReset(i);DB.del(i).catch(()=>{});saveCfg();repaint();close();}},'Son d’origine'):null)]);
  }
  async function restoreSamples(){
    const cfg=store.get('sampler',null);if(!Array.isArray(cfg))return;
    cfg.forEach((c,i)=>{const p=SAMPLER.pads[i];if(!p||!c)return;if(c.vol!=null)p.vol=c.vol;if(c.mode)p.mode=c.mode;if(!c.custom&&c.name)p.name=c.name;});
    for(let i=0;i<cfg.length;i++){if(!cfg[i]||!cfg[i].custom)continue;try{const v=await DB.get(i);if(v&&v.bytes){await samplerLoad(i,v.bytes,cfg[i].name||v.name);}}catch(e){}}
    repaint();
  }

  function padMenu(d,i,anchor){
    if(d.padMode==='hot')cueEditor(d,i,anchor);
    else if(d.padMode==='smp')sampleEditor(i,anchor);
    else if(d.padMode==='sloop'&&d.track&&d.track.loops&&d.track.loops[i]){d.track.loops.splice(i,1);renderPads(d);toast('Boucle supprimée');}
    else if(d.padMode==='sloop'||d.padMode==='slice'||d.padMode==='pitch')cueList(d,anchor);
  }

  function init(){
    // la plage d'analyse BPM se règle dans Préférences › Platines
    restoreSamples();
  }
  function setBpmRange(k){const r=BPM_RANGES.find(x=>x[0]===k);if(!r)return;S.bpmRange=r[1];store.set('bpmRange',k);}
  return{init,popover,close,longPress,cueEditor,cueList,sampleEditor,padMenu,loadSample,loadSampleFile,pickSample,setBpmRange,BPM_RANGES,DB};
})();
