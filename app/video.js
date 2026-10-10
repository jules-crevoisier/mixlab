'use strict';
/* =====================================================================
   Mixlab · vidéo, paroles et karaoké
   - Clips vidéo sur les platines : le son est décodé comme un morceau,
     l'image suit la position de la platine (pitch, boucles, scratch).
   - Sortie vidéo : une fenêtre à poser sur le second écran, avec le mix
     des images des platines selon les faders et le crossfader (fondu,
     coupe ou volet), un visualiseur réactif au son quand il n'y a pas de
     vidéo, un message texte et un logo par-dessus.
   - Paroles synchronisées : fichier .lrc à côté du morceau (ou importé
     avec), tags SYLT et USLT (MP3), LYRICS (FLAC, Ogg), ©lyr (MP4).
     Affichées sur la platine et sur la sortie vidéo.
   - Karaoké : file de chanteurs, transposition par chanteur, paroles en
     grand qui se remplissent. Les disques CD+G ne sont pas lus.
   ===================================================================== */
window.Video=(()=>{
  const VEXT=/\.(mp4|m4v|webm|mov|mkv)$/i;
  const DEF={transition:'fade',viz:'bars',deckThumb:true,lyricsDeck:true,lyricsOut:true,text:'',textOn:false,textScroll:false,logoPos:'tr',karaoke:false};
  const cfg={...DEF,...store.get('video',{})};
  const save=()=>store.set('video',cfg);
  const W=1280,H=720;
  const V={media:{},win:null,stream:null,plan:null,force:false,lastFrame:0,lastRender:0,logo:null,karaoke:{queue:store.get('karaoke',[]),current:null,deck:null}};

  /* ---------- paroles ---------- */
  const TAG=/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  const tsec=(m,s,f)=>(+m)*60+(+s)+(f?(+f)/Math.pow(10,f.length):0);
  /* Fichier LRC : plusieurs temps par ligne, [offset:±ms], métadonnées, temps par mot (<mm:ss.xx>).
     Sans aucun temps : paroles non synchronisées, réparties sur la durée du morceau. */
  function parse(text,duration){
    const meta={},lines=[];let offset=0;
    for(const raw of String(text||'').replace(/^﻿/,'').split(/\r?\n/)){
      const line=raw.trim();
      const mm=/^\[([a-z#]+):(.*)\]$/i.exec(line);
      if(mm&&!/^\d+$/.test(mm[1])){const k=mm[1].toLowerCase(),v=mm[2].trim();if(k==='offset')offset=(+v||0)/1000;else meta[k]=v;continue;}
      const times=[];let rest=line,m;TAG.lastIndex=0;
      while((m=/^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/.exec(rest))){times.push(tsec(m[1],m[2],m[3]));rest=rest.slice(m[0].length);}
      if(!times.length){if(line)lines.push({t:null,text:line});continue;}
      // temps par mot (LRC « enrichi ») : <00:12.30>mot
      let words=null;
      if(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/.test(rest)){
        words=[];const re=/<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>([^<]*)/g;let w;
        while((w=re.exec(rest)))words.push({t:tsec(w[1],w[2],w[3]),text:w[4]});
        rest=words.map(x=>x.text).join('');
      }
      const txt=rest.replace(/\s+/g,' ').trim();
      for(const t of times)lines.push({t,text:txt,words:words&&times.length===1?words:null});
    }
    const synced=lines.some(l=>l.t!=null);
    if(synced){
      const out=lines.filter(l=>l.t!=null).map(l=>({...l,t:Math.max(0,l.t-offset),words:l.words?l.words.map(w=>({...w,t:Math.max(0,w.t-offset)})):null}));
      out.sort((a,b)=>a.t-b.t);
      return{synced:true,lines:out,meta,offset};
    }
    return spread(lines.map(l=>l.text),duration,meta);
  }
  // Paroles sans temps : une ligne après l'autre sur la durée (à défaut, 4 s par ligne).
  function spread(texts,duration,meta={}){
    const t=texts.filter(Boolean);if(!t.length)return null;
    const step=duration>0?Math.max(2,duration*.9/t.length):4;
    return{synced:false,lines:t.map((text,i)=>({t:i*step,text,words:null})),meta};
  }
  // SYLT (ID3) : [{t,text}] ; une entrée qui commence par un retour à la ligne ouvre une nouvelle ligne.
  function fromSylt(items){
    if(!Array.isArray(items)||!items.length)return null;
    const nl=items.some(x=>/^[\r\n]/.test(x.text));
    if(!nl)return{synced:true,lines:items.filter(x=>x.t!=null).map(x=>({t:x.t,text:String(x.text).trim(),words:null})).sort((a,b)=>a.t-b.t),meta:{}};
    const lines=[];let cur=null;
    for(const x of items){
      if(x.t==null)continue;
      if(!cur||/^[\r\n]/.test(x.text)){cur={t:x.t,text:'',words:[]};lines.push(cur);}
      const w=String(x.text).replace(/^[\r\n]+/,'');cur.words.push({t:x.t,text:w});cur.text+=w;
    }
    lines.forEach(l=>{l.text=l.text.trim();});
    return{synced:true,lines,meta:{}};
  }
  /* Ligne à l'instant t : indice, texte, ligne suivante et avancement (0 à 1) pour le karaoké. */
  function at(lyr,t){
    if(!lyr||!lyr.lines.length)return null;
    const L=lyr.lines;let lo=0,hi=L.length-1,i=-1;
    while(lo<=hi){const m=(lo+hi)>>1;if(L[m].t<=t){i=m;lo=m+1;}else hi=m-1;}
    const next=L[i+1]||null;
    if(i<0)return{i:-1,line:'',next:L[0].text,progress:0,wait:L[0].t-t};
    const l=L[i];let progress;
    if(l.words&&l.words.length){
      const total=l.text.length||1;let done=0;
      for(let k=0;k<l.words.length;k++){
        const w=l.words[k],wn=l.words[k+1],end=wn?wn.t:(next?next.t:w.t+1);
        if(t>=end){done+=w.text.length;continue;}
        if(t>=w.t)done+=w.text.length*Math.min(1,(t-w.t)/Math.max(.05,end-w.t));
        break;
      }
      progress=done/total;
    }else{const end=next?next.t:l.t+5;progress=Math.min(1,(t-l.t)/Math.max(.2,Math.min(8,end-l.t)));}
    return{i,line:l.text,next:next?next.text:'',progress:Math.max(0,Math.min(1,progress))};
  }
  const Lyrics={parse,at,fromSylt,spread};

  /* Paroles d'un morceau, dans l'ordre : .lrc importé avec, .lrc à côté (appli), SYLT, USLT ou LYRICS. */
  async function ensureLyrics(tr){
    if(!tr)return null;
    const tagsLate=tr._lyrNone&&(tr.lyricsText||tr.lyricsSync);
    if(tr._lyrDone&&!tagsLate)return tr.lyrics;
    tr._lyrDone=true;tr._lyrNone=false;
    let l=null,src='';
    if(tr._lrcText){l=parse(tr._lrcText,tr.duration);src='lrc';}
    if(!l&&tr.path&&window.__TAURI__&&__TAURI__.core){
      try{const t=await __TAURI__.core.invoke('lyrics_sidecar',{path:tr.path});if(t){l=parse(t,tr.duration);src='lrc';}}catch(e){}
    }
    if(!l&&tr.lyricsSync){l=fromSylt(tr.lyricsSync);src='sylt';}
    if(!l&&tr.lyricsText){l=parse(tr.lyricsText,tr.duration);src='tag';}
    if(l&&!l.lines.length)l=null;
    tr.lyrics=l;tr.lyricsSrc=l?src:'';tr._lyrNone=!l;
    return l;
  }
  function setLrc(tr,text){tr._lrcText=text;tr._lyrDone=false;return ensureLyrics(tr);}
  const lyrT=d=>d.position()+((d.track&&d.track.lyrOffset)||0);
  function lyricNow(id){
    const d=id?decks.find(x=>x.id===id):(window.LiveOut&&LiveOut.onAir());
    if(!d||!d.track||!d.track.lyrics)return null;
    return at(d.track.lyrics,lyrT(d));
  }

  /* ---------- import : fichiers vidéo et .lrc voisins ---------- */
  const stem=n=>String(n||'').split(/[\\/]/).pop().replace(/\.[^.]+$/,'').toLowerCase();
  function onImport(tr,f,files){
    if(!tr||!f)return;
    if(VEXT.test(f.name||'')){tr.video=true;if(typeof Blob!=='undefined'&&f instanceof Blob)tr._vfile=f;}
    const lrc=(files||[]).find(x=>x&&/\.lrc$/i.test(x.name||'')&&stem(x.name)===stem(f.name));
    if(lrc&&lrc.text)lrc.text().then(t=>setLrc(tr,t)).catch(()=>{});
  }
  const isVideo=tr=>!!tr&&(tr.video||VEXT.test(tr.file||tr.path||''));
  async function srcOf(tr){
    if(tr._vurl)return tr._vurl;
    if(tr._vfile)return tr._vurl=URL.createObjectURL(tr._vfile);
    if(tr.path&&window.mixlabNative&&mixlabNative.readFile){
      try{const b=await mixlabNative.readFile(tr.path);const ext=(/\.(\w+)$/.exec(tr.path)||[])[1]||'mp4';
        return tr._vurl=URL.createObjectURL(new Blob([b],{type:'video/'+(ext.toLowerCase()==='mov'?'quicktime':ext.toLowerCase()==='m4v'?'mp4':ext.toLowerCase())}));}catch(e){}
    }
    return null;
  }

  /* ---------- une vidéo par platine, calée sur la position ---------- */
  function media(d){
    let m=V.media[d.id];
    if(m&&m.tr===d.track)return m;
    if(m&&m.el){m.el.pause();m.el.removeAttribute("src");m.el.load();m.el.remove();}
    m=V.media[d.id]={tr:d.track,el:null,ok:false};
    if(!isVideo(d.track))return m;
    const el=document.createElement('video');
    el.muted=true;el.playsInline=true;el.preload='auto';el.className='vx-v';el.setAttribute('aria-hidden','true');
    m.el=el;const tr=d.track;
    srcOf(tr).then(u=>{if(u&&m.tr===tr){el.src=u;el.addEventListener('loadeddata',()=>{m.ok=el.videoWidth>0;},{once:true});}});
    return m;
  }
  function sync(d,m){
    const el=m.el;if(!el||el.readyState<1)return;
    const target=Math.min(Math.max(0,d.position()),(el.duration||1e9)-.05);
    const drift=el.currentTime-target,rate=Math.abs(d.rate);
    if(d.playing&&!d.reverse&&!d.spinSt){
      if(Math.abs(drift)>.25||(el.paused&&Math.abs(drift)>.05)){if(!el.seeking)el.currentTime=target;}
      // petit écart : on rattrape en jouant un peu plus vite ou plus lentement
      const corr=Math.abs(drift)>.02?Math.max(-.25,Math.min(.25,-drift*1.5)):0,r=Math.max(.0625,Math.min(16,rate*(1+corr)));
      if(Math.abs(el.playbackRate-r)>.002)el.playbackRate=r;
      if(el.paused)el.play().catch(()=>{});
    }else{
      if(!el.paused)el.pause();
      if(Math.abs(drift)>.02&&!el.seeking)el.currentTime=target;
    }
  }

  /* ---------- sur la platine : vignette et ligne de paroles ---------- */
  function deckUi(d,m){
    const mid=d.ui&&d.ui.title&&d.ui.title.parentElement;if(!mid)return;
    const u=d._vx||(d._vx={});
    // vignette vidéo
    const showTh=cfg.deckThumb&&m.el&&m.ok;
    if(showTh){
      if(!u.th||u.th.parentElement!==mid){u.th=h('div',{class:'vx-th',title:'Vidéo de la platine '+d.id});mid.prepend(u.th);}
      if(m.el.parentElement!==u.th)u.th.append(m.el);
    }else if(u.th){u.th.remove();u.th=null;}
    // paroles
    const lyr=cfg.lyricsDeck&&d.track&&d.track.lyrics?at(d.track.lyrics,lyrT(d)):null;
    if(lyr&&(lyr.line||lyr.next)){
      if(!u.ly||u.ly.parentElement!==mid){mid.style.position='relative';u.ly=h('div',{class:'vx-ly'});mid.append(u.ly);}
      const txt=lyr.line||'… '+lyr.next;
      if(u.ly.textContent!==txt){u.ly.textContent=txt;u.ly.title=lyr.next?'Ensuite : '+lyr.next:'';}
      u.ly.classList.toggle('wait',!lyr.line);
    }else if(u.ly){u.ly.remove();u.ly=null;}
  }

  /* ---------- composition de la sortie ---------- */
  const cv=V.cv=document.createElement('canvas');cv.width=W;cv.height=H;cv.className='vx-cv';
  const g=cv.getContext('2d');
  const vz=document.createElement('canvas');vz.width=W;vz.height=H;const gz=vz.getContext('2d');
  const weight=d=>d&&d.active&&d.track?faderGain(d.p.fader)*xfGainOf(d):0;
  function plan(){
    const ws=decks.map(d=>({d,w:weight(d)})).filter(x=>x.w>.01).sort((a,b)=>b.w-a.w);
    const a=ws[0]||null,b=ws[1]||null;
    return{mode:cfg.transition,a:a?a.d:null,b:b?b.d:null,p:b?b.w/(a.w+b.w):0};
  }
  const FB=new Uint8Array(512);
  let hue=200,bassAvg=0;
  function drawViz(){
    gz.fillStyle='#05060a';gz.fillRect(0,0,W,H);
    if(cfg.viz==='none')return 0;
    bus.anL.getByteFrequencyData(FB);
    let bass=0;for(let i=1;i<8;i++)bass+=FB[i];bass/=7*255;bassAvg=bassAvg*.9+bass*.1;
    hue=(hue+.15+bass*.8)%360;
    const N=64,col=(i,a)=>`hsla(${(hue+i*2.2)%360},80%,${50+bass*20}%,${a})`;
    let energy=0;
    const bin=i=>{const f0=Math.floor(Math.pow(2,i/N*8.5)),f1=Math.max(f0+1,Math.floor(Math.pow(2,(i+1)/N*8.5)));let s=0;for(let k=f0;k<f1&&k<FB.length;k++)s=Math.max(s,FB[k]);return s/255;};
    if(cfg.viz==='ring'){
      const cx=W/2,cy=H/2,R=H*.2+bass*H*.06;
      gz.lineWidth=6;
      for(let i=0;i<N;i++){const v=bin(i);energy+=v;const a=i/N*Math.PI*2-Math.PI/2,l=R+v*H*.28;
        gz.strokeStyle=col(i,.9);gz.beginPath();gz.moveTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);gz.lineTo(cx+Math.cos(a)*l,cy+Math.sin(a)*l);gz.stroke();
        const b2=a+Math.PI;gz.beginPath();gz.moveTo(cx+Math.cos(b2)*R,cy+Math.sin(b2)*R);gz.lineTo(cx+Math.cos(b2)*l,cy+Math.sin(b2)*l);gz.stroke();}
    }else{
      const bw=W/(N*2);
      for(let i=0;i<N;i++){const v=bin(i);energy+=v;const bh=v*H*.62;gz.fillStyle=col(i,.85);
        gz.fillRect(W/2+i*bw+1,H*.82-bh,bw-2,bh);gz.fillRect(W/2-(i+1)*bw+1,H*.82-bh,bw-2,bh);
        gz.fillStyle=col(i,.18);gz.fillRect(W/2+i*bw+1,H*.82,bw-2,bh*.35);gz.fillRect(W/2-(i+1)*bw+1,H*.82,bw-2,bh*.35);}
    }
    // halo au rythme des basses
    const rg=gz.createRadialGradient(W/2,H/2,0,W/2,H/2,H*(.35+bassAvg*.4));
    rg.addColorStop(0,`hsla(${hue},90%,60%,${.12+bass*.25})`);rg.addColorStop(1,'hsla(0,0%,0%,0)');
    gz.fillStyle=rg;gz.fillRect(0,0,W,H);
    return energy/N;
  }
  const artImg=new Map();
  function art(tr){if(!tr||!tr.art)return null;let i=artImg.get(tr.art);if(!i){i=new Image();i.src=tr.art;artImg.set(tr.art,i);}return i.complete&&i.naturalWidth?i:null;}
  function cover(c,src,sw,sh){const k=Math.max(W/sw,H/sh),w=sw*k,hh=sh*k;c.drawImage(src,(W-w)/2,(H-hh)/2,w,hh);}
  function layer(c,d){
    const m=d&&V.media[d.id];
    if(m&&m.el&&m.ok&&m.el.readyState>=2){cover(c,m.el,m.el.videoWidth,m.el.videoHeight);return'video';}
    c.drawImage(vz,0,0);
    const a=d&&art(d.track);
    if(a){const s=H*.34;c.save();c.globalAlpha*=.9;c.drawImage(a,W/2-s/2,H*.42-s/2,s,s);c.restore();}
    if(d&&d.track){c.fillStyle='rgba(255,255,255,.75)';c.font='600 30px Inter,system-ui,sans-serif';c.textAlign='center';c.fillText(d.track.title||'',W/2,H*.93);}
    return'viz';
  }
  function fitText(c,s,max,size,weight='600'){let z=size;c.font=`${weight} ${z}px Inter,system-ui,sans-serif`;while(z>14&&c.measureText(s).width>max){z-=2;c.font=`${weight} ${z}px Inter,system-ui,sans-serif`;}return z;}
  function render(){
    const P=V.plan=plan(),now=performance.now();
    P.energy=drawViz();
    g.globalAlpha=1;g.fillStyle='#000';g.fillRect(0,0,W,H);
    const A=P.a,B=P.b;P.layers=[];
    if(!A){P.layers.push(layer(g,null));}
    else if(!B||P.mode==='cut'){P.layers.push(layer(g,!B||P.p<.5?A:B));P.shown=(!B||P.p<.5?A:B).id;}
    else if(P.mode==='wipe'){
      P.layers.push(layer(g,A));
      // volet : B entre par son côté du crossfader
      const fromLeft=B.xfa==='A'&&A.xfa!=='A',w=W*P.p;
      g.save();g.beginPath();g.rect(fromLeft?0:W-w,0,w,H);g.clip();P.layers.push(layer(g,B));g.restore();
      g.fillStyle='rgba(255,255,255,.6)';g.fillRect(fromLeft?w-1:W-w-1,0,2,H);
      P.edge=fromLeft?w:W-w;
    }else{
      P.layers.push(layer(g,A));g.globalAlpha=P.p;P.layers.push(layer(g,B));g.globalAlpha=1;
    }
    // paroles (et karaoké)
    const K=V.karaoke,kd=cfg.karaoke&&K.deck?decks.find(d=>d.id===K.deck):null,ld=kd&&kd.track&&kd.track.lyrics?kd:A;
    P.lyric=null;
    if(cfg.lyricsOut&&ld&&ld.track&&ld.track.lyrics){
      const l=at(ld.track.lyrics,lyrT(ld));P.lyric=l;
      if(l){
        const big=cfg.karaoke,y=big?H*.6:H*.86,size=big?64:40;
        g.textAlign='center';g.textBaseline='middle';
        if(big){g.fillStyle='rgba(0,0,0,.55)';g.fillRect(0,y-size*1.1,W,size*3.3);}
        if(l.line){
          const z=fitText(g,l.line,W*.9,size,'700'),tw=g.measureText(l.line).width,x0=W/2-tw/2;
          g.lineWidth=Math.max(3,z/9);g.strokeStyle='rgba(0,0,0,.85)';g.strokeText(l.line,W/2,y);
          g.fillStyle='#fff';g.fillText(l.line,W/2,y);
          if(big){g.save();g.beginPath();g.rect(x0,y-z,tw*l.progress,z*2);g.clip();g.fillStyle='#3fd2ff';g.fillText(l.line,W/2,y);g.restore();}
        }else if(l.wait>0&&l.wait<6&&big){g.font='700 54px Inter,system-ui,sans-serif';g.fillStyle='#3fd2ff';g.fillText('● '.repeat(Math.ceil(l.wait/2)).trim(),W/2,y);}
        if(l.next){const z=fitText(g,l.next,W*.85,Math.round(size*.62),'600');g.fillStyle='rgba(255,255,255,.6)';g.fillText(l.next,W/2,y+z*1.7);}
      }
    }
    if(cfg.karaoke){
      const q=K.queue,cur=K.current;g.textBaseline='top';g.font='600 30px Inter,system-ui,sans-serif';
      if(cur){g.textAlign='left';g.fillStyle='rgba(0,0,0,.5)';g.fillRect(24,20,g.measureText('Au micro : '+cur.singer).width+28,48);g.fillStyle='#fff';g.fillText('Au micro : '+cur.singer,38,28);}
      if(q.length){const s='Ensuite : '+q[0].singer;g.textAlign='right';g.fillStyle='rgba(0,0,0,.5)';g.fillRect(W-24-g.measureText(s).width-28,20,g.measureText(s).width+28,48);g.fillStyle='#fff';g.fillText(s,W-38,28);}
    }
    // message texte (fixe ou défilant)
    if(cfg.textOn&&cfg.text){
      const s=cfg.text,y=cfg.karaoke?H*.9:H*.08;g.textBaseline='middle';
      g.fillStyle='rgba(0,0,0,.55)';g.fillRect(0,y-30,W,60);g.fillStyle='#fff';g.font='600 34px Inter,system-ui,sans-serif';
      const tw=g.measureText(s).width;
      if(cfg.textScroll||tw>W*.92){g.textAlign='left';const span=tw+W*.4,x=W-((now*.12)%(span+W));g.fillText(s,x,y);if(x+span<W)g.fillText(s,x+span+W*.0,y);}
      else{g.textAlign='center';g.fillText(s,W/2,y);}
      P.text=s;
    }
    // logo
    if(V.logo&&V.logo.complete&&V.logo.naturalWidth){
      const lw=W*.14,lh=lw*V.logo.naturalHeight/V.logo.naturalWidth,m=24,pos=cfg.logoPos;
      g.globalAlpha=.92;g.drawImage(V.logo,pos[1]==='l'?m:W-lw-m,pos[0]==='t'?m:H-lh-m,lw,lh);g.globalAlpha=1;P.logo=true;
    }
    V.lastRender=now;
  }

  /* ---------- fenêtre de sortie ---------- */
  function openOut(){
    if(V.win&&!V.win.closed){V.win.focus();return V.win;}
    const w=window.open('','mixlab-video','popup,width=960,height=540');
    if(!w){toast('Fenêtre bloquée : autorise les fenêtres surgissantes pour ouvrir la sortie vidéo');return null;}
    const doc=w.document;
    doc.open();
    doc.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Mixlab · sortie vidéo</title><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}video{width:100%;height:100%;object-fit:contain;display:block}p{position:fixed;left:12px;bottom:8px;margin:0;font:500 13px system-ui,sans-serif;color:#888;transition:opacity 1s}body.idle{cursor:none}body.idle p{opacity:0}</style></head><body><video autoplay muted playsinline></video><p>Double-clic : plein écran</p></body></html>');
    doc.close();
    if(!V.stream&&cv.captureStream)V.stream=cv.captureStream(30);
    const ve=doc.querySelector('video');ve.srcObject=V.stream;ve.play().catch(()=>{});
    doc.addEventListener('dblclick',()=>{doc.fullscreenElement?doc.exitFullscreen():doc.documentElement.requestFullscreen().catch(()=>{});});
    let idle=0;const wake=()=>{doc.body.classList.remove('idle');clearTimeout(idle);idle=setTimeout(()=>doc.body&&doc.body.classList.add('idle'),2500);};
    doc.addEventListener('mousemove',wake);wake();
    V.win=w;renderTab();
    return w;
  }
  function closeOut(){if(V.win&&!V.win.closed)V.win.close();V.win=null;renderTab();}
  const outOpen=()=>!!(V.win&&!V.win.closed);

  /* ---------- boucle ---------- */
  function step(){
    const now=performance.now();V.lastFrame=now;
    for(const d of decks){
      if(!d.track){if(V.media[d.id]&&V.media[d.id].el){V.media[d.id].el.pause();}deckUi(d,{});continue;}
      const m=media(d);if(m.el)sync(d,m);
      if(d.track.lyrics===undefined||(!d.track._lyrDone)||(d.track._lyrNone&&(d.track.lyricsText||d.track.lyricsSync)))ensureLyrics(d.track);
      deckUi(d,m);
    }
    if(V.win&&V.win.closed){V.win=null;renderTab();}
    if((outOpen()||cv.isConnected||V.force)&&now-V.lastRender>30)render();
  }
  function loop(){requestAnimationFrame(loop);step();}
  requestAnimationFrame(loop);
  // fenêtre principale cachée (sortie sur l'autre écran) : le rendu continue au minuteur
  setInterval(()=>{if(performance.now()-V.lastFrame>120)step();},60);

  /* ---------- karaoké ---------- */
  const K=V.karaoke;
  const saveK=()=>store.set('karaoke',K.queue.map(x=>({singer:x.singer,id:x.id,path:x.path||null,shift:x.shift||0})));
  const trackOf=x=>LIB.tracks.find(t=>t.id===x.id&&(!x.path||t.path===x.path))||(x.path?LIB.tracks.find(t=>t.path===x.path):null);
  function kAdd(singer,tr,shift=0){
    singer=String(singer||'').trim();if(!singer||!tr)return false;
    K.queue.push({singer,id:tr.id,path:tr.path||null,shift});saveK();renderTab();return true;
  }
  function kNext(){
    const x=K.queue.shift();saveK();
    if(!x){K.current=null;renderTab();return null;}
    const tr=trackOf(x);
    if(!tr){toast('Morceau introuvable pour '+x.singer);renderTab();return null;}
    const d=decks.find(d=>d.active&&!d.playing&&d.id!==K.deck)||decks.find(d=>d.active&&!(typeof audible==='function'&&audible(d)));
    if(!d){toast('Aucune platine libre : mets une platine en pause');K.queue.unshift(x);saveK();return null;}
    d.load(tr);d.setKeyShift(x.shift||0);K.current=x;K.deck=d.id;
    toast('Au micro : '+x.singer+' · '+(tr.title||'')+' sur la platine '+d.id,'ok');
    renderTab();return d;
  }

  /* ---------- onglets de la fenêtre Live ---------- */
  const st=document.createElement('style');
  st.textContent=`
.vx-th{float:left;width:53px;height:30px;margin-right:8px;border-radius:3px;overflow:hidden;background:#000}
.vx-th video{width:100%;height:100%;object-fit:cover;display:block}
.vx-ly{position:absolute;left:0;right:0;bottom:0;background:var(--s1);color:var(--coach,#3fd2ff);font:600 12px/1.3 var(--ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
.vx-ly.wait{color:var(--dim)}
.vx-pre{background:#000;border:1px solid var(--ln2);border-radius:4px;overflow:hidden;aspect-ratio:16/9}
.vx-pre canvas{width:100%;height:100%;display:block}
.vx-q{list-style:none;margin:6px 0;padding:0;display:grid;gap:3px}
.vx-q li{display:flex;gap:6px;align-items:center;font-size:13px}
.vx-q li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;
  document.head.append(st);
  let tabEl=null;
  const chk=(k,label,onc)=>{const i=h('input',{type:'checkbox'});i.checked=!!cfg[k];i.addEventListener('change',()=>{cfg[k]=i.checked;save();onc&&onc(i.checked);});return h('label',{},i,' ',label);};
  const sel=(k,opts,onc)=>{const s=h('select',{class:'lv-in'},opts.map(([v,n])=>h('option',{value:v},n)));s.value=cfg[k];s.addEventListener('change',()=>{cfg[k]=s.value;save();onc&&onc(s.value);});return s;};
  function renderTab(){if(tabEl&&tabEl.isConnected&&window.LiveOut){LiveOut.open();}}
  function loadLogo(url){if(!url){V.logo=null;return;}const i=new Image();i.src=url;V.logo=i;}
  loadLogo(store.get('videologo',null));

  function videoTab(){
    const wrap=h('div',{class:'mgrid'});tabEl=wrap;
    const pre=h('div',{class:'vx-pre'},cv);
    wrap.append(h('div',{},
      h('h3',{},'Sortie vidéo'),pre,
      h('div',{class:'lv-row'},outOpen()?h('button',{class:'b',type:'button',onclick:closeOut},'Fermer la sortie'):h('button',{class:'b',type:'button',onclick:openOut},'Ouvrir la sortie vidéo')),
      h('p',{class:'lv-note'},'Pose la fenêtre sur le second écran ou le projecteur, puis double-clic pour le plein écran.')));
    const msg=h('input',{type:'text',class:'lv-in',value:cfg.text,placeholder:'Message à l’écran'});msg.addEventListener('input',()=>{cfg.text=msg.value;save();});
    const logoIn=h('input',{type:'file',accept:'image/*',style:'display:none'});
    logoIn.addEventListener('change',()=>{const f=logoIn.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{const u=String(r.result);if(u.length<400000)store.set('videologo',u);else toast('Logo gardé pour cette session seulement (image lourde)');loadLogo(u);};r.readAsDataURL(f);});
    wrap.append(h('div',{},
      h('h3',{},'Image'),
      h('div',{class:'lv-f'},
        h('label',{},'Transition'),sel('transition',[['fade','Fondu (suit le crossfader)'],['wipe','Volet (suit le crossfader)'],['cut','Coupe (au milieu)']]),
        h('label',{},'Sans vidéo'),sel('viz',[['bars','Visualiseur : barres'],['ring','Visualiseur : cercle'],['none','Écran noir']])),
      h('div',{class:'lv-row'},chk('deckThumb','Vignette vidéo sur les platines')),
      h('h3',{},'Texte et logo'),msg,
      h('div',{class:'lv-row'},chk('textOn','Afficher le message'),chk('textScroll','Défilant')),
      h('div',{class:'lv-row'},h('button',{class:'b',type:'button',onclick:()=>logoIn.click()},'Choisir un logo'),
        h('button',{class:'b',type:'button',onclick:()=>{store.set('videologo',null);loadLogo(null);}},'Retirer'),
        sel('logoPos',[['tr','En haut à droite'],['tl','En haut à gauche'],['br','En bas à droite'],['bl','En bas à gauche']]),logoIn)));
    return wrap;
  }
  function lyricsTab(){
    const wrap=h('div',{class:'mgrid'});tabEl=wrap;
    const rows=decks.filter(d=>d.active).map(d=>{
      const tr=d.track,l=tr&&tr.lyrics;
      const src={lrc:'fichier .lrc',sylt:'tag SYLT',tag:'tag de paroles'}[tr&&tr.lyricsSrc]||'';
      const inp=h('input',{type:'file',accept:'.lrc,.txt,text/plain',style:'display:none'});
      inp.addEventListener('change',async()=>{const f=inp.files[0];if(!f||!d.track)return;const l2=await setLrc(d.track,await f.text());toast(l2?'Paroles chargées sur '+d.id+' : '+l2.lines.length+' lignes':'Aucune parole lue dans ce fichier',l2?'ok':'');renderTab();});
      const off=tr&&tr.lyrOffset||0;
      return h('div',{class:'lv-row'},h('b',{},d.id),
        h('span',{style:'flex:1;min-width:0'},!tr?'Pas de morceau':l?(tr.title+' · '+l.lines.length+' lignes'+(l.synced?' synchronisées':' non synchronisées')+(src?' · '+src:'')):tr.title+' · pas de paroles'),
        tr?h('button',{class:'b',type:'button',onclick:()=>inp.click()},'Charger un .lrc'):null,
        tr&&l?h('button',{class:'b',type:'button',title:'Paroles plus tôt',onclick:()=>{tr.lyrOffset=Math.round((off+.1)*10)/10;renderTab();}},'−0,1 s'):null,
        tr&&l?h('button',{class:'b',type:'button',title:'Paroles plus tard',onclick:()=>{tr.lyrOffset=Math.round((off-.1)*10)/10;renderTab();}},'+0,1 s'):null,
        tr&&l&&off?h('span',{class:'lv-note'},'décalage '+(off>0?'+':'')+off.toFixed(1)+' s'):null,inp);
    });
    wrap.append(h('div',{},
      h('h3',{},'Paroles synchronisées'),
      h('p',{},'Mixlab lit le fichier .lrc posé à côté du morceau (même nom), ou importé en même temps, puis les paroles des tags (SYLT, USLT, LYRICS).'),
      h('div',{class:'lv-row'},chk('lyricsDeck','Sur les platines'),chk('lyricsOut','Sur la sortie vidéo')),
      ...rows));
    return wrap;
  }
  function karaokeTab(){
    const wrap=h('div',{class:'mgrid'});tabEl=wrap;
    const name=h('input',{type:'text',class:'lv-in',placeholder:'Prénom du chanteur'});
    const shift=h('select',{class:'lv-in','aria-label':'Transposition'},[-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6].map(n=>h('option',{value:n},(n>0?'+':'')+n+' demi-ton'+(Math.abs(n)>1?'s':''))));shift.value='0';
    const add=()=>{const tr=LIB.tracks.find(t=>t.id===ui.sel);if(!tr){toast('Sélectionne d’abord le morceau dans la bibliothèque');return;}if(!name.value.trim()){toast('Indique le prénom du chanteur');return;}kAdd(name.value,tr,+shift.value);};
    const q=h('ul',{class:'vx-q'},K.queue.map((x,i)=>{const tr=trackOf(x);return h('li',{},h('b',{},String(i+1)),h('span',{},x.singer+' · '+(tr?tr.title:'morceau introuvable')+(x.shift?' · '+(x.shift>0?'+':'')+x.shift:'')),
      h('button',{class:'b',type:'button',title:'Monter',onclick:()=>{if(i>0){K.queue.splice(i-1,0,K.queue.splice(i,1)[0]);saveK();renderTab();}}},'↑'),
      h('button',{class:'b',type:'button',title:'Retirer',onclick:()=>{K.queue.splice(i,1);saveK();renderTab();}},'×'));}));
    wrap.append(h('div',{},
      h('h3',{},'Karaoké'),
      h('div',{class:'lv-row'},chk('karaoke','Mode karaoké sur la sortie vidéo')),
      h('p',{},'Paroles en grand qui se remplissent, chanteur au micro et suivant à l’écran.'),
      h('div',{class:'lv-row'},name,shift,h('button',{class:'b',type:'button',onclick:add},'Ajouter avec le morceau sélectionné')),
      h('p',{class:'lv-note'},'Disques CD+G non lus : utilise des clips vidéo ou des fichiers avec paroles .lrc.')));
    wrap.append(h('div',{},
      h('h3',{},'File d’attente'),
      h('p',{},K.current?'Au micro : '+K.current.singer:'Personne au micro.'),
      K.queue.length?q:h('p',{class:'lv-note'},'File vide.'),
      h('div',{class:'lv-row'},h('button',{class:'b',type:'button',onclick:kNext},'Au suivant'))));
    return wrap;
  }
  if(window.LiveOut){
    LiveOut.tab('video','Vidéo',videoTab,30);
    LiveOut.tab('lyrics','Paroles',lyricsTab,40);
    LiveOut.tab('karaoke','Karaoké',karaokeTab,50);
  }

  window.MixlabSettings=(window.MixlabSettings||[]).concat([
    {tab:'Vidéo',key:'video.transition',label:'Transition vidéo',type:'select',options:[['fade','Fondu'],['wipe','Volet'],['cut','Coupe']],get:()=>cfg.transition,set:v=>{cfg.transition=v;save();}},
    {tab:'Vidéo',key:'video.viz',label:'Sans vidéo',type:'select',options:[['bars','Visualiseur : barres'],['ring','Visualiseur : cercle'],['none','Écran noir']],get:()=>cfg.viz,set:v=>{cfg.viz=v;save();}},
    {tab:'Vidéo',key:'video.deckThumb',label:'Vignette vidéo sur les platines',type:'bool',get:()=>cfg.deckThumb,set:v=>{cfg.deckThumb=!!v;save();}},
    {tab:'Vidéo',key:'video.lyricsDeck',label:'Paroles sur les platines',type:'bool',get:()=>cfg.lyricsDeck,set:v=>{cfg.lyricsDeck=!!v;save();}},
    {tab:'Vidéo',key:'video.lyricsOut',label:'Paroles sur la sortie vidéo',type:'bool',get:()=>cfg.lyricsOut,set:v=>{cfg.lyricsOut=!!v;save();}},
  ]);

  return{cfg,Lyrics,ensureLyrics,setLrc,lyricNow,onImport,isVideo,media:V.media,plan,render,step,open:openOut,close:closeOut,
    get win(){return V.win;},get lastPlan(){return V.plan;},set force(v){V.force=!!v;},canvas:cv,karaoke:{add:kAdd,next:kNext,state:K},loadLogo};
})();
