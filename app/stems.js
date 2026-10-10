'use strict';
/* =====================================================================
   Mixlab · stems
   - Séparation d'un morceau en 4 stems (voix, batterie, basse, mélodie).
     Moteurs branchables (registerBackend) : « rapide » = DSP dans un Web
     Worker (stems-worker.js), « haute » = HT-Demucs en ONNX côté Rust,
     pas encore livré (indisponible). Résultat gardé dans IndexedDB sous
     l'empreinte du fichier (persist.js), 3 stems en 16 bits : la mélodie
     est recalculée (mix − les 3 autres), la somme redonne le morceau.
   - Fichiers .stem.mp4 (format STEMS) : démultiplexage MP4 en JS, chaque
     piste décodée avec WebCodecs (AudioDecoder). Sans décodeur : piste
     master seule et un message clair.
   - Lecture : les 4 stems forment un seul tampon à 8 canaux, joué par la
     source de la platine (engine.js) : même transport, même vitesse,
     mêmes boucles, même key lock. Un séparateur de canaux mène chaque
     stem à son volume, sa coupure, ses unités d'effets (FX1, FX2) et
     son écho, puis à l'entrée de la platine.
   - Commandes : mute et volume par stem, a cappella et instrumental en
     un bouton, mode de pads « Stems », écho out par stem, swap de stems
     entre deux platines sur N temps.
   ===================================================================== */
window.Stems=(()=>{
  const STEMS=[{id:'voc',name:'Voix',pad:'Voix',color:'#f5c542'},{id:'drums',name:'Batterie',pad:'Batt.',color:'#ff5a5f'},
    {id:'bass',name:'Basse',pad:'Basse',color:'#2fa8ff'},{id:'mel',name:'Mélodie',pad:'Mélo',color:'#53d769'}];
  const IDX=Object.fromEntries(STEMS.map((s,i)=>[s.id,i]));
  const ECHO_BEATS=.5,CACHE_MAX=8;
  const ST={hits:0,miss:0,runs:0,worker:null,mainThread:0};
  const CFG={quality:store.get('stems.quality','rapide'),auto:store.get('stems.auto','cache')};
  const fileOf=new WeakMap(); // AudioBuffer décodé d'un .stem.mp4 → {bytes, info}

  /* ---------- moteurs de séparation ----------
     separate(L, R, sr, onProgress) → Promise<[vL,vR,dL,dR,bL,bR,mL,mR]> (Float32Array). */
  const BACKENDS={
    rapide:{label:'Rapide (DSP, dans l’app)',version:'dsp1',available:()=>true,separate:dspSeparate},
    // HT-Demucs (ONNX) tournera côté Rust (commande Tauri « stems_separate ») : il suffira de
    // l'enregistrer ici avec registerBackend('haute', {available, separate}).
    haute:{label:'Haute qualité (HT-Demucs, indisponible)',version:'htdemucs',available:()=>false,separate:null}
  };
  function registerBackend(id,def){BACKENDS[id]={...(BACKENDS[id]||{}),...def};}
  function backend(){const b=BACKENDS[CFG.quality];return b&&b.available()?[CFG.quality,b]:['rapide',BACKENDS.rapide];}

  let JOB=0;const pend=new Map();
  function worker(){
    if(ST.worker!==null)return ST.worker;
    try{
      const src=MixlabStemsCore.toString()+'\n('+MixlabStemsWorkerBoot.toString()+')();';
      const w=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));
      w.onmessage=e=>{const m=e.data,j=pend.get(m.id);if(!j)return;
        if(m.error){pend.delete(m.id);j.no(new Error(m.error));}
        else if(m.done){pend.delete(m.id);j.ok(m.out);}
        else j.p&&j.p(m.p);};
      w.onerror=e=>{e.preventDefault&&e.preventDefault();ST.worker=false;pend.forEach(j=>j.fallback());pend.clear();};
      ST.worker=w;
    }catch(e){ST.worker=false;}
    return ST.worker;
  }
  async function mainThread(L,R,sr,onP){
    ST.mainThread++;
    const g=MixlabStemsCore().separate(L,R,sr);let r;
    while(!(r=g.next()).done){onP&&onP(r.value);await new Promise(o=>setTimeout(o,0));}
    return r.value;
  }
  function dspSeparate(L,R,sr,onP){
    const w=worker();
    if(!w)return mainThread(L,R,sr,onP);
    return new Promise((ok,no)=>{
      const id=++JOB;
      pend.set(id,{ok,no,p:onP,fallback:()=>mainThread(L,R,sr,onP).then(ok,no)});
      const a=L.slice(),b=R.slice();
      w.postMessage({id,L:a,R:b,sr},[a.buffer,b.buffer]);
    });
  }

  /* ---------- cache IndexedDB ---------- */
  let dbp=null;
  function db(){
    if(dbp)return dbp;
    dbp=new Promise(ok=>{
      try{const r=indexedDB.open('mixlab-stems',1);
        r.onupgradeneeded=()=>{const s=r.result.createObjectStore('stems',{keyPath:'k'});s.createIndex('used','used');};
        r.onsuccess=()=>ok(r.result);r.onerror=()=>ok(null);r.onblocked=()=>ok(null);}catch(e){ok(null);}
    });
    return dbp;
  }
  const run=(mode,fn)=>db().then(d=>d?new Promise(ok=>{
    try{const tx=d.transaction('stems',mode),r=fn(tx.objectStore('stems'));tx.oncomplete=()=>ok(r&&r.result);tx.onerror=tx.onabort=()=>ok(null);}catch(e){ok(null);}
  }):null);
  const cget=k=>run('readonly',s=>s.get(k)),cput=r=>run('readwrite',s=>s.put(r)),ccount=()=>run('readonly',s=>s.count());
  async function cprune(){
    const n=await ccount();if(!n||n<=CACHE_MAX)return;let k=n-CACHE_MAX;
    await run('readwrite',s=>{const c=s.index('used').openCursor();c.onsuccess=()=>{const x=c.result;if(!x||k<=0)return;x.delete();k--;x.continue();};return null;});
  }
  const cclear=()=>run('readwrite',s=>s.clear());
  /* empreinte : celle du fichier (persist.js) si on l'a, sinon un hachage des échantillons */
  function fpOf(tr){
    if(tr._fp)return tr._fp;
    if(tr._stfp)return tr._stfp;
    const b=tr.buffer,L=b.getChannelData(0),step=Math.max(1,Math.floor(L.length/65536));let h=2166136261;
    const f=new Float32Array(1),u=new Uint32Array(f.buffer);
    for(let i=0;i<L.length;i+=step){f[0]=L[i];h^=u[0];h=Math.imul(h,16777619);}
    return tr._stfp='pcm.'+b.length.toString(36)+'.'+b.sampleRate+'.'+(h>>>0).toString(36);
  }
  const keyOf=(tr,q)=>q+':'+BACKENDS[q].version+':'+fpOf(tr);
  function pack(a){let m=1e-9;for(let i=0;i<a.length;i++){const v=a[i]<0?-a[i]:a[i];if(v>m)m=v;}const s=m/32767,o=new Int16Array(a.length),k=1/s;for(let i=0;i<a.length;i++)o[i]=Math.round(a[i]*k);return{s,d:o};}
  function unpack(p,n){const o=new Float32Array(n),d=p.d,s=p.s,m=Math.min(n,d.length);for(let i=0;i<m;i++)o[i]=d[i]*s;return o;}
  async function cacheLoad(tr,q){
    const r=await cget(keyOf(tr,q));const b=tr.buffer;
    if(!r||r.n!==b.length||r.sr!==b.sampleRate||!Array.isArray(r.ch)||r.ch.length!==6)return null;
    r.used=Date.now();cput(r);
    const out=r.ch.map(p=>unpack(p,r.n));
    const L=b.getChannelData(0),R=b.numberOfChannels>1?b.getChannelData(1):L,mL=new Float32Array(r.n),mR=new Float32Array(r.n);
    for(let i=0;i<r.n;i++){mL[i]=L[i]-out[0][i]-out[2][i]-out[4][i];mR[i]=R[i]-out[1][i]-out[3][i]-out[5][i];}
    out.push(mL,mR);return out;
  }
  async function cacheSave(tr,q,out){
    const b=tr.buffer;
    await cput({k:keyOf(tr,q),fp:fpOf(tr),q,n:b.length,sr:b.sampleRate,used:Date.now(),title:tr.title||'',ch:out.slice(0,6).map(pack)});
    cprune();
  }

  /* ---------- MP4 : boîtes, pistes, échantillons ---------- */
  const fourcc=(u,o)=>String.fromCharCode(u[o],u[o+1],u[o+2],u[o+3]);
  const u32=(u,o)=>((u[o]<<24)|(u[o+1]<<16)|(u[o+2]<<8)|u[o+3])>>>0;
  const u16=(u,o)=>(u[o]<<8)|u[o+1];
  const u64=(u,o)=>u32(u,o)*4294967296+u32(u,o+4);
  function kids(u,a,b){
    const L=[];let o=a;
    while(o+8<=b){
      let sz=u32(u,o),hd=8;const ty=fourcc(u,o+4);
      if(sz===1){sz=u64(u,o+8);hd=16;}else if(sz===0)sz=b-o;
      if(sz<hd||o+sz>b)break;
      L.push({type:ty,start:o,data:o+hd,end:o+sz});o+=sz;
    }
    return L;
  }
  const child=(u,box,ty)=>box&&kids(u,box.data,box.end).find(x=>x.type===ty);
  const path=(u,box,...ts)=>{for(const t of ts){box=child(u,box,t);if(!box)return null;}return box;};
  function isMp4(u){return u.length>12&&fourcc(u,4)==='ftyp';}
  function descLen(u,o){let n=0,i=0;for(;i<4;i++){const b=u[o+i];n=(n<<7)|(b&127);if(!(b&128))break;}return[n,o+i+1];}
  function esds(u,box){
    let o=box.data+4;const end=box.end;
    while(o<end){
      const tag=u[o];const[len,p]=descLen(u,o+1);
      if(tag===3){let q=p+2;const fl=u[p+2];q++;if(fl&128)q+=2;if(fl&64)q+=1+u[q];if(fl&32)q+=2;o=q;continue;}
      if(tag===4){const oti=u[p];o=p+13;const r=esds_dsi(u,o,end);return{oti,asc:r};}
      o=p+len;
    }
    return null;
  }
  function esds_dsi(u,o,end){while(o<end){const tag=u[o];const[len,p]=descLen(u,o+1);if(tag===5)return u.slice(p,p+len);o=p+len;}return null;}
  function audioEntry(u,stsd){
    const e=kids(u,stsd.data+8,stsd.end)[0];if(!e)return null;
    const ver=u16(u,e.data+8),ch=u16(u,e.data+16),rate=u32(u,e.data+24)/65536;
    const ext=ver===1?16:ver===2?36:0;
    const sub=kids(u,e.data+28+ext,e.end);
    const t={format:e.type,ch,rate,codec:null,desc:null};
    if(e.type==='mp4a'){
      const es=sub.find(x=>x.type==='esds'),d=es&&esds(u,es);
      if(d&&(d.oti===0x69||d.oti===0x6B))t.codec='mp3';
      else if(d&&d.asc&&d.asc.length){let aot=d.asc[0]>>3;if(aot===31)aot=32+(((d.asc[0]&7)<<3)|(d.asc[1]>>5));t.codec='mp4a.40.'+aot;t.desc=d.asc;
        // fréquence et canaux réels : ceux de l'AudioSpecificConfig
        const SR=[96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350];
        const bits=(d.asc[0]<<8)|d.asc[1],si=(bits>>7)&15,cc=(bits>>3)&15;if(si<13&&aot!==31)t.rate=SR[si];if(cc>0&&cc<3)t.ch=cc;}
      else t.codec='mp4a.40.2';
    }else if(e.type==='Opus'){
      const d=sub.find(x=>x.type==='dOps');t.codec='opus';t.rate=48000;
      if(d){const o=d.data,ch=u[o+1],pre=u16(u,o+2),ir=u32(u,o+4),gain=u16(u,o+8),fam=u[o+10];
        const extra=fam?u.slice(o+11,d.end):new Uint8Array(0),h=new Uint8Array(19+extra.length),v=new DataView(h.buffer);
        'OpusHead'.split('').forEach((c,i)=>h[i]=c.charCodeAt(0));h[8]=1;h[9]=ch;v.setUint16(10,pre,true);v.setUint32(12,ir,true);v.setInt16(16,gain<<16>>16,true);h[18]=fam;h.set(extra,19);
        t.desc=h;t.ch=ch;t.preSkip=pre;}
    }else if(e.type==='fLaC'){
      const d=sub.find(x=>x.type==='dfLa');t.codec='flac';
      if(d){const body=u.slice(d.data+4,d.end),h=new Uint8Array(4+body.length);h.set([0x66,0x4C,0x61,0x43]);h.set(body,4);t.desc=h;}
    }else if(e.type==='alac'){
      const d=sub.find(x=>x.type==='alac');t.codec='alac';if(d)t.desc=u.slice(d.data+4,d.end);
    }else t.codec=null;
    return t;
  }
  /* toutes les pistes audio : codec, description, position et taille de chaque échantillon */
  function parseMp4(u){
    if(!isMp4(u))return null;
    const top=kids(u,0,u.length),moov=top.find(b=>b.type==='moov');if(!moov)return null;
    const info={tracks:[],stems:null};
    const meta=path(u,moov,'udta','stem');
    if(meta){try{info.stems=JSON.parse(new TextDecoder().decode(u.subarray(meta.data,meta.end)).replace(/\0+$/,''));}catch(e){}}
    for(const trak of kids(u,moov.data,moov.end).filter(b=>b.type==='trak')){
      const mdia=child(u,trak,'mdia'),hdlr=child(u,mdia,'hdlr');
      if(!hdlr||fourcc(u,hdlr.data+8)!=='soun')continue;
      const mdhd=child(u,mdia,'mdhd'),v=u[mdhd.data],ts=v===1?u32(u,mdhd.data+20):u32(u,mdhd.data+12);
      const stbl=path(u,mdia,'minf','stbl');if(!stbl)continue;
      const t=audioEntry(u,child(u,stbl,'stsd'));if(!t)continue;
      t.timescale=ts;
      const tkhd=child(u,trak,'tkhd');t.id=tkhd?u32(u,tkhd.data+(u[tkhd.data]===1?20:12)):0;
      const elst=path(u,trak,'edts','elst');t.skip=0;
      if(elst){const ev=u[elst.data],o=elst.data+8;const mt=ev===1?u64(u,o+8):(u32(u,o+4)|0);if(mt>0)t.skip=mt;}
      // tailles
      const stsz=child(u,stbl,'stsz');let sizes;
      if(stsz){const fixed=u32(u,stsz.data+4),cnt=u32(u,stsz.data+8);sizes=new Uint32Array(cnt);for(let i=0;i<cnt;i++)sizes[i]=fixed||u32(u,stsz.data+12+4*i);}
      else sizes=new Uint32Array(0);
      // morceaux (chunks) et leurs positions
      const stco=child(u,stbl,'stco'),co64=child(u,stbl,'co64');let offs=[];
      if(stco){const c=u32(u,stco.data+4);for(let i=0;i<c;i++)offs.push(u32(u,stco.data+8+4*i));}
      else if(co64){const c=u32(u,co64.data+4);for(let i=0;i<c;i++)offs.push(u64(u,co64.data+8+8*i));}
      const stsc=child(u,stbl,'stsc'),sc=[];
      if(stsc){const c=u32(u,stsc.data+4);for(let i=0;i<c;i++){const o=stsc.data+8+12*i;sc.push([u32(u,o),u32(u,o+4)]);}}
      const pos=new Float64Array(sizes.length);let si=0;
      for(let c=0;c<offs.length&&si<sizes.length;c++){
        let e=0;while(e+1<sc.length&&sc[e+1][0]<=c+1)e++;
        const spc=sc.length?sc[e][1]:1;let o=offs[c];
        for(let s=0;s<spc&&si<sizes.length;s++){pos[si]=o;o+=sizes[si];si++;}
      }
      // durées (stts)
      const stts=child(u,stbl,'stts'),dur=new Uint32Array(sizes.length);
      if(stts){const c=u32(u,stts.data+4);let k=0;for(let i=0;i<c;i++){const n=u32(u,stts.data+8+8*i),d=u32(u,stts.data+12+8*i);for(let j=0;j<n&&k<dur.length;j++)dur[k++]=d;}}
      t.sizes=sizes;t.pos=pos;t.dur=dur;t.count=si;
      info.tracks.push(t);
    }
    return info;
  }
  /* rôle de chaque piste de stem : d'après les noms du bloc « stem », sinon l'ordre du format (batterie, basse, autres, voix) */
  function stemRoles(info){
    const n=info.tracks.length-1,names=info.stems&&Array.isArray(info.stems.stems)?info.stems.stems.map(s=>String(s&&s.name||'')):[];
    const def=['drums','bass','mel','voc'],roles=[];
    for(let i=0;i<n;i++){
      const nm=(names[i]||'').toLowerCase();
      roles.push(/voc|vox|voix|chant|sing|acap/.test(nm)?'voc':/drum|batt|perc|beat|kick/.test(nm)?'drums':/bass|basse|sub/.test(nm)?'bass':nm?'mel':def[i]||'mel');
    }
    return roles;
  }
  const isStemInfo=info=>!!(info&&info.tracks.length>=3);
  async function decodeTrack(u,t){
    if(typeof AudioDecoder==='undefined')throw new Error('nodecoder');
    if(!t.codec)throw new Error('codec');
    const cfg={codec:t.codec,sampleRate:t.rate,numberOfChannels:t.ch||2};if(t.desc)cfg.description=t.desc;
    let sup=null;try{sup=await AudioDecoder.isConfigSupported(cfg);}catch(e){}
    if(!sup||!sup.supported)throw new Error('codec');
    const parts=[[],[]];let rate=t.rate,err=null,total=0;
    const dec=new AudioDecoder({output:a=>{
      try{const n=a.numberOfFrames,ch=a.numberOfChannels;rate=a.sampleRate;
        for(let c=0;c<2;c++){const x=new Float32Array(n);a.copyTo(x,{planeIndex:Math.min(c,ch-1),format:'f32-planar'});parts[c].push(x);}
        total+=n;}finally{a.close();}
    },error:e=>{err=e;}});
    dec.configure(cfg);
    let ts=0;
    for(let i=0;i<t.count;i++){
      if(err)break;
      const d=u.subarray(t.pos[i],t.pos[i]+t.sizes[i]);
      dec.decode(new EncodedAudioChunk({type:'key',timestamp:Math.round(ts*1e6/t.timescale),duration:Math.round(t.dur[i]*1e6/t.timescale)||undefined,data:d}));
      ts+=t.dur[i];
      if(dec.decodeQueueSize>48)await new Promise(o=>{const f=()=>{dec.removeEventListener('dequeue',f);o();};dec.addEventListener('dequeue',f);setTimeout(f,50);});
    }
    if(!err)await dec.flush().catch(e=>{err=e;});
    try{dec.close();}catch(e){}
    if(err)throw err;
    // décalage du codeur (liste d'édition) ; l'Opus le retire déjà au décodage
    const skip=t.codec!=='opus'&&t.skip?Math.round(t.skip*rate/t.timescale):0;
    const out=[0,1].map(c=>{const o=new Float32Array(Math.max(0,total-skip));let p=-skip;for(const x of parts[c]){for(let i=0;i<x.length;i++,p++)if(p>=0&&p<o.length)o[p]=x[i];}return o;});
    return{rate,ch:out};
  }
  async function resample(chs,rate,n){
    const sr=ctx.sampleRate;
    if(Math.round(rate)===sr){return chs.map(c=>{if(c.length===n)return c;const o=new Float32Array(n);o.set(c.subarray(0,n));return o;});}
    const len=Math.max(1,chs[0].length),b=new AudioBuffer({numberOfChannels:2,length:len,sampleRate:rate});
    b.copyToChannel(chs[0],0);b.copyToChannel(chs[1],1);
    const oc=new OfflineAudioContext(2,Math.max(1,n),sr),s=oc.createBufferSource();s.buffer=b;s.connect(oc.destination);s.start();
    const r=await oc.startRendering();return[r.getChannelData(0),r.getChannelData(1)].map(c=>{const o=new Float32Array(n);o.set(c.subarray(0,n));return o;});
  }
  /* .stem.mp4 → 4 stems (8 canaux) à la longueur du morceau */
  async function readStemFile(u,info,n){
    info=info||parseMp4(u);if(!isStemInfo(info))throw new Error('notstem');
    const roles=stemRoles(info),out=Array.from({length:8},()=>new Float32Array(n));
    for(let i=1;i<info.tracks.length;i++){
      const r=await decodeTrack(u,info.tracks[i]),ch=await resample(r.ch,r.rate,n),k=IDX[roles[i-1]];
      for(let c=0;c<2;c++){const o=out[2*k+c],x=ch[c];for(let j=0;j<n;j++)o[j]+=x[j];}
    }
    return out;
  }
  /* Décodage à l'import : un .stem.mp4 garde ses pistes pour plus tard ; la piste master
     passe par le décodeur du navigateur, ou par WebCodecs s'il refuse le conteneur. */
  async function decode(ab,name){
    let u=null,info=null;
    try{u=new Uint8Array(ab);if(isMp4(u)){info=parseMp4(u);}}catch(e){info=null;}
    if(!isStemInfo(info))return ctx.decodeAudioData(ab);
    const bytes=new Uint8Array(ab.slice(0));
    let buf=null;
    try{buf=await ctx.decodeAudioData(ab);}
    catch(e){
      const r=await decodeTrack(bytes,info.tracks[0]),n=Math.round(r.ch[0].length*ctx.sampleRate/r.rate),ch=await resample(r.ch,r.rate,n);
      buf=ctx.createBuffer(2,n,ctx.sampleRate);buf.copyToChannel(ch[0],0);buf.copyToChannel(ch[1],1);
    }
    fileOf.set(buf,{bytes,info,name:name||''});
    return buf;
  }
  // les morceaux créés à partir d'un tampon décodé ici gardent leur fichier de stems
  if(typeof addTrack==='function'){
    const add0=addTrack;
    window.addTrack=addTrack=function(buffer,meta){const tr=add0(buffer,meta),f=fileOf.get(buffer);if(f){tr._stemFile=f;tr.stemFile=true;}return tr;};
  }

  /* ---------- stems d'un morceau ---------- */
  function toBuffer(out,sr){const n=out[0].length,b=ctx.createBuffer(8,Math.max(1,n),sr);out.forEach((c,i)=>b.copyToChannel(c,i));return b;}
  /* Prépare les stems d'un morceau : fichier .stem.mp4, cache, ou séparation. onP(0..1). */
  function stemsOf(tr,onP){
    if(tr._stems)return Promise.resolve(tr._stems);
    if(tr._stemJob)return tr._stemJob;
    const job=(async()=>{
      const b=tr.buffer,n=b.length,sr=b.sampleRate;
      if(tr._stemFile){
        try{const out=await readStemFile(tr._stemFile.bytes,tr._stemFile.info,n);return tr._stems={buf:toBuffer(out,sr),source:'fichier',quality:'fichier'};}
        catch(e){tr._stemFileErr=e.message==='nodecoder'||e.message==='codec'?'decodeur':'lecture';
          toast(tr._stemFileErr==='decodeur'?'Ce navigateur ne sait pas décoder les pistes du fichier de stems : seule la piste master est jouée. Les stems sont calculés à la place.':'Pistes du fichier de stems illisibles : les stems sont calculés à la place.');}
      }
      const[q,be]=backend();
      const c=await cacheLoad(tr,q);
      if(c){ST.hits++;return tr._stems={buf:toBuffer(c,sr),source:'cache',quality:q};}
      ST.miss++;ST.runs++;
      const L=b.getChannelData(0),R=b.numberOfChannels>1?b.getChannelData(1):L;
      const out=await be.separate(L,R,sr,onP);
      try{await cacheSave(tr,q,out);}catch(e){}
      return tr._stems={buf:toBuffer(out,sr),source:'calcul',quality:q};
    })();
    tr._stemJob=job;
    job.then(()=>{tr._stemJob=null;},()=>{tr._stemJob=null;});
    return job;
  }

  /* ---------- graphe par platine ---------- */
  const mk=()=>ctx.createGain();
  function stOf(d){return d._stem||(d._stem={mute:[false,false,false,false],vol:[1,1,1,1],lock:[0,0,0,0],status:'off',progress:0,source:'',err:'',echo:[0,0,0,0]});}
  function graph(d){
    if(d._sg)return d._sg;
    const G={split:ctx.createChannelSplitter(8),vg:[],mg:[],es:[],er:[],fx:[]};
    STEMS.forEach((s,i)=>{
      const m=ctx.createChannelMerger(2),vg=mk(),mg=mk();
      G.split.connect(m,2*i,0);G.split.connect(m,2*i+1,1);m.connect(vg);
      // unités d'effets FX1 puis FX2, cible « A:voix » (le reste de la platine n'est pas touché)
      let x=vg;FXU.forEach(u=>{const I=u.mk(d.id+':'+s.id);x.connect(I.in);x=I.out;});
      x.connect(mg);mg.connect(d.srcBus);
      G.vg.push(vg);G.mg.push(mg);
    });
    return d._sg=G;
  }
  // écho par stem (écho out) : envoi avant la coupure, la queue continue quand le stem est coupé
  function echoOf(d,i){
    const G=graph(d);if(G.fx[i])return G.fx[i];
    const s=mk(),r=mk();s.gain.value=0;G.vg[i].connect(s);r.connect(d.srcBus);
    const fx=FX_BUILD.echo(s,r);fx.param(.62,.25);fx.update(60/(d.bpm||120)*ECHO_BEATS);
    return G.fx[i]={s,r,fx,per:0};
  }
  function applyGains(d){
    const st=stOf(d),G=d._sg;if(!G)return;const t=ctx.currentTime;
    STEMS.forEach((s,i)=>{G.vg[i].gain.setTargetAtTime(st.vol[i],t,.012);if(st.lock[i]<t)G.mg[i].gain.setTargetAtTime(st.mute[i]?0:1,t,.012);});
  }
  const ready=d=>!!(d.stems&&d.track&&d.track._stems&&d.stems.buf===d.track._stems.buf);
  function attach(d){
    const tr=d.track;if(!tr||!tr._stems)return;
    const G=graph(d),st=stOf(d);
    const was=ready(d);d.stems={buf:tr._stems.buf,input:G.split};
    st.status='ready';st.source=tr._stems.source;st.progress=1;applyGains(d);
    // en lecture : la source repart sur le tampon des stems, à la même position
    if(!was&&d.playing&&!d.spinSt&&!d.reverse&&!d.scratching)d.seek(d.position());
    refresh(d);
  }
  /* Prépare les stems de la platine (sans rien couper). Renvoie la source : fichier, cache ou calcul. */
  async function prepare(d,quiet){
    const tr=d.track;if(!tr)return null;
    if(ready(d))return tr._stems.source;
    const st=stOf(d);
    if(!tr._stems){
      st.status='work';st.progress=0;st.err='';refresh(d);
      const t0=performance.now();let shown=false;
      try{
        await stemsOf(tr,p=>{st.progress=p;if(d.track===tr)refresh(d);if(!quiet&&!shown&&performance.now()-t0>600){shown=true;toast('Séparation des stems de « '+tr.title+' »…');}});
      }catch(e){st.status='err';st.err=String(e&&e.message||e);refresh(d);if(!quiet)toast('Séparation des stems impossible : '+st.err);return null;}
      if(!quiet&&shown)toast('Stems prêts pour « '+tr.title+' »','ok');
    }
    if(d.track!==tr)return null;
    attach(d);return tr._stems.source;
  }

  /* ---------- commandes ---------- */
  const want=d=>{if(!ready(d)&&d.track)prepare(d);};
  function setMute(d,i,on){const st=stOf(d);st.mute[i]=on==null?!st.mute[i]:!!on;want(d);applyGains(d);refresh(d);}
  function setVol(d,i,v){const st=stOf(d);st.vol[i]=clamp(+v||0,0,1.5);want(d);applyGains(d);refresh(d);}
  function setAll(d,m){const st=stOf(d);st.mute=m.slice();want(d);applyGains(d);refresh(d);}
  const isAcap=st=>!st.mute[0]&&st.mute[1]&&st.mute[2]&&st.mute[3];
  const isInst=st=>st.mute[0]&&!st.mute[1]&&!st.mute[2]&&!st.mute[3];
  function acapella(d){const st=stOf(d);setAll(d,isAcap(st)?[false,false,false,false]:[false,true,true,true]);}
  function instrumental(d){const st=stOf(d);setAll(d,isInst(st)?[false,false,false,false]:[true,false,false,false]);}
  function reset(d){const st=stOf(d);st.vol=[1,1,1,1];setAll(d,[false,false,false,false]);}
  /* prochain temps de la platine (avec Quantize), sinon tout de suite */
  // lead : si le temps suivant est trop proche pour être programmé, on prend celui d'après (jamais hors grille)
  function nextBeat(d,lead){const now=ctx.currentTime;if(!S.quantize||!d.track||!d.playing||d.reverse)return now+(lead||.01);const bp=d.beatPos(),bl=d.beatLen/d.rate;let k=Math.ceil(bp+1e-3);while(now+(k-bp)*bl<now+(lead||0))k++;return now+(k-bp)*bl;}
  /* Écho out : l'écho prend le stem, puis sur le temps suivant le stem se coupe et seule la queue reste.
     Sur un stem déjà coupé : il revient sur le temps. */
  async function echoOut(d,i){
    const st=stOf(d);if(!d.track)return;
    if(!ready(d)){await prepare(d);if(!ready(d))return;}
    const t=Math.max(nextBeat(d,.08),ctx.currentTime+.08),G=graph(d);
    if(st.mute[i]){
      st.mute[i]=false;st.lock[i]=t+.05;const p=G.mg[i].gain;holdP(p,ctx.currentTime);p.setTargetAtTime(1,t,.01);
      setTimeout(()=>{st.lock[i]=0;applyGains(d);refresh(d);},Math.max(0,(t-ctx.currentTime)*1000)+60);refresh(d);return;
    }
    const E=echoOf(d,i),now=ctx.currentTime;
    holdP(E.s.gain,now);E.s.gain.setTargetAtTime(1,now,.005);E.s.gain.setTargetAtTime(0,t,.008);
    const p=G.mg[i].gain;holdP(p,now);p.setTargetAtTime(0,t,.008);
    st.mute[i]=true;st.lock[i]=t+.05;st.echo[i]=t;
    setTimeout(()=>{st.lock[i]=0;applyGains(d);refresh(d);},Math.max(0,(t-ctx.currentTime)*1000)+60);
    refresh(d);
  }
  /* Envoie un stem dans une unité d'effets (FX1 = 0, FX2 = 1) : l'unité agit sur ce stem seul. */
  function sendToUnit(d,i,u,on){
    const U=FXU[u];if(!U)return;graph(d);want(d);
    const tg=d.id+':'+STEMS[i].id;U.toggle(tg,on==null?!U.targets.has(tg):!!on);refresh(d);
  }
  const unitOn=(d,i,u)=>!!(FXU[u]&&FXU[u].targets.has(d.id+':'+STEMS[i].id));
  /* Swap : sur N temps, les stems choisis quittent une platine et arrivent sur l'autre
     (fondu linéaire calé sur le temps suivant). Ex. : la voix de A passe sur l'instru de B. */
  const SWAP={on:null};
  async function swap(from,to,ids,beats){
    ids=(Array.isArray(ids)?ids:String(ids||'voc').split(',')).map(x=>IDX[x]).filter(x=>x!=null);
    beats=clamp(+beats||8,1,64);
    if(!from.track||!to.track){toast('Swap : charge un morceau sur les deux platines');return null;}
    await Promise.all([prepare(from),prepare(to)]);
    if(!ready(from)||!ready(to))return null;
    const ref=from.playing?from:to.playing?to:from,spb=ref.track?ref.beatLen/ref.rate:.5;
    const t0=Math.max(nextBeat(ref,.05),ctx.currentTime+.05),t1=t0+beats*spb,now=ctx.currentTime;
    const sf=stOf(from),stt=stOf(to),Gf=graph(from),Gt=graph(to);
    ids.forEach(i=>{
      const a=Gf.mg[i].gain,b=Gt.mg[i].gain;
      holdP(a,now);a.setValueAtTime(sf.mute[i]?0:1,t0);a.linearRampToValueAtTime(0,t1);
      holdP(b,now);b.setValueAtTime(stt.mute[i]?0:1,t0);b.linearRampToValueAtTime(1,t1);
      sf.lock[i]=stt.lock[i]=t1+.05;
    });
    SWAP.on={from:from.id,to:to.id,ids,t0,t1};
    if(!to.playing)toast('Swap lancé : la platine '+to.id+' est à l’arrêt, lance-la pour entendre ses stems');
    refresh(from);refresh(to);
    return new Promise(ok=>setTimeout(()=>{
      ids.forEach(i=>{sf.mute[i]=true;stt.mute[i]=false;sf.lock[i]=stt.lock[i]=0;});
      applyGains(from);applyGains(to);SWAP.on=null;refresh(from);refresh(to);ok({t0,t1});
    },Math.max(0,(t1-ctx.currentTime)*1000)+80));
  }

  /* ---------- branchements : chargement, effets, pads ---------- */
  {
    const load0=Deck.prototype.load;
    Deck.prototype.load=function(tr){
      const old=this.track;if(this.stems)this.stems=null;
      load0.call(this,tr);
      const st=stOf(this);st.mute=[false,false,false,false];st.vol=[1,1,1,1];st.lock=[0,0,0,0];st.status='off';st.progress=0;st.source='';
      if(this._sg)applyGains(this);
      // on libère la mémoire des stems d'un morceau qui n'est plus sur aucune platine
      if(old&&old!==tr&&old._stems&&!decks.some(d=>d.track===old))old._stems=null;
      if(tr&&tr._stems)attach(this);
      else if(tr&&(CFG.auto==='always'||(CFG.auto==='cache'&&tr._stemFile)))prepare(this,true);
      else if(tr&&CFG.auto==='cache')cacheHas(tr).then(h=>{if(h&&this.track===tr)prepare(this,true);});
      refresh(this);
    };
    // une unité d'effets posée sur un stem suit le tempo de sa platine
    const ref0=FxUnit.prototype.refFor;
    FxUnit.prototype.refFor=function(tg){return typeof tg==='string'&&tg[1]===':'?decks.find(d=>d.id===tg[0])||null:ref0.call(this,tg);};
  }
  async function cacheHas(tr){try{const r=await cget(keyOf(tr,backend()[0]));return !!(r&&r.n===tr.buffer.length);}catch(e){return false;}}
  // le délai des échos suit le tempo
  setInterval(()=>{decks.forEach(d=>{const G=d._sg;if(!G||!d.track)return;G.fx.forEach(E=>{if(!E)return;const p=60/d.bpm*ECHO_BEATS;if(Math.abs(p-E.per)>1e-3){E.per=p;E.fx.update(p);}});});},120);

  /* mode de pads « Stems » : 1 à 4 coupent ou rendent un stem, 5 à 8 font un écho out */
  if(typeof PAD_MODES!=='undefined'&&!PAD_MODES.some(m=>m[0]==='stem'))
    PAD_MODES.push(['stem','Stems','Stems : pads 1 à 4 coupent ou rendent la voix, la batterie, la basse, la mélodie. Pads 5 à 8 : écho out du stem, puis retour sur le temps. Clic droit : volumes, effets et swap.']);
  if(typeof padDown==='function'){
    const pd0=padDown,rp0=renderPads,pl0=padLights;
    window.padDown=padDown=function(d,i,e){if(d.padMode!=='stem')return pd0(d,i,e);if(i<4)setMute(d,i);else echoOut(d,i-4);};
    window.renderPads=renderPads=function(d){
      rp0(d);if(d.padMode!=='stem'||!d.ui.pads)return;
      d.ui.pads.forEach((p,i)=>{const s=STEMS[i%4];p.textContent=i<4?s.pad:'Écho';p.title=i<4?s.name+' : coupe ou rend ce stem':'Écho out '+s.name.toLowerCase()+' : écho puis coupure sur le temps (un second appui le rend)';p.style.setProperty('--hc',s.color);});
    };
    window.padLights=padLights=function(d){
      pl0(d);if(d.padMode!=='stem'||!d.ui.pads)return;const st=stOf(d),r=ready(d);
      d.ui.pads.forEach((p,i)=>{const k=i%4;p.classList.toggle('set',i<4&&!st.mute[k]&&st.status!=='err');p.classList.toggle('lit',i>=4&&st.lock[k]>ctx.currentTime);p.classList.toggle('st-off',i<4&&st.mute[k]);p.classList.toggle('st-wait',!r);});
    };
  }
  if(window.Perf&&Perf.padMenu){const pm0=Perf.padMenu;Perf.padMenu=(d,i,a)=>d.padMode==='stem'?panel(d,a):pm0(d,i,a);}

  /* ---------- interface : rangée Stems (dans la rangée Pro) et panneau ---------- */
  function decorate(d){
    const P=document.getElementById('p-deck'+d.id);if(!P||typeof btn!=='function')return;
    if(d.ui.stems&&P.contains(d.ui.stems.root))return;
    const D=d.id,X={b:[]};
    X.lab=h('span',{class:'lbl st-lab',title:'Stems : voix, batterie, basse, mélodie'},'Stems');
    X.pg=h('span',{class:'st-pg'},'');
    STEMS.forEach((s,i)=>{const b=btn(D+'.stem'+(i+1),s.name+' '+D,s.pad,'st-b',()=>setMute(d,i),null,s.name+' : coupe ou rend ce stem (la séparation démarre au premier appui)');b.style.setProperty('--sc',s.color);X.b.push(b);});
    X.acap=btn(D+'.acapella','A cappella '+D,'A cap.','st-b',()=>acapella(d),null,'A cappella : seule la voix reste. Un second appui rend tout.');
    X.inst=btn(D+'.instru','Instrumental '+D,'Instru','st-b',()=>instrumental(d),null,'Instrumental : tout sauf la voix. Un second appui rend tout.');
    X.more=h('button',{class:'b st-b',type:'button',title:'Volumes, effets par stem, écho out, swap entre platines, qualité','aria-label':'Réglages des stems '+D,onclick:e=>panel(d,e.currentTarget)},'⋯');
    X.root=h('div',{class:'r dk-pro dk-stems'},X.lab,X.pg,X.b,X.acap,X.inst,X.more);
    const pro=P.querySelector('.dk-pro:not(.dk-stems)')||P.querySelector('.dk-grid')||P.lastElementChild;
    (pro||P).after(X.root);
    d.ui.stems=X;refresh(d);
  }
  let PANEL=null;
  function refresh(d){
    const X=d.ui&&d.ui.stems,st=stOf(d);
    if(X){
      X.b.forEach((b,i)=>{b.classList.toggle('on',!st.mute[i]&&ready(d));b.setAttribute('aria-pressed',String(!st.mute[i]));b.classList.toggle('off',st.mute[i]);});
      X.acap.classList.toggle('on',isAcap(st));X.inst.classList.toggle('on',isInst(st));
      X.pg.textContent=st.status==='work'?Math.round(st.progress*100)+' %':st.status==='err'?'erreur':ready(d)?(st.source==='fichier'?'fichier':'prêts'):'';
    }
    if(d.padMode==='stem'&&d.ui.pads)padLights(d);
    if(PANEL&&PANEL.d===d&&PANEL.el.isConnected)PANEL.sync();
  }
  const SRC={fichier:'pistes du fichier .stem.mp4',cache:'séparation rapide, gardée en cache',calcul:'séparation rapide (DSP)'};
  function panel(d,anchor){
    if(!window.Perf||!Perf.popover)return;
    if(!d.track){toast('Charge un morceau sur la platine '+d.id+' d’abord');return;}
    const st=stOf(d),rows=[],R={};
    R.state=h('div',{class:'pe st-state'},'');
    STEMS.forEach((s,i)=>{
      const m=h('button',{class:'b',type:'button',style:'--sc:'+s.color,title:'Couper ou rendre',onclick:()=>setMute(d,i)},s.name);
      const v=h('input',{type:'range',class:'prg',min:0,max:1.5,step:.01,value:st.vol[i],'aria-label':'Volume '+s.name});
      v.addEventListener('input',()=>setVol(d,i,+v.value));v.addEventListener('dblclick',()=>{v.value=1;setVol(d,i,1);});
      const f1=h('button',{class:'b',type:'button',title:'Envoyer ce stem dans l’unité FX1',onclick:()=>sendToUnit(d,i,0)},'FX1');
      const f2=h('button',{class:'b',type:'button',title:'Envoyer ce stem dans l’unité FX2',onclick:()=>sendToUnit(d,i,1)},'FX2');
      const eo=h('button',{class:'b',type:'button',title:'Écho out : écho puis coupure sur le temps. Sur un stem coupé : retour sur le temps.',onclick:()=>echoOut(d,i)},'Écho out');
      R['m'+i]=m;R['v'+i]=v;R['f'+i]=[f1,f2];
      rows.push(h('div',{class:'pr st-row'},m,v,f1,f2,eo));
    });
    const others=decks.filter(x=>x.active&&x!==d);
    const to=h('select',{class:'sel','aria-label':'Platine qui reçoit'},others.map(x=>h('option',{value:x.id},'vers '+x.id)));
    const what=h('select',{class:'sel','aria-label':'Stems à passer'},[['voc','Voix'],['drums','Batterie'],['voc,drums','Voix et batterie'],['bass','Basse'],['mel','Mélodie']].map(([k,n])=>h('option',{value:k},n)));
    const nb=h('select',{class:'sel','aria-label':'Durée en temps'},[4,8,16,32].map(b=>h('option',{value:b},b+' temps')));nb.value='8';
    const go=h('button',{class:'b',type:'button',title:'Les stems choisis quittent cette platine et arrivent sur l’autre, en fondu sur la durée choisie',onclick:()=>{const t=decks.find(x=>x.id===to.value);if(t)swap(d,t,what.value,+nb.value);}},'Swap');
    const q=h('select',{class:'sel','aria-label':'Qualité de séparation'},Object.entries(BACKENDS).map(([k,b])=>h('option',{value:k,disabled:!b.available()},b.label)));q.value=backend()[0];
    q.addEventListener('change',()=>setQuality(q.value));
    const sep=h('button',{class:'b',type:'button',onclick:()=>prepare(d)},'Séparer');
    const all=h('div',{class:'pa'},h('button',{class:'b',type:'button',onclick:()=>acapella(d)},'A cappella'),h('button',{class:'b',type:'button',onclick:()=>instrumental(d)},'Instrumental'),h('button',{class:'b',type:'button',onclick:()=>reset(d)},'Tout rendre'),sep);
    const el=Perf.popover(anchor,'Stems · platine '+d.id,[R.state,...rows,all,
      others.length?h('div',{class:'ps'},h('span',{class:'lbl'},'Swap'),what,to,nb,go):null,
      h('label',{class:'prow'},h('span',{class:'lbl'},'Qualité'),q)],()=>{PANEL=null;});
    el.classList.add('st-pop');
    PANEL={d,el,sync(){
      const s=stOf(d);
      R.state.textContent=s.status==='work'?'Séparation en cours : '+Math.round(s.progress*100)+' %':s.status==='err'?'Séparation impossible : '+s.err:ready(d)?'Stems prêts : '+(SRC[s.source]||s.source)+'.':(d.track&&d.track._stemFile?'Fichier de stems : les pistes seront lues au premier appui.':'Pas encore séparé : le premier appui lance la séparation.');
      if(d.track&&d.track._stemFileErr==='decodeur')R.state.textContent+=' Le navigateur ne décode pas les pistes du fichier : stems calculés.';
      STEMS.forEach((x,i)=>{R['m'+i].setAttribute('aria-pressed',String(!s.mute[i]));R['m'+i].classList.toggle('on',!s.mute[i]);R['f'+i].forEach((b,u)=>b.classList.toggle('on',unitOn(d,i,u)));});
      sep.textContent=ready(d)?'Prêts':s.status==='work'?'…':'Séparer';sep.disabled=ready(d)||s.status==='work';
    }};
    PANEL.sync();
  }
  function setQuality(qv){
    const b=BACKENDS[qv];
    if(!b||!b.available()){toast('Haute qualité indisponible pour l’instant : la séparation rapide est utilisée.');qv='rapide';}
    CFG.quality=qv;store.set('stems.quality',qv);
  }
  function setAuto(v){CFG.auto=['off','cache','always'].includes(v)?v:'cache';store.set('stems.auto',CFG.auto);}
  // réglages pour la fenêtre Préférences
  window.MixlabSettings=(window.MixlabSettings||[]).concat([
    {tab:'Stems',key:'stems.quality',label:'Qualité de séparation des stems',type:'select',options:[['rapide','Rapide (DSP, dans l’app)'],['haute','Haute qualité (indisponible)']],get:()=>CFG.quality,set:setQuality},
    {tab:'Stems',key:'stems.auto',label:'Stems au chargement d’un morceau',type:'select',options:[['off','Seulement quand je les demande'],['cache','Si déjà calculés ou fichier de stems'],['always','Toujours séparer']],get:()=>CFG.auto,set:setAuto}
  ]);
  function css(){
    if(document.getElementById('stems-css'))return;
    const s=document.createElement('style');s.id='stems-css';
    s.textContent=`.dk-stems{gap:3px;align-items:center}
.dk-stems .st-pg{font:600 11px var(--num);color:var(--text-lo,var(--mu));min-width:30px}
.dk-stems .b.st-b.on,.st-pop .b.on{color:var(--sc,var(--text-hi));background:color-mix(in srgb,var(--sc,var(--text-hi)) 16%,transparent)}
.dk-stems .b.st-b.off{opacity:.55;text-decoration:line-through}
.deck .pad.m-stem{font-size:10px;letter-spacing:0;padding:0 1px;border:1px solid color-mix(in srgb,var(--hc) 30%,transparent);background:color-mix(in srgb,var(--hc) 8%,var(--surface-1,#16191e));color:color-mix(in srgb,var(--hc) 75%,#fff)}
.deck .pad.m-stem.st-off{opacity:.5;border-style:dashed}.deck .pad.m-stem.st-wait{opacity:.7}
.st-pop .st-row{display:grid;grid-template-columns:84px 1fr auto auto auto;gap:4px;align-items:center}
.st-pop .ps{flex-wrap:wrap;gap:4px}`;
    document.head.append(s);
  }
  function init(){css();decks.forEach(decorate);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,50));else setTimeout(init,50);
  // l'interface peut être reconstruite (changement de disposition) : on repose la rangée
  setInterval(()=>{if(document.body)decks.forEach(decorate);},700);

  return{STEMS,BACKENDS,registerBackend,prepare,stemsOf,setMute,setVol,acapella,instrumental,reset,echoOut,sendToUnit,swap,decode,parseMp4,readStemFile,
    separate:(L,R,sr,onP)=>backend()[1].separate(L,R,sr,onP),state:d=>({...stOf(d),ready:ready(d)}),ready,panel,keyOf,fpOf,cacheClear:cclear,cacheCount:ccount,
    setQuality,setAuto,get quality(){return CFG.quality;},get auto(){return CFG.auto;},get stats(){return{...ST,worker:ST.worker?'worker':ST.worker===false?'fil principal':'—'};},get swapping(){return SWAP.on;}};
})();
