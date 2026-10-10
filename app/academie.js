'use strict';
/* =====================================================================
   Mixlab · Académie
   Le métier de DJ au-delà des gestes : leçons courtes, points clés, quiz
   corrigés tout de suite et quatre exercices sur ta vraie bibliothèque :
   - courbe d'énergie à dessiner et comparer à une trame ;
   - assistant de trame : un squelette de set tiré de tes morceaux ;
   - simulation de piste : choisis les morceaux qui la relancent ;
   - crate intelligente et rangement des morceaux par moment.
   Contenu dans academie-data.js. Progression sauvegardée (store).
   Les mots du glossaire sont cliquables, avec la bulle du parcours.
   ===================================================================== */
window.Academie=(()=>{
  const D=window.ACADEMIE_DATA||{modules:[],templates:{},glossary:{},scenarios:[]};
  const MODS=D.modules,TPL=D.templates||{},SCEN=D.scenarios||[];
  const LESSONS=MODS.flatMap((m,mi)=>m.lessons.map((l,li)=>Object.assign(l,{mod:m,mi,li})));
  const byId=id=>LESSONS.find(l=>l.id===id)||null;
  const fold=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  const pl=(n,w,ws)=>n+' '+(n>1?ws||w+'s':w);
  const lbl=(t,c)=>h('div',{class:'pc-k'+(c?' '+c:'')},t);
  const DEF={v:1,open:false,read:true,view:'home',les:null,done:{},quiz:{},ex:{},energy:null,plan:null,crowd:null,crate:null};
  const prog=Object.assign(JSON.parse(JSON.stringify(DEF)),store.get('academie',{}));
  const save=()=>store.set('academie',prog);
  const A={el:{},drag:null};

  /* ---------- glossaire : celui de l'Académie rejoint celui du parcours ---------- */
  const GL=window.Parcours?Parcours.GLOSS:{};
  for(const[k,v]of Object.entries(D.glossary||{}))if(!GL[k])GL[k]=v;
  function glossKey(s){
    const k=fold(s).trim(),c=[k,k.replace(/s\b/g,''),k.replace(/x\b/g,'')];
    for(const x of c)for(const g of Object.keys(GL))if(fold(g)===x)return g;
    return null;
  }
  // **mot** : en gras, et cliquable s'il est dans le glossaire.
  function rich(s){
    const out=[];let i=0,m;const re=/\*\*([^*]+)\*\*/g;
    while((m=re.exec(s))){out.push(s.slice(i,m.index));const k=glossKey(m[1]);
      out.push(k&&window.Parcours&&Parcours.gloss?h('button',{class:'pc-gl',type:'button','data-g':k,'aria-description':GL[k],onclick:e=>{e.stopPropagation();Parcours.gloss(k,e.currentTarget);}},m[1]):h('b',{},m[1]));
      i=re.lastIndex;}
    out.push(s.slice(i));return out;
  }

  /* ---------- énergie d'un morceau : la tienne, sinon l'estimation de l'analyse ---------- */
  const E=t=>t.energyUser??t.energy??clamp(Math.round(1+(t.bpm-116)/14*5+((t.rmsDb||-20)+24)/10*4),1,10);
  const trackOf=id=>LIB.tracks.find(t=>t.id===id)||null;
  const keyCode=t=>{const k=keyInfo(t.key);return k?k.code:'';};
  function resample(c,n){
    if(n<=1)return[c[0]];
    return Array.from({length:n},(_,i)=>{const x=i*(c.length-1)/(n-1),a=Math.floor(x),b=Math.min(c.length-1,a+1);return Math.round((c[a]+(c[b]-c[a])*(x-a))*10)/10;});
  }
  const libSave=()=>{try{window.LibPro&&LibPro.saveBrowser&&LibPro.saveBrowser();}catch(e){}};

  /* ---------- progression ---------- */
  const qState=l=>prog.quiz[l.id]||(prog.quiz[l.id]=[]);
  const quizOk=l=>!(l.quiz&&l.quiz.length)||l.quiz.every((_,i)=>(prog.quiz[l.id]||[])[i]&&prog.quiz[l.id][i].ok);
  const exOk=l=>!l.exercise||!!prog.ex[l.id];
  const auto=l=>!!((l.quiz&&l.quiz.length)||l.exercise);
  function checkDone(l){
    if(prog.done[l.id]||!auto(l)||!quizOk(l)||!exOk(l))return false;
    prog.done[l.id]=Date.now();save();toast('Leçon terminée : '+l.title,'ok');return true;
  }
  function markRead(l){if(!prog.done[l.id]){prog.done[l.id]=Date.now();save();toast('Leçon terminée : '+l.title,'ok');}render();}
  function exDone(l,msg){if(!l)return;const first=!prog.ex[l.id];prog.ex[l.id]=true;save();if(first&&msg)toast(msg,'ok');checkDone(l);}
  const exLesson=type=>LESSONS.find(l=>l.exercise&&l.exercise.type===type);
  function stats(){
    const nQ=LESSONS.reduce((s,l)=>s+(l.quiz?l.quiz.length:0),0),okQ=LESSONS.reduce((s,l)=>s+(l.quiz||[]).filter((_,i)=>(prog.quiz[l.id]||[])[i]&&prog.quiz[l.id][i].ok).length,0);
    const exs=LESSONS.filter(l=>l.exercise);
    return{done:LESSONS.filter(l=>prog.done[l.id]).length,n:LESSONS.length,nQ,okQ,nEx:exs.length,okEx:exs.filter(l=>prog.ex[l.id]).length};
  }

  /* ---------- ouverture ---------- */
  function build(){
    const root=A.el.root=h('section',{id:'ac',class:'pc ac',hidden:true,'aria-label':'Académie'});
    A.el.body=h('div',{class:'pc-body'});
    A.el.mode=h('button',{class:'b ac-mode',type:'button',id:'ac-mode',onclick:()=>{prog.read=prog.read===false;save();lecture();}},'');
    root.append(A.el.mode,A.el.body);
    const after=$('#pc')||$('#p-coach h2');after.after(root);
    // Échap : on quitte le mode lecture (retour aux platines, l'Académie reste dans la colonne du coach)
    document.addEventListener('keydown',e=>{
      if(e.key!=='Escape'||!document.body.classList.contains('ac-lecture'))return;
      if($$('.modal').some(m=>!m.hidden)||$('.pc-pop:not([hidden])')||(e.target.closest&&e.target.closest('input,textarea,select')))return;
      prog.read=false;save();lecture();
    });
  }
  /* Mode lecture : l'Académie prend la place des platines, sur une colonne de 710 px.
     Les exercices sur la bibliothèque (énergie, trame, crate) l'ouvrent en grand à côté. */
  const LIBEX=new Set(['energy','plan','crate']);
  function lecture(){
    const B=document.body,on=!!(prog.open&&prog.read!==false&&!(window.Parcours&&Parcours.active));
    const l=on&&prog.view==='lesson'&&byId(prog.les),withLib=!!(l&&l.exercise&&LIBEX.has(l.exercise.type));
    B.classList.toggle('ac-lecture',on);B.classList.toggle('ac-lib',withLib);
    if(window.View){
      if(withLib&&!A.libMine&&!View.libFull){A.libMine=true;View.toggleLib(true);const f=document.activeElement;if(f&&f.blur)f.blur();}
      else if(!withLib&&A.libMine){A.libMine=false;if(View.libFull)View.toggleLib(false);}
    }
    if(A.el.mode){A.el.mode.textContent=on?'Retour aux platines':'Mode lecture';
      A.el.mode.title=on?'Revenir aux platines, l’Académie reste dans la colonne de droite (Échap)':'Lire l’Académie en grand, sur une colonne large';}
  }
  function open(lid){
    if(window.Parcours&&Parcours.active)Parcours.exit();
    prog.open=true;
    if(lid&&byId(lid)){prog.view='lesson';prog.les=lid;}
    save();document.body.classList.add('academie');A.el.root.hidden=false;
    if(!layout.coach){layout.coach=true;applyLayout();}
    render();
  }
  function close(){
    prog.open=false;save();closePop();document.body.classList.remove('academie');A.el.root.hidden=true;lecture();
    if(window.Coach&&!Coach.L.active&&Coach.render)Coach.render();
  }
  function go(view,lid){prog.view=view;if(lid)prog.les=lid;save();render();const p=$('#p-coach');if(p)p.scrollTop=0;}
  const closePop=()=>{const p=$('.pc-pop');if(p)p.hidden=true;};

  /* ---------- affichage ---------- */
  function render(){
    const el=A.el.body;if(!el)return;closePop();el.innerHTML='';A.drag=null;lecture();
    if(prog.view==='gloss')return renderGloss(el);
    const l=prog.view==='lesson'&&byId(prog.les);
    if(l)return renderLesson(el,l);
    renderHome(el);
  }
  function renderHome(el){
    const s=stats();
    el.append(h('div',{class:'pc-head'},lbl('Académie · le métier de DJ'),h('div',{class:'pc-title'},'Construire, lire, ranger, jouer'),
      h('div',{class:'pc-sub'},'Tout ce qui fait un DJ en dehors des gestes : préparer un set, sentir une salle, trouver et ranger sa musique.'),
      h('div',{class:'pc-stats',id:'ac-stats'},h('span',{},h('b',{},`${s.done}/${s.n}`),' leçons'),h('span',{},h('b',{},`${s.okQ}/${s.nQ}`),' réponses justes'),h('span',{},h('b',{},`${s.okEx}/${s.nEx}`),' exercices')),
      h('div',{class:'prog'},h('i',{style:`width:${s.done/s.n*100}%`}))));
    MODS.forEach((m,mi)=>el.append(h('div',{class:'ac-mod'},lbl(`Module ${mi+1} · ${m.title}`),h('p',{class:'pc-sub'},m.intro),
      h('div',{class:'pc-map'},m.lessons.map((l,li)=>h('button',{class:'pc-tile'+(prog.done[l.id]?' d':'')+(l.id===prog.les?' c':''),type:'button','data-l':l.id,onclick:()=>go('lesson',l.id)},
        h('span',{class:'n'},prog.done[l.id]?'✓':String(li+1)),
        h('span',{class:'tx'},h('b',{},l.title),h('small',{},[l.quiz&&l.quiz.length&&pl(l.quiz.length,'question'),l.exercise&&'exercice : '+l.exercise.title].filter(Boolean).join(' · ')||'Lecture')),
        h('em',{},'~'+l.mins+' min')))))));
    el.append(h('div',{class:'pc-foot'},prog.les&&h('button',{class:'go',type:'button',onclick:()=>go('lesson',prog.les)},'Reprendre'),
      h('button',{class:'b',type:'button',id:'ac-gloss',onclick:()=>go('gloss')},'Glossaire'),
      h('button',{class:'b',type:'button',onclick:reset},'Tout recommencer'),
      h('button',{class:'b',type:'button',id:'ac-close',onclick:close},'Fermer')));
  }
  function renderLesson(el,l){
    const i=LESSONS.indexOf(l),prev=LESSONS[i-1],next=LESSONS[i+1],done=!!prog.done[l.id];
    el.append(h('div',{class:'pc-head'},
      h('div',{class:'pc-row'},lbl(`Module ${l.mi+1} · ${l.mod.title}`),h('div',{class:'pc-dots',title:'Leçons du module'},l.mod.lessons.map(x=>h('i',{class:prog.done[x.id]?'d':x===l?'c':''})))),
      h('div',{class:'pc-title',id:'ac-title'},l.title),h('div',{class:'pc-sub'},`Leçon ${l.li+1}/${l.mod.lessons.length} · ~${l.mins} min`+(done?' · terminée':''))));
    el.append(h('div',{class:'ac-txt'},l.body.map(p=>h('p',{},rich(p)))));
    if(l.keys&&l.keys.length)el.append(h('div',{class:'ac-keys'},lbl('À retenir'),h('ul',{},l.keys.map(k=>h('li',{},k)))));
    if(l.quiz&&l.quiz.length)el.append(h('div',{class:'ac-quiz'},lbl(l.quiz.length>1?'Quiz · '+l.quiz.length+' questions':'Quiz'),l.quiz.map((q,qi)=>question(l,q,qi))));
    if(l.exercise)el.append(h('div',{class:'ac-ex'+(prog.ex[l.id]?' ok':''),'data-ex':l.exercise.type},
      h('div',{class:'pc-row'},lbl('Exercice'),prog.ex[l.id]&&h('span',{class:'ac-tag ok'},'✓ Réussi')),
      h('b',{class:'ac-ext'},l.exercise.title),h('p',{class:'pc-sub'},l.exercise.goal),exercise(l)));
    if(done)el.append(h('div',{class:'donebox pc-done',id:'ac-done'},h('b',{},'Leçon terminée'),h('p',{},next?'La suite : « '+next.title+' ».':'Tu as fait le tour de l’Académie. Reviens aux exercices quand tu prépares une date.')));
    else if(!auto(l))el.append(h('div',{class:'pc-btns'},h('button',{class:'go',type:'button',id:'ac-read',onclick:()=>markRead(l)},'J’ai lu, leçon terminée')));
    else el.append(h('div',{class:'ac-todo'},lbl('Pour terminer la leçon'),h('ul',{class:'pc-ul'},
      l.quiz&&l.quiz.length&&h('li',{class:quizOk(l)?'ok':''},quizOk(l)?'Quiz réussi':'Réponds juste à toutes les questions'),
      l.exercise&&h('li',{class:exOk(l)?'ok':''},exOk(l)?'Exercice réussi':'Réussis l’exercice'))));
    el.append(h('div',{class:'pc-foot'},
      h('button',{class:'b',type:'button',id:'ac-prev',disabled:!prev,onclick:()=>prev&&go('lesson',prev.id)},'‹ Précédente'),
      h('button',{class:'b',type:'button',id:'ac-home',onclick:()=>go('home')},'Modules'),
      h('button',{class:next&&done?'go':'b',type:'button',id:'ac-next',disabled:!next,onclick:()=>next&&go('lesson',next.id)},'Suivante ›'),
      h('button',{class:'b',type:'button',id:'ac-gloss',onclick:()=>go('gloss')},'Glossaire'),
      h('button',{class:'b',type:'button',id:'ac-close',onclick:close},'Fermer')));
  }

  /* ---------- quiz : réponse corrigée tout de suite, explication, nouvel essai ---------- */
  function question(l,q,qi){
    const st=qState(l)[qi],box=h('div',{class:'ac-q','data-q':qi});
    box.append(h('div',{class:'ac-qq'},q.q));
    box.append(h('div',{class:'ac-ch'},q.choices.map((c,ci)=>h('button',{class:'ac-c'+(st&&st.pick===ci?(st.ok?' ok':' bad'):'')+(st&&st.ok&&ci===q.a?' ok':''),type:'button','data-c':ci,disabled:!!st,
      onclick:()=>{const ok=ci===q.a;qState(l)[qi]={pick:ci,ok,at:Date.now()};save();checkDone(l);render();focusQ(qi);}},c))));
    if(st)box.append(h('div',{class:'ac-fb '+(st.ok?'ok':'bad')},h('b',{},st.ok?'Juste.':'Pas tout à fait.'),' ',q.why||'',
      !st.ok&&h('button',{class:'b ac-retry',type:'button',onclick:()=>{qState(l)[qi]=null;save();render();focusQ(qi);}},'Réessayer')));
    return box;
  }
  function focusQ(qi){const b=A.el.body.querySelector(`.ac-q[data-q="${qi}"]`);if(b&&b.scrollIntoView)b.scrollIntoView({block:'nearest'});}

  function exercise(l){
    const t=l.exercise.type;
    if(t==='energy')return energyEx(l);
    if(t==='plan')return planEx(l);
    if(t==='crowd')return crowdEx(l);
    if(t==='crate')return crateEx(l);
    return null;
  }

  /* ---------- exercice 1 : courbe d'énergie ---------- */
  // Chaque point est un morceau (ou une tranche du set). Glisse-le pour changer son énergie ;
  // la trame choisie s'affiche en pointillés pour comparer.
  function eState(){
    let s=prog.energy;
    if(!s||!Array.isArray(s.pts)||s.pts.length<2){s=prog.energy={tpl:'peak',pts:[5,5,5,5,5,5,5,5],ids:[],src:''};}
    // énergie à jour pour les points qui sont des morceaux
    s.ids=(s.ids||[]).filter((id,i)=>i<s.pts.length);
    s.ids.forEach((id,i)=>{const t=trackOf(id);if(t)s.pts[i]=E(t);});
    return s;
  }
  function analyse(p){
    const n=p.length,avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
    const jumps=p.slice(1).map((v,i)=>v-p[i]);
    return[
      {id:'n',ok:n>=6,t:'Au moins 6 morceaux',bad:'Il faut au moins 6 points : ajoute des points, ou des morceaux à ta playlist.'},
      {id:'rise',ok:n>=4&&avg(p.slice(-2))-avg(p.slice(0,2))>=2,t:'Une montée : la fin plus haute que le début (+2)',bad:'La fin doit être nettement plus haute que le début.'},
      {id:'step',ok:jumps.some(j=>j===0),t:'Au moins un palier (deux morceaux au même niveau)',bad:'Ajoute un palier : deux morceaux de suite à la même énergie.'},
      {id:'dip',ok:jumps.some(j=>j<0),t:'Au moins une respiration (une petite redescente)',bad:'Prévois une petite redescente : elle rend la remontée plus forte.'},
      {id:'jump',ok:jumps.every(j=>Math.abs(j)<=3),t:'Pas de saut de plus de 3 d’un morceau à l’autre',bad:'Un saut de plus de 3 d’un coup, ça s’entend : adoucis-le.'},
    ];
  }
  function match(p,tpl){const t=resample((TPL[tpl]||TPL.peak).curve,p.length);const d=p.reduce((s,v,i)=>s+Math.abs(v-t[i]),0)/p.length;return clamp(Math.round(100-d*15),0,100);}
  function energyEx(l){
    const s=eState(),box=h('div',{class:'ac-energy'});
    const tplSel=h('select',{class:'sel',id:'ac-etpl','aria-label':'Trame à comparer'},Object.entries(TPL).map(([k,t])=>h('option',{value:k},t.label)));tplSel.value=s.tpl;
    tplSel.addEventListener('change',()=>{s.tpl=tplSel.value;save();draw();});
    const pls=LIB.playlists.filter(p=>p.ids.length>=2);
    const srcSel=h('select',{class:'sel',id:'ac-esrc','aria-label':'Partir d’une playlist'},h('option',{value:''},'Points libres'),pls.map(p=>h('option',{value:p.id},`${p.name} (${p.ids.length})`)));srcSel.value=pls.some(p=>p.id===s.src)?s.src:'';
    srcSel.addEventListener('change',()=>{const p=LIB.playlists.find(x=>x.id===srcSel.value);
      if(p){s.src=p.id;s.ids=p.ids.filter(trackOf).slice(0,16);s.pts=s.ids.map(id=>E(trackOf(id)));}else{s.src='';s.ids=[];}save();render();});
    const svg=svgEl('svg',{viewBox:'0 0 300 130',class:'ac-curve',id:'ac-ecurve',role:'group','aria-label':'Courbe d’énergie : glisse les points'});
    const info=h('div',{class:'ac-einfo'}),list=h('ul',{class:'pc-ul ac-crit',id:'ac-ecrit'}),fb=h('div',{class:'ac-fb',id:'ac-efb',hidden:true});
    const X=i=>20+i*(272/Math.max(1,s.pts.length-1)),Y=v=>8+(10-v)/9*106,V=y=>clamp(Math.round(10-(y-8)/106*9),1,10);
    function setPt(i,v){v=clamp(Math.round(v),1,10);if(s.pts[i]===v)return;s.pts[i]=v;const t=trackOf(s.ids[i]);if(t){t.energyUser=v;}draw();}
    function draw(){
      svg.innerHTML='';
      for(const v of[1,4,7,10]){svg.append(svgEl('line',{x1:20,x2:292,y1:Y(v),y2:Y(v),class:'g'}));const tx=svgEl('text',{x:12,y:Y(v)+3,class:'gl'});tx.textContent=v;svg.append(tx);}
      const tp=resample((TPL[s.tpl]||TPL.peak).curve,s.pts.length);
      svg.append(svgEl('polyline',{points:tp.map((v,i)=>X(i)+','+Y(v)).join(' '),class:'tpl'}));
      svg.append(svgEl('polyline',{points:s.pts.map((v,i)=>X(i)+','+Y(v)).join(' '),class:'me'}));
      s.pts.forEach((v,i)=>{const c=svgEl('circle',{cx:X(i),cy:Y(v),r:6,class:'pt',tabindex:0,role:'slider','aria-valuemin':1,'aria-valuemax':10,'aria-valuenow':v,'aria-label':(trackOf(s.ids[i])||{}).title||'Point '+(i+1),'data-i':i});
        c.addEventListener('keydown',e=>{const d=e.key==='ArrowUp'||e.key==='ArrowRight'?1:e.key==='ArrowDown'||e.key==='ArrowLeft'?-1:0;if(!d)return;e.preventDefault();setPt(i,s.pts[i]+d);save();const n=svg.querySelector(`[data-i="${i}"]`);n&&n.focus();});
        svg.append(c);});
      const m=match(s.pts,s.tpl),crit=analyse(s.pts);
      info.innerHTML='';info.append(h('span',{},'Proche de la trame « '+(TPL[s.tpl]||TPL.peak).label+' » : ',h('b',{id:'ac-ematch'},m+'/100')),h('span',{class:'ac-leg'},h('i',{class:'me'}),'ta courbe ',h('i',{class:'tpl'}),'la trame'));
      list.innerHTML='';crit.forEach(c=>list.append(h('li',{class:c.ok?'ok':'','data-c':c.id},(c.ok?'✓ ':'○ ')+c.t)));
      if(names){names.innerHTML='';names.append(...s.ids.map((id,i)=>{const t=trackOf(id);return t?h('li',{},h('span',{},t.title),h('i',{class:'pc-en'},'⚡'+s.pts[i]),h('em',{},t.bpm.toFixed(0)+' BPM'),
        h('button',{class:'b',type:'button',title:'Monter',onclick:()=>mv(i,-1)},'↑'),h('button',{class:'b',type:'button',title:'Descendre',onclick:()=>mv(i,1)},'↓')):'';}));}
    }
    // glisser : le point le plus proche horizontalement suit le pointeur
    const at=e=>{const r=svg.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*300,y=(e.clientY-r.top)/r.height*130;let bi=0,bd=1e9;s.pts.forEach((_,i)=>{const d=Math.abs(X(i)-x);if(d<bd){bd=d;bi=i;}});return{i:bi,v:V(y)};};
    svg.addEventListener('pointerdown',e=>{e.preventDefault();const p=at(e);A.drag={i:p.i};try{svg.setPointerCapture(e.pointerId);}catch(_){}setPt(p.i,p.v);});
    svg.addEventListener('pointermove',e=>{if(!A.drag)return;setPt(A.drag.i,at(e).v);});
    const end=()=>{if(!A.drag)return;A.drag=null;save();if(s.ids.length){renderTable();libSave();}};
    svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
    const mv=(i,d)=>{const j=i+d;if(j<0||j>=s.pts.length)return;[s.pts[i],s.pts[j]]=[s.pts[j],s.pts[i]];if(s.ids.length)[s.ids[i],s.ids[j]]=[s.ids[j],s.ids[i]];save();draw();};
    const names=s.ids.length?h('ol',{class:'pc-setl',id:'ac-elist'}):null;
    draw();
    box.append(h('div',{class:'ac-row'},h('label',{},'Comparer à ',tplSel),h('label',{},'Partir de ',srcSel)),svg,info);
    if(names)box.append(h('p',{class:'ac-note'},'Glisse un point pour noter l’énergie du morceau : la note est gardée dans ta bibliothèque. ↑ ↓ pour réordonner.'),names);
    else box.append(h('div',{class:'pc-btns'},
      h('button',{class:'b',type:'button',id:'ac-eadd',onclick:()=>{if(s.pts.length<12){s.pts.push(s.pts[s.pts.length-1]);save();render();}}},'+ Point'),
      h('button',{class:'b',type:'button',id:'ac-edel',onclick:()=>{if(s.pts.length>2){s.pts.pop();save();render();}}},'− Point'),
      h('button',{class:'b',type:'button',id:'ac-etpluse',title:'Recopier la trame pour partir d’elle',onclick:()=>{s.pts=resample((TPL[s.tpl]||TPL.peak).curve,s.pts.length).map(Math.round);save();render();}},'Copier la trame')));
    box.append(list,h('div',{class:'pc-btns'},h('button',{class:'go',type:'button',id:'ac-echeck',onclick:()=>{
      const bad=analyse(s.pts).filter(c=>!c.ok);fb.hidden=false;fb.className='ac-fb '+(bad.length?'bad':'ok');
      fb.textContent=bad.length?bad[0].bad:`Belle montée en escalier. Proximité avec la trame : ${match(s.pts,s.tpl)}/100.`;
      if(!bad.length){exDone(l,'Exercice réussi : courbe d’énergie');render();const f=$('#ac-efb');if(f){f.hidden=false;f.className='ac-fb ok';f.textContent=fb.textContent;}}}},'Vérifier ma courbe')),fb);
    return box;
  }

  /* ---------- exercice 2 : assistant de trame ---------- */
  const MIN_PER=5;
  function cost(t,target,prev,tpl){
    const de=Math.abs(E(t)-target);let c=de*2;
    const[lo,hi]=tpl.bpm,dist=t.bpm<lo?lo-t.bpm:t.bpm>hi?t.bpm-hi:0;c+=dist*.5;
    if(prev){
      if(prev.key&&t.key&&!keysCompatible(prev.key,t.key))c+=1.5;
      if(window.Suggest&&Suggest.rate){try{c-=Suggest.rate(Suggest.refOf(prev),t).score/100;}catch(e){}}
      else if(Math.abs(t.bpm-prev.bpm)/prev.bpm>.04)c+=1;
    }
    return{c,de};
  }
  function candidates(slots,i,tpl){
    const used=new Set(slots.map((x,j)=>j!==i&&x.id).filter(Boolean)),prev=i>0&&slots[i-1].id?trackOf(slots[i-1].id):null;
    return LIB.tracks.filter(t=>!used.has(t.id)).map(t=>({t,...cost(t,slots[i].target,prev,tpl)})).filter(x=>x.de<=2).sort((a,b)=>a.c-b.c);
  }
  function makePlan(tk,mins){
    const tpl=TPL[tk]||TPL.peak,n=Math.max(4,Math.round(mins/MIN_PER)),tg=resample(tpl.curve,n);
    const slots=tg.map(v=>({target:v,id:null}));
    for(let i=0;i<n;i++){const c=candidates(slots,i,tpl)[0];slots[i].id=c?c.t.id:null;}
    return{tpl:tk,mins,slots,saved:null};
  }
  function planEx(l){
    let s=prog.plan;const box=h('div',{class:'ac-plan'});
    const tSel=h('select',{class:'sel',id:'ac-ptpl','aria-label':'Public'},Object.entries(TPL).map(([k,t])=>h('option',{value:k},t.label)));
    const mSel=h('select',{class:'sel',id:'ac-pmins','aria-label':'Durée'},[30,60,90,120].map(m=>h('option',{value:m},m+' min')));
    tSel.value=s?s.tpl:'peak';mSel.value=String(s?s.mins:60);
    box.append(h('div',{class:'ac-row'},h('label',{},'Public ',tSel),h('label',{},'Durée ',mSel),
      h('button',{class:'go',type:'button',id:'ac-pgen',onclick:()=>{prog.plan=makePlan(tSel.value,+mSel.value);save();render();}},s?'Refaire la trame':'Proposer une trame')));
    if(!s){box.append(h('p',{class:'ac-note'},'L’assistant découpe le set en tranches de 5 minutes, donne à chacune une énergie cible, puis pioche dans ta bibliothèque le morceau qui colle le mieux (énergie, tempo, tonalité compatible avec le précédent).'));return box;}
    const tpl=TPL[s.tpl]||TPL.peak,placed=s.slots.filter(x=>x.id&&trackOf(x.id)).length,miss=s.slots.length-placed;
    box.append(h('div',{class:'pc-curve ac-pcurve',title:'Énergie cible (clair) et énergie des morceaux placés'},s.slots.map(x=>{const t=trackOf(x.id);return h('span',{class:'ac-bar'},h('i',{class:'tg',style:`height:${x.target*10}%`}),t&&h('i',{class:'me',style:`height:${E(t)*10}%`}));})));
    const fmt=m=>Math.floor(m/60)+':'+String(m%60).padStart(2,'0');
    box.append(h('ol',{class:'pc-setl ac-slots',id:'ac-pslots'},s.slots.map((x,i)=>{const t=trackOf(x.id);
      return h('li',{class:t?'':'miss','data-slot':i},h('em',{},fmt(i*MIN_PER)),h('i',{class:'pc-en',title:'Énergie cible'},'⚡'+Math.round(x.target)),
        t?h('span',{},t.title,h('em',{},` · ${t.bpm.toFixed(0)} BPM`+(keyCode(t)?' · '+keyCode(t):'')+` · ⚡${E(t)}`)):h('span',{class:'ac-need'},`À trouver : énergie ${Math.round(x.target)}, ${tpl.bpm[0]}-${tpl.bpm[1]} BPM`),
        h('button',{class:'b',type:'button',title:'Autre proposition','data-alt':i,onclick:()=>{const c=candidates(s.slots,i,tpl);if(!c.length){toast('Aucun autre morceau de ta bibliothèque ne colle à cette tranche.');return;}const k=c.findIndex(y=>y.t.id===x.id);x.id=c[(k+1)%c.length].t.id;s.saved=null;save();render();}},'↻'),
        t&&h('button',{class:'b',type:'button',title:'Vider la tranche',onclick:()=>{x.id=null;s.saved=null;save();render();}},'×'));})));
    const res=Math.round(placed*2.5);
    box.append(h('div',{class:'ac-sum',id:'ac-psum'},
      h('p',{},h('b',{},`${placed}/${s.slots.length}`),` tranches remplies avec ta bibliothèque.`+(miss?` Il te manque ${pl(miss,'morceau','morceaux')} : la liste « À trouver » est ta liste de courses.`:'')),
      h('p',{},`Pour être libre en direct, prépare 2 à 3 fois plus de morceaux : vise ${s.slots.length*2} à ${s.slots.length*3} morceaux pour ce set.`),
      h('p',{class:'ac-tip'},'Conseil · '+tpl.tip)));
    const name=`Trame · ${tpl.label} · ${s.mins} min`;
    box.append(h('div',{class:'pc-btns'},h('button',{class:'go',type:'button',id:'ac-psave',onclick:()=>{
      const ids=s.slots.map(x=>x.id).filter(id=>id&&trackOf(id));
      if(!ids.length){toast('Aucun morceau placé : importe d’abord de la musique dans ta bibliothèque.');return;}
      let p=LIB.playlists.find(x=>x.name===name);if(!p){p={id:'p'+Date.now(),name,ids:[]};LIB.playlists.push(p);}p.ids=ids;s.saved=p.id;save();
      renderSide();libSave();exDone(l,'Trame rangée dans « '+name+' »');render();}},s.saved?'Mettre à jour la playlist':'Ranger en playlist'),
      s.saved&&h('span',{class:'ac-tag ok'},'Rangée dans « '+name+' »')));
    return box;
  }

  /* ---------- exercice 3 : simulation de piste ---------- */
  function cState(){let s=prog.crowd;if(!s||!SCEN[s.sc]){s=prog.crowd={sc:0,r:0,fill:SCEN[0]?SCEN[0].fill:50,picks:[]};}return s;}
  const WIN=70;
  function crowdEx(l){
    const s=cState(),sc=SCEN[s.sc],box=h('div',{class:'ac-crowd'});if(!sc)return box;
    box.append(h('div',{class:'ac-row'},SCEN.map((x,i)=>h('button',{class:'b'+(i===s.sc?' on':''),type:'button',id:'ac-sc-'+i,onclick:()=>{prog.crowd={sc:i,r:0,fill:x.fill,picks:[]};save();render();}},x.title))));
    box.append(h('p',{class:'ac-ctx'},sc.ctx));
    const N=30,on=Math.round(s.fill/100*N);
    box.append(h('div',{class:'ac-floor',id:'ac-floor',role:'img','aria-label':`Piste remplie à ${s.fill} %`},Array.from({length:N},(_,i)=>h('i',{class:i<on?'on':'',style:`--d:${(i*137)%10/10}s`}))),
      h('div',{class:'ac-fill'},h('span',{},'Piste'),h('div',{class:'prog'},h('i',{style:`width:${s.fill}%;background:${s.fill>=WIN?'var(--ok)':s.fill>=45?'var(--warn)':'var(--bad)'}`})),h('b',{id:'ac-fillv'},s.fill+' %')));
    const last=s.picks[s.picks.length-1];
    if(last&&last.fb)box.append(h('div',{class:'ac-fb '+(last.k==='ok'?'ok':last.k==='warn'?'warn':'bad'),id:'ac-cfb'},h('b',{},(last.d>=0?'+':'')+last.d+' % · '),last.fb));
    if(s.r<sc.rounds.length){
      const rd=sc.rounds[s.r];
      box.append(h('div',{class:'ac-qq'},`Morceau ${s.r+1}/${sc.rounds.length} · ${rd.q}`),
        h('div',{class:'ac-ch'},rd.opts.map((o,oi)=>h('button',{class:'ac-c',type:'button','data-o':oi,onclick:()=>{
          s.fill=clamp(s.fill+o.d,0,100);s.picks.push({r:s.r,o:oi,d:o.d,k:o.k,fb:o.fb});s.r++;
          if(s.r>=sc.rounds.length&&s.fill>=WIN){save();exDone(l,'Piste sauvée !');}
          save();render();}},o.t))));
    }else{
      const win=s.fill>=WIN;
      box.append(h('div',{class:'donebox ac-cres'+(win?' ok':' bad'),id:'ac-cres'},h('b',{},win?`Piste sauvée : ${s.fill} % des gens dansent.`:`La piste ne s’est pas relevée : ${s.fill} %.`),
        h('p',{},win?'Tu as lu la salle et tu as réagi au bon moment. Essaie une autre situation.':`Il faut au moins ${WIN} %. Relis les retours ci-dessus et recommence.`),
        h('div',{class:'pc-btns'},h('button',{class:win?'b':'go',type:'button',id:'ac-cagain',onclick:()=>{prog.crowd={sc:s.sc,r:0,fill:sc.fill,picks:[]};save();render();}},'Recommencer'),
          SCEN[s.sc+1]&&h('button',{class:win?'go':'b',type:'button',onclick:()=>{const x=SCEN[s.sc+1];prog.crowd={sc:s.sc+1,r:0,fill:x.fill,picks:[]};save();render();}},'Situation suivante'))));
    }
    return box;
  }

  /* ---------- exercice 4 : crate intelligente et rangement par moment ---------- */
  const MOMENTS=['Ouverture','Montée','Gros moment','Respiration','Au cas où'];
  const crateGoal={name:'montee',ea:6,eb:8,ba:122,bb:128};
  function crateRules(c){return[{f:'energy',a:+c.ea,b:+c.eb},{f:'bpm',a:+c.ba,b:+c.bb}];}
  function crateMatch(c){
    const rules=crateRules(c);
    if(window.LibPro&&LibPro.crateTracks)return LibPro.crateTracks({match:'all',rules});
    return LIB.tracks.filter(t=>E(t)>=rules[0].a&&E(t)<=rules[0].b&&t.bpm>=rules[1].a&&t.bpm<=rules[1].b);
  }
  function crateEx(l){
    const s=prog.crate||(prog.crate={name:'Montée',ea:5,eb:10,ba:120,bb:130,id:null}),box=h('div',{class:'ac-crate'});
    const num=(k,min,max,id)=>{const i=h('input',{class:'in num',type:'number',min,max,step:1,id,value:s[k]});i.addEventListener('input',()=>{s[k]=+i.value;save();prev();});return i;};
    const nm=h('input',{class:'in',type:'text',id:'ac-cname',value:s.name,'aria-label':'Nom de la crate'});nm.addEventListener('input',()=>{s.name=nm.value;save();});
    const pv=h('div',{class:'ac-pv',id:'ac-cpv'}),fb=h('div',{class:'ac-fb',id:'ac-cfbk',hidden:true});
    function prev(){const ts=crateMatch(s);pv.innerHTML='';pv.append(h('b',{},pl(ts.length,'morceau','morceaux')),' de ta bibliothèque '+(ts.length>1?'correspondent':'correspond')+(ts.length?' : '+ts.slice(0,6).map(t=>t.title).join(', ')+(ts.length>6?'…':''):'.'));}
    box.append(h('div',{class:'ac-rules'},
      h('div',{class:'ac-rule'},h('span',{},'Nom'),nm),
      h('div',{class:'ac-rule'},h('span',{},'Énergie entre'),num('ea',1,10,'ac-ea'),'et',num('eb',1,10,'ac-eb')),
      h('div',{class:'ac-rule'},h('span',{},'BPM entre'),num('ba',60,200,'ac-ba'),'et',num('bb',60,200,'ac-bb'))),pv);
    prev();
    box.append(h('div',{class:'pc-btns'},h('button',{class:'go',type:'button',id:'ac-csave',onclick:()=>{
      const errs=[];
      if(!fold(s.name).includes(crateGoal.name))errs.push('Appelle ta crate « Montée » : un nom de moment, pas de style.');
      if(+s.ea!==crateGoal.ea||+s.eb!==crateGoal.eb)errs.push('Pour une montée, vise une énergie de 6 à 8 : assez pour faire bouger, pas encore le peak.');
      if(+s.ba!==crateGoal.ba||+s.bb!==crateGoal.bb)errs.push('Prends un BPM entre 122 et 128 : la zone où la house et la tech house se mixent entre elles.');
      if(errs.length){fb.hidden=false;fb.className='ac-fb bad';fb.textContent=errs[0];return;}
      let c=window.LibPro&&LibPro.crates.find(x=>x.id===s.id||fold(x.name)===fold(s.name));
      c={id:c?c.id:'c'+Date.now(),name:s.name.trim(),match:'all',rules:crateRules(s)};
      if(window.LibPro&&LibPro.saveCrate){LibPro.saveCrate(c);libSave();}
      s.id=c.id;save();exDone(l,'Crate « '+c.name+' » créée');render();}},prog.ex[l.id]?'Mettre à jour la crate':'Créer la crate'),
      s.id&&window.LibPro&&LibPro.crates.some(x=>x.id===s.id)&&h('button',{class:'b',type:'button',id:'ac-cshow',onclick:()=>{lib.view='sc:'+s.id;renderSide();renderTable();toast('Crate affichée dans la bibliothèque','ok');}},'Voir dans la bibliothèque')),fb);
    // rangement par moment : un tag par morceau, cherchable avec tag:montée
    const tagOf=t=>(t.tags||[]).find(x=>MOMENTS.some(m=>fold(m)===fold(x)))||'';
    const tracks=LIB.tracks.slice(0,40);
    box.append(lbl('Range tes morceaux par moment'),h('p',{class:'ac-note'},'Un tag par morceau. Ensuite, cherche tag:montée dans la bibliothèque, ou fais une crate sur ce tag.'),
      h('ul',{class:'pc-pick ac-tags',id:'ac-ctags'},tracks.map(t=>{const sel=h('select',{class:'sel','data-t':t.id,'aria-label':'Moment de '+t.title},h('option',{value:''},'Moment…'),MOMENTS.map(m=>h('option',{value:m},m)));sel.value=tagOf(t);
        sel.addEventListener('change',()=>{t.tags=(t.tags||[]).filter(x=>!MOMENTS.some(m=>fold(m)===fold(x)));if(sel.value)t.tags.push(sel.value);renderTable();libSave();});
        return h('li',{},h('span',{},t.title,h('em',{},` · ${t.bpm.toFixed(0)} BPM · ⚡${E(t)}`)),sel);})));
    return box;
  }

  /* ---------- glossaire cherchable ---------- */
  function renderGloss(el){
    el.append(h('div',{class:'pc-head'},lbl('Académie'),h('div',{class:'pc-title'},'Glossaire')));
    const q=h('input',{class:'in ac-gq',type:'search',id:'ac-gq',placeholder:'Chercher un mot…','aria-label':'Chercher dans le glossaire'});
    const dl=h('dl',{class:'pc-dl',id:'ac-gl'}),cnt=h('div',{class:'pc-sub',id:'ac-gcount'});
    const keys=Object.keys(GL).sort((a,b)=>a.localeCompare(b,'fr'));
    const draw=()=>{const f=fold(q.value).trim(),ks=keys.filter(k=>!f||fold(k).includes(f)||fold(GL[k]).includes(f));dl.innerHTML='';
      dl.append(...ks.flatMap(k=>[h('dt',{},k[0].toUpperCase()+k.slice(1)),h('dd',{},GL[k])]));cnt.textContent=ks.length?pl(ks.length,'mot'):'Aucun mot ne correspond.';};
    q.addEventListener('input',draw);draw();
    el.append(q,cnt,dl,h('div',{class:'pc-foot'},h('button',{class:'go',type:'button',id:'ac-gback',onclick:()=>go(prog.les?'lesson':'home')},'Retour'),
      h('button',{class:'b',type:'button',onclick:()=>go('home')},'Modules'),h('button',{class:'b',type:'button',id:'ac-close',onclick:close},'Fermer')));
    setTimeout(()=>q.focus(),0);
  }

  function reset(){
    if(!confirm('Effacer toute ta progression dans l’Académie ?'))return;
    Object.assign(prog,JSON.parse(JSON.stringify(DEF)),{open:true});save();render();
  }
  // depuis Préférences (qui demande la confirmation)
  function resetProgress(){const o=prog.open;Object.assign(prog,JSON.parse(JSON.stringify(DEF)),{open:o});save();if(o)render();}

  /* ---------- carte dans la liste des leçons du coach ---------- */
  function card(){
    const s=stats();
    return h('div',{class:'lcard pc-card ac-card'},h('span',{class:'mod'},`Académie · ${MODS.length} modules · ${LESSONS.length} leçons`),h('b',{},'Le métier de DJ'),
      h('p',{},'Construire un set, lire le public, trouver et ranger ta musique, être prêt sur scène. Des leçons courtes, des quiz et des exercices sur ta bibliothèque.'),
      h('button',{class:'go',type:'button',id:'ac-open',onclick:()=>open()},s.done?`Reprendre · ${s.done}/${s.n}`:'Commencer'));
  }

  function init(){
    build();
    if(prog.open)open();
    if(window.Coach&&!Coach.L.active&&Coach.render)Coach.render();
  }
  return{init,open,close,go,card,render,resetProgress,lecture,stats,prog,LESSONS,TPL,makePlan,analyse,match,resample,energyOf:E,GLOSS:GL,get active(){return prog.open;}};
})();
