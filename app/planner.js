'use strict';
/* =====================================================================
   Mixlab · préparation de set
   Une frise des morceaux qui se chevauchent : on règle chaque transition
   (points de sortie et d'entrée, durée, courbes volume, EQ, filtre, écho,
   préréglages), on l'écoute au casque ou au master, on joue tout le set,
   on le rend en WAV hors ligne (tempo calé, courbes appliquées) et on
   l'exporte (M3U8, rekordbox XML, tracklist horodatée).
   Les transitions préparées deviennent des points de mix : quand les deux
   morceaux sont sur les platines, l'auto-mix et le coach s'en servent.
   Aussi : une phrase en français (« house 122-126 énergie qui monte 1h »)
   construit une playlist depuis la bibliothèque, sans aucun service en
   ligne ; et chaque transition jouée en direct est enregistrée (faders,
   EQ, filtre) pour la revoir sur une mini frise dans le bilan du coach.
   ===================================================================== */
window.Planner=(()=>{
  /* ---------- outils ---------- */
  const fold=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[’`]/g,"'");
  const trk=id=>LIB.tracks.find(t=>t.id===id)||null;
  const tkey=t=>t.path||((t.demo?'demo:':'')+(t.artist||'')+'|'+t.title);
  const bl=t=>60/t.bpm;
  const beatOf=(t,x)=>(x-t.grid)/bl(t);
  const timeOf=(t,b)=>t.grid+b*bl(t);
  const endOf=t=>Math.min(t.duration,t.musicEnd||t.duration);
  const nrg=t=>window.Academie&&Academie.energyOf?Academie.energyOf(t):(t.energy||5);
  const kcode=t=>{const k=keyInfo(t&&t.key);return k?k.code:'';};
  const clone=o=>JSON.parse(JSON.stringify(o));
  const p2=n=>String(n).padStart(2,'0');
  const stamp=s=>{s=Math.max(0,Math.round(s));const hh=Math.floor(s/3600),m=Math.floor(s/60)%60,x=s%60;return(hh?hh+':'+p2(m):p2(m))+':'+p2(x);};
  const dur=s=>{s=Math.round(s);const hh=Math.floor(s/3600),m=Math.round((s-hh*3600)/60);return hh?hh+' h'+(m?' '+p2(m):''):m+' min';};
  const pct=x=>(x>0?'+':'')+(x*100).toFixed(1).replace('.',',')+' %';
  const nowS=()=>performance.now()/1000;

  /* ---------- courbes d'automation ----------
     Chaque transition porte, pour le morceau qui sort et celui qui entre, six courbes :
     liste de points [p, valeur], p de 0 à 1 sur la transition. Deux points au même p = un saut. */
  const LANES=[['vol','Volume'],['low','Graves'],['mid','Médiums'],['high','Aigus'],['filter','Filtre'],['echo','Écho']];
  const NEU={vol:1,low:.5,mid:.5,high:.5,filter:.5,echo:0};
  const SWAP_OUT=[[0,.5],[.5,.5],[.5,0],[1,0]],SWAP_IN=[[0,0],[.5,0],[.5,.5],[1,.5]];
  const PRESETS={
    bass:{label:'Échange des basses',bars:16,style:'bass',out:{low:SWAP_OUT,vol:[[0,1],[.75,1],[1,0]]},in:{vol:[[0,0],[.25,1],[1,1]],low:SWAP_IN}},
    filter:{label:'Filtre',bars:16,style:'filter',out:{low:SWAP_OUT,filter:[[0,.5],[.5,.5],[1,.18]],vol:[[0,1],[.85,1],[1,0]]},in:{vol:[[0,0],[.15,1],[1,1]],low:SWAP_IN,filter:[[0,.8],[.5,.5],[1,.5]]}},
    echo:{label:'Sortie en écho',bars:8,style:'echo',out:{low:SWAP_OUT,echo:[[0,0],[.625,0],[.625,.6],[1,.6]],vol:[[0,1],[.75,1],[.75,0],[1,0]]},in:{vol:[[0,0],[.25,1],[1,1]],low:SWAP_IN}},
    cut:{label:'Coupe',bars:1,style:'cut',out:{vol:[[0,1],[1,1],[1,0]]},in:{vol:[[0,0],[1,0],[1,1]]}},
    fade:{label:'Fondu',bars:8,style:'bass',out:{vol:[[0,1],[1,0]]},in:{vol:[[0,0],[1,1]]}}
  };
  function lanesOf(pr){
    const P=PRESETS[pr]||PRESETS.bass,o={};
    for(const side of['out','in']){o[side]={};for(const[k]of LANES){const v=P[side][k];o[side][k]=v?v.map(x=>x.slice()):[[0,NEU[k]],[1,NEU[k]]];}}
    return o;
  }
  // valeur d'une courbe en p (après un saut, on prend la nouvelle valeur)
  function lv(pts,p){
    if(!pts||!pts.length)return null;if(p<pts[0][0])return pts[0][1];
    let k=0;for(let i=0;i<pts.length;i++)if(pts[i][0]<=p)k=i;
    const a=pts[k],b=pts[k+1];if(!b)return a[1];
    return b[0]<=a[0]?b[1]:a[1]+(b[1]-a[1])*(p-a[0])/(b[0]-a[0]);
  }

  /* ---------- réglages ---------- */
  const OPT=Object.assign({links:true,autoCue:true,bits:16},store.get('plannerOpt',{}));
  const saveOpt=()=>store.set('plannerOpt',OPT);

  /* ---------- points de mix ----------
     Clé : identité des deux morceaux (chemin du fichier, sinon artiste et titre). */
  const LK=store.get('mixpoints',{});
  const lkKey=(a,b)=>tkey(a)+' → '+tkey(b);
  const link=(a,b)=>a&&b?LK[lkKey(a,b)]||null:null;
  function saveLink(a,b,o){LK[lkKey(a,b)]={outT:+o.outT,inT:+o.inT,bars:o.bars,preset:o.preset,lanes:o.lanes?clone(o.lanes):lanesOf(o.preset),at:Date.now()};store.set('mixpoints',LK);}
  function dropLink(a,b){delete LK[lkKey(a,b)];store.set('mixpoints',LK);}
  // auto-mix : la platine qui entre se cale sur le point d'entrée préparé
  function inPoint(a,b){if(!OPT.links)return null;const l=link(a,b);return l?l.inT:null;}
  // auto-mix : départ et durée de la transition préparée (si le point n'est pas déjà passé)
  function linkPlan(out,inc,res){
    if(!OPT.links||!out.track||!inc.track)return res;
    const l=link(out.track,inc.track);if(!l)return res;
    const sb=Math.round(out.beatIdx(l.outT));if(sb<out.beatPos()+1.5)return res;
    const P=PRESETS[l.preset]||PRESETS.bass,len=Math.max(4,l.bars*4);
    return{start:sb,len,style:P.style,swapP:P.style==='cut'?1:.5,link:true,
      why:`Point de mix préparé : sortie mesure ${Math.floor(sb/4)+1}, entrée de « ${inc.track.title} » à ${fmtTime(l.inT,false)}, ${P.label.toLowerCase()} sur ${l.bars} mesure${l.bars>1?'s':''}.`};
  }

  /* ---------- le plan ---------- */
  const DEF={name:'Mon set',mode:'glide',bpm:0,tpl:'',out:'master',zoom:1,items:[]};
  const PL=Object.assign(clone(DEF),store.get('planner',{}));
  PL.sel=0;PL.selTr=0;PL.edit='in';PL.cursor=0;
  let saveT=0;
  function save(){clearTimeout(saveT);saveT=setTimeout(()=>{store.set('planner',{name:PL.name,mode:PL.mode,bpm:PL.bpm,tpl:PL.tpl,out:PL.out,zoom:PL.zoom,
    items:PL.items.map(it=>({k:it.k,inT:it.inT,outT:it.outT,tr:it.tr,next:it.next}))});},200);}
  // morceau d'un élément : retrouvé par son identité (les numéros changent d'une session à l'autre)
  function tOf(it){
    let t=it.id!=null&&trk(it.id);
    if(t&&tkey(t)===it.k)return t;
    t=LIB.tracks.find(x=>tkey(x)===it.k)||null;it.id=t?t.id:null;return t;
  }
  const live=()=>PL.items.filter(tOf);
  const inDefault=t=>{let x=timeOf(t,0);while(x<0)x+=4*bl(t);return x;};
  // transition proposée entre deux morceaux : le point de mix lié s'il existe, sinon comme l'auto-mix
  function autoTr(a,b){
    const l=OPT.links&&link(a,b);
    if(l)return{tr:{bars:l.bars,preset:l.preset,lanes:clone(l.lanes||lanesOf(l.preset))},outT:l.outT,inT:l.inT,linked:true};
    const gap=Suggest.bpmGap(a.bpm,b.bpm),compat=!a.key||!b.key||keysCompatible(a.key,b.key);
    const outro=[...(a.sections||[])].reverse().find(s=>s.type==='outro'),intro=(b.sections||[]).find(s=>s.type==='intro');
    const pr=gap>.08?'cut':!compat?'echo':(outro&&outro.bars>=8)||(intro&&intro.bars>=8)?'bass':'filter';
    const bars=PRESETS[pr].bars,eb=Math.floor((beatOf(a,endOf(a))+.25)/4)*4;
    let sb=pr==='cut'?Math.floor(eb/32)*32-4:Math.floor((eb-bars*4)/32)*32;
    if(sb<16)sb=Math.max(4,Math.floor((eb-bars*4)/4)*4);
    return{tr:{bars,preset:pr,lanes:lanesOf(pr)},outT:timeOf(a,sb),inT:inDefault(b)};
  }
  // après un ajout, un retrait ou un déplacement : chaque paire nouvelle reçoit sa transition
  function pairs(){
    const L=live();
    L.forEach((it,i)=>{
      const t=tOf(it),n=L[i+1],nt=n&&tOf(n);
      if(it.inT==null)it.inT=inDefault(t);
      if(!nt){it.next=null;return;}
      if(it.next!==n.k||!it.tr){const a=autoTr(t,nt);it.tr=a.tr;it.outT=a.outT;n.inT=a.inT;it.next=n.k;}
    });
  }
  function setItems(ids,o={}){
    PL.items=ids.map(trk).filter(Boolean).map(t=>({k:tkey(t),id:t.id,inT:null,outT:null,tr:null,next:null}));
    if(o.mode)PL.mode=o.mode;if(o.bpm!=null)PL.bpm=o.bpm;if(o.name)PL.name=o.name;
    PL.sel=0;PL.selTr=0;pairs();changed();
  }
  function insert(id,at){const t=trk(id);if(!t)return;const it={k:tkey(t),id,inT:null,outT:null,tr:null,next:null};at=at==null?PL.items.length:clamp(at,0,PL.items.length);PL.items.splice(at,0,it);pairs();changed();}
  function remove(i){PL.items.splice(i,1);PL.sel=clamp(PL.sel,0,Math.max(0,PL.items.length-1));PL.selTr=clamp(PL.selTr,0,Math.max(0,PL.items.length-2));pairs();changed();}
  function move(i,j){if(i===j||i<0||j<0||i>=PL.items.length||j>=PL.items.length)return;const[it]=PL.items.splice(i,1);PL.items.splice(j,0,it);pairs();changed();}
  // chaque transition modifiée devient un point de mix pour l'auto-mix et le coach
  function keepLinks(){
    if(!OPT.links)return;const L=live();
    L.forEach((it,i)=>{const n=L[i+1];if(!n||!it.tr||it.tr.unlinked)return;saveLink(tOf(it),tOf(n),{outT:it.outT,inT:n.inT,bars:it.tr.bars,preset:it.tr.preset,lanes:it.tr.lanes});});
  }
  function changed(){keepLinks();save();if(V.root&&!V.root.hidden)render();}

  /* ---------- calcul du déroulé ----------
     Tempo « naturel » : le morceau qui entre est calé sur celui qui sort pendant la transition,
     puis revient en 32 temps à son tempo d'origine. Tempo « verrouillé » : tout le set au tempo
     du premier morceau (ou au tempo choisi). Pendant une transition les deux tempos sont fixes
     et égaux (ou moitié / double) : les temps restent calés. */
  function compute(){
    let its=live();const R=[];let prev=null;
    if(its.some((it,i)=>i<its.length-1&&(!it.tr||it.next!==its[i+1].k))){pairs();its=live();}
    its.forEach((it,i)=>{
      const t=tOf(it),b=bl(t),last=i===its.length-1;
      const pBars=prev?prev.it.tr.bars:0;
      it.inT=clamp(it.inT??inDefault(t),0,Math.max(0,t.duration-(pBars*4+8)*b));
      const ref=prev?prev.bpmOut:(PL.mode==='lock'&&PL.bpm>0?PL.bpm:null);
      let rIn=1;if(ref){const tb=[ref,ref*2,ref/2].reduce((x,y)=>Math.abs(y-t.bpm)<Math.abs(x-t.bpm)?y:x);rIn=tb/t.bpm;}
      const S=prev?prev.trStart:0,dIn=prev?prev.trDur:0,segs=[];let time=S,pos=it.inT;
      if(dIn){segs.push({t0:time,t1:time+dIn,r0:rIn,r1:rIn,p0:pos});pos+=rIn*dIn;time+=dIn;}
      const bars=last?0:it.tr.bars;let endPos;
      if(last)endPos=Math.max(pos+b,endOf(t));
      else{const lo=Math.ceil(beatOf(t,pos)+4-1e-6),hi=Math.floor(beatOf(t,t.duration)-bars*4+1e-6);
        it.outT=timeOf(t,clamp(Math.round(beatOf(t,it.outT??endOf(t))),lo,Math.max(lo,hi)));endPos=it.outT;}
      let rOut=rIn;
      if(PL.mode!=='lock'&&Math.abs(rIn-1)>1e-4){const need=32*b;if(endPos-pos>=need+4*b){const d=need/((rIn+1)/2);segs.push({t0:time,t1:time+d,r0:rIn,r1:1,p0:pos});pos+=need;time+=d;rOut=1;}}
      const d=Math.max(0,(endPos-pos)/rOut);segs.push({t0:time,t1:time+d,r0:rOut,r1:rOut,p0:pos});time+=d;pos=endPos;
      const rec={t,it,i,S,segs,rIn,rOut,bpmIn:t.bpm*rIn,bpmOut:t.bpm*rOut,trStart:null,trDur:0};
      if(!last){rec.trStart=time;rec.trDur=bars*4*60/rec.bpmOut;segs.push({t0:time,t1:time+rec.trDur,r0:rOut,r1:rOut,p0:pos});rec.E=time+rec.trDur;}
      else rec.E=time;
      R.push(rec);prev=rec;
    });
    return{R,total:R.length?R[R.length-1].E:0};
  }
  function segAt(rec,st){for(const s of rec.segs)if(st<=s.t1)return s;return rec.segs[rec.segs.length-1];}
  function posAt(rec,st){const s=segAt(rec,st),D=s.t1-s.t0,dt=clamp(st-s.t0,0,D);return s.p0+s.r0*dt+(D>0?(s.r1-s.r0)*dt*dt/(2*D):0);}
  function rateAt(rec,st){const s=segAt(rec,st),D=s.t1-s.t0;return D>0?s.r0+(s.r1-s.r0)*clamp((st-s.t0)/D,0,1):s.r0;}

  /* ---------- graphe audio (hors ligne ou en direct) ---------- */
  const lpF=f=>f<.47?20000*Math.pow(200/20000,(.47-f)/.47):22000;
  const hpF=f=>f>.53?20*Math.pow(6000/20,(f-.53)/.47):10;
  // points [temps du set, valeur] d'une courbe sur toute la vie du morceau
  function lanePts(rec,prev,k){
    const P=[];
    if(prev){const L=prev.it.tr.lanes.in[k],S=rec.S,D=prev.trDur;P.push([S,lv(L,0)]);L.forEach(([p,v])=>P.push([S+p*D,v]));P.push([S+D,lv(L,1)],[S+D,NEU[k]]);}
    else P.push([rec.S,NEU[k]]);
    if(rec.trStart!=null){const L=rec.it.tr.lanes.out[k],S=rec.trStart,D=rec.trDur;P.push([S,P[P.length-1][1]],[S,lv(L,0)]);L.forEach(([p,v])=>P.push([S+p*D,v]));P.push([S+D,lv(L,1)]);}
    return P;
  }
  function valAt(P,st){let k=0;for(let i=0;i<P.length;i++)if(P[i][0]<=st)k=i;const a=P[k],b=P[k+1];if(st<a[0])return a[1];if(!b)return a[1];return b[0]<=a[0]?b[1]:a[1]+(b[1]-a[1])*(st-a[0])/(b[0]-a[0]);}
  // programme un AudioParam ; « dense » : courbe non linéaire (dB, fréquence) échantillonnée finement
  function sched(par,P,map,T0,T1,at,dense){
    // valeur constante sur la fenêtre : pas d'automation (le filtre garde son calcul rapide)
    const v=valAt(P,T0);if(P.every(([t,x])=>t<=T0||t>T1||x===v)){par.value=map(v);return;}
    let pts=P;
    if(dense){pts=[];for(let i=0;i<P.length;i++){pts.push(P[i]);const n=P[i+1];if(n&&n[0]-P[i][0]>1e-6&&n[1]!==P[i][1])for(let j=1;j<16;j++){const f=j/16;pts.push([P[i][0]+(n[0]-P[i][0])*f,P[i][1]+(n[1]-P[i][1])*f]);}}}
    const v0=map(valAt(P,T0));par.value=v0;par.setValueAtTime(v0,at(T0));let lt=T0;
    for(const[t,v]of pts){if(t<=T0)continue;const m=map(v);if(t-lt<1e-6)par.setValueAtTime(m,at(t));else par.linearRampToValueAtTime(m,at(t));lt=t;}
  }
  const bqx=(ac,type,f,q)=>{const n=ac.createBiquadFilter();n.type=type;n.frequency.value=f;if(q!=null)n.Q.value=q;return n;};
  const hasEcho=(rec,prev)=>(prev&&prev.it.tr.lanes.in.echo.some(p=>p[1]>0))||(rec.trStart!=null&&rec.it.tr.lanes.out.echo.some(p=>p[1]>0));
  /* Chaque morceau : source (tempo programmé) → gain auto → EQ 3 bandes → filtre → volume → sortie,
     et un envoi d'écho après le volume (couper le volume laisse la traîne). */
  function graph(ac,L,T0,T1,dest,base){
    const at=st=>base+(st-T0),srcs=[];
    L.R.forEach((rec,i)=>{
      const prev=L.R[i-1]||null,t=rec.t;
      if(rec.E<=T0||rec.S>=T1)return;
      const ts=Math.max(rec.S,T0);
      const src=ac.createBufferSource();src.buffer=t.buffer;
      const ag=ac.createGain();ag.gain.value=S.autoGain?dbToGain(clamp(-15-t.rmsDb,-9,9)):1;
      // un réglage neutre sur toute la fenêtre : pas de filtre dans la chaîne (rendu plus rapide)
      const P=k=>lanePts(rec,prev,k),T=Math.min(T1,rec.E),pf=P('filter');
      const need=(Pk,ok)=>{const v=valAt(Pk,T0);return !(ok(v)&&Pk.every(([t,x])=>t<=T0||t>T||ok(x)));};
      const vol=ac.createGain(),chain=[ag];
      [['low','lowshelf',150],['mid','peaking',1000,.7],['high','highshelf',5000]].forEach(([k,ty,f,q])=>{const Pk=P(k);if(!need(Pk,x=>x===.5))return null;const n=bqx(ac,ty,f,q);chain.push(n);sched(n.gain,Pk,eqDb,T0,T,at,true);return n;});
      if(need(pf,x=>x<=.53)){const n=bqx(ac,'highpass',10,.7);chain.push(n);sched(n.frequency,pf,hpF,T0,T,at,true);}
      if(need(pf,x=>x>=.47)){const n=bqx(ac,'lowpass',22000,.7);chain.push(n);sched(n.frequency,pf,lpF,T0,T,at,true);}
      chain.push(vol);src.connect(ag);chain.reduce((x,y)=>{x.connect(y);return y;});vol.connect(dest);
      const pr=src.playbackRate,r0=rateAt(rec,ts);pr.value=r0;pr.setValueAtTime(r0,at(ts));
      rec.segs.forEach(sg=>{if(sg.t1<=ts)return;const a=Math.max(sg.t0,ts);if(sg.r0!==sg.r1){pr.setValueAtTime(rateAt(rec,a),at(a));pr.linearRampToValueAtTime(sg.r1,at(sg.t1));}else pr.setValueAtTime(sg.r0,at(a));});
      sched(vol.gain,P('vol'),v=>v,T0,T,at,false);
      if(hasEcho(rec,prev)){
        const snd=ac.createGain(),dl=ac.createDelay(4),fb=ac.createGain(),eh=bqx(ac,'highpass',280,.7);
        dl.delayTime.value=clamp(60/rec.bpmOut,.05,3.9);fb.gain.value=.6;
        vol.connect(snd);snd.connect(dl);dl.connect(eh);eh.connect(fb);fb.connect(dl);eh.connect(dest);
        sched(snd.gain,P('echo'),v=>v,T0,T,at,false);
      }
      src.start(at(ts),clamp(posAt(rec,ts),0,t.duration-.001));src.stop(at(Math.min(rec.E,T1))+.02);
      srcs.push(src);
    });
    return srcs;
  }

  /* ---------- rendu hors ligne ----------
     Volume master puis limiteur à anticipation de 2 ms (seuil -1 dB, retour 120 ms), calculé en JS :
     même rôle que le limiteur du master en direct, bien plus rapide hors ligne. */
  function limit(L,R,sr){
    const n=L.length,thr=dbToGain(-1),N=Math.max(1,Math.round(.002*sr)),W=2*N,rel=Math.exp(-1/(.12*sr));
    const req=new Float32Array(n),mn=new Float32Array(n),dq=new Int32Array(n);
    for(let i=0;i<n;i++){const a=Math.max(Math.abs(L[i]),Math.abs(R[i]));req[i]=a>thr?thr/a:1;}
    // minimum glissant sur [i, i+2N] (file monotone), puis moyenne sur [i-N, i] : le gain est déjà bas au pic
    let hd=0,tl=0;
    for(let i=n-1;i>=0;i--){while(tl>hd&&req[dq[tl-1]]>=req[i])tl--;dq[tl++]=i;while(dq[hd]>i+W)hd++;mn[i]=req[dq[hd]];}
    let acc=0,g=1;
    for(let i=0;i<n;i++){acc+=mn[i];if(i>=N)acc-=mn[i-N];const sm=acc/Math.min(N,i+1),r=1-(1-g)*rel;g=sm<r?sm:r;L[i]*=g;R[i]*=g;}
  }
  // rend [f0, f1[ (en échantillons) avec « pre » échantillons de préroulement (traînes d'écho, filtres, limiteur)
  async function renderFrames(L,f0,f1,sr,pre){
    pre=Math.min(pre,f0);const n=Math.max(1,f1-f0+pre),ac=new OfflineAudioContext(2,n,sr),m=ac.createGain();
    m.gain.value=S.masterVol;m.connect(ac.destination);
    graph(ac,L,(f0-pre)/sr,f1/sr,m,0);
    const b=await ac.startRendering(),l=b.getChannelData(0),r=b.getChannelData(1);limit(l,r,sr);
    return[l.subarray(pre),r.subarray(pre)];
  }
  async function renderRange(T0,T1,o={}){
    const L=o.L||compute(),sr=o.sr||ctx.sampleRate,f0=Math.round(T0*sr),f1=Math.round(Math.min(T1,L.total+1)*sr);
    const[l,r]=await renderFrames(L,f0,f1,sr,Math.round(6*sr));return{sr,L:l,R:r,T0:f0/sr};
  }
  function pcm(L,R,bits){
    const n=L.length,B=bits>>3,out=new Uint8Array(n*2*B);let o=0;
    for(let i=0;i<2*n;i++){const x=(i&1?R:L)[i>>1],v=x>1?1:x<-1?-1:x;
      if(B===2){const s=Math.round(v<0?v*32768:v*32767);out[o++]=s&255;out[o++]=(s>>8)&255;}
      else{const s=Math.round(v<0?v*8388608:v*8388607);out[o++]=s&255;out[o++]=(s>>8)&255;out[o++]=(s>>16)&255;}}
    return out;
  }
  function wavHeader(len,sr,bits){
    const b=new ArrayBuffer(44),v=new DataView(b),s=(o,t)=>{for(let i=0;i<4;i++)v.setUint8(o+i,t.charCodeAt(i));};
    s(0,'RIFF');v.setUint32(4,36+len,true);s(8,'WAVE');s(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
    v.setUint32(24,sr,true);v.setUint32(28,sr*2*bits/8,true);v.setUint16(32,2*bits/8,true);v.setUint16(34,bits,true);s(36,'data');v.setUint32(40,len,true);
    return new Uint8Array(b);
  }
  const RD={on:false,cancel:false,p:0};
  /* Rendu par tranches de 60 s (une heure de set ne tient pas d'un bloc en mémoire de calcul),
     chacune avec 6 s de préroulement : les traînes d'écho et les filtres passent d'une tranche à l'autre. */
  async function renderWav(o={}){
    if(RD.on)return null;
    const L=compute();if(!L.R.length)return null;
    const sr=o.sr||ctx.sampleRate,bits=o.bits||OPT.bits,total=L.total+1,N=Math.round(total*sr),CH=Math.round(60*sr),pre=Math.round(6*sr),parts=[];let bytes=0;
    Object.assign(RD,{on:true,cancel:false,p:0});prog();
    try{
      for(let f0=0;f0<N;f0+=CH){
        if(RD.cancel)return null;
        const f1=Math.min(N,f0+CH),[l,r]=await renderFrames(L,f0,f1,sr,pre),c=pcm(l,r,bits);parts.push(c);bytes+=c.length;
        RD.p=f1/N;prog();o.onProgress&&o.onProgress(RD.p);
        await new Promise(res=>setTimeout(res,0));
      }
    }finally{RD.on=false;prog();}
    return{blob:new Blob([wavHeader(bytes,sr,bits),...parts],{type:'audio/wav'}),bytes:bytes+44,frames:N,sr,bits,total};
  }
  const fileBase=()=>String(PL.name||'set').replace(/[\\/:*?"<>|]+/g,'-').trim()||'set';
  async function renderAndSave(){
    if(RD.on){RD.cancel=true;return;}
    if(!live().length){toast('Ajoute au moins un morceau au set');return;}
    const t0=performance.now(),r=await renderWav();
    if(!r){toast('Rendu annulé');return;}
    const name=fileBase()+'.wav',Nt=window.mixlabNative;
    toast(`Set rendu : ${dur(r.total)} en ${((performance.now()-t0)/1000).toFixed(0)} s`,'ok');
    if(Nt&&Nt.saveBinary){try{const p=await Nt.saveBinary(name,new Uint8Array(await r.blob.arrayBuffer()));if(p)toast('Enregistré : '+p,'ok');}catch(e){toast('Impossible d’enregistrer : '+e);}return;}
    const url=URL.createObjectURL(r.blob),a=h('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }

  /* ---------- écoute en direct (casque ou master) ---------- */
  const LV={on:false,srcs:[],out:null,base:0,T0:0,T1:0,timer:0,kind:''};
  function playRange(T0,T1,where,kind){
    stopPlay(true);resumeAudio();
    const L=compute();if(!L.R.length)return false;
    T1=Math.min(T1,L.total+.5);if(T1<=T0)return false;
    if(where==='cue'&&!S.split&&!S.hpDevice)toast('Pas de casque séparé : active Split ou choisis une sortie casque dans Audio pour entendre la préécoute');
    const out=ctx.createGain();out.connect(where==='cue'?bus.cue:bus.sum);
    const base=ctx.currentTime+.08;
    Object.assign(LV,{on:true,srcs:graph(ctx,L,T0,T1,out,base),out,base,T0,T1,kind,where});
    LV.timer=setTimeout(()=>stopPlay(),(T1-T0)*1000+400);
    renderTransport();loop();return true;
  }
  function stopPlay(quiet){
    clearTimeout(LV.timer);if(!LV.on)return;
    const o=LV.out,t=ctx.currentTime;o.gain.setTargetAtTime(0,t,.012);
    LV.srcs.forEach(s=>{try{s.stop(t+.06);}catch(e){}});
    setTimeout(()=>{try{o.disconnect();}catch(e){}},400);
    LV.on=false;LV.srcs=[];if(!quiet){renderTransport();draw();}
  }
  const playPos=()=>LV.on?clamp(LV.T0+ctx.currentTime-LV.base,LV.T0,LV.T1):null;
  function auditionTr(i,where){
    const L=compute(),r=L.R[i];if(!r||r.trStart==null)return false;
    const pad=8*60/r.bpmOut;
    return playRange(Math.max(0,r.trStart-pad),r.E+pad,where||PL.out,'tr'+i);
  }
  function playSet(from){return playRange(from??PL.cursor??0,Infinity,PL.out,'set');}

  /* ---------- exports ---------- */
  const setTracks=()=>live().map(tOf);
  function m3u(){return LibPro.toM3U(setTracks(),PL.name);}
  function rekordbox(){
    const ts=setTracks(),uniq=[...new Map(ts.map(t=>[t.id,t])).values()];
    return LibPro.toRekordbox(uniq,[{id:'set',name:PL.name,ids:ts.map(t=>t.id)}],[]);
  }
  function tracklist(){
    const L=compute();if(!L.R.length)return'';
    return['Mixlab · '+PL.name+' · '+dur(L.total),'']
      .concat(L.R.map(r=>{const t=r.t,k=kcode(t);return stamp(r.S)+' '+(t.artist?t.artist+' - ':'')+t.title+' ('+r.bpmIn.toFixed(1).replace(/\.0$/,'')+' BPM'+(k?', '+k:'')+')';})).join('\n')+'\n';
  }
  function saveAsPlaylist(){
    const ids=setTracks().map(t=>t.id);if(!ids.length){toast('Le set est vide');return;}
    let p=LIB.playlists.find(x=>x.name===PL.name);
    if(p)p.ids=ids;else{p={id:'set'+Date.now().toString(36),name:PL.name,ids};LIB.playlists.push(p);}
    typeof renderSide==='function'&&renderSide();window.LibPro&&LibPro.saveBrowser&&LibPro.saveBrowser();
    toast('Playlist « '+PL.name+' » enregistrée','ok');
  }
  const exp=(kind)=>{
    if(!live().length){toast('Le set est vide');return;}
    const b=fileBase();
    if(kind==='m3u')LibPro.saveFile(b+'.m3u8',m3u(),'audio/x-mpegurl');
    else if(kind==='xml')LibPro.saveFile(b+'-rekordbox.xml',rekordbox(),'application/xml');
    else LibPro.saveFile(b+'-tracklist.txt',tracklist());
  };

  /* ---------- constructeur de playlist en français (local) ---------- */
  const GENRES=['deep house','tech house','afro house','progressive house','melodic techno','hard techno','minimal','house','techno','trance','nu disco','disco','funk','hip hop','rap','drum and bass','dnb','dubstep','uk garage','garage','breakbeat','electro','pop','rock','reggaeton','reggae','dancehall','amapiano','afro','latino','zouk','variete','soul','jazz','ambient','downtempo','trap','hardstyle'];
  const SHAPES={
    up:['energie qui monte','energie montante','qui monte','qui grimpe','en montee','montee','crescendo','de plus en plus fort','monte'],
    down:['energie qui descend','qui descend','qui redescend','redescente','descente','decrescendo','qui retombe','descend'],
    high:['haute energie','energie haute','qui tape','a fond','banger','bangers','gros son','energique','pic'],
    low:['basse energie','energie basse','calme','chill','doux','douce','tranquille','lounge','relax'],
    wave:['montagnes russes','en vagues','vagues','vague','yoyo']};
  const TPLW={warmup:['warm up','warm-up','warmup','echauffement','ouverture'],peak:['peak time','peak','heure de pointe'],closing:['closing','fin de soiree','cloture'],
    mariage:['mariage'],bar:['bar','apero'],anniversaire:['anniversaire','anniv']};
  const TPL_SHAPE={warmup:'up',peak:'high',closing:'down'};
  const STOP=new Set('de la le les du des un une et en avec pour qui a au aux set mix playlist morceaux morceau bpm energie d l fais moi fait je veux donne construis cree creer sur dans tempo titres titre son sons genre style puis plutot bien tres track tracks total duree pendant ca me mon ma mes un peu des stp svp s il te plait tonalite cle entre qu que'.split(' '));
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const ph=w=>new RegExp(' '+esc(w).replace(/ /g,' ')+'(?= )','g');
  function parse(q){
    let s=' '+fold(q).replace(/[«»"“”,;!?()]/g,m=>m===','?' , ':' ').replace(/\s+/g,' ').trim()+' ';
    const Q={raw:q,genres:[],without:[],bpm:null,dur:null,n:null,shape:null,energy:null,compat:false,seed:null,key:null,tpl:null,noDemo:false,fresh:false,ignored:[],chips:[]};
    const cut=(re,f)=>{s=s.replace(re,(...m)=>{const r=f(...m);return r===false?m[0]:'  ';});};
    const has=w=>ph(w).test(s);
    // après « Néons » : le morceau de départ, cherché dans la bibliothèque
    const sm=/ (?:apres|a partir de|depuis|a la suite de|dans la foulee de|enchainer sur|enchaine sur|suite a|derriere) (.+)$/.exec(s);
    if(sm){
      const rest=sm[1].split(' , ')[0].trim();let best=null,len=0;
      for(const t of LIB.tracks){const ft=fold(t.title).trim();if(ft&&(rest===ft||rest.startsWith(ft+' '))&&ft.length>len){best=t;len=ft.length;}}
      if(!best){const w=rest.split(' ')[0];best=w.length>2?LIB.tracks.find(t=>fold(t.title).split(/[^a-z0-9]+/).includes(w))||null:null;len=best?w.length:0;}
      if(best)Q.seed=best;else Q.ignored.push('morceau introuvable : '+rest);
      s=s.slice(0,sm.index)+' '+(best?sm[1].slice(len):sm[1].slice(rest.length))+' ';
    }
    // durée
    cut(/ (?:une|1) heure et demie /g,()=>{Q.dur=5400;});
    cut(/ une demi[- ]heure /g,()=>{Q.dur=1800;});
    cut(/ (\d+(?:[.,]\d+)?) ?h(?:eures?)?(?: ?(\d{1,2})(?: ?min(?:utes)?)?)?(?= )/g,(m,a,b)=>{Q.dur=(Q.dur||0)+parseFloat(a.replace(',','.'))*3600+(b?+b*60:0);});
    cut(/ une heure /g,()=>{Q.dur=3600;});
    cut(/ (\d{1,3}) ?(?:min|mn|minutes)(?= )/g,(m,a)=>{Q.dur=(Q.dur||0)+a*60;});
    cut(/ (\d{1,3}) ?(?:morceaux|titres|tracks|sons|chansons|disques)(?= )/g,(m,a)=>{Q.n=+a;});
    // énergie chiffrée
    cut(/ energie (?:de |entre )?(\d{1,2}) ?(?:-|a|et) ?(\d{1,2})(?= )/g,(m,a,b)=>{Q.energy=[Math.min(+a,+b),Math.max(+a,+b)];});
    cut(/ energie (?:de )?(\d{1,2})(?= )/g,(m,a)=>{Q.energy=[clamp(+a-1,1,10),clamp(+a+1,1,10)];});
    // tempo
    const okB=x=>x>=60&&x<=200,rng=(a,b)=>okB(+a)&&okB(+b)?(Q.bpm=[Math.min(+a,+b),Math.max(+a,+b)],true):false;
    cut(/ entre (\d{2,3}) et (\d{2,3})(?: ?bpm)?(?= )/g,(m,a,b)=>rng(a,b));
    cut(/ (\d{2,3}) ?(?:-|–|a|\/|>) ?(\d{2,3})(?: ?bpm)?(?= )/g,(m,a,b)=>rng(a,b));
    cut(/ (?:vers|autour de|environ|a peu pres|~) ?(\d{2,3})(?: ?bpm)?(?= )/g,(m,a)=>okB(+a)?(Q.bpm=[+a-3,+a+3],true):false);
    cut(/ (?:plus de|au[- ]dessus de|minimum|au moins) (\d{2,3})(?: ?bpm)?(?= )/g,(m,a)=>okB(+a)?(Q.bpm=[+a,200],true):false);
    cut(/ (?:moins de|sous|en dessous de|maximum|au plus) (\d{2,3})(?: ?bpm)?(?= )/g,(m,a)=>okB(+a)?(Q.bpm=[60,+a],true):false);
    cut(/ (\d{2,3}) ?bpm(?= )/g,(m,a)=>okB(+a)?(Q.bpm=[+a-2,+a+2],true):false);
    // tonalité (roue harmonique)
    cut(/ (?:en |tonalite |cle )?(1[0-2]|[1-9]) ?([ab])(?= )/g,(m,a,b)=>{const n=+a,minor=b==='a',pc=(minor?WHEEL_MIN:WHEEL_MAJ).indexOf(n);Q.key={pc,minor};});
    // trames et formes d'énergie
    for(const[k,ws]of Object.entries(TPLW))for(const w of ws)if(has(w)){Q.tpl=Q.tpl||k;cut(ph(w),()=>{});}
    for(const[k,ws]of Object.entries(SHAPES))for(const w of ws)if(has(w)){Q.shape=Q.shape||k;cut(ph(w),()=>{});}
    if(!Q.shape&&Q.tpl)Q.shape=TPL_SHAPE[Q.tpl]||null;
    for(const w of['tonalites compatibles','tonalite compatible','mix harmonique','en harmonie','harmoniques','harmonique','harmonic','compatibles','compatible','meme tonalite'])if(has(w)){Q.compat=true;cut(ph(w),()=>{});}
    cut(/ sans (?:les )?demos? /g,()=>{Q.noDemo=true;});
    cut(/ (?:jamais|pas encore) joues? | inedits? | jamais passes? /g,()=>{Q.fresh=true;});
    // genres : ceux de ta bibliothèque d'abord, puis une liste courante
    const libG=[...new Set(LIB.tracks.map(t=>fold(t.genre).trim()).filter(Boolean))];
    const GS=[...new Set(libG.concat(GENRES))].sort((a,b)=>b.length-a.length);
    for(const g of GS){cut(new RegExp(' sans (?:la |le |les |de la |du |de )?'+esc(g)+'(?= )','g'),()=>{Q.without.push(g);});}
    for(const g of GS)if(has(g)){Q.genres.push(g);cut(ph(g),()=>{});}
    Q.ignored.push(...s.split(' ').filter(w=>w&&w!==','&&!STOP.has(w)&&!/^\d+$/.test(w)));
    if(Q.n&&!Q.dur&&Q.n>200)Q.n=200;
    // résumé lisible
    const C=Q.chips,TPL=(window.Academie&&Academie.TPL)||{};
    if(Q.seed)C.push('Après « '+Q.seed.title+' »');
    if(Q.genres.length)C.push('Genre : '+Q.genres.join(', '));
    if(Q.without.length)C.push('Sans : '+Q.without.join(', '));
    if(Q.bpm)C.push('Tempo : '+(Q.bpm[1]>=200?'plus de '+Q.bpm[0]:Q.bpm[0]<=60?'moins de '+Q.bpm[1]:Q.bpm[0]+'-'+Q.bpm[1])+' BPM');
    if(Q.tpl&&TPL[Q.tpl])C.push('Trame : '+TPL[Q.tpl].label);
    if(Q.shape)C.push({up:'Énergie qui monte',down:'Énergie qui descend',high:'Énergie haute',low:'Énergie basse',wave:'Énergie en vagues'}[Q.shape]);
    if(Q.energy)C.push('Énergie '+Q.energy[0]+'-'+Q.energy[1]);
    if(Q.key)C.push('Tonalité '+keyInfo(Q.key).code);
    if(Q.compat)C.push('Tonalités compatibles');
    if(Q.dur)C.push('Durée : '+dur(Q.dur));
    if(Q.n)C.push(Q.n+' morceaux');
    if(Q.noDemo)C.push('Sans les démos');
    if(Q.fresh)C.push('Jamais joués');
    return Q;
  }
  function target(Q){
    const[lo,hi]=Q.energy||[3,8],TPL=(window.Academie&&Academie.TPL)||{};
    if(Q.tpl&&TPL[Q.tpl]&&!Q.energy){const c=TPL[Q.tpl].curve;return x=>{const f=clamp(x,0,1)*(c.length-1),i=Math.floor(f),j=Math.min(c.length-1,i+1);return c[i]+(c[j]-c[i])*(f-i);};}
    switch(Q.shape){
      case'up':return x=>lo+(hi-lo)*x;case'down':return x=>hi-(hi-lo)*x;
      case'high':return()=>Math.max(hi,7);case'low':return()=>Math.min(lo,4);
      case'wave':return x=>(lo+hi)/2+(hi-lo)/2*Math.sin(x*Math.PI*3);
    }
    return Q.energy?()=>(lo+hi)/2:null;
  }
  const playLen=t=>Math.max(30,endOf(t)-Math.max(0,t.grid)-16*240/t.bpm);
  const inBpm=(t,r)=>[1,2,.5].some(f=>t.bpm*f>=r[0]-.01&&t.bpm*f<=r[1]+.01);
  /* Pioche gloutonne : à chaque pas, la note de Suggest (tonalité, tempo, énergie, déjà joué)
     plus l'écart à la courbe d'énergie voulue. « compatible » : chaque morceau doit l'être avec le précédent. */
  function fromQuery(q){
    const Q=typeof q==='string'?parse(q):q,TPL=(window.Academie&&Academie.TPL)||{};
    let pool=LIB.tracks.filter(t=>t!==Q.seed);
    if(Q.genres.length)pool=pool.filter(t=>{const g=fold(t.genre);return Q.genres.some(x=>g.includes(x));});
    if(Q.without.length)pool=pool.filter(t=>{const g=fold(t.genre);return!Q.without.some(x=>g.includes(x));});
    if(Q.bpm)pool=pool.filter(t=>inBpm(t,Q.bpm));
    if(Q.energy)pool=pool.filter(t=>{const e=nrg(t);return e>=Q.energy[0]&&e<=Q.energy[1];});
    if(Q.key)pool=pool.filter(t=>t.key&&keysCompatible(Q.key,t.key));
    if(Q.noDemo)pool=pool.filter(t=>!t.demo);
    if(Q.fresh)pool=pool.filter(t=>!t.plays);
    const tg=target(Q),tb=Q.tpl&&TPL[Q.tpl]&&!Q.bpm?TPL[Q.tpl].bpm:null,max=Q.n||(Q.dur?999:12);
    const list=[];let cur=Q.seed,el=Q.seed?playLen(Q.seed):0,why='';
    while(pool.length&&list.length<max&&!(Q.dur&&el>=Q.dur)){
      const x=Q.dur?el/Q.dur:list.length/Math.max(1,Math.min(max,list.length+pool.length)-1);
      let best=null,bs=-1e9;
      for(const t of pool){
        if(Q.compat&&cur&&cur.key&&t.key&&!keysCompatible(cur.key,t.key))continue;
        let sc=cur?Suggest.rate(Suggest.refOf(cur),t).score:50;
        if(tg)sc-=9*Math.abs(nrg(t)-tg(x));
        if(tb&&!inBpm(t,tb))sc-=12;
        if(cur&&Q.shape==='up'&&t.bpm<cur.bpm-.5)sc-=6;
        if(cur&&Q.shape==='down'&&t.bpm>cur.bpm+.5)sc-=6;
        if(!cur&&Q.shape==='up')sc-=t.bpm*.02;
        if(sc>bs){bs=sc;best=t;}
      }
      if(!best){why='Plus de morceau compatible avec « '+cur.title+' » dans la sélection.';break;}
      list.push(best);pool=pool.filter(t=>t!==best);el+=playLen(best);cur=best;
    }
    if(!list.length&&!why)why='Aucun morceau ne correspond.';
    else if(Q.dur&&el<Q.dur)why=why||`Pas assez de morceaux pour ${dur(Q.dur)} : ${dur(el)} environ.`;
    return{Q,ids:(Q.seed?[Q.seed]:[]).concat(list).map(t=>t.id),length:el,why};
  }

  /* ---------- relecture des transitions jouées ----------
     On garde 2 minutes d'historique des commandes (fader, EQ, filtre, crossfader). Quand le coach
     termine le bilan d'une transition, on lui joint ce qui a bougé entre son début et sa fin. */
  const HIST=[],RP=[];
  function sample(){
    if(!decks.some(d=>d.active&&d.playing))return;
    const s={t:nowS(),xf:S.xf,d:{}};
    decks.forEach(d=>{if(!d.active||!d.track)return;const p=d.p;s.d[d.id]={f:p.fader,g:Math.min(1,faderGain(p.fader)*xfGainOf(d)),low:p.kill.low?0:p.low,mid:p.kill.mid?0:p.mid,high:p.kill.high?0:p.high,filter:p.filter,on:d.playing};});
    HIST.push(s);while(HIST.length&&HIST[0].t<s.t-150)HIST.shift();
  }
  function onTransition(r,t){
    try{
      const t0=t.t0-1,t1=nowS(),sm=HIST.filter(s=>s.t>=t0&&s.d[r.from]&&s.d[r.to]).map(s=>({t:s.t-t0,a:s.d[r.from],b:s.d[r.to]}));
      if(sm.length<3)return;
      const to=deckById(r.to);
      r.replay={from:r.from,to:r.to,len:t1-t0,bpm:to&&to.track?to.bpm:120,samples:sm,title:r.title,fromTitle:t.from&&t.from.track?t.from.track.title:''};
      RP.unshift(r);RP.length=Math.min(RP.length,6);
      if(V.root&&!V.root.hidden)renderReplays();
    }catch(e){}
  }
  // mini frise : volume réel (fader × crossfader), graves et filtre des deux platines
  function replayEl(r){
    const R=r&&r.replay;if(!R)return null;
    const W=520,H=150,cv=h('canvas',{class:'pl-replay',width:W,height:H,'aria-label':`Relecture de la transition ${R.from} → ${R.to}`});
    const g=cv.getContext('2d'),rows=[['g','Volume'],['low','Graves'],['filter','Filtre']],x0=96,rh=(H-20)/3,X=t=>x0+(W-x0-8)*t/R.len;
    g.font='22px '+getComputedStyle(document.body).fontFamily;g.textBaseline='middle';
    const spb=60/(R.bpm||120)*4;g.strokeStyle=TK['line-2'];g.lineWidth=1;
    for(let b=0;b*spb<R.len;b++){const x=X(b*spb);g.globalAlpha=b%4?.35:.9;g.beginPath();g.moveTo(x,4);g.lineTo(x,H-18);g.stroke();}
    g.globalAlpha=1;
    rows.forEach(([k,lab],i)=>{
      const y0=6+i*rh,Y=v=>y0+rh-6-(rh-12)*v;g.fillStyle=TK['text-lo'];g.fillText(lab,4,y0+rh/2);
      for(const[side,col]of[['a',COL[R.from]],['b',COL[R.to]]]){g.strokeStyle=col;g.lineWidth=3;g.beginPath();R.samples.forEach((s,j)=>{const x=X(s.t),y=Y(s[side][k]);j?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();}
    });
    g.fillStyle=TK['text-lo'];g.fillText(`${(R.len*R.bpm/240).toFixed(0)} mesures · ${R.from} sort, ${R.to} entre`,x0,H-9);
    return cv;
  }
  // une transition jouée devient les courbes de la transition choisie dans le plan
  function replayToLanes(r,i){
    const R=r.replay,its=live(),it=its[i];if(!R||!it||!its[i+1])return false;
    const simp=(side,k,map)=>{const pts=[];R.samples.forEach(s=>{const p=clamp(s.t/R.len,0,1),v=clamp(map(s[side]),0,1);const l=pts[pts.length-1];if(!l||Math.abs(l[1]-v)>.03)pts.push([+p.toFixed(4),+v.toFixed(3)]);});
      if(!pts.length||pts[0][0]>0)pts.unshift([0,pts.length?pts[0][1]:NEU[k]]);if(pts[pts.length-1][0]<1)pts.push([1,pts[pts.length-1][1]]);
      if(pts.length>48){const st=Math.ceil(pts.length/48);return pts.filter((x,j)=>j%st===0||j===pts.length-1);}return pts;};
    const lanes={out:{},in:{}};
    for(const[side,s]of[['out','a'],['in','b']]){lanes[side].vol=simp(s,'vol',x=>x.g);for(const k of['low','mid','high','filter'])lanes[side][k]=simp(s,k,x=>x[k]);lanes[side].echo=[[0,0],[1,0]];}
    it.tr={...it.tr,lanes,preset:it.tr.preset,custom:true,bars:clamp(Math.round(R.len*R.bpm/240),1,64)};
    changed();return true;
  }

  /* ---------- coach : la règle du point de mix ---------- */
  const coachRule={id:'mixpoint',sev:'tip',after:0,test(x){
    if(!OPT.links||x.inc||!x.main||!x.main.track||(window.AutoMix&&AutoMix.state.on))return null;
    const o=decks.find(d=>d!==x.main&&d.active&&d.track&&!d.playing),l=o&&link(x.main.track,o.track);if(!l)return null;
    const left=x.main.beatIdx(l.outT)-x.main.beatPos();if(left<-1||left>64)return null;
    const P=PRESETS[l.preset]||PRESETS.bass,bars=Math.max(0,Math.ceil(left/4));
    return{sev:bars<=2?'warn':'tip',msg:bars?`Point de mix préparé : ${o.id} entre dans ${bars} mesure${bars>1?'s':''}`:`Point de mix préparé : lance ${o.id} maintenant`,
      why:`Prévu en préparation : ${P.label.toLowerCase()} sur ${l.bars} mesure${l.bars>1?'s':''}, entrée de ${o.id} à ${fmtTime(l.inT,false)}. Lance ${o.id} sur le 1.`,target:o.id+'.play'};}};

  // une platine qui charge le morceau prévu après celui qui joue se cale sur le point d'entrée
  function autoCue(){
    if(!OPT.links||!OPT.autoCue)return;
    for(const d of decks){
      if(!d.active||!d.track){d._plT=null;continue;}
      if(d._plT===d.track)continue;d._plT=d.track;
      if(d.playing||(window.AutoMix&&AutoMix.state.on))continue;
      const m=decks.find(x=>x!==d&&x.active&&x.track&&x.playing),l=m&&link(m.track,d.track);
      if(!l||Math.abs(d.position()-(d.track.cue??d.track.grid))>.05)continue;
      d.seek(l.inT);toast(`Point de mix préparé : ${d.id} calée sur l’entrée prévue (${fmtTime(l.inT,false)})`,'ok');
    }
  }

  /* ---------- vue ---------- */
  const V={root:null,el:{},drag:null,raf:0};
  const TL={ruler:18,l0:24,lh:68,gap:14};
  const laneY=i=>TL.l0+(i%2)*(TL.lh+TL.gap);
  const tlH=()=>TL.l0+2*TL.lh+TL.gap+6;
  let LC=null;
  function pps(){const w=V.el.wrap?V.el.wrap.clientWidth:800;return Math.max(.05,(w-24)/Math.max(30,(LC&&LC.total)||60))*PL.zoom;}
  const css=`
#pl{flex:1 1 auto;min-width:0;display:grid;grid-template-columns:260px minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr);gap:var(--sp-2);padding:var(--sp-2);overflow:hidden;background:var(--surface-0)}
body.planner #app{display:none!important}
#pl[hidden]{display:none}
#pl .pl-head,#pl .pl-q{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center;background:var(--surface-1);border:1px solid var(--line-1);border-radius:var(--r-2);padding:var(--sp-2)}
#pl .pl-name{background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r-1);color:var(--text-hi);font:600 var(--fs-2) var(--ui);padding:3px 6px;width:180px}
#pl .pl-stat{color:var(--text-lo);font:500 var(--fs-1) var(--num)}
#pl .pl-sp{flex:1}
#pl .pl-prog{width:140px;height:6px;background:var(--surface-3);border-radius:3px;overflow:hidden}#pl .pl-prog i{display:block;height:100%;background:var(--state-ok);width:0}
#pl .pl-q input{flex:1 1 320px;min-width:200px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r-1);color:var(--text-hi);font:500 var(--fs-2) var(--ui);padding:5px 8px}
#pl .pl-chips{display:flex;flex-wrap:wrap;gap:4px;flex-basis:100%}#pl .pl-chip{font-size:var(--fs-1);padding:2px 6px;border-radius:var(--r-1);background:var(--surface-3);color:var(--text-mid)}#pl .pl-chip.bad{color:var(--state-warn)}
#pl .pl-side,#pl .pl-main{min-height:0;background:var(--surface-1);border:1px solid var(--line-1);border-radius:var(--r-2);padding:var(--sp-2);display:flex;flex-direction:column;gap:var(--sp-2)}
#pl .pl-main{overflow:auto}
#pl .pl-side input{background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r-1);color:var(--text-hi);padding:4px 6px;font-size:var(--fs-1)}
#pl .pl-lib{list-style:none;margin:0;padding:0;overflow:auto;flex:1;min-height:0}
#pl .pl-lib li,#pl .pl-card{display:flex;gap:6px;align-items:center;padding:4px;border-radius:var(--r-1);font-size:var(--fs-1);color:var(--text-mid)}
#pl .pl-lib li:hover{background:var(--surface-2)}#pl .pl-lib .t,#pl .pl-card .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#pl .pl-meta{color:var(--text-lo);font:500 var(--fs-1) var(--num)}
#pl .pl-wrap{position:relative;overflow-x:auto;overflow-y:hidden;flex:none;background:var(--surface-0);border-radius:var(--r-1)}
#pl .pl-wrap canvas{position:sticky;left:0;display:block}
#pl .pl-cards{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;flex:none}
#pl .pl-card{flex:none;width:250px;background:var(--surface-2);border:1px solid var(--line-2);flex-wrap:wrap}
#pl .pl-card .t{flex:1 1 calc(100% - 60px)}#pl .pl-card.sel{border-color:var(--text-lo)}#pl .pl-card .n{font:600 var(--fs-1) var(--num);color:var(--text-lo)}
#pl .pl-bot{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:var(--sp-2);min-height:0}
#pl .pl-tr,#pl .pl-rp{background:var(--surface-2);border-radius:var(--r-1);padding:var(--sp-2);display:flex;flex-direction:column;gap:6px;min-width:0}
#pl .pl-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:var(--fs-1);color:var(--text-mid)}
#pl .pl-row .b[aria-pressed="true"]{color:var(--text-hi);border-color:var(--text-lo);background:var(--surface-4)}
#pl .ok{color:var(--state-ok)}#pl .warn{color:var(--state-warn)}#pl .bad{color:var(--state-bad)}
#pl .pl-lanes{width:100%;height:204px;display:block;cursor:crosshair;touch-action:none}
#pl .pl-hint,#pl .pl-empty{font-size:var(--fs-1);color:var(--text-lo)}
.pl-replay{width:100%;height:auto;display:block;margin-top:4px;background:var(--surface-0);border-radius:var(--r-1)}
@media (max-width:1100px){#pl{grid-template-columns:minmax(0,1fr)}#pl .pl-side{max-height:220px}#pl .pl-bot{grid-template-columns:minmax(0,1fr)}}`;

  function build(){
    document.head.append(h('style',{id:'planner-css'},css));
    const E=V.el;
    E.btn=h('button',{class:'tb',id:'set-btn',type:'button',title:'Préparer un set : frise, transitions, rendu WAV, export','aria-pressed':'false',onclick:()=>toggle()},'Set');
    const am=$('#am-btn'),cb=$('#coach-btn');if(am)am.after(E.btn);else if(cb)cb.before(E.btn);else $('#top').append(E.btn);
    E.name=h('input',{class:'pl-name','aria-label':'Nom du set',value:PL.name});E.name.addEventListener('change',()=>{PL.name=E.name.value.trim()||'Mon set';save();});
    E.stat=h('span',{class:'pl-stat'});
    E.mode=h('select',{class:'sel','aria-label':'Tempo du set',title:'Naturel : chaque morceau revient à son tempo après la transition. Verrouillé : tout le set au même tempo.'},h('option',{value:'glide'},'Tempo naturel'),h('option',{value:'lock'},'Tempo verrouillé'));
    E.mode.value=PL.mode;E.mode.addEventListener('change',()=>{PL.mode=E.mode.value;changed();});
    E.bpm=h('input',{type:'number',min:60,max:200,step:.5,class:'pl-name',style:'width:64px','aria-label':'Tempo verrouillé (BPM, vide : celui du premier morceau)',placeholder:'BPM'});
    E.bpm.value=PL.bpm||'';E.bpm.addEventListener('change',()=>{PL.bpm=clamp(+E.bpm.value||0,0,200);changed();});
    const TPL=(window.Academie&&Academie.TPL)||{};
    E.tpl=h('select',{class:'sel','aria-label':'Trame d’énergie à comparer'},h('option',{value:''},'Sans trame'),Object.entries(TPL).map(([k,t])=>h('option',{value:k},'Trame : '+t.label)));
    E.tpl.value=PL.tpl||'';E.tpl.addEventListener('change',()=>{PL.tpl=E.tpl.value;save();draw();});
    E.out=h('select',{class:'sel','aria-label':'Sortie de l’écoute'},h('option',{value:'master'},'Écoute : master'),h('option',{value:'cue'},'Écoute : casque'));
    E.out.value=PL.out;E.out.addEventListener('change',()=>{PL.out=E.out.value;save();});
    E.play=h('button',{class:'b',type:'button',id:'pl-play',onclick:()=>{LV.on?stopPlay():playSet();}},'Lire le set');
    E.render=h('button',{class:'b',type:'button',id:'pl-render',title:'Rendu hors ligne du set en WAV, tempos calés et courbes appliquées',onclick:renderAndSave},'Rendu WAV');
    E.prog=h('i');E.progBox=h('span',{class:'pl-prog',hidden:true},E.prog);
    const ex=h('details',{class:'menu'},h('summary',{class:'b'},'Exporter'),h('div',{class:'pop',style:'display:grid;gap:4px;min-width:200px'},
      h('button',{class:'b',type:'button',id:'pl-m3u',onclick:()=>exp('m3u')},'Playlist M3U8'),
      h('button',{class:'b',type:'button',id:'pl-xml',onclick:()=>exp('xml')},'rekordbox XML'),
      h('button',{class:'b',type:'button',id:'pl-tl',onclick:()=>exp('tl')},'Tracklist horodatée'),
      h('button',{class:'b',type:'button',id:'pl-pl',onclick:saveAsPlaylist},'Playlist Mixlab')));
    ex.addEventListener('click',e=>{if(e.target.closest('.pop button'))ex.open=false;});
    const head=h('div',{class:'pl-head'},h('span',{class:'lbl'},'Préparation du set'),E.name,E.stat,h('span',{class:'pl-sp'}),E.mode,E.bpm,E.tpl,E.out,E.play,E.render,E.progBox,ex,
      h('button',{class:'b',type:'button',id:'pl-close',title:'Retour aux platines (Échap)',onclick:close},'Fermer'));
    E.q=h('input',{type:'text',id:'pl-q','aria-label':'Décris ton set',placeholder:'Décris ton set : « house 122-126 énergie qui monte 1h », « après Néons, compatible »'});
    E.chips=h('div',{class:'pl-chips'});
    const go=()=>buildFromText(E.q.value);
    E.q.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go();}e.stopPropagation();});
    const qrow=h('div',{class:'pl-q'},E.q,h('button',{class:'b',type:'button',id:'pl-go',onclick:go},'Construire'),
      h('button',{class:'b',type:'button',title:'Ajouter à la fin du set au lieu de le remplacer',onclick:()=>buildFromText(E.q.value,true)},'Ajouter'),E.chips);
    // bibliothèque
    E.find=h('input',{type:'search','aria-label':'Chercher un morceau',placeholder:'Chercher un morceau'});E.find.addEventListener('input',renderLib);E.find.addEventListener('keydown',e=>e.stopPropagation());
    E.lib=h('ul',{class:'pl-lib'});
    E.plSel=h('select',{class:'sel','aria-label':'Partir d’une playlist'});
    const side=h('div',{class:'pl-side'},h('span',{class:'lbl'},'Bibliothèque'),E.find,E.lib,
      h('div',{class:'pl-row'},E.plSel,h('button',{class:'b',type:'button',onclick:()=>{const p=LIB.playlists.find(x=>x.id===E.plSel.value);if(p&&p.ids.length)setItems(p.ids,{name:p.name});else toast('Cette playlist est vide');}},'Charger')),
      h('div',{class:'pl-row'},h('button',{class:'b',type:'button',title:'Deux clics pour vider le set',onclick:e=>{const b=e.currentTarget;
        if(b.dataset.ok){delete b.dataset.ok;b.textContent='Vider le set';PL.items=[];changed();return;}
        b.dataset.ok='1';b.textContent='Confirmer';setTimeout(()=>{delete b.dataset.ok;b.textContent='Vider le set';},3000);}},'Vider le set')));
    // frise
    E.cv=h('canvas',{id:'pl-frise','aria-label':'Frise du set'});E.spacer=h('div',{style:'height:1px'});
    E.wrap=h('div',{class:'pl-wrap'},E.cv,E.spacer);E.wrap.style.height=tlH()+16+'px';
    E.wrap.addEventListener('scroll',()=>draw());
    E.zoom=h('input',{type:'range',min:1,max:24,step:.5,value:PL.zoom,'aria-label':'Zoom de la frise'});E.zoom.addEventListener('input',()=>{PL.zoom=+E.zoom.value;save();draw();});
    E.cards=h('div',{class:'pl-cards'});
    E.tr=h('div',{class:'pl-tr',id:'pl-trans'});E.rp=h('div',{class:'pl-rp',id:'pl-replays'});
    const main=h('div',{class:'pl-main'},h('div',{class:'pl-row'},h('span',{class:'lbl'},'Frise'),h('span',{class:'pl-hint'},'Glisse un morceau pour déplacer la transition, Maj pour son point d’entrée, vers le haut ou le bas pour changer l’ordre ; le bord droit d’une zone de mix règle sa durée.'),h('span',{class:'pl-sp'}),h('span',{class:'lbl'},'Zoom'),E.zoom),
      E.wrap,E.cards,h('div',{class:'pl-bot'},E.tr,E.rp));
    V.root=h('section',{id:'pl',hidden:true,'aria-label':'Préparation du set'},head,qrow,side,main);
    const pc=$('#p-coach');pc?pc.before(V.root):$('#stage').append(V.root);
    canvasEvents();
    [E.cards,E.wrap].forEach(z=>{z.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('text/mixlab-track'))e.preventDefault();});
      z.addEventListener('drop',e=>{const id=+e.dataTransfer.getData('text/mixlab-track');if(!id)return;e.preventDefault();e.stopPropagation();
        const from=e.dataTransfer.getData('text/mixlab-plan');if(from!=='')return;insert(id,z===E.wrap?dropIndex(e):null);});});
    document.addEventListener('keydown',e=>{if(e.key!=='Escape'||V.root.hidden)return;if($$('.modal').some(m=>!m.hidden)||(e.target.closest&&e.target.closest('input,textarea,select')))return;close();});
    window.addEventListener('resize',()=>{if(!V.root.hidden)draw();});
    if(window.MixCoach&&MixCoach.RULES&&!MixCoach.RULES.some(r=>r.id==='mixpoint'))MixCoach.RULES.push(coachRule);
    setInterval(sample,100);setInterval(autoCue,300);
  }
  const isOpen=()=>!!(V.root&&!V.root.hidden);
  function open(){if(!V.root)return;V.root.hidden=false;document.body.classList.add('planner');V.el.btn.setAttribute('aria-pressed','true');pairs();render();}
  function close(){if(!V.root)return;V.root.hidden=true;document.body.classList.remove('planner');V.el.btn.setAttribute('aria-pressed','false');stopPlay(true);}
  function toggle(){isOpen()?close():open();}

  function buildFromText(text,append){
    const r=fromQuery(text||''),E=V.el;E.chips.innerHTML='';
    r.Q.chips.forEach(c=>E.chips.append(h('span',{class:'pl-chip'},c)));
    if(r.Q.ignored.length)E.chips.append(h('span',{class:'pl-chip bad',title:'Ces mots n’ont pas été compris'},'Ignoré : '+r.Q.ignored.join(' ')));
    if(r.why)E.chips.append(h('span',{class:'pl-chip bad'},r.why));
    if(!r.ids.length)return r;
    if(append){const have=new Set(live().map(it=>it.id));r.ids.filter(id=>!have.has(id)).forEach(id=>PL.items.push({k:tkey(trk(id)),id,inT:null,outT:null,tr:null,next:null}));pairs();changed();}
    else setItems(r.ids);
    E.chips.prepend(h('span',{class:'pl-chip'},`${r.ids.length} morceau${r.ids.length>1?'x':''} · ${dur(compute().total)}`));
    return r;
  }

  function render(){
    if(!isOpen())return;
    const E=V.el;E.name.value=PL.name;E.mode.value=PL.mode;E.bpm.hidden=PL.mode!=='lock';
    const v=E.plSel.value;E.plSel.innerHTML='';E.plSel.append(...LIB.playlists.map(p=>h('option',{value:p.id},p.name+' ('+p.ids.length+')')));if(v)E.plSel.value=v;
    LC=compute();
    const bp=LC.R.map(r=>r.bpmIn);E.stat.textContent=LC.R.length?`${LC.R.length} morceaux · ${dur(LC.total)} · ${Math.min(...bp).toFixed(0)}-${Math.max(...bp).toFixed(0)} BPM`:'Set vide';
    renderLib();renderCards();renderTr();renderReplays();renderTransport();draw();
  }
  function renderTransport(){
    const E=V.el;if(!E.play)return;
    E.play.textContent=LV.on?'Stop':'Lire le set';E.play.setAttribute('aria-pressed',String(LV.on));
    E.progBox.hidden=!RD.on;E.render.textContent=RD.on?'Annuler':'Rendu WAV';
    $$('[data-aud]',V.root).forEach(b=>b.setAttribute('aria-pressed',String(LV.on&&LV.kind==='tr'+PL.selTr&&LV.where===b.dataset.aud)));
  }
  function prog(){const E=V.el;if(!E.prog)return;E.prog.style.width=(RD.p*100).toFixed(1)+'%';renderTransport();}
  function renderLib(){
    const E=V.el,q=fold(E.find.value).trim();E.lib.innerHTML='';
    const list=LIB.tracks.filter(t=>!q||fold(t.title+' '+t.artist+' '+t.genre).includes(q)).slice(0,300);
    list.forEach(t=>{const k=keyInfo(t.key);
      const li=h('li',{draggable:'true',title:'Double-clic ou + : ajouter à la fin du set'},h('span',{class:'t'},t.title,' ',h('span',{class:'pl-meta'},t.artist)),
        h('span',{class:'pl-meta'},t.bpm.toFixed(0)),k?h('span',{class:'kchip',style:'--kc:'+keyColor(k)},k.code):null,
        h('button',{class:'b',type:'button','aria-label':'Ajouter « '+t.title+' » au set',onclick:()=>insert(t.id)},'+'));
      li.addEventListener('dblclick',()=>insert(t.id));
      li.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/mixlab-track',String(t.id));e.dataTransfer.setData('text/mixlab-plan','');});
      E.lib.append(li);});
    if(!list.length)E.lib.append(h('li',{class:'pl-empty'},'Aucun morceau.'));
  }
  function renderCards(){
    const E=V.el;E.cards.innerHTML='';
    if(!LC.R.length){E.cards.append(h('div',{class:'pl-empty'},'Ajoute des morceaux depuis la colonne de gauche, charge une playlist, ou décris ton set dans la barre du haut.'));return;}
    LC.R.forEach((r,i)=>{const t=r.t,k=keyInfo(t.key);
      const c=h('div',{class:'pl-card'+(i===PL.sel?' sel':''),draggable:'true','data-i':i},
        h('span',{class:'n'},String(i+1)),h('span',{class:'t',title:t.title},t.title),
        h('button',{class:'b',type:'button',title:'Retirer du set','aria-label':'Retirer « '+t.title+' » du set',onclick:e=>{e.stopPropagation();remove(PL.items.indexOf(r.it));}},'×'),
        h('span',{class:'pl-meta'},stamp(r.S)),
        h('span',{class:'pl-meta'},r.bpmIn.toFixed(1)+(Math.abs(r.rIn-1)>1e-4?' ('+t.bpm.toFixed(0)+')':'')),k?h('span',{class:'kchip',style:'--kc:'+keyColor(k)},k.code):null,
        h('span',{class:'pl-meta'},'E'+nrg(t)),h('span',{class:'pl-sp'}),
        h('button',{class:'b',type:'button',title:'Plus tôt',disabled:!i||null,onclick:e=>{e.stopPropagation();move(i,i-1);}},'←'),
        h('button',{class:'b',type:'button',title:'Plus tard',disabled:i===LC.R.length-1||null,onclick:e=>{e.stopPropagation();move(i,i+1);}},'→'));
      c.addEventListener('click',()=>{PL.sel=i;if(i<LC.R.length-1)PL.selTr=i;else if(i)PL.selTr=i-1;render();});
      c.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/mixlab-plan',String(i));e.dataTransfer.setData('text/mixlab-track',String(t.id));});
      c.addEventListener('dragover',e=>e.preventDefault());
      c.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();const f=e.dataTransfer.getData('text/mixlab-plan');
        if(f!==''&&f!=null&&!isNaN(+f))move(PL.items.indexOf(LC.R[+f].it),PL.items.indexOf(r.it));
        else{const id=+e.dataTransfer.getData('text/mixlab-track');if(id)insert(id,PL.items.indexOf(r.it));}});
      E.cards.append(c);});
  }
  // compatibilité de deux voisins : tonalité, tempo, énergie
  function compat(a,b){
    const ka=keyInfo(a.key),kb=keyInfo(b.key),gap=Suggest.bpmGap(a.bpm,b.bpm),sign=b.bpm>=a.bpm?1:-1;
    const key=!ka||!kb?{c:'',txt:'tonalité inconnue'}:ka.code===kb.code?{c:'ok',txt:ka.code+' = '+kb.code}:keysCompatible(a.key,b.key)?{c:'ok',txt:ka.code+' → '+kb.code}:{c:'bad',txt:ka.code+' → '+kb.code+' peu compatible'};
    const bpm={c:gap<=.03?'ok':gap<=.06?'warn':'bad',txt:a.bpm.toFixed(0)+' → '+b.bpm.toFixed(0)+' BPM ('+pct(sign*gap)+')'};
    const de=nrg(b)-nrg(a);return{key,bpm,nrg:{c:Math.abs(de)>3?'warn':'',txt:'E'+nrg(a)+' → E'+nrg(b)},score:Suggest.rate(Suggest.refOf(a),b).score};
  }
  function renderTr(){
    const E=V.el,R=LC.R;E.tr.innerHTML='';
    if(R.length<2){E.tr.append(h('span',{class:'lbl'},'Transition'),h('div',{class:'pl-empty'},'Il faut deux morceaux pour régler une transition.'));return;}
    const i=PL.selTr=clamp(PL.selTr,0,R.length-2),a=R[i],b=R[i+1],it=a.it,tr=it.tr,c=compat(a.t,b.t),lk=link(a.t,b.t);
    const nudge=(which,d)=>{if(which==='out')it.outT=a.t.grid+(Math.round(beatOf(a.t,it.outT))+d)*bl(a.t);else{b.it.inT=Math.max(0,b.t.grid+(Math.round(beatOf(b.t,b.it.inT))+d)*bl(b.t));}changed();};
    const step=e=>e.shiftKey?1:4;
    const barOf=(t,x)=>{const bb=beatOf(t,x);return'mesure '+(Math.floor(bb/4)+1)+(Math.abs(bb/4-Math.round(bb/4))>.01?' temps '+(((Math.round(bb)%4)+4)%4+1):'');};
    const bars=h('select',{class:'sel','aria-label':'Durée de la transition'},[1,2,4,8,16,32].concat([tr.bars]).filter((x,j,arr)=>arr.indexOf(x)===j).sort((x,y)=>x-y).map(n=>h('option',{value:n},n+' mesure'+(n>1?'s':''))));
    bars.value=String(tr.bars);bars.addEventListener('change',()=>{tr.bars=+bars.value;changed();});
    E.tr.append(
      h('div',{class:'pl-row'},h('span',{class:'lbl'},`Transition ${i+1} → ${i+2}`),h('b',{},a.t.title+' → '+b.t.title),h('span',{class:'pl-sp'}),
        h('button',{class:'b',type:'button',disabled:!i||null,onclick:()=>{PL.selTr=i-1;render();}},'‹'),h('button',{class:'b',type:'button',disabled:i>=R.length-2||null,onclick:()=>{PL.selTr=i+1;render();}},'›')),
      h('div',{class:'pl-row',id:'pl-compat'},h('span',{class:c.key.c},c.key.txt),'·',h('span',{class:c.bpm.c},c.bpm.txt),'·',h('span',{class:c.nrg.c},c.nrg.txt),'·',h('span',{},'note '+c.score+'/100'),
        h('span',{class:'pl-meta'},`· à ${stamp(a.trStart)}, ${b.t.title} joué à ${b.bpmIn.toFixed(1)} BPM`)),
      h('div',{class:'pl-row'},Object.entries(PRESETS).map(([k,p])=>h('button',{class:'b',type:'button','data-preset':k,'aria-pressed':String(!tr.custom&&tr.preset===k),
        onclick:()=>{it.tr={bars:p.bars,preset:k,lanes:lanesOf(k)};changed();}},p.label)),bars),
      h('div',{class:'pl-row'},'Sortie de '+a.t.title+' : '+barOf(a.t,it.outT),h('button',{class:'b',type:'button',title:'Une mesure plus tôt (Maj : un temps)',onclick:e=>nudge('out',-step(e))},'−'),h('button',{class:'b',type:'button',title:'Une mesure plus tard (Maj : un temps)',onclick:e=>nudge('out',step(e))},'+'),
        h('span',{class:'pl-sp'}),'Entrée de '+b.t.title+' : '+barOf(b.t,b.it.inT),h('button',{class:'b',type:'button',onclick:e=>nudge('in',-step(e))},'−'),h('button',{class:'b',type:'button',onclick:e=>nudge('in',step(e))},'+')),
      h('div',{class:'pl-row'},'Courbes de',['out','in'].map(s=>h('button',{class:'b',type:'button','aria-pressed':String(PL.edit===s),onclick:()=>{PL.edit=s;renderTr();}},s==='out'?a.t.title+' (sort)':b.t.title+' (entre)')),
        h('span',{class:'pl-hint'},'Clic : ajouter un point, glisser : déplacer, double-clic : retirer.')),
      E.lanes=h('canvas',{class:'pl-lanes',id:'pl-lanes','aria-label':'Courbes de la transition'}),
      h('div',{class:'pl-row'},h('button',{class:'b',type:'button','data-aud':'cue',onclick:()=>{LV.on&&LV.kind==='tr'+i&&LV.where==='cue'?stopPlay():auditionTr(i,'cue');}},'Écouter au casque'),
        h('button',{class:'b',type:'button','data-aud':'master',onclick:()=>{LV.on&&LV.kind==='tr'+i&&LV.where==='master'?stopPlay():auditionTr(i,'master');}},'Écouter au master'),
        h('span',{class:'pl-sp'}),
        lk&&!tr.unlinked?h('span',{class:'pl-chip',id:'pl-link',title:'Quand les deux morceaux sont sur les platines, l’auto-mix et le coach suivent ces points'},'Point de mix lié'):h('span',{class:'pl-chip bad'},'Point de mix non lié'),
        tr.unlinked?h('button',{class:'b',type:'button',onclick:()=>{tr.unlinked=false;changed();}},'Lier'):h('button',{class:'b',type:'button',onclick:()=>{tr.unlinked=true;dropLink(a.t,b.t);changed();}},'Délier')));
    lanesEvents(E.lanes,i);requestAnimationFrame(()=>drawLanes());
    renderTransport();
  }
  function renderReplays(){
    const E=V.el;if(!E.rp)return;E.rp.innerHTML='';
    E.rp.append(h('span',{class:'lbl'},'Transitions jouées'));
    if(!RP.length){E.rp.append(h('div',{class:'pl-empty'},'Chaque transition faite en direct aux platines est enregistrée ici (faders, EQ, filtre), avec le bilan du coach.'));return;}
    RP.forEach(r=>E.rp.append(h('div',{class:'pl-row'},h('b',{},`${r.from} → ${r.to}`),h('span',{class:'pl-meta'},r.score+'/100'),h('span',{class:'t'},r.title),
      h('button',{class:'b',type:'button',title:'Reprendre ces gestes comme courbes de la transition choisie',onclick:()=>{if(replayToLanes(r,PL.selTr))toast('Gestes copiés dans la transition '+(PL.selTr+1)+' → '+(PL.selTr+2),'ok');else toast('Choisis d’abord une transition du set');}},'Copier')),replayEl(r)));
  }

  /* ---------- dessin de la frise ---------- */
  const MOD={intro:-1,couplet:0,break:-2,montee:0,drop:1,outro:-1};
  function energyAt(st){
    let s=0,w=0;
    LC.R.forEach((r,i)=>{if(st<r.S||st>=r.E)return;const prev=LC.R[i-1],pos=posAt(r,st),sec=window.Structure&&Structure.at(r.t,pos);
      const P=lanePts(r,prev,'vol'),v=Math.max(.05,valAt(P,st)),e=clamp(nrg(r.t)+(sec?MOD[sec.type]||0:0),1,10);s+=e*v;w+=v;});
    return w?s/w:null;
  }
  function draw(){
    const E=V.el,cv=E.cv;if(!cv||!isOpen())return;
    LC=LC||compute();
    const P=pps(),total=Math.max(LC.total,1),W=E.wrap.clientWidth,H=tlH();
    E.spacer.style.width=Math.max(W,Math.ceil(total*P+24))+'px';
    cv.style.width=W+'px';cv.style.height=H+'px';cv.style.marginBottom=-H+'px';
    if(!fitCanvas(cv))return;
    const g=cv.getContext('2d'),d=cv.width/W,sx=E.wrap.scrollLeft,X=t=>(t*P-sx+12)*d,T=x=>(x/d+sx-12)/P;
    g.setTransform(1,0,0,1,0,0);g.fillStyle=TK['surface-0'];g.fillRect(0,0,cv.width,cv.height);
    g.font=(11*d)+'px '+getComputedStyle(document.body).fontFamily;g.textBaseline='middle';
    // règle : une graduation par minute
    const t0=Math.max(0,T(0)),t1=T(cv.width),stepM=P*60<40?(P*300<40?600:300):60;
    g.fillStyle=TK['text-lo'];g.strokeStyle=TK['line-2'];g.lineWidth=d;
    for(let m=Math.floor(t0/stepM)*stepM;m<=t1;m+=stepM){const x=X(m);g.beginPath();g.moveTo(x,(TL.ruler-6)*d);g.lineTo(x,H*d);g.globalAlpha=.35;g.stroke();g.globalAlpha=1;g.fillText(stamp(m),x+3*d,8*d);}
    // morceaux
    LC.R.forEach((r,i)=>{
      const x0=X(r.S),x1=X(r.E);if(x1<0||x0>cv.width)return;
      const y=laneY(i)*d,hh=TL.lh*d,col=COL[i%2?'B':'A'],wf=r.t.wf;
      g.fillStyle=TK['surface-2'];g.fillRect(x0,y,x1-x0,hh);
      if(wf){const n=wf.l.length;g.fillStyle=col;g.globalAlpha=.75;
        for(let x=Math.max(0,Math.floor(x0));x<Math.min(cv.width,x1);x+=Math.max(1,Math.round(d))){
          const pa=posAt(r,T(x)),pb=posAt(r,T(x+d)),ia=clamp(Math.floor(pa*WF),0,n-1),ib=clamp(Math.ceil(pb*WF),ia+1,n);let a=0;
          for(let k=ia;k<ib;k+=Math.max(1,(ib-ia)>>5))a=Math.max(a,wf.l[k],wf.m[k],wf.h[k]);
          const v=a*wf.scale*(hh-14*d)/2;g.fillRect(x,y+hh/2-v,Math.max(1,Math.round(d)),2*v);}
        g.globalAlpha=1;}
      if(r.t.sections&&window.Structure)for(let x=Math.max(0,Math.floor(x0));x<Math.min(cv.width,x1);x+=3*d){const s=Structure.at(r.t,posAt(r,T(x)));if(s){g.fillStyle=Structure.TYPES[s.type].col;g.fillRect(x,y+hh-4*d,3*d,4*d);}}
      g.fillStyle=TK['text-hi'];g.save();g.beginPath();g.rect(x0,y,x1-x0,hh);g.clip();
      g.fillText(`${i+1}. ${r.t.title}  ${r.bpmIn.toFixed(1)} BPM ${kcode(r.t)}`,Math.max(x0,0)+4*d,y+9*d);g.restore();
      if(i===PL.sel){g.strokeStyle=TK['text-hi'];g.lineWidth=1.5*d;g.strokeRect(x0+d,y+d,x1-x0-2*d,hh-2*d);}
    });
    // zones de mix et compatibilité des voisins
    LC.R.forEach((r,i)=>{
      if(r.trStart==null)return;const x0=X(r.trStart),x1=X(r.E);if(x1<0||x0>cv.width)return;
      const y0=TL.l0*d,y1=(TL.l0+2*TL.lh+TL.gap)*d,c=compat(r.t,LC.R[i+1].t),sel=i===PL.selTr;
      g.fillStyle=TK['text-hi'];g.globalAlpha=sel?.14:.07;g.fillRect(x0,y0,x1-x0,y1-y0);g.globalAlpha=1;
      g.strokeStyle=sel?TK.cue:TK['line-2'];g.lineWidth=(sel?2:1)*d;g.strokeRect(x0,y0,x1-x0,y1-y0);
      g.fillStyle=TK[c.key.c==='bad'||c.bpm.c==='bad'?'state-bad':c.key.c==='ok'&&c.bpm.c==='ok'?'state-ok':'state-warn'];
      const ka=kcode(r.t),kb=kcode(LC.R[i+1].t),txt=(ka&&kb?ka+'→'+kb+' ':'')+pct(Suggest.bpmGap(r.t.bpm,LC.R[i+1].t.bpm)*(LC.R[i+1].t.bpm>=r.t.bpm?1:-1));
      g.fillText(txt,Math.max(x0,0)+3*d,(TL.l0+TL.lh+TL.gap/2)*d);
      g.fillRect(x1-2*d,y0,2*d,y1-y0);
    });
    // courbe d'énergie du set et trame visée
    const ey=v=>(TL.l0+2*TL.lh+TL.gap-4-(v-1)/9*(2*TL.lh+TL.gap-12))*d;
    const TPL=(window.Academie&&Academie.TPL)||{};
    if(PL.tpl&&TPL[PL.tpl]){const c=TPL[PL.tpl].curve;g.setLineDash([5*d,4*d]);g.strokeStyle=TK['text-lo'];g.lineWidth=1.5*d;g.beginPath();
      c.forEach((v,j)=>{const x=X(total*j/(c.length-1));j?g.lineTo(x,ey(v)):g.moveTo(x,ey(v));});g.stroke();g.setLineDash([]);}
    g.strokeStyle=TK.coach;g.lineWidth=2*d;g.beginPath();let on=false;
    for(let x=Math.max(0,X(0));x<=Math.min(cv.width,X(total));x+=4*d){const e=energyAt(T(x));if(e==null){on=false;continue;}on?g.lineTo(x,ey(e)):g.moveTo(x,ey(e));on=true;}
    g.stroke();
    // tête de lecture
    const pp=playPos();const cx=X(pp??PL.cursor??0);
    g.fillStyle=pp!=null?TK.live:TK['text-lo'];g.fillRect(cx-d,0,2*d,H*d);
    if(V.drag&&V.drag.mode==='order'&&V.drag.ins!=null){const r=LC.R[V.drag.ins],x=r?X(r.S):X(total);g.fillStyle=TK.cue;g.fillRect(x-2*d,TL.l0*d,4*d,(2*TL.lh+TL.gap)*d);}
  }
  function loop(){cancelAnimationFrame(V.raf);draw();drawLanes();if(!LV.on)return;V.raf=requestAnimationFrame(loop);}

  /* ---------- souris sur la frise ---------- */
  function hit(e){
    const r=V.el.cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,P=pps(),t=(x+V.el.wrap.scrollLeft-12)/P;
    if(y<TL.l0)return{type:'ruler',t};
    for(const rec of LC.R){if(rec.trStart==null)continue;const xe=(rec.E*P-V.el.wrap.scrollLeft+12);if(Math.abs(x-xe)<6&&y<TL.l0+2*TL.lh+TL.gap)return{type:'len',i:rec.i,t};}
    const lane=y<TL.l0+TL.lh?0:y>TL.l0+TL.lh+TL.gap?1:-1;
    const blk=LC.R.find((rec,i)=>i%2===lane&&t>=rec.S&&t<rec.E);
    const tr=LC.R.find(rec=>rec.trStart!=null&&t>=rec.trStart&&t<rec.E);
    if(blk)return{type:'blk',i:blk.i,t,tr:tr?tr.i:null};
    if(tr)return{type:'tr',i:tr.i,t};
    return{type:'none',t};
  }
  function dropIndex(e){const r=V.el.cv.getBoundingClientRect(),t=(e.clientX-r.left+V.el.wrap.scrollLeft-12)/pps();const R=LC.R;let k=R.findIndex(x=>(x.S+x.E)/2>t);return k<0?PL.items.length:PL.items.indexOf(R[k].it);}
  function canvasEvents(){
    const cv=V.el.cv;
    cv.addEventListener('pointerdown',e=>{
      LC=compute();const H=hit(e),P=pps();
      if(H.type==='ruler'){PL.cursor=clamp(H.t,0,LC.total);if(LV.on&&LV.kind==='set')playSet(PL.cursor);draw();return;}
      if(H.type==='none')return;
      cv.setPointerCapture(e.pointerId);
      const r=LC.R[H.i];
      if(H.type==='tr'){PL.selTr=H.i;render();return;}
      if(H.type==='len'){V.drag={mode:'len',i:H.i,x:e.clientX,d0:r.trDur,bpm:r.bpmOut};PL.selTr=H.i;return;}
      PL.sel=H.i;if(H.tr!=null)PL.selTr=H.tr;
      V.drag={mode:e.shiftKey?'slip':'move',i:H.i,x:e.clientX,y:e.clientY,P,
        o:e.shiftKey?r.it.inT:(LC.R[H.i-1]?LC.R[H.i-1].it.outT:null),moved:false};
      renderCards();draw();
    });
    cv.addEventListener('pointermove',e=>{
      const D=V.drag;if(!D){const H=LC&&hit(e);cv.style.cursor=H&&H.type==='len'?'ew-resize':H&&H.type==='blk'?'grab':'default';return;}
      const dx=(e.clientX-D.x)/pps();
      if(D.mode==='len'){const bars=clamp(Math.round((D.d0+dx)*D.bpm/240),1,64);const it=LC.R[D.i].it;if(bars!==it.tr.bars){it.tr.bars=bars;LC=compute();draw();}return;}
      if(D.mode!=='order'&&Math.abs(e.clientY-D.y)>34&&Math.abs(e.clientX-D.x)<40)D.mode='order';
      if(D.mode==='order'){const r=V.el.cv.getBoundingClientRect(),t=(e.clientX-r.left+V.el.wrap.scrollLeft-12)/pps();let k=LC.R.findIndex(x=>(x.S+x.E)/2>t);D.ins=k<0?LC.R.length:k;draw();return;}
      const rec=LC.R[D.i];D.moved=true;
      if(D.mode==='slip'){const t=rec.t;rec.it.inT=Math.max(0,timeOf(t,Math.round(beatOf(t,D.o-dx*rec.rIn)/4)*4));}
      else if(D.i>0&&D.o!=null){const p=LC.R[D.i-1];p.it.outT=timeOf(p.t,Math.round(beatOf(p.t,D.o+dx*p.rOut)/(e.altKey?1:4))*(e.altKey?1:4));}
      LC=compute();draw();
    });
    const end=()=>{const D=V.drag;V.drag=null;if(!D)return;
      if(D.mode==='order'&&D.ins!=null){const from=PL.items.indexOf(LC.R[D.i].it);let to=PL.items.length-1;if(D.ins<LC.R.length){to=PL.items.indexOf(LC.R[D.ins].it);if(to>from)to--;}if(to!==from&&to>=0){move(from,to);PL.sel=to;}else render();return;}
      if(D.moved||D.mode==='len')changed();};
    cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
    cv.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();PL.zoom=clamp(PL.zoom*(e.deltaY<0?1.25:.8),1,24);V.el.zoom.value=PL.zoom;save();draw();},{passive:false});
  }

  /* ---------- éditeur de courbes ---------- */
  const LG=82,LRH=34;
  function drawLanes(){
    const cv=V.el.lanes;if(!cv||!cv.isConnected||!fitCanvas(cv))return;
    const R=LC.R,i=PL.selTr,a=R[i];if(!a||!R[i+1])return;
    const g=cv.getContext('2d'),d=cv.width/cv.getBoundingClientRect().width,W=cv.width,tr=a.it.tr,beats=tr.bars*4;
    const X=p=>(LG+(W/d-LG-8)*p)*d,Y=(row,v)=>(row*LRH+LRH-5-(LRH-10)*v)*d;
    g.setTransform(1,0,0,1,0,0);g.fillStyle=TK['surface-0'];g.fillRect(0,0,W,cv.height);
    g.font=(11*d)+'px '+getComputedStyle(document.body).fontFamily;g.textBaseline='middle';
    g.lineWidth=d;g.strokeStyle=TK['line-2'];
    for(let b=0;b<=beats;b++){if(beats>32&&b%4)continue;const x=X(b/beats);g.globalAlpha=b%4?.3:.8;g.beginPath();g.moveTo(x,0);g.lineTo(x,cv.height);g.stroke();}
    g.globalAlpha=1;
    LANES.forEach(([k,lab],row)=>{
      g.fillStyle=TK['text-lo'];g.fillText(lab,6*d,(row*LRH+LRH/2)*d);
      g.strokeStyle=TK['line-1'];g.beginPath();g.moveTo(0,(row+1)*LRH*d);g.lineTo(W,(row+1)*LRH*d);g.stroke();
      if(k!=='vol'&&k!=='echo'){g.setLineDash([2*d,3*d]);g.strokeStyle=TK['line-2'];g.beginPath();g.moveTo(X(0),Y(row,.5));g.lineTo(X(1),Y(row,.5));g.stroke();g.setLineDash([]);}
      for(const side of['out','in']){
        const pts=tr.lanes[side][k],ed=side===PL.edit;g.strokeStyle=COL[side==='out'?'A':'B'];g.lineWidth=(ed?2.2:1.2)*d;g.globalAlpha=ed?1:.45;
        g.beginPath();g.moveTo(X(0),Y(row,lv(pts,0)));pts.forEach(([p,v])=>g.lineTo(X(p),Y(row,v)));g.lineTo(X(1),Y(row,lv(pts,1)));g.stroke();
        if(ed){g.fillStyle=COL[side==='out'?'A':'B'];pts.forEach(([p,v])=>{g.beginPath();g.arc(X(p),Y(row,v),3.5*d,0,7);g.fill();});}
        g.globalAlpha=1;
      }
    });
    // tête de lecture pendant l'écoute de cette transition
    const pp=playPos();if(pp!=null&&pp>=a.trStart&&pp<=a.E){g.fillStyle=TK.live;g.fillRect(X((pp-a.trStart)/a.trDur)-d,0,2*d,cv.height);}
  }
  function lanesEvents(cv,i){
    let D=null;
    const pt=e=>{const r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,row=clamp(Math.floor(y/LRH),0,LANES.length-1);
      const p=clamp((x-LG)/(r.width-LG-8),0,1),v=clamp((row*LRH+LRH-5-y)/(LRH-10),0,1);return{x,y,row,p,v,w:r.width};};
    const tr=()=>LC.R[i]&&LC.R[i].it.tr;
    const snapP=p=>{const n=tr().bars*4*4;return Math.round(p*n)/n;},snapV=(k,v)=>{v=Math.round(v*100)/100;return k!=='vol'&&k!=='echo'&&Math.abs(v-.5)<.04?.5:v;};
    const find=(q,pts)=>pts.findIndex(([p,v])=>Math.abs(LG+(q.w-LG-8)*p-q.x)<7&&Math.abs(q.row*LRH+LRH-5-(LRH-10)*v-q.y)<7);
    cv.addEventListener('pointerdown',e=>{
      const q=pt(e),T=tr();if(!T||q.x<LG)return;
      const k=LANES[q.row][0],pts=T.lanes[PL.edit][k];let j=find(q,pts);
      if(j<0){const p=snapP(q.p);pts.push([p,snapV(k,q.v)]);pts.sort((x,y)=>x[0]-y[0]);j=pts.findIndex(x=>x[0]===p&&x[1]===snapV(k,q.v));}
      T.custom=true;D={k,j,pts};cv.setPointerCapture(e.pointerId);drawLanes();
    });
    cv.addEventListener('pointermove',e=>{if(!D)return;const q=pt(e),pts=D.pts,j=D.j,lo=j>0?pts[j-1][0]:0,hi=j<pts.length-1?pts[j+1][0]:1;
      pts[j]=[clamp(snapP(q.p),lo,hi),snapV(D.k,q.v)];LC=compute();drawLanes();});
    const up=()=>{if(D){D=null;changed();}};
    cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
    cv.addEventListener('dblclick',e=>{const q=pt(e),T=tr();if(!T)return;const k=LANES[q.row][0],pts=T.lanes[PL.edit][k],j=find(q,pts);if(j>=0&&pts.length>1){pts.splice(j,1);T.custom=true;changed();}});
  }

  /* ---------- préférences ---------- */
  window.MixlabSettings=(window.MixlabSettings||[]).concat([
    {tab:'Préparation',key:'planner.links',label:'L’auto-mix et le coach suivent les points de mix préparés',type:'bool',get:()=>OPT.links,set:v=>{OPT.links=!!v;saveOpt();}},
    {tab:'Préparation',key:'planner.autoCue',label:'Caler la platine sur le point d’entrée préparé au chargement',type:'bool',get:()=>OPT.autoCue,set:v=>{OPT.autoCue=!!v;saveOpt();}},
    {tab:'Préparation',key:'planner.bits',label:'Rendu WAV du set',type:'select',options:[{value:16,label:'16 bits'},{value:24,label:'24 bits'}],get:()=>OPT.bits,set:v=>{OPT.bits=+v===24?24:16;saveOpt();}},
    {tab:'Préparation',key:'planner.mode',label:'Tempo du set préparé',type:'select',options:[{value:'glide',label:'Naturel (retour au tempo de chaque morceau)'},{value:'lock',label:'Verrouillé'}],get:()=>PL.mode,set:v=>{PL.mode=v==='lock'?'lock':'glide';changed();}}
  ]);

  return{build,open,close,toggle,get isOpen(){return isOpen();},plan:PL,opt:OPT,PRESETS,LANES,lanesOf,lv,setItems,insert,remove,move,pairs,compute,posAt,rateAt,
    renderRange,renderWav,m3u,rekordbox,tracklist,saveAsPlaylist,parse,fromQuery,buildFromText,link,saveLink,dropLink,inPoint,linkPlan,
    playRange,auditionTr,playSet,stopPlay,get playing(){return LV.on?{kind:LV.kind,where:LV.where,pos:playPos()}:null;},get rendering(){return RD.on?RD.p:null;},
    onTransition,replayEl,replayToLanes,replays:RP,coachRule,render,tkey};
})();
