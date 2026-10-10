'use strict';
/* =====================================================================
   Mixlab · contrôleurs
   Mapping v2 (compatible v1) : types bouton, absolu, relatif (3 codages),
   jog avec toucher (scratch) ou sans (pitch bend), paires 14 bits,
   calque Shift, rattrapage des potards (soft takeover), inversion,
   voyants paramétrables, bascule de platine A/C et B/D.
   Plus : assistant de mapping, bibliothèque, détection du contrôleur,
   import/export, horloge MIDI en sortie.
   ===================================================================== */
(()=>{
const C=window.Controllers={
  cfg:{quiet:700,res:128},
  st:{shift:false,layer:{L:'A',R:'B'},touch:{},pick:{},msb:{},lsb:{},held:{},lastDev:''},
  meta:store.get('midimeta',{name:'',device:'',leds:[]}),
  lib:store.get('mappings',[]),
  clock:{out:store.get('clockout',''),on:false,next:0,timer:null,run:null,sent:0},
  offered:new Set(),idx:null,lastLearn:null,
};
const BUNDLED=()=>window.MIXLAB_MAPPINGS||[];
const norm=e=>e==null?null:typeof e==='string'?{id:e,v1:true}:e;
const res=id=>id&&/^[LR]\./.test(id)?C.st.layer[id[0]]+id.slice(1):id;
const keyParts=k=>{const m=/^([ncp])(\d+)\.?(\d+)?$/.exec(k);return m?{t:m[1],ch:+m[2],n:m[3]==null?null:+m[3]}:null;};
const save=()=>{store.set('midimap',midi.map);store.set('midimeta',C.meta);C.idx=null;};
const clone=o=>JSON.parse(JSON.stringify(o));
const OTHER={A:'C',C:'A',B:'D',D:'B'};

/* ---------- libellés ---------- */
const TYPES=[['','Auto'],['abs','Absolu'],['btn','Bouton'],['rel','Relatif'],['jog','Jog (tourner)'],['touch','Jog (toucher)'],['shift','Shift'],['layer','Changer de platine']];
const MODES=[['2c','Complément à deux'],['64','Centré sur 64'],['sm','Signe + valeur'],['abs7','Absolu (écart)']];
function labelOf(ent){
  ent=norm(ent);if(!ent)return'';
  if(ent.type==='shift')return'Shift';
  if(ent.type==='layer')return ent.side==='R'?'Platine droite : B ↔ D':'Platine gauche : A ↔ C';
  const id=ent.id||'',side=/^([LR])\./.exec(id);
  if(side){const c=ctl((side[1]==='L'?'A':'B')+id.slice(1));return(c?c.label.replace(/ [AB]$/,''):id.slice(2))+(side[1]==='L'?' · gauche (A/C)':' · droite (B/D)')+(ent.type==='touch'?' · toucher':'');}
  const c=ctl(id);return(c?c.label:id)+(ent.type==='touch'?' · toucher':'');
}
const typeName=ent=>{ent=norm(ent);const t=ent.type||'';const n=(TYPES.find(x=>x[0]===t)||TYPES[0])[1];return(t?n:'')+(t==='rel'||t==='jog'?' '+(ent.mode||'2c'):'')+(ent.hi?' · 14 bits':'')+(ent.invert?' · inversé':'')+(ent.shift?' · Shift : '+labelOf({id:ent.shift}):'');};

/* ---------- index des octets de poids faible (14 bits) ---------- */
function index(){
  if(C.idx)return C.idx;const lsb={};
  for(const[k,v]of Object.entries(midi.map)){const e=norm(v),p=keyParts(k);if(e&&e.hi&&p&&p.t==='c'&&p.n<32)lsb[`c${p.ch}.${p.n+32}`]=k;}
  return C.idx={lsb};
}

/* ---------- décodage des valeurs ---------- */
function relDelta(v,mode,key){
  if(mode==='64')return v-64;
  if(mode==='sm')return v&64?-(v&63):v&63;
  if(mode==='abs7'){const l=C.st.msb['r'+key];C.st.msb['r'+key]=v;return l==null?0:((v-l+192)%128)-64;}
  return v<64?v:v-128;
}
function absSet(pk,c,v,take){
  if(take&&c.get){
    const sw=c.get(),s=C.st.pick[pk]||(C.st.pick[pk]={}),synced=s.sent!=null&&Math.abs(sw-s.sent)<.002;
    if(!synced&&Math.abs(v-sw)>.03&&!(s.hw!=null&&(s.hw-sw)*(v-sw)<=0)){s.hw=v;s.wait=true;$('#midi-mon').textContent='Rattrapage : amène la commande vers '+Math.round(sw*100)+' % pour reprendre la main ('+c.label+')';return false;}
    s.hw=v;s.wait=false;c.set(v);s.sent=c.get();return true;
  }
  c.set(v);return true;
}
function deckOf(id){const m=/^([A-D])\./.exec(id||'');return m?deckById(m[1]):null;}

/* ---------- réception ---------- */
C.onMidi=(e,key,type,ch,d1,d2)=>{
  const dev=e&&(e.target||e.currentTarget);if(dev&&dev.name)C.st.lastDev=dev.name;
  if(C.wiz&&C.wiz.on)return wizMsg(key,type,ch,d1,d2);
  if(midi.learn&&(midi.target||(C.lastLearn&&C.lastLearn.t>performance.now()-400)))return learnMsg(key,type,ch,d1,d2);
  const isNote=type===0x90||type===0x80,on=type===0x90&&d2>0;
  let ent=norm(midi.map[key]),value=null;
  const ms=index().lsb[key];
  if(!ent&&ms){ent=norm(midi.map[ms]);C.st.lsb[ms]=d2;value=(((C.st.msb[ms]||0)<<7)|d2)/16383;key=ms;}
  if(!ent)return;
  if(ent.type==='shift'){C.st.shift=isNote?on:d2>0;return;}
  if(ent.type==='layer'){if(isNote?on:d2>0){const s=ent.side==='R'?'R':'L';C.st.layer[s]=OTHER[C.st.layer[s]];C.st.pick={};toast((s==='L'?'Platine gauche : ':'Platine droite : ')+C.st.layer[s]);}return;}
  const raw=C.st.shift&&ent.shift?ent.shift:ent.id;
  if(ent.type==='touch'){
    const d=deckOf(res(ent.id));if(!d)return;const down=isNote?on:d2>0;C.st.touch[d.id]=down;
    if(ent.vinyl!==false){down?d.scratchStart():d.scratchEnd();}return;
  }
  if(ent.type==='jog'){
    if(isNote)return;const d=deckOf(res(ent.id));if(!d)return;let dv=relDelta(d2,ent.mode,key);if(ent.invert)dv=-dv;
    if(d.scratching)d.scratchMove(dv/(ent.res||C.cfg.res)*1.8);else d.jog(dv*(ent.speed||1));return;
  }
  const btnUp=()=>{const id=C.st.held[key];delete C.st.held[key];const c=ctl(id);c&&c.release&&c.release();};
  if(!isNote&&!on&&C.st.held[key]&&d2===0){btnUp();return;}
  const id=res(raw),c=ctl(id);if(!c){if(isNote&&!on&&C.st.held[key])btnUp();return;}
  const t=ent.type||(c.kind==='rel'?'rel':c.kind==='btn'?'btn':'abs');
  if(t==='btn'||(c.kind==='btn'&&t!=='rel')){
    if(isNote?on:d2>0){if(c.kind==='btn'){C.st.held[key]=id;c.press({});}else if(c.kind==='abs')c.set(c.get?(c.get()>.5?0:1):1);}
    else if(C.st.held[key])btnUp();
    return;
  }
  if(t==='rel'){
    if(isNote)return;let dv=relDelta(d2,ent.mode,key);if(ent.invert)dv=-dv;dv*=ent.speed||1;
    if(c.kind==='rel')c.move(dv);else if(c.kind==='abs'&&c.get)c.set(c.get()+dv*(ent.step||.01));else if(c.kind==='btn'&&dv)c.press({});
    return;
  }
  if(c.kind==='rel'){if(!isNote)c.move(relDelta(d2,ent.mode,key));return;}
  if(c.kind!=='abs')return;
  if(value==null){
    if(isNote)value=on?1:0;
    else if(type===0xE0)value=((d2<<7)|d1)/16383;
    else if(ent.hi){if(C.st.msb[key]!==d2)C.st.lsb[key]=0;C.st.msb[key]=d2;value=((d2<<7)|(C.st.lsb[key]||0))/16383;}
    else value=d2/127;
  }
  if(ent.invert)value=1-value;
  absSet(key+'>'+id,c,value,!isNote&&(ent.takeover!=null?ent.takeover:!ent.v1));
};

/* ---------- MIDI Learn : options après apprentissage ---------- */
function learnMsg(key,type,ch,d1,d2){
  if(type===0x80||(type===0x90&&d2===0))return;
  const p=keyParts(key),L=C.lastLearn;
  // LSB d'une paire 14 bits juste après le MSB qu'on vient d'apprendre : on marque la paire.
  if(p.t==='c'&&p.n>=32&&p.n<64&&L&&L.t>performance.now()-400){const lp=keyParts(L.key);if(lp.t==='c'&&lp.ch===p.ch&&lp.n===p.n-32){const e=norm(midi.map[L.key]);if(e){delete e.v1;e.hi=true;midi.map[L.key]=e;save();renderLearnOpts(L.key);C.renderMaps();}return;}}
  const id=midi.target,c=ctl(id);if(!c)return;
  midi.map[key]={id};save();C.lastLearn={key,t:performance.now()};
  toast('Mappé : '+c.label+' ← '+midiKeyText(key),'ok');selectLearn(null);C.renderMaps();renderLearnOpts(key);
}
function renderLearnOpts(key){
  const bar=$('#learnbar');if(!bar)return;let row=$('#learn-opts');if(row)row.remove();
  if(!midi.map[key])return;row=h('div',{id:'learn-opts',class:'mopts'},h('span',{},midiKeyText(key)),optsRow(key));bar.append(row);
}
function optsRow(key){
  const p=keyParts(key),get=()=>norm(midi.map[key])||{},set=patch=>{const g=get(),e={...(g.v1?{takeover:false}:{}),...g,...patch};delete e.v1;for(const k in e)if(e[k]===''||e[k]==null||(e[k]===false&&k!=='takeover'))delete e[k];midi.map[key]=e;save();C.renderMaps();upd();};
  const ty=h('select',{class:'sel','aria-label':'Type'},TYPES.map(([v,n])=>h('option',{value:v},n)));
  const mo=h('select',{class:'sel','aria-label':'Codage relatif',title:'Codage des encodeurs sans fin'},MODES.map(([v,n])=>h('option',{value:v},n)));
  const ck=(lbl,k,tip)=>{const i=h('input',{type:'checkbox'});i.addEventListener('change',()=>set({[k]:i.checked}));return[h('label',{title:tip},i,lbl),i];};
  const[inL,inv]=ck('Inverser','invert','Inverse le sens de la commande');
  const[hiL,hi]=ck('14 bits','hi','Paire de CC : celui-ci (MSB) et le CC +32 (LSB), pour un pitch ou un fader fin');
  const[tkL,tk]=ck('Rattrapage','takeover','Soft takeover : le potard ne prend la main qu’en passant par la valeur du logiciel, sans saut');
  const ids=[...controls.keys()];
  const sh=h('select',{class:'sel','aria-label':'Avec Shift',title:'Action quand Shift est maintenu'},h('option',{value:''},'Shift : rien'),ids.map(i=>h('option',{value:i},'Shift : '+ctl(i).label)));
  ty.addEventListener('change',()=>set({type:ty.value,mode:ty.value==='rel'||ty.value==='jog'?mo.value:'',side:ty.value==='layer'?(get().id&&/^[BD]|^R/.test(get().id)?'R':'L'):''}));
  mo.addEventListener('change',()=>set({mode:mo.value}));sh.addEventListener('change',()=>set({shift:sh.value}));
  const upd=()=>{const e=get();ty.value=e.type||'';mo.value=e.mode||'2c';mo.hidden=!(e.type==='rel'||e.type==='jog');inv.checked=!!e.invert;hi.checked=!!e.hi;
    hiL.hidden=!(p&&p.t==='c'&&p.n<32);const c=ctl(res(e.id));tkL.hidden=!(c&&c.kind==='abs'&&p.t!=='n');tk.checked=e.takeover!=null?!!e.takeover:!e.v1;sh.value=e.shift||'';};
  upd();
  return h('span',{class:'mopt'},ty,mo,inL,hiL,tkL,sh);
}

/* ---------- liste du mapping actif ---------- */
C.renderMaps=()=>{
  const ul=$('#map-list');ul.innerHTML='';
  const mapped=new Set(Object.values(midi.map).map(v=>{const e=norm(v);return e&&res(e.id);}).filter(Boolean));
  controls.forEach((c,id)=>c.el.classList.toggle('mapped',mapped.has(id)));
  const nm=$('#map-active');if(nm)nm.textContent=C.meta.name?'Actif : '+C.meta.name+(C.meta.device?' · '+C.meta.device:''):'Actif : mapping personnel';
  const ents=Object.entries(midi.map);if(!ents.length)ul.append(h('li',{style:'color:var(--mu)'},'Aucun mapping pour l’instant.'));
  for(const[k,v]of ents){
    const box=h('div',{class:'mopts',hidden:C.openKey!==k},C.openKey===k?optsRow(k):null);
    const li=h('li',{'data-key':k},h('span',{},labelOf(v)+' ← '+midiKeyText(k)+(norm(v).hi?' (+'+(keyParts(k).n+32)+')':'')),h('em',{},typeName(v)),
      h('button',{title:'Options : type, inversion, 14 bits, Shift',class:'opt',onclick:()=>{if(box.hidden){box.innerHTML='';box.append(optsRow(k));}box.hidden=!box.hidden;C.openKey=box.hidden?null:k;}},'⚙'),
      h('button',{title:'Supprimer',onclick:()=>{delete midi.map[k];save();C.renderMaps();}},'×'),box);
    ul.append(li);
  }
  $('#map-json').value=JSON.stringify(current(),null,1);
  renderLib();
};
const current=()=>({format:'mixlab-mapping',version:2,name:C.meta.name||'Mon mapping',device:C.meta.device||'',...(C.meta.leds&&C.meta.leds.length?{leds:C.meta.leds}:{}),map:midi.map});

/* ---------- voyants ---------- */
const ledOuts=()=>{const o=[...midi.access.outputs.values()];return o.length>1&&C.clock.out?o.filter(x=>x.id!==C.clock.out):o;};
C.ledTick=()=>{
  const outs=ledOuts();if(!outs.length)return;
  const ph=Math.floor(performance.now()/250)%2===0,send=(out,val)=>{
    if(midi.last[out]===val)return;midi.last[out]=val;const m=/^([nc])(\d+)\.(\d+)$/.exec(out);if(!m)return;
    const msg=[(m[1]==='n'?0x90:0xB0)|+m[2],+m[3],val];outs.forEach(o=>{try{o.send(msg);}catch(e){}});};
  const one=(key,ent,led)=>{
    if(led===false)return;let st;
    if(ent.type==='shift')st=C.st.shift;else if(ent.type==='layer')st=C.st.layer[ent.side==='R'?'R':'L']!==(ent.side==='R'?'B':'A');
    else if(ent.type==='touch'||ent.type==='jog')st=led?C.st.touch[res(ent.id)[0]]:null;
    else st=ledState(res(C.st.shift&&ent.shift?ent.shift:ent.id));
    if(st==null)return;led=led||{};if(led.blink&&st)st=ph;
    send(led.out||key,st?(led.on!=null?led.on:127):(led.off!=null?led.off:0));
  };
  for(const[key,v]of Object.entries(midi.map)){const e=norm(v);if(e)one(key,e,e.led);}
  for(const l of C.meta.leds||[])one(l.out,{id:l.id,type:l.type,side:l.side},l);
};

/* ---------- bibliothèque ---------- */
function allMaps(){return[...C.lib.map(m=>({...m,user:true})),...BUNDLED()];}
C.load=(m,quiet)=>{
  midi.map=clone(m.map||{});C.meta={name:m.name||'',device:m.device||'',leds:clone(m.leds||[])};
  C.st.pick={};C.st.held={};C.st.shift=false;midi.last={};save();C.renderMaps();if(!quiet)toast('Mapping chargé : '+(m.name||'sans nom'),'ok');
};
C.addToLib=m=>{const x={format:'mixlab-mapping',version:2,name:m.name||'Mon mapping',device:m.device||'',map:clone(m.map||{}),...(m.leds?{leds:m.leds}:{})};C.lib=C.lib.filter(y=>y.name!==x.name);C.lib.push(x);store.set('mappings',C.lib);renderLib();return x;};
C.importText=(txt,toLib)=>{
  let j;try{j=JSON.parse(txt);if(!j||typeof j.map!=='object'||(j.format&&j.format!=='mixlab-mapping'))throw 0;}catch(e){toast('Ce texte n’est pas un mapping Mixlab valide.');return false;}
  if(j.version>2)toast('Mapping créé par une version plus récente : certaines options seront ignorées.');
  if(toLib&&j.name)C.addToLib(j);
  C.load(j,true);toast('Mapping importé'+(j.name?' : '+j.name:''),'ok');return true;
};
C.clearMeta=()=>{C.meta={name:'',device:'',leds:[]};C.idx=null;store.set('midimeta',C.meta);};
function download(m){
  const name=(m.name||'mapping').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'mapping';
  const {user,file,...o}=m;const a=h('a',{href:URL.createObjectURL(new Blob([JSON.stringify({format:'mixlab-mapping',version:2,...o},null,1)],{type:'application/json'})),download:name+'.mixlab.json'});
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function renderLib(){
  const ul=$('#lib-maps');if(!ul)return;ul.innerHTML='';
  for(const m of allMaps()){
    const act=C.meta.name===m.name;
    ul.append(h('li',{class:act?'on':''},h('div',{class:'ln'},h('b',{},m.name),h('span',{},m.template?'Modèle à adapter':m.device?'Pour : '+m.device:'Tout contrôleur'),h('span',{},Object.keys(m.map||{}).length+' commandes'+(m.user?'':' · livré avec Mixlab'))),
      h('div',{class:'r fixed'},h('button',{class:'b',type:'button',onclick:()=>C.load(m)},act?'Recharger':'Charger'),h('button',{class:'b',type:'button',title:'Enregistrer en fichier',onclick:()=>download(m)},'Exporter'),
        m.user?h('button',{class:'b',type:'button',title:'Supprimer de la bibliothèque',onclick:()=>{C.lib=C.lib.filter(x=>x.name!==m.name);store.set('mappings',C.lib);renderLib();}},'×'):null)));
  }
}

/* ---------- détection du contrôleur ---------- */
const nameMatch=(pat,name)=>{if(!pat||!name)return false;if(pat[0]==='/'){try{return new RegExp(pat.replace(/^\/|\/[a-z]*$/g,''),'i').test(name);}catch(e){return false;}}const a=pat.toLowerCase(),b=name.toLowerCase();return b.includes(a);};
function offer(msg,acts){
  const t=h('div',{class:'toast act',role:'alert'},h('div',{},msg),h('div',{class:'r fixed'},acts.map(([n,f])=>h('button',{class:'b',type:'button',onclick:()=>{t.remove();f&&f();}},n))));
  $('#toasts').append(t);setTimeout(()=>t.remove(),15000);return t;
}
C.onDevices=()=>{
  if(!midi.access)return;renderClock();
  midi.access.inputs.forEach(inp=>{
    const name=(inp.manufacturer?inp.manufacturer+' ':'')+inp.name;if(!inp.name||C.offered.has(name))return;C.offered.add(name);
    const m=allMaps().find(x=>x.device&&(nameMatch(x.device,inp.name)||nameMatch(x.device,name)));
    if(m){if(C.meta.name===m.name)return;offer('Contrôleur reconnu : '+inp.name+'. Charger le mapping « '+m.name+' » ?',[['Charger',()=>C.load(m)],['Plus tard']]);return;}
    if(!Object.keys(midi.map).length)offer('Nouveau contrôleur : '+inp.name+'. Aucun mapping ne le connaît encore.',[['Lancer l’assistant',()=>C.wizStart(inp.name)],['Modèle générique',()=>{const g=BUNDLED().find(x=>x.template);g&&C.load(g);}],['Plus tard']]);
  });
};

/* ---------- assistant de mapping ---------- */
const PAD=i=>['pad'+i,'Pad '+i,'btn','Appuie sur le pad '+i+' (mode hot cue).'];
const DECK_STEPS=[['play','Play','btn','Appuie puis relâche le bouton Play.'],['cue','Cue','btn','Appuie puis relâche le bouton Cue.'],['sync','Sync','btn','Appuie sur Sync.'],
  ['pitch','Pitch','abs','Pousse le pitch fader d’un bout à l’autre.'],['jog','Jog : toucher','touch','Pose la main sur le dessus du jog sans le tourner, puis retire-la. Passe si ton jog n’est pas tactile.'],
  ['jog','Jog : tourner','jog','Tourne le jog d’un tour, dans un sens puis dans l’autre.'],['high','EQ aigus','abs','Tourne le potard des aigus d’un bout à l’autre.'],['mid','EQ médiums','abs','Tourne le potard des médiums d’un bout à l’autre.'],
  ['low','EQ graves','abs','Tourne le potard des graves d’un bout à l’autre.'],['filter','Filtre','abs','Tourne le filtre d’un bout à l’autre.'],['fader','Fader de voie','abs','Monte et descends le fader de voie.'],...[1,2,3,4,5,6,7,8].map(PAD)];
const STEPS=[...DECK_STEPS.map(s=>({id:'L.'+s[0],label:s[1]+' A',deck:'A',kind:s[2],hint:s[3]})),
  {id:'xf',label:'Crossfader',kind:'abs',hint:'Fais glisser le crossfader d’un bout à l’autre.'},
  {id:'shift',label:'Shift',kind:'shift',hint:'Appuie sur Shift. Plus tard, tu pourras donner une 2e fonction à chaque bouton (⚙ dans la liste).'},
  ...DECK_STEPS.map(s=>({id:'R.'+s[0],label:s[1]+' B',deck:'B',kind:s[2],hint:s[3]}))];
C.STEPS=STEPS;
function relMode(vs){
  const set=new Set(vs),rng=Math.max(...vs)-Math.min(...vs),rep=vs.length>=3&&(set.size<=6||vs.length/set.size>=2);
  if(!rep)return null;
  const small=v=>v>=1&&v<=15,neg2=v=>v>=113,mid=v=>v>=49&&v<=79,smn=v=>v>=65&&v<=79;
  if(vs.every(v=>small(v)||neg2(v)))return'2c';
  if(vs.every(mid)&&rng<=30)return'64';
  if(vs.every(v=>small(v)||smn(v)))return'sm';
  return null;
}
C.classify=(ms,kind)=>{
  const notes=ms.filter(m=>m.type===0x90),pbs=ms.filter(m=>m.type===0xE0),ccs=ms.filter(m=>m.type===0xB0);
  if(kind==='btn'||kind==='touch'||kind==='shift'){
    const ent=kind==='touch'?{type:'touch'}:kind==='shift'?{type:'shift'}:{};
    if(notes.length){const m=notes[0];return{key:`n${m.ch}.${m.d1}`,ent,desc:'Note '+m.d1+' · canal '+(m.ch+1)};}
    if(ccs.length){const m=ccs[0];return{key:`c${m.ch}.${m.d1}`,ent:kind==='btn'?{type:'btn'}:ent,desc:'CC '+m.d1+' (bouton) · canal '+(m.ch+1)};}
    return null;
  }
  if(pbs.length&&kind!=='jog'){const m=pbs[0];return{key:'p'+m.ch,ent:{},desc:'Pitch bend 14 bits · canal '+(m.ch+1)};}
  if(!ccs.length)return null;
  const g={};ccs.forEach(m=>{const k=m.ch+'.'+m.d1;(g[k]||(g[k]=[])).push(m.d2);});
  const[best]=Object.entries(g).filter(([k])=>{const[ch,n]=k.split('.').map(Number);return!(n>=32&&n<64&&g[ch+'.'+(n-32)]);}).sort((a,b)=>b[1].length-a[1].length);
  if(!best)return null;const[ch,n]=best[0].split('.').map(Number),vs=best[1],key=`c${ch}.${n}`,where=' · canal '+(ch+1);
  if(n<32&&g[ch+'.'+(n+32)])return{key,ent:kind==='jog'?{type:'jog',mode:'abs7'}:{hi:true},desc:'CC '+n+' + CC '+(n+32)+' (14 bits)'+where};
  const rm=relMode(vs);
  if(kind==='jog')return{key,ent:{type:'jog',mode:rm||'abs7'},desc:'CC '+n+(rm?' relatif ('+MODES.find(x=>x[0]===rm)[1]+')':' absolu, lu en écart')+where};
  if(rm)return{key,ent:{type:'rel',mode:rm},desc:'CC '+n+' encodeur sans fin ('+MODES.find(x=>x[0]===rm)[1]+')'+where};
  return{key,ent:{},desc:'CC '+n+' (7 bits)'+where};
};
C.wiz={on:false,i:0,msgs:[],res:[],timer:null,dev:''};
C.wizStart=dev=>{
  if(!midi.access)connectMidi();
  Object.assign(C.wiz,{on:true,i:0,msgs:[],res:STEPS.map(()=>null),dev:dev||C.st.lastDev||'',done:false});
  $('#midi-modal').hidden=true;$('#wiz-modal').hidden=false;wizRender();
};
const wizStop=()=>{C.wiz.on=false;clearTimeout(C.wiz.timer);$('#wiz-modal').hidden=true;};
function wizUsed(key){return C.wiz.res.findIndex((r,j)=>r&&r.key===key&&j!==C.wiz.i&&!(STEPS[j].id===STEPS[C.wiz.i].id));}
function wizMsg(key,type,ch,d1,d2){
  const W=C.wiz;if(W.done)return;const s=STEPS[W.i];if(!s)return;
  W.dev=W.dev||C.st.lastDev;
  const off=type===0x80||(type===0x90&&d2===0);
  if(off&&!W.msgs.length)return;
  if(s.kind==='jog'&&(type===0x90||type===0x80))return;
  const u=wizUsed(key);
  if(!off&&u>=0&&!W.msgs.length){$('#wiz-st').textContent='Déjà utilisé pour « '+STEPS[u].label+' ». Bouge la commande demandée.';return;}
  W.msgs.push({type:type===0x80?0x90:type,ch,d1,d2:type===0x80?0:d2});
  $('#wiz-st').textContent='Reçu : '+midiKeyText(key)+' = '+(type===0xE0?((d2<<7)|d1):d2)+'…';
  clearTimeout(W.timer);
  const btnLike=s.kind!=='abs'&&s.kind!=='jog';
  if(btnLike&&(off||((type===0xB0)&&d2===0&&W.msgs.length>1)))return wizFinish();
  W.timer=setTimeout(wizFinish,btnLike?Math.max(C.cfg.quiet,900):C.cfg.quiet);
}
function wizFinish(){
  const W=C.wiz,s=STEPS[W.i];clearTimeout(W.timer);
  const ms=W.msgs.filter(m=>!(m.type===0x90&&m.d2===0));W.msgs=[];
  if((s.kind==='abs'||s.kind==='jog')&&ms.length<3){$('#wiz-st').textContent='Trop peu de mouvement : bouge la commande franchement, d’un bout à l’autre.';return;}
  const r=C.classify(ms,s.kind);
  if(!r){$('#wiz-st').textContent='Je n’ai pas reconnu ce message. Réessaie, ou passe cette étape.';return;}
  W.res[W.i]={...r,ent:{...(s.kind==='shift'?{}:{id:s.id}),...r.ent}};W.last=r.desc;wizNext();
}
function wizNext(){const W=C.wiz;W.msgs=[];W.i++;while(W.i<STEPS.length&&STEPS[W.i].auto)W.i++;if(W.i>=STEPS.length)W.done=true;wizRender();}
C.wizSkip=()=>{const W=C.wiz;W.res[W.i]=null;W.last='« '+STEPS[W.i].label+' » passé';wizNext();};
C.wizBack=()=>{const W=C.wiz;W.done=false;W.msgs=[];W.i=Math.max(0,W.i-1);W.res[W.i]=null;wizRender();};
C.wizEnd=()=>{C.wiz.done=true;C.wiz.msgs=[];wizRender();};
C.wizMap=()=>{const map={};C.wiz.res.forEach(r=>{if(r)map[r.key]=r.ent;});return map;};
C.wizSave=(name,dev)=>{
  const map=C.wizMap();if(!Object.keys(map).length){toast('Rien à enregistrer : aucune commande n’a été détectée.');return null;}
  const m=C.addToLib({name:name||dev||'Mon contrôleur',device:dev||'',map});C.load(m,true);wizStop();
  toast('Mapping « '+m.name+' » enregistré : '+Object.keys(map).length+' commandes','ok');return m;
};
function wizRender(){
  const W=C.wiz,box=$('#wiz-body');box.innerHTML='';const n=STEPS.length,got=W.res.filter(Boolean).length;
  $('#wiz-prog').style.width=(Math.min(W.i,n)/n*100)+'%';
  if(W.done){
    const nm=h('input',{class:'inp',id:'wiz-name',value:W.dev||'Mon contrôleur','aria-label':'Nom du mapping'}),dv=h('input',{class:'inp',id:'wiz-dev',value:W.dev,'aria-label':'Nom du contrôleur',placeholder:'Nom envoyé par la table'});
    box.append(h('div',{class:'wz-step'},h('small',{},'Terminé'),h('b',{},got+' commande'+(got>1?'s':'')+' détectée'+(got>1?'s':''))),
      h('p',{},'Donne un nom à ce mapping. Le nom du contrôleur sert à le reconnaître la prochaine fois que tu le branches.'),
      h('label',{class:'wz-f'},h('span',{},'Nom'),nm),h('label',{class:'wz-f'},h('span',{},'Contrôleur'),dv),
      h('ul',{class:'wz-sum'},W.res.map((r,j)=>r?h('li',{},h('span',{},STEPS[j].label),h('em',{},r.desc)):null)),
      h('div',{class:'r fixed wz-act'},h('button',{class:'b',type:'button',onclick:C.wizBack},'Revenir'),h('button',{class:'b go',type:'button',id:'wiz-save',onclick:()=>C.wizSave(nm.value.trim(),dv.value.trim())},'Enregistrer le mapping')));
    return;
  }
  const s=STEPS[W.i];
  box.append(h('div',{class:'wz-step'},h('small',{},'Étape '+(W.i+1)+' sur '+n+(s.deck?' · platine '+s.deck+(s.deck==='A'?' (gauche)':' (droite)'):'')),h('b',{id:'wiz-label'},s.label)),
    h('p',{},s.hint),h('div',{class:'wz-st',id:'wiz-st'},'J’écoute ta table…'),
    W.last?h('div',{class:'wz-last'},'Précédent : '+W.last):null,
    h('div',{class:'r fixed wz-act'},h('button',{class:'b',type:'button',disabled:W.i===0?true:null,onclick:C.wizBack},'Retour'),h('button',{class:'b',type:'button',id:'wiz-skip',onclick:C.wizSkip},'Passer'),
      h('button',{class:'b',type:'button',onclick:()=>{W.msgs=[];$('#wiz-st').textContent='J’écoute ta table…';}},'Recommencer'),h('span',{style:'flex:1'}),h('button',{class:'b',type:'button',id:'wiz-end',onclick:C.wizEnd},'Terminer maintenant')));
}

/* ---------- horloge MIDI ---------- */
const clockOut=()=>midi.access&&C.clock.out?midi.access.outputs.get(C.clock.out)||[...midi.access.outputs.values()].find(o=>o.id===C.clock.out):null;
C.clockBpm=()=>{const r=refDeck();return r?r.bpm:C.clock.bpm||120;};
function clockRun(){
  const o=clockOut();if(!o)return;const K=C.clock,bpm=C.clockBpm();K.bpm=bpm;
  const per=60000/(bpm*24),now=performance.now(),la=window.__TAURI__?0:25;
  if(!K.next||K.next<now-500)K.next=now;
  while(K.next<=now+la){try{o.send([0xF8],K.next);}catch(e){}K.next+=per;K.sent++;}
  const r=refDeck(),pl=!!(r&&r.playing);if(K.follow&&pl!==K.playing){K.playing=pl;try{o.send([pl?0xFA:0xFC]);}catch(e){}}
}
C.clockSet=(on,out)=>{
  const K=C.clock;if(out!=null){K.out=out;store.set('clockout',out);}
  if(on&&!clockOut()){toast('Choisis d’abord une sortie MIDI pour l’horloge.');on=false;}
  K.on=!!on;clearInterval(K.timer);K.timer=null;K.next=0;K.follow=true;K.playing=null;
  if(K.on)K.timer=setInterval(clockRun,5);
  const b=$('#clock-on');if(b){b.setAttribute('aria-pressed',String(K.on));b.textContent=K.on?'Horloge envoyée':'Envoyer l’horloge';}
};
C.clockTransport=start=>{const o=clockOut();if(!o)return;try{o.send([start?0xFA:0xFC]);}catch(e){}C.clock.playing=start;};
function renderClock(){
  const sel=$('#clock-out');if(!sel||!midi.access)return;const v=C.clock.out;sel.innerHTML='';
  sel.append(h('option',{value:''},'Aucune sortie'));midi.access.outputs.forEach(o=>sel.append(h('option',{value:o.id},o.name)));
  sel.value=[...sel.options].some(x=>x.value===v)?v:'';
}

/* ---------- clavier : un « contrôleur » de plus, par touches physiques ---------- */
/* Le nom affiché d'une touche dépend de la disposition du clavier. Chromium la donne
   (navigator.keyboard.getLayoutMap) ; les webviews WebKit (macOS, Linux) ne la donnent pas :
   on prend alors la disposition choisie dans la fenêtre Contrôleur, devinée d'après la langue. */
let layoutMap=null;
try{navigator.keyboard&&navigator.keyboard.getLayoutMap&&navigator.keyboard.getLayoutMap().then(m=>{layoutMap=m&&m.size?m:null;renderKeys();}).catch(()=>{});}catch(e){}
const KEY_NAMES={Space:'Espace',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Enter:'Entrée',Backspace:'Retour',Tab:'Tab',Comma:',',Period:'.',Semicolon:';',Slash:'/',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Quote:"'",Backquote:'`',Backslash:'\\',IntlBackslash:'<'};
const LAYOUTS={
  qwerty:{name:'QWERTY',map:{}},
  azerty:{name:'AZERTY',map:{KeyQ:'A',KeyA:'Q',KeyW:'Z',KeyZ:'W',KeyM:',',Semicolon:'M',Comma:';',Period:':',Slash:'!',Minus:')',Equal:'=',BracketLeft:'^',BracketRight:'$',Quote:'Ù',Backquote:'²',Backslash:'*'}},
  qwertz:{name:'QWERTZ',map:{KeyY:'Z',KeyZ:'Y',Minus:'ß',Equal:'´',BracketLeft:'Ü',BracketRight:'+',Semicolon:'Ö',Quote:'Ä',Backquote:'^',Backslash:'#',Slash:'-'}},
};
// fr (sauf Canada et Suisse) : AZERTY ; allemand, Europe centrale, Suisse : QWERTZ ; sinon QWERTY.
C.guessLayout=(lang=navigator.language||'')=>{const l=String(lang).toLowerCase();
  if(/^(de|cs|sk|hu|sl|hr|bs|sr-latn|lb|rm)\b/.test(l)||/-(ch|li)\b/.test(l))return'qwertz';
  if(/^(fr(?!-ca)|br|wo)\b/.test(l)||/^nl-be\b/.test(l))return'azerty';
  return'qwerty';};
C.kbLayout=()=>{const v=store.get('kbLayout','auto');return LAYOUTS[v]?v:C.guessLayout();};
C.setKbLayout=v=>{store.set('kbLayout',LAYOUTS[v]?v:'auto');renderKeys();};
C.hasLayoutMap=()=>!!layoutMap;
C.keyName=code=>{const l=layoutMap&&layoutMap.get(code);if(l&&l.trim())return l.toUpperCase();
  const f=LAYOUTS[C.kbLayout()].map[code];if(f)return f;
  return KEY_NAMES[code]||code.replace(/^Key|^Digit|^Numpad/,'');};
const keyAct=id=>id==='xf-'?'Crossfader vers A':id==='xf+'?'Crossfader vers B':(ctl(id)?ctl(id).label:id);
const saveKeys=()=>{store.set('keys',KEYS);renderKeys();};
C.kcap=null;
C.keyCapture=(id,old)=>{C.kcap={id,old};renderKeys();};
window.addEventListener('keydown',e=>{
  const k=C.kcap;if(!k)return;e.preventDefault();e.stopImmediatePropagation();
  if(e.code==='Escape'){C.kcap=null;renderKeys();return;}
  if(/^(Shift|Control|Alt|Meta)/.test(e.code))return;
  if(k.old)delete KEYS[k.old];const prev=KEYS[e.code];KEYS[e.code]=k.id;C.kcap=null;saveKeys();
  toast('Touche '+C.keyName(e.code)+' → '+keyAct(k.id)+(prev&&prev!==k.id?' (remplace '+keyAct(prev)+')':''),'ok');
},true);
function renderKeys(){
  const box=$('#key-list');if(!box)return;box.innerHTML='';
  const rows=Object.entries(KEYS).sort((a,b)=>keyAct(a[1]).localeCompare(keyAct(b[1]),'fr'));
  for(const[code,id]of rows){
    const cap=C.kcap&&C.kcap.old===code;
    box.append(h('li',{'data-code':code},h('kbd',{},cap?'…':C.keyName(code)),h('span',{},keyAct(id)),
      h('button',{class:'opt',title:'Changer de touche',onclick:()=>C.keyCapture(id,code)},cap?'Appuie…':'Changer'),
      h('button',{title:'Supprimer ce raccourci',onclick:()=>{delete KEYS[code];saveKeys();}},'×')));
  }
  const add=$('#key-add');if(add)add.textContent=C.kcap&&!C.kcap.old?'Appuie sur une touche… (Échap : annuler)':'Ajouter une touche';
  // le choix de disposition ne sert que si le système ne la donne pas
  const lr=$('#kb-layout-row'),ls=$('#kb-layout');if(lr)lr.hidden=!!layoutMap;
  if(ls){const v=store.get('kbLayout','auto');ls.value=LAYOUTS[v]?v:'auto';ls.options[0].textContent='Automatique ('+LAYOUTS[C.guessLayout()].name+')';}
}
C.renderKeys=renderKeys;

/* ---------- interface ---------- */
C.build=()=>{
  const grid=$('#midi-modal .mgrid');if(!grid||$('#lib-maps'))return;
  const lh=$('#map-list').previousElementSibling;if(lh&&lh.tagName==='H3'){lh.textContent='Mapping actif';lh.parentElement.classList.add('mact');lh.after(h('div',{class:'mon',id:'map-active'}));}
  const exp=$('#map-export');if(exp){exp.textContent='Copier pour partager';exp.title='Copie le mapping actif en texte, à coller dans un message ou un forum';}
  const fi=h('input',{type:'file',accept:'.json,application/json',hidden:true});
  fi.addEventListener('change',()=>{const f=fi.files[0];if(!f)return;f.text().then(t=>C.importText(t,true));fi.value='';});
  grid.append(
    h('div',{class:'mlib'},h('h3',{},'Bibliothèque de mappings'),
      h('p',{},'Les mappings livrés sont des modèles à adapter : Mixlab ne livre pas de mapping de marque tant qu’il n’a pas été vérifié sur la vraie table. Le plus sûr : l’assistant, qui apprend ta table en deux minutes.'),
      h('div',{class:'r fixed'},h('button',{class:'b go',type:'button',id:'wiz-btn',onclick:()=>C.wizStart()},'Assistant de mapping'),h('button',{class:'b',type:'button',onclick:()=>fi.click()},'Importer un fichier'),h('button',{class:'b',type:'button',onclick:()=>download(current())},'Exporter l’actif'),fi),
      h('ul',{class:'libl',id:'lib-maps'})),
    h('div',{},h('h3',{},'Horloge MIDI'),h('p',{},'Envoie le tempo de la platine maître (24 impulsions par temps) à une boîte à rythmes, un séquenceur ou des lumières. Start et Stop suivent la lecture.'),
      h('select',{class:'sel wide',id:'clock-out','aria-label':'Sortie de l’horloge MIDI',onchange:e=>C.clockSet(C.clock.on,e.target.value)},h('option',{value:''},'Connecte un contrôleur pour voir les sorties')),
      h('div',{class:'r fixed',style:'margin-top:4px'},h('button',{class:'b',type:'button',id:'clock-on','aria-pressed':'false',onclick:()=>C.clockSet(!C.clock.on)},'Envoyer l’horloge'),
        h('button',{class:'b',type:'button',title:'Envoie Start',onclick:()=>C.clockTransport(true)},'Start'),h('button',{class:'b',type:'button',title:'Envoie Stop',onclick:()=>C.clockTransport(false)},'Stop'))));
  document.body.append(h('div',{class:'modal',id:'wiz-modal',hidden:true},h('div',{class:'mbox wz',role:'dialog','aria-label':'Assistant de mapping'},
    h('h2',{},'Assistant de mapping',h('button',{class:'b',type:'button',id:'wiz-close',onclick:wizStop},'Fermer')),
    h('div',{class:'prog'},h('i',{id:'wiz-prog'})),h('div',{id:'wiz-body'}))));
  const kb=$('#midi-modal .keys');
  if(kb){const col=kb.parentElement,h3=col.querySelector('h3');if(h3)h3.textContent='Clavier';
    const act=h('select',{class:'sel wide','aria-label':'Action du nouveau raccourci'},h('option',{value:'xf-'},'Crossfader vers A'),h('option',{value:'xf+'},'Crossfader vers B'),
      [...controls].filter(([,c])=>c.kind==='btn').map(([id,c])=>h('option',{value:id},c.label)));
    const lay=h('select',{class:'sel',id:'kb-layout','aria-label':'Disposition du clavier',title:'Sert seulement à afficher le nom des touches',onchange:e=>C.setKbLayout(e.target.value)},
      h('option',{value:'auto'},'Automatique'),Object.entries(LAYOUTS).map(([k,l])=>h('option',{value:k},l.name)));
    kb.replaceWith(h('p',{},'Les touches suivent leur place sur le clavier, pas la lettre : elles tombent au même endroit en AZERTY et en QWERTY.'),
      h('div',{class:'r fixed',id:'kb-layout-row',style:'margin:2px 0 6px',hidden:!!layoutMap},h('span',{class:'lbl'},'Ton clavier'),lay),
      h('ul',{class:'maps keyl',id:'key-list'}),act,
      h('div',{class:'r fixed',style:'margin-top:4px'},h('button',{class:'b',type:'button',id:'key-add',onclick:()=>C.keyCapture(act.value,null)},'Ajouter une touche'),
        h('button',{class:'b',type:'button',title:'Revenir aux raccourcis d’origine',onclick:()=>{Object.keys(KEYS).forEach(k=>delete KEYS[k]);Object.assign(KEYS,KEYS_DEF);saveKeys();}},'Réinitialiser')));
    renderKeys();}
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&C.wiz.on)wizStop();});
  renderClock();
};
})();
