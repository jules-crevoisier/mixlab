'use strict';
/* =====================================================================
   Mixlab · analyse de structure
   Énergie par mesure dans trois bandes (graves, médiums, aigus), calée
   sur la grille, regroupée en phrases de 8 mesures. On en déduit les
   sections (intro, couplet, break, montée, drop, outro), une note
   d'énergie de 1 à 10 et des cues mémoire. Calcul en tâche de fond,
   par petits morceaux, pour ne jamais figer l'interface.
   ===================================================================== */
window.Structure=(()=>{
  const TYPES={
    intro:{label:'Intro',col:'#2fa8ff',name:'bleu'},
    couplet:{label:'Couplet',col:'#7d8799',name:'gris'},
    break:{label:'Break',col:'#d9dee6',name:'blanc'},
    montee:{label:'Montée',col:'#f5b83d',name:'jaune'},
    drop:{label:'Drop',col:'#ff4d5e',name:'rouge'},
    outro:{label:'Outro',col:'#31d3c8',name:'turquoise'}
  };
  const PH=8,CHUNK=1<<17,db=x=>10*Math.log10(x+1e-12);
  const Q=[];let busy=false;
  const waiters=[];

  /* ---------- file de calcul ---------- */
  function queue(tr){if(!tr||!tr.buffer)return;tr.sections=null;if(!Q.includes(tr))Q.push(tr);if(!busy)next();}
  function next(){
    const tr=Q.shift();
    if(!tr){busy=false;waiters.splice(0).forEach(f=>f());return;}
    busy=true;
    measure(tr,bars=>{try{apply(tr,bars);}catch(e){console.warn('Structure',e);}setTimeout(next,0);});
  }
  const idle=()=>new Promise(r=>{if(!busy&&!Q.length)r();else waiters.push(r);});

  /* Énergie par mesure et par bande, à partir du buffer. Chaque mesure est découpée en
     32 tranches (une par 1/8 de temps) : la médiane des tranches ignore les attaques du kick
     et mesure ce qui tient entre les coups (basse, nappes, charleys), la moyenne donne le volume. */
  const FR=32;
  function measure(tr,cb){
    const b=tr.buffer,sr=b.sampleRate,n=b.length,L=b.getChannelData(0),R=b.numberOfChannels>1?b.getChannelData(1):L;
    const bs=240/tr.bpm*sr,fs=bs/FR,s0=Math.max(0,Math.round(tr.grid*sr)),nf=Math.max(1,Math.ceil((n-s0)/fs));
    const fl=new Float32Array(nf),fm=new Float32Array(nf),fh=new Float32Array(nf),cnt=new Float32Array(nf);
    const a1=Math.exp(-2*Math.PI*150/sr),a3=Math.exp(-2*Math.PI*2500/sr);
    let l1=0,l2=0,m3=0,i=s0,k=0,kEnd=s0+fs;
    const step=()=>{
      const end=Math.min(n,i+CHUNK);
      for(;i<end;i++){
        if(i>=kEnd){k++;kEnd=s0+(k+1)*fs;}
        const x=(L[i]+R[i])*.5;l1=a1*l1+(1-a1)*x;l2=a1*l2+(1-a1)*l1;m3=a3*m3+(1-a3)*x;
        const md=m3-l2,hd=x-m3;fl[k]+=l2*l2;fm[k]+=md*md;fh[k]+=hd*hd;cnt[k]++;
      }
      if(i<n){setTimeout(step,0);return;}
      const bars=[],med=a=>{const s=Array.from(a).sort((x,y)=>x-y);return(s[FR/2-1]+s[FR/2])/2;};
      for(let j=0;(j+1)*FR<=nf+FR/2;j++){
        const r=[fl,fm,fh].map(f=>new Float32Array(FR));let c=0,t=0;
        for(let q=0;q<FR;q++){const f=j*FR+q;if(f>=nf||!cnt[f])continue;c+=cnt[f];t+=fl[f]+fm[f]+fh[f];r[0][q]=fl[f]/cnt[f];r[1][q]=fm[f]/cnt[f];r[2][q]=fh[f]/cnt[f];}
        if(c<bs*.5)break;
        bars.push({l:med(r[0]),m:med(r[1]),h:med(r[2]),t:t/c});
      }
      cb(bars);
    };
    setTimeout(step,0);
  }

  /* ---------- sections ---------- */
  function apply(tr,bars){
    const barLen=240/tr.bpm,T=k=>tr.grid+k*barLen;
    const tot=b=>b.t;
    // mesures muettes au début et à la fin : rattachées à l'intro et à l'outro
    let mxT=0;bars.forEach(b=>{mxT=Math.max(mxT,tot(b));});
    let a=0,z=bars.length;while(a<z-1&&db(tot(bars[a]))<db(mxT)-30)a++;while(z>a+1&&db(tot(bars[z-1]))<db(mxT)-30)z--;
    // phrases de 8 mesures
    const ph=[];
    for(let k=0;k<bars.length;k+=PH){
      const sl=bars.slice(k,Math.min(bars.length,k+PH)),act=sl.filter((_,j)=>k+j>=a&&k+j<z),src=act.length?act:sl;
      const m=f=>src.reduce((s,b)=>s+b[f],0)/src.length;
      ph.push({k,n:sl.length,L:db(m('l')),M:db(m('m')),H:db(m('h')),T:db(m('t')),silent:!act.length});
    }
    if(!ph.length){tr.sections=[{start:0,end:tr.duration,type:'couplet',label:TYPES.couplet.label}];tr.memCues=(tr.memCues||[]).filter(m=>!m.type);tr.energy=1;return done(tr);}
    // la dernière phrase incomplète (moins de 4 mesures) se fond dans la précédente
    if(ph.length>1&&ph[ph.length-1].n<4){const p=ph.pop();ph[ph.length-1].n+=p.n;}
    const live=ph.filter(p=>!p.silent),mx=f=>Math.max(...live.map(p=>p[f])),maxL=mx('L'),maxM=mx('M'),maxT=mx('T');
    // segments : une rupture quand une bande bouge nettement d'une phrase à l'autre
    const segs=[];
    for(const p of ph){
      const s=segs[segs.length-1],q=s&&s.ph[s.ph.length-1];
      const brk=!q||p.silent!==q.silent||Math.abs(p.L-q.L)>2.5||Math.abs(p.M-q.M)>2.5||Math.abs(p.H-q.H)>2;
      if(brk)segs.push({ph:[p]});else s.ph.push(p);
    }
    for(const s of segs){
      const pw=f=>db(s.ph.reduce((x,p)=>x+Math.pow(10,p[f]/10),0)/s.ph.length);
      s.L=pw('L');s.M=pw('M');s.H=pw('H');s.T=pw('T');s.k0=s.ph[0].k;s.bars=s.ph.reduce((x,p)=>x+p.n,0);
      s.P=s.M+.5*s.H;
      // « maigre » : il manque la basse (graves et bas-médiums entre les coups de kick)
      s.thin=s.ph.every(p=>p.silent)||(maxL-s.L)+.5*(maxM-s.M)>3.5;
    }
    // intro : tout ce qui précède l'arrivée des graves ; outro : tout ce qui suit leur départ
    let f0=segs.findIndex(s=>!s.thin),f1=segs.length-1-[...segs].reverse().findIndex(s=>!s.thin);
    if(f0<0){f0=0;f1=segs.length-1;}
    segs.forEach((s,i)=>{s.type=i<f0?'intro':i>f1?'outro':null;});
    // morceau qui démarre ou finit plein pot : la première et la dernière phrase servent d'intro et d'outro
    const split=(i,first)=>{const s=segs[i];if(s.ph.length<2)return s.type=first?'intro':'outro';
      const p=first?s.ph.shift():s.ph.pop(),ns={...s,ph:[p],k0:p.k,bars:p.n,type:first?'intro':'outro'};
      s.bars-=p.n;if(first){s.k0=s.ph[0].k;segs.splice(i,0,ns);}else segs.splice(i+1,0,ns);};
    if(f0===0)split(0,true);
    if(!segs[segs.length-1].type||segs.length===1)split(segs.length-1,false);
    // le cœur : break (graves absents), drop (retour des graves après un break, ou pic d'énergie), sinon couplet
    const core=segs.filter(s=>!s.type),full=core.filter(s=>!s.thin);
    const medP=full.length?full.map(s=>s.P).sort((x,y)=>x-y)[Math.floor((full.length-1)/2)]:0;
    const peakP=full.length?Math.max(...full.map(s=>s.P)):0;
    segs.forEach((s,i)=>{
      if(s.type)return;
      const prev=segs[i-1];
      if(s.thin)s.type='break';
      else if(prev&&prev.type==='break'&&s.L>prev.L+3)s.type='drop';
      else if(full.length>1&&s.P>=peakP-.3&&s.P>medP+1)s.type='drop';
      else s.type='couplet';
    });
    // pas de drop marqué : l'arrivée de la basse après l'intro (16 mesures au plus) en tient lieu
    if(!segs.some(s=>s.type==='drop')){const i=segs.findIndex(s=>s.type==='couplet');
      if(i>0&&segs[i-1].type==='intro'){const s=segs[i];if(s.ph.length>2){const rest={...s,ph:s.ph.slice(2),k0:s.ph[2].k,type:'couplet'};rest.bars=rest.ph.reduce((x,p)=>x+p.n,0);s.ph=s.ph.slice(0,2);s.bars-=rest.bars;segs.splice(i+1,0,rest);}s.type='drop';}}
    // montée : dernière phrase d'un break long qui gagne en énergie
    for(let i=0;i<segs.length;i++){
      const s=segs[i];if(s.type!=='break'||s.ph.length<2)continue;
      const p=s.ph[s.ph.length-1],q=s.ph[s.ph.length-2];
      if(p.T>q.T+1.5||p.H>q.H+2){s.ph.pop();s.bars-=p.n;segs.splice(i+1,0,{ph:[p],k0:p.k,bars:p.n,type:'montee'});i++;}
    }
    // fusion des voisins de même type
    const out=[];for(const s of segs){const o=out[out.length-1];if(o&&o.type===s.type){o.bars+=s.bars;}else out.push({k0:s.k0,bars:s.bars,type:s.type});}
    tr.sections=out.map((s,i)=>({start:i?T(s.k0):0,end:i<out.length-1?T(out[i+1].k0):tr.duration,type:s.type,label:TYPES[s.type].label,bars:s.bars}));
    // note d'énergie 1–10 : tempo, part du morceau à pleine énergie, brillance
    const fullBars=tr.sections.filter(s=>s.type==='couplet'||s.type==='drop').reduce((x,s)=>x+s.bars,0)/Math.max(1,bars.length);
    const bright=clamp((live.reduce((x,p)=>x+p.H-p.T,0)/live.length+40)/20,0,1);
    const punch=clamp((maxL-maxT+8)/8,0,1);
    tr.energy=clamp(Math.round(1+9*(.45*clamp((tr.bpm-100)/35,0,1)+.2*fullBars+.2*bright+.15*punch)),1,10);
    tr.musicEnd=T(z);
    // cues mémoire : début de l'intro, premier drop (ou arrivée des graves), premier break, outro
    const first=t=>tr.sections.find(s=>s.type===t);
    const mc=[],add=(t,label,type)=>{if(t==null||mc.some(c=>Math.abs(c.t-t)<.05))return;mc.push({t,label,color:TYPES[type].col,type});};
    add(Math.max(0,tr.grid),'Intro','intro');
    const dr=first('drop')||first('couplet');if(dr)add(dr.start,dr.type==='drop'?'Drop':'Graves','drop');
    const br=first('break');if(br)add(br.start,'Break','break');
    const ou=[...tr.sections].reverse().find(s=>s.type==='outro');if(ou)add(ou.start,'Outro','outro');
    tr.memCues=(tr.memCues||[]).filter(m=>!m.type).concat(mc).sort((x,y)=>x.t-y.t);
    done(tr);
  }
  function done(tr){
    tr.ov=null;
    if(typeof renderTable==='function')renderTable();
    window.AutoMix&&AutoMix.onAnalyzed&&AutoMix.onAnalyzed(tr);
    window.Persist&&Persist.onStructure(tr);
  }

  /* ---------- lecture ---------- */
  const at=(tr,t)=>tr&&tr.sections?tr.sections.find(s=>t>=s.start&&t<s.end)||null:null;
  const tag=(tr,t)=>{const s=at(tr,t);return s?'  ·  '+s.label.toUpperCase():'';};

  /* ---------- dessin ---------- */
  // waveform défilante : sections en bandeau de 4 px sous la forme (le nom de la section en cours est dans
  // l'en-tête de la lane, pas sur la forme), cues mémoire en triangles à leur couleur
  function drawLane(g,d,t0,pps,W,H,dpr){
    const tr=d.track;if(!tr||!tr.sections)return;
    g.save();
    const bg=(typeof TK!=='undefined'&&TK['surface-0'])||'#000';
    for(const s of tr.sections){
      const x0=(s.start-t0)*pps,x1=(s.end-t0)*pps;if(x1<0||x0>W)continue;
      const c=TYPES[s.type].col;
      g.globalAlpha=.85;g.fillStyle=c;g.fillRect(x0+dpr,H-4*dpr,x1-x0-dpr,4*dpr);
    }
    g.globalAlpha=1;
    (tr.memCues||[]).forEach(m=>{const x=(m.t-t0)*pps;if(x<-10||x>W+10)return;
      g.fillStyle=m.color;g.beginPath();g.moveTo(x-4*dpr,H-5*dpr);g.lineTo(x+4*dpr,H-5*dpr);g.lineTo(x,H-11*dpr);g.closePath();g.fill();
      g.strokeStyle=bg;g.lineWidth=dpr;g.stroke();});
    g.restore();
  }
  // vue d'ensemble : bande de couleur en bas, triangles des cues mémoire en haut
  function drawOv(og,tr,W,H){
    if(!tr.sections)return;
    const bg=(typeof TK!=='undefined'&&TK['surface-0'])||'#000';
    for(const s of tr.sections){const x0=Math.round(s.start/tr.duration*W),x1=Math.round(s.end/tr.duration*W),c=TYPES[s.type].col;
      og.globalAlpha=1;og.fillStyle=bg;og.fillRect(x0,H-4,x1-x0,4);og.globalAlpha=.85;og.fillStyle=c;og.fillRect(x0+1,H-3,Math.max(1,x1-x0-1),3);og.globalAlpha=1;}
    og.globalAlpha=1;
    (tr.memCues||[]).forEach(m=>{const x=m.t/tr.duration*W;og.fillStyle=m.color;og.beginPath();og.moveTo(x-4,0);og.lineTo(x+4,0);og.lineTo(x,6);og.closePath();og.fill();});
  }
  const legend=()=>'Couleurs : '+Object.values(TYPES).map(t=>t.label+' ('+t.name+')').join(' · ');
  function hover(el,d,toTime){
    const base=el.title||'';
    el.addEventListener('mousemove',e=>{
      const tr=d.track;if(!tr||!tr.sections){el.title=base;return;}
      const s=at(tr,toTime(e));
      el.title=(s?`${s.label} · ${fmtTime(s.start,false)} → ${fmtTime(s.end,false)} · ${s.bars} mesures\n`:'')+legend()+(base?'\n'+base:'');
    });
  }
  function build(){
    decks.forEach(d=>{
      const ov=d.ui.ov&&d.ui.ov.parentElement;
      if(ov)hover(ov,d,e=>{const r=ov.getBoundingClientRect();return(e.clientX-r.left)/r.width*d.track.duration;});
      const pps=cv=>{const w=cv.getBoundingClientRect().width;return w/ui.zoom/d.rate;};
      for(const cv of[d.ui.lane,d.ui.dw]){const el=cv&&cv.parentElement;if(el)hover(el,d,e=>{const r=el.getBoundingClientRect();return d.position()+(e.clientX-r.left-r.width/2)/pps(cv);});}
    });
  }
  return{queue,idle,build,at,tag,drawLane,drawOv,TYPES,legend,get busy(){return busy||Q.length>0;}};
})();
