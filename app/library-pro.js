'use strict';
/* =====================================================================
   Mixlab · bibliothèque pro
   - Note, couleur, énergie, tags, commentaire et genre éditables (clic droit).
   - Colonnes en plus et choix des colonnes affichées.
   - Recherche par champ : bpm:120-126 key:8A rating:>=4 tag:peak.
   - Crates intelligentes (règles ET / OU), mises à jour en direct.
   - Historique des sets et export de la tracklist (texte, CSV).
   - Import rekordbox XML, iTunes / Musique XML, M3U ; export rekordbox XML et M3U8.
   - Doublons, fichiers manquants à relocaliser.
   - Playlists Spotify, Deezer… (liste ou CSV) retrouvées dans la collection.
   Aucun appel réseau : les liens d'achat s'ouvrent dans le navigateur.
   ===================================================================== */
window.LibPro=(()=>{
  const N=()=>window.mixlabNative||null;
  const COLORS=[
    {id:1,name:'Rose',c:'#ff5fa2',rb:'0xFF007F'},{id:2,name:'Rouge',c:'#ff4d5e',rb:'0xFF0000'},
    {id:3,name:'Orange',c:'#ffa53a',rb:'0xFFA500'},{id:4,name:'Jaune',c:'#ffd34d',rb:'0xFFFF00'},
    {id:5,name:'Vert',c:'#3fd679',rb:'0x00FF00'},{id:6,name:'Turquoise',c:'#31d3c8',rb:'0x25FDE9'},
    {id:7,name:'Bleu',c:'#2fa8ff',rb:'0x0000FF'},{id:8,name:'Violet',c:'#a78bfa',rb:'0x660099'}];
  const colorOf=id=>COLORS.find(c=>c.id===+id)||null;
  const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const nrg=t=>t.energyUser??t.energy??null;
  const base=p=>String(p||'').split(/[\\/]/).pop();
  const xa=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
  const pad2=n=>String(n).padStart(2,'0');
  const ymd=d=>{d=d?new Date(d):null;return d&&isFinite(d)?d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()):'';};
  const shortDate=d=>{d=new Date(d);return pad2(d.getDate())+'/'+pad2(d.getMonth()+1)+' '+pad2(d.getHours())+':'+pad2(d.getMinutes());};
  const S={hide:new Set(store.get('libcols',['comment','last'])),show:new Set(store.get('libcolsOn',[])),auto:new Set(),autoW:0,crates:store.get('crates',[]),sets:store.get('sets',[]),sid:'s'+Date.now(),qc:null};

  /* ---------- tonalités ---------- */
  const NOTE={c:0,d:2,e:4,f:5,g:7,a:9,b:11};
  function parseKey(s){
    s=String(s||'').trim();let m=/^0?(\d{1,2})\s*([ab])$/i.exec(s);
    if(m){const n=+m[1],minor=m[2].toUpperCase()==='A',pc=(minor?WHEEL_MIN:WHEEL_MAJ).indexOf(n);return pc<0?null:{pc,minor};}
    m=/^(\d{1,2})([dm])$/i.exec(s); // Open Key (Traktor) : 1d = 8B, 1m = 8A
    if(m&&+m[1]>=1&&+m[1]<=12){const n=(+m[1]+6)%12+1,minor=m[2].toLowerCase()==='m';return{pc:(minor?WHEEL_MIN:WHEEL_MAJ).indexOf(n),minor};}
    m=/^([a-g])([#♯b♭]?)\s*(m|min|minor|maj|major)?$/i.exec(s);
    if(!m)return null;
    return{pc:(NOTE[m[1].toLowerCase()]+(/[#♯]/.test(m[2])?1:/[b♭]/.test(m[2])?-1:0)+12)%12,minor:!!m[3]&&/^m(in(or)?)?$/i.test(m[3])};
  }
  const sameKey=(a,b)=>!!(a&&b&&a.pc===b.pc&&!!a.minor===!!b.minor);

  /* ---------- version navigateur : bibliothèque gardée dans IndexedDB ----------
     Dans l'appli, tout part dans la bibliothèque (desktop.js). Dans le navigateur, le son ne peut
     pas être gardé : on garde les analyses, cues, infos et playlists de chaque morceau sous une clé
     (nom du fichier, ou artiste|titre pour les démos) et on les rend quand le morceau revient.
     Chrome et Edge gardent aussi l'accès aux fichiers (File System Access) : un clic les rouvre. */
  const mkey=t=>fold(t.artist)+'|'+fold(t.title);
  const bkey=t=>t.file?'f:'+t.file.toLowerCase():'m:'+mkey(t);
  const B={db:null,loaded:false,saved:false,last:'',recs:new Map(),pend:new Map(),handles:new Map(),timer:0};
  function idb(){
    if(B.db)return B.db;
    B.db=new Promise((ok,ko)=>{try{const r=indexedDB.open('mixlab',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error);}catch(e){ko(e);}});
    return B.db;
  }
  const idbDo=(mode,fn)=>idb().then(db=>new Promise((ok,ko)=>{const tx=db.transaction('kv',mode),r=fn(tx.objectStore('kv'));tx.oncomplete=()=>ok(r&&r.result);tx.onerror=()=>ko(tx.error);}));
  const idbGet=k=>idbDo('readonly',st=>st.get(k)),idbSet=(k,v)=>idbDo('readwrite',st=>st.put(v,k));
  // hot cues, noms et couleurs (hotMeta), cues mémoire et boucles gardées passent par metaOut/metaIn
  const recOf=t=>({k:t._bk||bkey(t),title:t.title,artist:t.artist,genre:t.genre,file:t.file||null,bpm:t.bpm,grid:t.grid,key:t.key,cue:t.cue,hot:t.hot,plays:t.plays,added:t.added,...metaOut(t)});
  function applyRec(t,r){
    if(r.bpm)t.bpm=r.bpm;if(r.grid!=null)t.grid=r.grid;if(r.cue!=null)t.cue=r.cue;if(r.key)t.key=r.key;
    if(Array.isArray(r.hot))t.hot=r.hot.slice(0,8).concat(Array(8).fill(null)).slice(0,8);
    if(r.title)t.title=r.title;if(r.artist!=null)t.artist=r.artist;if(r.genre!=null)t.genre=r.genre;
    if(r.plays)t.plays=r.plays;if(r.added)t.added=new Date(r.added);metaIn(t,r);t.ov=null;
  }
  // Un morceau qui arrive (démo, import) retrouve ses infos et ses playlists.
  function adopt(t){
    const r=B.recs.get(t._bk);if(!r)return;B.recs.delete(t._bk);applyRec(t,r);
    (B.pend.get(t._bk)||[]).forEach(id=>{const p=LIB.playlists.find(q=>q.id===id);if(p&&!p.ids.includes(t.id))p.ids.push(t.id);});B.pend.delete(t._bk);
  }
  const origAdd=window.addTrack;
  window.addTrack=function(buffer,meta){const t=origAdd(buffer,meta);t._bk=bkey(t);if(!t.path&&B.loaded)adopt(t);return t;};
  function browserSnap(){
    const byId=new Map(LIB.tracks.map(t=>[t.id,t]));
    return JSON.stringify({version:1,tracks:LIB.tracks.filter(t=>!t.path&&t._bk).map(recOf).concat([...B.recs.values()]),
      playlists:LIB.playlists.map(p=>({id:p.id,name:p.name,keys:p.ids.map(i=>{const t=byId.get(i);return t&&!t.path?t._bk:null;}).filter(Boolean).concat([...B.pend].filter(([,ids])=>ids.includes(p.id)).map(([k])=>k))})),
      crates:S.crates,sets:allSets()});
  }
  async function browserSave(){
    if(N()||!B.loaded)return;const s=browserSnap();if(s===B.last)return;
    try{await idbSet('library',s);B.last=s;}catch(e){}
  }
  async function browserLoad(){
    let d=null;try{const s=await idbGet('library');d=s?JSON.parse(s):null;const hs=await idbGet('handles');if(hs)B.handles=new Map(Object.entries(hs));}catch(e){}
    if(d){
      B.saved=true;
      (d.tracks||[]).forEach(r=>{if(r&&r.k)B.recs.set(r.k,r);});
      const byKey=new Map(LIB.tracks.filter(t=>!t.path).map(t=>[t._bk,t]));
      const pls=(d.playlists||[]).map(p=>{let q=LIB.playlists.find(x=>x.id===p.id);if(!q)q={id:p.id,name:p.name,ids:[]};q.name=p.name||q.name;q.ids=[];
        (p.keys||[]).forEach(k=>{const t=byKey.get(k);if(t){if(!q.ids.includes(t.id))q.ids.push(t.id);}else{if(!B.pend.has(k))B.pend.set(k,[]);B.pend.get(k).push(q.id);}});return q;});
      if(Array.isArray(d.playlists))LIB.playlists.splice(0,LIB.playlists.length,...pls);
      extraIn(d);
    }
    B.loaded=true;
    LIB.tracks.filter(t=>!t.path).forEach(adopt);
    B.last=browserSnap();
    renderSide();renderTable();
    setInterval(browserSave,3000);
    window.addEventListener('pagehide',browserSave);
    const nm=missingList().length;
    if(nm)toast(nm+' morceau'+(nm>1?'x':'')+' de ta bibliothèque à rouvrir : voir « Fichiers manquants »');
  }
  // Navigateurs avec File System Access : le bouton Importer garde l'accès aux fichiers.
  document.addEventListener('click',async e=>{
    const l=e.target.closest&&e.target.closest('.libbar label.filebtn');if(!l||N()||!window.showOpenFilePicker)return;
    e.preventDefault();
    let hs=[];try{hs=await showOpenFilePicker({multiple:true,types:[{description:'Audio',accept:{'audio/*':AUDIO_EXT.map(e=>'.'+e)}}]});}catch(err){return;}
    hs.forEach(x=>B.handles.set(x.name.toLowerCase(),x));
    try{await idbSet('handles',Object.fromEntries(B.handles));}catch(err){}
    importFiles(await Promise.all(hs.map(x=>x.getFile())),null);
  },true);
  const missingList=()=>N()?(window.Desktop?Desktop.missing:[]):[...B.recs.values()].filter(r=>r.file);
  async function reopen(){
    const files=[];
    for(const r of missingList()){const x=B.handles.get(r.file.toLowerCase());if(!x)continue;
      try{if(x.queryPermission&&(await x.queryPermission({mode:'read'}))!=='granted'&&(await x.requestPermission({mode:'read'}))!=='granted')continue;files.push(await x.getFile());}catch(e){}}
    if(files.length)await importFiles(files,null);return files.length;
  }
  const saveMeta=()=>{if(!N()){clearTimeout(B.timer);B.timer=setTimeout(browserSave,400);}};
  /* Cues : les platines lisent hot (temps), hotMeta ({name,color} par pad), memCues ({t,label,color},
     ceux qui ont un type viennent de l'analyse de structure) et loops ({start,end,label}).
     Anciennes sauvegardes : mem ({t,name}) et hotName (noms seuls) sont convertis au chargement. */
  const userCues=t=>(t.memCues||[]).filter(m=>m&&!m.type&&isFinite(m.t)).map(m=>({t:+m.t,label:m.label||'',color:m.color||'#ffffff'}));
  function cuesIn(t,r){
    let hm=Array.isArray(r.hotMeta)?r.hotMeta:null;
    if(!hm&&Array.isArray(r.hotName))hm=r.hotName.map(n=>n?{name:String(n),color:null}:null);
    if(hm)t.hotMeta=hm.slice(0,8).map(m=>m&&(m.name||m.color)?{name:String(m.name||''),color:m.color||null}:null).concat(Array(8).fill(null)).slice(0,8);
    let mc=Array.isArray(r.memCues)?r.memCues:null;
    if(!mc&&Array.isArray(r.mem))mc=r.mem.map(m=>m&&{t:m.t,label:m.name||'',color:m.color});
    if(mc){
      const user=mc.filter(m=>m&&!m.type&&isFinite(m.t)).map((m,i)=>({t:+m.t,label:m.label||'Cue '+(i+1),color:m.color||'#ffffff'}));
      t.memCues=(t.memCues||[]).filter(m=>m&&m.type).concat(user).sort((a,b)=>a.t-b.t);
    }
    if(Array.isArray(r.loops))t.loops=r.loops.filter(l=>l&&isFinite(l.start)&&isFinite(l.end)&&l.end>l.start).map((l,i)=>({start:+l.start,end:+l.end,label:l.label||'Boucle '+(i+1)}));
    delete t.mem;delete t.hotName;
  }
  function metaOut(t){
    const o={};
    if(t.rating)o.rating=t.rating;if(t.color)o.color=t.color;if(t.comment)o.comment=t.comment;
    if(t.tags&&t.tags.length)o.tags=t.tags;if(t.energyUser!=null)o.energyUser=t.energyUser;
    const user=userCues(t);if(user.length)o.memCues=user;
    if(t.hotMeta&&t.hotMeta.some(Boolean))o.hotMeta=t.hotMeta.slice(0,8).map(m=>m?{name:m.name||'',color:m.color||null}:null);
    if(t.loops&&t.loops.length)o.loops=t.loops.map(l=>({start:l.start,end:l.end,label:l.label||''}));
    if(t.lastPlayed)o.lastPlayed=t.lastPlayed;
    return o;
  }
  function metaIn(t,r){
    if(r.rating)t.rating=Math.max(0,Math.min(5,Math.round(r.rating)));
    if(r.color)t.color=+r.color;if(r.comment)t.comment=String(r.comment);
    if(Array.isArray(r.tags))t.tags=r.tags.map(String);
    if(r.energyUser!=null)t.energyUser=+r.energyUser;
    cuesIn(t,r);
    if(r.lastPlayed)t.lastPlayed=new Date(r.lastPlayed);
  }
  const DEFAULT_PL=new Set(LIB.playlists.map(p=>p.id));
  function extraOut(){return{crates:S.crates,sets:allSets(),plOrder:LIB.playlists.map(p=>p.id)};}
  function extraIn(d){
    if(Array.isArray(d.crates)&&d.crates.length){const have=new Set(S.crates.map(c=>c.id));d.crates.forEach(c=>{if(!have.has(c.id))S.crates.push(c);});store.set('crates',S.crates);}
    if(Array.isArray(d.sets)){const have=new Set(S.sets.map(s=>s.id));d.sets.forEach(s=>{if(s.id!==S.sid&&!have.has(s.id))S.sets.push(s);});S.sets.sort((a,b)=>a.start<b.start?-1:1);}
    // Playlists supprimées ou déplacées : l'ordre enregistré fait foi, y compris pour celles de départ.
    if(Array.isArray(d.plOrder)){const o=new Map(d.plOrder.map((id,i)=>[id,i]));const keep=LIB.playlists.filter(p=>o.has(p.id)||!DEFAULT_PL.has(p.id));
      keep.sort((a,b)=>(o.get(a.id)??1e9)-(o.get(b.id)??1e9));LIB.playlists.splice(0,LIB.playlists.length,...keep);}
  }
  const changed=t=>{saveMeta(t);renderTable();};

  /* ---------- colonnes ---------- */
  const stars=t=>{const v=t.rating||0;return h('td',{class:'stars','data-id':t.id,title:'Note de 1 à 5 : clique un repère'},[1,2,3,4,5].map(i=>h('span',{class:i<=v?'on':'','data-v':i,'aria-label':i+'/5'})));};
  const EXTRA=[
    {k:'rating',n:'Note',td:r=>stars(r.t),sv:t=>t.rating||0},
    {k:'color',n:'Couleur',td:r=>{const c=colorOf(r.t.color);return h('td',{class:'cc',title:c?c.name:''},c?h('i',{class:'cdot',style:'background:'+c.c}):'');},sv:t=>t.color||99},
    {k:'energy',n:'Énergie',td:r=>{const e=nrg(r.t);return h('td',{class:'n nrg'+(r.t.energyUser!=null?' user':''),title:r.t.energyUser!=null?'Énergie choisie par toi':'Énergie estimée'},e==null?'—':[h('i',{style:'--e:'+e*10+'%'}),String(e)]);},sv:t=>nrg(t)??-1},
    {k:'tags',n:'Tags',td:r=>h('td',{class:'tagc'},(r.t.tags||[]).map(x=>h('span',{class:'tagchip'},x))),sv:t=>(t.tags||[]).join(' ')},
    {k:'comment',n:'Commentaire',td:r=>h('td',{class:'cmt',title:r.t.comment||''},r.t.comment||''),sv:t=>t.comment||''},
    {k:'last',n:'Dernière lecture',td:r=>h('td',{class:'n'},r.t.lastPlayed?shortDate(r.t.lastPlayed):'—'),sv:t=>t.lastPlayed?+new Date(t.lastPlayed):0},
  ];
  COLS.splice(COLS.findIndex(c=>c.k==='load'),0,...EXTRA);
  // Masquée par toi, ou masquée d'office parce que le tableau est trop étroit (sauf si tu l'as cochée toi-même).
  const hidden=k=>S.hide.has(k)||(S.auto.has(k)&&!S.show.has(k));
  const FIXED=['deck','title','load'];
  /* Colonnes par défaut selon la largeur du tableau : Charger reste toujours visible.
     Sous 1 300 px, ni Couleur ni Tags (la couleur passe en liseré de ligne) ; sous 1 100 px, ni Joué ni Genre ;
     et si ça déborde encore, on retire dans cet ordre jusqu'à ce que tout tienne. */
  const AUTO=['color','tags','plays','genre','energy','rating','dur','artist'];
  function autoCols(){
    const tw=lib.tw;if(!tw||!tw.isConnected||!tw.clientWidth)return;
    const w=tw.clientWidth;if(Math.abs(w-S.autoW)<2&&tw.scrollWidth<=w)return;S.autoW=w;
    const was=[...S.auto].join();
    S.auto=new Set(w<1100?['color','tags','plays','genre']:w<1300?['color','tags']:[]);
    if([...S.auto].join()!==was)renderTable();
    for(const k of AUTO){if(tw.scrollWidth<=tw.clientWidth)break;if(hidden(k)||S.show.has(k))continue;S.auto.add(k);renderTable();}
  }
  let acq=0;const autoSoon=()=>{if(!acq)acq=requestAnimationFrame(()=>{acq=0;autoCols();});};
  const watchW=()=>{if(!lib.tw){setTimeout(watchW,200);return;}const ro=new ResizeObserver(autoSoon);ro.observe(lib.tw);
    // le tableau peut s'élargir sans que la zone change (titres plus longs, plus de platines) : on le surveille aussi
    const tb=lib.tw.querySelector('table');if(tb)ro.observe(tb);autoSoon();};watchW();
  function colMenu(){
    const pop=h('div',{class:'pop'});
    const fill=()=>{pop.innerHTML='';COLS.filter(c=>!FIXED.includes(c.k)).forEach(c=>{const cb=h('input',{type:'checkbox'});cb.checked=!hidden(c.k);cb.addEventListener('change',()=>{if(cb.checked){S.hide.delete(c.k);S.show.add(c.k);}else{S.hide.add(c.k);S.show.delete(c.k);}store.set('libcols',[...S.hide]);store.set('libcolsOn',[...S.show]);renderTable();});pop.append(h('label',{},cb,c.n||'#'));});};
    const d=h('details',{class:'menu colmenu'},h('summary',{class:'tb',title:'Choisir les colonnes affichées'},'Colonnes'),pop);
    d.addEventListener('toggle',()=>{if(d.open)fill();});
    document.addEventListener('click',e=>{if(d.open&&!d.contains(e.target))d.open=false;});
    return d;
  }
  function bar(){
    return[
      h('button',{class:'tb',type:'button',title:'Modifier les infos du morceau sélectionné (ou clic droit sur une ligne)',onclick:e=>{const t=LIB.tracks.find(x=>x.id===ui.sel);if(t)edit(t,e);else toast('Sélectionne d’abord un morceau');}},'Infos'),
      colMenu(),
      h('button',{class:'tb',type:'button',title:'Importer une collection rekordbox, iTunes, M3U ; exporter vers une clé USB ; retrouver une playlist Spotify ou Deezer',onclick:()=>exchange()},'Import / export'),
    ];
  }
  // Clic sur une étoile : note directe, sans ouvrir le panneau (même étoile = on enlève la note).
  document.addEventListener('click',e=>{
    const s=e.target.closest&&e.target.closest('.lt td.stars span');if(!s)return;
    const t=LIB.tracks.find(x=>x.id===+s.parentNode.dataset.id);if(!t)return;
    const v=+s.dataset.v;t.rating=t.rating===v?0:v;changed(t);
  });

  /* ---------- panneau d'édition ---------- */
  let panel=null;
  function closeEdit(){if(panel){panel.remove();panel=null;}}
  function edit(t,ev){
    closeEdit();
    const inp=(label,val,set,attrs={})=>{const i=h(attrs.tag||'input',{class:'in',value:attrs.tag?null:val??'',...attrs,tag:null});if(attrs.tag)i.value=val??'';i.addEventListener('input',()=>{set(i.value);changed(t);});return h('label',{class:'f'},h('span',{},label),i);};
    const starsRow=h('div',{class:'srow',role:'radiogroup','aria-label':'Note'});
    const drawStars=()=>{starsRow.innerHTML='';[1,2,3,4,5].forEach(i=>starsRow.append(h('button',{type:'button',class:'st'+(i<=(t.rating||0)?' on':''),'aria-label':i+' étoile'+(i>1?'s':''),onclick:()=>{t.rating=t.rating===i?0:i;drawStars();changed(t);}})));};
    drawStars();
    const sw=h('div',{class:'swr'});
    const drawSw=()=>{sw.innerHTML='';sw.append(h('button',{type:'button',class:'sw none'+(!t.color?' on':''),title:'Aucune couleur',onclick:()=>{t.color=0;drawSw();changed(t);}},'×'),...COLORS.map(c=>h('button',{type:'button',class:'sw'+(t.color===c.id?' on':''),title:c.name,'aria-label':c.name,style:'background:'+c.c,onclick:()=>{t.color=c.id;drawSw();changed(t);}})));};
    drawSw();
    const ev2=h('b',{class:'ev'},'');
    const rng=h('input',{type:'range',min:1,max:10,step:1,'aria-label':'Énergie'});
    const auto=h('button',{type:'button',class:'b',title:'Revenir à l’énergie estimée par l’analyse'},'Auto');
    const drawE=()=>{const e=nrg(t);rng.value=String(e??5);ev2.textContent=e==null?'—':String(e);auto.disabled=t.energyUser==null;ev2.title=t.energyUser!=null?'Choisie par toi':'Estimée';};
    rng.addEventListener('input',()=>{t.energyUser=+rng.value;drawE();changed(t);});
    auto.addEventListener('click',()=>{t.energyUser=null;delete t.energyUser;drawE();changed(t);});drawE();
    const tagsIn=inp('Tags (séparés par des virgules)',(t.tags||[]).join(', '),v=>{t.tags=[...new Set(v.split(',').map(x=>x.trim()).filter(Boolean))];},{list:'lp-tags',placeholder:'warm-up, vocal, peak…'});
    const known=new Set();LIB.tracks.forEach(x=>(x.tags||[]).forEach(y=>known.add(y)));
    panel=h('div',{class:'lpe',role:'dialog','aria-label':'Infos du morceau'},
      h('div',{class:'lpe-h'},h('b',{},'Infos du morceau'),h('button',{type:'button',class:'b',onclick:closeEdit,'aria-label':'Fermer'},'×')),
      inp('Titre',t.title,v=>{t.title=v;}),inp('Artiste',t.artist,v=>{t.artist=v;}),inp('Genre',t.genre,v=>{t.genre=v;}),
      h('div',{class:'f'},h('span',{},'Note'),starsRow),
      h('div',{class:'f'},h('span',{},'Couleur'),sw),
      h('div',{class:'f'},h('span',{},'Énergie (1 calme, 10 à fond)'),h('div',{class:'erow'},rng,ev2,auto)),
      tagsIn,h('datalist',{id:'lp-tags'},[...known].map(x=>h('option',{value:x}))),
      inp('Commentaire',t.comment,v=>{t.comment=v;},{tag:'textarea',rows:3,placeholder:'Ex. : intro longue, parfait pour ouvrir'}));
    document.body.append(panel);
    const W=panel.offsetWidth,H=panel.offsetHeight,x=ev&&ev.clientX!=null?ev.clientX:innerWidth/2,y=ev&&ev.clientY!=null?ev.clientY:innerHeight/2;
    panel.style.left=Math.max(8,Math.min(innerWidth-W-8,x+6))+'px';panel.style.top=Math.max(8,Math.min(innerHeight-H-8,y-20))+'px';
    panel.querySelector('input').focus();
  }
  document.addEventListener('mousedown',e=>{if(panel&&!panel.contains(e.target))closeEdit();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeEdit();closeModal();}});

  /* ---------- recherche par champ ---------- */
  const FIELDS={bpm:'bpm',tempo:'bpm',key:'key',ton:'key',tonalite:'key',cle:'key',rating:'rating',note:'rating',stars:'rating',etoiles:'rating',
    tag:'tag',tags:'tag',genre:'genre',artist:'artist',artiste:'artist',title:'title',titre:'title',energy:'energy',energie:'energy',
    color:'color',couleur:'color',comment:'comment',commentaire:'comment',plays:'plays',joue:'plays'};
  function numTest(v,exactRound){
    v=v.replace(',','.');let m=/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(v);
    if(m){const a=Math.min(+m[1],+m[2]),b=Math.max(+m[1],+m[2]);return x=>x!=null&&x>=a&&x<=b+(exactRound?.499:0);}
    m=/^(>=|<=|>|<|=)?(\d+(?:\.\d+)?)$/.exec(v);if(!m)return null;const n=+m[2];
    switch(m[1]){case '>=':return x=>x!=null&&x>=n;case '<=':return x=>x!=null&&x<=n;case '>':return x=>x!=null&&x>n;case '<':return x=>x!=null&&x<n;
      default:return x=>x!=null&&(exactRound&&Number.isInteger(n)?Math.round(x)===n:Math.abs(x-n)<.05);}
  }
  function parseQuery(q){
    const tests=[],free=[];const re=/([^\s:"]+):("[^"]*"|\S*)|"([^"]*)"|(\S+)/g;let m;
    while((m=re.exec(q))){
      if(m[1]){
        const f=FIELDS[fold(m[1])],v=fold(m[2].replace(/^"|"$/g,'')).trim();
        if(!f){free.push(fold(m[0]));continue;}if(!v)continue;
        let fn=null;
        if(f==='bpm')fn=(T=>T&&(t=>T(t.bpm)))(numTest(v,true));
        else if(f==='rating')fn=(T=>T&&(t=>T(t.rating||0)))(numTest(v));
        else if(f==='energy')fn=(T=>T&&(t=>T(nrg(t))))(numTest(v));
        else if(f==='plays')fn=(T=>T&&(t=>T(t.plays||0)))(numTest(v));
        else if(f==='key'){const compat=v[0]==='~',k=parseKey(compat?v.slice(1):v);fn=k?(t=>t.key&&(compat?keysCompatible(k,t.key):sameKey(k,t.key))):(t=>false);}
        else if(f==='color'){const c=/^\d$/.test(v)?+v:/^(aucune|none|0)$/.test(v)?0:(COLORS.find(c=>fold(c.name).startsWith(v))||{id:-1}).id;fn=t=>(t.color||0)===c;}
        else if(f==='tag')fn=t=>(t.tags||[]).some(x=>fold(x).includes(v));
        else fn=t=>fold(t[f]).includes(v);
        tests.push(fn||(()=>false));
      }else free.push(fold(m[3]??m[4]));
    }
    return{tests,free:free.filter(Boolean)};
  }
  const hay=t=>{const ki=keyInfo(t.key);return fold([t.title,t.artist,t.album,t.genre,t.bpm?t.bpm.toFixed(0):'',ki?ki.name+' '+ki.code:'',(t.tags||[]).join(' '),t.comment].join(' '));};
  function matchQ(q){if(!S.qc||S.qc.q!==q)S.qc={q,p:parseQuery(q)};const{tests,free}=S.qc.p;return t=>tests.every(f=>f(t))&&(!free.length||(s=>free.every(w=>s.includes(w)))(hay(t)));}
  const filter=(rows,q)=>{const m=matchQ(q);return rows.filter(r=>m(r.t));};
  const search=(q,tracks=LIB.tracks)=>tracks.filter(matchQ(q.toLowerCase()));

  /* ---------- crates intelligentes ---------- */
  const RULES={
    bpm:{n:'BPM entre',def:{a:120,b:128}},key:{n:'Tonalité',def:{op:'compat',a:'8A'}},rating:{n:'Note au moins',def:{a:4}},
    color:{n:'Couleur',def:{a:1}},genre:{n:'Genre contient',def:{a:''}},tag:{n:'Tag',def:{a:''}},energy:{n:'Énergie entre',def:{a:6,b:10}},
    added:{n:'Ajouté il y a moins de',def:{a:30}},played:{n:'Déjà joué',def:{a:'no'}}};
  function ruleOk(r,t){
    switch(r.f){
      case 'bpm':return t.bpm>=+r.a&&t.bpm<=+r.b;
      case 'energy':{const e=nrg(t);return e!=null&&e>=+r.a&&e<=+r.b;}
      case 'key':{if(!t.key)return false;if(r.op==='master'){const d=refDeck(),k=d&&d.keyNow();return !!k&&d.track!==t&&keysCompatible(k,t.key);}const k=parseKey(r.a);return !!k&&(r.op==='compat'?keysCompatible(k,t.key):sameKey(k,t.key));}
      case 'rating':return(t.rating||0)>=+r.a;
      case 'color':return(t.color||0)===+r.a;
      case 'genre':return fold(t.genre).includes(fold(r.a).trim());
      case 'tag':{const v=fold(r.a).trim();return(t.tags||[]).some(x=>fold(x)===v);}
      case 'added':return !!t.added&&(Date.now()-new Date(t.added))/864e5<=+r.a;
      case 'played':return r.a==='yes'?t.plays>0:!t.plays;
    }
    return false;
  }
  const crateTracks=(c,tracks=LIB.tracks)=>c&&c.rules&&c.rules.length?tracks.filter(t=>c.match==='any'?c.rules.some(r=>ruleOk(r,t)):c.rules.every(r=>ruleOk(r,t))):[];
  function saveCrate(c){const i=S.crates.findIndex(x=>x.id===c.id);if(i<0)S.crates.push(c);else S.crates[i]=c;store.set('crates',S.crates);renderSide();renderTable();return c;}
  function deleteCrate(id){S.crates=S.crates.filter(c=>c.id!==id);store.set('crates',S.crates);if(lib.view==='sc:'+id)lib.view='all';renderSide();renderTable();}
  function crateEditor(src){
    const c=src?JSON.parse(JSON.stringify(src)):{id:'c'+Date.now(),name:'Nouvelle crate',match:'all',rules:[{f:'bpm',...RULES.bpm.def}]};
    const name=h('input',{class:'in',value:c.name,'aria-label':'Nom de la crate'});name.addEventListener('input',()=>{c.name=name.value;});
    const match=h('select',{class:'sel'},h('option',{value:'all'},'toutes les règles (ET)'),h('option',{value:'any'},'au moins une règle (OU)'));
    match.value=c.match;match.addEventListener('change',()=>{c.match=match.value;prev();});
    const list=h('div',{class:'rules'}),count=h('b',{class:'pv'},'');
    const prev=()=>{const n=crateTracks(c).length;count.textContent=n+' morceau'+(n>1?'x':'')+' maintenant';};
    const num=(r,k,attrs)=>{const i=h('input',{class:'in num',type:'number',value:r[k],...attrs});i.addEventListener('input',()=>{r[k]=i.value;prev();});return i;};
    const sel=(r,k,opts)=>{const s=h('select',{class:'sel'},opts.map(([v,l])=>h('option',{value:v},l)));s.value=String(r[k]);s.addEventListener('change',()=>{r[k]=s.value;draw();});return s;};
    const txt=(r,k,ph)=>{const i=h('input',{class:'in',value:r[k]||'',placeholder:ph});i.addEventListener('input',()=>{r[k]=i.value;prev();});return i;};
    function row(r,i){
      const f=h('select',{class:'sel','aria-label':'Champ'},Object.entries(RULES).map(([k,v])=>h('option',{value:k},v.n)));f.value=r.f;
      f.addEventListener('change',()=>{c.rules[i]={f:f.value,...RULES[f.value].def};draw();});
      let ins=[];
      if(r.f==='bpm')ins=[num(r,'a',{step:.5,min:40,max:250}),'et',num(r,'b',{step:.5,min:40,max:250})];
      else if(r.f==='energy')ins=[num(r,'a',{min:1,max:10}),'et',num(r,'b',{min:1,max:10})];
      else if(r.f==='key')ins=[sel(r,'op',[['is','est'],['compat','compatible avec'],['master','compatible avec la platine maître']]),r.op==='master'?null:txt(r,'a','8A, Am…')];
      else if(r.f==='rating')ins=[sel(r,'a',[1,2,3,4,5].map(n=>[n,n+' / 5']))];
      else if(r.f==='color')ins=[sel(r,'a',COLORS.map(c=>[c.id,c.name]))];
      else if(r.f==='genre')ins=[txt(r,'a','house, techno…')];
      else if(r.f==='tag')ins=[txt(r,'a','peak, vocal…')];
      else if(r.f==='added')ins=[num(r,'a',{min:1}),'jours'];
      else if(r.f==='played')ins=[sel(r,'a',[['no','jamais joué'],['yes','déjà joué']])];
      return h('div',{class:'rule'},f,ins,h('button',{type:'button',class:'b',title:'Retirer la règle',onclick:()=>{c.rules.splice(i,1);draw();}},'×'));
    }
    function draw(){list.innerHTML='';c.rules.forEach((r,i)=>list.append(row(r,i)));prev();}
    draw();
    modal('Crate intelligente',
      h('p',{class:'hint'},'Une crate se remplit toute seule : chaque morceau qui respecte les règles y apparaît, même ceux que tu importeras plus tard.'),
      h('div',{class:'rule'},h('span',{},'Nom'),name),
      h('div',{class:'rule'},h('span',{},'Garder les morceaux qui respectent'),match),
      list,
      h('div',{class:'acts'},h('button',{type:'button',class:'b',onclick:()=>{c.rules.push({f:'rating',...RULES.rating.def});draw();}},'+ Règle'),count,h('span',{class:'spacer'}),
        src?h('button',{type:'button',class:'b red',onclick:()=>{deleteCrate(c.id);closeModal();toast('Crate supprimée');}},'Supprimer'):null,
        h('button',{type:'button',class:'b pri',onclick:()=>{c.name=c.name.trim()||'Crate';saveCrate(c);lib.view='sc:'+c.id;renderSide();renderTable();closeModal();}},'Enregistrer')));
    name.focus();name.select();
  }

  /* ---------- doublons ---------- */
  function duplicates(tracks=LIB.tracks){
    const groups=new Map(),add=(k,t)=>{const g=groups.get(k);if(g){if(!g.includes(t))g.push(t);}else groups.set(k,[t]);};
    tracks.forEach(t=>{if(t.path)add('p:'+t.path,t);add('m:'+fold(t.artist).replace(/\s+/g,' ').trim()+'|'+fold(t.title).replace(/\s+/g,' ').trim(),t);});
    const seen=new Set(),out=[];
    for(const g of groups.values())if(g.length>1&&!g.every(t=>seen.has(t))){g.forEach(t=>seen.add(t));out.push(g);}
    return out;
  }

  /* ---------- vues de la barre latérale ---------- */
  const owns=v=>v.startsWith('sc:')||v.startsWith('set:')||v==='dups';
  const keepOrder=v=>v==='dups'||v.startsWith('set:');
  function viewTracks(v){
    if(v.startsWith('set:')){const st=S.sets.find(x=>'set:'+x.id===v);return st?setTracks(st).filter(t=>LIB.tracks.includes(t)):[];}
    if(v==='dups')return duplicates().flat().filter((t,i,a)=>a.indexOf(t)===i);
    return crateTracks(S.crates.find(c=>'sc:'+c.id===v));
  }
  const empty=v=>v==='dups'?'Aucun doublon : chaque morceau n’apparaît qu’une fois.':v.startsWith('sc:')?'Aucun morceau ne respecte ces règles pour l’instant. Clic droit sur la crate pour la modifier.':v.startsWith('set:')?'Aucun morceau de ce set n’est dans ta bibliothèque en ce moment. « Historique des sets » montre la tracklist complète.':v==='hist'?'Rien joué pour l’instant : un morceau entre dans l’historique après 30 s de lecture.':null;
  function side(s,it,where){
    if(where==='crates'){
      s.append(h('div',{class:'sec lbl'},'Crates intelligentes'));
      S.crates.forEach(c=>s.append(it('sc:'+c.id,[icon('crate'),c.name],crateTracks(c).length,b=>{b.title='Clic droit pour modifier les règles';b.addEventListener('contextmenu',e=>{e.preventDefault();crateEditor(c);});})));
      s.append(h('button',{class:'it',type:'button',style:'color:var(--mu)',onclick:()=>crateEditor(null)},'+ Nouvelle crate'));
    }else{
      // sets des sessions précédentes, du plus récent au plus ancien
      const past=S.sets.filter(x=>x.id!==S.sid&&x.items&&x.items.length).slice(-6).reverse();
      past.forEach(x=>s.append(it('set:'+x.id,setLabel(x),x.items.length,b=>{b.title='Set du '+new Date(x.start).toLocaleString('fr-FR');})));
      s.append(h('button',{class:'it',type:'button',style:'color:var(--mu)',onclick:historyModal},'Exporter la tracklist',S.sets.length?h('span',{},S.sets.length+' sets'):null));
      const nd=duplicates().reduce((n,g)=>n+g.length,0),nm=missingList().length;
      s.append(h('div',{class:'sec lbl'},'Outils'),it('dups','Doublons',nd));
      s.append(h('button',{class:'it'+(nm?' warn':''),type:'button',onclick:missingModal},'Fichiers manquants',h('span',{},String(nm))));
      if(!N()&&LIB.history.length&&LIB.history.length!==S.hl){S.hl=LIB.history.length;store.set('sets',allSets().slice(-100));}
    }
  }

  /* ---------- fenêtres ---------- */
  let cur=null;
  function closeModal(){if(cur){cur.remove();cur=null;}}
  function modal(title,...body){
    closeModal();
    const box=h('div',{class:'mbox lpm',role:'dialog','aria-label':title},h('h2',{},title,h('button',{class:'b',type:'button',onclick:closeModal},'Fermer')),...body);
    cur=h('div',{class:'modal'},box);cur.addEventListener('mousedown',e=>{if(e.target===cur)closeModal();});
    document.body.append(cur);return box;
  }
  async function saveFile(name,text,mime='text/plain'){
    const n=N();
    if(n&&n.saveText){try{const p=await n.saveText(name,text);if(p)toast('Enregistré : '+p,'ok');}catch(e){toast('Impossible d’enregistrer : '+e);}return;}
    const url=URL.createObjectURL(new Blob([text],{type:mime+';charset=utf-8'}));
    const a=h('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
    toast('Fichier « '+name+' » téléchargé','ok');
  }
  const shopLink=(label,url)=>h('a',{class:'shop',href:url,target:'_blank',rel:'noopener noreferrer',onclick:e=>{const n=N();if(n&&n.openShop){e.preventDefault();n.openShop(url).catch(()=>{});}}},label);

  /* ---------- historique et tracklist ---------- */
  const histItems=hist=>hist.map(x=>{const t=x.track||x,ki=keyInfo(t.key);return{time:new Date(x.time),deck:x.deck||'',title:t.title,artist:t.artist,bpm:t.bpm?+(+t.bpm).toFixed(2):null,key:x.key||(ki?ki.code:''),path:t.path||null,file:t.file||null};});
  const curSet=()=>LIB.history.length?{id:S.sid,start:new Date(LIB.history[0].time).toISOString(),items:histItems(LIB.history).map(x=>({...x,time:x.time.toISOString()}))}:null;
  const allSets=()=>{const c=curSet();return S.sets.filter(s=>s.id!==S.sid).concat(c?[c]:[]).slice(-100);};
  const stamp=s=>{s=Math.max(0,Math.round(s));const hh=Math.floor(s/3600),m=Math.floor(s/60)%60,x=s%60;return(hh?hh+':'+pad2(m):pad2(m))+':'+pad2(x);};
  function tracklistText(hist){
    const it=histItems(hist);if(!it.length)return'';const t0=+it[0].time;
    const d=it[0].time;
    return['Mixlab · set du '+d.toLocaleDateString('fr-FR')+' à '+pad2(d.getHours())+'h'+pad2(d.getMinutes()),'']
      .concat(it.map(x=>stamp((x.time-t0)/1000)+' '+(x.artist?x.artist+' - ':'')+x.title)).join('\n')+'\n';
  }
  const csvCell=v=>{v=String(v??'');return/[",;\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  function tracklistCSV(hist){
    const it=histItems(hist);if(!it.length)return'';const t0=+it[0].time;
    return[['Position','Début','Heure','Platine','Artiste','Titre','BPM','Tonalité']].concat(it.map((x,i)=>[i+1,stamp((x.time-t0)/1000),x.time.toLocaleTimeString('fr-FR'),x.deck,x.artist,x.title,x.bpm??'',x.key]))
      .map(r=>r.map(csvCell).join(',')).join('\n')+'\n';
  }
  // Morceaux d'un set : ceux de la bibliothèque quand on les retrouve (chemin, sinon artiste et titre).
  const setLabel=x=>{const d=new Date(x.start);return d.toLocaleDateString('fr-FR')+' '+pad2(d.getHours())+'h'+pad2(d.getMinutes());};
  function setTracks(st){
    const byPath=new Map(),byFile=new Map(),byMeta=new Map();LIB.tracks.forEach(t=>{if(t.path)byPath.set(t.path,t);if(t.file)byFile.set(t.file.toLowerCase(),t);byMeta.set(mkey(t),t);});
    return (st.items||[]).map(x=>(x.path&&byPath.get(x.path))||(x.file&&byFile.get(String(x.file).toLowerCase()))||byMeta.get(mkey(x))||{title:x.title||'',artist:x.artist||'',path:x.path||null,duration:0});
  }
  function historyModal(){
    const sets=allSets().slice().reverse();
    const pre=h('pre',{class:'tl'},'');
    const show=s=>{pre.textContent=s?tracklistText(s.items):'Rien joué pour l’instant. Un morceau entre dans l’historique après 30 s de lecture.';};
    const fname=(s,ext)=>'tracklist-'+ymd(s.start)+'-'+new Date(s.start).toTimeString().slice(0,5).replace(':','h')+'.'+ext;
    modal('Historique des sets',
      h('p',{class:'hint'},'Chaque morceau joué plus de 30 s est noté avec l’heure où tu l’as lancé. Exporte la tracklist pour Mixcloud, YouTube ou ton client.'),
      sets.length?h('div',{class:'sets'},sets.map((s,i)=>h('div',{class:'setrow'},
        h('button',{type:'button',class:'b',onclick:()=>show(s)},s.id===S.sid?'Ce set':new Date(s.start).toLocaleDateString('fr-FR')+' '+new Date(s.start).toTimeString().slice(0,5)),
        h('span',{class:'mu'},s.items.length+' morceaux'),h('span',{class:'spacer'}),
        h('button',{type:'button',class:'b',onclick:()=>saveFile(fname(s,'txt'),tracklistText(s.items))},'Texte'),
        h('button',{type:'button',class:'b',onclick:()=>saveFile(fname(s,'csv'),tracklistCSV(s.items),'text/csv')},'CSV'),
        h('button',{type:'button',class:'b',title:'Playlist M3U8 du set, à rouvrir dans Mixlab ou un autre logiciel',onclick:()=>saveFile(fname(s,'m3u8'),toM3U(setTracks(s),'Set du '+setLabel(s)),'audio/x-mpegurl')},'M3U')))):null,
      pre);
    show(sets[0]);
  }

  /* ---------- lecture des collections ---------- */
  function locToPath(loc){
    let s=String(loc||'').trim();if(!/^file:\/\//i.test(s))return s;
    s=s.slice(7);const i=s.indexOf('/');let host='';if(i>0){host=s.slice(0,i);s=s.slice(i);}else if(i<0){host=s;s='';}
    s=s.replace(/%([0-9a-f]{2})/gi,'\u0000$1');
    try{s=decodeURIComponent(s.replace(/\u0000/g,'%'));}catch(e){s=s.replace(/\u0000/g,'%');}
    if(/^\/[a-z]:/i.test(s))s=s.slice(1);
    if(host&&host.toLowerCase()!=='localhost')s='//'+host+s;
    return s;
  }
  function pathToLoc(p){
    p=String(p||'').replace(/\\/g,'/');
    const enc=p.split('/').map(x=>encodeURIComponent(x).replace(/%2C/g,',').replace(/%26/g,'&').replace(/%40/g,'@').replace(/%2B/g,'+').replace(/%3D/g,'=')).join('/').replace(/^([a-z])%3A/i,'$1:');
    return 'file://localhost'+(/^[a-z]:/i.test(p)?'/':p.startsWith('/')?'':'/')+enc;
  }
  const xmlDoc=text=>{const d=new DOMParser().parseFromString(text,'application/xml');if(d.getElementsByTagName('parsererror').length)throw new Error('Ce fichier XML est abîmé ou incomplet.');return d;};
  const newRec=o=>({title:'',artist:'',genre:'',comment:'',bpm:null,key:null,rating:0,color:0,plays:0,added:null,duration:0,loc:'',path:'',file:'',grid:null,cue:null,hot:Array(8).fill(null),hotMeta:Array(8).fill(null),memCues:[],loops:[],...o});
  const hex2=n=>Math.max(0,Math.min(255,n|0)).toString(16).padStart(2,'0');
  const markColor=m=>{const r=m.getAttribute('Red'),g=m.getAttribute('Green'),b=m.getAttribute('Blue');return r!=null&&g!=null&&b!=null?'#'+hex2(+r)+hex2(+g)+hex2(+b):null;};
  function parseRekordbox(text){
    const d=xmlDoc(text),root=d.documentElement;
    if(root.nodeName!=='DJ_PLAYLISTS')throw new Error('Ce n’est pas un export rekordbox (DJ_PLAYLISTS absent).');
    const tracks=[],byId=new Map(),byLoc=new Map();
    const coll=[...root.children].find(e=>e.nodeName==='COLLECTION');
    for(const e of coll?coll.children:[]){
      if(e.nodeName!=='TRACK')continue;const a=n=>e.getAttribute(n)||'';
      const loc=a('Location'),path=locToPath(loc),tempos=[...e.getElementsByTagName('TEMPO')];
      const bpm=parseFloat(a('AverageBpm'))||(tempos[0]?parseFloat(tempos[0].getAttribute('Bpm')):0)||null;
      let grid=null;
      if(tempos.length){const t0=tempos[0],b=parseFloat(t0.getAttribute('Bpm'))||bpm,bat=parseInt(t0.getAttribute('Battito'))||1,beat=60/b;let g=parseFloat(t0.getAttribute('Inizio'))||0;
        if(b){g+=((5-bat)%4)*beat;while(g-4*beat>=-.05)g-=4*beat;}grid=g;}
      const r=newRec({title:a('Name')||base(path).replace(/\.[^.]+$/,''),artist:a('Artist'),genre:a('Genre'),comment:a('Comments'),bpm,key:parseKey(a('Tonality')),
        rating:Math.round((parseInt(a('Rating'))||0)/51),color:(COLORS.find(c=>c.rb.toLowerCase()===a('Colour').toLowerCase())||{id:0}).id,plays:parseInt(a('PlayCount'))||0,
        added:a('DateAdded')||null,duration:parseFloat(a('TotalTime'))||0,loc,path,file:base(path),grid});
      for(const m of e.getElementsByTagName('POSITION_MARK')){
        const num=parseInt(m.getAttribute('Num')),t=parseFloat(m.getAttribute('Start')),end=parseFloat(m.getAttribute('End')),nm=m.getAttribute('Name')||'';
        if(!isFinite(t))continue;
        const loop=m.getAttribute('Type')==='4'&&isFinite(end)&&end>t,col=markColor(m);
        if(num>=0&&num<8){r.hot[num]=t;r.hotMeta[num]=nm||col?{name:nm,color:col}:null;}
        else if(num<0&&loop)r.loops.push({start:t,end,label:nm||'Boucle '+(r.loops.length+1)});
        else if(num<0)r.memCues.push({t,label:nm,color:col||'#ffffff'});
      }
      // le premier cue mémoire sans nom devient le point de cue de la platine (comme à l'export)
      r.memCues.sort((a,b)=>a.t-b.t);
      const c0=r.memCues.findIndex(m=>!m.label);
      if(c0>=0)r.cue=r.memCues.splice(c0,1)[0].t;else if(r.memCues.length)r.cue=r.memCues[0].t;
      r.memCues.forEach((m,i)=>{if(!m.label)m.label='Cue '+(i+1);});
      byId.set(a('TrackID'),tracks.length);byLoc.set(loc,tracks.length);tracks.push(r);
    }
    const playlists=[];
    const walk=(node,prefix)=>{for(const n of node.children){if(n.nodeName!=='NODE')continue;const name=n.getAttribute('Name')||'Playlist';
      if(n.getAttribute('Type')==='0')walk(n,prefix?prefix+' / '+name:(name==='ROOT'?'':name));
      else{const kt=n.getAttribute('KeyType')==='1';playlists.push({name:prefix?prefix+' / '+name:name,items:[...n.children].filter(x=>x.nodeName==='TRACK').map(x=>(kt?byLoc:byId).get(x.getAttribute('Key'))).filter(i=>i!=null)});}}};
    const P=[...root.children].find(e=>e.nodeName==='PLAYLISTS');if(P)walk(P,'');
    return{kind:'rekordbox',tracks,playlists};
  }
  function plist(n){
    switch(n.nodeName){
      case 'dict':{const o={};let k=null;for(const c of n.children){if(c.nodeName==='key')k=c.textContent;else if(k!=null){o[k]=plist(c);k=null;}}return o;}
      case 'array':return[...n.children].map(plist);
      case 'integer':case 'real':return+n.textContent;case 'true':return true;case 'false':return false;
      default:return n.textContent;
    }
  }
  function parseItunes(text){
    const d=xmlDoc(text),top=d.documentElement.nodeName==='plist'?[...d.documentElement.children].find(e=>e.nodeName==='dict'):null;
    if(!top)throw new Error('Ce n’est pas une bibliothèque iTunes / Musique (plist absent).');
    const P=plist(top),T=P.Tracks||{},tracks=[],idx=new Map();
    for(const[id,x]of Object.entries(T)){
      if(!x||!x.Location||!/^file:/i.test(x.Location)||x.Movie||x.Podcast||x['TV Show']||x['Music Video'])continue;
      const path=locToPath(x.Location);
      idx.set(String(x['Track ID']??id),tracks.length);
      tracks.push(newRec({title:x.Name||base(path).replace(/\.[^.]+$/,''),artist:x.Artist||'',genre:x.Genre||'',comment:x.Comments||'',bpm:+x.BPM||null,
        rating:x['Rating Computed']?0:Math.round((+x.Rating||0)/20),plays:+x['Play Count']||0,added:x['Date Added']||null,duration:(+x['Total Time']||0)/1000,
        loc:x.Location,path,file:base(path),key:parseKey(x.Grouping)||null}));
    }
    const playlists=[];
    for(const p of P.Playlists||[]){
      if(p.Master||p['Distinguished Kind']!=null||p.Folder||p.Visible===false)continue;
      const items=(p['Playlist Items']||[]).map(x=>idx.get(String(x['Track ID']))).filter(i=>i!=null);
      if(items.length)playlists.push({name:p.Name||'Playlist',items});
    }
    return{kind:'itunes',tracks,playlists};
  }
  function parseM3U(text,from=''){
    const dir=from.replace(/[\\/][^\\/]*$/,''),sep=from.includes('\\')&&!from.includes('/')?'\\':'/';
    const tracks=[];let inf=null;
    for(let line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
      line=line.trim();if(!line)continue;
      const m=/^#EXTINF:\s*(-?\d+(?:\.\d+)?)[^,]*,(.*)$/i.exec(line);
      if(m){const lab=m[2].trim(),am=/^(.+?)\s+-\s+(.+)$/.exec(lab);inf={duration:Math.max(0,+m[1]),artist:am?am[1]:'',title:am?am[2]:lab};continue;}
      if(line[0]==='#')continue;
      let path=locToPath(line);
      if(!/^([a-z]:[\\/]|[\\/]|\/\/)/i.test(path)&&!/^[a-z]+:\/\//i.test(path)&&dir)path=dir+sep+path;
      const fn=base(path).replace(/\.[^.]+$/,''),fm=/^(.+?)\s+-\s+(.+)$/.exec(fn);
      tracks.push(newRec({title:inf&&inf.title||(fm?fm[2]:fn),artist:inf&&inf.artist||(fm?fm[1]:''),duration:inf?inf.duration:0,loc:line,path,file:base(path)}));inf=null;
    }
    return{kind:'m3u',tracks,playlists:[{name:base(from).replace(/\.[^.]+$/,'')||'Playlist M3U',items:tracks.map((_,i)=>i)}]};
  }
  function parseCSV(text){
    const rows=[];let row=[],f='',q=false;text=text.replace(/^\uFEFF/,'');
    const first=text.split(/\r?\n/,1)[0],delim=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':first.includes('\t')&&!first.includes(',')?'\t':',';
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
      else if(c==='"')q=true;else if(c===delim){row.push(f);f='';}
      else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(f);rows.push(row);row=[];f='';}
      else f+=c;
    }
    if(f||row.length){row.push(f);rows.push(row);}
    return rows.filter(r=>r.some(x=>x.trim()));
  }
  /* Liste collée ou CSV exporté (Exportify, TuneMyMusic, Soundiiz…) vers [{artist,title}]. */
  function parseList(text){
    const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim());if(!lines.length)return{items:[],links:0};
    const head=parseCSV(lines[0])[0]||[],H=head.map(x=>fold(x).trim());
    const ti=H.findIndex(x=>/^(track name|title|titre|track|song|song name|name|nom|morceau)$/.test(x)),ai=H.findIndex(x=>/^(artist name\(s\)|artist names?|artists?|artiste\(s\)|artistes?|interprete)$/.test(x));
    const pi=H.findIndex(x=>/^(playlist name|playlist)$/.test(x));
    if(ti>=0&&head.length>1){
      const rows=parseCSV(text).slice(1);
      return{items:rows.filter(r=>r[ti]&&r[ti].trim()).map(r=>({title:r[ti].trim(),artist:ai>=0?(r[ai]||'').trim():'',raw:(ai>=0?r[ai]+' - ':'')+r[ti]})),links:0,name:pi>=0&&rows[0]?rows[0][pi]:''};
    }
    let links=0;const items=[];
    for(let l of lines){
      l=l.trim();if(/^https?:\/\//i.test(l)){links++;continue;}
      l=l.replace(/^\d+\s*[.)-]\s+/,'').replace(/\t+/g,' - ');
      const m=/^(.+?)\s+[-–—]\s+(.+)$/.exec(l);items.push(m?{artist:m[1].trim(),title:m[2].trim(),raw:l}:{artist:'',title:l,raw:l});
    }
    return{items,links};
  }
  function parseAny(text,name=''){
    const head=text.slice(0,4000);
    if(/<DJ_PLAYLISTS/i.test(head))return parseRekordbox(text);
    if(/<plist/i.test(head))return parseItunes(text);
    if(/^\uFEFF?#EXTM3U/i.test(head)||/\.m3u8?$/i.test(name))return parseM3U(text,name);
    return{kind:'list',...parseList(text)};
  }

  /* ---------- correspondance avec la collection ---------- */
  const VERS=/\b(original|extended|radio|club|album|single|clean|dirty|explicit|main)\s+(mix|edit|version)\b|\b(19|20)\d\d\s+remaster(ed)?\b|\bremaster(ed)?(\s+(19|20)\d\d)?(\s+version)?\b/g;
  function normTitle(s){
    return fold(s).replace(/[([][^)\]]*\b(feat|ft|featuring)\b\.?[^)\]]*[)\]]/g,' ').replace(/\s(feat|ft|featuring)\.?\s.*?(?=\s[-([]|$)/g,' ')
      .replace(AUDIO_RE,'').replace(/[([\]){}]/g,' ').replace(/\s[-–—]\s/g,' ').replace(VERS,' ').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
  }
  const artists=s=>fold(s).split(/\s*(?:,|;|\/|&|\+|\bx\b|\band\b|\bet\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bvs\.?)\s*/).map(x=>x.replace(/^the\s+/,'').replace(/[^a-z0-9]+/g,' ').trim()).filter(Boolean);
  const dice=(a,b)=>{if(!a.length||!b.length)return 0;const B=new Set(b);let n=0;new Set(a).forEach(x=>{if(B.has(x))n++;});return 2*n/(new Set(a).size+B.size);};
  const VARI=/\b(remix|rmx|edit|bootleg|dub|vip|rework|flip|live|acoustic|instrumental)\b/;
  function prep(t){const ti=normTitle(t.title),ar=artists(t.artist);return{t,ti,tw:ti.split(' ').filter(Boolean),ar,aw:ar.join(' ').split(' ')};}
  function matchList(items,tracks=LIB.tracks){
    const P=tracks.map(prep),ix=new Map();
    P.forEach(p=>p.tw.forEach(w=>{if(!ix.has(w))ix.set(w,[]);ix.get(w).push(p);}));
    return items.map(it=>{
      const q=prep(it),cand=new Set();q.tw.forEach(w=>(ix.get(w)||[]).forEach(p=>cand.add(p)));
      let best=null,bs=0;
      for(const p of cand){
        const ts=p.ti===q.ti?1:dice(p.tw,q.tw);if(ts<.7)continue;
        let as=!q.ar.length||!p.ar.length?.6:q.ar.some(a=>p.ar.includes(a))?1:dice(p.aw,q.aw);
        let s=.7*ts+.3*as;if(VARI.test(p.ti)!==VARI.test(q.ti))s*=.8;
        if(s>bs){bs=s;best=p.t;}
      }
      return{...it,track:bs>=.8?best:null,score:+bs.toFixed(3)};
    });
  }
  function addPlaylist(name,ids){
    let p=LIB.playlists.find(x=>x.name===name);
    if(!p){p={id:'p'+Date.now()+Math.floor(Math.random()*1e4),name,ids:[]};LIB.playlists.push(p);}
    ids.forEach(i=>{if(i&&!p.ids.includes(i))p.ids.push(i);});return p;
  }

  /* ---------- import d'une collection ---------- */
  function applyMeta(t,r,full){
    if(r.rating)t.rating=r.rating;if(r.color)t.color=r.color;if(r.comment)t.comment=r.comment;
    if(r.genre&&!t.genre)t.genre=r.genre;if(r.plays>(t.plays||0))t.plays=r.plays;
    if(full){
      if(r.bpm)t.bpm=r.bpm;if(r.grid!=null)t.grid=r.grid;if(r.key)t.key=r.key;if(r.cue!=null)t.cue=r.cue;
      if(r.hot&&r.hot.some(x=>x!=null)){t.hot=r.hot.slice(0,8);t.hotMeta=(r.hotMeta||[]).slice(0,8).concat(Array(8).fill(null)).slice(0,8);}
      if(r.memCues&&r.memCues.length)cuesIn(t,{memCues:r.memCues});
      if(r.loops&&r.loops.length)t.loops=r.loops.map(l=>({...l}));
      t.ov=null;
    }
    saveMeta(t);
  }
  /* Dans l'appli : on ouvre les fichiers trouvés, les autres vont dans « Fichiers manquants ».
     Dans le navigateur : on ne peut pas ouvrir les fichiers ; on reprend seulement les infos
     des morceaux déjà présents (même nom de fichier, ou même artiste et titre). */
  async function importCollection(res,onStep){
    const n=N(),native=!!(n&&n.allowPaths&&window.Desktop&&Desktop.native),rep={kind:res.kind,total:res.tracks.length,added:0,updated:0,missing:[],playlists:[]},ids=[];
    if(native){
      const paths=await n.allowPaths(res.tracks.map(r=>r.loc||r.path||''));
      const byPath=new Map(LIB.tracks.filter(t=>t.path).map(t=>[t.path,t]));
      for(let i=0;i<res.tracks.length;i++){
        const r=res.tracks[i],p=paths[i];
        if(!p){rep.missing.push(r);continue;}
        let t=byPath.get(p);
        if(t){applyMeta(t,r,true);rep.updated++;}
        else{try{t=await Desktop.loadRecord({...r,path:p});byPath.set(p,t);rep.added++;}catch(e){rep.missing.push(r);continue;}}
        ids[i]=t.id;
        if(onStep&&i%5===0)onStep(i+1,res.tracks.length);
        if((rep.added+rep.updated)%10===0){renderSide();renderTable();}
      }
    }else{
      const byFile=new Map(),byMeta=new Map();
      LIB.tracks.forEach(t=>{if(t.file)byFile.set(t.file.toLowerCase(),t);byMeta.set(normTitle(t.title)+'|'+artists(t.artist).join(','),t);});
      res.tracks.forEach((r,i)=>{
        let t=r.file&&byFile.get(r.file.toLowerCase()),full=!!t;
        if(!t)t=byMeta.get(normTitle(r.title)+'|'+artists(r.artist).join(','));
        if(!t){rep.missing.push(r);return;}
        applyMeta(t,r,full);rep.updated++;ids[i]=t.id;
      });
    }
    const miss=new Set(rep.missing);
    for(const pl of res.playlists){
      const p=addPlaylist(pl.name,pl.items.map(i=>ids[i]).filter(Boolean));rep.playlists.push(p.name);
      pl.items.forEach(i=>{const r=res.tracks[i];if(miss.has(r))(r.pls=r.pls||[]).push(p.id);});
    }
    if(native)Desktop.addMissing(rep.missing.filter(r=>r.path));
    renderSide();renderTable();
    return rep;
  }
  async function relocateFrom(files){
    const by=new Map(files.map(f=>[(f.name||base(f.path)).toLowerCase(),f.path]));let ok=0;
    for(const m of Desktop.missing.slice()){const p=by.get(base(m.path).toLowerCase());if(!p)continue;try{await Desktop.relocate(m,p);ok++;}catch(e){}}
    renderSide();renderTable();return ok;
  }
  function forget(m){if(N())Desktop.dropMissing(m);else{B.recs.delete(m.k);B.pend.delete(m.k);saveMeta();}}
  function missingModal(){
    const n=N(),native=!!(n&&window.Desktop&&Desktop.native),fsa=!n&&!!window.showOpenFilePicker;
    const body=h('div',{class:'mlist'}),acts=h('div',{class:'acts'});
    const draw=()=>{body.innerHTML='';acts.innerHTML='';const L=missingList();
      const nh=n?0:L.filter(r=>B.handles.has(r.file.toLowerCase())).length;
      if(native)acts.append(h('button',{type:'button',class:'b pri',onclick:async()=>{
        const fs=await n.pickFolder();if(!fs.length)return;toast('Recherche dans '+fs.length+' fichiers…');
        const ok=await relocateFrom(fs);toast(ok?ok+' morceau'+(ok>1?'x':'')+' retrouvé'+(ok>1?'s':''):'Aucun des fichiers manquants n’est dans ce dossier',ok?'ok':'');draw();}},'Chercher dans un dossier…'));
      if(nh)acts.append(h('button',{type:'button',class:'b pri',onclick:async()=>{const k=await reopen();toast(k?k+' fichier'+(k>1?'s':'')+' rouvert'+(k>1?'s':''):'Accès refusé : réimporte les fichiers',k?'ok':'');draw();renderSide();}},'Rouvrir '+nh+' fichier'+(nh>1?'s':'')));
      acts.append(h('span',{class:'spacer'}));
      if(L.length)acts.append(h('button',{type:'button',class:'b',onclick:()=>{missingList().slice().forEach(forget);draw();renderSide();}},'Tout oublier'));
      if(!L.length){body.append(h('p',{class:'hint'},'Aucun fichier manquant : tous les morceaux de ta bibliothèque sont accessibles.'));return;}
      L.slice(0,500).forEach(m=>body.append(h('div',{class:'mrow'},h('div',{},h('b',{},(m.artist?m.artist+' - ':'')+m.title),h('small',{},m.path||m.file)),
        h('button',{type:'button',class:'b',title:'Retirer de la bibliothèque',onclick:()=>{forget(m);draw();renderSide();}},'Oublier'))));
      if(L.length>500)body.append(h('p',{class:'hint'},'… et '+(L.length-500)+' autres.'));};
    modal('Fichiers manquants',
      h('p',{class:'hint'},n?'Ces morceaux sont dans ta bibliothèque mais leur fichier n’est plus à sa place (disque débranché, dossier renommé). Choisis un dossier : Mixlab y cherche chaque fichier par son nom, sous-dossiers compris, et lui rend ses cues et ses playlists.'
        :'Le navigateur ne garde pas le son des morceaux, seulement leurs infos (cues, notes, playlists). Réimporte ces fichiers (bouton Importer ou glisser-déposer) : ils retrouvent tout.'+(fsa?' Les fichiers ouverts avec le bouton Importer peuvent être rouverts d’un clic.':' Avec l’appli Mixlab, ils se rechargent tout seuls.')),
      acts,body);
    draw();
  }

  /* ---------- export ---------- */
  const rgb=col=>/^#[0-9a-f]{6}$/i.test(col||'')?` Red="${parseInt(col.slice(1,3),16)}" Green="${parseInt(col.slice(3,5),16)}" Blue="${parseInt(col.slice(5,7),16)}"`:'';
  const mark=(name,num,t,col,end)=>`      <POSITION_MARK Name="${xa(name)}" Type="${end!=null?4:0}" Start="${(+t).toFixed(3)}"${end!=null?` End="${(+end).toFixed(3)}"`:''} Num="${num}"${rgb(col)}/>`;
  function toRekordbox(tracks=LIB.tracks,playlists=LIB.playlists,crates=S.crates){
    const ix=new Map(tracks.map((t,i)=>[t.id,i+1]));
    const L=['<?xml version="1.0" encoding="UTF-8"?>','<DJ_PLAYLISTS Version="1.0.0">','  <PRODUCT Name="Mixlab" Version="0.3.0" Company="Mixlab"/>',`  <COLLECTION Entries="${tracks.length}">`];
    tracks.forEach((t,i)=>{
      const ki=keyInfo(t.key),src=t.path||t.file||t.title,ext=(/\.(\w+)$/.exec(src)||[])[1]||'',c=colorOf(t.color);
      const at={TrackID:i+1,Name:t.title,Artist:t.artist,Album:t.album||'',Genre:t.genre||'',Kind:ext?ext.toUpperCase()+' File':'',TotalTime:Math.round(t.duration||0),
        AverageBpm:(t.bpm||0).toFixed(2),DateAdded:ymd(t.added),PlayCount:t.plays||0,Rating:(t.rating||0)*51,Location:pathToLoc(src),Tonality:ki?ki.name:'',Comments:t.comment||''};
      if(c)at.Colour=c.rb;if(t.year)at.Year=t.year;
      const kids=[];
      if(t.bpm&&t.grid!=null){const beat=60/t.bpm;let g=t.grid;while(g<0)g+=4*beat;kids.push(`      <TEMPO Inizio="${g.toFixed(3)}" Bpm="${t.bpm.toFixed(2)}" Metro="4/4" Battito="1"/>`);}
      if(t.cue!=null)kids.push(mark('',-1,t.cue));
      userCues(t).forEach(m=>kids.push(mark(m.label,-1,m.t,m.color&&m.color.toLowerCase()!=='#ffffff'?m.color:null)));
      (t.loops||[]).forEach(l=>kids.push(mark(l.label||'',-1,l.start,null,l.end)));
      (t.hot||[]).forEach((x,n)=>{if(x!=null)kids.push(mark(hotName(t,n),n,x,hotColor(t,n)));});
      const attrs=Object.entries(at).map(([k,v])=>k+'="'+xa(v)+'"').join(' ');
      L.push(kids.length?`    <TRACK ${attrs}>`:`    <TRACK ${attrs}/>`);if(kids.length)L.push(...kids,'    </TRACK>');
    });
    L.push('  </COLLECTION>','  <PLAYLISTS>');
    const node=(name,ts,ind)=>{const k=ts.map(t=>ix.get(t.id)).filter(Boolean);return[`${ind}<NODE Name="${xa(name)}" Type="1" KeyType="0" Entries="${k.length}">`,...k.map(x=>`${ind}  <TRACK Key="${x}"/>`),`${ind}</NODE>`];};
    const byId=new Map(tracks.map(t=>[t.id,t])),cr=(crates||[]).filter(c=>c.rules&&c.rules.length);
    L.push(`    <NODE Type="0" Name="ROOT" Count="${playlists.length+(cr.length?1:0)}">`);
    playlists.forEach(p=>L.push(...node(p.name,p.ids.map(i=>byId.get(i)).filter(Boolean),'      ')));
    if(cr.length){L.push(`      <NODE Type="0" Name="Crates intelligentes" Count="${cr.length}">`);cr.forEach(c=>L.push(...node(c.name,crateTracks(c,tracks),'        ')));L.push('      </NODE>');}
    L.push('    </NODE>','  </PLAYLISTS>','</DJ_PLAYLISTS>');
    return L.join('\n')+'\n';
  }
  function toM3U(tracks,name){
    return['#EXTM3U',name?'#PLAYLIST:'+name:null,...tracks.flatMap(t=>['#EXTINF:'+Math.round(t.duration||0)+','+(t.artist?t.artist+' - ':'')+t.title,t.path||t.file||t.title])].filter(x=>x!=null).join('\n')+'\n';
  }
  const viewName=()=>{const v=lib.view;if(v.startsWith('pl:'))return(LIB.playlists.find(p=>'pl:'+p.id===v)||{}).name;if(v.startsWith('sc:'))return(S.crates.find(c=>'sc:'+c.id===v)||{}).name;return{all:'Collection',demo:'Démos',imported:'Importés',hist:'Ce set',dups:'Doublons'}[v]||'Playlist';};
  const safeName=s=>String(s||'playlist').replace(/[\\/:*?"<>|]+/g,'-').trim()||'playlist';

  /* ---------- import / export / playlists en ligne ---------- */
  function exchange(tab){
    const n=N(),native=!!(n&&n.pickLibraryFile&&window.Desktop&&Desktop.native);
    const out=h('div',{class:'xout'});
    const report=(rep,res)=>{
      out.innerHTML='';
      const what={rekordbox:'rekordbox',itunes:'iTunes / Musique',m3u:'M3U'}[rep.kind]||'';
      const pl=(n,w)=>n+' '+w+(n>1?'s':'');
      out.append(h('p',{class:'ok'},`${what} : ${rep.total} morceau${rep.total>1?'x lus':' lu'} · `+(native?`${pl(rep.added,'ajouté')}, ${rep.updated} mis à jour`:`${pl(rep.updated,'retrouvé')} dans ta collection`)+(rep.playlists.length?` · ${pl(rep.playlists.length,'playlist')}`:'')));
      if(rep.missing.length){
        out.append(h('p',{class:'warn'},rep.missing.length+' introuvable'+(rep.missing.length>1?'s':'')+(native?' : ajoutés à « Fichiers manquants », tu peux les relocaliser.':' : importe d’abord les fichiers audio, puis relance l’import pour récupérer leurs infos.')));
        if(native)out.append(h('div',{class:'acts'},h('button',{type:'button',class:'b pri',onclick:missingModal},'Relocaliser les introuvables…')));
        out.append(h('div',{class:'mlist'},rep.missing.slice(0,200).map(r=>h('div',{class:'mrow'},h('div',{},h('b',{},(r.artist?r.artist+' - ':'')+r.title),h('small',{},r.path||r.loc))))));
      }
    };
    const run=async(text,name,from)=>{
      let res;try{res=parseAny(text,from||name);}catch(e){out.innerHTML='';out.append(h('p',{class:'warn'},e.message));return;}
      if(res.kind==='list'){exchangeList(text,name);return;}
      if(!res.tracks.length){out.innerHTML='';out.append(h('p',{class:'warn'},'Aucun morceau trouvé dans ce fichier.'));return;}
      out.innerHTML='';const st=h('p',{class:'hint'},'Import en cours…');out.append(st);
      const rep=await importCollection(res,(i,nb)=>{st.textContent='Import en cours : '+i+' / '+nb;});
      report(rep,res);S.last=rep;
    };
    const pick=native?h('button',{type:'button',class:'b pri',onclick:async()=>{let f=null;try{f=await n.pickLibraryFile();}catch(e){toast(String(e));}if(f)run(f.text,f.name,f.path);}},'Choisir un fichier…')
      :h('label',{class:'b pri filebtn'},'Choisir un fichier…',h('input',{type:'file',accept:'.xml,.m3u,.m3u8,.csv,.txt',onchange:async e=>{const f=e.target.files[0];e.target.value='';if(f)run(await f.text(),f.name,f.name);}}));
    const plSel=h('select',{class:'sel','aria-label':'Playlist à exporter'},
      h('option',{value:'view'},'Vue affichée ('+viewName()+')'),LIB.playlists.map(p=>h('option',{value:'pl:'+p.id},p.name)),S.crates.map(c=>h('option',{value:'sc:'+c.id},'Crate : '+c.name)));
    const plTracks=()=>{const v=plSel.value;if(v==='view')return lib.rows.map(r=>r.t);if(v.startsWith('pl:')){const p=LIB.playlists.find(x=>'pl:'+x.id===v);return p?p.ids.map(i=>LIB.tracks.find(t=>t.id===i)).filter(Boolean):[];}return crateTracks(S.crates.find(c=>'sc:'+c.id===v));};
    const plName=()=>plSel.value==='view'?viewName():plSel.selectedOptions[0].textContent.replace(/^Crate : /,'');
    modal('Import / export',
      h('div',{class:'mgrid'},
        h('div',{},h('h3',{},'Importer une collection'),
          h('p',{},'rekordbox (Fichier › Exporter la collection au format xml), iTunes ou Musique (Fichier › Bibliothèque › Exporter la bibliothèque), ou une playlist M3U / M3U8. Mixlab reprend notes, couleurs, cues, grilles et playlists.'),
          native?null:h('p',{class:'warn'},'Dans le navigateur, Mixlab ne peut pas ouvrir les fichiers audio listés : il reprend seulement les infos des morceaux déjà importés (même nom de fichier, ou même artiste et titre). Avec l’appli, les morceaux sont importés directement.'),
          pick),
        h('div',{},h('h3',{},'Exporter'),
          h('p',{},'rekordbox XML : toute ta collection avec BPM, tonalité, note, couleur, cues, grille et playlists. Dans rekordbox : Préférences › Avancé › Base de données › rekordbox xml, puis exporte sur ta clé USB.'),
          h('div',{class:'acts'},h('button',{type:'button',class:'b pri',onclick:()=>saveFile('mixlab-rekordbox.xml',toRekordbox(),'application/xml')},'Collection en rekordbox XML')),
          h('p',{},'M3U8 : une playlist, lisible par presque tous les logiciels.'),
          h('div',{class:'acts'},plSel,h('button',{type:'button',class:'b pri',onclick:()=>{const ts=plTracks();if(!ts.length){toast('Cette playlist est vide');return;}saveFile(safeName(plName())+'.m3u8',toM3U(ts,plName()),'audio/x-mpegurl');}},'M3U8'))),
        h('div',{},h('h3',{},'Playlist Spotify, Deezer…'),
          h('p',{},'Colle une liste « Artiste - Titre » ou un export CSV (Exportify pour Spotify, TuneMyMusic ou Soundiiz pour Deezer, YouTube Music, Apple Music). Mixlab retrouve les morceaux dans ta collection et te donne des liens d’achat pour les autres.'),
          h('button',{type:'button',class:'b pri',onclick:()=>exchangeList('','')},'Retrouver une playlist…'))),
      out);
  }
  function exchangeList(text,name){
    const ta=h('textarea',{class:'in',rows:8,spellcheck:'false','aria-label':'Liste de morceaux',placeholder:'Daft Punk - One More Time\nFred again.. - Delilah (pull me out of this)\n… ou colle ici le contenu d’un CSV Exportify'});ta.value=text||'';
    const nm=h('input',{class:'in',value:name?String(name).replace(/\.[^.]+$/,''):'Playlist importée','aria-label':'Nom de la playlist'});
    const file=h('label',{class:'b filebtn'},'Ouvrir un CSV…',h('input',{type:'file',accept:'.csv,.txt',onchange:async e=>{const f=e.target.files[0];e.target.value='';if(f){ta.value=await f.text();if(nm.value==='Playlist importée')nm.value=f.name.replace(/\.[^.]+$/,'');}}}));
    const out=h('div',{class:'xout'});
    const go=()=>{
      const L=parseList(ta.value);if(L.name&&nm.value==='Playlist importée')nm.value=L.name;
      out.innerHTML='';
      if(!L.items.length){out.append(h('p',{class:'warn'},L.links?'Les liens seuls ne suffisent pas (Mixlab ne se connecte à aucun service) : exporte la playlist en CSV, par exemple avec Exportify pour Spotify.':'Colle au moins une ligne « Artiste - Titre ».'));return;}
      const res=matchList(L.items),found=res.filter(r=>r.track),miss=res.filter(r=>!r.track);S.lastMatch=res;
      out.append(h('p',{class:'ok'},found.length+' sur '+res.length+' trouvés dans ta collection'+(L.links?' · '+L.links+' liens ignorés':'')),
        h('div',{class:'acts'},h('button',{type:'button',class:'b pri',disabled:!found.length,onclick:()=>{const p=addPlaylist(nm.value.trim()||'Playlist importée',found.map(r=>r.track.id));lib.view='pl:'+p.id;renderSide();renderTable();toast('Playlist « '+p.name+' » : '+p.ids.length+' morceaux','ok');closeModal();}},'Créer la playlist ('+found.length+')')),
        h('div',{class:'mlist'},found.map(r=>h('div',{class:'mrow found'},h('div',{},h('b',{},(r.artist?r.artist+' - ':'')+r.title),h('small',{},'→ '+(r.track.artist?r.track.artist+' - ':'')+r.track.title)))),
          miss.map(r=>{const q=encodeURIComponent(((r.artist||'').split(',')[0]+' '+r.title).trim());return h('div',{class:'mrow'},h('div',{},h('b',{},(r.artist?r.artist+' - ':'')+r.title),h('small',{},'Pas dans ta collection')),
            h('div',{class:'shops'},shopLink('Bandcamp','https://bandcamp.com/search?q='+q),shopLink('Beatport','https://www.beatport.com/search?q='+q)));})));
    };
    modal('Retrouver une playlist',
      h('p',{class:'hint'},'Mixlab ne se connecte pas à Spotify ni à Deezer : leurs morceaux ne sont pas jouables dans un logiciel DJ sans partenariat. Il compare la liste à tes fichiers (accents, « feat. », versions et remixes compris) et crée une playlist avec ceux que tu as déjà.'),
      ta,h('div',{class:'acts'},file,nm,h('span',{class:'spacer'}),h('button',{type:'button',class:'b pri',onclick:go},'Chercher dans ma collection')),out);
    if(text)go();
  }

  /* ---------- menus contextuels ---------- */
  let ctx=null;
  function closeMenu(){if(ctx){ctx.remove();ctx=null;}}
  function menu(ev,title,items){
    closeMenu();closeEdit();
    ctx=h('div',{class:'ctx',role:'menu'},title?h('div',{class:'ctx-t'},title):null,items.filter(Boolean).map(x=>x==='-'?h('hr'):
      h('button',{type:'button',role:'menuitem',class:x.cls||'',disabled:!!x.off,onclick:()=>{closeMenu();x.fn();}},x.label)));
    document.body.append(ctx);
    const W=ctx.offsetWidth,H=ctx.offsetHeight,x=ev&&ev.clientX!=null?ev.clientX:innerWidth/2,y=ev&&ev.clientY!=null?ev.clientY:innerHeight/2;
    ctx.style.left=Math.max(4,Math.min(innerWidth-W-4,x))+'px';ctx.style.top=Math.max(4,Math.min(innerHeight-H-4,y))+'px';
    const first=ctx.querySelector('button:not(:disabled)');if(first)first.focus();
  }
  document.addEventListener('mousedown',e=>{if(ctx&&!ctx.contains(e.target))closeMenu();});
  document.addEventListener('keydown',e=>{
    if(!ctx)return;
    if(e.key==='Escape'){closeMenu();e.stopPropagation();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){const bs=[...ctx.querySelectorAll('button:not(:disabled)')],i=bs.indexOf(document.activeElement);const n=bs[(i+(e.key==='ArrowDown'?1:-1)+bs.length)%bs.length];if(n)n.focus();e.preventDefault();e.stopPropagation();}
  },true);
  const onAir=d=>d.playing&&audible(d);
  const curPl=()=>lib.view.startsWith('pl:')?LIB.playlists.find(p=>'pl:'+p.id===lib.view):null;
  function movePl(p,id,to){const i=p.ids.indexOf(id);if(i<0)return;p.ids.splice(i,1);p.ids.splice(Math.max(0,Math.min(p.ids.length,to)),0,id);saveMeta();renderSide();renderTable();}
  function rowMenu(t,ev){
    ui.sel=t.id;$$('tr.sel',lib.tbody).forEach(x=>x.classList.toggle('sel',x._r&&x._r.t===t));
    const p=curPl(),i=p?p.ids.indexOf(t.id):-1,ordered=p&&lib.sort.k==='added'&&!lib.q;
    const AM=window.AutoMix,inQ=AM&&AM.queue.includes(t.id),DP=window.DeckPro,N0=N();
    menu(ev,(t.artist?t.artist+' - ':'')+t.title,[
      {label:'Modifier les infos…',fn:()=>edit(t,ev)},'-',
      ...decks.filter(d=>d.active).map(d=>({label:'Charger sur la platine '+d.id+(onAir(d)?' (à l’antenne)':''),off:onAir(d),fn:()=>loadTo(d,t)})),
      AM?{label:inQ?'Déjà dans la file auto-mix':'Ajouter à la file auto-mix',off:inQ,fn:()=>{AM.add(t.id);toast('« '+t.title+' » ajouté à la file auto-mix','ok');}}:null,
      DP&&DP.pvPlay?{label:'Pré-écouter au casque',off:!t.buffer,fn:()=>{ui.sel=t.id;paintRows();DP.pvPlay(t);}}:null,'-',
      ...LIB.playlists.filter(q=>q!==p).map(q=>({label:(q.ids.includes(t.id)?'Déjà dans « ':'Ajouter à « ')+q.name+' »',off:q.ids.includes(t.id),fn:()=>{q.ids.push(t.id);saveMeta();renderSide();toast('Ajouté à « '+q.name+' »','ok');}})),
      p?'-':null,
      p?{label:'Monter dans la playlist',off:!ordered||i<=0,fn:()=>movePl(p,t.id,i-1)}:null,
      p?{label:'Descendre dans la playlist',off:!ordered||i>=p.ids.length-1,fn:()=>movePl(p,t.id,i+1)}:null,
      p?{label:'Retirer de la playlist « '+p.name+' »',cls:'bad',fn:()=>{p.ids=p.ids.filter(x=>x!==t.id);saveMeta();renderSide();renderTable();toast('Retiré de « '+p.name+' »');}}:null,
      '-',
      {label:'Analyser à nouveau'+(DP&&DP.locked&&DP.locked(t)?' (grille verrouillée)':''),off:!t.buffer||!!(DP&&DP.locked&&DP.locked(t)),fn:()=>reanalyze(t)},
      // « Afficher le fichier » : seulement dans l'appli, quand elle sait ouvrir le dossier
      N0&&N0.revealFile&&t.path?{label:'Afficher le fichier',fn:()=>N0.revealFile(t.path)}:null,
    ]);
  }
  // Nouvelle analyse (BPM, grille, tonalité, waveform, structure) : après un changement de plage BPM, ou un morceau mal lu.
  function reanalyze(t){
    if(!t.buffer)return;
    toast('Analyse de « '+t.title+' »…');
    setTimeout(()=>{
      const a=analyze(t.buffer,false);
      Object.assign(t,{bpm:a.bpm,grid:a.grid,key:a.key||t.key,rmsDb:a.rmsDb,wf:a.wf,ov:null,_a:{bpm:a.bpm,grid:a.grid,key:a.key}});
      if(t.cue==null||t.cue<a.grid-1e-3)t.cue=a.grid;
      if(a.sections){t.sections=a.sections;t.energy=a.energy;t.musicEnd=a.musicEnd;}else if(window.Structure)Structure.queue(t);
      decks.forEach(d=>{if(d.track===t&&d.applyAutoGain)d.applyAutoGain();});
      changed(t);const ki=keyInfo(t.key);toast('« '+t.title+' » : '+t.bpm.toFixed(2)+' BPM'+(ki?' · '+ki.code:''),'ok');
    },30);
  }
  // Ligne de la table : clic droit, et glisser-déposer pour réordonner une playlist.
  function row(tr,r){
    tr.addEventListener('contextmenu',e=>{e.preventDefault();rowMenu(r.t,e);});
    const c=hidden('color')&&colorOf(r.t.color);if(c){tr.classList.add('rc');tr.style.setProperty('--rc',c.c);}
    const p=curPl();if(!p||lib.sort.k!=='added'||lib.q)return;
    tr.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('text/mixlab-track')){e.preventDefault();tr.classList.add('dropb');}});
    tr.addEventListener('dragleave',()=>tr.classList.remove('dropb'));
    tr.addEventListener('drop',e=>{tr.classList.remove('dropb');const id=+e.dataTransfer.getData('text/mixlab-track');if(!id||id===r.t.id)return;e.preventDefault();e.stopPropagation();
      const to=p.ids.indexOf(r.t.id);if(p.ids.includes(id))movePl(p,id,to);else{p.ids.splice(to,0,id);saveMeta();renderSide();renderTable();}});
  }
  function renamePl(p){
    const i=h('input',{class:'in',value:p.name,'aria-label':'Nom de la playlist'});
    const ok=()=>{const v=i.value.trim();if(v){p.name=v;saveMeta();renderSide();renderTable();}closeModal();};
    i.addEventListener('keydown',e=>{if(e.key==='Enter')ok();});
    modal('Renommer la playlist',h('div',{class:'acts'},i,h('button',{type:'button',class:'b pri',onclick:ok},'Renommer')));i.focus();i.select();
  }
  function deletePl(p){
    modal('Supprimer la playlist',h('p',{class:'hint'},'Supprimer « '+p.name+' » ? Ses '+p.ids.length+' morceaux restent dans ta collection.'),
      h('div',{class:'acts'},h('span',{class:'spacer'}),h('button',{type:'button',class:'b',onclick:closeModal},'Annuler'),
        h('button',{type:'button',class:'b red',onclick:()=>{LIB.playlists.splice(LIB.playlists.indexOf(p),1);if(lib.view==='pl:'+p.id)lib.view='all';saveMeta();renderSide();renderTable();closeModal();toast('Playlist supprimée');}},'Supprimer')));
  }
  function plMenu(p,ev){
    const i=LIB.playlists.indexOf(p),ts=()=>p.ids.map(id=>LIB.tracks.find(t=>t.id===id)).filter(Boolean);
    menu(ev,p.name,[
      {label:'Renommer…',fn:()=>renamePl(p)},
      {label:'Monter',off:i<=0,fn:()=>{LIB.playlists.splice(i,1);LIB.playlists.splice(i-1,0,p);saveMeta();renderSide();}},
      {label:'Descendre',off:i>=LIB.playlists.length-1,fn:()=>{LIB.playlists.splice(i,1);LIB.playlists.splice(i+1,0,p);saveMeta();renderSide();}},
      {label:'Exporter en M3U8',off:!p.ids.length,fn:()=>saveFile(safeName(p.name)+'.m3u8',toM3U(ts(),p.name),'audio/x-mpegurl')},
      {label:'Vider',off:!p.ids.length,fn:()=>{p.ids=[];saveMeta();renderSide();renderTable();}},'-',
      {label:'Supprimer…',cls:'bad',fn:()=>deletePl(p)}]);
  }
  function plItem(b,p){b.title='Clic droit : renommer, déplacer, exporter, supprimer';b.addEventListener('contextmenu',e=>{e.preventDefault();plMenu(p,e);});b.addEventListener('dblclick',()=>renamePl(p));}

  /* ---------- chargement sans écraser un morceau prêt ---------- */
  // Double-clic ou Entrée : platine vide d'abord, puis une platine arrêtée dont le morceau a déjà été joué ;
  // sinon on demande laquelle remplacer (jamais celle qui est à l'antenne).
  function autoLoad(t,ev){
    const act=decks.filter(d=>d.active),d=act.find(d=>!d.track)||act.find(d=>!d.playing&&d.logged);
    if(d){loadTo(d,t);return d;}
    menu(ev,'Remplacer quelle platine ?',act.map(d=>({label:d.id+' · '+(d.track?d.track.title:'vide')+(onAir(d)?' (à l’antenne)':d.playing?' (en lecture)':' (prêt)'),off:onAir(d),fn:()=>loadTo(d,t)})));
    return null;
  }
  const deckOf=id=>decks.find(d=>d.id===id&&d.active);

  /* ---------- clavier ---------- */
  function selectBy(step){
    const rows=lib.rows;if(!rows.length)return;
    let i=rows.findIndex(r=>r.t.id===ui.sel);i=i<0?(step>0?0:rows.length-1):Math.max(0,Math.min(rows.length-1,i+step));
    ui.sel=rows[i].t.id;
    const rh=lib.rh||28,top=i*rh,th=lib.thead.offsetHeight||24,tw=lib.tw;
    if(top<tw.scrollTop)tw.scrollTop=top;else if(top+rh>tw.scrollTop+tw.clientHeight-th)tw.scrollTop=top+rh-tw.clientHeight+th;
    paintRows();
  }
  document.addEventListener('keydown',e=>{
    if(cur||ctx||panel||(typeof midi!=='undefined'&&midi.learn))return;
    const search=$('.libbar input[type=search]');if(!search)return;
    const inField=e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]');
    if(e.target===search&&e.key==='Escape'){search.value='';lib.q='';renderTable();search.blur();e.preventDefault();return;}
    if(((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f')||(e.key==='/'&&!inField&&!e.ctrlKey&&!e.metaKey)){search.focus();search.select();e.preventDefault();return;}
    if(e.target===search&&(e.key==='ArrowDown'||e.key==='Enter')&&lib.rows.length){search.blur();if(e.key==='ArrowDown')selectBy(1);e.preventDefault();return;}
    if(inField||e.altKey||e.ctrlKey||e.metaKey||(e.target.closest&&e.target.closest('svg,[role=slider],.kn')))return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(e.shiftKey)return;selectBy(e.key==='ArrowDown'?1:-1);e.preventDefault();return;}
    const t=LIB.tracks.find(x=>x.id===ui.sel);if(!t)return;
    if(e.key==='Enter'||(e.shiftKey&&e.key==='ArrowLeft')){const d=deckOf('A');if(d)loadTo(d,t);e.preventDefault();}
    else if(e.shiftKey&&e.key==='ArrowRight'){const d=deckOf('B');if(d)loadTo(d,t);e.preventDefault();}
  });

  // Vues qui dépendent de la platine maître : la table est recalculée quand elle change.
  const liveView=v=>{const c=v.startsWith('sc:')&&S.crates.find(c=>'sc:'+c.id===v);return !!(c&&c.rules.some(r=>r.f==='key'&&r.op==='master'));};

  if(!N()&&typeof indexedDB!=='undefined')browserLoad();else B.loaded=true;

  return{COLORS,parseKey,parseRekordbox,parseItunes,parseM3U,parseCSV,parseList,parseAny,locToPath,pathToLoc,normTitle,matchList,
    importCollection,toRekordbox,toM3U,tracklistText,tracklistCSV,setTracks,duplicates,crateTracks,saveCrate,deleteCrate,crateEditor,search,filter,
    hidden,bar,side,owns,keepOrder,viewTracks,empty,edit,closeEdit,row,plItem,autoLoad,liveView,menu,selectBy,rowMenu,plMenu,renamePl,deletePl,missingList,saveBrowser:browserSave,get hasSaved(){return B.saved;},metaOut,metaIn,extraOut,extraIn,exchange,exchangeList,historyModal,missingModal,relocateFrom,saveFile,
    get crates(){return S.crates;},get sets(){return allSets();},state:S};
})();
