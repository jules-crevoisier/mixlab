'use strict';
/* =====================================================================
   Mixlab · contrôleurs, suite
   - commandes pour les mappings de marque : navigation dans la bibliothèque,
     chargement sur une platine, pads par mode, modes de pads, effacer un hot cue ;
   - couleur des pads qui suit la couleur du hot cue (palettes RGB) ;
   - leçons : « Sur ta table : … » quand un mapping connaît la commande à toucher ;
   - écran « Tester ma table » : chaque voyant s'allume, chaque commande touchée s'éclaire.
   Les mappings livrés (mappings/*.json) sont relevés dans la documentation MIDI officielle
   des fabricants et ne sont pas vérifiés sur le matériel.
   ===================================================================== */
(()=>{
const C=window.Controllers;if(!C)return;
const MODES={hot:'Hot cue',roll:'Roll',jump:'Saut',slice:'Slicer',smp:'Sampler',pitch:'Pitch'};
const SIDE={A:'platine gauche',B:'platine droite',C:'platine gauche (platine 3)',D:'platine droite (platine 4)'};
const ent=v=>v==null?null:typeof v==='string'?{id:v}:v;
const deckOf=id=>{const m=/^([A-D])\./.exec(id||'');return m?deckById(m[1]):null;};

/* ---------- commandes en plus ---------- */
function browse(v){
  if(!window.LibPro||!LibPro.selectBy||!v)return;
  LibPro.selectBy(Math.sign(v)*Math.min(20,Math.max(1,Math.round(Math.abs(v)))));
}
function loadSel(d){
  const t=LIB.tracks.find(x=>x.id===ui.sel);
  if(!t){toast('Choisis d’abord un morceau dans la bibliothèque (molette de navigation)');return;}
  if(!d.active){toast('La platine '+d.id+' est masquée : passe à 4 platines pour charger dessus');return;}
  loadTo(d,t);
}
function setMode(d,m){if(d.padMode!==m){d.padMode=m;renderPads(d);}}
function register(){
  if(controls.has('lib.browse'))return;
  const lib=$('#p-lib')||document.body;
  controls.set('lib.browse',{kind:'rel',label:'Navigation dans la bibliothèque',el:lib,move:browse});
  regBtn('lib.next','Morceau suivant',lib,()=>browse(1));
  regBtn('lib.prev','Morceau précédent',lib,()=>browse(-1));
  for(const d of decks){
    const D=d.id,panel=$('#p-deck'+D)||lib;
    regBtn(D+'.load','Charger sur '+D,panel,()=>loadSel(d));
    for(const m of Object.keys(MODES)){
      const tab=(d.ui.tabs||[]).find(b=>b.dataset.m===m)||panel;
      regBtn(`${D}.mode.${m}`,'Mode '+MODES[m]+' '+D,tab,()=>setMode(d,m));
      for(let i=1;i<=8;i++)regBtn(`${D}.pad.${m}.${i}`,`Pad ${i} ${D} · ${MODES[m]}`,d.ui.pads[i-1],()=>{setMode(d,m);padDown(d,i-1,{});},()=>padUp(d,i-1));
    }
    for(let i=1;i<=8;i++)regBtn(`${D}.hotdel${i}`,`Effacer le hot cue ${i} ${D}`,d.ui.pads[i-1],()=>{d.hotDown(i-1,true);renderPads(d);});
  }
}

/* ---------- voyants des nouvelles commandes ---------- */
// « A.pad.hot.3 » se comporte comme « A.pad3 » pour le halo des leçons.
const canon=id=>{const m=/^([A-D])\.pad\.(\w+)\.(\d)$/.exec(id||'');return m?m[1]+'.pad'+m[3]:id;};
const target=()=>(window.Parcours&&Parcours.target)||(window.Coach&&Coach.target)||(window.MixCoach&&MixCoach.target)||null;
const baseLed=ledState;
ledState=function(id){
  const m=/^([A-D])\.(pad\.(\w+)\.(\d)|mode\.(\w+))$/.exec(id||'');
  if(!m)return baseLed(id);
  const d=deckById(m[1]);if(!d)return null;
  if(m[5])return d.padMode===m[5];
  const mode=m[3],i=+m[4]-1,tg=target();
  if(tg&&tg===canon(id)&&d.padMode===mode)return Math.floor(performance.now()/250)%2===0;
  if(mode==='hot')return!!(d.track&&d.track.hot[i]!=null);
  if(mode==='roll')return d.padMode==='roll'&&d.rolling===ROLLS[i];
  if(mode==='smp')return!!(SAMPLER.pads[i]&&SAMPLER.pads[i].buf);
  return d.padMode===mode;
};

/* ---------- couleur des pads (RGB) ---------- */
const rgbOf=c=>{
  if(!c)return null;let m=/^#?([0-9a-f]{6})$/i.exec(c.trim());if(m){const n=parseInt(m[1],16);return[n>>16,(n>>8)&255,n&255];}
  m=/^#?([0-9a-f]{3})$/i.exec(c.trim());if(m)return m[1].split('').map(x=>parseInt(x+x,16));
  m=/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c);return m?[+m[1],+m[2],+m[3]]:null;
};
// Palettes. « h232 » : octet 0RRGGGBB (rouge 2 bits, vert 3 bits, bleu 2 bits), d'après le tableau
// « couleur par valeur de data2 » de la documentation Hercules (rouge 0x60, vert 0x1C, bleu 0x03, blanc 0x7F).
// « index » : table [couleur, valeur] fournie par le mapping (palette à index d'un fabricant), couleur la plus proche.
const PALETTES={
  h232:([r,g,b])=>{const v=(Math.round(r/255*3)<<5)|(Math.round(g/255*7)<<2)|Math.round(b/255*3);return v||1;},
  index:(rgb,led)=>{let best=null,bd=1e9;for(const[c,v]of led.palette||[]){const p=rgbOf(c);if(!p)continue;const dd=(p[0]-rgb[0])**2+(p[1]-rgb[1])**2+(p[2]-rgb[2])**2;if(dd<bd){bd=dd;best=v;}}return best;},
};
C.PALETTES=PALETTES;C.rgbOf=rgbOf;
C.padColor=id=>{
  const m=/^([A-D])\.pad(?:\.hot\.|)(\d)$/.exec(id||'');if(!m)return null;
  const d=deckById(m[1]);if(!d||!d.track)return null;if(!/\.hot\./.test(id)&&d.padMode!=='hot')return null;
  return hotColor(d.track,+m[2]-1);
};
C.ledColor=(id,led,st)=>{
  if(!st)return led.off!=null?led.off:0;
  const col=C.padColor(id),f=PALETTES[led.rgb];if(!col||!f)return null;
  const rgb=rgbOf(col);return rgb?f(rgb,led):null;
};

/* ---------- « Sur ta table » : la commande physique qui correspond à une commande du logiciel ---------- */
function sideOf(id){const m=/^([A-D])\./.exec(id);return m?SIDE[m[1]]:'';}
C.hwFor=id=>{
  if(!id||/^[#.\[]/.test(id))return null;
  const d=deckOf(id),pm=/^([A-D])\.pad(\d)$/.exec(id);
  const want=[id];if(pm)want.push(`${pm[1]}.pad.${d&&d.padMode||'hot'}.${pm[2]}`,`${pm[1]}.pad.hot.${pm[2]}`);
  const lay=x=>x&&/^[LR]\./.test(x)?C.st.layer[x[0]]+x.slice(1):x;
  let best=null;
  for(const[k,v]of Object.entries(midi.map)){
    const e=ent(v);if(!e)continue;
    const r=want.indexOf(lay(e.id)),rs=want.indexOf(lay(e.shift));
    const score=r>=0?r*10+(e.type==='touch'?1:0):rs>=0?100+rs*10:-1;
    if(score<0)continue;
    if(!best||score<best.score)best={score,key:k,hw:(r<0?'SHIFT + ':'')+(e.hw||midiKeyText(k)),side:sideOf(want[0])};
  }
  return best&&{key:best.key,hw:best.hw,side:best.side,text:'Sur ta table : '+best.hw+(best.side?', '+best.side:'')};
};
function hintTick(){
  const cards=[['#pc-now',window.Parcours&&Parcours.active?Parcours.target:null],['#coach-now',window.Coach&&Coach.target]];
  for(const[sel,tg]of cards){
    const card=$(sel);if(!card)continue;
    const hw=tg&&Object.keys(midi.map).length?C.hwFor(tg):null;
    let el=card.querySelector('.cx-hw');
    if(!hw){if(el)el.remove();continue;}
    if(!el){el=h('div',{class:'cx-hw'});const why=card.querySelector('.why');(why||card.lastChild).after(el);}
    if(el.dataset.t!==hw.text){el.dataset.t=hw.text;el.textContent='';el.append('Sur ta table : ',h('b',{},hw.hw),hw.side?', '+hw.side:'');}
  }
}

/* ---------- Tester ma table ---------- */
const T=C.T={on:false,hits:new Set(),sweep:null,lit:null};
const outs=()=>{if(!midi.access)return[];const o=[...midi.access.outputs.values()];return o.length>1&&C.clock.out?o.filter(x=>x.id!==C.clock.out):o;};
function sendOut(key,val){const m=/^([nc])(\d+)\.(\d+)$/.exec(key);if(!m)return;const msg=[(m[1]==='n'?0x90:0xB0)|+m[2],+m[3],val];outs().forEach(o=>{try{o.send(msg);}catch(e){}});}
function groupOf(e){const m=/^([A-D]|[LR])\./.exec(e.id||'');if(!m)return e.type==='shift'?'Shift':'Mixer et navigation';const s=m[1]==='L'?'A':m[1]==='R'?'B':m[1];return'Platine '+s+' ('+SIDE[s]+')';}
function chipText(k,e){
  const c=e.id&&ctl(/^[LR]\./.test(e.id)?C.st.layer[e.id[0]]+e.id.slice(1):e.id);
  return[e.hw||midiKeyText(k),e.type==='shift'?'Shift':c?c.label:(e.id||'')];
}
// voyants à essayer : boutons (notes, ou CC de bouton), pas les potards ni les jogs
C.testLeds=()=>Object.entries(midi.map).map(([k,v])=>[k,ent(v)]).filter(([k,e])=>e&&e.led!==false&&(k[0]==='n'||e.type==='btn'||(e.led&&e.led.out))&&e.type!=='touch'&&e.type!=='jog'&&e.type!=='rel')
  .map(([k,e])=>{const l=e.led||{};return{key:k,out:l.out||k,on:l.rgb?0x7F:l.on!=null?l.on:127,off:l.off!=null?l.off:0};});
function testRender(){
  const box=$('#cxt-list');if(!box)return;box.innerHTML='';
  const groups=new Map();
  for(const[k,v]of Object.entries(midi.map)){const e=ent(v);if(!e)continue;const g=groupOf(e);(groups.get(g)||groups.set(g,[]).get(g)).push([k,e]);}
  for(const[g,list]of groups){
    box.append(h('h3',{},g),h('div',{class:'cxt-chips'},list.map(([k,e])=>{const[a,b]=chipText(k,e);
      return h('span',{class:'cxt-c'+(T.hits.has(k)?' hit':''),'data-key':k,title:midiKeyText(k)},h('b',{},a),h('small',{},b),h('i',{}));})));
  }
  testCount();
}
function testCount(){const n=Object.keys(midi.map).length,el=$('#cxt-n');if(el)el.textContent=T.hits.size+' / '+n+' commandes touchées';}
function chip(k){return $(`#cxt-list .cxt-c[data-key="${k}"]`);}
T.msg=(key,type,ch,d1,d2)=>{
  // l'octet de poids faible d'une paire 14 bits éclaire la commande principale
  let k=key;if(!midi.map[k]){const p=/^c(\d+)\.(\d+)$/.exec(k);if(p&&+p[2]>=32&&+p[2]<64){const ms=`c${p[1]}.${+p[2]-32}`;const e=ent(midi.map[ms]);if(e&&e.hi)k=ms;}}
  const mon=$('#cxt-mon');
  if(!midi.map[k]){if(mon&&!(type===0x80||(type===0x90&&d2===0)))mon.textContent='Message inconnu de ce mapping : '+midiKeyText(key)+' = '+d2;return;}
  if(type===0x80||(type===0x90&&d2===0)){const c=chip(k);c&&c.classList.remove('now');return;}
  T.hits.add(k);T.last=k;const c=chip(k);
  if(c){c.classList.add('hit','now');c.querySelector('i').textContent=String(type===0xE0?((d2<<7)|d1):d2);clearTimeout(c._t);c._t=setTimeout(()=>c.classList.remove('now'),350);c.scrollIntoView({block:'nearest'});}
  if(mon){const[a,b]=chipText(k,ent(midi.map[k]));mon.textContent='Reçu : '+a+' → '+b;}
  testCount();
};
C.testSweep=(step=320)=>{
  clearInterval(T.sweep);const L=C.testLeds();let i=0;
  const btn=$('#cxt-sweep');
  if(!L.length){toast('Ce mapping ne déclare aucun voyant.');return;}
  if(!outs().length){toast('Aucune sortie MIDI : la table ne peut pas recevoir les voyants.');}
  L.forEach(l=>sendOut(l.out,l.off));
  const tick=()=>{
    if(T.lit){sendOut(T.lit.out,T.lit.off);const c=chip(T.lit.key);c&&c.classList.remove('lit');T.lit=null;}
    if(i>=L.length||!T.on){clearInterval(T.sweep);T.sweep=null;if(btn)btn.textContent='Allumer les voyants un par un';return;}
    const l=L[i++];T.lit=l;sendOut(l.out,l.on);const c=chip(l.key);if(c){c.classList.add('lit');c.scrollIntoView({block:'nearest'});}
    const mon=$('#cxt-mon');if(mon)mon.textContent='Voyant '+i+' / '+L.length+' : '+chipText(l.key,ent(midi.map[l.key]))[0];
  };
  if(btn)btn.textContent='Voyants en cours…';
  tick();T.sweep=setInterval(tick,step);
};
C.testOpen=()=>{
  if(!midi.access)connectMidi();
  T.on=true;T.hits.clear();T.last=null;$('#midi-modal').hidden=true;
  const m=$('#cxt-modal');m.hidden=false;
  $('#cxt-name').textContent=Object.keys(midi.map).length?(C.meta.name||'Mapping personnel')+(C.meta.unverified?' · non vérifié sur le matériel':''):'Aucun mapping actif : charge celui de ta table ou lance l’assistant.';
  testRender();
  // tout éteindre au départ : on voit mieux chaque voyant
  C.testLeds().forEach(l=>sendOut(l.out,l.off));
};
C.testClose=()=>{
  T.on=false;clearInterval(T.sweep);T.sweep=null;if(T.lit){sendOut(T.lit.out,T.lit.off);T.lit=null;}
  $('#cxt-modal').hidden=true;midi.last={};
};
const om=C.onMidi;C.onMidi=(e,key,type,ch,d1,d2)=>{if(T.on){const dev=e&&(e.target||e.currentTarget);if(dev&&dev.name)C.st.lastDev=dev.name;return T.msg(key,type,ch,d1,d2);}return om(e,key,type,ch,d1,d2);};
const lt=C.ledTick;C.ledTick=()=>{if(T.on)return;lt();};

/* ---------- interface ---------- */
const CSS=`
.cx-hw{margin-top:6px;font-size:12px;color:var(--tx)}.cx-hw b{color:var(--white)}
#cxt-modal .mbox{width:min(860px,100%)}#cxt-modal h3{margin:10px 0 4px;font-size:12px;color:var(--mu)}
.cxt-chips{display:flex;flex-wrap:wrap;gap:4px}
.cxt-c{display:grid;grid-template-columns:auto auto;align-items:baseline;gap:0 6px;padding:4px 7px;border:1px solid var(--ln);border-radius:var(--r);background:var(--s2);font-size:12px;transition:background .15s,border-color .15s}
.cxt-c small{grid-column:1;color:var(--mu);font-size:11px}.cxt-c i{grid-row:1/3;grid-column:2;font:11px var(--num);color:var(--mu);font-style:normal}
.cxt-c.hit{border-color:var(--ok)}.cxt-c.now{background:var(--s3);border-color:var(--white)}.cxt-c.lit{border-color:var(--warn);background:var(--s3)}
.cxt-warn{color:var(--warn);font-size:12px}#cxt-mon{margin:6px 0}#cxt-list{max-height:56vh;overflow:auto}`;
function build(){
  register();
  if(!$('#cxt-style'))document.head.append(h('style',{id:'cxt-style'},CSS));
  const row=$('#midi-modal .mlib .r.fixed');
  if(row&&!$('#cxt-btn'))row.append(h('button',{class:'b',type:'button',id:'cxt-btn',title:'Allume chaque voyant et montre chaque commande que tu touches',onclick:C.testOpen},'Tester ma table'));
  if(!$('#cxt-modal'))document.body.append(h('div',{class:'modal',id:'cxt-modal',hidden:true},h('div',{class:'mbox',role:'dialog','aria-label':'Tester ma table'},
    h('h2',{},'Tester ma table',h('button',{class:'b',type:'button',id:'cxt-close',onclick:C.testClose},'Fermer')),
    h('p',{id:'cxt-name'},''),
    h('p',{class:'cxt-warn'},'Pendant le test, la table ne pilote pas le logiciel : touche chaque commande, elle s’éclaire ici. Une commande qui reste éteinte n’est pas reconnue : corrige-la avec MIDI Learn.'),
    h('div',{class:'r fixed'},h('button',{class:'b go',type:'button',id:'cxt-sweep',onclick:()=>C.testSweep()},'Allumer les voyants un par un'),
      h('button',{class:'b',type:'button',onclick:()=>{T.hits.clear();testRender();}},'Recommencer'),h('span',{class:'mon',id:'cxt-n'},'')),
    h('div',{class:'mon',id:'cxt-mon'},'Touche une commande de ta table.'),
    h('div',{id:'cxt-list'}))));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&T.on)C.testClose();});
  setInterval(hintTick,300);
}
const b0=C.build;C.build=()=>{b0();build();};

/* ---------- réglage ---------- */
window.MixlabSettings=(window.MixlabSettings||[]).concat([
  {tab:'Contrôleur',key:'mapAuto',label:'Charger tout seul le mapping d’une table reconnue',type:'bool',get:()=>store.get('mapAuto',true),set:v=>store.set('mapAuto',!!v)},
]);
})();
