'use strict';
/* =====================================================================
   Mixlab · affichage pour le live sur portable
   Rien ne défile : la hauteur est répartie entre waveforms, platines et
   bibliothèque, avec des séparateurs à glisser (retenus par preset).
   Tailles de platine (complète, compacte, mini), bibliothèque plein
   écran, zoom de l'interface, mode scène, plein écran, et les panneaux
   propres aux presets : préparation, panneau latéral, compteur de temps.
   ===================================================================== */
window.View=(()=>{
  const SIZES=['full','compact','mini'],SNAME={auto:'Auto',full:'Complètes',compact:'Compactes',mini:'Mini'};
  const LMIN=205,LANEMIN=26;
  const V={zoom:clamp(+store.get('uiZoom',1)||1,.8,1.5),stage:!!store.get('stage',false),libFull:false,
    sizes:store.get('deckSizes',{}),fxFold:!!store.get('fxFold',false),splits:store.get('splits',{}),cur:null,el:{},sig:{}};
  const key=()=>layout.preset+':'+S.numDecks;
  const PR=()=>PRESETS[layout.preset];
  const css=(k,v)=>document.documentElement.style.setProperty(k,v);
  const app=()=>$('#app');
  const panel=d=>d.ui.panel||(d.ui.panel=$('#p-deck'+d.id));
  const narrow=()=>matchMedia('(max-width:1100px)').matches;

  /* ---------- répartition de la hauteur ---------- */
  function rowsFor(t){
    return layout.rows.map(r=>r.kind==='lib'?`minmax(${Math.round(t.L)}px,1fr)`:r.kind==='split'?'6px':r.kind==='fill'?'1fr':'min-content').join(' ');
  }
  function apply(t){
    const P=PR(),A=app();
    decks.forEach(d=>{const el=panel(d),s=P.prep&&!el.classList.contains('big')&&S.numDecks===4?'mini':t.sz;
      if(!el.classList.contains('sz-'+s)){el.classList.remove('sz-full','sz-compact','sz-mini');el.classList.add('sz-'+s);}
      // platine mini : pads et boucle tant qu'ils tiennent, puis pads seuls, puis rien
      const mp=s!=='mini'?2:t.sz==='mini'?t.mp??2:0; // petites platines de Préparation : sans pads
      el.classList.toggle('mini-nl',mp<2);el.classList.toggle('mini-np',mp<1);});
    $('#p-mixer').classList.toggle('mxc',t.mx==='compact');$('#p-fx').classList.toggle('fxfold',!!t.fx);
    css('--jog',t.j+'px');css('--lane',t.ln+'px');css('--dkw',t.ln+'px');css('--fdr',t.mx==='compact'?'92px':'150px');
    A.style.gridTemplateRows=rowsFor(t);
  }
  function fits(){
    const A=app();if(A.scrollHeight>A.clientHeight+1)return false;
    for(const d of decks)if(d.active){const el=panel(d);if(el.scrollHeight>el.clientHeight+1)return false;}
    const m=$('#p-mixer');if(!m.hidden&&m.scrollHeight>m.clientHeight+1)return false;
    return true;
  }
  /* Place laissée à la bibliothèque par un état (taille des platines, mixer, jog, waveforms) :
     une seule mise en page par état, la bibliothèque à 0 prend tout le reste. */
  function room(t){
    const A=app(),li=layout.rows.findIndex(r=>r.kind==='lib'||r.kind==='fill');
    apply({...t,L:0});
    const over=A.scrollHeight-A.clientHeight;
    if(li<0)return over>1?-1:1e4;
    return parseFloat(getComputedStyle(A).gridTemplateRows.split(' ')[li])-Math.max(0,over);
  }
  function fit(){
    const A=app();if(!A||!layout.rows.length)return;
    if(narrow()){A.style.gridTemplateRows='';return;}
    if(V.libFull)return fitLibFull();
    const t0=performance.now(),P=PR(),n=S.numDecks,k=key(),sp=V.splits[k]||{},H=A.clientHeight;
    // mode scène : waveforms 40 % plus hautes ; écran de moins de 800 px : la bibliothèque cède d'abord sa part (30 % de la fenêtre)
    const lane0=clamp(sp.lane??Math.round(P.lane[n]*(V.stage?1.4:1)),LANEMIN,220),short=innerHeight/V.zoom<800;
    const L0=clamp(sp.lib!=null?sp.lib*H:short?Math.min(P.lib*H,.305*innerHeight/V.zoom):P.lib*H,LMIN,Math.max(LMIN,H*.85));
    // la bibliothèque garde sa part (preset ou séparateur) ; à défaut au moins un tiers ; en dernier recours 5 lignes
    const Lp=Math.min(L0,Math.max(LMIN,H*.33));
    const user=V.sizes[k]||'auto';
    let sizes=user==='auto'?SIZES.slice():SIZES.slice(SIZES.indexOf(user));
    if(P.prep&&sizes[0]==='mini')sizes=['full','compact','mini'];
    const mxs=P.mixer==='compact'?['compact']:['full','compact'];
    const J=(P.jog&&P.jog[n])||0,jogs=sz=>sz==='full'&&!P.noJog&&J?[J,Math.round(J*.86),Math.round(J*.74)]:[J||120];
    // rangée d'effets repliée sur une ligne : avant de passer à une taille de platine plus petite (toujours en mode scène)
    const fxOn=layout.visible.has('fx')&&layout.rows.some(r=>r.a.includes('fx')),fxs=!fxOn?[false]:V.stage||V.fxFold?[true]:[false,true];
    // pour chaque taille, on essaie d'abord la variante la plus petite : si elle ne tient pas, la taille est écartée
    let ok=null,fb=null,nl=0,last=null,lastVars=[];A.classList.add('fitting');
    let best=null,bestR=-1e9;const note=(t,r)=>{if(r>bestR){bestR=r;best=t;}};
    const tol=Math.max(1,Math.min(L0-Lp,H*.04)),judge=(t,r)=>{note(t,r);if(r>=L0-tol){ok={...t,L:Math.min(L0,r)};return true;}if(!fb&&r>=Lp-1)fb={...t,L:Lp};if(user!=='auto'&&t.sz===user&&!fb&&r>=LMIN-1)fb={...t,L:Math.max(LMIN,Math.min(r,Lp))};return false;};
    for(const sz of sizes){
      const vars=[],mps=sz==='mini'?[2,1,0]:[2];mps.forEach(mp=>mxs.forEach(mx=>jogs(sz).forEach(j=>fxs.forEach(fx=>vars.push({sz,mx,j,fx,mp,ln:lane0})))));
      const small=last=vars[vars.length-1],rs=room(small);nl++;note(small,rs);lastVars=vars;
      // plutôt des waveforms un peu plus basses que des platines sans pads
      let hit=false;
      if((sz==='compact'||sz===user)&&sp.lane==null&&rs<L0-tol)for(const f of sz===user?[.8,.6]:[.8]){const t={...small,ln:Math.max(LANEMIN,Math.round(lane0*f))};if(t.ln>=lane0)break;nl++;const r=room(t);if(judge(t,r)){hit=true;break;}if(r>=Lp-1)break;}
      if(hit)break;
      if(rs<LMIN-1||(rs<Lp-1&&user!==sz))continue;
      // platine trop étroite pour son jog : la taille complète n'apporte rien, la compacte est plus nette
      if(sz==='full'&&J&&!P.noJog&&user!=='full'&&decks.some(d=>d.active&&!panel(d).classList.contains('big')&&getComputedStyle($('.dk-plat',panel(d))).display==='none'))continue;
      let done=false;
      for(const t of vars.slice(0,-1)){nl++;if(judge(t,room(t))){done=true;break;}}
      if(done||judge(small,rs))break;
    }
    // bibliothèque agrandie à la main : on lui donne tout ce que les plus petites platines laissent
    if(!ok&&sp.lib!=null&&sp.lane==null&&best)for(const f of [.82,.68]){const t={...best,ln:Math.max(LANEMIN,Math.round(lane0*f))};if(t.ln>=best.ln)continue;nl++;const r=room(t);if(r>bestR){best=t;bestR=r;}if(r>=L0-tol)break;}
    ok=ok||(sp.lib!=null&&best&&bestR>=Lp-1?{...best,L:Math.min(L0,bestR)}:fb);
    if(!ok){
      // waveforms plus basses : on garde la variante la plus riche (pads de la platine mini, effets dépliés) qui laisse sa part à la bibliothèque
      const lns=[Math.round(lane0*.82),Math.round(lane0*.68),LANEMIN].filter(x=>x<lane0&&x>=LANEMIN);
      const rich=lastVars.filter(v=>v!==last&&v.mx===last.mx&&v.j===last.j&&v.fx===last.fx);
      // en mode scène, la hauteur des waveforms passe avant les pads de la platine mini
      for(const ln of V.stage?lns.slice(0,1):lns){for(const v of rich){const r=room({...v,ln});nl++;if(r>=Lp-1){ok={...v,ln,L:Lp};break;}}if(ok)break;}
      if(!ok)for(const ln of lns){const r=room({...last,ln});nl++;if(r>=LMIN-1){ok={...last,ln,L:Math.max(LMIN,Math.min(r,Lp))};break;}}
      if(!ok)ok={...last,ln:LANEMIN,L:LMIN};
    }
    A.classList.remove('fitting');apply(ok);
    V.cur=ok;V.fitMs=performance.now()-t0;V.fitN=nl;after();
  }
  function fitLibFull(){
    const A=app();
    A.style.gridTemplateColumns='minmax(0,1fr)';A.style.gridTemplateAreas='"wave" "lib"';A.style.gridTemplateRows='auto minmax(0,1fr)';
    $('#p-wave').hidden=false;css('--lane',(S.numDecks===4?24:32)+'px');
    after();
  }
  // Ce qui se dessine dépend de ce qui est visible : on le note pour la boucle d'affichage.
  function after(){
    decks.forEach(d=>{const el=panel(d),pl=$('.dk-plat',el),dw=$('.dk-wave',el);
      d.ui.jogOn=!!(d.active&&pl&&pl.offsetParent&&!V.libFull);d.ui.dwOn=!!(d.active&&dw&&dw.offsetParent&&!V.libFull);});
    tabsMore();
    syncMenu();
  }
  // modes de pads trop larges pour une platine compacte : fondu à droite tant qu'il reste des onglets à faire défiler
  function tabsMore(){$$('.deck .tabs').forEach(t=>t.classList.toggle('more',t.scrollWidth-t.scrollLeft>t.clientWidth+2));}
  function layoutHook(){
    const A=app(),P=PR();
    A.classList.toggle('lib-full',V.libFull);A.classList.toggle('prep-mode',!!P.prep);A.classList.toggle('simple',!!P.simple);
    A.classList.toggle('beatbar',!!P.beatBar&&S.numDecks===2);
    const libOn=layout.visible.has('lib');
    V.el.prep.hidden=!P.prep;V.el.side.hidden=!P.side||!libOn;A.classList.toggle('has-side',!!P.side&&libOn);
    dock(!!P.side&&libOn);
    const has=a=>layout.rows.some(r=>r.a.includes(a));
    V.el.spw.hidden=!has('spw')||V.libFull;V.el.spl.hidden=!has('spl')||V.libFull;
    V.el.libBtn.setAttribute('aria-pressed',String(V.libFull));
    fit();renderPrep(true);
  }

  /* ---------- séparateurs ---------- */
  function splitter(id,area,title,drag,reset){
    const el=h('div',{class:'split',id,style:'grid-area:'+area,role:'separator','aria-orientation':'horizontal','aria-label':title,title:title+' · double-clic : taille par défaut',tabindex:0});
    let y0=null,st=null,raf=0,ly=0;
    // une image par rafraîchissement, toujours avec la dernière position ; rien ne s'applique après le relâchement
    const apply=()=>{raf=0;if(y0==null)return;drag(st,(ly-y0)/V.zoom);fit();};
    const run=y=>{ly=y;if(!raf)raf=requestAnimationFrame(apply);};
    el.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();el.setPointerCapture(e.pointerId);el.classList.add('drag');y0=e.clientY;st=start();});
    el.addEventListener('pointermove',e=>{if(y0==null||!el.hasPointerCapture(e.pointerId))return;run(e.clientY);});
    const end=e=>{if(y0==null)return;if(e&&e.type==='pointerup')ly=e.clientY;if(raf){cancelAnimationFrame(raf);apply();}y0=null;el.classList.remove('drag');store.set('splits',V.splits);};
    el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
    el.addEventListener('dblclick',()=>{reset();store.set('splits',V.splits);fit();});
    el.addEventListener('keydown',e=>{const s=e.key==='ArrowUp'?-12:e.key==='ArrowDown'?12:0;if(!s)return;e.preventDefault();drag(start(),s);store.set('splits',V.splits);fit();});
    return el;
  }
  const start=()=>{const A=app(),lib=$('#p-lib');return{lane:V.cur?V.cur.ln:PR().lane[S.numDecks],lib:lib.hidden?0:lib.getBoundingClientRect().height/V.zoom,H:A.clientHeight};};
  const sp=()=>V.splits[key()]||(V.splits[key()]={});
  const nLanes=()=>Math.max(1,decks.filter(d=>d.active).length);

  /* ---------- tailles de platine ---------- */
  function sizeOf(d){return SIZES.find(s=>panel(d).classList.contains('sz-'+s))||'full';}
  function setSize(s,quiet){
    if(s==='auto')delete V.sizes[key()];else V.sizes[key()]=s;store.set('deckSizes',V.sizes);fit();
    if(quiet)return;
    const d=decks.find(x=>x.active&&!(PR().prep&&!panel(x).classList.contains('big'))),got=d?sizeOf(d):s;
    toast(s==='auto'?'Taille des platines : automatique':got===s?'Platines '+SNAME[s].toLowerCase():'Pas assez de hauteur : platines '+SNAME[got].toLowerCase()+'. Réduis la bibliothèque ou le zoom.');
  }
  function cycle(d){
    if(PR().prep&&!panel(d).classList.contains('big')){layout.focus=d.id;applyLayout();toast('Platine '+d.id+' dans le grand lecteur');return;}
    // on passe à la taille suivante qui tient vraiment à l'écran (complète → compacte → mini → complète)
    const cur=sizeOf(d),rot={full:'compact',compact:'mini',mini:'full'};let nx=cur;
    for(let i=0;i<3;i++){nx=rot[nx];if(PR().prep&&nx==='mini')continue;V.sizes[key()]=nx;fit();if(sizeOf(d)!==cur)break;}
    store.set('deckSizes',V.sizes);
    const got=sizeOf(d);toast(got===cur?'Pas assez de hauteur pour changer la taille des platines':'Platines '+SNAME[got].toLowerCase()+(got!==nx?' (pas assez de hauteur pour '+SNAME[nx].toLowerCase()+')':''));
    if(got!==nx){V.sizes[key()]=got;store.set('deckSizes',V.sizes);}
  }
  function tip(d){const tr=d.track,t=tr?tr.title+(tr.artist?' · '+tr.artist:''):'';d.ui.title.title=t;d.ui.artist.title=t;}

  /* ---------- bibliothèque plein écran ---------- */
  function toggleLib(on){
    V.libFull=on;applyLayout();
    const q=$('#p-lib input[type=search]');
    if(on&&q)q.focus();else if(!on&&document.activeElement&&document.activeElement.closest('#p-lib'))document.activeElement.blur();
  }

  /* ---------- zoom de l'interface et mode scène ---------- */
  function setZoom(z,quiet){
    V.zoom=clamp(Math.round(z*20)/20,.8,1.5);store.set('uiZoom',V.zoom);css('--uiz',String(V.zoom));
    if(V.el.zv)V.el.zv.textContent=Math.round(V.zoom*100)+' %';
    fit();fitTop();closeMenus();if(!quiet)toast('Zoom de l’interface : '+Math.round(V.zoom*100)+' %');
  }
  // rangée d'effets repliée sur une ligne (nom, cible, effet, dosage, On), retenue d'une session à l'autre
  function toggleFxFold(){V.fxFold=!V.fxFold;store.set('fxFold',V.fxFold);fit();FXU.forEach(renderFxUnit);}
  function setStage(on){
    V.stage=on;store.set('stage',on);document.documentElement.classList.toggle('stage',on);readTokens();
    if(V.el.stageBtn)V.el.stageBtn.setAttribute('aria-pressed',String(on));if(V.el.stageCk)V.el.stageCk.checked=on;
    fit();fitTop();
  }
  async function toggleFs(){
    try{
      const T=window.__TAURI__,w=T&&T.window&&T.window.getCurrentWindow&&T.window.getCurrentWindow();
      if(w){await w.setFullscreen(!(await w.isFullscreen()));return;}
      if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen({navigationUI:'hide'});
    }catch(e){toast('Plein écran indisponible ici : essaie la touche F11.');}
  }

  /* ---------- menu Affichage et barre du haut ---------- */
  function syncMenu(){
    const k=key(),s=V.sizes[k]||'auto';if(V.el.size)V.el.size.value=s;
    if(V.el.zv)V.el.zv.textContent=Math.round(V.zoom*100)+' %';
  }
  function buildMenu(){
    const pop=$('#panels-pop'),sum=$('details.menu summary',$('#top'));
    if(sum&&sum.closest('details').contains(pop))sum.textContent='Affichage';
    pop.classList.add('vmenu');
    const mini=(txt,title,fn)=>h('button',{class:'b',type:'button',title,onclick:fn},txt);
    V.el.zv=h('button',{class:'b zv',type:'button',title:'Revenir à 100 % (Ctrl 0)',onclick:()=>setZoom(1)},'100 %');
    V.el.size=h('select',{class:'sel wide','aria-label':'Taille des platines'},Object.entries(SNAME).map(([k,n])=>h('option',{value:k},n)));
    V.el.size.addEventListener('change',()=>setSize(V.el.size.value));
    V.el.stageCk=h('input',{type:'checkbox',onchange:e=>setStage(e.target.checked)});V.el.stageCk.checked=V.stage;
    pop.append(
      h('div',{class:'lbl'},'Zoom de l’interface'),
      h('div',{class:'r fixed'},mini('−','Réduire (Ctrl −)',()=>setZoom(V.zoom-.1)),V.el.zv,mini('+','Agrandir (Ctrl +)',()=>setZoom(V.zoom+.1))),
      h('div',{class:'lbl'},'Platines (clic sur l’en-tête)'),V.el.size,
      h('div',{class:'lbl'},'Waveforms : hauteur et zoom'),
      h('div',{class:'r fixed'},mini('−','Moins haute',()=>wh(-1)),mini('+','Plus haute',()=>wh(1)),h('span',{style:'width:8px'}),mini('Zoom −','Voir plus de temps (Ctrl + molette sur la waveform)',()=>setZoom2(ui.zoom*1.5)),mini('Zoom +','Voir moins de temps',()=>setZoom2(ui.zoom/1.5))),
      h('label',{title:'Contraste renforcé, gros chiffres, textes plus grands : pour une cabine sombre (F9)'},V.el.stageCk,'Mode scène (F9)'),
      h('div',{class:'r fixed vm-acts'},mini('Bibliothèque plein écran','Touche F2, Échap pour revenir',()=>{pop.closest('details').open=false;toggleLib(!V.libFull);}),
        mini('Plein écran','Toute la place pour l’appli',()=>{pop.closest('details').open=false;toggleFs();})),
      mini('Disposition par défaut','Remet les séparateurs et la taille des platines de ce preset',resetLayout),
      h('button',{class:'b vm-prefs',id:'prefs-menu',type:'button',title:'Tous les réglages : profil, audio, platines, mixer, clavier, coach (Ctrl+,)',onclick:()=>{closeMenus();window.Prefs&&Prefs.open('affichage');}},'Préférences…'));
    const top=$('#top'),rec=$('#rec-btn');
    V.el.libBtn=h('button',{class:'tb',id:'lib-btn',type:'button','data-ctl':'ui.libfull','aria-pressed':'false',title:'Bibliothèque plein écran (F2). Échap pour revenir aux platines.',onclick:()=>toggleLib(!V.libFull)},'Biblio');
    // Mode scène : une icône toujours visible (même à 1366 px), et la touche F9
    const ico=svgEl('svg',{viewBox:'0 0 16 16','aria-hidden':'true'});ico.append(svgEl('circle',{cx:8,cy:8,r:6.2,fill:'none',stroke:'currentColor','stroke-width':1.6}),svgEl('path',{d:'M8 1.8 A6.2 6.2 0 0 1 8 14.2 Z',fill:'currentColor'}));
    V.el.stageBtn=h('button',{class:'tb ico',id:'stage-btn',type:'button','data-ctl':'ui.stage','aria-pressed':String(V.stage),'aria-label':'Mode scène',title:'Mode scène (F9) : contraste renforcé, waveforms plus hautes, gros BPM et temps restant',onclick:()=>setStage(!V.stage)},ico);
    V.el.fsBtn=h('button',{class:'tb ico',id:'fs-btn',type:'button',title:'Plein écran','aria-label':'Plein écran',onclick:toggleFs},'⛶');
    $$('#ndecks button').forEach(b=>{b.title=b.textContent;b.setAttribute('aria-label',b.textContent);b.innerHTML=b.dataset.n+'<span class="w"> platines</span>';});
    // menu « ⋯ » : reçoit les boutons qui ne tiennent plus dans la barre (au lieu de les couper)
    V.el.morePop=h('div',{class:'pop vmore',role:'menu'});
    V.el.more=h('details',{class:'tbmore',id:'top-more',hidden:true},h('summary',{class:'tb ico',title:'Autres commandes','aria-label':'Autres commandes'},'⋯'),V.el.morePop);
    V.el.morePop.addEventListener('click',e=>{if(e.target.closest('button,label.tb'))V.el.more.open=false;});
    top.insertBefore(V.el.libBtn,$('#audio-btn')||rec);top.append(V.el.stageBtn,V.el.fsBtn,V.el.more);
    regBtn('ui.libfull','Bibliothèque plein écran',V.el.libBtn,()=>toggleLib(!V.libFull));
    regBtn('ui.stage','Mode scène',V.el.stageBtn,()=>setStage(!V.stage));
    $$('details',top).forEach(menuPop);
    // la liste des raccourcis (fenêtre Contrôleur) a été dessinée avant ces deux commandes : on la redessine avec leurs noms
    if(window.Controllers&&Controllers.renderKeys)Controllers.renderKeys();
  }
  /* Menus de la barre du haut : le panneau sort du flux de #top (position fixe calée sur le bouton),
     il n'est donc jamais rogné, quelle que soit la largeur ; un clic ailleurs ou Échap le referme. */
  function menuPop(det){
    if(det._mp)return;det._mp=1;
    det.addEventListener('toggle',()=>{if(!det.open)return;$$('#top details[open]').forEach(x=>{if(x!==det)x.open=false;});placePop(det);});
  }
  function placePop(det){
    const pop=$(':scope>.pop',det),sum=$(':scope>summary',det);if(!pop||!sum||!det.open)return;
    const s=sum.getBoundingClientRect(),z=V.zoom,W=innerWidth/z,H=innerHeight/z;
    pop.style.position='fixed';pop.style.top=(s.bottom/z+4)+'px';pop.style.right='auto';
    pop.style.maxHeight=Math.max(140,H-s.bottom/z-10)+'px';pop.style.overflowY='auto';
    pop.style.left=Math.max(6,Math.min(s.left/z,W-pop.offsetWidth-6))+'px';
  }
  function wh(dir){const s=start();sp().lane=clamp(s.lane+dir*6,LANEMIN,220);store.set('splits',V.splits);fit();}
  function resetLayout(){delete V.splits[key()];delete V.sizes[key()];store.set('splits',V.splits);store.set('deckSizes',V.sizes);fit();toast('Disposition « '+PR().name+' » remise par défaut');}
  function closeMenus(){$$('#top details[open]').forEach(x=>{x.open=false;});}
  const COLLAPSE=['#ag-btn','#q-btn','#audio-btn','#midi-btn','#fs-btn','#pc-btn','#am-btn','#lib-btn','#prefs-btn','#rec-btn','#ndecks'];
  const overTop=t=>t.scrollWidth>t.clientWidth+1;
  // La barre du haut ne déborde jamais : les boutons les moins urgents passent dans « ⋯ », dans cet ordre.
  function fitTop(){
    const top=$('#top'),more=V.el.more,pop=V.el.morePop;if(!top||!more)return;
    [...pop.children].forEach(el=>{if(el._ph&&el._ph.parentNode)el._ph.parentNode.insertBefore(el,el._ph);else top.insertBefore(el,more);});
    more.hidden=true;
    if(overTop(top)){
      more.hidden=false;
      for(const sel of COLLAPSE){const el=$(sel);if(!el||el.parentElement!==top)continue;
        if(!el._ph){el._ph=document.createComment(sel);el.before(el._ph);}pop.append(el);if(!overTop(top))break;}
      [...pop.children].sort((a,b)=>a._ph.compareDocumentPosition(b._ph)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1).forEach(e=>pop.append(e));
    }
    if(!pop.children.length)more.open=false;
    if(V.topMo)V.topMo.takeRecords();
    $$('#top details[open]').forEach(placePop);
  }
  const setZoom2=z=>window.setZoom(z); // zoom des waveforms (app.js), à ne pas confondre avec le zoom de l'interface

  /* ---------- panneau Préparation (preset Préparation) ---------- */
  function buildPrep(){
    const P=h('section',{class:'pnl',id:'p-prep',style:'grid-area:prep','aria-label':'Préparation du morceau',hidden:true});
    app().append(P);V.el.prep=P;
  }
  const prepDeck=()=>decks.find(d=>d.active&&panel(d).classList.contains('big'))||decks.find(d=>d.active);
  function renderPrep(force){
    const P=V.el.prep;if(!P||P.hidden)return;
    const d=prepDeck(),tr=d&&d.track;
    const sig=[d&&d.id,tr&&tr.id,tr&&tr.title,tr&&tr.bpm.toFixed(2),tr&&tr.grid.toFixed(3),tr&&tr.hot.join(),tr&&tr.cue,tr&&(tr.memCues||[]).length,tr&&(tr.sections||[]).length].join('|');
    if(!force&&sig===V.sig.prep)return;V.sig.prep=sig;
    P.innerHTML='';if(!d)return;
    P.style.setProperty('--dc','var(--'+d.id+')');
    const sec=(t,...k)=>h('div',{class:'pp-sec'},h('div',{class:'lbl'},t),...k);
    const B=(txt,title,fn)=>h('button',{class:'b',type:'button',title,onclick:()=>{fn();renderPrep(true);}},txt);
    P.append(h('div',{class:'pp-h'},h('span',{class:'dk-id'},d.id),h('div',{style:'min-width:0'},h('b',{},'Préparation'),h('div',{class:'pp-t',title:tr?tr.title:''},tr?tr.title:'Aucune piste'))));
    if(!tr){P.append(h('p',{class:'pp-empty'},'Charge un morceau sur la platine '+d.id+' pour régler sa grille et ses cues.'));return;}
    P.append(sec('Grille',h('div',{class:'pp-bpm'},h('b',{},tr.bpm.toFixed(2)),h('span',{},'BPM')),
      h('div',{class:'r fixed pp-g'},B('Tap','Tape le tempo (4 fois ou plus)',()=>d.tap()),B('½','Diviser le BPM par deux',()=>d.setBpm(tr.bpm/2)),B('×2','Doubler le BPM',()=>d.setBpm(tr.bpm*2))),
      h('div',{class:'r fixed pp-g'},B('◁ 10 ms','Décaler la grille plus tôt',()=>d.gridNudge(-10)),B('10 ms ▷','Décaler la grille plus tard',()=>d.gridNudge(10)),B('Poser le 1','La position actuelle devient le premier temps d’une phrase',()=>d.gridHere()))));
    const hot=h('ol',{class:'pp-list'});
    tr.hot.forEach((t,i)=>hot.append(h('li',{class:t==null?'empty':'',style:'--hc:'+HOT[i]},h('i',{},String(i+1)),
      h('button',{type:'button',class:'pp-go',title:t==null?'Poser le hot cue '+(i+1)+' ici':'Aller au hot cue '+(i+1),onclick:()=>{if(t==null)d.hotDown(i);else d.seek(t);renderPrep(true);}},t==null?'Poser ici':fmtTime(t)),
      t==null?null:h('button',{type:'button',class:'pp-x',title:'Effacer le hot cue '+(i+1),'aria-label':'Effacer le hot cue '+(i+1),onclick:()=>{d.hotDown(i,true);renderPrep(true);}},'×'))));
    P.append(sec('Hot cues',hot));
    const mem=h('ol',{class:'pp-list mem'});
    [{t:tr.cue,label:'Cue',color:'#f4f6f9'},...(tr.memCues||[])].forEach(m=>mem.append(h('li',{style:'--hc:'+m.color},h('i',{},''),h('button',{type:'button',class:'pp-go',title:'Aller à '+m.label,onclick:()=>d.seek(m.t)},fmtTime(m.t)),h('span',{},m.label))));
    P.append(sec('Cues mémoire',mem));
    if(tr.sections){const st=h('ol',{class:'pp-list sec'});tr.sections.forEach(s=>st.append(h('li',{style:'--hc:'+((window.Structure&&Structure.TYPES[s.type]||{}).col||'#888')},h('i',{},''),h('button',{type:'button',class:'pp-go',onclick:()=>d.seek(s.start)},fmtTime(s.start,false)),h('span',{},s.label+' · '+s.bars+' mes.'))));P.append(sec('Structure',st));}
    else P.append(sec('Structure',h('p',{class:'pp-empty'},'Analyse de la structure en cours…')));
  }

  /* ---------- panneau latéral à onglets (preset Mix) ---------- */
  function buildSide(){
    const tabs=[['q','File et auto-mix'],['h','Historique']];V.tab=store.get('sideTab','q');
    const bar=h('div',{class:'tabs sd-tabs',role:'tablist'});
    V.el.sbody=h('div',{class:'sd-body'});
    const S2=h('aside',{class:'pnl',id:'p-side',style:'grid-area:lib','aria-label':'Panneau latéral',hidden:true},bar,V.el.sbody);
    tabs.forEach(([k,n])=>bar.append(h('button',{class:'b',type:'button',role:'tab','data-t':k,onclick:()=>{V.tab=k;store.set('sideTab',k);renderSide2(true);}},n)));
    app().append(S2);V.el.side=S2;V.el.stabs=bar;
  }
  function dock(on){
    const am=$('#p-automix');if(!am)return;
    const want=on&&V.tab==='q';
    if(want&&am.parentElement!==V.el.sbody){V.el.sbody.prepend(am);am.classList.add('docked');}
    else if(!want&&am.classList.contains('docked')){am.classList.remove('docked');document.body.append(am);}
    renderSide2(true);
  }
  function renderSide2(force){
    const S2=V.el.side;if(!S2||S2.hidden)return;
    $$('button',V.el.stabs).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.t===V.tab)));
    const am=$('#p-automix');
    if(V.tab==='q'){if(am&&am.parentElement!==V.el.sbody)dock(true);let hl=$('.sd-hist',V.el.sbody);if(hl)hl.remove();if(!am&&!$('.pp-empty',V.el.sbody))V.el.sbody.append(h('p',{class:'pp-empty'},'Auto-mix indisponible.'));return;}
    if(am&&am.classList.contains('docked')){am.classList.remove('docked');document.body.append(am);}
    const sig=LIB.history.length+'';if(!force&&sig===V.sig.hist)return;V.sig.hist=sig;
    V.el.sbody.innerHTML='';
    const ol=h('ol',{class:'pp-list sd-hist'});
    [...LIB.history].reverse().forEach(x=>ol.append(h('li',{style:'--hc:'+COL[x.deck]},h('i',{},x.deck),h('span',{class:'pp-go'},x.time.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})),h('span',{title:x.track.title},x.track.title))));
    if(!LIB.history.length)ol.append(h('li',{class:'empty'},h('span',{},'Les morceaux joués plus de 30 secondes s’affichent ici.')));
    V.el.sbody.append(ol);
  }

  /* ---------- compteur de temps et de phrase au-dessus des waveforms ---------- */
  function buildBeat(){
    const row=h('div',{class:'beatrow','aria-hidden':'true'});V.el.beat=row;V.beat={};
    decks.forEach(d=>{const beats=h('span',{class:'beats'},[0,1,2,3].map(()=>h('i'))),bars=h('span',{class:'bars'},[0,1,2,3,4,5,6,7].map(()=>h('i'))),tx=h('b',{});
      const c=h('div',{class:'bb','data-deck':d.id},h('span',{class:'bb-id'},d.id),beats,bars,tx);row.append(c);V.beat[d.id]={c,beats:[...beats.children],bars:[...bars.children],tx,last:''};});
    $('#p-wave').prepend(row);
  }
  function tickBeat(){
    if(!app().classList.contains('beatbar')||$('#p-wave').hidden)return;
    for(const d of decks){const B=V.beat[d.id];if(!B)continue;B.c.hidden=!d.active;if(!d.active)continue;
      const bi=d.barInfo(),s=bi&&!bi.pre?bi.beat+'|'+bi.barIn+'|'+bi.phrase:'-';if(s===B.last)continue;B.last=s;
      B.beats.forEach((e,i)=>e.classList.toggle('on',!!bi&&!bi.pre&&i<=bi.beat));
      B.bars.forEach((e,i)=>{e.classList.toggle('on',!!bi&&!bi.pre&&i<bi.barIn);e.classList.toggle('cur',!!bi&&!bi.pre&&i===bi.barIn);});
      B.tx.textContent=bi&&!bi.pre?`${bi.barIn+1}.${bi.beat+1}  P${bi.phrase+1}`:'—';}
  }

  /* ---------- boucle et construction ---------- */
  let tk=0;
  function tick(){
    tickBeat();
    if(++tk%20===0){renderPrep();renderSide2();}
  }
  function build(){
    css('--uiz',String(V.zoom));document.documentElement.classList.toggle('stage',V.stage);readTokens();
    const A=app();
    V.el.spw=splitter('sp-wave','spw','Hauteur des waveforms : glisse',(s,dy)=>{sp().lane=clamp(s.lane+dy/nLanes(),LANEMIN,220);},()=>{delete sp().lane;});
    V.el.spl=splitter('sp-lib','spl','Hauteur de la bibliothèque : glisse',(s,dy)=>{sp().lib=clamp(s.lib-dy,LMIN,s.H*.85)/s.H;},()=>{delete sp().lib;});
    A.append(V.el.spw,V.el.spl);
    buildPrep();buildSide();buildBeat();buildMenu();
    decks.forEach(d=>{
      const P=panel(d),head=$('.dk-head',P),id=$('.dk-id',P);
      if(head){head.classList.add('clk');head.addEventListener('click',e=>{if(e.target.closest('button,input,select,a,[data-ctl]'))return;cycle(d);});}
      if(id){id.tabIndex=0;id.setAttribute('role','button');id.setAttribute('aria-label','Taille de la platine '+d.id);id.title='Clique sur l’en-tête pour changer la taille de la platine : complète, compacte, mini';
        id.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();cycle(d);}});}
      const ol=d.onLoad;d.onLoad=tr=>{ol&&ol(tr);tip(d);renderPrep(true);};tip(d);
      const dw=d.ui.dw&&d.ui.dw.parentElement;
      if(dw&&!$('.zoomb',dw))dw.append(h('div',{class:'zoomb'},h('button',{class:'b',type:'button',title:'Dézoomer',onclick:e=>{e.stopPropagation();window.setZoom(ui.zoom*1.5);}},'−'),h('button',{class:'b',type:'button',title:'Zoomer',onclick:e=>{e.stopPropagation();window.setZoom(ui.zoom/1.5);}},'+')));
    });
    // Ctrl + molette sur une waveform : zoom de la waveform (pas de la page)
    A.addEventListener('wheel',e=>{const tb=!(e.ctrlKey||e.metaKey)&&e.target.closest('.sz-compact .tabs');
      if(tb&&tb.scrollWidth>tb.clientWidth&&Math.abs(e.deltaY)>Math.abs(e.deltaX)){e.preventDefault();tb.scrollLeft+=e.deltaY;}},{passive:false});
    A.addEventListener('scroll',e=>{if(e.target.classList&&e.target.classList.contains('tabs'))tabsMore();},true);
    A.addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey))return;if(!e.target.closest('.lane,.dk-wave'))return;e.preventDefault();window.setZoom(ui.zoom*(e.deltaY>0?1.25:.8));},{passive:false});
    document.addEventListener('keydown',e=>{
      const mod=(e.ctrlKey||e.metaKey)&&!e.altKey;
      if(mod&&(e.key==='+'||e.key==='='||e.code==='NumpadAdd')){e.preventDefault();setZoom(V.zoom+.1);return;}
      if(mod&&(e.key==='-'||e.key==='_'||e.code==='NumpadSubtract')){e.preventDefault();setZoom(V.zoom-.1);return;}
      if(mod&&(e.key==='0'||e.code==='Numpad0'||e.code==='Digit0')){e.preventDefault();setZoom(1);return;}
      if(e.key==='Escape'&&$('#top details[open]')){closeMenus();return;}
      if(e.key==='Escape'&&V.libFull&&!(midi&&midi.learn)){toggleLib(false);}
    });
    const refit=()=>{if(V.rq)return;V.rq=requestAnimationFrame(()=>{V.rq=0;fit();});};
    new ResizeObserver(refit).observe(A);
    // barre du haut : boutons ajoutés après coup (auto-mix, parcours), largeur de la fenêtre, textes qui s'allongent
    const top=$('#top'),retop=()=>{if(V.tq)return;V.tq=requestAnimationFrame(()=>{V.tq=0;fitTop();});};
    new ResizeObserver(retop).observe(top);V.topMo=new MutationObserver(retop);V.topMo.observe(top,{childList:true});
    setInterval(()=>{if(overTop(top))fitTop();},1000);
    addEventListener('resize',closeMenus);
    document.addEventListener('pointerdown',e=>{if(!e.target.closest('#top details'))closeMenus();},true);
    // une rangée ajoutée ou retirée dans une platine (modules chargés après coup) : on répartit à nouveau
    const mo=new MutationObserver(refit);decks.forEach(d=>mo.observe(panel(d),{childList:true}));
    document.fonts&&document.fonts.ready.then(()=>{fit();fitTop();});
  }
  return{build,layout:layoutHook,fit,toggleFxFold,fitTop,closeMenus,tick,setZoom,setStage,setSize,toggleLib,toggleFs,cycle,waveHeight:wh,resetLayout,state:V,get zoom(){return V.zoom;},get libFull(){return V.libFull;}};
})();
