'use strict';
/* =====================================================================
   Mixlab · bibliothèque et analyse, en plus
   Analyse
   - Loudness intégrée (LUFS, ITU-R BS.1770 : pondération K, blocs de 400 ms,
     portes absolue et relative) et gain automatique façon ReplayGain.
   - Passages vocaux estimés (voisement et hauteur qui glisse, sans modèle),
     montrés sur la vue d'ensemble et la waveform.
   - Analyse complétée (seulement ce qui manque) ou forcée ; repères de minutes
     sur la vue d'ensemble ; mini-waveform dans la liste (vignette tirée de la
     forme déjà calculée).
   Bibliothèque
   - Dossiers de playlists et sous-crates, couleurs, favoris, tri.
   - Dossiers surveillés (appli : commande Rust qui relit les dossiers ;
     navigateur : File System Access) et explorateur de dossiers.
   - Import Serato (crates et sous-crates du dossier _Serato_, cues, boucles,
     couleur et grille lus dans les tags GEOB des MP3 et les atomes des MP4)
     et Traktor (NML : cues, boucles, grille, grille à plusieurs repères, playlists).
   - Indicateur de charge (interface et audio).
   ===================================================================== */
window.LibPlus=(()=>{
  const N=()=>window.mixlabNative||null;
  const INV=()=>{const T=window.__TAURI__;return T&&T.core&&T.core.invoke?T.core.invoke:null;};
  const P=Object.assign({agMode:'rms',lufsTarget:-14,vocals:true,minutes:true,serato:true,sub:true,sort:'manual',watchSec:30,load:true},store.get('libplus',{}));
  const save=()=>store.set('libplus',P);
  const fold=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  const base=p=>String(p||'').split(/[\\/]/).pop();
  const str=(u,o,n)=>{let s='';for(let i=0;i<n&&o+i<u.length;i++)s+=String.fromCharCode(u[o+i]);return s;};
  const be32=(u,o)=>((u[o]<<24)>>>0)+(u[o+1]<<16)+(u[o+2]<<8)+u[o+3];
  const ss32=(u,o)=>((u[o]&127)<<21)|((u[o+1]&127)<<14)|((u[o+2]&127)<<7)|(u[o+3]&127);
  const dec={},td=(b,enc)=>{try{return(dec[enc]||(dec[enc]=new TextDecoder(enc))).decode(b);}catch(e){return'';}};
  const pl=(n,w,ws)=>n+' '+(n>1?(ws||w+'s'):w);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  /* ---------- IndexedDB : analyses en plus et dossiers du navigateur ---------- */
  let DBP=null;
  function db(){
    if(DBP)return DBP;
    DBP=new Promise(ok=>{try{const r=indexedDB.open('mixlab-plus',1);r.onupgradeneeded=()=>{r.result.createObjectStore('ana');r.result.createObjectStore('kv');};r.onsuccess=()=>ok(r.result);r.onerror=r.onblocked=()=>ok(null);}catch(e){ok(null);}});
    return DBP;
  }
  const dbDo=(st,mode,fn)=>db().then(d=>d?new Promise(ok=>{try{const tx=d.transaction(st,mode),r=fn(tx.objectStore(st));tx.oncomplete=()=>ok(r&&r.result);tx.onerror=tx.onabort=()=>ok(null);}catch(e){ok(null);}}):null);
  const dbGet=(st,k)=>dbDo(st,'readonly',s=>s.get(k)),dbSet=(st,k,v)=>dbDo(st,'readwrite',s=>s.put(v,k));

  /* ---------- loudness (LUFS) ----------
     Filtre de pondération K (deux biquads, coefficients recalculés pour la fréquence d'échantillonnage),
     énergie par pas de 100 ms, blocs de 400 ms, porte absolue à -70 LUFS puis porte relative à -10 LU. */
  function kCoefs(fs){
    let f0=1681.974450955533,Q=.7071752369554196,K=Math.tan(Math.PI*f0/fs);
    const Vh=Math.pow(10,3.999843853973347/20),Vb=Math.pow(Vh,.4996667741545416),a0=1+K/Q+K*K;
    const pb=[(Vh+Vb*K/Q+K*K)/a0,2*(K*K-Vh)/a0,(Vh-Vb*K/Q+K*K)/a0],pa=[2*(K*K-1)/a0,(1-K/Q+K*K)/a0];
    f0=38.13547087602444;Q=.5003270373238773;K=Math.tan(Math.PI*f0/fs);const d=1+K/Q+K*K;
    return{pb,pa,ra:[2*(K*K-1)/d,(1-K/Q+K*K)/d]};
  }
  // générateur : la version en fond rend la main toutes les 3 ms environ
  function* lufsRun(chs,sr,slice){
    const{pb,pa,ra}=kCoefs(sr),n=chs[0].length,step=Math.round(sr*.1),ns=Math.floor(n/step);if(ns<4)return null;
    const acc=new Float64Array(ns),N0=ns*step;
    for(const x of chs){
      let x1=0,x2=0,y1=0,y2=0,z1=0,z2=0;
      for(let a=0;a<N0;a+=slice){
        const e=Math.min(N0,a+slice);
        for(let i=a;i<e;i++){
          const v=x[i],y=pb[0]*v+pb[1]*x1+pb[2]*x2-pa[0]*y1-pa[1]*y2,z=y-2*y1+y2-ra[0]*z1-ra[1]*z2;
          x2=x1;x1=v;y2=y1;y1=y;z2=z1;z1=z;acc[(i/step)|0]+=z*z;
        }
        if(e<N0)yield;
      }
    }
    const nb=ns-3,zb=new Float64Array(nb),lk=z=>-.691+10*Math.log10(z+1e-20);
    for(let j=0;j<nb;j++)zb[j]=(acc[j]+acc[j+1]+acc[j+2]+acc[j+3])/(4*step);
    let s=0,c=0;for(let j=0;j<nb;j++)if(lk(zb[j])>-70){s+=zb[j];c++;}
    if(!c)return -70;
    const gr=lk(s/c)-10;s=0;c=0;for(let j=0;j<nb;j++){const l=lk(zb[j]);if(l>-70&&l>gr){s+=zb[j];c++;}}
    return c?Math.round(lk(s/c)*10)/10:-70;
  }
  function lufsOf(chs,sr){const g=lufsRun(chs,sr,Infinity);let r;while(!(r=g.next()).done);return r.value;}
  const chans=buf=>Array.from({length:Math.min(2,buf.numberOfChannels)},(_,i)=>buf.getChannelData(i));
  const lufs=buf=>lufsOf(chans(buf),buf.sampleRate);
  async function lufsBg(buf){const g=lufsRun(chans(buf),buf.sampleRate,1<<17);let r;while(!(r=g.next()).done)await sleep(0);return r.value;}

  /* ---------- passages vocaux (estimation) ----------
     Signal ramené vers 11 kHz, filtré 300 Hz à 3,5 kHz (le kick et la basse partent), trames de 46 ms tous
     les 93 ms. Une trame est « chantée » si elle est bien périodique (autocorrélation entre 100 et 700 Hz)
     et si sa hauteur bouge un peu d'une trame à l'autre (vibrato, glissés) : une note de synthé tenue ne
     bouge pas, une batterie n'est pas périodique. Fenêtres de 2 s, zones d'au moins 3 s. */
  function biq(type,f,fs,q=.7071){const w=2*Math.PI*f/fs,c=Math.cos(w),al=Math.sin(w)/(2*q),a0=1+al;
    const b=type==='hp'?[(1+c)/2,-(1+c),(1+c)/2]:[(1-c)/2,1-c,(1-c)/2];return{b:b.map(x=>x/a0),a:[-2*c/a0,(1-al)/a0]};}
  function filt(x,k){const y=new Float32Array(x.length);let x1=0,x2=0,y1=0,y2=0;const{b,a}=k;for(let i=0;i<x.length;i++){const v=x[i],o=b[0]*v+b[1]*x1+b[2]*x2-a[0]*y1-a[1]*y2;x2=x1;x1=v;y2=y1;y1=o;y[i]=o;}return y;}
  async function vocalsOf(buf,gentle){
    const sr=buf.sampleRate,n=buf.length,L=buf.getChannelData(0),R=buf.numberOfChannels>1?buf.getChannelData(1):L;
    const D=Math.max(1,Math.round(sr/11025)),fs=sr/D,m=Math.floor(n/D);if(m<fs*4)return[];
    let x=new Float32Array(m);for(let i=0;i<m;i++){if(gentle&&(i&65535)===65535)await sleep(0);let s=0;for(let j=0;j<D;j++){const k=i*D+j;s+=L[k]+R[k];}x[i]=s/(2*D);}
    for(const k of[biq('hp',300,fs),biq('hp',300,fs),biq('lp',3500,fs)]){if(gentle)await sleep(0);x=filt(x,k);}
    const F=512,HOPV=1024,lo=Math.floor(fs/700),hi=Math.ceil(fs/100),nf=Math.floor((m-F-hi-1)/HOPV);if(nf<8)return[];
    const E=new Float32Array(nf),V=new Float32Array(nf),LAG=new Float32Array(nf);
    for(let f=0;f<nf;f++){const a=f*HOPV;let e=0;for(let i=a;i<a+F;i++)e+=x[i]*x[i];E[f]=e;}
    const Es=[...E].sort((p,q)=>p-q),em=Math.max(Es[Math.floor(nf*.6)]||0,(Es[Math.floor(nf*.95)]||0)*.12);
    for(let f=0;f<nf;f++){
      if(gentle?f%40===39:f%150===149)await sleep(gentle?25:0); // en fond : petites tranches, le fil principal reste libre
      if(E[f]<em*.15||E[f]<1e-6)continue;
      const a=f*HOPV;let best=0,bl=0;const r=new Float32Array(hi+2);
      for(let l=lo-1;l<=hi+1;l++){let s=0,e2=0;for(let i=a;i<a+F;i++){const v=x[i+l];s+=x[i]*v;e2+=v*v;}r[l]=s/Math.sqrt(E[f]*e2+1e-12);}
      for(let l=lo;l<=hi;l++)if(r[l]>best&&r[l]>=r[l-1]&&r[l]>=r[l+1]){best=r[l];bl=l;}
      if(!bl)continue;const y0=r[bl-1],y1=r[bl],y2=r[bl+1],den=y0-2*y1+y2;
      V[f]=best;LAG[f]=bl+(den<0?Math.max(-.5,Math.min(.5,.5*(y0-y2)/den)):0);
    }
    const voiced=f=>V[f]>.55,glide=f=>{if(!voiced(f)||!voiced(f-1))return false;const d=Math.abs(Math.log(LAG[f]/LAG[f-1]));return d>.002&&d<.09;};
    const W=Math.max(3,Math.round(2*fs/HOPV)),on=new Uint8Array(nf);
    for(let f=1;f<nf;f++){
      const a=Math.max(1,f-(W>>1)),z=Math.min(nf-1,f+(W>>1));let act=0,vc=0,gl=0;
      for(let k=a;k<=z;k++){if(E[k]>=em*.15){act++;if(voiced(k))vc++;if(glide(k))gl++;}}
      on[f]=act>=W*.5&&vc>=act*.45&&gl>=act*.25?1:0;
    }
    const T=f=>f*HOPV/fs,out=[];let s=-1;
    for(let f=0;f<=nf;f++){const v=f<nf&&on[f];if(v&&s<0)s=f;if(!v&&s>=0){out.push({start:T(s),end:T(f)});s=-1;}}
    const mg=[];for(const r of out){const l=mg[mg.length-1];if(l&&r.start-l.end<1.5)l.end=r.end;else mg.push({...r});}
    return mg.filter(r=>r.end-r.start>=3).map(r=>({start:+r.start.toFixed(2),end:+r.end.toFixed(2)}));
  }

  /* ---------- file d'analyse (en fond, une à la fois, résultat gardé sous l'empreinte du fichier) ---------- */
  const AV='plus1';
  const akey=t=>t._fp?'fp:'+t._fp:t.path?'p:'+t.path:'k:'+fold(t.artist)+'|'+fold(t.title)+'|'+Math.round(t.duration||0);
  const A={q:[],busy:false,done:0};
  function queue(t,force){if(!t||!t.buffer)return;if(force)t._plusForce=true;if(!A.q.includes(t))A.q.push(t);if(!A.busy)setTimeout(next,250);}
  async function next(){
    if(A.busy)return;const t=A.q.shift();if(!t)return;A.busy=true;
    try{await work(t);}catch(e){console.warn('LibPlus',e);}
    A.busy=false;A.done++;if(A.q.length)setTimeout(next,40);
  }
  async function work(t,o={}){
    const force=o.force||t._plusForce;t._plusForce=false;
    const k=akey(t),c=force?null:await dbGet('ana',k);
    const rec=c&&c.v===AV?c:{v:AV};
    if(force||rec.lufs==null)rec.lufs=await lufsBg(t.buffer);
    if(P.vocals&&(force||!Array.isArray(rec.vocals))){await sleep(0);rec.vocals=await vocalsOf(t.buffer,!o.force);}
    t.lufs=rec.lufs;if(Array.isArray(rec.vocals))t.vocals=rec.vocals;
    dbSet('ana',k,rec);
    decks.forEach(d=>{if(d.track===t){d.applyAutoGain();if(d.ui&&d.ui.ov)d.ui.ov._sig='';if(d.ui&&d.ui.lane)d.ui.lane._sig='';}});
    return rec;
  }
  const add0=window.addTrack;
  window.addTrack=function(buffer,meta){const t=add0(buffer,meta);queue(t);return t;};

  /* gain automatique : RMS (d'origine) ou LUFS, comme ReplayGain */
  const ag0=Deck.prototype.applyAutoGain;
  Deck.prototype.applyAutoGain=function(){
    const t=this.track;
    if(P.agMode==='lufs'&&t&&t.lufs!=null&&t.lufs>-70){const db=S.autoGain?clamp(P.lufsTarget-t.lufs,-12,12):0;this.auto.gain.setTargetAtTime(dbToGain(db),ctx.currentTime,.02);return db;}
    return ag0.call(this);
  };
  const agDb=d=>{const t=d.track;if(!t||!S.autoGain)return 0;return P.agMode==='lufs'&&t.lufs!=null&&t.lufs>-70?clamp(P.lufsTarget-t.lufs,-12,12):clamp(-15-t.rmsDb,-9,9);};

  /* analyse complétée (ce qui manque) ou forcée (tout, sauf la grille si elle est verrouillée) */
  const lockedT=t=>!!(window.DeckPro&&DeckPro.locked&&DeckPro.locked(t));
  async function complete(tracks){
    let n=0;
    for(const t of tracks){
      if(!t||!t.buffer)continue;let did=false;
      if(!t.wf||!t.bpm){const a=analyze(t.buffer,!!t.key);if(!t.wf)t.wf=a.wf;if(!t.bpm&&!lockedT(t)){t.bpm=a.bpm;t.grid=a.grid;}if(t.rmsDb==null)t.rmsDb=a.rmsDb;did=true;}
      if(!t.key){const L=t.buffer.getChannelData(0),R=t.buffer.numberOfChannels>1?t.buffer.getChannelData(1):L,k=detectKey(L,R,t.buffer.sampleRate,t.buffer.length);if(k){t.key=k;did=true;}}
      if(!t.sections&&window.Structure&&!Structure.busy){Structure.queue(t);did=true;}
      if(t.lufs==null||(P.vocals&&!Array.isArray(t.vocals))){await work(t);did=true;}
      if(did){n++;t.ov=null;}
      await sleep(0);
    }
    if(typeof renderTable==='function')renderTable();
    return n;
  }
  async function force(tracks){
    let n=0;
    for(const t of tracks){
      if(!t||!t.buffer)continue;await sleep(0);
      const a=analyze(t.buffer,false),lk=lockedT(t);
      Object.assign(t,{key:a.key||t.key,rmsDb:a.rmsDb,wf:a.wf,ov:null});
      if(!lk){t.bpm=a.bpm;t.grid=a.grid;t._a={bpm:a.bpm,grid:a.grid,key:a.key};delete t.tempoMap;window.Grid&&Grid.saveTrack(t);if(t.cue==null||t.cue<a.grid-1e-3)t.cue=a.grid;}
      if(window.Structure)Structure.queue(t);
      await work(t,{force:true});
      decks.forEach(d=>{if(d.track===t){d.applyAutoGain();window.Grid&&Grid.dirty(t);}});
      n++;
    }
    if(typeof renderTable==='function')renderTable();
    return n;
  }
  function rowItems(t){
    return[{label:'Compléter l’analyse (ce qui manque)',off:!t.buffer,fn:async()=>{const n=await complete([t]);toast(n?'Analyse complétée pour « '+t.title+' »':'Rien ne manque pour « '+t.title+' »','ok');}},
      {label:'Analyse forcée (tout recalculer)'+(lockedT(t)?' · grille gardée':''),off:!t.buffer,fn:async()=>{toast('Analyse de « '+t.title+' »…');await force([t]);toast('« '+t.title+' » : '+t.bpm.toFixed(2)+' BPM · '+(t.lufs!=null?t.lufs.toFixed(1)+' LUFS':''),'ok');}}];
  }

  /* ---------- dessins : vue d'ensemble et waveform ---------- */
  function hookDraw(){
    const St=window.Structure;if(!St||St._lx)return;St._lx=1;
    const ov=St.drawOv,ln=St.drawLane;
    St.drawOv=function(g,tr,W,H){
      const r=ov.apply(this,arguments);if(!tr||!tr.duration)return r;
      if(P.vocals&&tr.vocals&&tr.vocals.length){g.fillStyle=rgba(TK.coach,.6);for(const v of tr.vocals){const x0=v.start/tr.duration*W,x1=v.end/tr.duration*W;g.fillRect(x0,0,Math.max(2,x1-x0),Math.max(2,H*.1));}}
      if(P.minutes){const dpr=window.devicePixelRatio||1,px=60/tr.duration*W;g.fillStyle=rgba(TK['text-hi'],.55);g.font=`600 ${9*dpr}px "JetBrains Mono",monospace`;
        for(let k=1;k*60<tr.duration;k++){const x=Math.round(k*px);g.fillRect(x,H-Math.max(4,H*.22),Math.max(1,dpr),Math.max(4,H*.22));if(px>22*dpr&&H>22*dpr)g.fillText(String(k),x+2*dpr,H-3*dpr);}}
      return r;
    };
    St.drawLane=function(g,d,t0,pps,W,H,dpr){
      const r=ln.apply(this,arguments),tr=d.track;
      if(P.vocals&&tr&&tr.vocals&&tr.vocals.length){g.fillStyle=rgba(TK.coach,.75);const t1=t0+W/pps;for(const v of tr.vocals){if(v.end<t0||v.start>t1)continue;const x0=(v.start-t0)*pps,x1=(v.end-t0)*pps;g.fillRect(x0,H-3*dpr,x1-x0,3*dpr);}}
      return r;
    };
  }

  /* ---------- mini-waveform dans la liste : vignette tirée de la forme déjà calculée ---------- */
  function thumb(t){
    const wf=t.wf;if(!wf||!wf.l||!wf.l.length)return null;
    const key=TK.v+'|'+wf.l.length+'|'+wf.scale;if(t._th&&t._th.k===key)return t._th.u;
    const W=96,H=20,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d'),n=wf.l.length,sc=wf.scale*H*.5*.95;
    [[wf.l,TK['wave-low'],1],[wf.m,TK['wave-mid'],.8],[wf.h,TK['wave-high'],.5]].forEach(([a,col,mul])=>{
      g.fillStyle=col;g.globalAlpha=.9;
      for(let x=0;x<W;x++){const i0=Math.floor(x/W*n),i1=Math.max(i0+1,Math.floor((x+1)/W*n));let m=0;for(let i=i0;i<i1;i++)if(a[i]>m)m=a[i];const hh=m*sc*mul;if(hh>.3)g.fillRect(x,H/2-hh,1,hh*2);}
    });
    let u='';try{u=c.toDataURL();}catch(e){}
    t._th={k:key,u};return u;
  }
  const iD=COLS.findIndex(c=>c.k==='dur');
  COLS.splice(iD<0?COLS.length-1:iD+1,0,{k:'wave',n:'Forme',td:r=>{const u=thumb(r.t);return h('td',{class:'lx-mw'},u?h('img',{src:u,alt:'',draggable:'false'}):'');}},
    {k:'lufs',n:'LUFS',td:r=>h('td',{class:'n',title:r.t.lufs!=null?'Loudness intégrée · gain auto '+(agDb({track:r.t})>=0?'+':'')+agDb({track:r.t}).toFixed(1)+' dB':'Loudness pas encore mesurée'},r.t.lufs!=null?r.t.lufs.toFixed(1):''),sv:t=>t.lufs??-99});
  // LUFS masqué d'office la première fois (il reste dans le menu Colonnes)
  if(window.LibPro&&!store.get('libplus.cols0',false)){LibPro.state.hide.add('lufs');store.set('libcols',[...LibPro.state.hide]);store.set('libplus.cols0',true);}

  /* ---------- dossiers de playlists, sous-crates, couleurs, favoris, tri ---------- */
  const T=Object.assign({folders:[],pl:{},open:{}},store.get('libplus.tree',{}));
  const saveTree=()=>store.set('libplus.tree',T);
  const plMeta=id=>T.pl[id]||(T.pl[id]={});
  const plOf=v=>v&&v.startsWith('pl:')?LIB.playlists.find(p=>p.id===v.slice(3))||null:null;
  const foOf=v=>v&&v.startsWith('fo:')?T.folders.find(f=>f.id===v.slice(3))||null:null;
  const metaOf=v=>v.startsWith('pl:')?plMeta(v.slice(3)):foOf(v)||{};
  const exists=v=>!!(plOf(v)||foOf(v));
  const parentOf=v=>{const p=metaOf(v).parent;return p&&p!==v&&exists(p)?p:null;};
  const coll=new Intl.Collator('fr',{numeric:true,sensitivity:'base'});
  const nameOf=v=>{const p=plOf(v);if(p)return p.name;const f=foOf(v);return f?f.name:'';};
  function kids(pv){
    const fo=T.folders.filter(f=>parentOf('fo:'+f.id)===pv).map(f=>'fo:'+f.id),pls=LIB.playlists.filter(p=>parentOf('pl:'+p.id)===pv).map(p=>'pl:'+p.id);
    if(P.sort==='name')return fo.sort((a,b)=>coll.compare(nameOf(a),nameOf(b))).concat(pls.sort((a,b)=>coll.compare(nameOf(a),nameOf(b))));
    if(P.sort==='count')return fo.concat(pls.sort((a,b)=>plIds(plOf(b)).length-plIds(plOf(a)).length));
    return fo.concat(pls);
  }
  function desc(v,out=[]){for(const k of kids(v)){if(out.includes(k))continue;out.push(k);desc(k,out);}return out;}
  function plIds(p){
    if(!p)return[];if(!P.sub)return p.ids;
    const sub=desc('pl:'+p.id).map(plOf).filter(Boolean);if(!sub.length)return p.ids;
    const s=new Set(p.ids),out=p.ids.slice();for(const q of sub)for(const id of q.ids)if(!s.has(id)){s.add(id);out.push(id);}return out;
  }
  function folderIds(v){const s=new Set(),out=[];for(const k of desc(v)){const p=plOf(k);if(p)for(const id of p.ids)if(!s.has(id)){s.add(id);out.push(id);}}return out;}
  const isOpen=v=>T.open[v]!==false;
  const COLOR=id=>{const c=window.LibPro&&LibPro.COLORS.find(c=>c.id===+id);return c?c.c:null;};
  function setParent(v,pv){
    if(v===pv)return false;
    if(pv&&desc(v).includes(pv)){toast('Impossible : ce groupe est à l’intérieur');return false;}
    const m=metaOf(v);if(pv)m.parent=pv;else delete m.parent;if(pv)T.open[pv]=true;saveTree();renderSide();renderTable();return true;
  }
  const newId=p=>p+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);
  function newFolder(pv,name){const f={id:newId('f'),name:name||'Nouveau groupe'};if(pv)f.parent=pv;T.folders.push(f);if(pv)T.open[pv]=true;saveTree();renderSide();return f;}
  function newPlaylist(pv,name){const p={id:newId('p'),name:name||'Nouvelle crate',ids:[]};LIB.playlists.push(p);if(pv){plMeta(p.id).parent=pv;T.open[pv]=true;}saveTree();renderSide();return p;}
  function deleteFolder(f){
    const v='fo:'+f.id,up=parentOf(v);
    for(const k of kids(v)){const m=metaOf(k);if(up)m.parent=up;else delete m.parent;}
    T.folders=T.folders.filter(x=>x!==f);if(lib.view===v)lib.view='all';saveTree();renderSide();renderTable();
  }
  // petite fenêtre (mêmes classes que celles de la bibliothèque pro)
  let mod=null;
  function closeMod(){if(mod){mod.remove();mod=null;}}
  function modal(title,...body){closeMod();const box=h('div',{class:'mbox lpm lx-m',role:'dialog','aria-label':title},h('h2',{},title,h('button',{class:'b',type:'button',onclick:closeMod},'Fermer')),...body);
    mod=h('div',{class:'modal'},box);mod.addEventListener('mousedown',e=>{if(e.target===mod)closeMod();});document.body.append(mod);return box;}
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mod)closeMod();});
  function rename(v){
    const i=h('input',{class:'in',value:nameOf(v),'aria-label':'Nom'});
    const ok=()=>{const s=i.value.trim();if(s){const p=plOf(v);if(p)p.name=s;else{const f=foOf(v);if(f)f.name=s;}saveTree();renderSide();renderTable();}closeMod();};
    i.addEventListener('keydown',e=>{if(e.key==='Enter')ok();});
    modal(v.startsWith('fo:')?'Renommer le groupe':'Renommer',h('div',{class:'acts'},i,h('button',{type:'button',class:'b pri',onclick:ok},'Renommer')));i.focus();i.select();
  }
  function colorPick(v){
    const m=metaOf(v),row=h('div',{class:'swr lx-sw'});
    const set=id=>{if(id)m.color=id;else delete m.color;saveTree();renderSide();closeMod();};
    row.append(h('button',{type:'button',class:'sw none'+(!m.color?' on':''),title:'Aucune couleur',onclick:()=>set(0)},'×'),...(window.LibPro?LibPro.COLORS:[]).map(c=>h('button',{type:'button',class:'sw'+(m.color===c.id?' on':''),title:c.name,'aria-label':c.name,style:'background:'+c.c,onclick:()=>set(c.id)})));
    modal('Couleur de « '+nameOf(v)+' »',row);
  }
  function moveTo(v){
    const opts=[[null,'Racine (hors de tout groupe)']];
    const walk=(pv,d)=>{for(const k of kids(pv)){if(k===v||desc(v).includes(k))continue;opts.push([k,' '.repeat(d*3)+(k.startsWith('fo:')?'Groupe · ':'')+nameOf(k)]);walk(k,d+1);}};walk(null,0);
    modal('Déplacer « '+nameOf(v)+' »',h('div',{class:'mlist'},opts.map(([k,n])=>h('div',{class:'mrow'},h('div',{},h('b',{},n)),
      h('button',{type:'button',class:'b'+(parentOf(v)===k?' pri':''),onclick:()=>{setParent(v,k);closeMod();}},parentOf(v)===k?'Ici':'Choisir')))));
  }
  const favItem=v=>{const m=metaOf(v);return{label:m.fav?'Retirer des favoris':'Ajouter aux favoris',fn:()=>{if(m.fav)delete m.fav;else m.fav=1;saveTree();renderSide();}};};
  function plItems(p){
    const v='pl:'+p.id;
    return['-',{label:'Nouvelle sous-crate',fn:()=>{const q=newPlaylist(v);rename('pl:'+q.id);}},{label:'Couleur…',fn:()=>colorPick(v)},favItem(v),
      {label:'Déplacer dans…',fn:()=>moveTo(v)},parentOf(v)?{label:'Sortir du groupe',fn:()=>setParent(v,parentOf(parentOf(v)))}:null,
      {label:'Trier les playlists : '+({manual:'ordre manuel',name:'nom',count:'nombre de morceaux'}[P.sort]),fn:()=>{P.sort=P.sort==='manual'?'name':P.sort==='name'?'count':'manual';save();renderSide();toast('Playlists triées : '+({manual:'ordre manuel',name:'par nom',count:'par nombre de morceaux'}[P.sort]),'ok');}}];
  }
  function folderMenu(f,ev){
    const v='fo:'+f.id;
    LibPro.menu(ev,'Groupe · '+f.name,[
      {label:'Nouvelle playlist dans ce groupe',fn:()=>{const q=newPlaylist(v);rename('pl:'+q.id);}},
      {label:'Nouveau sous-groupe',fn:()=>{const g=newFolder(v);rename('fo:'+g.id);}},'-',
      {label:'Renommer…',fn:()=>rename(v)},{label:'Couleur…',fn:()=>colorPick(v)},favItem(v),
      {label:'Déplacer dans…',fn:()=>moveTo(v)},parentOf(v)?{label:'Sortir du groupe',fn:()=>setParent(v,parentOf(parentOf(v)))}:null,'-',
      {label:'Supprimer le groupe (les playlists restent)',cls:'bad',fn:()=>deleteFolder(f)}]);
  }
  // Barre latérale : arbre des dossiers et des playlists (appelé par renderSide, à la place de la liste plate).
  function sidePl(s,it,dropTo){
    const hdr=s.lastElementChild;
    const item=(v,depth,fav)=>{
      const p=plOf(v),f=foOf(v),m=metaOf(v),ks=fav?[]:kids(v),open=isOpen(v);
      const car=h('i',{class:'lx-car'+(ks.length?'':' none'),title:ks.length?(open?'Replier':'Déplier'):null},ks.length?(open?'▾':'▸'):'');
      if(ks.length)car.addEventListener('click',e=>{e.stopPropagation();T.open[v]=!open;saveTree();renderSide();});
      const col=COLOR(m.color),dot=h('i',{class:'lx-dot'+(col?'':' none'),style:col?'background:'+col:null});
      const label=h('em',{class:'lx-n'},p?p.name:f.name);
      const b=it(v,[fav?null:car,dot,label],p?(P.sub?plIds(p).length:p.ids.length):folderIds(v).length,b=>{
        if(p){dropTo(p)(b);window.LibPro&&LibPro.plItem(b,p);}
        else{b.title='Groupe de playlists · clic droit : nouvelle playlist, sous-groupe, renommer, couleur';b.addEventListener('contextmenu',e=>{e.preventDefault();folderMenu(f,e);});b.addEventListener('dblclick',()=>rename(v));}
      });
      b.classList.add('lx-it');if(f)b.classList.add('lx-fo');if(!fav)b.style.paddingLeft=(10+depth*12)+'px';
      b.draggable=true;
      b.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/mixlab-pl',v);e.dataTransfer.effectAllowed='move';});
      b.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('text/mixlab-pl')){e.preventDefault();b.classList.add('drop');}});
      b.addEventListener('dragleave',()=>b.classList.remove('drop'));
      b.addEventListener('drop',e=>{const src=e.dataTransfer.getData('text/mixlab-pl');b.classList.remove('drop');if(!src||src===v)return;e.preventDefault();e.stopPropagation();setParent(src,v);});
      return b;
    };
    const favs=T.folders.filter(f=>f.fav).map(f=>'fo:'+f.id).concat(LIB.playlists.filter(p=>T.pl[p.id]&&T.pl[p.id].fav).map(p=>'pl:'+p.id));
    if(favs.length&&hdr){s.insertBefore(h('div',{class:'sec lbl'},'Favoris'),hdr);favs.forEach(v=>s.insertBefore(item(v,0,true),hdr));}
    const walk=(pv,d)=>{for(const v of kids(pv)){s.append(item(v,d));if(isOpen(v))walk(v,d+1);}};
    walk(null,0);
    // glisser une playlist ici : retour à la racine
    const root=h('button',{class:'it lx-new',type:'button',title:'Nouveau groupe de playlists (glisse une playlist ici pour la sortir de son groupe)',onclick:()=>{const f=newFolder(null);rename('fo:'+f.id);}},'+ Nouveau groupe');
    root.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('text/mixlab-pl'))e.preventDefault();});
    root.addEventListener('drop',e=>{const src=e.dataTransfer.getData('text/mixlab-pl');if(src){e.preventDefault();setParent(src,null);}});
    s.append(root);
    return true;
  }

  /* ---------- lecture des tags Serato (GEOB des MP3, atomes « ---- » des MP4) ---------- */
  function b64(s){s=String(s).replace(/[^A-Za-z0-9+/]/g,'');if(s.length%4===1)s=s.slice(0,-1);while(s.length%4)s+='=';const bin=atob(s),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u;}
  function cstrAt(u,o){let e=o;while(e<u.length&&u[e]!==0)e++;return{s:td(u.subarray(o,e),'utf-8'),next:e+1};}
  function id3Geob(u){
    const out={};if(str(u,0,3)!=='ID3')return out;const ver=u[3],fl=u[5];if(ver<3)return out;
    const end=Math.min(u.length,10+ss32(u,6));let o=10;if(fl&0x40)o+=ver===4?ss32(u,10):be32(u,10)+4;
    while(o+10<=end){
      const id=str(u,o,4);if(!/^[A-Z0-9]{4}$/.test(id))break;const sz=ver===4?ss32(u,o+4):be32(u,o+4);if(sz<=0||o+10+sz>end)break;
      if(id==='GEOB'){
        const a=o+10,b=a+sz,enc=u[a],two=enc===1||enc===2;let p=a+1;
        const cs=w=>{const s=p;if(w){while(p+1<b&&!(u[p]===0&&u[p+1]===0))p+=2;const r=u.subarray(s,p);p+=2;return r;}while(p<b&&u[p]!==0)p++;const r=u.subarray(s,p);p++;return r;};
        cs(false);cs(two);const d=cs(two);const desc=two?td(d,enc===2?'utf-16be':'utf-16'):td(d,enc===3?'utf-8':'latin1');
        out[desc.replace(/\u0000/g,'').trim()]=u.subarray(p,b);
      }
      o+=10+sz;
    }
    return out;
  }
  function mp4Free(u){
    const out={};
    const walk=(a,b,depth)=>{let o=a;while(o+8<=b&&depth<8){let sz=be32(u,o);const t=str(u,o+4,4);let hd=8;if(sz===1){sz=be32(u,o+12);hd=16;}if(sz<hd||o+sz>b)break;
      if(t==='moov'||t==='udta'||t==='ilst')walk(o+hd,o+sz,depth+1);else if(t==='meta')walk(o+hd+4,o+sz,depth+1);
      else if(t==='----'){let name='',data=null,p=o+8;while(p+8<=o+sz){const s2=be32(u,p),t2=str(u,p+4,4);if(s2<8)break;if(t2==='name')name=td(u.subarray(p+12,p+s2),'utf-8');if(t2==='data')data=u.subarray(p+16,p+s2);p+=s2;}if(name&&data)out[name.toLowerCase()]=td(data,'utf-8');}
      o+=sz;}};
    walk(0,u.length,0);return out;
  }
  // charge utile d'un tag MP4 : base64 de « type MIME \0 nom \0 description \0 données »
  function fromMp4(text){const u=b64(text);let o=0;for(let k=0;k<3;k++){const c=cstrAt(u,o);o=c.next;}return u.subarray(o);}
  function parseMarkers2(data){
    if(!data||data.length<3)return null;
    let o=2,e=o;while(e<data.length&&data[e]!==0)e++;
    const u=b64(td(data.subarray(o,e),'latin1'));if(u[0]!==1||u[1]!==1)return null;
    const res={cues:[],loops:[],color:null,bpmLock:false};let p=2;
    while(p<u.length){
      const c=cstrAt(u,p);if(!c.s)break;p=c.next;if(p+4>u.length)break;const len=be32(u,p);p+=4;const d=u.subarray(p,p+len);p+=len;
      const hex=(a)=>'#'+[d[a],d[a+1],d[a+2]].map(x=>(x||0).toString(16).padStart(2,'0')).join('');
      if(c.s==='CUE'&&d.length>=13)res.cues.push({i:d[1],t:be32(d,2)/1000,color:hex(7),name:cstrAt(d,12).s});
      else if(c.s==='LOOP'&&d.length>=20)res.loops.push({i:d[1],start:be32(d,2)/1000,end:be32(d,6)/1000,color:hex(15),locked:!!d[18],name:cstrAt(d,19).s});
      else if(c.s==='COLOR'&&d.length>=4)res.color=hex(1);
      else if(c.s==='BPMLOCK'&&d.length>=1)res.bpmLock=!!d[0];
    }
    return res;
  }
  // grille Serato : repères (position, temps jusqu'au suivant) puis un dernier repère (position, BPM)
  function parseBeatgrid(d){
    if(!d||d.length<14)return null;const n=be32(d,2);if(!n||d.length<6+8*n)return null;
    const dv=new DataView(d.buffer,d.byteOffset,d.byteLength),m=[];
    for(let k=0;k<n;k++){const o=6+8*k,t=dv.getFloat32(o,false);if(k<n-1)m.push({t,beats:dv.getUint32(o+4,false)});else m.push({t,bpm:dv.getFloat32(o+4,false)});}
    for(let k=0;k<n-1;k++)m[k].bpm=60*m[k].beats/Math.max(1e-6,m[k+1].t-m[k].t);
    return m.filter(x=>isFinite(x.t)&&x.bpm>20&&x.bpm<400).map(x=>({t:x.t,bpm:x.bpm}));
  }
  function seratoOf(u){
    if(!u||u.length<16)return null;let m2=null,bg=null;
    if(str(u,0,3)==='ID3'){const g=id3Geob(u);m2=g['Serato Markers2'];bg=g['Serato BeatGrid'];}
    else if(str(u,0,4)==='RIFF'||str(u,0,4)==='FORM'){ // WAV et AIFF : tag ID3 dans un bloc « id3 »
      const le=u[0]===82;let o=12;
      while(o+8<=u.length){const sz=le?(u[o+4]|u[o+5]<<8|u[o+6]<<16|u[o+7]<<24)>>>0:be32(u,o+4);
        if(/^id3 $/i.test(str(u,o,4))){const g=id3Geob(u.subarray(o+8,Math.min(u.length,o+8+sz)));m2=g['Serato Markers2'];bg=g['Serato BeatGrid'];break;}
        o+=8+sz+(sz&1);}
    }
    else if(str(u,4,4)==='ftyp'){const f=mp4Free(u);try{if(f.markersv2)m2=fromMp4(f.markersv2);if(f.beatgrid)bg=fromMp4(f.beatgrid);}catch(e){}}
    const mk=m2?parseMarkers2(m2):null,grid=bg?parseBeatgrid(bg):null;
    if(!mk&&!(grid&&grid.length))return null;
    return{...(mk||{cues:[],loops:[],color:null}),grid};
  }
  const near=hex=>{if(!window.LibPro||!hex)return 0;const rgb=x=>[1,3,5].map(i=>parseInt(x.slice(i,i+2),16));const a=rgb(hex);let best=0,bd=1e9;for(const c of LibPro.COLORS){const b=rgb(c.c),d=(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;if(d<bd){bd=d;best=c.id;}}return best;};
  // Ne remplace rien de ce que tu as déjà posé : hot cues sur les pads vides, boucles et grille seulement si absentes.
  function applySerato(t,s,saved){
    if(!t||!s)return 0;let n=0;
    if(s.color&&!t.color&&s.color!=='#ffffff'&&s.color!=='#000000'){t.color=near(s.color);n++;}
    t.hot=t.hot||Array(8).fill(null);t.hotMeta=t.hotMeta||Array(8).fill(null);
    for(const c of s.cues){if(c.i<8&&t.hot[c.i]==null&&c.t<t.duration){t.hot[c.i]=c.t;t.hotMeta[c.i]=c.name||c.color?{name:c.name||'',color:c.color||null}:null;n++;}}
    if(s.loops.length&&!(t.loops&&t.loops.length)){t.loops=s.loops.filter(l=>l.end>l.start).sort((a,b)=>a.i-b.i).map((l,i)=>({start:l.start,end:l.end,label:l.name||'Boucle '+(i+1)}));n+=t.loops.length;}
    if(s.grid&&s.grid.length&&!saved&&!lockedT(t)){
      if(s.grid.length>1&&window.Grid)Grid.setMap(t,{m:s.grid,off:0});
      else{const g=s.grid[0],beat=60/g.bpm;let x=g.t;while(x-4*beat>=-.05)x-=4*beat;t.bpm=Math.round(g.bpm*100)/100;t.grid=x;delete t.tempoMap;}
      n++;
    }
    if(n){t.ov=null;window.Grid&&Grid.dirty(t);decks.forEach(d=>{if(d.track===t&&typeof renderPads==='function')renderPads(d);});}
    return n;
  }
  if(window.Persist){
    const pre0=Persist.pre,post0=Persist.post;
    Persist.pre=async function(buf,name,o={}){const out=await pre0.apply(this,arguments);try{if(P.serato)out.serato=seratoOf(new Uint8Array(buf));out.saved=!!o.saved;}catch(e){}return out;};
    Persist.post=async function(tr,p){const r=await post0.apply(this,arguments);try{if(p&&p.serato)applySerato(tr,p.serato,p.saved);}catch(e){console.warn('Serato',e);}return r;};
  }

  /* ---------- crates Serato (dossier _Serato_) ---------- */
  function chunks(u,a=0,b=u.length){const out=[];let o=a;while(o+8<=b){const tag=str(u,o,4),len=be32(u,o+4);o+=8;if(o+len>b)break;out.push({tag,a:o,b:o+len});o+=len;}return out;}
  const u16=(u,c)=>td(u.subarray(c.a,c.b),'utf-16be').replace(/\u0000+$/,'');
  function parseCrate(u){const out=[];for(const c of chunks(u))if(c.tag==='otrk')for(const d of chunks(u,c.a,c.b))if(d.tag==='ptrk')out.push(u16(u,d));return out;}
  function parseSeratoDb(u){
    const out=[];const F={pfil:'path',tsng:'title',tart:'artist',talb:'album',tgen:'genre',tbpm:'bpm',tkey:'key',tcom:'comment',tadd:'added'};
    for(const c of chunks(u)){if(c.tag!=='otrk')continue;const r={};for(const d of chunks(u,c.a,c.b)){const k=F[d.tag];if(k)r[k]=u16(u,d);}if(r.path)out.push(r);}
    return out;
  }
  // racine des chemins Serato : le disque qui contient le dossier _Serato_
  function seratoRoot(dir){
    dir=String(dir||'');const w=/^([a-z]:)[\\/]/i.exec(dir);if(w)return w[1]+'\\';
    const v=/^(\/Volumes\/[^/]+)\//.exec(dir);if(v)return v[1]+'/';return dir?'/':'';
  }
  const joinRoot=(root,p)=>{p=String(p).replace(/^[\\/]+/,'');if(!root)return p;return root.endsWith('\\')?root+p.replace(/\//g,'\\'):root+p.replace(/\\/g,'/');};
  // files : [{name, bytes}] (fichiers .crate et « database V2 ») ; dir : chemin du dossier _Serato_ si connu
  function parseSerato(files,dir){
    const root=seratoRoot(dir),recs=[],idx=new Map(),tree=[];
    const dbf=files.find(f=>/^database v2$/i.test(base(f.name)));
    const meta=new Map();if(dbf)for(const r of parseSeratoDb(dbf.bytes))meta.set(fold(r.path.replace(/\\/g,'/')),r);
    const recOf=p=>{const k=fold(String(p).replace(/\\/g,'/'));if(idx.has(k))return idx.get(k);const m=meta.get(k)||{},path=joinRoot(root,p),fn=base(p).replace(/\.[^.]+$/,''),fm=/^(.+?)\s+-\s+(.+)$/.exec(fn);
      const r=newRec({title:m.title||(fm?fm[2]:fn),artist:m.artist||(fm?fm[1]:''),genre:m.genre||'',comment:m.comment||'',bpm:+m.bpm||null,key:m.key&&window.LibPro?LibPro.parseKey(m.key):null,loc:path,path,file:base(p)});
      idx.set(k,recs.length);recs.push(r);return recs.length-1;};
    for(const f of files){
      if(!/\.crate$/i.test(f.name))continue;
      const names=base(f.name).replace(/\.crate$/i,'').split('%%').map(s=>s.trim()).filter(Boolean);
      tree.push({path:names,items:parseCrate(f.bytes).map(recOf)});
    }
    if(!tree.length&&dbf)for(const r of meta.values())recOf(r.path);
    return{kind:'serato',tracks:recs,tree,crates:true};
  }

  /* ---------- Traktor (collection.nml) ---------- */
  const TK_COL={1:2,2:3,3:4,4:5,5:7,6:8,7:1};
  const nmlSys=/^\/:(Users|Applications|Library|private|home|media|mnt|Volumes)\/:/;
  function nmlPath(vol,dir,file){
    const d=String(dir||'').replace(/\/:/g,'/');
    if(/^[a-z]:$/i.test(vol||''))return(vol+d+file).replace(/\//g,'\\');
    if(!vol||nmlSys.test(dir||''))return d+file;
    return'/Volumes/'+vol+d+file;
  }
  function parseNML(text){
    const d=new DOMParser().parseFromString(text,'application/xml');
    if(d.getElementsByTagName('parsererror').length)throw new Error('Ce fichier NML est abîmé ou incomplet.');
    const root=d.documentElement;if(!root||root.nodeName!=='NML')throw new Error('Ce n’est pas une collection Traktor (NML absent).');
    const kid=(e,n)=>[...e.children].find(x=>x.nodeName===n)||null,kids=(e,n)=>[...e.children].filter(x=>x.nodeName===n);
    const recs=[],byKey=new Map();
    const coll=kid(root,'COLLECTION');
    for(const e of coll?kids(coll,'ENTRY'):[]){
      const L=kid(e,'LOCATION');if(!L)continue;const at=(x,n)=>x?x.getAttribute(n)||'':'';
      const vol=at(L,'VOLUME'),dir=at(L,'DIR'),file=at(L,'FILE');if(!file)continue;
      const path=nmlPath(vol,dir,file),I=kid(e,'INFO'),TP=kid(e,'TEMPO'),MK=kid(e,'MUSICAL_KEY');
      const bpm=parseFloat(at(TP,'BPM'))||null,kv=parseInt(at(MK,'VALUE'));
      let key=null;if(isFinite(kv)&&kv>=0&&kv<24)key={pc:kv%12,minor:kv>=12};else if(at(I,'KEY')&&window.LibPro)key=LibPro.parseKey(at(I,'KEY'));
      const r=newRec({title:at(e,'TITLE')||file.replace(/\.[^.]+$/,''),artist:at(e,'ARTIST'),genre:at(I,'GENRE'),comment:at(I,'COMMENT'),bpm,key,
        rating:Math.round((parseInt(at(I,'RANKING'))||0)/51),color:TK_COL[parseInt(at(I,'COLOR'))]||0,plays:parseInt(at(I,'PLAYCOUNT'))||0,
        added:at(I,'IMPORT_DATE')?at(I,'IMPORT_DATE').replace(/\//g,'-'):null,duration:parseFloat(at(I,'PLAYTIME'))||0,loc:path,path,file});
      const grid=[];
      for(const c of kids(e,'CUE_V2')){
        const ty=parseInt(at(c,'TYPE')),t=(parseFloat(at(c,'START'))||0)/1000,len=(parseFloat(at(c,'LEN'))||0)/1000,hc=parseInt(at(c,'HOTCUE')),nm0=at(c,'NAME'),nm=/^n\.n\.$/i.test(nm0)?'':nm0;
        if(!isFinite(t))continue;
        if(ty===4){const g=kid(c,'GRID');grid.push({t,bpm:parseFloat(at(g,'BPM'))||bpm});continue;}
        if(ty===5&&len>0){r.loops.push({start:t,end:t+len,label:nm||'Boucle '+(r.loops.length+1)});if(hc>=0&&hc<8&&r.hot[hc]==null){r.hot[hc]=t;r.hotMeta[hc]=nm?{name:nm,color:null}:null;}continue;}
        if(hc>=0&&hc<8){r.hot[hc]=t;r.hotMeta[hc]=nm?{name:nm,color:null}:null;}
        else if(ty===3)r.cue=t;
        else r.memCues.push({t,label:nm||(ty===1?'Fade in':ty===2?'Fade out':'Cue '+(r.memCues.length+1)),color:'#ffffff'});
      }
      grid.sort((a,b)=>a.t-b.t);
      if(grid.length===1&&grid[0].bpm){const beat=60/grid[0].bpm;let g=grid[0].t;while(g-4*beat>=-.05)g-=4*beat;r.grid=g;r.bpm=r.bpm||grid[0].bpm;}
      else if(grid.length>1){r.tempoMap={m:grid.filter(x=>x.bpm>0),off:0};r.grid=grid[0].t;}
      byKey.set(vol+dir+file,recs.length);recs.push(r);
    }
    const tree=[];
    const walk=(node,path)=>{
      for(const n of kids(node,'NODE')){
        const ty=n.getAttribute('TYPE'),name=n.getAttribute('NAME')||'Playlist';
        if(ty==='FOLDER'){const sub=kid(n,'SUBNODES');if(sub)walk(sub,name==='$ROOT'?path:path.concat(name));}
        else if(ty==='PLAYLIST'){const L=kid(n,'PLAYLIST');const items=L?kids(L,'ENTRY').map(x=>{const k=kid(x,'PRIMARYKEY');return k?byKey.get(k.getAttribute('KEY')):null;}).filter(i=>i!=null):[];tree.push({path:path.concat(name),items,folders:true});}
      }
    };
    const PL=kid(root,'PLAYLISTS');if(PL)walk(PL,[]);
    return{kind:'traktor',tracks:recs,tree};
  }
  const newRec=o=>({title:'',artist:'',genre:'',comment:'',bpm:null,key:null,rating:0,color:0,plays:0,added:null,duration:0,loc:'',path:'',file:'',grid:null,cue:null,
    hot:Array(8).fill(null),hotMeta:Array(8).fill(null),memCues:[],loops:[],...o});

  /* ---------- import avec arborescence (sous-crates Serato, dossiers Traktor) ---------- */
  function ensurePath(path,folders){
    let pv=null,p=null;
    path.forEach((name,i)=>{
      const leaf=i===path.length-1;
      if(folders&&!leaf){let f=T.folders.find(x=>x.name===name&&parentOf('fo:'+x.id)===pv);if(!f){f={id:newId('f'),name};if(pv)f.parent=pv;T.folders.push(f);}pv='fo:'+f.id;return;}
      p=LIB.playlists.find(x=>x.name===name&&parentOf('pl:'+x.id)===pv);
      if(!p){p={id:newId('p'),name,ids:[]};LIB.playlists.push(p);if(pv)plMeta(p.id).parent=pv;}
      pv='pl:'+p.id;
    });
    saveTree();return p;
  }
  async function importTree(res,onStep){
    const rep=await LibPro.importCollection({kind:res.kind,tracks:res.tracks,playlists:[]},onStep);
    const nk=p=>fold(String(p||'').replace(/\\/g,'/'));
    const byPath=new Map(),byFile=new Map();LIB.tracks.forEach(t=>{if(t.path)byPath.set(nk(t.path),t);if(t.file)byFile.set(t.file.toLowerCase(),t);});
    const native=!!(N()&&window.Desktop&&Desktop.native);
    const tracks=res.tracks.map(r=>(r.path&&byPath.get(nk(r.path)))||(!native&&r.file&&byFile.get(String(r.file).toLowerCase()))||null);
    // grilles à plusieurs repères (Traktor) : posées sur les morceaux retrouvés
    res.tracks.forEach((r,i)=>{const t=tracks[i];if(t&&r.tempoMap&&window.Grid&&!lockedT(t))Grid.setMap(t,r.tempoMap);});
    const miss=new Set(rep.missing);rep.tree=[];
    for(const pl of res.tree){
      if(!pl.path.length)continue;const p=ensurePath(pl.path,pl.folders);
      pl.items.forEach(i=>{const t=tracks[i];if(t){if(!p.ids.includes(t.id))p.ids.push(t.id);}else{const r=res.tracks[i];if(miss.has(r))(r.pls=r.pls||[]).push(p.id);}});
      rep.tree.push(pl.path.join(' › '));
    }
    rep.found=tracks.filter(Boolean).length;
    renderSide();renderTable();window.LibPro&&LibPro.saveBrowser&&LibPro.saveBrowser();
    return rep;
  }
  // encart de la fenêtre Import / export (library-pro.js)
  function importBox(){
    const out=h('div',{class:'lx-xo'}),inv=INV(),n=N();
    const report=(what,rep)=>{out.innerHTML='';
      out.append(h('p',{class:'ok'},what+' : '+pl(rep.total,'morceau','morceaux')+' lus · '+pl(rep.found,'retrouvé')+(rep.tree.length?' · '+pl(rep.tree.length,'playlist'):'')));
      if(rep.missing.length)out.append(h('p',{class:'warn'},rep.missing.length+' introuvable'+(rep.missing.length>1?'s':'')+(n?' : voir « Fichiers manquants ».':' : importe d’abord les fichiers audio (même nom), puis relance l’import.')));};
    const run=async(what,fn)=>{out.innerHTML='';out.append(h('p',{class:'hint'},'Import en cours…'));
      try{const res=await fn();if(!res)return out.innerHTML='';if(!res.tracks.length){out.innerHTML='';out.append(h('p',{class:'warn'},'Aucun morceau trouvé.'));return;}
        report(what,await importTree(res,(i,nb)=>{out.firstChild&&(out.firstChild.textContent='Import en cours : '+i+' / '+nb);}));}
      catch(e){out.innerHTML='';out.append(h('p',{class:'warn'},e.message||String(e)));}};
    const sBtn=inv?h('button',{type:'button',class:'b pri',onclick:()=>run('Serato',async()=>{const r=await inv('serato_read');if(!r)return null;return parseSerato(r.files.map(f=>({name:f.name,bytes:b64(f.data)})),r.dir);})},'Crates Serato…')
      :h('label',{class:'b pri filebtn'},'Crates Serato…',h('input',{type:'file',webkitdirectory:true,multiple:true,onchange:async e=>{const fs=[...e.target.files].filter(f=>/\.crate$/i.test(f.name)||/^database v2$/i.test(f.name));e.target.value='';
        run('Serato',async()=>{if(!fs.length)throw new Error('Aucune crate dans ce dossier : choisis le dossier _Serato_.');return parseSerato(await Promise.all(fs.map(async f=>({name:f.name,bytes:new Uint8Array(await f.arrayBuffer())}))),'');});}}));
    const tBtn=n&&n.pickLibraryFile&&inv?h('button',{type:'button',class:'b pri',onclick:()=>run('Traktor',async()=>{const f=await n.pickLibraryFile();return f?parseNML(f.text):null;})},'collection.nml…')
      :h('label',{class:'b pri filebtn'},'collection.nml…',h('input',{type:'file',accept:'.nml,.xml',onchange:async e=>{const f=e.target.files[0];e.target.value='';if(f)run('Traktor',async()=>parseNML(await f.text()));}}));
    return h('div',{},h('h3',{},'Serato et Traktor'),
      h('p',{},'Serato : choisis le dossier _Serato_ (dans Musique, ou à la racine du disque). Crates et sous-crates deviennent des playlists imbriquées ; cues, boucles, couleur et grille sont lus dans les tags des MP3 et MP4 à leur chargement. Traktor : choisis collection.nml (Documents › Native Instruments). Cues, boucles, grille (même à plusieurs repères) et playlists dans leurs groupes.'),
      h('div',{class:'acts'},sBtn,tBtn),out);
  }

  /* ---------- dossiers : explorateur et surveillance ----------
     Appli : les dossiers sont choisis dans le dialogue du système et gardés côté Rust (src-tauri/src/watch.rs),
     qui seul peut les relire. Navigateur : File System Access (Chrome, Edge) ; ailleurs, un dossier choisi
     reste consultable pendant la session, sans surveillance. */
  const FS={roots:[],cur:null,scanning:false,seen:new Set(),last:0,native:false,ready:false,err:''};
  const isAud=n=>typeof AUDIO_RE!=='undefined'&&AUDIO_RE.test(n||'');
  async function loadRoots(){
    const inv=INV();
    if(inv){FS.native=true;try{FS.roots=(await inv('folders_list')).map(r=>({id:r.path,name:base(r.path)||r.path,path:r.path,watch:!!r.watch,kind:'native'}));}catch(e){FS.err=String(e);}}
    else{const rs=await dbGet('kv','roots');if(Array.isArray(rs))FS.roots=rs.filter(r=>r&&r.handle).map(r=>({...r,kind:'fsa'}));}
    FS.ready=true;
  }
  async function saveRoots(){if(FS.native)return;try{await dbSet('kv','roots',FS.roots.filter(r=>r.kind==='fsa').map(r=>({id:r.id,name:r.name,handle:r.handle,watch:!!r.watch})));}catch(e){}}
  async function perm(r,ask){
    if(r.kind!=='fsa')return true;const h0=r.handle;if(!h0)return false;
    try{if(!h0.queryPermission)return true;if((await h0.queryPermission({mode:'read'}))==='granted')return true;if(ask&&h0.requestPermission)return(await h0.requestPermission({mode:'read'}))==='granted';}catch(e){}
    return false;
  }
  async function addRoot(watch){
    const inv=INV();
    if(inv){const L=await inv('folders_add',{watch:!!watch});await loadRoots();if(watch)scan(true);return L;}
    if(window.showDirectoryPicker){let hd;try{hd=await showDirectoryPicker({mode:'read'});}catch(e){return null;}
      const r={id:newId('r'),name:hd.name,handle:hd,watch:!!watch,kind:'fsa'};FS.roots.push(r);await saveRoots();FS.cur={root:r,path:[]};if(watch)scan(true);return r;}
    return null;
  }
  // sans File System Access : un dossier choisi par <input webkitdirectory>, gardé le temps de la session
  function addListRoot(files){
    const fs=[...files].filter(f=>isAud(f.name));if(!fs.length){toast('Aucun fichier audio dans ce dossier');return null;}
    const top=(fs[0].webkitRelativePath||fs[0].name).split('/')[0]||'Dossier';
    const r={id:newId('r'),name:top,files:fs,watch:false,kind:'list'};FS.roots.push(r);FS.cur={root:r,path:[]};return r;
  }
  async function removeRoot(r){
    if(r.kind==='native'){await INV()('folders_remove',{path:r.path});await loadRoots();}
    else{FS.roots=FS.roots.filter(x=>x!==r);await saveRoots();}
    if(FS.cur&&FS.cur.root===r)FS.cur=null;
  }
  async function setWatch(r,on){
    if(r.kind==='native'){await INV()('folders_set_watch',{path:r.path,watch:!!on});await loadRoots();}
    else{r.watch=!!on;await saveRoots();}
    if(on)scan(true);
  }
  // contenu d'un dossier : {dirs:[{name,ref}], files:[{name,ref}]}
  async function listDir(cur){
    const r=cur.root;
    if(r.kind==='native'){const p=cur.path.length?cur.path[cur.path.length-1].ref:r.path;const L=await INV()('folder_read',{path:p});return{dirs:L.dirs.map(d=>({name:d.name,ref:d.path})),files:L.files.map(f=>({name:f.name,ref:f.path}))};}
    if(r.kind==='list'){
      const pre=cur.path.map(x=>x.name).join('/'),depth=cur.path.length+1,dirs=new Set(),files=[];
      for(const f of r.files){const parts=(f.webkitRelativePath||r.name+'/'+f.name).split('/').slice(1);const inner=parts.slice(0,-1).join('/');
        if(cur.path.length&&!(inner===pre||inner.startsWith(pre+'/')))continue;
        if(parts.length===depth)files.push({name:f.name,ref:f});else if(parts.length>depth)dirs.add(parts[depth-1]);}
      return{dirs:[...dirs].sort(coll.compare).map(n=>({name:n,ref:n})),files:files.sort((a,b)=>coll.compare(a.name,b.name))};
    }
    const hd=cur.path.length?cur.path[cur.path.length-1].ref:r.handle,dirs=[],files=[];
    for await(const e of hd.values()){if(e.name.startsWith('.'))continue;if(e.kind==='directory')dirs.push({name:e.name,ref:e});else if(e.kind==='file'&&isAud(e.name))files.push({name:e.name,ref:e});}
    dirs.sort((a,b)=>coll.compare(a.name,b.name));files.sort((a,b)=>coll.compare(a.name,b.name));return{dirs,files};
  }
  async function walkFsa(hd,out,depth,rel=''){
    if(depth>8||out.length>5000)return;
    for await(const e of hd.values()){if(e.name.startsWith('.'))continue;if(e.kind==='directory')await walkFsa(e,out,depth+1,rel+e.name+'/');else if(e.kind==='file'&&isAud(e.name))out.push({name:e.name,rel:rel+e.name,h:e});}
  }
  const asFile=async(r,f)=>r.kind==='native'?{name:f.name,type:'',path:f.ref,arrayBuffer:()=>N().readFile(f.ref)}:r.kind==='list'?f.ref:await f.ref.getFile();
  const inLib=(r,f)=>r.kind==='native'?LIB.tracks.some(t=>t.path===f.ref):LIB.tracks.some(t=>t.file&&t.file.toLowerCase()===f.name.toLowerCase());
  // Surveillance : les fichiers audio pas encore dans la bibliothèque sont importés (et un morceau
  // de la session précédente retrouve ses cues et ses playlists).
  async function scan(manual){
    if(FS.scanning||!FS.ready)return 0;FS.scanning=true;FS.last=Date.now();let n=0;
    try{
      const inv=INV();
      if(inv){
        if(!FS.roots.some(r=>r.watch))return 0;
        const known=LIB.tracks.filter(t=>t.path).map(t=>t.path).concat(window.Desktop?Desktop.missing.map(m=>m.path):[]);
        const fs=(await inv('folders_scan',{known})).filter(f=>!FS.seen.has(f.path));
        if(fs.length){fs.forEach(f=>FS.seen.add(f.path));n=fs.length;await importFiles(fs.map(f=>({name:f.name,type:'',path:f.path,arrayBuffer:()=>N().readFile(f.path)})),null);}
      }else{
        for(const r of FS.roots){
          if(!r.watch||r.kind!=='fsa'||!(await perm(r,false)))continue;
          const all=[];await walkFsa(r.handle,all,0);
          const have=new Set(LIB.tracks.map(t=>(t.file||'').toLowerCase()));
          const nw=all.filter(f=>!have.has(f.name.toLowerCase())&&!FS.seen.has(r.id+'/'+f.rel)).slice(0,200);
          if(!nw.length)continue;nw.forEach(f=>FS.seen.add(r.id+'/'+f.rel));n+=nw.length;
          const files=[];for(const f of nw){try{files.push(await f.h.getFile());}catch(e){}}
          await importFiles(files,null);
        }
      }
    }catch(e){console.warn('Dossiers surveillés',e);}
    finally{FS.scanning=false;}
    if(n)toast(pl(n,'nouveau morceau','nouveaux morceaux')+' depuis les dossiers surveillés','ok');
    else if(manual)toast('Dossiers surveillés à jour');
    if(lib.view==='files')drawFiles();
    renderSide();
    return n;
  }
  setInterval(()=>{if(FS.ready&&!FS.scanning&&FS.roots.some(r=>r.watch)&&Date.now()-FS.last>=P.watchSec*1000)scan(false);},1000);
  const needPerm=()=>FS.roots.filter(r=>r.kind==='fsa'&&r._perm===false);

  // panneau « Explorer les dossiers » : remplace la table dans la bibliothèque
  let fsSeq=0;
  async function drawFiles(){
    const main=lib.tw&&lib.tw.parentElement;if(!main)return;
    let el=$('#lx-files');if(!el){el=h('div',{id:'lx-files',class:'lx-files'});main.append(el);}
    el.hidden=false;lib.tw.hidden=true;const seq=++fsSeq;
    for(const r of FS.roots)if(r.kind==='fsa')r._perm=await perm(r,false);
    const fsa=!!window.showDirectoryPicker,inv=INV();
    const head=h('div',{class:'acts lx-fh'},
      inv||fsa?h('button',{type:'button',class:'b pri',onclick:async()=>{await addRoot(false);drawFiles();renderSide();}},'Ajouter un dossier…')
        :h('label',{class:'b pri filebtn'},'Ouvrir un dossier…',h('input',{type:'file',webkitdirectory:true,multiple:true,onchange:e=>{addListRoot(e.target.files);e.target.value='';drawFiles();renderSide();}})),
      inv||fsa?h('button',{type:'button',class:'b',title:'Les fichiers audio ajoutés dans ce dossier entrent tout seuls dans la bibliothèque',onclick:async()=>{await addRoot(true);drawFiles();renderSide();}},'Surveiller un dossier…'):null,
      FS.roots.some(r=>r.watch)?h('button',{type:'button',class:'b',onclick:()=>scan(true)},'Vérifier maintenant'):null,
      h('span',{class:'spacer'}),
      !inv&&!fsa?h('span',{class:'hint'},'Ce navigateur ne garde pas l’accès aux dossiers : pas de surveillance. Avec Chrome, Edge ou l’appli, si.'):null);
    const roots=h('div',{class:'lx-roots'},FS.roots.map(r=>h('div',{class:'lx-root'+(FS.cur&&FS.cur.root===r?' on':'')},
      h('button',{type:'button',class:'b lx-rn',title:r.path||r.name,onclick:()=>{FS.cur={root:r,path:[]};drawFiles();}},r.name),
      r.kind!=='list'?h('label',{class:'lx-w',title:'Importer tout seul ce qui arrive dans ce dossier'},h('input',{type:'checkbox',checked:r.watch||null,onchange:async e=>{await setWatch(r,e.target.checked);drawFiles();renderSide();}}),'Surveiller'):null,
      r._perm===false?h('button',{type:'button',class:'b warn',onclick:async()=>{r._perm=await perm(r,true);if(r._perm&&r.watch)scan(true);drawFiles();renderSide();}},'Réactiver l’accès'):null,
      h('button',{type:'button',class:'b',title:'Retirer ce dossier (les morceaux restent dans la bibliothèque)','aria-label':'Retirer '+r.name,onclick:async()=>{await removeRoot(r);drawFiles();renderSide();}},'×'))));
    const body=h('div',{class:'lx-fl'});
    el.innerHTML='';el.append(head,roots,body);
    if(!FS.roots.length){body.append(h('p',{class:'hint'},'Ajoute un dossier de musique pour le parcourir comme dans l’explorateur, charger un morceau sans l’importer d’abord, ou le surveiller : chaque nouveau fichier audio entre dans la bibliothèque.'));return;}
    if(!FS.cur||!FS.roots.includes(FS.cur.root))FS.cur={root:FS.roots[0],path:[]};
    const cur=FS.cur,r=cur.root;
    if(r._perm===false){body.append(h('p',{class:'warn'},'Le navigateur demande ton accord pour relire ce dossier : bouton « Réactiver l’accès ».'));return;}
    const crumbs=h('div',{class:'lx-cr'},h('button',{type:'button',class:'b',onclick:()=>{cur.path=[];drawFiles();}},r.name),cur.path.map((p,i)=>[h('i',{},'›'),h('button',{type:'button',class:'b',onclick:()=>{cur.path=cur.path.slice(0,i+1);drawFiles();}},p.name)]));
    body.append(crumbs,h('p',{class:'hint'},'Lecture du dossier…'));
    let L;try{L=await listDir(cur);}catch(e){if(seq===fsSeq){body.lastChild.textContent='Impossible de lire ce dossier : '+(e.message||e);}return;}
    if(seq!==fsSeq)return;body.lastChild.remove();
    const act=decks.filter(d=>d.active);
    const list=h('div',{class:'lx-ls'});
    L.dirs.forEach(dd=>list.append(h('div',{class:'lx-row dir'},h('button',{type:'button',class:'lx-dn',onclick:()=>{cur.path=cur.path.concat({name:dd.name,ref:dd.ref});drawFiles();}},h('i',{},'▸'),dd.name))));
    L.files.forEach(f=>{const ok=inLib(r,f);list.append(h('div',{class:'lx-row'+(ok?' in':'')},h('span',{class:'lx-fn',title:f.name},f.name),ok?h('span',{class:'lx-ok'},'Dans la bibliothèque'):null,
      h('span',{class:'lx-acts'},ok?null:h('button',{type:'button',class:'b',onclick:async()=>{await importFiles([await asFile(r,f)],null);drawFiles();}},'Importer'),
        act.map(d=>h('button',{type:'button',class:'b ld',style:'color:'+COL[d.id],title:'Charger sur la platine '+d.id,onclick:async()=>{const t=LIB.tracks.find(t=>r.kind==='native'?t.path===f.ref:t.file&&t.file.toLowerCase()===f.name.toLowerCase());if(t){loadTo(d,t);return;}await importFiles([await asFile(r,f)],d);drawFiles();}},d.id)))));});
    if(!L.dirs.length&&!L.files.length)list.append(h('p',{class:'hint'},'Pas de fichier audio ici.'));
    const todo=L.files.filter(f=>!inLib(r,f));
    if(todo.length)body.append(h('div',{class:'acts'},h('button',{type:'button',class:'b',onclick:async()=>{const fs=[];for(const f of todo)fs.push(await asFile(r,f));await importFiles(fs,null);drawFiles();}},'Importer les '+pl(todo.length,'fichier')+' de ce dossier')));
    body.append(list);
    if(lib.count)lib.count.textContent=pl(L.files.length,'fichier');
  }

  /* ---------- branchements dans la bibliothèque ---------- */
  if(window.LibPro){
    const L=LibPro,side0=L.side,owns0=L.owns,vt0=L.viewTracks,em0=L.empty;
    L.owns=v=>v.startsWith('fo:')||v==='files'||owns0(v);
    L.viewTracks=v=>v.startsWith('fo:')?(m=>folderIds(v).map(id=>m.get(id)).filter(Boolean))(new Map(LIB.tracks.map(t=>[t.id,t]))):v==='files'?[]:vt0(v);
    L.empty=v=>v.startsWith('fo:')?'Groupe vide : clic droit sur une playlist › Déplacer dans…, ou glisse-la sur le groupe.':em0(v);
    L.side=(s,it,where)=>{
      side0(s,it,where);
      if(where!=='end')return;
      const np=FS.roots.filter(r=>r._perm===false).length,nw=FS.roots.filter(r=>r.watch).length;
      s.append(h('div',{class:'sec lbl'},'Dossiers'),it('files','Fichiers',FS.roots.length||null,b=>{b.title=nw?pl(nw,'dossier surveillé','dossiers surveillés'):'Parcourir tes dossiers de musique, en surveiller';if(np)b.classList.add('warn');}));
      s.append(h('button',{class:'it',type:'button',title:'Calcule ce qui manque (tonalité, structure, loudness, voix) pour les morceaux affichés',onclick:async()=>{const ts=lib.view==='files'?LIB.tracks:lib.rows.map(r=>r.t);toast('Analyse de '+pl(ts.length,'morceau','morceaux')+'…');const n=await complete(ts);toast(n?pl(n,'morceau complété','morceaux complétés'):'Rien ne manque','ok');}},'Compléter l’analyse'));
    };
    const rt0=window.renderTable;
    window.renderTable=function(){
      const on=lib.view==='files',el=$('#lx-files');
      if(lib.tw)lib.tw.hidden=on;if(el)el.hidden=!on;
      if(on){drawFiles();return;}
      return rt0.apply(this,arguments);
    };
  }

  /* ---------- charge de l'interface et de l'audio ----------
     Part du temps que le fil principal passe à dessiner, plus le retard des minuteries (le temps bloqué
     par autre chose : analyse, import). Côté audio, le navigateur ne donne la charge du moteur que
     rarement : on montre les décrochages s'il les compte (playoutStats), sinon la latence de sortie. */
  const LM={work:0,lag:0,t:performance.now(),pct:0,g0:null,gl:0,el:null};
  const fr0=window.frame;
  if(typeof fr0==='function')window.frame=function(){const a=performance.now();try{return fr0.apply(this,arguments);}finally{LM.work+=performance.now()-a;}};
  let lt=performance.now();
  setInterval(()=>{const n=performance.now();LM.lag+=Math.max(0,n-lt-100-4);lt=n;},100);
  function loadTick(){
    const n=performance.now(),dt=n-LM.t;if(dt<900)return;
    LM.pct=clamp(Math.round((LM.work+LM.lag)/dt*100),0,100);LM.work=0;LM.lag=0;LM.t=n;
    const ps=ctx.playoutStats;let gl=null;if(ps&&typeof ps.fallbackFramesEvents==='number'){if(LM.g0==null)LM.g0=ps.fallbackFramesEvents;gl=ps.fallbackFramesEvents-LM.g0;}
    const top=$('#top');if(!top)return;
    let el=$('#load-ind');
    if(!P.load){if(el)el.remove();return;}
    if(!el){el=h('span',{class:'tb lx-load',id:'load-ind'});const ref=$('#clock',top)||$('#audio-note',top);if(ref)ref.before(el);else top.append(el);}
    const glN=gl||0,bad=LM.pct>=80||glN>LM.gl,warn=LM.pct>=50;LM.gl=glN;
    const txt='Charge '+LM.pct+' %';if(!el.firstChild)el.append(txt);else if(el.firstChild.data!==txt)el.firstChild.data=txt; // texte modifié sur place : pas de nœud ajouté
    el.classList.toggle('bad',bad);el.classList.toggle('warn',!bad&&warn);
    el.title='Interface : '+LM.pct+' % du temps (dessin et calculs)'+(gl!=null?' · décrochages audio depuis le démarrage : '+glN:'')+' · latence de sortie '+Math.round(((ctx.baseLatency||0)+(ctx.outputLatency||0))*1000)+' ms · '+ctx.sampleRate+' Hz';
  }
  setInterval(loadTick,1000);

  /* ---------- réglages ---------- */
  const DESC=[
    {tab:'Analyse',key:'plus.agMode',label:'Gain automatique',type:'select',options:[['rms','Volume moyen (RMS)'],['lufs','Loudness LUFS, façon ReplayGain']],get:()=>P.agMode,set:v=>{P.agMode=v;save();decks.forEach(d=>d.applyAutoGain());}},
    {tab:'Analyse',key:'plus.lufsTarget',label:'Niveau visé',type:'select',options:[[-14,'-14 LUFS (plateformes de streaming)'],[-18,'-18 LUFS (ReplayGain 2)'],[-11,'-11 LUFS (club, fort)']],get:()=>P.lufsTarget,set:v=>{P.lufsTarget=+v;save();decks.forEach(d=>d.applyAutoGain());}},
    {tab:'Analyse',key:'plus.vocals',label:'Repérer les passages vocaux',type:'bool',get:()=>P.vocals,set:v=>{P.vocals=!!v;save();LIB.tracks.forEach(t=>{t.ov=null;});decks.forEach(d=>{if(d.ui.ov)d.ui.ov._sig='';});if(v)LIB.tracks.forEach(t=>{if(!t.vocals)queue(t);});}},
    {tab:'Affichage',key:'plus.minutes',label:'Repères de minutes sur la vue d’ensemble',type:'bool',get:()=>P.minutes,set:v=>{P.minutes=!!v;save();decks.forEach(d=>{if(d.ui.ov)d.ui.ov._sig='';});}},
    {tab:'Affichage',key:'plus.load',label:'Indicateur de charge dans la barre du haut',type:'bool',get:()=>P.load,set:v=>{P.load=!!v;save();}},
    {tab:'Bibliothèque',key:'plus.serato',label:'Lire les cues Serato des fichiers (MP3, MP4)',type:'bool',get:()=>P.serato,set:v=>{P.serato=!!v;save();}},
    {tab:'Bibliothèque',key:'plus.sub',label:'Une crate montre aussi les morceaux de ses sous-crates',type:'bool',get:()=>P.sub,set:v=>{P.sub=!!v;save();renderSide();renderTable();}},
    {tab:'Bibliothèque',key:'plus.sort',label:'Ordre des playlists',type:'select',options:[['manual','Manuel'],['name','Par nom'],['count','Par nombre de morceaux']],get:()=>P.sort,set:v=>{P.sort=v;save();renderSide();}},
    {tab:'Bibliothèque',key:'plus.watchSec',label:'Dossiers surveillés : vérifier toutes les',type:'select',options:[[10,'10 secondes'],[30,'30 secondes'],[120,'2 minutes'],[600,'10 minutes']],get:()=>P.watchSec,set:v=>{P.watchSec=+v;save();}},
  ];
  window.MixlabSettings=(window.MixlabSettings||[]).concat(DESC);
  // Fenêtre de secours tant que la fenêtre Préférences n'existe pas : tous les réglages de grid.js et d'ici.
  function settingsModal(){
    const all=(window.MixlabSettings||[]).filter(d=>/^(plus|grid)\./.test(d.key)),tabs=[...new Set(all.map(d=>d.tab))];
    const field=d=>{let i;const v=d.get();
      if(d.type==='bool'){i=h('input',{type:'checkbox'});i.checked=!!v;i.addEventListener('change',()=>d.set(i.checked));return h('label',{class:'lx-f lx-fb'},i,d.label);}
      if(d.type==='select'){i=h('select',{class:'sel'},d.options.map(([k,n])=>h('option',{value:k},n)));i.value=String(v);i.addEventListener('change',()=>d.set(i.value));}
      else{i=h('input',{class:'in',type:'number',value:v,step:'0.01'});i.addEventListener('change',()=>d.set(+i.value));}
      return h('label',{class:'lx-f'},h('span',{},d.label),i);};
    modal('Bibliothèque et analyse',h('div',{class:'mgrid'},tabs.map(t=>h('div',{},h('h3',{},t),all.filter(d=>d.tab===t).map(field)))));
  }
  function attach(){
    const pop=$('#panels-pop');
    if(pop&&!$('#lx-open',pop))pop.append(h('button',{class:'b',id:'lx-open',type:'button',style:'height:26px',title:'Gain auto en LUFS, voix, repères de minutes, cues Serato, sous-crates, dossiers surveillés, grille',onclick:settingsModal},'Bibliothèque et analyse…'));
    hookDraw();
  }
  setInterval(attach,700);setTimeout(attach,50);

  document.head.append(h('style',{},`
.side button.it .lx-car{font-style:normal;width:10px;flex:none;color:var(--text-lo);font-size:var(--fs-1);text-align:center}
.side button.it .lx-dot{width:8px;height:8px;border-radius:50%;flex:none}
.side button.it .lx-dot.none{display:none}
.side button.it .lx-n{font-style:normal;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side button.it.lx-fo .lx-n{color:var(--text-hi);font-weight:600}
.side button.lx-new{color:var(--text-lo)}
.lt td.lx-mw{padding-top:0;padding-bottom:0}
.lt td.lx-mw img{display:block;width:72px;height:15px;opacity:.9}
.lt th.c-wave{width:80px}
.lx-files{display:grid;grid-template-rows:auto auto minmax(0,1fr);min-height:0;overflow:hidden;padding:6px 10px;gap:6px;font:400 var(--fs-2) var(--ui);color:var(--text-mid)}
.lx-files .acts{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.lx-files .hint{margin:0;color:var(--text-lo);font-size:var(--fs-1)}
.lx-files .warn{color:var(--state-warn)}
.lx-roots{display:flex;gap:6px;flex-wrap:wrap}
.lx-root{display:flex;gap:4px;align-items:center;border:1px solid var(--line-2);border-radius:var(--r-2);padding:2px 4px}
.lx-root.on{border-color:var(--text-lo)}
.lx-root .lx-w{display:flex;gap:4px;align-items:center;font-size:var(--fs-1);color:var(--text-lo)}
.lx-fl{overflow:auto;min-height:0;display:grid;align-content:start;gap:4px}
.lx-cr{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.lx-cr i{font-style:normal;color:var(--text-lo)}
.lx-ls{display:grid;align-content:start}
.lx-row{display:flex;align-items:center;gap:8px;padding:3px 4px;border-bottom:1px solid var(--line-1);min-width:0}
.lx-row .lx-fn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lx-row.in .lx-fn{color:var(--text-lo)}
.lx-row .lx-ok{font-size:var(--fs-1);color:var(--state-ok)}
.lx-row .lx-acts{display:flex;gap:4px}
.lx-dn{background:none;border:0;color:var(--text-hi);cursor:pointer;display:flex;gap:6px;align-items:center;font:inherit;padding:0}.lx-dn i{font-style:normal;color:var(--text-lo)}
#load-ind{cursor:default;font-family:var(--num);text-transform:none;letter-spacing:0}
#load-ind.warn{color:var(--state-warn)}#load-ind.bad{color:var(--state-bad)}
.lx-m .lx-f{display:grid;gap:4px;margin:0 0 10px;font-size:var(--fs-2);color:var(--text-lo)}
.lx-m .lx-fb{display:flex;gap:6px;align-items:center;color:var(--text-mid)}
.lx-m .lx-sw{display:flex;gap:6px;flex-wrap:wrap}
.lpm .lx-xo{margin-top:12px;border-top:1px solid var(--ln);padding-top:6px}.lpm .lx-xo:empty{display:none}
`));

  db();loadRoots().then(()=>{renderSide();if(FS.roots.some(r=>r.watch))setTimeout(()=>scan(false),3000);});

  return{P,lufs,lufsOf,kCoefs,vocalsOf,queue,work,complete,force,rowItems,thumb,agDb,
    tree:T,sidePl,plIds,plItems,folderIds,kids,newFolder,newPlaylist,setParent,deleteFolder,
    serato:{parse:seratoOf,markers2:parseMarkers2,beatgrid:parseBeatgrid,id3Geob,mp4Free,crate:parseCrate,db:parseSeratoDb,dir:parseSerato,root:seratoRoot,apply:applySerato},
    parseNML,nmlPath,importTree,importBox,b64,
    fs:FS,addRoot,addListRoot,removeRoot,setWatch,scan,listDir,drawFiles,loadRoots,
    load:LM,settingsModal,DESC};
})();
