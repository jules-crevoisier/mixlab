'use strict';
// Test de la fenêtre Préférences (prefs.js) : ouverture par le bouton, le menu Affichage et Ctrl+,,
// chaque onglet, la recherche, le profil (repris de l'accueil puis changé), la persistance après
// rechargement, l'export et l'import d'un fichier, la remise à zéro, et les anciennes entrées
// (Audio, Réglages de jeu, clavier, mapping en texte) qui mènent au bon onglet.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); p.on('dialog', d => d.accept()); };
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const page = await context.newPage();
  watch(page);
  const W = (f, a) => page.evaluate(f, a);
  const ready = async () => {
    await page.waitForFunction(() => typeof LIB !== 'undefined' && LIB.tracks.length >= 4 && window.Prefs && Prefs.state.built && document.querySelector('#prefs-btn'), null, { timeout: 60000 });
    await page.mouse.click(683, 5);
    await W(() => { const w = document.querySelector('.pc-wel'); if (w) w.remove(); });
  };
  const wait = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await W(fn)) return true; await sleep(80); } return false; };
  const isOpen = () => W(() => !document.querySelector('#prefs').hidden);
  const visible = sel => page.isVisible(sel);
  const reload = async () => { await page.reload(); await ready(); };

  await page.goto(url);
  await ready();

  /* ---------- 1. Ouverture : bouton de la barre du haut, menu Affichage, Ctrl+, ; Échap ferme ---------- */
  // le bouton peut être rangé dans « ⋯ » si la barre manque de place : il reste à un clic
  if (!(await visible('#prefs-btn'))) await page.click('#top-more > summary');
  await page.click('#prefs-btn');
  check(await isOpen() && await W(() => Prefs.tab === 'profil' && document.querySelector('#pf-tab-profil').getAttribute('aria-selected') === 'true'), 'Bouton Préférences : la fenêtre s’ouvre sur Profil');
  await page.keyboard.press('Escape');
  check(!(await isOpen()), 'Échap ferme les Préférences');
  await page.keyboard.press('Control+Comma');
  check(await isOpen(), 'Ctrl+, ouvre les Préférences');
  await page.keyboard.press('Control+Comma');
  check(!(await isOpen()), 'Ctrl+, une deuxième fois les referme');
  await page.click('#top details.menu > summary');
  check(await visible('#prefs-menu') && !(await W(() => !!document.querySelector('#dp-open'))), 'Menu Affichage : « Préférences… » remplace « Réglages de jeu… »');
  check(await W(() => !document.querySelector('#panels-pop select[aria-label="Couleurs des waveforms"]') && !document.querySelector('#panels-pop select[aria-label="Plage d’analyse BPM"]')), 'Menu Affichage : plus de couleurs de waveform ni de plage BPM (une seule maison, les Préférences)');
  await page.click('#prefs-menu');
  check(await isOpen() && await W(() => Prefs.tab === 'affichage') && !(await W(() => !!document.querySelector('#top details[open]'))), 'Menu Affichage › Préférences… : ouvre l’onglet Affichage et referme le menu');

  /* ---------- 2. Chaque onglet s'affiche ---------- */
  const tabs = await W(() => Prefs.TABS.map(t => t[0]));
  check(tabs.join() === 'profil,affichage,audio,platines,mixer,controleurs,coach,bibliotheque,avance', 'Neuf onglets', tabs.join());
  for (const t of tabs) {
    await page.click('#pf-tab-' + t);
    const r = await W(t => { const sec = document.querySelector(`#prefs .pf-sec[data-tab="${t}"]`), others = [...document.querySelectorAll('#prefs .pf-sec')].filter(s => s !== sec && !s.hidden).length;
      const rows = sec ? [...sec.querySelectorAll('.pf-row')].filter(r => r.offsetParent).length : 0;
      return { shown: !!sec && !sec.hidden, rows, others, bad: /Indisponible/.test(sec ? sec.textContent : ''), sel: document.querySelector('#pf-tab-' + t).getAttribute('aria-selected') }; }, t);
    check(r.shown && r.rows >= 2 && !r.others && !r.bad && r.sel === 'true', `Onglet ${t} : affiché seul, ${r.rows} réglages`, JSON.stringify(r));
  }
  const fits = await W(() => { const r = document.querySelector('#prefs .mbox').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.left >= 0; });
  check(fits, 'La fenêtre tient dans 1366×768');
  await page.screenshot({ path: '/tmp/mixlab-prefs.png' });

  /* ---------- 3. Recherche ---------- */
  await page.fill('#prefs-q', 'crossfader');
  const s1 = await W(() => { const vis = [...document.querySelectorAll('#prefs .pf-row')].filter(r => r.offsetParent);
    return { n: vis.length, all: vis.every(r => r.dataset.s.includes('crossfader')), secs: [...document.querySelectorAll('#prefs .pf-sec')].filter(s => !s.hidden).map(s => s.dataset.tab) }; });
  check(s1.n >= 2 && s1.all && s1.secs.includes('mixer') && !s1.secs.includes('profil') && !s1.secs.includes('audio'), 'Recherche « crossfader » : seulement les réglages du crossfader, onglet Mixer', JSON.stringify(s1));
  await page.fill('#prefs-q', 'LATENCE');
  check(await W(() => { const v = [...document.querySelectorAll('#prefs .pf-row')].filter(r => r.offsetParent); return v.length >= 1 && v.every(r => r.closest('.pf-sec').dataset.tab === 'audio'); }), 'Recherche sans tenir compte de la casse : « LATENCE » trouve l’état audio');
  await page.fill('#prefs-q', 'raccourcis');
  check(await W(() => { const k = document.querySelector('#key-list'); return !!k && !!k.offsetParent; }), 'Recherche « raccourcis » : l’éditeur du clavier apparaît');
  await page.fill('#prefs-q', 'zzzqqq');
  check(await visible('#prefs .pf-empty') && await W(() => ![...document.querySelectorAll('#prefs .pf-row')].some(r => r.offsetParent)), 'Recherche sans résultat : message « Aucun réglage ne correspond »');
  await page.fill('#prefs-q', '');
  check(await W(() => [...document.querySelectorAll('#prefs .pf-sec')].filter(s => !s.hidden).map(s => s.dataset.tab).join() === Prefs.tab), 'Recherche vidée : on revient à l’onglet courant');
  await page.keyboard.press('Escape');

  /* ---------- 4. Anciennes entrées : elles mènent au bon onglet ---------- */
  if (!(await visible('#audio-btn'))) await page.click('#top-more > summary');
  await page.click('#audio-btn');
  check(await isOpen() && await W(() => Prefs.tab === 'audio') && await visible('#prefs select[aria-label="Sortie master"]') && !(await W(() => !!document.querySelector('#audio-modal'))), 'Bouton Audio : ouvre Préférences › Audio (plus de fenêtre Audio séparée)');
  check(await W(() => /Latence de sortie : \d+ ms/.test(document.querySelector('#prefs .lat').textContent)), 'Audio : latence affichée', await W(() => document.querySelector('#prefs .lat').textContent));
  await page.keyboard.press('Escape');
  await W(() => DeckPro.openSettings());
  check(await isOpen() && await W(() => Prefs.tab === 'platines') && !(await W(() => !!document.querySelector('#dp-modal'))), 'Réglages de jeu : ouvrent Préférences › Platines');
  await page.keyboard.press('Escape');
  await page.click('#p-mixer details.mxset > summary');
  await page.click('#mx-prefs');
  check(await isOpen() && await W(() => Prefs.tab === 'mixer'), 'Mixer › Réglages › « Tous les réglages du mixer… » : onglet Mixer');
  check(await W(() => !!document.querySelector('#prefs #map-json') && !document.querySelector('#midi-modal #map-json') && !!document.querySelector('#prefs #key-list') && !document.querySelector('#midi-modal #key-list') && !!document.querySelector('#midi-modal #midi-keys-prefs')),
    'Le JSON du mapping passe dans Avancé, le clavier dans Contrôleurs et clavier ; la fenêtre Contrôleur y renvoie');
  await page.click('#pf-tab-controleurs');
  await page.click('#pf-midi');
  check(await W(() => document.querySelector('#prefs').hidden && !document.querySelector('#midi-modal').hidden), 'Contrôleurs et clavier › Ouvrir la fenêtre Contrôleur');
  await page.keyboard.press('Escape');
  check(await W(() => document.querySelector('#midi-modal').hidden), 'Échap ferme la fenêtre Contrôleur');

  /* ---------- 5. Profil : repris de l'accueil, puis changé après le lancement ---------- */
  await page.goto('about:blank'); await page.goto(url + '#welcome');
  await page.waitForFunction(() => typeof LIB !== 'undefined' && LIB.tracks.length >= 4 && window.Prefs && Prefs.state.built && document.querySelector('.pc-wel'), null, { timeout: 60000 });
  await page.click('#pc-from-rekordbox');
  check(await W(() => layout.preset === 'export' && JSON.stringify(store.get('profile')) === JSON.stringify({ from: 'rekordbox', level: 'mixe' }) && MixCoach.state.level === 'essentiel'), 'Accueil « rekordbox » : écrit par le profil des Préférences (disposition Préparation, coach essentiel)', await W(() => JSON.stringify([layout.preset, store.get('profile'), MixCoach.state.level])));
  await W(() => Prefs.open());
  check(await W(() => document.querySelector('#prefs select[aria-label="Je mixe déjà sur"]').value === 'rekordbox' && document.querySelector('#prefs select[aria-label="Niveau"]').value === 'mixe'), 'Profil : le choix de l’accueil est affiché');
  await W(() => { KEYS.KeyM = 'A.play'; delete KEYS.KeyQ; store.set('keys', KEYS); });
  await page.selectOption('#prefs select[aria-label="Je mixe déjà sur"]', 'traktor');
  await page.selectOption('#prefs select[aria-label="Niveau"]', 'pro');
  await page.click('#pf-apply');
  const p1 = await W(() => ({ preset: layout.preset, coach: MixCoach.state.level, keys: KEYS.KeyQ === 'A.play' && !KEYS.KeyM, prof: store.get('profile'), btn: document.querySelector('#presets button[data-p="studio"]').getAttribute('aria-pressed') }));
  check(p1.preset === 'studio' && p1.btn === 'true' && p1.coach === 'off' && p1.keys && p1.prof.from === 'traktor' && p1.prof.level === 'pro', 'Profil Traktor + Pro : disposition Studio, coach coupé, raccourcis d’origine', JSON.stringify(p1));
  await page.selectOption('#prefs select[aria-label="Je mixe déjà sur"]', 'serato');
  await page.selectOption('#prefs select[aria-label="Niveau"]', 'mixe');
  await page.uncheck('#prefs input[aria-label="Remettre les raccourcis clavier d’origine"]');
  await W(() => { KEYS.KeyM = 'B.play'; });
  await page.click('#pf-apply');
  check(await W(() => layout.preset === 'perf' && MixCoach.state.level === 'essentiel' && KEYS.KeyM === 'B.play'), 'Profil Serato : disposition Performance, raccourcis gardés si la case est décochée');
  await page.selectOption('#prefs select[aria-label="Je mixe déjà sur"]', '');
  await page.selectOption('#prefs select[aria-label="Niveau"]', 'debutant');
  await page.click('#pf-apply');
  check(await W(() => layout.preset === 'ecole' && MixCoach.state.level === 'debutant' && layout.coach), 'Sans logiciel, niveau Débutant : disposition École avec le coach');
  await page.selectOption('#prefs select[aria-label="Je mixe déjà sur"]', 'virtualdj');
  await page.click('#pf-apply');
  await page.goto('about:blank'); await page.goto(url); await ready();
  check(await W(() => layout.preset === 'mix' && store.get('profile').from === 'virtualdj'), 'Profil retrouvé après relance (VirtualDJ : disposition Mix)');
  // Revoir l'écran d'accueil : le choix repasse par le profil
  await W(() => Prefs.open('profil'));
  await page.click('#pf-welcome');
  check(await visible('.pc-wel') && !(await isOpen()), 'Profil › Revoir l’écran d’accueil');
  await page.click('#pc-from-serato');
  check(await W(() => layout.preset === 'perf' && store.get('profile').from === 'serato' && store.get('welcome') === 'serato'), 'Accueil rejoué : Serato appliqué par le profil');

  /* ---------- 6. Les réglages tiennent après rechargement ---------- */
  await W(() => Prefs.open('affichage'));
  await page.selectOption('#prefs select[aria-label="Couleurs des waveforms"]', 'cvd');
  await page.check('#prefs input[aria-label="Mode scène"]');
  await page.selectOption('#prefs select[aria-label="Zoom de l’interface"]', '1.1');
  await page.click('#pf-tab-platines');
  await page.selectOption('#prefs select[aria-label="Mode du bouton Cue"]', 'numark');
  await page.selectOption('#prefs select[aria-label="Plage du pitch par défaut"]', '16');
  await page.check('#prefs input[aria-label="Key lock par défaut"]');
  await page.selectOption('#prefs select[aria-label="Plage d’analyse BPM"]', '60-120');
  await page.selectOption('#prefs select[aria-label="Style de l’auto-mix"]', 'echo');
  await page.click('#pf-tab-mixer');
  await page.selectOption('#prefs select[aria-label="Mode d’EQ"]', 'classic');
  await page.uncheck('#prefs input[aria-label="Limiteur du master"]');
  await page.selectOption('#prefs select[aria-label="Courbe du crossfader"]', 'cut');
  await page.click('#pf-tab-coach');
  await page.selectOption('#prefs select[aria-label="Niveau du coach en direct"]', 'essentiel');
  await page.click('#pf-tab-bibliotheque');
  await page.uncheck('#prefs input[aria-label="Colonne Genre"]');
  const live = await W(() => ({ band: BAND.name, stage: document.documentElement.classList.contains('stage'), zoom: View.zoom, pr: decks.map(d => d.pitchRange), kl: decks.every(d => d.keyLock), lim: bus.lim.ratio.value, eq: S.eqMode, eqUi: document.querySelector('#p-mixer select.eqm').value, xf: S.curve, xfUi: document.querySelector('#p-mixer select[aria-label="Courbe du crossfader"]').value, genre: LibPro.hidden('genre'), coachUi: document.querySelector('#coach-direct select').value }));
  check(live.band === 'Daltonien' && live.stage && live.zoom === 1.1 && live.pr.every(r => r === .16) && live.kl && live.lim === 1 && live.eq === 'classic' && live.eqUi === 'classic' && live.xf === 'cut' && live.xfUi === 'cut' && live.genre && live.coachUi === 'essentiel',
    'Chaque réglage s’applique tout de suite, et les commandes du mixer et du coach suivent', JSON.stringify(live));
  await page.keyboard.press('Escape');
  await reload();
  const kept = await W(() => ({ band: BAND.name, stage: document.documentElement.classList.contains('stage'), zoom: View.zoom, cue: DeckPro.P.cueMode, pr: decks.map(d => d.pitchRange), kl: decks.every(d => d.keyLock), lim: bus.lim.ratio.value, eq: S.eqMode, xf: S.curve, bpm: S.bpmRange.join('-'), am: AutoMix.state.style, coach: MixCoach.state.level, genre: LibPro.hidden('genre') }));
  check(kept.band === 'Daltonien' && kept.stage && kept.zoom === 1.1 && kept.cue === 'numark' && kept.pr.every(r => r === .16) && kept.kl && kept.lim === 1 && kept.eq === 'classic' && kept.xf === 'cut' && kept.bpm === '60-120' && kept.am === 'echo' && kept.coach === 'essentiel' && kept.genre,
    'Après rechargement : tout est retrouvé', JSON.stringify(kept));
  await W(() => Prefs.open('platines'));
  check(await W(() => document.querySelector('#prefs select[aria-label="Mode du bouton Cue"]').value === 'numark' && document.querySelector('#prefs select[aria-label="Plage du pitch par défaut"]').value === '16' && document.querySelector('#prefs input[aria-label="Key lock par défaut"]').checked), 'La fenêtre relit les valeurs gardées');

  /* ---------- 7. Export puis import d'un fichier ---------- */
  await page.click('#pf-tab-avance');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#pf-export')]);
  const file = '/tmp/mixlab-prefs-export.json';
  await dl.saveAs(file);
  const ex = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(ex.format === 'mixlab-preferences' && ex.version === 1 && /^mixlab-reglages-\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()) && ex.settings.wave === 'cvd' && ex.settings.deckpro.cueMode === 'numark' && ex.settings.prefs.limiter === false && !('parcours' in ex.settings) && !('academie' in ex.settings),
    'Export : fichier JSON avec les réglages, sans la progression', dl.suggestedFilename());
  // on change tout, puis on réimporte le fichier
  await W(() => { setWaveMode('rgb'); DeckPro.setPref('cueMode', 'cdj'); Prefs.P.limiter = true; store.set('prefs', Prefs.P); store.set('eqMode', 'iso'); });
  const nav = page.waitForNavigation();
  await page.setInputFiles('#pf-import-file', file);
  await nav; await ready();
  const imp = await W(() => ({ band: BAND.name, cue: DeckPro.P.cueMode, lim: bus.lim.ratio.value, eq: S.eqMode, coach: MixCoach.state.level, prof: store.get('profile') }));
  check(imp.band === 'Daltonien' && imp.cue === 'numark' && imp.lim === 1 && imp.eq === 'classic' && imp.coach === 'essentiel' && imp.prof.from === 'serato', 'Import : l’appli redémarre avec les réglages du fichier (aller-retour exact)', JSON.stringify(imp));
  check(await W(ex => Object.keys(ex).every(k => JSON.stringify(Prefs.snapshot()[k]) === JSON.stringify(ex[k]) || k === 'fx' || k === 'splits'), ex.settings), 'Aller-retour : chaque clé exportée est retrouvée à l’identique');
  const bad = await W(() => Prefs.importText('{"pas":"un export"}', { yes: true }));
  check(bad === false && await W(() => [...document.querySelectorAll('.toast')].some(t => /pas un export de réglages/.test(t.textContent))), 'Import d’un fichier qui n’est pas un export : refusé avec un message');

  /* ---------- 8. Progression et cache : remises à zéro avec confirmation ---------- */
  await W(() => { Parcours.prog.done = { 0: true, 1: true }; store.set('parcours', Parcours.prog); Academie.prog.done = { x: true }; store.set('academie', Academie.prog); });
  await W(() => Prefs.open('coach'));
  check(await W(() => /2 \/ 14 chapitres/.test(document.querySelector('#prefs .pf-sec[data-tab="coach"]').textContent)), 'Coach et apprentissage : progression du parcours affichée');
  await W(() => Prefs.open('profil'));
  await page.click('#pf-reset-parcours');
  check(await W(() => Object.keys(Parcours.prog.done).length === 0 && Object.keys(store.get('parcours').done).length === 0), 'Profil › Remettre à zéro la progression du parcours (après confirmation)');
  await W(() => Prefs.open('coach'));
  await page.click('#pf-reset-academie');
  check(await W(() => Object.keys(Academie.prog.done).length === 0), 'Coach et apprentissage › Remettre l’Académie à zéro');
  // une analyse en cache, écrite comme le fait persist.js
  await W(() => new Promise(ok => { const r = indexedDB.open('mixlab-analyse', 1); r.onupgradeneeded = () => { const s = r.result.createObjectStore('ana', { keyPath: 'fp' }); s.createIndex('used', 'used'); };
    r.onsuccess = () => { const tx = r.result.transaction('ana', 'readwrite'); tx.objectStore('ana').put({ fp: 'test.1', used: Date.now() }); tx.oncomplete = () => { r.result.close(); ok(); }; }; }));
  await W(() => Prefs.open('bibliotheque'));
  check(await wait(() => /^[1-9]\d* morceaux? en cache/.test(document.querySelector('#prefs .pf-sec[data-tab="bibliotheque"] .pf-stat').textContent)), 'Bibliothèque : taille du cache d’analyse affichée', await W(() => document.querySelector('#prefs .pf-sec[data-tab="bibliotheque"] .pf-stat').textContent));
  await page.click('#pf-clear-cache');
  check(await wait(async () => (await Persist.count()) === 0), 'Bibliothèque › Vider le cache d’analyse (après confirmation)');
  // refus de la confirmation : rien ne change
  await W(() => { Parcours.prog.done = { 3: true }; });
  page.removeAllListeners('dialog'); page.on('dialog', d => d.dismiss());
  await W(() => Prefs.open('profil'));
  await page.click('#pf-reset-parcours');
  check(await W(() => Parcours.prog.done[3] === true), 'Confirmation refusée : la progression reste');
  page.removeAllListeners('dialog'); page.on('dialog', d => d.accept());

  /* ---------- 9. Tout réinitialiser ---------- */
  await W(() => { Parcours.prog.done = { 5: true }; store.set('parcours', Parcours.prog); });
  await W(() => Prefs.open('avance'));
  const nav2 = page.waitForNavigation();
  await page.click('#pf-reset-all');
  await nav2; await ready();
  const rs = await W(() => ({ band: BAND.name, stage: document.documentElement.classList.contains('stage'), cue: DeckPro.P.cueMode, lim: bus.lim.ratio.value, pr: decks[0].pitchRange, kl: decks[0].keyLock, eq: S.eqMode, preset: layout.preset, prof: store.get('profile'), wave: store.get('wave'), fx: store.get('fx') != null, done: Parcours.prog.done[5], genre: LibPro.hidden('genre'), coach: MixCoach.state.level }));
  check(rs.band === '3 bandes' && !rs.stage && rs.cue === 'cdj' && rs.lim === 20 && Math.abs(rs.pr - .08) < 1e-9 && !rs.kl && rs.eq === 'iso' && rs.preset === 'ecole' && rs.prof == null && rs.wave == null && rs.coach === 'debutant' && rs.done === true,
    'Tout réinitialiser : réglages d’origine, progression gardée', JSON.stringify(rs));

  /* ---------- 10. Pendant le parcours, le bouton est verrouillé comme les autres outils ---------- */
  await W(() => Parcours.open(0));
  check(await W(() => { const b = document.querySelector('#prefs-btn'); return !!b && b.inert; }), 'Parcours, chapitre 1 : le bouton Préférences attend le chapitre 14');
  await page.keyboard.press('Control+Comma');
  check(await isOpen(), 'Ctrl+, reste disponible pendant le parcours');
  await page.keyboard.press('Escape');
  await W(() => Parcours.exit());

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Préférences : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
