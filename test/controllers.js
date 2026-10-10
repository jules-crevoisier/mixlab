'use strict';
// Test des contrôleurs : un faux accès MIDI (entrées, sorties) injecté dans la page,
// de faux messages envoyés comme par une vraie table, et on vérifie ce qui bouge.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };
const near = (a, b, e = .005) => Math.abs(a - b) < e;

// Faux Web MIDI : même forme que l'API du navigateur (Map d'entrées et de sorties, onstatechange).
const fakeMidi = () => {
  const mk = (id, name, type) => ({ id, name, manufacturer: '', type, state: 'connected', onmidimessage: null });
  const access = { inputs: new Map(), outputs: new Map(), sysexEnabled: false, onstatechange: null };
  const log = [];
  const M = window.__midi = {
    access, log,
    addIn(id, name) { const i = mk(id, name, 'input'); access.inputs.set(id, i); access.onstatechange && access.onstatechange({ port: i }); return i; },
    addOut(id, name) { const o = mk(id, name, 'output'); o.send = (data, ts) => log.push({ out: id, data: [...data], ts: ts == null ? performance.now() : ts }); access.outputs.set(id, o); access.onstatechange && access.onstatechange({ port: o }); },
    send(id, ...b) { const i = access.inputs.get(id); i.onmidimessage && i.onmidimessage({ data: new Uint8Array(b), target: i }); },
  };
  M.addIn('in1', 'Fake DJ Control'); M.addOut('out1', 'Fake DJ Control');
  Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access, configurable: true });
};

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = []; let navigated = 0;
  page.on('pageerror', e => { errors.push(e.message); console.log('ERREUR PAGE', e.stack); });
  page.on('framenavigated', f => { if (f === page.mainFrame() && navigated++) console.log('RECHARGEMENT', f.url()); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(fakeMidi);
  await page.goto(url);
  await page.waitForFunction(() => typeof LIB !== 'undefined' && LIB.tracks.length >= 4 && decks[3].track && window.Controllers, null, { timeout: 30000 });
  await page.mouse.click(800, 5);
  const W = (f, a) => page.evaluate(f, a);
  const send = (...b) => W(b => __midi.send('in1', ...b), b);
  const wait = async (fn, ms = 3000, a) => { const t = Date.now(); while (Date.now() - t < ms) { if (await W(fn, a)) return true; await sleep(60); } return false; };

  // Bibliothèque livrée : index.js reprend exactement le fichier JSON.
  const file = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'app', 'mappings', 'generique-2-platines.json'), 'utf8'));
  const bundled = await W(() => window.MIXLAB_MAPPINGS);
  const b0 = bundled.find(m => m.file === 'generique-2-platines.json') || {}; const { file: _f, ...b0c } = b0;
  check(JSON.stringify(b0c) === JSON.stringify(file), 'Bibliothèque : mappings/index.js identique à generique-2-platines.json');

  // Détection : table inconnue, aucun mapping → proposition (assistant ou modèle générique).
  await W(() => { localStorage.clear(); midi.map = {}; Controllers.clearMeta(); renderMaps(); connectMidi(); });
  check(await wait(() => [...document.querySelectorAll('.toast.act')].some(t => /Nouveau contrôleur : Fake DJ Control/.test(t.textContent))), 'Branchement d’une table inconnue : proposition affichée');
  await page.click('.toast.act button:has-text("Modèle générique")');
  check(await W(() => Controllers.meta.name === 'Générique 2 platines' && midi.map['c0.0'].hi === true), 'Modèle générique chargé depuis le toast');
  await W(() => { decks[0].pause(); });
  await send(0x90, 11, 127); await send(0x80, 11, 0);
  check(await W(() => decks[0].playing), 'Modèle générique : note 11 canal 1 → Play A');
  await send(0x90, 11, 127); await send(0x80, 11, 0);

  // Mapping v1 : toujours lu tel quel (chaînes, pitch bend 14 bits, pas de rattrapage).
  await W(() => { document.querySelector('#map-json').value = JSON.stringify({ format: 'mixlab-mapping', version: 1, map: { 'n0.36': 'A.play', 'c0.7': 'A.fader', p0: 'A.pitch' } }); document.querySelector('#map-import').click(); decks[0].pause(); decks[0].ui.fader.set(.1); });
  await send(0x90, 36, 127); await send(0x80, 36, 0);
  await send(0xB0, 7, 64); await send(0xE0, 0, 64);
  const v1 = await W(() => ({ play: decks[0].playing, fader: decks[0].p.fader, pitch: decks[0].pitch, ver: JSON.parse(document.querySelector('#map-json').value).version }));
  check(v1.play && near(v1.fader, 64 / 127) && Math.abs(v1.pitch) < .0001, 'Mapping v1 : play, fader 7 bits, pitch bend', JSON.stringify(v1));
  check(v1.ver === 2, 'Export : le mapping v1 ressort au format v2');
  await W(() => decks[0].pause());

  // Mapping v2 complet.
  await W(() => Controllers.load({ name: 'Test v2', device: '', map: {
    'c0.0': { id: 'A.pitch', hi: true, takeover: false },
    'c0.20': { id: 'A.high', type: 'rel', mode: '2c' }, 'c0.21': { id: 'A.mid', type: 'rel', mode: '64' }, 'c0.22': { id: 'A.low', type: 'rel', mode: 'sm' },
    'n0.14': { type: 'shift' }, 'n0.11': { id: 'A.play', shift: 'A.keylock', led: { out: 'n0.40', on: 100, off: 3 } },
    'n0.16': { id: 'A.slip', led: { blink: true } },
    'c0.7': { id: 'A.fader' }, 'c0.8': { id: 'xf', invert: true, takeover: false },
    'n0.20': { id: 'L.jog', type: 'touch' }, 'c0.6': { id: 'L.jog', type: 'jog', mode: '2c' },
    'n0.15': { type: 'layer', side: 'L' }, 'n0.13': { id: 'L.keylock' },
  } }, true));

  // 14 bits : CC 0 (MSB) + CC 32 (LSB).
  await W(() => decks[0].setRange(.08));
  await send(0xB0, 0, 96); await send(0xB0, 32, 0);
  const p1 = await W(() => decks[0].pitch);
  await send(0xB0, 32, 127);
  const p2 = await W(() => decks[0].pitch);
  check(near(p1, (-1 + 2 * 12288 / 16383) * .08, 1e-5) && near(p2, (-1 + 2 * 12415 / 16383) * .08, 1e-5) && p2 > p1, 'Pitch 14 bits : MSB et LSB combinés', p1.toFixed(6) + ' → ' + p2.toFixed(6));
  await send(0xB0, 8, 127);
  check(await W(() => S.xf < .01), 'Option inverser : crossfader à fond à droite → à gauche');

  // Encodeurs relatifs : trois codages.
  await W(() => ['A.high', 'A.mid', 'A.low'].forEach(id => controls.get(id).set(.2)));
  const g = id => W(id => controls.get(id).get(), id);
  await send(0xB0, 20, 3); const r1 = await g('A.high'); await send(0xB0, 20, 125); const r2 = await g('A.high');
  check(near(r1, .23) && near(r2, .2), 'Relatif complément à deux : +3 puis −3', r1 + ' / ' + r2);
  await send(0xB0, 21, 67); const r3 = await g('A.mid'); await send(0xB0, 21, 61); const r4 = await g('A.mid');
  check(near(r3, .23) && near(r4, .2), 'Relatif centré sur 64 : 67 puis 61', r3 + ' / ' + r4);
  await send(0xB0, 22, 3); const r5 = await g('A.low'); await send(0xB0, 22, 67); const r6 = await g('A.low');
  check(near(r5, .23) && near(r6, .2), 'Relatif signe + valeur : 3 puis 67', r5 + ' / ' + r6);

  // Calque Shift.
  await W(() => { decks[0].pause(); decks[0].setKeyLock(false); });
  await send(0x90, 14, 127); await send(0x90, 11, 127); await send(0x80, 11, 0); await send(0x80, 14, 0);
  const sh = await W(() => ({ kl: decks[0].keyLock, play: decks[0].playing }));
  check(sh.kl && !sh.play, 'Shift + Play → Key lock (pas de lecture)', JSON.stringify(sh));
  await send(0x90, 11, 127); await send(0x80, 11, 0);
  check(await W(() => decks[0].playing), 'Sans Shift : Play lance la lecture');

  // Voyants : sortie et valeurs choisies, clignotement.
  check(await wait(() => __midi.log.some(m => m.out === 'out1' && m.data.join() === '144,40,100')), 'Voyant Play : note 40 à 100 quand A joue');
  await send(0x90, 11, 127); await send(0x80, 11, 0);
  check(await wait(() => __midi.log.some(m => m.data.join() === '144,40,3')), 'Voyant Play : note 40 à 3 à l’arrêt');
  await W(() => { decks[0].slip = true; __midi.log.length = 0; });
  await sleep(1100);
  const bl = await W(() => __midi.log.filter(m => m.data[1] === 16 && m.data[0] === 0x90).map(m => m.data[2]));
  check(bl.includes(127) && bl.includes(0) && bl.length >= 3, 'Voyant clignotant (Slip)', bl.join(','));
  await W(() => { decks[0].slip = false; });

  // Rattrapage (soft takeover) du fader.
  await W(() => { decks[0].ui.fader.set(.5); Controllers.st.pick = {}; });
  await send(0xB0, 7, 20); const t1 = await W(() => decks[0].p.fader);
  await send(0xB0, 7, 40); const t2 = await W(() => decks[0].p.fader);
  await send(0xB0, 7, 70); const t3 = await W(() => decks[0].p.fader);
  await send(0xB0, 7, 100); const t4 = await W(() => decks[0].p.fader);
  check(near(t1, .5) && near(t2, .5) && near(t3, 70 / 127) && near(t4, 100 / 127), 'Soft takeover : pas de saut, reprise en croisant la valeur', [t1, t2, t3, t4].map(x => x.toFixed(3)).join(' → '));
  await W(() => decks[0].ui.fader.set(.4));
  await send(0xB0, 7, 101); const t5 = await W(() => decks[0].p.fader);
  check(near(t5, .4), 'Soft takeover : fader bougé à la souris, la table doit le rattraper', t5.toFixed(3));

  // Jog : sans toucher → pitch bend ; touché → scratch.
  await W(() => { decks[0].seek(30); decks[0].play(); });
  await sleep(150);
  const bend = await W(() => { __midi.send('in1', 0xB0, 6, 10); return decks[0].jogAcc; });
  check(bend > 0 && await W(() => decks[0].playing && !decks[0].scratching), 'Jog sans toucher : pitch bend en lecture', 'jogAcc ' + bend);
  await send(0x90, 20, 127);
  const sc0 = await W(() => ({ s: !!decks[0].scratching, play: decks[0].playing, pos: decks[0].position() }));
  for (let i = 0; i < 5; i++) await send(0xB0, 6, 10);
  const sc1 = await W(() => decks[0].position());
  check(sc0.s && !sc0.play && near(sc1 - sc0.pos, 50 / 128 * 1.8, .01), 'Jog touché : scratch, la tête suit le plateau', (sc1 - sc0.pos).toFixed(3) + ' s');
  for (let i = 0; i < 2; i++) await send(0xB0, 6, 118);
  const sc2 = await W(() => decks[0].position());
  check(near(sc2 - sc1, -20 / 128 * 1.8, .01), 'Scratch en arrière', (sc2 - sc1).toFixed(3) + ' s');
  await send(0x80, 20, 0);
  check(await W(() => decks[0].playing && !decks[0].scratching), 'Jog relâché : la lecture reprend');
  await W(() => decks[0].pause());

  // Bascule de platine A/C.
  await W(() => { decks[0].setKeyLock(false); decks[2].setKeyLock(false); });
  await send(0x90, 13, 127); await send(0x80, 13, 0);
  const l1 = await W(() => [decks[0].keyLock, decks[2].keyLock]);
  await send(0x90, 15, 127); await send(0x80, 15, 0);
  await send(0x90, 13, 127); await send(0x80, 13, 0);
  const l2 = await W(() => [decks[0].keyLock, decks[2].keyLock, Controllers.st.layer.L]);
  await send(0x90, 15, 127); await send(0x80, 15, 0);
  check(l1.join() === 'true,false' && l2.join() === 'true,true,C' && await W(() => Controllers.st.layer.L === 'A'), 'Bascule de platine : la même touche pilote A puis C', JSON.stringify([l1, l2]));

  // MIDI Learn + options.
  await W(() => { setLearn(true); selectLearn('A.filter'); });
  await send(0xB0, 9, 70);
  check(await W(() => midi.map['c0.9'] && midi.map['c0.9'].id === 'A.filter' && !!document.querySelector('#learn-opts')), 'MIDI Learn : appris, ligne d’options affichée');
  await page.click('#learn-opts label:has-text("Inverser")');
  check(await W(() => midi.map['c0.9'].invert === true), 'Options après Learn : inverser');
  await W(() => selectLearn('B.pitch'));
  await send(0xB0, 10, 64); await send(0xB0, 42, 3);
  check(await W(() => midi.map['c0.10'] && midi.map['c0.10'].hi === true && !midi.map['c0.42']), 'MIDI Learn : paire 14 bits reconnue (CC 10 + CC 42)');
  await page.click('#learn-opts label:has-text("Rattrapage")');
  check(await W(() => midi.map['c0.10'].takeover === false), 'Options après Learn : rattrapage désactivable');
  await W(() => setLearn(false));

  // Assistant de mapping.
  await W(() => { Controllers.cfg.quiet = 220; document.querySelector('#midi-modal').hidden = false; });
  await page.click('#wiz-btn');
  const lbl = () => W(() => document.querySelector('#wiz-label') && document.querySelector('#wiz-label').textContent);
  check((await lbl()) === 'Play A' && await W(() => !document.querySelector('#wiz-modal').hidden), 'Assistant ouvert sur « Play A »');
  await send(0x90, 11, 127); await send(0x80, 11, 0);
  check(await wait(() => document.querySelector('#wiz-label').textContent === 'Cue A'), 'Note détectée, étape suivante');
  await page.click('#wiz-skip');
  await send(0xB0, 50, 127); await send(0xB0, 50, 0);
  check(await wait(() => document.querySelector('#wiz-label').textContent === 'Pitch A'), 'Bouton en CC détecté');
  for (let v = 0; v <= 20; v++) { await send(0xB0, 0, v * 6); await send(0xB0, 32, (v * 37) & 127); }
  await page.screenshot({ path: '/tmp/mixlab-wizard.png' });
  check(await wait(() => document.querySelector('#wiz-label').textContent === 'Jog : toucher A'), 'Pitch 14 bits détecté');
  await send(0x90, 20, 127); await send(0x80, 20, 0);
  check(await wait(() => document.querySelector('#wiz-label').textContent === 'Jog : tourner A'), 'Toucher du jog détecté');
  for (const v of [1, 1, 2, 1, 1, 3, 127, 127, 126, 127]) await send(0xB0, 6, v);
  check(await wait(() => document.querySelector('#wiz-label').textContent === 'EQ aigus A'), 'Jog relatif détecté');
  for (let v = 0; v <= 127; v += 8) await send(0xB0, 1, v);
  check(await wait(() => document.querySelector('#wiz-label').textContent === 'EQ médiums A'), 'Potard absolu détecté');
  for (const v of [65, 65, 66, 65, 65, 63, 62, 63, 63]) await send(0xB0, 2, v);
  check(await wait(() => document.querySelector('#wiz-label').textContent === 'EQ graves A'), 'Encodeur centré sur 64 détecté');
  for (const v of [1, 1, 2, 1, 65, 65, 66, 65]) await send(0xB0, 3, v);
  check(await wait(() => document.querySelector('#wiz-label').textContent === 'Filtre A'), 'Encodeur signe + valeur détecté');
  await send(0x90, 11, 127); await send(0x80, 11, 0);
  check(await W(() => /Déjà utilisé/.test(document.querySelector('#wiz-st').textContent)), 'Commande déjà prise : signalée et ignorée');
  await page.click('#wiz-end');
  await page.fill('#wiz-name', 'Ma table test'); await page.fill('#wiz-dev', 'Fake DJ Control 2');
  await page.screenshot({ path: '/tmp/mixlab-wizard-fin.png' });
  await page.click('#wiz-save');
  const wm = await W(() => ({ lib: Controllers.lib.map(m => m.name), meta: Controllers.meta, map: midi.map }));
  const m = wm.map;
  check(wm.lib.includes('Ma table test') && wm.meta.name === 'Ma table test' && wm.meta.device === 'Fake DJ Control 2', 'Mapping enregistré dans la bibliothèque et activé');
  check(m['n0.11'] && m['n0.11'].id === 'L.play' && m['c0.50'] && m['c0.50'].type === 'btn' && m['c0.0'] && m['c0.0'].hi && !m['c0.32'] &&
    m['n0.20'] && m['n0.20'].type === 'touch' && m['c0.6'] && m['c0.6'].type === 'jog' && m['c0.6'].mode === '2c' &&
    m['c0.1'] && !m['c0.1'].type && m['c0.2'] && m['c0.2'].mode === '64' && m['c0.3'] && m['c0.3'].mode === 'sm' && Object.keys(m).length === 8, 'Contenu du mapping de l’assistant', JSON.stringify(m));
  await W(() => { decks[0].pause(); });
  await send(0x90, 11, 127); await send(0x80, 11, 0);
  check(await W(() => decks[0].playing), 'Le mapping de l’assistant pilote Play A');
  await W(() => decks[0].pause());

  // Détection automatique : la table enregistrée est reconnue à son branchement.
  await W(() => { Controllers.load(MIXLAB_MAPPINGS[0], true); __midi.addIn('in2', 'Fake DJ Control 2'); });
  check(await wait(() => [...document.querySelectorAll('.toast.act')].some(t => /Contrôleur reconnu : Fake DJ Control 2.*Ma table test/.test(t.textContent))), 'Branchement : table reconnue, proposition de charger son mapping');
  await page.click('.toast.act:has-text("Contrôleur reconnu") button:has-text("Charger")');
  check(await W(() => Controllers.meta.name === 'Ma table test'), 'Mapping chargé en un clic');

  // Import / export de fichier et texte à partager.
  await W(() => { document.querySelector('#midi-modal').hidden = false; });
  const shared = await W(() => document.querySelector('#map-json').value);
  check(/"version": 2/.test(shared) && /Ma table test/.test(shared), 'Texte à partager : JSON v2 avec nom et contrôleur');
  const imp = path.join(require('os').tmpdir(), 'mixlab-import-test.json');
  fs.writeFileSync(imp, JSON.stringify({ format: 'mixlab-mapping', version: 2, name: 'Fichier importé', device: 'Autre table', map: { 'n3.1': { id: 'B.play' } } }));
  await page.setInputFiles('.mlib input[type=file]', imp);
  check(await wait(() => Controllers.meta.name === 'Fichier importé' && Controllers.lib.some(m => m.name === 'Fichier importé')), 'Import d’un fichier : chargé et ajouté à la bibliothèque');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 3000 }).catch(() => null), page.click('.mlib >> text=Exporter l’actif')]);
  check(!!dl && /fichier-importe\.mixlab\.json$/.test(dl.suggestedFilename()), 'Export du mapping actif en fichier', dl ? dl.suggestedFilename() : 'aucun');

  // Horloge MIDI : 24 impulsions par temps à 124 BPM.
  await W(() => { Controllers.clock.out = 'clk'; __midi.addOut('clk', 'Fake Clock'); decks[1].pause(); decks[2].pause(); decks[3].pause(); decks[0].setBpm(124); decks[0].setPitch(0); S.master = decks[0]; decks[0].play(); });
  await page.selectOption('#clock-out', 'clk');
  await page.click('#clock-on');
  await sleep(2600);
  const ck = await W(() => { const L = __midi.log.filter(m => m.out === 'clk'); const t = L.filter(m => m.data[0] === 0xF8).map(m => m.ts); const t1 = t[t.length - 1], t0 = t1 - 2000; const n = t.filter(x => x > t0).length; return { perBeat: n / (2000 / (60000 / 124)), start: L.some(m => m.data[0] === 0xFA), bpm: Controllers.clockBpm() }; });
  check(Math.abs(ck.perBeat - 24) < .6, 'Horloge MIDI : ≈ 24 impulsions par temps à 124 BPM', ck.perBeat.toFixed(2) + ' / temps à ' + ck.bpm.toFixed(2) + ' BPM');
  check(ck.start, 'Horloge MIDI : Start envoyé quand la platine maître joue');
  await W(() => decks[0].pause());
  check(await wait(() => __midi.log.some(m => m.out === 'clk' && m.data[0] === 0xFC)), 'Horloge MIDI : Stop envoyé à l’arrêt');
  check(await W(() => !__midi.log.some(m => m.out === 'clk' && m.data[0] === 0x90)), 'Les voyants ne partent pas vers la sortie de l’horloge');
  await page.click('#clock-on');

  // Fenêtre contrôleur.
  await W(() => { Controllers.load(Controllers.lib.find(m => m.name === 'Ma table test'), true); document.querySelector('#midi-modal').hidden = false; });
  await page.click('#map-list li[data-key="c0.2"] button.opt');
  check(await W(() => !!document.querySelector('#map-list .mopts:not([hidden]) select')), 'Liste : options d’une commande dépliables');
  await page.screenshot({ path: '/tmp/mixlab-mapping.png' });
  check(await W(() => document.querySelectorAll('#lib-maps li').length >= 3), 'Bibliothèque listée avec nom et contrôleur');

  // Clavier : touches physiques (AZERTY), raccourcis modifiables, Échap ferme les fenêtres.
  await W(() => { document.querySelector('#midi-modal').hidden = true; decks[0].pause(); ui.setX(.5); });
  const kev = (code, key) => W(([code, key]) => { const o = { code, key, bubbles: true }; document.body.dispatchEvent(new KeyboardEvent('keydown', o)); document.body.dispatchEvent(new KeyboardEvent('keyup', o)); }, [code, key]);
  await kev('KeyQ', 'a');
  check(await W(() => decks[0].playing), 'AZERTY : la touche A (place du Q) lance Play A');
  await kev('KeyQ', 'a'); const x0 = await W(() => S.xf); await kev('KeyW', 'z'); const x1 = await W(() => S.xf); await kev('KeyZ', 'w'); const x2 = await W(() => S.xf);
  check(await W(() => !decks[0].playing) && x1 === x0 && x2 < x0, 'AZERTY : Z (place du W) = Cue, W (place du Z) = crossfader', [x0, x1, x2].join(' / '));
  await W(() => { document.querySelector('#midi-modal').hidden = false; });
  check(await W(() => document.querySelectorAll('#key-list li').length === 20), 'Fenêtre Contrôleur : liste des raccourcis clavier');
  await page.click('#key-list li[data-code="KeyQ"] button.opt');
  await page.keyboard.press('KeyM');
  check(await W(() => KEYS.KeyM === 'A.play' && !KEYS.KeyQ && JSON.parse(localStorage.getItem('mixlab2.keys')).KeyM === 'A.play'), 'Raccourci modifié et enregistré (Play A sur M)');
  await page.screenshot({ path: '/tmp/mixlab-clavier.png' });
  await page.keyboard.press('Escape');
  check(await W(() => document.querySelector('#midi-modal').hidden), 'Échap ferme la fenêtre Contrôleur');
  await W(() => { const m = document.querySelector('#audio-modal'); if (m) m.hidden = false; });
  await page.keyboard.press('Escape');
  check(await W(() => !document.querySelector('#audio-modal') || document.querySelector('#audio-modal').hidden), 'Échap ferme la fenêtre Audio');
  await W(() => { Object.keys(KEYS).forEach(k => delete KEYS[k]); Object.assign(KEYS, KEYS_DEF); });

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Contrôleurs : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
