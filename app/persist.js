'use strict';
/* =====================================================================
   Mixlab · mémoire entre deux sessions
   - Cache d'analyse (IndexedDB) : BPM, grille, tonalité, waveform, sections,
     énergie et cues de structure, rangés sous l'empreinte du fichier
     (taille + hachage du début et de la fin). Un morceau réimporté, ou
     rechargé au démarrage, n'est plus réanalysé.
     Invalidation : version de l'analyse, plage de BPM différente, fichier
     modifié (empreinte différente), et les plus anciens au-delà de MAX.
   - Tags lus à l'import (tags.js) avant le décodage.
   - Réglages des unités d'effets (type, durée, dosage, réglages, cibles)
     gardés et rendus au démarrage.
   ===================================================================== */
window.Persist=(()=>{
  const V='ana1:'+WF+':'+HOP,MAX=2000,EDGE=65536;
  const P={db:null,hits:0,miss:0,last:''};

  /* ---------- empreinte ---------- */
  function fnv(u,a,b,h){for(let i=a;i<b;i++){h^=u[i];h=Math.imul(h,16777619);}return h>>>0;}
  function fingerprint(u){
    const n=u.length,a=Math.min(n,EDGE),b=Math.max(a,n-EDGE);
    const h1=fnv(u,b,n,fnv(u,0,a,2166136261)),h2=fnv(u,b,n,fnv(u,0,a,0x811c9dc5^n));
    return n.toString(36)+'.'+h1.toString(36)+'.'+(Math.imul(h2,2654435761)>>>0).toString(36);
  }

  /* ---------- IndexedDB ---------- */
  function db(){
    if(P.db)return P.db;
    P.db=new Promise(ok=>{
      try{
        const r=indexedDB.open('mixlab-analyse',1);
        r.onupgradeneeded=()=>{const s=r.result.createObjectStore('ana',{keyPath:'fp'});s.createIndex('used','used');};
        r.onsuccess=()=>ok(r.result);r.onerror=()=>ok(null);r.onblocked=()=>ok(null);
      }catch(e){ok(null);}
    });
    return P.db;
  }
  const run=(mode,fn)=>db().then(d=>d?new Promise(ok=>{
    try{const tx=d.transaction('ana',mode),r=fn(tx.objectStore('ana'));tx.oncomplete=()=>ok(r&&r.result);tx.onerror=tx.onabort=()=>ok(null);}catch(e){ok(null);}
  }):null);
  const get=fp=>run('readonly',s=>s.get(fp));
  const put=rec=>run('readwrite',s=>s.put(rec));
  const del=fp=>run('readwrite',s=>s.delete(fp));
  const count=()=>run('readonly',s=>s.count());
  const clear=()=>run('readwrite',s=>s.clear());
  // Garde les MAX entrées les plus récemment servies.
  async function prune(){
    const n=await count();if(!n||n<=MAX)return 0;let k=n-MAX;
    await run('readwrite',s=>{const c=s.index('used').openCursor();c.onsuccess=()=>{const x=c.result;if(!x||k<=0)return;x.delete();k--;x.continue();};return null;});
    return n-MAX;
  }
  const rangeOf=(tagBpm)=>tagBpm?[tagBpm-.5,tagBpm+.5]:S.bpmRange.slice();
  const sameRange=(a,b)=>!!(a&&b&&Math.abs(a[0]-b[0])<1e-6&&Math.abs(a[1]-b[1])<1e-6);

  /* ---------- avant le décodage : tags et cache ----------
     buf : le fichier (ArrayBuffer), à lire AVANT decodeAudioData qui le vide.
     o.saved : le morceau revient d'une bibliothèque enregistrée (BPM et tonalité déjà connus).
     Renvoie {fp, tags, hit, rec, meta} ; meta va dans addTrack. */
  async function pre(buf,name,o={}){
    const out={fp:null,tags:{},hit:false,rec:null,meta:{}};
    try{
      const u=new Uint8Array(buf);
      out.tags=window.Tags?Tags.parse(u):{};
      out.fp=fingerprint(u);
      const tk=window.Tags?Tags.keyOf(out.tags.key):null;
      if(tk&&!o.key)out.meta.key=tk;
      const hint=!o.saved&&out.tags.bpm&&out.tags.bpm>=60&&out.tags.bpm<=200?out.tags.bpm:null;
      const range=rangeOf(hint);out.range=range;
      if(!hint)out.meta.range=null;else out.meta.range=range;
      const r=await get(out.fp);
      // morceau déjà enregistré : son BPM gardé fait foi, la plage d'analyse importe peu
      if(r&&r.v===V&&(o.saved||sameRange(r.range,range))&&r.wf&&r.wf.l){
        out.hit=true;out.rec=r;P.hits++;
        out.meta.analysis={bpm:r.bpm,grid:r.grid,rmsDb:r.rmsDb,key:r.key||null,wf:r.wf,
          ...(r.sections?{sections:r.sections,energy:r.energy,musicEnd:r.musicEnd,memCues:r.memCues||[]}:{})};
        r.used=Date.now();put(r);
      }else{
        if(r)del(out.fp);
        P.miss++;
      }
    }catch(e){console.warn('Persist',e);}
    if(out.meta.range==null)delete out.meta.range;
    return out;
  }
  /* ---------- après addTrack : tags, mise en cache ---------- */
  // La partie utile tout de suite (tags, structure) est synchrone ; seules la vignette et l'écriture du cache attendent.
  async function post(tr,p){
    if(!tr||!p)return tr;
    tr._fp=p.fp;tr.anaFrom=p.hit?'cache':'analyse';
    const art=window.Tags?Tags.apply(tr,p.tags):null;
    if(p.hit){
      const r=p.rec;
      // grille modifiée depuis (bibliothèque enregistrée) : la structure est recalculée sur la bonne grille
      if(r.sections&&(Math.abs(tr.bpm-r.sbpm)>1e-3||Math.abs(tr.grid-r.sgrid)>1e-3))window.Structure&&Structure.queue(tr);
    }else if(p.fp){
      const w=tr.wf;
      await put({fp:p.fp,v:V,range:p.range,used:Date.now(),file:tr.file||'',bpm:tr._a.bpm,grid:tr._a.grid,rmsDb:tr.rmsDb,key:tr._a.key||tr.key||null,
        wf:{l:w.l,m:w.m,h:w.h,scale:w.scale}});
      if(tr.sections)onStructure(tr);
    }
    await art;
    return tr;
  }
  // Fin de l'analyse de structure (structure.js) : on la range avec le reste.
  async function onStructure(tr){
    if(!tr||!tr._fp||!tr.sections)return;
    const r=await get(tr._fp);if(!r||r.v!==V)return;
    Object.assign(r,{sections:tr.sections,energy:tr.energy,musicEnd:tr.musicEnd,memCues:(tr.memCues||[]).filter(m=>m.type),sbpm:tr.bpm,sgrid:tr.grid,used:Date.now()});
    await put(r);
  }

  /* ---------- réglages des effets ---------- */
  const fxOut=()=>FXU.map(u=>({mode:u.mode,beats:u.beats,targets:[...u.targets],slots:u.slots.map(s=>({type:s.type,amount:s.amount,on:s.on,p1:s.p1,p2:s.p2}))}));
  const num01=(v,d)=>typeof v==='number'&&isFinite(v)?Math.max(0,Math.min(1,v)):d;
  function fxIn(list){
    if(!Array.isArray(list))return;
    const types=new Set(FX_TYPES.map(x=>x[0]));
    list.slice(0,FXU.length).forEach((x,i)=>{
      const u=FXU[i];if(!x||!u)return;
      if(Array.isArray(x.targets)){const t=x.targets.filter(t=>FX_TARGETS.includes(t));FX_TARGETS.forEach(k=>u.toggle(k,t.includes(k)));}
      if(FX_BEATS.includes(x.beats))u.beats=x.beats;
      if(x.mode==='single'||x.mode==='chain')u.setMode(x.mode);
      (x.slots||[]).slice(0,u.slots.length).forEach((s,j)=>{
        if(!s)return;const c=u.slots[j];
        if(types.has(s.type)&&s.type!==c.type)u.setSlot(j,{type:s.type});
        u.setSlot(j,{amount:num01(s.amount,c.amount),p1:num01(s.p1,c.p1),p2:num01(s.p2,c.p2),on:typeof s.on==='boolean'?s.on:c.on});
      });
    });
  }
  function fxSave(){try{const s=JSON.stringify(fxOut());if(s!==P.last){P.last=s;store.set('fx',JSON.parse(s));}}catch(e){}}
  try{fxIn(store.get('fx',null));}catch(e){console.warn('Persist fx',e);}
  P.last=JSON.stringify(fxOut());
  setInterval(fxSave,1000);
  window.addEventListener('pagehide',fxSave);
  window.addEventListener('beforeunload',fxSave);
  setTimeout(()=>{prune();},5000);

  return{pre,post,onStructure,fingerprint,get,clear,prune,count,fxOut,fxIn,fxSave,
    get stats(){return{hits:P.hits,miss:P.miss};},VERSION:V};
})();
