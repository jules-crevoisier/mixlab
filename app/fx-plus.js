'use strict';
/* =====================================================================
   Mixlab · effets en plus
   Pitch, Hélice, Shimmer, Möbius, Reverb montante et Reverb qui retombe
   (8, 16 ou 32 temps), macros Montée, Descente et Scène, favoris d'effets
   (garder et rappeler la chaîne d'une unité).
   Chargé juste après engine.js : les types s'ajoutent aux listes des unités
   FX1 / FX2 avant que l'interface construise ses sélecteurs.
   Effets en plugin (VST, AU) : impossibles dans le moteur web. Voir docs/PARITE.md.
   ===================================================================== */
window.FxPlus=(()=>{
  /* ---------- pitch shifter réutilisable (deux lignes de retard en dents de scie, fondu croisé) ----------
     Même principe que le key lock du moteur, mais avec des nœuds exposés pour pouvoir les arrêter. */
  function shifter(){
    const c=ctx,bt=.1,ft=.05,sr=c.sampleRate,len=Math.round(bt*sr),fl=Math.round(ft*sr);
    const ramp=up=>{const b=c.createBuffer(1,len,sr),p=b.getChannelData(0);for(let i=0;i<len;i++)p[i]=up?(len-i)/len:i/len;return b;};
    const fade=c.createBuffer(1,len,sr),fp=fade.getChannelData(0);
    for(let i=0;i<len;i++)fp[i]=i<fl?Math.sqrt(i/fl):i>=len-fl?Math.sqrt(1-(i-(len-fl))/fl):1;
    const src=b=>{const s=c.createBufferSource();s.buffer=b;s.loop=true;return s;};
    const down=ramp(false),up=ramp(true),input=c.createGain(),output=c.createGain();
    const m=[src(down),src(down),src(up),src(up)],mg=m.map(()=>c.createGain());
    mg[2].gain.value=mg[3].gain.value=0;m.forEach((s,i)=>s.connect(mg[i]));
    const modA=c.createGain(),modB=c.createGain();
    mg[0].connect(modA);mg[2].connect(modA);mg[1].connect(modB);mg[3].connect(modB);
    const d1=c.createDelay(1),d2=c.createDelay(1);modA.connect(d1.delayTime);modB.connect(d2.delayTime);
    const f1=src(fade),f2=src(fade),x1=c.createGain(),x2=c.createGain();x1.gain.value=x2.gain.value=0;f1.connect(x1.gain);f2.connect(x2.gain);
    input.connect(d1);input.connect(d2);d1.connect(x1);d2.connect(x2);x1.connect(output);x2.connect(output);
    const t=c.currentTime+.02,t2=t+bt-ft;
    m[0].start(t);m[1].start(t2);m[2].start(t);m[3].start(t2);f1.start(t);f2.start(t2);
    const set=f=>{const mult=2*(f-1),upw=mult>0,n=c.currentTime;
      mg[0].gain.setValueAtTime(upw?0:1,n);mg[1].gain.setValueAtTime(upw?0:1,n);mg[2].gain.setValueAtTime(upw?1:0,n);mg[3].gain.setValueAtTime(upw?1:0,n);
      const dp=.5*bt*Math.abs(mult);modA.gain.setTargetAtTime(dp,n,.01);modB.gain.setTargetAtTime(dp,n,.01);};
    set(1);
    return{input,output,set,all:[input,output,...m,...mg,modA,modB,d1,d2,f1,f2,x1,x2]};
  }
  const semis=s=>Math.pow(2,s/12);
  const g=v=>{const n=ctx.createGain();n.gain.value=v==null?1:v;return n;};
  /* durée d'une macro : réglage 2 en trois crans, 8, 16 ou 32 temps de la platine de référence */
  const macroBeats=p=>p<.34?8:p<.67?16:32;
  const spbOf=sl=>{const r=sl.u.refFor(sl.tg);return r&&r.track?r.beatLen/r.rate:.5;};
  /* une macro prend la main sur sa voie : le son sec passe par l'effet (sortie identique au repos) */
  function engage(sl,s,r,t){setP(s.gain,1,t,.004);setP(r.gain,1,t,.004);setP(sl.dry.gain,0,t,.004);}
  const ramp=(p,from,to,t,L,exp)=>{holdP(p,t);p.setValueAtTime(from,t);if(exp)p.exponentialRampToValueAtTime(Math.max(1e-4,to),t+L);else p.linearRampToValueAtTime(to,t+L);};
  const back=(p,v,t,tc)=>{holdP(p,t);p.setTargetAtTime(v,t,tc);};

  const TYPES=[['pitchfx','Pitch'],['helix','Hélice'],['shimmer','Shimmer'],['mobius','Möbius'],['revrise','Reverb montante'],['revdrop','Reverb qui retombe'],['buildup','Montée (macro)'],['breakdown','Descente (macro)'],['scene','Scène (macro)']];
  const P={pitchfx:[['Hauteur',.75],['Retour',0]],helix:[['Retour',.7],['Pas',.75]],shimmer:[['Brillance',.5],['Coupe-bas',.3]],mobius:[['Vitesse',.5],['Sens',1]],
    revrise:[['Clarté',.6],['Durée',1]],revdrop:[['Clarté',.6],['Durée',1]],buildup:[['Intensité',.7],['Durée',1]],breakdown:[['Intensité',.7],['Durée',1]],scene:[['Couleur',.3],['Espace',.5]]};
  const KIND={pitchfx:'ins',helix:'send',shimmer:'send',mobius:'ins',revrise:'macro',revdrop:'macro',buildup:'macro',breakdown:'macro',scene:'macro'};
  const MIX={pitchfx:1,mobius:.5};

  const BUILD={
    /* Pitch : transposition de -12 à +12 demi-tons, avec un retour qui empile les octaves */
    pitchfx(send,ret){const ps=shifter(),fb=g(0);send.connect(ps.input);ps.output.connect(ret);ps.output.connect(fb);fb.connect(ps.input);
      return{all:[...ps.all,fb],param:(a,b)=>{ps.set(semis(Math.round((a-.5)*24)));tgt(fb.gain,b*.6);}};},
    /* Hélice : chaque répétition de l'écho monte (ou descend) d'un pas : une spirale de hauteur */
    helix(send,ret){const d=ctx.createDelay(12),ps=shifter(),fb=g(.6),hp=bq('highpass',180,.7);send.connect(d);d.connect(ps.input);ps.output.connect(hp);hp.connect(fb);fb.connect(d);hp.connect(ret);
      return{all:[d,fb,hp,...ps.all],update:p=>tgt(d.delayTime,clamp(p,.02,DMAX)),param:(a,b)=>{tgt(fb.gain,.4+a*.5);ps.set(semis((b-.5)*14));}};},
    /* Shimmer : reverb dont la queue est rejouée une octave plus haut, en boucle */
    shimmer(send,ret){const hp=bq('highpass',300,.7),cv=ctx.createConvolver();cv.buffer=impulse();const lp=bq('lowpass',12000,.5),ps=shifter(),fb=g(.3),wet=g(1.6),up=shifter(),ug=g(.6);ps.set(2);up.set(2);
      // l'octave entre aussi directement dans la reverb : le scintillement s'entend dès l'attaque
      send.connect(hp);hp.connect(cv);send.connect(up.input);up.output.connect(ug);ug.connect(cv);cv.connect(lp);lp.connect(wet);wet.connect(ret);lp.connect(ps.input);ps.output.connect(fb);fb.connect(hp);
      return{all:[hp,cv,lp,fb,wet,ug,...ps.all,...up.all],param:(a,b)=>{tgt(fb.gain,.15+.35*a);tgt(ug.gain,.3+.7*a);tgt(hp.frequency,60*Math.pow(25,b));}};},
    /* Möbius : flanger « barber pole » qui semble monter (ou descendre) sans fin */
    mobius(send,ret){const d=ctx.createDelay(.1),ps=shifter(),fb=g(.65);d.delayTime.value=.004;send.connect(d);d.connect(ps.input);ps.output.connect(fb);fb.connect(d);ps.output.connect(ret);
      return{all:[d,fb,...ps.all],param:(a,b)=>{const k=.002+.02*a*a;ps.set(b>=.5?1+k:1-k);}};},
    revrise(send,ret){return reverbMacro(send,ret,true);},
    revdrop(send,ret){return reverbMacro(send,ret,false);},
    /* Montée : filtre passe-haut qui monte, bruit qui monte, écho et reverb qui s'ouvrent.
       Au relâché, tout revient d'un coup : c'est le drop. */
    buildup(send,ret){
      const hp=bq('highpass',20,.9),dp=g(1),nz=ctx.createBufferSource();nz.buffer=noiseBuf();nz.loop=true;nz.start();
      const bp=bq('bandpass',800,.8),ng=g(0),dl=ctx.createDelay(4),fb=g(.5),eg=g(0),cv=ctx.createConvolver();cv.buffer=impulse();const rg=g(0);
      send.connect(hp);hp.connect(dp);dp.connect(ret);nz.connect(bp);bp.connect(ng);ng.connect(ret);
      hp.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(eg);eg.connect(ret);hp.connect(cv);cv.connect(rg);rg.connect(ret);
      const st={k:.7,dur:1};
      return{all:[hp,dp,nz,bp,ng,dl,fb,eg,cv,rg],param:(a,b)=>{st.k=a;st.dur=b;},act:(on,t,sl)=>{
        if(on){const spb=spbOf(sl),L=macroBeats(st.dur)*spb,k=.3+.7*st.k;engage(sl,sl.s,sl.r,t);dl.delayTime.setValueAtTime(clamp(spb/2,.02,3),t);
          ramp(hp.frequency,20,200+2200*k,t,L,true);ramp(bp.frequency,400,6000,t,L,true);ramp(ng.gain,1e-4,.28*k,t,L,true);ramp(eg.gain,0,.6*k,t,L);ramp(rg.gain,0,.9*k,t,L);ramp(dp.gain,1,1-.35*k,t,L);}
        else{back(hp.frequency,20,t,.005);back(ng.gain,0,t,.01);back(eg.gain,0,t,.05);back(rg.gain,0,t,.08);back(dp.gain,1,t,.005);}
      }};},
    /* Descente : le morceau s'étouffe (passe-bas qui descend) et part dans la reverb */
    breakdown(send,ret){
      const lp=bq('lowpass',20000,1.2),dp=g(1),cv=ctx.createConvolver();cv.buffer=impulse();const rg=g(0);
      send.connect(lp);lp.connect(dp);dp.connect(ret);send.connect(cv);cv.connect(rg);rg.connect(ret);
      const st={k:.7,dur:1};
      return{all:[lp,dp,cv,rg],param:(a,b)=>{st.k=a;st.dur=b;},act:(on,t,sl)=>{
        if(on){const L=macroBeats(st.dur)*spbOf(sl),k=.3+.7*st.k;engage(sl,sl.s,sl.r,t);
          ramp(lp.frequency,20000,2500-2150*k,t,L,true);ramp(dp.gain,1,1-.5*k,t,L);ramp(rg.gain,0,.9*k,t,L);}
        else{back(lp.frequency,20000,t,.01);back(dp.gain,1,t,.01);back(rg.gain,0,t,.3);}
      }};},
    /* Scène : le Dosage pilote plusieurs effets à la fois (filtre, écho, reverb).
       Couleur : à gauche plus sombre (passe-bas), à droite plus clair (passe-haut). Espace : écho ou reverb. */
    scene(send,ret){
      const lp=bq('lowpass',20000,1),hp=bq('highpass',10,1),dp=g(1),dl=ctx.createDelay(4),fb=g(.45),eg=g(0),cv=ctx.createConvolver();cv.buffer=impulse();const rg=g(0);
      send.connect(lp);lp.connect(hp);hp.connect(dp);dp.connect(ret);hp.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(eg);eg.connect(ret);hp.connect(cv);cv.connect(rg);rg.connect(ret);
      const st={c:.3,e:.5,sl:null,m:-1};
      const draw=m=>{
        if(Math.abs(m-st.m)<.002)return;st.m=m;
        const dark=st.c<.5,k=Math.abs(st.c-.5)*2*m;
        tgt(lp.frequency,dark?20000*Math.pow(300/20000,k):20000);tgt(hp.frequency,dark?10:10*Math.pow(150,k));
        tgt(eg.gain,m*(1-st.e)*.8);tgt(rg.gain,m*st.e*1.1);tgt(dp.gain,1-.25*m);
      };
      return{all:[lp,hp,dp,dl,fb,eg,cv,rg],param:(a,b)=>{st.c=a;st.e=b;st.m=-1;},
        act:(on,t,sl)=>{st.sl=sl;if(on)engage(sl,sl.s,sl.r,t);},
        tick:(ref,beats,on)=>{if(ref&&ref.track){const p=clamp(.75*ref.beatLen/ref.rate,.02,3);if(Math.abs(dl.delayTime.value-p)>1e-3)tgt(dl.delayTime,p);}draw(on&&st.sl?st.sl.c.amount:0);}};}
  };
  /* Reverb montante : la reverb s'ouvre sur 8, 16 ou 32 temps pendant que le morceau recule.
     Reverb qui retombe : tout de suite dans la reverb, puis le morceau revient sur la durée. */
  function reverbMacro(send,ret,rise){
    const dp=g(1),hp=bq('highpass',150,.7),cv=ctx.createConvolver();cv.buffer=impulse();const lp=bq('lowpass',9000,.5),wg=g(0);
    send.connect(dp);dp.connect(ret);send.connect(hp);hp.connect(cv);cv.connect(lp);lp.connect(wg);wg.connect(ret);
    const st={c:.6,dur:1};
    return{all:[dp,hp,cv,lp,wg],param:(a,b)=>{st.c=a;st.dur=b;tgt(lp.frequency,700*Math.pow(26,a));},act:(on,t,sl)=>{
      if(on){const L=macroBeats(st.dur)*spbOf(sl),a=.25+.75*sl.c.amount;engage(sl,sl.s,sl.r,t);
        if(rise){ramp(wg.gain,1e-3,2*a,t,L,true);ramp(dp.gain,1,1-.6*a,t,L);ramp(hp.frequency,120,700,t,L,true);}
        else{ramp(wg.gain,2*a,1e-3,t,L,true);ramp(dp.gain,1-.7*a,1,t,L);ramp(hp.frequency,700,120,t,L,true);}}
      else{back(wg.gain,0,t,.35);back(dp.gain,1,t,.01);}
    }};
  }
  // branchement dans les listes du moteur (engine.js) : les sélecteurs des unités les affichent
  TYPES.forEach(x=>{if(!FX_TYPES.some(y=>y[0]===x[0]))FX_TYPES.push(x);});
  Object.assign(FX_P,P);Object.assign(FX_KIND,KIND);Object.assign(FX_MIX,MIX);Object.assign(FX_BUILD,BUILD);

  /* ---------- favoris : la chaîne d'une unité gardée sous un nom ---------- */
  const KEY='mixlab2.fxFavs';
  const load=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}};
  const save=l=>{try{localStorage.setItem(KEY,JSON.stringify(l));}catch(e){}};
  const snap=u=>({mode:u.mode,beats:u.beats,slots:u.slots.map(s=>({type:s.type,amount:s.amount,on:s.on,p1:s.p1,p2:s.p2}))});
  function saveFav(u,name){
    const l=load(),n=(name||'').trim()||('Favori '+(l.length+1)),i=l.findIndex(f=>f.name===n),f={name:n,...snap(u)};
    if(i>=0)l[i]=f;else l.push(f);save(l);return f;
  }
  function recall(u,f){
    if(typeof f==='string'||typeof f==='number')f=typeof f==='number'?load()[f]:load().find(x=>x.name===f);
    if(!f||!Array.isArray(f.slots))return false;
    const types=new Set(FX_TYPES.map(x=>x[0]));
    u.mode=f.mode==='chain'?'chain':'single';if(FX_BEATS.includes(f.beats))u.beats=f.beats;
    f.slots.slice(0,u.slots.length).forEach((s,i)=>{if(!s||!types.has(s.type))return;u.setSlot(i,{type:s.type});u.setSlot(i,{amount:clamp(+s.amount||0,0,1),on:!!s.on,p1:clamp(+s.p1||0,0,1),p2:clamp(+s.p2||0,0,1)});});
    u.applyAll();
    const U=u.ui;if(U){U.slots.forEach((x,i)=>{x.amt.set(u.slots[i].amount);x.k1.set(u.slots[i].p1);x.k2.set(u.slots[i].p2);});window.renderFxUnit&&renderFxUnit(u);}
    return true;
  }
  const remove=name=>save(load().filter(f=>f.name!==name));
  function favMenu(u,anchor){
    if(!window.Perf)return;
    const list=h('div',{class:'pl'}),name=h('input',{type:'text',class:'pin',maxlength:24,placeholder:'Nom : Drop, Break, Intro…','aria-label':'Nom du favori'});
    const render=()=>{list.innerHTML='';const l=load();
      l.forEach((f,i)=>list.append(h('div',{class:'pr'},h('span',{class:'pn'},String(i+1)),
        h('button',{type:'button',class:'b',style:'flex:1;justify-content:flex-start',title:f.slots.filter((s,k)=>f.mode==='chain'?s.on:k===0).map(s=>(FX_TYPES.find(t=>t[0]===s.type)||['',s.type])[1]).join(' + '),onclick:()=>{recall(u,f);toast('FX'+u.n+' : « '+f.name+' » rappelé','ok');Perf.close();}},f.name),
        h('button',{type:'button',class:'b','aria-label':'Supprimer le favori '+f.name,onclick:()=>{remove(f.name);render();}},'×'))));
      if(!l.length)list.append(h('div',{class:'pe'},'Aucun favori. Règle l’unité, donne un nom, puis Garder.'));};
    const keep=()=>{const f=saveFav(u,name.value);name.value='';render();toast('Favori « '+f.name+' » gardé','ok');};
    name.addEventListener('keydown',e=>{if(e.key==='Enter')keep();});
    render();
    Perf.popover(anchor,'FX'+u.n+' · favoris',[h('div',{class:'ps'},name,h('button',{class:'b',type:'button',onclick:keep},'Garder')),list]);
  }
  function init(){
    if(typeof FXU==='undefined')return;
    FXU.forEach(u=>{
      const U=u.ui;if(!U||U.fav)return;
      const b=h('button',{class:'b fxfav',type:'button','data-ctl':u.id+'.fav',title:'Favoris : garder ou rappeler la chaîne de cette unité','aria-label':'Favoris de FX'+u.n,onclick:()=>favMenu(u,b)},'Fav');
      U.fav=b;U.root.insertBefore(b,U.mode||null);
      for(let i=0;i<4;i++)regBtn(u.id+'.fav'+(i+1),'FX'+u.n+' favori '+(i+1),b,()=>{const f=load()[i];if(f){recall(u,f);toast('FX'+u.n+' : « '+f.name+' »','ok');}});
    });
  }
  return{init,shifter,TYPES,saveFav,recall,remove,list:load,favMenu,macroBeats};
})();
