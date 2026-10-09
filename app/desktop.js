'use strict';
/* =====================================================================
   Mixlab · intégration bureau
   - Sorties audio : master et casque sur deux cartes son différentes.
   - Import de fichiers et de dossiers entiers depuis le disque.
   - Bibliothèque persistante (analyse, cues, hot cues, playlists).
   Tout dégrade proprement dans un navigateur : sans window.mixlabNative,
   seules les sorties audio restent (Chrome et Edge savent choisir la carte son).
   ===================================================================== */
window.Desktop=(()=>{
  const N=window.mixlabNative||null;
  const A={hpAudio:null,devices:[],cfg:null,restored:!N,lastSaved:''};

  /* ---------- sorties audio ---------- */
  const canSinkCtx=typeof ctx.setSinkId==='function';
  const canSinkEl=typeof HTMLMediaElement!=='undefined'&&'setSinkId' in HTMLMediaElement.prototype;
  async function listOutputs(){
    try{
      const all=await navigator.mediaDevices.enumerateDevices();
      A.devices=all.filter(d=>d.kind==='audiooutput'&&d.deviceId!=='communications');
    }catch(e){A.devices=[];}
    return A.devices;
  }
  const label=(d,i)=>d.deviceId==='default'?'Sortie par défaut du système':(d.label||'Sortie audio '+(i+1));
  async function setMaster(id){
    if(!canSinkCtx)return false;
    try{await ctx.setSinkId(id==='default'?'':id);return true;}
    catch(e){toast('Impossible d’utiliser cette sortie pour le master');return false;}
  }
  async function setHeadphones(id){
    if(!id){
      S.hpDevice=null;
      if(A.hpAudio){A.hpAudio.pause();A.hpAudio.srcObject=null;A.hpAudio=null;}
      routeOut();return true;
    }
    if(!canSinkEl){toast('Ce système ne permet pas de choisir la sortie casque');return false;}
    if(!bus.hpDest)bus.hpDest=ctx.createMediaStreamDestination();
    if(!A.hpAudio){A.hpAudio=new Audio();A.hpAudio.srcObject=bus.hpDest.stream;}
    try{
      await A.hpAudio.setSinkId(id==='default'?'':id);
      await A.hpAudio.play();
    }catch(e){toast('Impossible d’utiliser cette sortie pour le casque');return false;}
    S.hpDevice=id;S.split=false;routeOut();return true;
  }
  async function applySaved(){
    const c=store.get('audio',{master:'default',hp:''});A.cfg=c;
    const ids=new Set((await listOutputs()).map(d=>d.deviceId));
    if(c.master&&c.master!=='default'&&ids.has(c.master))await setMaster(c.master);
    if(c.hp&&ids.has(c.hp))await setHeadphones(c.hp);
  }

  function buildAudioModal(){
    const m=h('div',{class:'modal',id:'audio-modal',hidden:true});
    const master=h('select',{class:'sel wide','aria-label':'Sortie master'});
    const hp=h('select',{class:'sel wide','aria-label':'Sortie casque'});
    const info=h('p',{class:'lat'},'');
    const close=h('button',{class:'b',type:'button',onclick:()=>{m.hidden=true;}},'Fermer');
    const fill=async()=>{
      const devs=await listOutputs(),c=store.get('audio',{master:'default',hp:''});
      master.innerHTML='';hp.innerHTML='';
      hp.append(h('option',{value:''},'Même carte que le master (bouton Split pour séparer)'));
      devs.forEach((d,i)=>{master.append(h('option',{value:d.deviceId},label(d,i)));hp.append(h('option',{value:d.deviceId},label(d,i)));});
      master.value=devs.some(d=>d.deviceId===c.master)?c.master:'default';
      hp.value=devs.some(d=>d.deviceId===c.hp)?c.hp:'';
      master.disabled=!canSinkCtx;hp.disabled=!canSinkEl;
      const ms=v=>Math.round((v||0)*1000);
      info.textContent='Latence de sortie : '+ms((ctx.baseLatency||0)+(ctx.outputLatency||0))+' ms · '+ctx.sampleRate+' Hz'+(devs.length<=1?' · une seule carte son détectée':'');
    };
    master.addEventListener('change',async()=>{if(await setMaster(master.value)){const c=store.get('audio',{});c.master=master.value;store.set('audio',c);toast('Master : '+master.selectedOptions[0].textContent,'ok');}});
    hp.addEventListener('change',async()=>{
      if(hp.value&&hp.value===master.value){toast('Choisis une autre sortie que celle du master, ou garde « Même carte »');}
      if(await setHeadphones(hp.value)){const c=store.get('audio',{});c.hp=hp.value;store.set('audio',c);toast(hp.value?'Casque : '+hp.selectedOptions[0].textContent:'Casque sur la carte du master','ok');}
    });
    m.append(h('div',{class:'mbox',role:'dialog','aria-label':'Réglages audio'},
      h('h2',{},'Audio ',close),
      h('div',{class:'mgrid'},
        h('div',{},h('h3',{},'Sortie master'),h('p',{},'Ce que le public entend : enceintes, ou sortie master de ta table.'),master),
        h('div',{},h('h3',{},'Sortie casque'),h('p',{},'Sur une table DJ avec carte son, choisis sa sortie casque pour préécouter sans que la salle entende.'),hp),
        h('div',{},h('h3',{},'État'),info))));
    m.addEventListener('click',e=>{if(e.target===m)m.hidden=true;});
    document.body.append(m);
    navigator.mediaDevices&&navigator.mediaDevices.addEventListener&&navigator.mediaDevices.addEventListener('devicechange',()=>{if(!m.hidden)fill();});
    return{open:()=>{fill();m.hidden=false;}};
  }

  /* ---------- import depuis le disque ---------- */
  const fromPath=f=>({name:f.name,type:'',path:f.path,arrayBuffer:()=>N.readFile(f.path)});
  async function pathOf(f){
    if(f.path)return f.path;
    if(N&&typeof File!=='undefined'&&f instanceof File){try{return await N.droppedPath(f);}catch(e){}}
    return null;
  }
  function importButtons(){
    if(!N)return null;
    return[
      h('button',{class:'tb',type:'button',title:'Ajouter des morceaux',onclick:async()=>{const fs=await N.pickFiles();if(fs.length)importFiles(fs.map(fromPath),null);}},'Fichiers'),
      h('button',{class:'tb',type:'button',title:'Ajouter un dossier entier (sous-dossiers compris)',onclick:async()=>{const fs=await N.pickFolder();if(!fs.length){return;}toast(fs.length+' morceaux trouvés, analyse en cours','ok');importFiles(fs.map(fromPath),null);}},'Dossier'),
    ];
  }

  /* ---------- bibliothèque persistante ---------- */
  function snapshot(){
    const tracks=LIB.tracks.filter(t=>t.path).map(t=>({path:t.path,title:t.title,artist:t.artist,genre:t.genre,bpm:t.bpm,grid:t.grid,key:t.key,cue:t.cue,hot:t.hot,plays:t.plays,added:t.added}));
    const byId=new Map(LIB.tracks.map(t=>[t.id,t.path]));
    const playlists=LIB.playlists.map(p=>({id:p.id,name:p.name,paths:p.ids.map(i=>byId.get(i)).filter(Boolean)}));
    return JSON.stringify({version:1,tracks,playlists});
  }
  async function save(){
    if(!N||!A.restored)return;
    const s=snapshot();if(s===A.lastSaved)return;
    try{await N.saveLibrary(s);A.lastSaved=s;}catch(e){}
  }
  async function restore(){
    if(!N)return;
    let data=null;try{data=await N.loadLibrary();}catch(e){}
    const list=data&&Array.isArray(data.tracks)?data.tracks:[];
    let ok=0,missing=0;const byPath=new Map();
    if(list.length)toast('Chargement de la bibliothèque : '+list.length+' morceaux');
    for(const t of list){
      try{
        if(!(await N.exists(t.path))){missing++;continue;}
        const buf=await ctx.decodeAudioData(await N.readFile(t.path));
        const tr=addTrack(buf,{title:t.title,artist:t.artist,genre:t.genre,key:t.key,file:t.path.split(/[\\/]/).pop(),path:t.path});
        if(t.bpm)tr.bpm=t.bpm;if(t.grid!=null)tr.grid=t.grid;tr.cue=t.cue??tr.grid;
        if(Array.isArray(t.hot))tr.hot=t.hot.slice(0,8).concat(Array(8).fill(null)).slice(0,8);
        tr.plays=t.plays||0;if(t.added)tr.added=new Date(t.added);
        byPath.set(t.path,tr.id);ok++;
        if(ok%10===0){renderSide();renderTable();}
      }catch(e){missing++;}
    }
    for(const p of (data&&data.playlists)||[]){
      const ids=(p.paths||[]).map(x=>byPath.get(x)).filter(Boolean);
      const cur=LIB.playlists.find(q=>q.id===p.id);
      if(cur){ids.forEach(i=>{if(!cur.ids.includes(i))cur.ids.push(i);});cur.name=p.name||cur.name;}
      else LIB.playlists.push({id:p.id,name:p.name||'Playlist',ids});
    }
    A.restored=true;A.lastSaved=snapshot();
    renderSide();renderTable();
    if(ok)toast('Bibliothèque chargée : '+ok+' morceaux'+(missing?' ('+missing+' introuvables)':''),'ok');
  }

  /* ---------- démarrage ---------- */
  let modal=null;
  function init(){
    const b=$('#audio-btn');
    modal=buildAudioModal();
    if(b)b.addEventListener('click',()=>modal.open());
    if(N)document.documentElement.classList.add('native');
  }
  async function boot(){
    await applySaved();
    await restore();
    setInterval(save,5000);
    window.addEventListener('beforeunload',save);
  }
  return{init,boot,importButtons,pathOf,save,setHeadphones,setMaster,listOutputs,get native(){return !!N;}};
})();
