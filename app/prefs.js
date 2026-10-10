'use strict';
/* =====================================================================
   Mixlab · Préférences
   Une seule fenêtre pour tous les réglages, avec des onglets et une
   recherche : Profil, Affichage, Audio, Platines, Mixer, Contrôleurs et
   clavier, Coach et apprentissage, Bibliothèque, Avancé.
   Aucun état en double : chaque ligne lit la valeur là où elle vit
   (layout, S, DeckPro.P, View, MixCoach…) et passe par le setter du
   module qui la possède. La fenêtre est reconstruite à chaque ouverture.
   Ouverture : bouton Préférences (barre du haut), menu Affichage, Ctrl+,
   (Cmd+, sur Mac). Échap ferme.
   ===================================================================== */
window.Prefs=(()=>{
  // Réglages propres à cette fenêtre (ceux qui n'avaient pas encore de maison)
  const DEF={pitchRange:8,keyLock:false,limiter:true};
  const P={...DEF,...store.get('prefs',{})};
  const save=()=>store.set('prefs',P);
  // Clés de localStorage exportées, importées et remises à zéro. Pas la bibliothèque ni la progression.
  const SETTINGS=['preset','visible','decks','zoom','wave','uiZoom','stage','deckSizes','splits','fxFold','sideTab','deckPro','deckpro','eqMode','colorFx',
    'bpmRange','coachLevel','keys','kbLayout','midimap','midimeta','mappings','clockout','audio','libcols','libcolsOn','amStyle','amBars','amFill','fx','profile','welcome','prefs'];
  const TABS=[['profil','Profil'],['affichage','Affichage'],['audio','Audio'],['platines','Platines'],['mixer','Mixer'],['controleurs','Contrôleurs et clavier'],
    ['coach','Coach et apprentissage'],['bibliotheque','Bibliothèque'],['avance','Avancé']];
  // Niveau : disposition proposée (sans logiciel d'origine) et niveau du coach en direct
  const LEVELS={debutant:{name:'Débutant',preset:'ecole',coach:'debutant'},mixe:{name:'Je sais mixer',preset:'mix',coach:'essentiel'},pro:{name:'Pro',preset:'perf',coach:'off'}};
  const FROM=()=>(window.Parcours&&Parcours.FROM)||{};
  const V={tab:'profil',q:'',el:{},built:false};
  const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

  /* ---------- réglages appliqués au démarrage ---------- */
  function applyLimiter(){const L=bus.lim,t=ctx.currentTime;L.threshold.setValueAtTime(P.limiter?-1.5:0,t);L.ratio.setValueAtTime(P.limiter?20:1,t);}
  applyLimiter();
  function applyDecks(){decks.forEach(d=>{d.setRange(P.pitchRange/100);if(P.keyLock)d.setKeyLock(true);});}

  /* ---------- profil ---------- */
  function profile(){
    const p=store.get('profile',null);if(p)return{from:FROM()[p.from]?p.from:'',level:LEVELS[p.level]?p.level:'mixe'};
    // avant cette fenêtre, seul le choix de l'accueil était gardé
    const w=store.get('welcome',null);
    return{from:FROM()[w]?w:'',level:w==='novice'?'debutant':w==null?'debutant':'mixe'};
  }
  function resetKeys(){Object.keys(KEYS).forEach(k=>delete KEYS[k]);Object.assign(KEYS,KEYS_DEF);store.set('keys',KEYS);window.Controllers&&Controllers.renderKeys&&Controllers.renderKeys();}
  function setCoachLevel(l){if(window.MixCoach&&MixCoach.state.el.lvl)MixCoach.setLevel(l);else{store.set('coachLevel',l);if(window.MixCoach)MixCoach.state.level=l;}}
  /* Applique un profil : disposition la plus proche du logiciel d'origine (sinon celle du niveau),
     niveau du coach en direct et, si demandé, raccourcis clavier d'origine. Utilisé aussi par l'accueil. */
  function applyProfile(p,o={}){
    const F=FROM(),from=F[p.from]?p.from:'',level=LEVELS[p.level]?p.level:'mixe';
    store.set('profile',{from,level});
    const k=from?F[from][1]:LEVELS[level].preset,pr=PRESETS[k];
    if(pr){layout.preset=k;layout.visible=new Set(pr.show);layout.coach=!!pr.coach;applyLayout();}
    setCoachLevel(LEVELS[level].coach);
    if(o.keys)resetKeys();
    if(!o.quiet)toast('Profil appliqué : disposition « '+(pr?pr.name:k)+' », coach '+(LEVELS[level].coach==='off'?'coupé':'« '+(LEVELS[level].coach==='debutant'?'Débutant':'Essentiel')+' »')+(o.keys?', raccourcis d’origine':''),'ok');
    if(isOpen())render();
    return{preset:k,coach:LEVELS[level].coach};
  }

  /* ---------- petits composants ---------- */
  const sel=(aria,opts,val,on,id)=>{const s=h('select',{class:'sel wide','aria-label':aria,id},opts.map(([k,n])=>h('option',{value:String(k)},n)));s.value=String(val);s.addEventListener('change',()=>on(s.value));return s;};
  const chk=(aria,val,on,id)=>{const c=h('input',{type:'checkbox','aria-label':aria,id});c.checked=!!val;c.addEventListener('change',()=>on(c.checked));return c;};
  const rng=(aria,min,max,step,val,on,fmt)=>{const out=h('b',{class:'pf-v'},fmt(val)),r=h('input',{type:'range',class:'pf-rng',min,max,step,value:val,'aria-label':aria});
    r.addEventListener('input',()=>{on(+r.value);out.textContent=fmt(+r.value);});return{el:h('div',{class:'pf-rr'},r,out),r,out};};
  const B=(txt,on,o={})=>h('button',{class:'b'+(o.cls?' '+o.cls:''),type:'button',id:o.id,title:o.title,onclick:on},txt);
  // une ligne : libellé, commande, explication ; kw = mots de plus pour la recherche
  const row=(label,ctl,tip,kw)=>{const r=h('div',{class:'pf-row'},h('div',{class:'pf-l'},h('span',{},label),tip?h('small',{},tip):null),h('div',{class:'pf-c'},ctl));
    r.dataset.s=norm([label,tip,kw].join(' '));return r;};
  const grp=(title,...rows)=>h('div',{class:'pf-g'},h('h3',{},title),...rows);
  const closeThen=fn=>()=>{close();fn();};

  /* ---------- onglets ---------- */
  const T={};
  T.profil=()=>{
    const p=profile(),F=FROM();
    const from=sel('Je mixe déjà sur',[['','Aucun logiciel (ou je découvre)'],...Object.entries(F).map(([k,[n,pk]])=>[k,n+' · disposition '+PRESETS[pk].name])],p.from,()=>{});
    const lvl=sel('Niveau',Object.entries(LEVELS).map(([k,l])=>[k,l.name]),p.level,()=>{});
    const keys=chk('Remettre les raccourcis clavier d’origine',true,()=>{});
    const apply=B('Appliquer ce profil',()=>applyProfile({from:from.value,level:lvl.value},{keys:keys.checked}),{cls:'go',id:'pf-apply'});
    const pr=Parcours.prog,nd=Object.keys(pr.done).length;
    return[grp('D’où tu pars',
      row('Je mixe déjà sur',from,'Mixlab reprend la disposition la plus proche, jamais les noms ni les logos de ces logiciels.','serato rekordbox traktor virtualdj logiciel'),
      row('Niveau',lvl,'Débutant : disposition École, coach complet. Je sais mixer : disposition Mix, coach essentiel. Pro : disposition Performance, coach coupé.','debutant pro coach'),
      row('Raccourcis clavier',h('label',{class:'pf-ck'},keys,'Revenir aux touches d’origine'),'Les touches que tu as changées sont remplacées.','clavier touches'),
      row('',apply,'Applique la disposition, le niveau du coach et, si coché, les raccourcis.')),
    grp('Premier lancement',
      row('Écran d’accueil',B('Revoir l’écran d’accueil',closeThen(()=>Parcours.welcome()),{id:'pf-welcome'}),'Le choix fait sur cet écran passe par ce même profil.','bienvenue accueil'),
      row('Progression du parcours',B('Remettre à zéro',resetParcours,{id:'pf-reset-parcours'}),nd+' chapitre'+(nd>1?'s':'')+' sur 14 réussi'+(nd>1?'s':'')+'. Demande une confirmation.','parcours progression effacer'))];
  };
  T.affichage=()=>{
    const preset=sel('Disposition',Object.entries(PRESETS).map(([k,p])=>[k,p.name]),layout.preset,v=>{const b=$('#presets button[data-p="'+v+'"]');if(b)b.click();render();},'pf-preset');
    const nd=sel('Nombre de platines',[[2,'2 platines'],[4,'4 platines']],S.numDecks,v=>{const b=$('#ndecks button[data-n="'+v+'"]');if(b)b.click();});
    const pans=h('div',{class:'pf-cks'},Object.entries(PANELS).map(([k,n])=>h('label',{class:'pf-ck'},chk('Panneau '+n,layout.visible.has(k),on=>{on?layout.visible.add(k):layout.visible.delete(k);applyLayout();}),n)));
    const key=layout.preset+':'+S.numDecks,sz=sel('Taille des platines',[['auto','Auto'],['full','Complètes'],['compact','Compactes'],['mini','Mini']],View.state.sizes[key]||'auto',v=>View.setSize(v));
    const zoom=sel('Zoom de l’interface',[.8,.9,1,1.1,1.2,1.3,1.4,1.5].map(z=>[z,Math.round(z*100)+' %']),View.zoom,v=>View.setZoom(+v,true));
    const wave=sel('Couleurs des waveforms',Object.entries(WAVE_MODES).map(([k,m])=>[k,m.name]),store.get('wave','3b'),v=>setWaveMode(v),'pf-wave');
    const wh=h('div',{class:'r fixed'},B('Moins haute',()=>View.waveHeight(-1)),B('Plus haute',()=>View.waveHeight(1)));
    const wz=h('div',{class:'r fixed'},B('Zoom −',()=>setZoom(ui.zoom*1.5),{title:'Voir plus de temps'}),B('Zoom +',()=>setZoom(ui.zoom/1.5),{title:'Voir moins de temps'}));
    return[grp('Disposition',
      row('Disposition',preset,PRESETS[layout.preset].title,'preset performance preparation studio mix ecole'),
      row('Nombre de platines',nd,'',''),
      row('Panneaux',pans,'','effets waveforms mixer bibliotheque'),
      row('Taille des platines',sz,'Pour ce preset. Aussi en cliquant sur l’en-tête d’une platine.','complete compacte mini'),
      row('Séparateurs et tailles',B('Disposition par défaut',()=>View.resetLayout()),'Remet les séparateurs et la taille des platines de ce preset.','reinitialiser')),
    grp('Lisibilité',
      row('Zoom de l’interface',zoom,'Agrandit tout, textes compris. Aussi Ctrl + et Ctrl −.','taille texte police zoom'),
      row('Mode scène',chk('Mode scène',View.state.stage,v=>View.setStage(v),'pf-stage'),'Contraste renforcé, waveforms plus hautes, gros chiffres. Touche F9.','theme contraste cabine sombre'),
      row('Effets repliés',chk('Effets repliés sur une ligne',View.state.fxFold,()=>View.toggleFxFold()),'La rangée des effets tient sur une ligne.','fx')),
    grp('Waveforms',
      row('Couleurs',wave,'3 bandes, RGB, monochrome à la couleur de la platine, ou palette pour daltoniens.','waveform couleurs daltonien rgb'),
      row('Hauteur',wh,'Aussi en glissant le séparateur sous les waveforms.','waveform hauteur'),
      row('Zoom',wz,'Aussi Ctrl + molette sur une waveform.','waveform zoom temps'))];
  };
  T.audio=()=>{
    const a=Desktop.audioControls();a.fill();
    const DP=DeckPro.P;
    const mv=rng('Volume du métronome',0,1,.01,DP.metroVol,v=>DeckPro.setPref('metroVol',v),v=>Math.round(v*100)+' %');
    return[grp('Sorties',
      row('Sortie master',a.master,'Ce que le public entend : enceintes, ou sortie master de ta table.','carte son enceintes'),
      row('Sortie casque',a.hp,'Sur une table DJ avec carte son, choisis sa sortie casque pour pré-écouter sans que la salle entende.','carte son headphones casque'),
      row('Split',chk('Split',S.split,v=>setSplit(v),'pf-split'),'Une seule carte son : casque à gauche, master à droite (câble répartiteur). Aussi le bouton Split du mixer.','casque cable repartiteur'),
      row('État',a.info,'','latence frequence echantillonnage')),
    grp('Casque et enregistrement',
      row('Métronome',mv.el,'Volume des clics du métronome (bouton Métro de chaque platine), au casque seulement.','metronome clic'),
      row('Format d’enregistrement',sel('Format d’enregistrement',DeckPro.REC_FORMATS,DP.recFormat,v=>DeckPro.setPref('recFormat',v)),'WAV : sans perte, enregistré sur ton disque à l’arrêt. WebM : fichier léger.','rec wav webm'))];
  };
  T.platines=()=>{
    const DP=DeckPro.P,set=k=>v=>DeckPro.setPref(k,v);
    const AM=window.AutoMix&&AutoMix.state;
    const r=[grp('Lecture',
      row('Bouton Cue',sel('Mode du bouton Cue',DeckPro.CUE_MODES,DP.cueMode,set('cueMode')),'Comme sur les lecteurs CDJ, Denon ou Numark.','cue cdj denon numark'),
      row('Sens du pitch',sel('Sens du pitch',[['down','En haut : plus lent'],['up','En haut : plus rapide']],DP.pitchDir,set('pitchDir')),'S’applique au pitch à l’écran et à celui de ta table.','tempo'),
      row('Plage du pitch',sel('Plage du pitch par défaut',[[8,'±8 %'],[16,'±16 %'],[50,'±50 %']],P.pitchRange,v=>{P.pitchRange=+v;save();decks.forEach(d=>d.setRange(P.pitchRange/100));}),'Pour toutes les platines, au démarrage. Chaque platine garde sa liste pour changer en jouant.','tempo range'),
      row('Sync calée sur',sel('Sync calée sur',[['beat','Le temps'],['bar','La mesure (4 temps)'],['phrase','La phrase (8 mesures)']],DP.syncUnit,set('syncUnit')),'Avec Sync, la platine qui démarre retombe sur le même temps de la mesure ou de la phrase.','synchro'),
      row('Key lock',chk('Key lock par défaut',P.keyLock,v=>{P.keyLock=v;save();decks.forEach(d=>d.setKeyLock(v));}),'Allumé sur toutes les platines au démarrage : la tonalité ne bouge pas quand tu changes le tempo.','tonalite master tempo'),
      row('Quantize',chk('Quantize',S.quantize,v=>{if(v!==S.quantize)$('#q-btn').click();}),'Cues, hot cues et boucles se calent sur le temps. Aussi dans la barre du haut.','grille'),
      row('Gain auto',chk('Gain auto',S.autoGain,v=>{if(v!==S.autoGain)$('#ag-btn').click();}),'Égalise le volume des morceaux au chargement. Aussi dans la barre du haut.','volume')),
    grp('Morceaux',
      row('Morceau suivant',h('label',{class:'pf-ck'},chk('Charger le morceau suivant',DP.autoNext,set('autoNext')),'Charger le morceau suivant à la fin'),'File de l’auto-mix, sinon la liste affichée.','auto chargement'),
      row('Plage d’analyse BPM',sel('Plage d’analyse BPM',Perf.BPM_RANGES.map(([k])=>[k,k.replace('-',' à ')+' BPM']),store.get('bpmRange','88-175'),v=>{Perf.setBpmRange(v);toast('Les prochains morceaux importés seront analysés entre '+v.replace('-',' et ')+' BPM','ok');}),'60-120 pour le hip-hop et le downtempo, 88-175 pour la house, 100-200 pour la drum and bass. S’applique aux morceaux importés ensuite.','tempo analyse'))];
    if(AM)r.push(grp('Auto-mix',
      row('Style de transition',sel('Style de l’auto-mix',Object.entries(AutoMix.STYLES),AM.style,v=>{AutoMix.setStyle(v);store.set('amStyle',v);}),'Auto choisit selon les deux morceaux.','automix basses filtre echo coupe'),
      row('Durée de transition',sel('Durée de l’auto-mix',[4,8,16,32].map(n=>[n,n+' mesures']),AM.bars,v=>{AutoMix.setBars(+v);store.set('amBars',+v);}),'','automix mesures'),
      row('Remplir la file',chk('Remplir la file de l’auto-mix',AM.fill,v=>{AM.fill=v;store.set('amFill',v);}),'Quand la file se vide, l’auto-mix y ajoute le meilleur morceau suivant.','automix file')));
    return r;
  };
  T.mixer=()=>{
    const DP=DeckPro.P;
    const shape=rng('Forme de la courbe du crossfader',0,1,.01,DP.xfShape,v=>DeckPro.setPref('xfShape',v),v=>v<.2?'Douce':v>.8?'Cut':Math.round(v*100)+' %');
    shape.el.hidden=S.curve!=='custom';
    const xfc=sel('Courbe du crossfader',[['mix','Mix'],['smooth','Douce'],['cut','Cut'],['custom','Réglable']],S.curve,v=>{DeckPro.setPref('xfCurve',v);shape.el.hidden=v!=='custom';});
    const q=rng('Résonance du filtre',.5,8,.1,DP.filterQ,v=>DeckPro.setPref('filterQ',v),v=>v.toFixed(1));
    const fb=v=>Math.abs(v)<.02?'Centre':(v<0?'G ':'D ')+Math.round(Math.abs(v)*100);
    const bl=rng('Balance du master',-1,1,.01,DP.balance,v=>DeckPro.setPref('balance',v),fb);
    bl.r.addEventListener('dblclick',()=>{bl.r.value='0';DeckPro.setPref('balance',0);bl.out.textContent='Centre';});
    regAbs('balance','Balance master',bl.el,v=>{DeckPro.setPref('balance',v*2-1);bl.r.value=String(DeckPro.P.balance);bl.out.textContent=fb(DeckPro.P.balance);},()=>(DeckPro.P.balance+1)/2);
    return[grp('Faders',
      row('Faders de voie',sel('Courbe des faders de voie',DeckPro.FADER_CURVES.map(([k,n])=>[k,n]),DP.faderCurve,v=>DeckPro.setPref('faderCurve',v)),'','courbe volume'),
      row('Crossfader',xfc,'Mix : les deux à fond au centre. Douce : fondu long. Cut : coupe nette pour le scratch. Réglable : choisis la forme. Aussi sous le crossfader.','courbe scratch'),
      row('Forme réglable',shape.el,'','crossfader courbe'),
      row('Crossfader inversé',chk('Crossfader inversé',DP.xfRev,v=>DeckPro.setPref('xfRev',v)),'Mode « hamster » : à gauche, tu entends la droite.','hamster')),
    grp('Égaliseur et filtre',
      row('Égaliseur',sel('Mode d’EQ',[['iso','EQ isolateur'],['classic','EQ classique']],S.eqMode,v=>{S.eqMode=v;store.set('eqMode',v);decks.forEach(applyMix);const m=$('#p-mixer select.eqm');if(m)m.value=v;}),'Isolateur : les potards coupent complètement la bande. Classique : plancher à -26 dB, comme un mixer de club.','eq kill'),
      row('Effet de voie',sel('Effet de voie',COLOR_FX,S.colorFx,v=>setColorFx(v)),'Ce que fait le potard Filtre de chaque voie.','color fx filtre bruit echo espace'),
      row('Résonance du filtre',q.el,'Plus elle est haute, plus le filtre siffle autour de sa fréquence.','filtre q')),
    grp('Master',
      row('Limiteur',chk('Limiteur du master',P.limiter,v=>{P.limiter=v;save();applyLimiter();}),'Évite la saturation du master. Le voyant LIM s’allume quand il travaille. À couper seulement si ta table ou ta sono limite déjà.','saturation lim clip'),
      row('Balance du master',bl.el,'Double-clic : retour au centre. L’enregistrement reste centré.','gauche droite'))];
  };
  T.controleurs=()=>{
    const kb=V.el.keys;
    return[grp('Contrôleurs MIDI',
      row('Fenêtre Contrôleur',B('Ouvrir la fenêtre Contrôleur',closeThen(()=>{$('#midi-modal').hidden=false;}),{id:'pf-midi'}),'Brancher, MIDI Learn, mapping actif, bibliothèque de mappings, horloge MIDI.','midi table controleur learn horloge'),
      row('Assistant de mapping',B('Lancer l’assistant',closeThen(()=>{if(!midi.access)connectMidi();Controllers.wizStart();}),{id:'pf-wiz'}),'Il apprend ta table en deux minutes, commande par commande.','midi mapping assistant')),
    kb?h('div',{class:'pf-g pf-kb'},h('h3',{},'Clavier'),(()=>{const r=h('div',{class:'pf-row pf-wide'},kb);r.dataset.s=norm('clavier raccourcis touches azerty qwerty qwertz disposition shortcut');return r;})()):null];
  };
  T.coach=()=>{
    const MC=window.MixCoach&&MixCoach.state,pr=Parcours.prog,nd=Object.keys(pr.done).length,st=Academie.stats();
    const fm=s=>s<60?Math.round(s)+' s':s<3600?Math.round(s/60)+' min':Math.floor(s/3600)+' h '+String(Math.round(s%3600/60)).padStart(2,'0');
    return[grp('Coach en direct',
      row('Conseils pendant le mix',sel('Niveau du coach en direct',[['debutant','Débutant (tout, astuces comprises)'],['essentiel','Essentiel'],['off','Coupé']],MC?MC.level:store.get('coachLevel','debutant'),v=>setCoachLevel(v),'pf-coach'),'Aussi dans le panneau Coach.','coach niveau conseils'),
      row('Conseils masqués',B('Réafficher les conseils masqués',()=>{if(MC)MC.muted.clear();toast('Les conseils masqués reviendront','ok');},{id:'pf-unmute'}),(MC?MC.muted.size:0)+' conseil(s) masqué(s) pendant cette session.','astuces tips')),
    grp('Parcours « De zéro à ton premier set »',
      row('Progression',h('span',{class:'pf-stat'},nd+' / 14 chapitres · '+fm(pr.time||0)+' · '+pr.badges.length+' badge'+(pr.badges.length>1?'s':'')),'','parcours'),
      row('',h('div',{class:'r fixed'},B('Ouvrir le parcours',closeThen(()=>Parcours.open())),B('Remettre à zéro',resetParcours)),'La remise à zéro demande une confirmation.','parcours effacer')),
    grp('Académie',
      row('Progression',h('span',{class:'pf-stat'},st.done+' / '+st.n+' leçons · '+st.okQ+' / '+st.nQ+' quiz'),'','academie lecons quiz'),
      row('',h('div',{class:'r fixed'},B('Ouvrir l’Académie',closeThen(()=>Academie.open())),B('Remettre à zéro',resetAcademie,{id:'pf-reset-academie'})),'La remise à zéro demande une confirmation.','academie effacer'))];
  };
  T.bibliotheque=()=>{
    const FIXED=['deck','title','load'],LS=LibPro.state;
    const cols=h('div',{class:'pf-cks'},COLS.filter(c=>!FIXED.includes(c.k)).map(c=>h('label',{class:'pf-ck'},chk('Colonne '+(c.n||'#'),!LibPro.hidden(c.k),on=>{if(on){LS.hide.delete(c.k);LS.show.add(c.k);}else{LS.hide.add(c.k);LS.show.delete(c.k);}store.set('libcols',[...LS.hide]);store.set('libcolsOn',[...LS.show]);renderTable();}),c.n||'#')));
    const cnt=h('span',{class:'pf-stat'},'…');
    Persist.count().then(n=>{cnt.textContent=n+' morceau'+(n>1?'x':'')+' en cache';}).catch(()=>{cnt.textContent='Cache indisponible';});
    return[grp('Table',
      row('Colonnes affichées',cols,'Titre, platine et Charger restent toujours visibles. Aussi le bouton Colonnes de la bibliothèque.','colonnes table')),
    grp('Analyse',
      row('Cache d’analyse',cnt,'BPM, grille, tonalité, waveform et structure déjà calculés : un morceau réimporté s’ouvre tout de suite.','bpm tonalite cache'),
      row('',B('Vider le cache d’analyse',clearCache,{id:'pf-clear-cache'}),'Demande une confirmation. Tes morceaux, cues et playlists sont gardés.','cache effacer'),
      row('Plage d’analyse BPM',B('Régler dans Platines',()=>show('platines')),'','bpm'))];
  };
  T.avance=()=>{
    const fi=h('input',{type:'file',accept:'.json,application/json',hidden:true,id:'pf-import-file'});
    fi.addEventListener('change',()=>{const f=fi.files[0];if(!f)return;f.text().then(t=>importText(t));fi.value='';});
    return[grp('Sauvegarde des réglages',
      row('Exporter',B('Exporter mes réglages',exportFile,{id:'pf-export'}),'Un fichier JSON avec la disposition, les réglages, les mappings et les raccourcis. Pas la bibliothèque ni la progression.','sauvegarde json fichier'),
      row('Importer',h('div',{},B('Importer un fichier',()=>fi.click(),{id:'pf-import'}),fi),'Remplace tes réglages actuels, puis l’appli redémarre.','restaurer json fichier'),
      row('Tout réinitialiser',B('Réinitialiser tous les réglages',resetAll,{id:'pf-reset-all',cls:'pf-danger'}),'Comme au premier lancement. Demande une confirmation. Ta bibliothèque et ta progression sont gardées.','reset defaut usine')),
    V.el.mapTxt?h('div',{class:'pf-g'},h('h3',{},'Mapping MIDI en texte'),(()=>{const r=h('div',{class:'pf-row pf-wide'},V.el.mapTxt);r.dataset.s=norm('mapping midi json texte copier importer partager');return r;})()):null];
  };

  /* ---------- actions ---------- */
  function resetParcours(){
    if(!confirm('Effacer toute ta progression dans le parcours ?'))return;
    Parcours.resetProgress();toast('Progression du parcours remise à zéro','ok');if(isOpen())render();
  }
  function resetAcademie(){
    if(!confirm('Effacer toute ta progression dans l’Académie ?'))return;
    Academie.resetProgress();toast('Progression de l’Académie remise à zéro','ok');if(isOpen())render();
  }
  async function clearCache(){
    if(!confirm('Vider le cache d’analyse ? Les morceaux seront réanalysés à leur prochain import.'))return;
    try{await Persist.clear();toast('Cache d’analyse vidé','ok');}catch(e){toast('Impossible de vider le cache');}
    if(isOpen())render();
  }
  function snapshot(){
    try{window.Persist&&Persist.fxSave();}catch(e){}
    const o={};for(const k of SETTINGS){const v=localStorage.getItem('mixlab2.'+k);if(v!=null)try{o[k]=JSON.parse(v);}catch(e){}}
    return o;
  }
  function exportText(){return JSON.stringify({format:'mixlab-preferences',version:1,date:new Date().toISOString(),settings:snapshot()},null,1);}
  function exportFile(){
    const d=new Date(),p=n=>String(n).padStart(2,'0');
    LibPro.saveFile('mixlab-reglages-'+d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'.json',exportText(),'application/json');
  }
  /* Écrit les réglages et redémarre. Les modules réécrivent certains réglages en quittant la page
     (effets) : on réécrit les nôtres après eux, à la fermeture. */
  function commit(settings){
    const w=()=>{for(const k of SETTINGS){try{if(settings[k]!==undefined&&settings[k]!==null)localStorage.setItem('mixlab2.'+k,JSON.stringify(settings[k]));else localStorage.removeItem('mixlab2.'+k);}catch(e){}}};
    w();addEventListener('beforeunload',w);addEventListener('pagehide',w);
    V.committed=settings;
    if(!V.noReload)location.reload();
  }
  function importText(t,o={}){
    let j;try{j=JSON.parse(t);}catch(e){j=null;}
    if(!j||j.format!=='mixlab-preferences'||!j.settings||typeof j.settings!=='object'){toast('Ce fichier n’est pas un export de réglages Mixlab.');return false;}
    if(!o.yes&&!confirm('Remplacer tes réglages par ceux de ce fichier ? L’appli va redémarrer.'))return false;
    const s={};for(const k of SETTINGS)if(k in j.settings)s[k]=j.settings[k];
    commit(s);return true;
  }
  function resetAll(){
    if(!confirm('Remettre tous les réglages comme au premier lancement ? Ta bibliothèque et ta progression sont gardées. L’appli va redémarrer.'))return;
    commit({});
  }

  /* ---------- fenêtre ---------- */
  const isOpen=()=>!!V.el.modal&&!V.el.modal.hidden;
  function build(){
    const m=V.el.modal=h('div',{class:'modal',id:'prefs',hidden:true});
    V.el.q=h('input',{type:'search',class:'pf-q',id:'prefs-q',placeholder:'Rechercher un réglage','aria-label':'Rechercher un réglage'});
    V.el.q.addEventListener('input',()=>{V.q=V.el.q.value;filter();});
    V.el.tabs=h('nav',{class:'pf-tabs',role:'tablist','aria-label':'Catégories'},TABS.map(([k,n])=>h('button',{type:'button',role:'tab','data-tab':k,id:'pf-tab-'+k,onclick:()=>show(k)},n)));
    V.el.body=h('div',{class:'pf-body'});
    V.el.empty=h('p',{class:'pf-empty',hidden:true},'Aucun réglage ne correspond.');
    m.append(h('div',{class:'mbox pf',role:'dialog','aria-label':'Préférences'},
      h('h2',{},'Préférences',h('button',{class:'b',type:'button',id:'prefs-close',onclick:close},'Fermer')),
      h('div',{class:'pf-main'},h('div',{class:'pf-side'},V.el.q,V.el.tabs),h('div',{class:'pf-pane'},V.el.empty,V.el.body))));
    m.addEventListener('click',e=>{if(e.target===m)close();});
    document.body.append(m);
  }
  function render(){
    const b=V.el.body;if(!b)return;
    // les blocs déplacés ici (clavier, mapping en texte) sont retirés avant de vider la fenêtre
    [V.el.keys,V.el.mapTxt].forEach(x=>{if(x&&x.parentNode)x.remove();});
    b.innerHTML='';
    for(const[k,n]of TABS){
      let kids=[];try{kids=T[k]().filter(Boolean);}catch(e){console.warn('Prefs',k,e);kids=[h('p',{class:'pf-empty'},'Indisponible.')];}
      b.append(h('section',{class:'pf-sec',role:'tabpanel','data-tab':k,'aria-labelledby':'pf-tab-'+k},h('h4',{class:'pf-sh'},n),...kids));
    }
    filter();
  }
  function filter(){
    const q=norm(V.q).trim(),words=q.split(/\s+/).filter(Boolean),all=!!words.length;
    V.el.modal.classList.toggle('pf-search',all);let any=false;
    $$('.pf-sec',V.el.body).forEach(sec=>{
      const tn=norm(TABS.find(t=>t[0]===sec.dataset.tab)[1]);let n=0;
      $$('.pf-row',sec).forEach(r=>{const ok=!all||words.every(w=>r.dataset.s.includes(w)||tn.includes(w));r.hidden=!ok;if(ok)n++;});
      $$('.pf-g',sec).forEach(g=>{g.hidden=all&&!$$('.pf-row',g).some(r=>!r.hidden);});
      sec.hidden=all?!n:sec.dataset.tab!==V.tab;if(all&&n)any=true;
    });
    V.el.empty.hidden=!all||any;
    $$('button',V.el.tabs).forEach(t=>{const on=!all&&t.dataset.tab===V.tab;t.setAttribute('aria-selected',String(on));t.tabIndex=on||all?0:-1;});
  }
  function show(tab){if(!TABS.some(t=>t[0]===tab))tab='profil';V.tab=tab;V.q='';if(V.el.q)V.el.q.value='';filter();}
  function open(tab){
    if(!V.el.modal)return;
    if(window.View)View.closeMenus();
    if(tab)V.tab=TABS.some(t=>t[0]===tab)?tab:'profil';
    V.q='';V.el.q.value='';
    render();V.el.modal.hidden=false;
    const t=$('#pf-tab-'+V.tab);if(t)t.focus();
  }
  function close(){if(V.el.modal)V.el.modal.hidden=true;Controllers.kcap&&(Controllers.kcap=null);}

  /* ---------- démarrage ---------- */
  function init(){
    if(V.built)return;V.built=true;
    build();applyDecks();
    // Le clavier et le mapping en texte quittent la fenêtre Contrôleur : leur place est ici.
    const kl=$('#key-list');V.el.keys=kl?kl.parentElement:null;
    if(V.el.keys&&$('#midi-modal').contains(V.el.keys)){
      V.el.keys.classList.add('pf-keys');const h3=$(':scope>h3',V.el.keys);if(h3)h3.remove();
      V.el.keys.replaceWith(h('div',{class:'pf-goto'},h('h3',{},'Clavier'),h('p',{},'Les raccourcis clavier et la disposition de ton clavier sont dans les Préférences.'),
        h('button',{class:'b',type:'button',id:'midi-keys-prefs',onclick:()=>{$('#midi-modal').hidden=true;open('controleurs');}},'Raccourcis clavier…')));
    }
    const ta=$('#map-json');
    if(ta&&$('#midi-modal').contains(ta)){
      const acts=ta.nextElementSibling;V.el.mapTxt=h('div',{class:'pf-map'},h('p',{class:'pf-tip'},'Le mapping actif en texte, pour le copier dans un message ou en coller un. Le plus simple reste la fenêtre Contrôleur (Exporter, Importer un fichier).'),ta,acts);
    }
    render();
    // entrée dans la barre du haut
    const top=$('#top'),coach=$('#coach-btn');
    if(top&&!$('#prefs-btn')){
      const b=h('button',{class:'tb',id:'prefs-btn',type:'button',title:'Préférences : tous les réglages (Ctrl+,)',onclick:()=>open()},'Préférences');
      if(coach&&coach.parentElement===top)coach.after(b);else top.append(b);
    }
    document.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key===','||e.code==='Comma')){e.preventDefault();if(isOpen())close();else open();}
    });
    navigator.mediaDevices&&navigator.mediaDevices.addEventListener&&navigator.mediaDevices.addEventListener('devicechange',()=>{if(isOpen()&&V.tab==='audio')render();});
  }

  /* ---------- styles (jetons de :root seulement) ---------- */
  document.head.append(h('style',{},`
.mbox.pf{width:min(980px,100%);height:min(680px,90vh);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}
.pf-main{display:grid;grid-template-columns:220px minmax(0,1fr);gap:var(--sp-4);min-height:0}
.pf-side{display:grid;align-content:start;gap:var(--sp-2);min-height:0}
.pf-q{background:var(--surface-0);border:1px solid var(--line-2);border-radius:var(--r-1);height:30px;padding:0 var(--sp-2);font-size:var(--fs-2);color:var(--text-hi);width:100%}
.pf-tabs{display:grid;gap:2px}
.pf-tabs button{all:unset;cursor:pointer;padding:7px 10px;border-radius:var(--r-1);font:500 var(--fs-2) var(--ui);color:var(--text-mid)}
.pf-tabs button:hover{background:var(--surface-3)}
.pf-tabs button[aria-selected="true"]{background:var(--surface-3);color:var(--text-hi);box-shadow:inset 2px 0 0 var(--coach)}
.pf-tabs button:focus-visible{outline:1px solid var(--coach)}
.pf-pane{overflow:auto;min-height:0;padding-right:var(--sp-1)}
.pf-sh{display:none;margin:var(--sp-3) 0 var(--sp-1);font:700 var(--fs-1) var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--coach)}
.pf-search .pf-sh{display:block}
.pf-g{margin:0 0 var(--sp-4)}
.pf-g h3{margin:0 0 var(--sp-1);font:600 var(--fs-1) var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--text-lo)}
.pf-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:var(--sp-3);align-items:center;padding:var(--sp-2) 0;border-top:1px solid var(--line-1)}
.pf-row.pf-wide{grid-template-columns:minmax(0,1fr)}
.pf-l{display:grid;gap:2px;font-size:var(--fs-2);color:var(--text-hi)}
.pf-l small{font:400 var(--fs-1)/1.4 var(--ui);color:var(--text-lo)}
.pf-c{min-width:0;display:flex;align-items:center;gap:var(--sp-2);flex-wrap:wrap}
.pf-c select.sel{height:26px;font-size:var(--fs-2);width:100%;max-width:340px}
.pf-c .b{height:26px;font-size:var(--fs-2)}
.pf-ck{display:inline-flex;gap:6px;align-items:center;font-size:var(--fs-2);color:var(--text-mid);cursor:pointer}
.pf-cks{display:flex;flex-wrap:wrap;gap:var(--sp-1) var(--sp-3)}
.pf-rr{display:flex;gap:var(--sp-2);align-items:center;width:100%;max-width:340px}
.pf-rng{flex:1;accent-color:var(--coach)}
.pf-v{font:600 var(--fs-1) var(--num);color:var(--text-hi);min-width:52px;text-align:right}
.pf-stat{font:500 var(--fs-2) var(--num);color:var(--text-hi)}
.pf-danger{color:var(--state-bad);border-color:var(--state-bad)}
.pf-empty,.pf-tip{font:400 var(--fs-2)/1.45 var(--ui);color:var(--text-lo);margin:0 0 var(--sp-2)}
.pf-map textarea{width:100%;min-height:120px}
.pf-c .lat{margin:0;font-size:var(--fs-2);color:var(--text-mid)}
@media (max-width:720px){.pf-main{grid-template-columns:minmax(0,1fr)}.pf-tabs{grid-auto-flow:column;overflow-x:auto}.pf-row{grid-template-columns:minmax(0,1fr)}}
`));

  return{init,open,close,show,render,applyProfile,profile,exportText,importText,resetAll,commit,snapshot,SETTINGS,LEVELS,TABS,P,DEF,
    get isOpen(){return isOpen();},get tab(){return V.tab;},state:V};
})();
