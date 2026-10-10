'use strict';
// Style : aucun contrôle ne porte d'ombre portée, de biseau, de liseré sous le bouton ni de dégradé (traits typiques d'une interface générée).
// On parcourt tous les éléments visibles dans plusieurs états (modes de pads, tout allumé, chaque disposition, Préférences).
const {chromium}=require('playwright');const path=require('path');
let bad=0;
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const c=await b.newContext({viewport:{width:1600,height:950}});const p=await c.newPage();
await p.goto('file://'+path.resolve(__dirname,'..','app','index.html'));await p.waitForFunction(()=>LIB.tracks.length>=4&&decks[1].track&&decks[0].ui.pp,null,{timeout:60000});await p.mouse.click(800,5);
const audit=async tag=>{const r=await p.evaluate(()=>{const out={};const POP='.pop,.mbox,.popx,.ctx,.lpe,.coach-hud,.pc-welc,.toasts,.toast,.pc-pop,.mxpop,#prefs-menu,.pm-box,[role=dialog]';
for(const e of document.querySelectorAll('body *')){if(!e.offsetWidth||e.matches(POP))continue;const cs=getComputedStyle(e);const bs=cs.boxShadow;const bi=cs.backgroundImage;
const bad=[];
if(bs&&bs!=='none'){for(const s of bs.split(/,(?![^(]*\))/)){const ins=/inset/.test(s);const nums=(s.replace(/rgba?\([^)]*\)/g,'').match(/-?\d+(\.\d+)?px/g)||[]).map(parseFloat);const [x=0,y=0,bl=0,sp=0]=nums;
if(!ins&&(y!==0||bl>0))bad.push('drop '+s.trim());else if(ins&&(y!==0||bl>0))bad.push('bevel '+s.trim());}}
if(/gradient/.test(bi)&&(e.matches('button,.b,.pad,select,input,summary,label.tb')))bad.push('grad');
if(cs.textShadow!=='none')bad.push('text-shadow');
if(bad.length){const k=(e.tagName.toLowerCase()+'.'+[...e.classList].join('.')).slice(0,60)+' :: '+bad.join(' | ').slice(0,140);out[k]=(out[k]||0)+1;}}
return out;});const n=Object.keys(r).length;console.log((n?'ÉCHEC ':'OK   ')+'Sans ombre ni biseau : '+tag+(n?' · '+Object.entries(r).map(([k,v])=>v+'x '+k).join(' ; '):''));if(n)bad++;};
await audit('défaut');
for(const m of ['roll','jump','smp','slice','sloop','pitch']){await p.evaluate(m=>{const a=decks[0];a.padMode=m;renderPads(a);},m);}
await p.evaluate(()=>{decks[0].padMode='roll';renderPads(decks[0]);});
await audit('pads roll');
for(const m of ['hot','jump','smp','slice','sloop','pitch','fx','stem','loop','seq']){await p.evaluate(m=>{try{const a=decks[0];a.padMode=m;renderPads(a);}catch(e){}},m);await audit('pads '+m);}
await p.evaluate(()=>{document.querySelectorAll('.b,.tb').forEach(e=>e.classList.add('on'));});await audit('tout .on');
await p.evaluate(()=>{document.querySelectorAll('.b,.tb').forEach(e=>e.classList.remove('on'));});
for(const pr of await p.evaluate(()=>Object.keys(PRESETS))){await p.evaluate(pr=>{layout.preset=pr;layout.visible=new Set(PRESETS[pr].show);layout.coach=!!PRESETS[pr].coach;applyLayout();},pr);await p.waitForTimeout(300);await audit('preset '+pr);}
await p.evaluate(()=>Prefs.open&&Prefs.open());await p.waitForTimeout(300);await audit('prefs');
await b.close();console.log(bad?bad+' échec(s)':'Style : tout est vert');process.exit(bad?1:0);})()
