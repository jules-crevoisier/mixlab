'use strict';
/* =====================================================================
   Mixlab · sorties live et connexions
   - Diffusion du master vers Icecast ou Shoutcast (appli) : encodage
     MediaRecorder (Opus en Ogg ou WebM, MP3 si la WebView sait), envoi par
     src-tauri/src/net.rs, reconnexion automatique.
   - « Now playing » : le morceau à l'antenne dans un fichier texte (appli)
     et une page pour OBS servie en local (http://127.0.0.1:7777/).
   - Horloge MIDI en entrée : Mixlab suit un tempo externe.
   - OSC par UDP (appli) : /mixlab/<commande> pilote le registre des commandes.
   - Ableton Link (appli) : écoute du tempo de la session.
   La fenêtre « Live » de la barre du haut rassemble tout ; video.js y ajoute
   ses onglets (vidéo, paroles, karaoké).
   ===================================================================== */
window.LiveOut=(()=>{
  const T=window.__TAURI__,inv=T&&T.core?T.core.invoke:null;
  const DEF={
    np:{tpl:'{artist} - {title}',hold:4,overlay:false,port:7777,pos:'bl',lyrics:true},
    stream:{kind:'icecast',host:'',port:8000,mount:'/live',user:'source',password:'',name:'Mixlab',genre:'',description:'',url:'',public:false,bitrate:128,reconnect:true,format:'auto'},
    clock:{follow:false,transport:false},
    osc:{on:false,port:9000},
    link:{on:false,follow:true},
  };
  const saved=store.get('live',{});
  const cfg={};for(const k in DEF)cfg[k]={...DEF[k],...(saved[k]||{})};
  // le mot de passe de diffusion reste dans la session : jamais écrit dans localStorage
  cfg.stream.password='';
  const save=()=>{const c=JSON.parse(JSON.stringify(cfg));c.stream.password='';store.set('live',c);};
  const L={cfg,tabs:[],now:null,cand:null,candAt:0,history:[],last:{text:null,json:null},status:{}};

  /* ---------- à l'antenne ---------- */
  // Poids d'une platine dans le mix : fader × crossfader (la courbe du mixer).
  const weight=d=>d&&d.active&&d.track?faderGain(d.p.fader)*xfGainOf(d):0;
  function onAir(){
    let best=null,bw=.05;
    for(const d of decks){if(!d.playing)continue;const w=weight(d);if(w>bw){bw=w;best=d;}}
    return best;
  }
  const fmt=(tpl,n)=>{
    if(!n)return'';
    const s=String(tpl||DEF.np.tpl).replace(/\{(\w+)\}/g,(_,k)=>n[k]==null?'':String(n[k]));
    // sans artiste : pas de tiret orphelin
    return s.replace(/^\s*[-–·|]\s*/,'').replace(/\s*[-–·|]\s*$/,'').trim();
  };
  const keyCode=tr=>{const k=tr&&tr.key&&typeof keyInfo==='function'?keyInfo(tr.key):null;return k?k.code:'';};
  function commit(d){
    const tr=d.track;
    L.now={title:tr.title||'',artist:tr.artist||'',genre:tr.genre||'',album:tr.album||'',deck:d.id,bpm:Math.round(d.bpm*10)/10,key:keyCode(tr),since:Date.now(),id:tr.id};
    L.history.unshift({title:L.now.title,artist:L.now.artist,deck:d.id,at:new Date().toISOString()});
    L.history.length=Math.min(L.history.length,20);
    if(L.stream.on)metaPush();
    L.onChange&&L.onChange(L.now);
  }
  // Un morceau passe à l'antenne quand il reste le plus fort pendant « hold » secondes.
  function tickNow(){
    const d=onAir(),now=performance.now();
    if(!d){L.cand=null;return;}
    const same=L.now&&L.now.id===d.track.id;
    if(same){L.cand=null;return;}
    if(!L.cand||L.cand.d!==d||L.cand.id!==d.track.id){L.cand={d,id:d.track.id};L.candAt=now;}
    if(!L.now||now-L.candAt>=cfg.np.hold*1000){commit(d);L.cand=null;}
  }
  function payload(){
    const n=L.now,lyr=window.Video&&Video.lyricNow?Video.lyricNow(n&&n.deck):null;
    return{title:n?n.title:'',artist:n?n.artist:'',text:fmt(cfg.np.tpl,n),bpm:n?n.bpm:null,key:n?n.key:'',deck:n?n.deck:'',
      since:n?n.since:null,lyric:cfg.np.lyrics&&lyr?lyr.line:'',next:cfg.np.lyrics&&lyr?lyr.next:'',history:L.history.slice(0,5)};
  }
  async function publish(){
    const p=payload(),text=p.text,json=JSON.stringify(p);
    if(text===L.last.text&&json===L.last.json)return;
    L.last={text,json};
    L.status.np=text;
    if(inv){try{L.status.npPath=await inv('nowplaying_set',{text,json});}catch(e){L.status.npErr=String(e);}}
    renderStatus();
  }

  /* ---------- page OBS ----------
     Page autonome : elle relit now.json chaque seconde et affiche le titre en bas d'écran
     (fond transparent, à ajouter dans OBS comme source « Navigateur »). */
  function overlayHtml(o={}){
    const pos=o.pos||cfg.np.pos,poll=o.poll||1000;
    const place={bl:'left:4vw;bottom:6vh',bc:'left:50%;bottom:6vh;transform:translateX(-50%);text-align:center',tl:'left:4vw;top:6vh',tr:'right:4vw;top:6vh;text-align:right'}[pos]||'left:4vw;bottom:6vh';
    return`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Mixlab · titre en cours</title>
<style>html,body{margin:0;background:transparent;overflow:hidden;font-family:Inter,system-ui,sans-serif}
#np{position:fixed;${place};max-width:80vw;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.8);opacity:0;transition:opacity .6s}
#np.on{opacity:1}#np small{display:block;font-size:2.4vh;letter-spacing:.2em;text-transform:uppercase;opacity:.7}
#np b{display:block;font-size:5vh;font-weight:700;line-height:1.15}#np span{display:block;font-size:3.4vh;opacity:.85}
#ly{position:fixed;left:0;right:0;bottom:22vh;text-align:center;color:#fff;font-size:4.4vh;font-weight:600;text-shadow:0 2px 10px #000}</style></head>
<body><div id="np"><small>En cours</small><b id="t"></b><span id="a"></span></div><div id="ly"></div>
<script>(function(){var last='';function show(j){var k=(j.title||'')+'|'+(j.artist||'');var np=document.getElementById('np');
if(k!==last){last=k;np.classList.remove('on');setTimeout(function(){document.getElementById('t').textContent=j.title||'';document.getElementById('a').textContent=j.artist||'';if(j.title)np.classList.add('on');},last&&np.textContent.trim()?600:0);}
document.getElementById('ly').textContent=j.lyric||'';}
function poll(){fetch('now.json?'+Date.now(),{cache:'no-store'}).then(function(r){return r.json();}).then(show).catch(function(){});}
poll();setInterval(poll,${poll});})();</script></body></html>`;
  }
  async function overlayOn(on){
    cfg.np.overlay=on;save();
    if(!inv){renderStatus();return null;}
    try{
      if(on){L.status.overlay=await inv('overlay_start',{port:+cfg.np.port||7777,html:overlayHtml()});L.last={text:null,json:null};publish();}
      else{await inv('overlay_stop');L.status.overlay='';}
    }catch(e){L.status.overlay='';L.status.overlayErr=String(e);toast(String(e));}
    renderStatus();return L.status.overlay;
  }

  /* ---------- diffusion ---------- */
  const MIMES=[['audio/ogg;codecs=opus','Opus (Ogg)'],['audio/webm;codecs=opus','Opus (WebM)'],['audio/mpeg','MP3'],['audio/webm','WebM']];
  const canRec=m=>typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m);
  const formats=()=>MIMES.filter(m=>canRec(m[0]));
  function pickMime(){const f=formats();const want=f.find(m=>m[0]===cfg.stream.format);return(want||f[0]||[null])[0];}
  // Transport : l'appli envoie par net.rs ; un test peut en fournir un autre.
  const tauriTransport=inv?{
    start:c=>inv('stream_start',{cfg:c}),
    send:bytes=>inv('stream_send',bytes),
    stop:()=>inv('stream_stop'),
    meta:(c,song)=>inv('stream_metadata',{cfg:c,song}),
  }:null;
  const S2=L.stream={on:false,state:'off',mr:null,sent:0,since:0,tries:0,timer:null,chain:Promise.resolve(),mime:null,transport:tauriTransport,err:''};
  const wireCfg=mime=>({...cfg.stream,port:+cfg.stream.port||8000,bitrate:+cfg.stream.bitrate||128,contentType:(mime||'').split(';')[0]});
  function setState(st,msg){S2.state=st;S2.err=msg||'';renderStatus();L.onStream&&L.onStream(st,msg);}
  async function streamStart(){
    if(!S2.transport){setState('app','La diffusion passe par l’appli Mixlab : un navigateur ne peut pas ouvrir de connexion source vers un serveur Icecast ou Shoutcast.');return false;}
    if(!bus.rec){setState('error','Ce moteur audio ne sait pas capter le master.');return false;}
    const mime=pickMime();
    if(!mime){setState('error','Aucun encodeur disponible dans cette WebView (ni Opus ni MP3).');return false;}
    if(!cfg.stream.host){setState('error','Indique l’adresse du serveur.');return false;}
    S2.on=true;S2.mime=mime;clearTimeout(S2.timer);
    return connect();
  }
  async function connect(){
    if(!S2.on)return false;
    setState(S2.tries?'retry':'connecting',S2.tries?'Reconnexion, essai '+(S2.tries+1):'');
    try{await S2.transport.start(wireCfg(S2.mime));}
    catch(e){return fail(String(e&&e.message||e));}
    if(!S2.on){try{await S2.transport.stop();}catch(e){}return false;}
    S2.tries=0;S2.since=S2.since||Date.now();
    // un nouvel encodeur à chaque connexion : le serveur reçoit d'abord l'en-tête du flux
    const mr=new MediaRecorder(bus.rec.stream,{mimeType:S2.mime,audioBitsPerSecond:(+cfg.stream.bitrate||128)*1000});
    S2.mr=mr;
    mr.ondataavailable=e=>{
      if(!e.data||!e.data.size||S2.mr!==mr)return;
      S2.chain=S2.chain.then(async()=>{
        if(S2.mr!==mr)return;
        const b=new Uint8Array(await e.data.arrayBuffer());
        try{await S2.transport.send(b);S2.sent+=b.length;renderStatus();}
        catch(err){if(S2.mr===mr){dropRec();fail(String(err&&err.message||err));}}
      });
    };
    mr.start(500);
    setState('live');metaPush();
    return true;
  }
  function dropRec(){const mr=S2.mr;S2.mr=null;if(mr&&mr.state!=='inactive')try{mr.stop();}catch(e){}}
  function fail(msg){
    dropRec();
    if(!S2.on){setState('off');return false;}
    if(!cfg.stream.reconnect){S2.on=false;setState('error',msg);return false;}
    S2.tries++;const wait=Math.min(30,2*Math.pow(2,Math.min(4,S2.tries-1)));
    setState('retry',msg+' · nouvel essai dans '+wait+' s');
    clearTimeout(S2.timer);S2.timer=setTimeout(connect,wait*1000);
    return false;
  }
  async function streamStop(){
    S2.on=false;clearTimeout(S2.timer);dropRec();S2.tries=0;S2.since=0;
    if(S2.transport)try{await S2.transport.stop();}catch(e){}
    setState('off');
  }
  function metaPush(){
    if(!S2.transport||!S2.transport.meta||S2.state!=='live'||!L.now)return;
    S2.transport.meta(wireCfg(S2.mime),fmt(cfg.np.tpl,L.now)).catch(()=>{});
  }

  /* ---------- suivre un tempo externe (horloge MIDI, Link) ---------- */
  // La platine qui mène : la maître, sinon celle qui joue. Les platines en Sync la suivent d'elles-mêmes.
  function leader(){
    const m=S.master;if(m&&m.active&&m.track)return m;
    return decks.find(d=>d.active&&d.track&&d.playing)||decks.find(d=>d.active&&d.track)||null;
  }
  function follow(bpm,src){
    if(!(bpm>=40&&bpm<=300))return false;
    const d=leader();if(!d)return false;
    const base=d.track.bpm,cands=[bpm,bpm*2,bpm/2],tb=cands.reduce((a,b)=>Math.abs(b-base)<Math.abs(a-base)?b:a);
    const want=tb/base-1;
    if(Math.abs(want)>d.pitchRange){const r=[.08,.16,.5].find(x=>x>=Math.abs(want));if(!r)return false;d.setRange(r);}
    if(Math.abs((1+want)*base-(1+d.pitch)*base)<.01)return true;
    if(d.sync)d.sync=false;
    d.setPitch(want);L.followed={bpm,src,deck:d.id};
    return true;
  }

  /* ---------- horloge MIDI en entrée ---------- */
  const CK=L.clock={ticks:[],bpm:0,running:false,last:0,lastFollow:0};
  function clockTick(ts){
    if(CK.last&&ts-CK.last>600)CK.ticks=[];   // horloge coupée puis reprise
    CK.last=ts;CK.ticks.push(ts);if(CK.ticks.length>97)CK.ticks.shift();
    const n=CK.ticks.length;if(n<25)return;
    // moyenne sur 4 temps au plus : stable malgré la gigue de l'USB
    const iv=(CK.ticks[n-1]-CK.ticks[0])/(n-1),bpm=60000/(iv*24);
    CK.bpm=Math.round(bpm*100)/100;
    if(cfg.clock.follow&&ts-CK.lastFollow>250){CK.lastFollow=ts;follow(Math.round(bpm*10)/10,'midi');}
    if(n%24===0)renderStatus();
  }
  function midiRealtime(e){
    const st=e.data[0],ts=e.timeStamp>0?e.timeStamp:performance.now();
    if(st===0xF8)clockTick(ts);
    else if(st===0xFA||st===0xFB){CK.running=true;if(st===0xFA)CK.ticks=[];if(cfg.clock.transport){const d=leader();if(d&&!d.playing){if(st===0xFA&&d.track.cue!=null)d.seek(d.track.cue);d.play();}}renderStatus();}
    else if(st===0xFC){CK.running=false;if(cfg.clock.transport){const d=leader();if(d&&d.playing)d.pause();}renderStatus();}
  }

  /* ---------- OSC ----------
     /mixlab/<commande> valeur : la commande du registre (souris, clavier, MIDI).
     Exemples : /mixlab/A.play 1, /mixlab/A/fader 0.7, /mixlab/xf 0.5, /mixlab/B.pad1 1 puis 0. */
  const OS=L.osc={count:0,last:'',on:false,port:0,unlisten:null};
  function oscIn(m){
    const addr=String(m&&m.addr||''),args=(m&&m.args)||[];
    OS.count++;OS.last=addr+' '+args.map(a=>typeof a==='number'?Math.round(a*1000)/1000:String(a)).join(' ');
    const r=/^\/mixlab\/(.+)$/.exec(addr);if(!r){renderStatus();return false;}
    const raw=r[1],id=[raw,raw.replace(/\//g,'.')].find(x=>ctl(x));
    const c=id&&ctl(id);if(!c){OS.last+=' · commande inconnue';renderStatus();return false;}
    const a=args.find(x=>typeof x==='number'||typeof x==='boolean');
    const v=a==null?null:typeof a==='boolean'?(a?1:0):a;
    if(c.kind==='abs'){if(v==null)return false;c.set(clamp(v,0,1));}
    else if(c.kind==='btn'){if(v==null||v>0){c.press({});if(v==null&&c.release)c.release();}else c.release&&c.release();}
    else if(c.kind==='rel'){if(v!=null)c.move(v);}
    renderStatus();return true;
  }
  async function oscOn(on){
    cfg.osc.on=on;save();
    if(!inv){renderStatus();return false;}
    try{
      if(on){
        if(!OS.unlisten)OS.unlisten=await T.event.listen('osc',e=>oscIn(e.payload));
        OS.port=await inv('osc_start',{port:+cfg.osc.port||9000});OS.on=true;
      }else{await inv('osc_stop');OS.on=false;}
    }catch(e){OS.on=false;toast(String(e));}
    renderStatus();return OS.on;
  }

  /* ---------- Ableton Link (écoute du tempo) ---------- */
  const LK=L.link={on:false,tempo:null,peers:0,unlisten:null};
  function linkIn(p){
    LK.tempo=p.tempo;LK.peers=p.peers;
    if(cfg.link.follow&&p.tempo&&p.peers>0)follow(Math.round(p.tempo*100)/100,'link');
    renderStatus();
  }
  async function linkOn(on){
    cfg.link.on=on;save();
    if(!inv){renderStatus();return false;}
    try{
      if(on){if(!LK.unlisten)LK.unlisten=await T.event.listen('link',e=>linkIn(e.payload));await inv('link_start');LK.on=true;}
      else{await inv('link_stop');LK.on=false;LK.peers=0;}
    }catch(e){LK.on=false;toast(String(e));}
    renderStatus();return LK.on;
  }

  /* ---------- fenêtre « Live » ---------- */
  const st=document.createElement('style');
  st.textContent=`
#live-modal .mbox{width:min(980px,100%)}
.lv-tabs{display:flex;gap:2px;margin:0 0 12px;flex-wrap:wrap}
.lv-f{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;font-size:13px}
.lv-f label{color:var(--mu)}
.lv-f input[type=text],.lv-f input[type=number],.lv-f input[type=password],.lv-f select,.lv-in{background:var(--s2);border:1px solid var(--ln2);border-radius:3px;color:var(--tx);height:24px;padding:0 6px;min-width:0;width:100%}
.lv-st{font:500 12px/1.5 var(--num,monospace);color:var(--mu);margin-top:8px;white-space:pre-wrap;word-break:break-word}
.lv-st b{color:var(--tx)}
.lv-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0}
.lv-note{font:400 12px/1.45 var(--ui);color:var(--dim);margin:6px 0 0}
.lv-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--dim);margin-right:6px;vertical-align:middle}
.lv-dot.live{background:var(--bad)}.lv-dot.ok{background:var(--ok)}.lv-dot.wait{background:var(--warn)}
#live-btn .dot.live{background:var(--bad);box-shadow:0 0 6px var(--bad)}`;
  document.head.append(st);

  const modal=h('div',{class:'modal',id:'live-modal',hidden:true});
  const box=h('div',{class:'mbox',role:'dialog','aria-label':'Live : diffusion, vidéo, paroles et connexions'});
  const tabBar=h('div',{class:'seg lv-tabs',role:'tablist'}),body=h('div',{});
  box.append(h('h2',{},'Live',h('button',{class:'b',type:'button',onclick:()=>close()},'Fermer')),tabBar,body);
  modal.append(box);modal.addEventListener('click',e=>{if(e.target===modal)close();});
  document.body.append(modal);
  let cur=store.get('livetab','np');
  function tab(id,label,build,order=50){L.tabs.push({id,label,build,order});L.tabs.sort((a,b)=>a.order-b.order);if(!modal.hidden)render();}
  function render(){
    tabBar.innerHTML='';
    if(!L.tabs.some(t=>t.id===cur))cur=L.tabs[0]&&L.tabs[0].id;
    L.tabs.forEach(t=>tabBar.append(h('button',{type:'button',role:'tab','aria-pressed':String(t.id===cur),onclick:()=>{cur=t.id;store.set('livetab',cur);render();}},t.label)));
    body.innerHTML='';const t=L.tabs.find(x=>x.id===cur);if(t)body.append(t.build());
    renderStatus();
  }
  function open(id){if(id)cur=id;modal.hidden=false;render();}
  function close(){modal.hidden=true;L.onClose&&L.onClose();}
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)close();});
  const btnTop=h('button',{class:'tb',id:'live-btn',type:'button',title:'Live : diffusion, titre en cours pour OBS, sortie vidéo, paroles, karaoké, horloge MIDI, OSC, Link',onclick:()=>open()},h('span',{class:'dot'}),'Live');
  const top=$('#top');if(top)top.insertBefore(btnTop,$('#audio-btn')||null);

  // petits constructeurs de formulaire
  const field=(label,input)=>[h('label',{},label),input];
  const txtIn=(obj,k,type='text',onc)=>{const i=h('input',{type,value:obj[k]==null?'':String(obj[k]),class:'lv-in',autocomplete:'off'});i.addEventListener('change',()=>{obj[k]=type==='number'?+i.value:i.value;save();onc&&onc();});return i;};
  const chk=(obj,k,label,onc)=>{const i=h('input',{type:'checkbox'});i.checked=!!obj[k];i.addEventListener('change',()=>{obj[k]=i.checked;save();onc&&onc(i.checked);});return h('label',{class:'lv-chk'},i,' ',label);};
  const sel=(obj,k,opts,onc)=>{const s=h('select',{class:'lv-in'},opts.map(([v,n])=>h('option',{value:v},n)));s.value=obj[k];s.addEventListener('change',()=>{obj[k]=s.value;save();onc&&onc(s.value);});return s;};
  const statusEls={};
  function stEl(id){return statusEls[id]=h('div',{class:'lv-st'});}

  /* onglet : titre en cours */
  tab('np','Titre en cours',()=>{
    const wrap=h('div',{class:'mgrid'});
    wrap.append(h('div',{},
      h('h3',{},'Morceau à l’antenne'),
      h('p',{},'Le morceau le plus fort dans le mix, après quelques secondes à l’antenne.'),
      h('div',{class:'lv-f'},
        field('Format',txtIn(cfg.np,'tpl','text',()=>{L.last={text:null,json:null};publish();})),
        field('Délai (s)',txtIn(cfg.np,'hold','number'))),
      h('p',{class:'lv-note'},'Champs : {artist}, {title}, {bpm}, {key}, {deck}, {genre}, {album}.'),
      stEl('np')));
    const ovBtn=h('button',{class:'b',type:'button',onclick:async()=>{await overlayOn(!cfg.np.overlay);render();}},cfg.np.overlay?'Arrêter la page OBS':'Démarrer la page OBS');
    wrap.append(h('div',{},
      h('h3',{},'Pour OBS'),
      inv?h('p',{},'Fichier texte : dans OBS, source « Texte », case « Lire depuis un fichier ». Page : source « Navigateur » avec l’adresse ci-dessous.')
        :h('p',{},'Dans le navigateur, Mixlab ne peut ni écrire de fichier ni servir de page. Copie le titre ci-dessous, ou utilise l’appli Mixlab pour OBS.'),
      inv?h('div',{class:'lv-row'},h('button',{class:'b',type:'button',onclick:async()=>{const p=await inv('nowplaying_pick').catch(()=>null);if(p){L.status.npPath=p;L.last={text:null,json:null};publish();}}},'Choisir le fichier')):null,
      inv?h('div',{class:'lv-f'},field('Port',txtIn(cfg.np,'port','number')),field('Position',sel(cfg.np,'pos',[['bl','En bas à gauche'],['bc','En bas au centre'],['tl','En haut à gauche'],['tr','En haut à droite']],()=>cfg.np.overlay&&overlayOn(true)))):null,
      h('div',{class:'lv-row'},inv?ovBtn:null,chk(cfg.np,'lyrics','Paroles sur la page',()=>{L.last={text:null,json:null};publish();})),
      stEl('obs')));
    return wrap;
  },10);

  /* onglet : diffusion */
  tab('stream','Diffusion',()=>{
    const c=cfg.stream,wrap=h('div',{class:'mgrid'});
    const pw=h('input',{type:'password',class:'lv-in',autocomplete:'off',value:c.password||''});pw.addEventListener('input',()=>{c.password=pw.value;});
    const fm=formats();
    wrap.append(h('div',{},
      h('h3',{},'Serveur'),
      h('div',{class:'lv-f'},
        field('Type',sel(c,'kind',[['icecast','Icecast 2.4 et plus'],['icecast-source','Icecast ancien (SOURCE)'],['shoutcast','Shoutcast v1']])),
        field('Adresse',txtIn(c,'host')),field('Port',txtIn(c,'port','number')),
        field('Point de montage',txtIn(c,'mount')),field('Identifiant',txtIn(c,'user')),field('Mot de passe',pw)),
      h('p',{class:'lv-note'},'Le mot de passe n’est jamais enregistré : retape-le à chaque lancement.')));
    wrap.append(h('div',{},
      h('h3',{},'Flux'),
      h('div',{class:'lv-f'},
        field('Format',fm.length?sel(c,'format',[['auto','Automatique ('+fm[0][1]+')'],...fm]):h('span',{},'Aucun encodeur disponible')),
        field('Débit (kb/s)',sel(c,'bitrate',[['64','64'],['96','96'],['128','128'],['192','192'],['256','256'],['320','320']])),
        field('Nom',txtIn(c,'name')),field('Genre',txtIn(c,'genre')),field('Site',txtIn(c,'url'))),
      h('div',{class:'lv-row'},chk(c,'public','Annuaire public'),chk(c,'reconnect','Reconnexion automatique')),
      h('div',{class:'lv-row'},
        h('button',{class:'b',type:'button',onclick:async()=>{await streamStart();render();}},'Démarrer'),
        h('button',{class:'b',type:'button',onclick:async()=>{await streamStop();render();}},'Arrêter')),
      stEl('stream'),
      !inv?h('p',{class:'lv-note'},'La diffusion passe par l’appli Mixlab : un navigateur ne peut pas ouvrir de connexion source vers Icecast ou Shoutcast.'):
        h('p',{class:'lv-note'},'Le son envoyé est le master après le limiteur, comme l’enregistrement. MP3 seulement si la WebView sait l’encoder ; sinon Opus, accepté par Icecast 2.4.')));
    return wrap;
  },20);

  /* onglet : connexions */
  tab('sync','Connexions',()=>{
    const wrap=h('div',{class:'mgrid'});
    wrap.append(h('div',{},
      h('h3',{},'Horloge MIDI en entrée'),
      h('p',{},'Une boîte à rythmes, un séquenceur ou un autre logiciel envoie son horloge : la platine maître prend son tempo.'),
      h('div',{class:'lv-row'},chk(cfg.clock,'follow','Suivre le tempo'),chk(cfg.clock,'transport','Start et Stop lancent la platine maître')),
      stEl('clock')));
    wrap.append(h('div',{},
      h('h3',{},'OSC'),
      h('p',{},'Une tablette ou un autre logiciel pilote Mixlab par le réseau. Adresse : /mixlab/ suivi du nom de la commande, par exemple /mixlab/A.play 1 ou /mixlab/xf 0.5.'),
      inv?h('div',{class:'lv-f'},field('Port UDP',txtIn(cfg.osc,'port','number',()=>cfg.osc.on&&oscOn(true)))):null,
      inv?h('div',{class:'lv-row'},chk(cfg.osc,'on','Écouter',v=>oscOn(v))):h('p',{class:'lv-note'},'OSC passe par l’appli Mixlab : un navigateur ne reçoit pas d’UDP.'),
      h('details',{},h('summary',{class:'lv-note'},'Liste des commandes'),h('div',{class:'lv-st'},[...controls.keys()].join('  '))),
      stEl('osc')));
    wrap.append(h('div',{},
      h('h3',{},'Ableton Link'),
      h('p',{},'Mixlab écoute la session Link du réseau et peut en suivre le tempo. Il ne la mène pas encore.'),
      inv?h('div',{class:'lv-row'},chk(cfg.link,'on','Écouter Link',v=>linkOn(v)),chk(cfg.link,'follow','Suivre le tempo')):h('p',{class:'lv-note'},'Link passe par l’appli Mixlab : un navigateur ne reçoit pas le multicast.'),
      stEl('link')));
    return wrap;
  },60);

  const kb=n=>n>1048576?(n/1048576).toFixed(1)+' Mo':Math.round(n/1024)+' ko';
  const dur=ms=>{const s=Math.floor(ms/1000);return Math.floor(s/3600)+':'+String(Math.floor(s/60)%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
  let rsq=0;
  function renderStatus(){
    const dot=$('#live-btn .dot');if(dot){dot.classList.toggle('live',S2.state==='live');dot.classList.toggle('on',S2.state!=='live'&&(!!L.status.overlay||OS.on||LK.on));}
    if(modal.hidden||rsq)return;
    rsq=requestAnimationFrame(()=>{rsq=0;
      const set=(k,v)=>{const e=statusEls[k];if(e&&e.isConnected&&e.textContent!==v)e.textContent=v;};
      set('np','Maintenant : '+(L.status.np||'rien à l’antenne')+(L.history.length>1?'\nAvant : '+L.history.slice(1,4).map(x=>fmt('{artist} - {title}',x)).join(' · '):''));
      set('obs',inv?((L.status.npPath?'Fichier : '+L.status.npPath:'')+(L.status.overlay?'\nPage OBS : '+L.status.overlay:'')+(L.status.overlayErr&&!L.status.overlay?'\n'+L.status.overlayErr:'')):'Titre : '+(L.status.np||'—'));
      const SN={off:'Arrêtée',connecting:'Connexion…',live:'À l’antenne',retry:'Reconnexion',error:'Erreur',app:'Appli nécessaire'};
      set('stream',(SN[S2.state]||S2.state)+(S2.state==='live'?' · '+dur(Date.now()-S2.since)+' · '+kb(S2.sent)+' envoyés · '+(S2.mime||''):'')+(S2.err?'\n'+S2.err:''));
      set('clock',CK.bpm?'Horloge reçue : '+CK.bpm.toFixed(2)+' BPM'+(CK.running?' · en route':'')+(L.followed&&L.followed.src==='midi'?' · suivie par '+L.followed.deck:''):'Aucune horloge reçue');
      set('osc',(OS.on?'Écoute sur le port '+OS.port:'Arrêté')+(OS.count?' · '+OS.count+' messages\nDernier : '+OS.last:''));
      set('link',LK.on?(LK.peers?LK.peers+' pair'+(LK.peers>1?'s':'')+' · '+(LK.tempo?LK.tempo.toFixed(2)+' BPM':''):'Aucun pair Link sur le réseau'):'Arrêté');
    });
  }

  /* ---------- réglages (fenêtre Préférences) ---------- */
  window.MixlabSettings=(window.MixlabSettings||[]).concat([
    {tab:'Live',key:'live.np.tpl',label:'Format du titre en cours',type:'text',get:()=>cfg.np.tpl,set:v=>{cfg.np.tpl=String(v);save();}},
    {tab:'Live',key:'live.np.hold',label:'Délai avant de changer de titre (s)',type:'number',get:()=>cfg.np.hold,set:v=>{cfg.np.hold=Math.max(0,+v||0);save();}},
    {tab:'Live',key:'live.clock.follow',label:'Suivre l’horloge MIDI reçue',type:'bool',get:()=>cfg.clock.follow,set:v=>{cfg.clock.follow=!!v;save();}},
    {tab:'Live',key:'live.clock.transport',label:'Start et Stop MIDI lancent la platine maître',type:'bool',get:()=>cfg.clock.transport,set:v=>{cfg.clock.transport=!!v;save();}},
    {tab:'Live',key:'live.osc.port',label:'Port OSC (UDP)',type:'number',get:()=>cfg.osc.port,set:v=>{cfg.osc.port=+v||9000;save();if(cfg.osc.on)oscOn(true);}},
    {tab:'Live',key:'live.np.port',label:'Port de la page OBS',type:'number',get:()=>cfg.np.port,set:v=>{cfg.np.port=+v||7777;save();if(cfg.np.overlay)overlayOn(true);}},
    {tab:'Live',key:'live.link.follow',label:'Suivre le tempo Ableton Link',type:'bool',get:()=>cfg.link.follow,set:v=>{cfg.link.follow=!!v;save();}},
  ]);

  /* ---------- boucle ---------- */
  setInterval(()=>{tickNow();publish();},400);
  // services rouverts au démarrage de l'appli
  if(inv){if(cfg.np.overlay)overlayOn(true);if(cfg.osc.on)oscOn(true);if(cfg.link.on)linkOn(true);}

  return{cfg,state:L,open,close,tab,onAir,nowPlaying:()=>L.now,payload,format:fmt,overlayHtml,overlayOn,publish,tickNow,
    stream:{start:streamStart,stop:streamStop,get state(){return S2.state;},get sent(){return S2.sent;},get error(){return S2.err;},setTransport:t=>{S2.transport=t;},get mime(){return S2.mime;}},
    midiRealtime,clock:CK,follow,leader,oscIn,osc:OS,linkIn,link:LK,renderStatus};
})();
