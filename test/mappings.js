'use strict';
// Test des mappings de marque livrés (app/mappings/*.json) : structure, source, commandes essentielles,
// absence de conflits, détection par le nom du port MIDI, puis de faux messages MIDI envoyés comme par
// la vraie table (aucune table n'a été essayée : ces mappings sont « non vérifiés sur le matériel »).
// Aussi : couleur des pads, indication « Sur ta table » dans les leçons, écran « Tester ma table ».
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const dir = path.resolve(__dirname, '..', 'app', 'mappings');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };
const near = (a, b, e = .005) => Math.abs(a - b) < e;

// JSON.parse garde silencieusement la dernière de deux clés identiques : ce petit lecteur les signale.
function dupKeys(txt) {
  let i = 0; const dups = [];
  const ws = () => { while (/\s/.test(txt[i])) i++; };
  const str = () => { const s = i; i++; while (txt[i] !== '"') { if (txt[i] === '\\') i++; i++; } i++; return JSON.parse(txt.slice(s, i)); };
  const val = p => {
    ws();
    if (txt[i] === '{') { i++; const seen = new Set(); ws(); if (txt[i] === '}') { i++; return; }
      for (;;) { ws(); const k = str(); if (seen.has(k)) dups.push(p + '.' + k); seen.add(k); ws(); i++; val(p + '.' + k); ws(); if (txt[i] === ',') { i++; continue; } i++; return; } }
    if (txt[i] === '[') { i++; ws(); if (txt[i] === ']') { i++; return; } for (let n = 0; ; n++) { val(p + '[' + n + ']'); ws(); if (txt[i] === ',') { i++; continue; } i++; return; } }
    if (txt[i] === '"') return str();
    while (i < txt.length && !/[,}\]\s]/.test(txt[i])) i++;
  };
  val('');
  return dups;
}

const fakeMidi = () => {
  const mk = (id, name, type) => ({ id, name, manufacturer: '', type, state: 'connected', onmidimessage: null });
  const access = { inputs: new Map(), outputs: new Map(), sysexEnabled: false, onstatechange: null };
  const log = [];
  window.__midi = {
    access, log,
    addIn(id, name) { const i = mk(id, name, 'input'); access.inputs.set(id, i); access.onstatechange && access.onstatechange({ port: i }); return i; },
    addOut(id, name) { const o = mk(id, name, 'output'); o.send = data => log.push({ out: id, data: [...data] }); access.outputs.set(id, o); access.onstatechange && access.onstatechange({ port: o }); },
    send(id, ...b) { const i = access.inputs.get(id); i.onmidimessage && i.onmidimessage({ data: new Uint8Array(b), target: i }); },
  };
  Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access, configurable: true });
};

// Noms de port tels que les tables se présentent (le motif de chaque mapping doit les reconnaître).
const PORTS = {
  'pioneer-ddj-flx4.json': 'DDJ-FLX4',
  'pioneer-ddj-400.json': 'PIONEER DDJ-400',
  'pioneer-ddj-flx6.json': 'DDJ-FLX6',
  'pioneer-ddj-sb3.json': 'PIONEER DDJ-SB3',
  'hercules-djcontrol-inpulse-200.json': 'DJControl Inpulse 200',
  'hercules-djcontrol-inpulse-300.json': 'DJControl Inpulse 300',
};
// Noms voisins qui ne doivent rien charger (autre modèle, MIDI différent).
const NOT = ['DJControl Inpulse 200 MK2', 'DJControl Inpulse 300 MK2', 'DDJ-4000', 'DDJ-FLX10', 'Fake DJ Control'];

(async () => {
  /* ---------- 1. fichiers : structure, source, conflits ---------- */
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const brand = files.filter(f => f !== 'generique-2-platines.json');
  check(brand.length >= 6, 'Mappings de marque livrés', brand.join(', '));
  check(Object.keys(PORTS).every(f => brand.includes(f)) && brand.every(f => PORTS[f]), 'Chaque mapping a un nom de port de test');
  const maps = {};
  for (const f of files) {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    let j = null; try { j = JSON.parse(txt); } catch (e) { check(false, f + ' : JSON lisible', e.message); continue; }
    maps[f] = j;
    const d = dupKeys(txt);
    check(!d.length, f + ' : aucune clé en double (même message MIDI deux fois)', d.join(', '));
  }
  const keyRe = /^(?:([nc])(\d{1,2})\.(\d{1,3})|p(\d{1,2}))$/;
  const TYPES = ['', 'abs', 'btn', 'rel', 'jog', 'touch', 'shift', 'layer'], MODES = ['2c', '64', 'sm', 'abs7'];
  for (const f of brand) {
    const j = maps[f]; if (!j) continue;
    const bad = [];
    if (j.format !== 'mixlab-mapping' || j.version !== 2) bad.push('format/version');
    if (!j.name || !j.unverified) bad.push('nom ou marque « non vérifié »');
    if (!/^\/.+\/$/.test(j.device || '')) bad.push('motif de port');
    else try { new RegExp(j.device.slice(1, -1), 'i'); } catch (e) { bad.push('motif invalide'); }
    if (!j.source || !/^https:\/\/[^ ]+\.pdf$/i.test(j.source.url || '') || !j.source.doc || !j.source.version) bad.push('source (url pdf, document, version)');
    if (!/Non vérifié sur le matériel/.test(j.notes || '')) bad.push('notes sans avertissement');
    if (![2, 4].includes(j.decks)) bad.push('nombre de platines');
    const lsb = new Map(), outs = new Map();
    for (const [k, e] of Object.entries(j.map)) {
      const m = keyRe.exec(k);
      if (!m || (m[2] != null && (+m[2] > 15 || +m[3] > 127))) { bad.push('clé ' + k); continue; }
      if (typeof e !== 'object' || !e) { bad.push('entrée ' + k); continue; }
      if (!TYPES.includes(e.type || '')) bad.push(k + ' type ' + e.type);
      if (e.mode && !MODES.includes(e.mode)) bad.push(k + ' codage ' + e.mode);
      if ((e.type === 'rel' || e.type === 'jog') && !e.mode) bad.push(k + ' codage manquant');
      if (e.type !== 'shift' && e.type !== 'layer' && !e.id) bad.push(k + ' sans commande');
      if (!e.hw) bad.push(k + ' sans nom de commande physique');
      if (e.hi) { if (m[1] !== 'c' || +m[3] >= 32) bad.push(k + ' 14 bits hors CC 0-31'); else lsb.set(`c${m[2]}.${+m[3] + 32}`, k); }
      if (e.led !== false && e.type !== 'touch' && e.type !== 'jog' && e.type !== 'rel' && !e.hi && m[1] === 'n') {
        const o = (e.led && e.led.out) || k; if (outs.has(o) && outs.get(o) !== e.id) bad.push('voyant ' + o + ' partagé par ' + outs.get(o) + ' et ' + e.id); outs.set(o, e.id);
      }
    }
    for (const [l, ms] of lsb) if (j.map[l]) bad.push('conflit 14 bits : ' + l + ' est le LSB de ' + ms + ' et une commande à part');
    check(!bad.length, f + ' : structure, source et absence de conflit', bad.slice(0, 6).join(' | '));
    // commandes essentielles, par platine
    const ids = new Set(Object.values(j.map).map(e => e.id).filter(Boolean)), types = Object.values(j.map);
    const miss = [];
    const decks = ['A', 'B', 'C', 'D'].slice(0, j.decks);
    for (const D of decks) {
      for (const a of ['play', 'cue', 'sync', 'pitch', 'high', 'low', 'filter', 'fader', 'load', 'cuech']) if (!ids.has(D + '.' + a)) miss.push(D + '.' + a);
      if (j.eqBands !== 2 && !ids.has(D + '.mid')) miss.push(D + '.mid');
      if (!types.some(e => e.id === D + '.jog' && e.type === 'jog')) miss.push(D + '.jog (tourner)');
      if (!types.some(e => e.id === D + '.jog' && e.type === 'touch')) miss.push(D + '.jog (toucher)');
      const pads = [1, 2, 3, 4].filter(i => ids.has(`${D}.pad.hot.${i}`) || ids.has(`${D}.pad${i}`));
      if (pads.length < 4) miss.push(D + ' pads hot cue');
      if (!types.some(e => e.id === D + '.pitch' && e.hi)) miss.push(D + '.pitch 14 bits');
    }
    for (const g of ['xf', 'lib.browse']) if (!ids.has(g)) miss.push(g);
    if (!types.some(e => e.type === 'shift')) miss.push('shift');
    check(!miss.length, f + ' : commandes essentielles (play, cue, sync, pitch, EQ, filtre, faders, crossfader, jog, pads, navigation et chargement)', miss.join(', '));
  }

  /* ---------- 2. dans l'application ---------- */
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('ERREUR PAGE', e.stack); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(fakeMidi);
  await page.goto(url);
  await page.waitForFunction(() => typeof LIB !== 'undefined' && LIB.tracks.length >= 4 && decks[3].track && window.Controllers && Controllers.T, null, { timeout: 30000 });
  await page.mouse.click(800, 5);
  const W = (f, a) => page.evaluate(f, a);
  const wait = async (fn, ms = 3000, a) => { const t = Date.now(); while (Date.now() - t < ms) { if (await W(fn, a)) return true; await sleep(60); } return false; };

  // index.js reprend chaque fichier tel quel
  const bundled = await W(() => window.MIXLAB_MAPPINGS);
  for (const f of files) { const b = bundled.find(m => m.file === f); const { file: _f, ...bc } = b || {}; check(!!b && JSON.stringify(bc) === JSON.stringify(maps[f]), 'mappings/index.js identique à ' + f); }

  // toutes les commandes visées existent dans le logiciel
  for (const f of brand) {
    const missing = await W(m => Object.values(m.map).flatMap(e => [e.id, e.shift]).filter(Boolean).filter(id => !controls.has(/^[LR]\./.test(id) ? Controllers.st.layer[id[0]] + id.slice(1) : id)), maps[f]);
    check(!missing.length, f + ' : chaque commande existe dans Mixlab', [...new Set(missing)].slice(0, 8).join(', '));
  }

  // Détection par le nom du port, chargement automatique et toast de confirmation
  await W(() => { localStorage.clear(); midi.map = {}; Controllers.clearMeta(); Controllers.renderMaps(); connectMidi(); __midi.addOut('out1', 'Sortie'); });
  await wait(() => !!midi.access);
  let n = 0;
  for (const [f, port] of Object.entries(PORTS)) {
    const name = maps[f].name; n++;
    await W(([id, port]) => { document.querySelectorAll('.toast').forEach(t => t.remove()); __midi.addIn(id, port); }, ['in' + n, port]);
    const ok = await wait(n => Controllers.meta.name === n, 3000, name);
    const toastOk = await wait(n => [...document.querySelectorAll('.toast.act')].some(t => t.textContent.includes('Mapping « ' + n + ' » chargé') && /non vérifié sur le matériel/.test(t.textContent)), 2000, name);
    check(ok && toastOk, `Port « ${port} » : ${name} chargé tout seul, toast de confirmation`);
  }
  for (const port of NOT) {
    n++;
    const before = await W(() => Controllers.meta.name);
    await W(([id, port]) => __midi.addIn(id, port), ['in' + n, port]);
    await sleep(150);
    const after = await W(() => Controllers.meta.name);
    const wrong = await W(port => MIXLAB_MAPPINGS.filter(m => m.device && m.device[0] === '/' && new RegExp(m.device.slice(1, -1), 'i').test(port)).map(m => m.name), port);
    check(after === before && !wrong.length, `Port « ${port} » : aucun mapping de marque ne le revendique`, wrong.join(', '));
  }
  // Annuler revient au mapping précédent ; un mapping personnel n'est jamais remplacé sans demander
  await W(() => { Controllers.load(MIXLAB_MAPPINGS.find(m => m.name === 'Pioneer DJ DDJ-400'), true); document.querySelectorAll('.toast').forEach(t => t.remove()); Controllers.offered.clear(); __midi.addIn('re1', 'DDJ-FLX4'); });
  await wait(() => Controllers.meta.name === 'Pioneer DJ DDJ-FLX4');
  await page.click('.toast.act:has-text("DDJ-FLX4") button:has-text("Annuler")');
  check(await W(() => Controllers.meta.name === 'Pioneer DJ DDJ-400' && midi.map['n0.71'] && midi.map['n0.71'].id === 'A.rev'), 'Toast : Annuler remet le mapping précédent');
  await W(() => { midi.map = { 'n0.1': { id: 'A.play' } }; Controllers.clearMeta(); document.querySelectorAll('.toast').forEach(t => t.remove()); Controllers.offered.clear(); __midi.addIn('re2', 'DDJ-FLX4'); });
  check(await wait(() => [...document.querySelectorAll('.toast.act')].some(t => /Contrôleur reconnu : DDJ-FLX4\. Charger le mapping/.test(t.textContent))) && await W(() => !!midi.map['n0.1'] && !Controllers.meta.name), 'Mapping personnel actif : proposition, pas de remplacement');
  await W(() => { store.set('mapAuto', false); midi.map = {}; Controllers.clearMeta(); document.querySelectorAll('.toast').forEach(t => t.remove()); Controllers.offered.clear(); __midi.addIn('re3', 'DJControl Inpulse 300'); });
  check(await wait(() => [...document.querySelectorAll('.toast.act')].some(t => /Charger le mapping « Hercules DJControl Inpulse 300 »/.test(t.textContent))) && await W(() => !Controllers.meta.name), 'Réglage « charger tout seul » coupé : simple proposition');
  await W(() => store.set('mapAuto', true));
  check(await W(() => (window.MixlabSettings || []).some(s => s.key === 'mapAuto' && s.get() === true && typeof s.set === 'function')), 'Réglage déclaré pour la fenêtre Préférences');
  await W(() => document.querySelectorAll('.toast').forEach(t => t.remove()));

  // Faux messages : chaque mapping pilote les commandes essentielles de la platine A
  const keyOf = (m, pred) => Object.entries(m.map).find(([k, e]) => pred(e, k));
  const bytes = k => { const p = /^([nc])(\d+)\.(\d+)$/.exec(k); return [(p[1] === 'n' ? 0x90 : 0xB0) | +p[2], +p[3]]; };
  for (const f of brand) {
    const m = maps[f], tag = m.name.replace(/^(Pioneer DJ|Hercules DJControl) /, '');
    await W(m => { Controllers.load(m, true); decks.forEach(d => { d.pause(); d.ui.fader.set(.5); }); Controllers.st.pick = {}; __midi.log.length = 0; }, m);
    const send = (k, v) => { const [s, d1] = bytes(k); return W(b => __midi.send('in1', ...b), [s, d1, v]); };
    const noteOff = k => { const [s, d1] = bytes(k); return W(b => __midi.send('in1', ...b), [s & 0x0F | 0x80, d1, 0]); };
    const r = {};
    // Play
    const [kp] = keyOf(m, e => e.id === 'A.play');
    await send(kp, 127); await noteOff(kp); r.play = await W(() => decks[0].playing);
    r.led = await wait(k => { const p = /^n(\d+)\.(\d+)$/.exec(k); return __midi.log.some(x => x.data[0] === (0x90 | +p[1]) && x.data[1] === +p[2] && x.data[2] === 127); }, 1500, kp);
    await send(kp, 127); await noteOff(kp); r.pause = await W(() => !decks[0].playing);
    // Cue : à l'arrêt, pose le point de départ
    const [kc] = keyOf(m, e => e.id === 'A.cue');
    await W(() => { decks[0].seek(12); }); await send(kc, 127); await noteOff(kc); r.cue = await W(() => Math.abs(decks[0].track.cue - decks[0].position()) < .05);
    // Sync
    const [ks] = keyOf(m, e => e.id === 'A.sync');
    await W(() => { decks[1].ui.fader.set(0); decks[1].play(); });
    const sy0 = await W(() => decks[0].sync); await send(ks, 127); await noteOff(ks); r.sync = await W(s => decks[0].sync !== s, sy0); if (r.sync) { await send(ks, 127); await noteOff(ks); }
    await W(() => decks[1].pause());
    // Pitch 14 bits (MSB puis LSB), avec le sens déclaré
    const [kt, et] = keyOf(m, e => e.id === 'A.pitch' && e.hi);
    await W(() => { decks[0].setRange(.08); decks[0].setPitch(0); Controllers.st.pick = {}; });
    const [st, nt] = bytes(kt);
    for (const [msb, lsb] of [[64, 0], [96, 0], [96, 64]]) { await W(b => __midi.send('in1', ...b), [st, nt, msb]); await W(b => __midi.send('in1', ...b), [st, nt + 32, lsb]); }
    const want = (et.invert ? 1 - (96 * 128 + 64) / 16383 : (96 * 128 + 64) / 16383) * 2 - 1;
    r.pitch = await W(() => decks[0].pitch / .08); r.pitchOk = near(r.pitch, want, 1e-3);
    // Fader, EQ, filtre, crossfader : on passe par la valeur du logiciel (rattrapage), puis on pousse
    const absTest = async (id, get) => {
      const e = keyOf(m, x => x.id === id); if (!e) return 'absent';
      const [s, d1] = bytes(e[0]); await W(() => { Controllers.st.pick = {}; });
      for (const v of [0, 127, 32]) { await W(b => __midi.send('in1', ...b), [s, d1, v]); if (e[1].hi) await W(b => __midi.send('in1', ...b), [s, d1 + 32, 0]); }
      const got = await W(get); return near(got, (32 * 128) / 16383, .002) ? 'ok' : String(got);
    };
    r.fader = await absTest('A.fader', () => decks[0].p.fader);
    r.high = await absTest('A.high', () => decks[0].p.high);
    r.low = await absTest('A.low', () => decks[0].p.low);
    r.filter = await absTest('A.filter', () => decks[0].p.filter);
    r.xf = await absTest('xf', () => S.xf);
    // Jog : toucher = scratch ; tourner sans toucher = petit coup de vitesse
    const [kj] = keyOf(m, e => e.id === 'A.jog' && e.type === 'touch');
    await send(kj, 127); r.touch = await W(() => decks[0].scratching); await noteOff(kj); r.untouch = await W(() => !decks[0].scratching);
    const [kr, er] = keyOf(m, e => e.id === 'A.jog' && e.type === 'jog');
    await W(() => { decks[0].pause(); decks[0].seek(20); });
    const [sr, nr] = bytes(kr), fwd = er.mode === '64' ? 64 + 10 : 10;
    await send(kj, 127); for (let i = 0; i < 20; i++) await W(b => __midi.send('in1', ...b), [sr, nr, fwd]); await noteOff(kj);
    r.jog = await W(() => decks[0].position() > 20.01);
    // Navigation et chargement
    const [kb, eb] = keyOf(m, e => e.id === 'lib.browse' && !e.speed);
    await W(() => { ui.sel = null; }); const [sb, nb] = bytes(kb);
    await W(b => __midi.send('in1', ...b), [sb, nb, eb.mode === '64' ? 65 : 1]); await W(b => __midi.send('in1', ...b), [sb, nb, eb.mode === '64' ? 65 : 1]);
    r.browse = await W(() => !!ui.sel);
    const sel = await W(() => ui.sel);
    const [kl] = keyOf(m, e => e.id === 'A.load');
    await W(() => { decks[0].pause(); decks[0].ui.fader.set(0); });
    await send(kl, 127); await noteOff(kl); r.load = await wait(id => decks[0].track && decks[0].track.id === id, 3000, sel);
    // Pads : hot cue posé, puis effacé avec Shift
    const [kh] = keyOf(m, e => e.id === 'A.pad.hot.2');
    await W(() => { decks[0].padMode = 'roll'; decks[0].track.hot[1] = null; decks[0].seek(30); });
    await send(kh, 127); await noteOff(kh); r.hot = await W(() => decks[0].padMode === 'hot' && decks[0].track.hot[1] != null);
    const kd = keyOf(m, e => e.id === 'A.hotdel2');
    if (kd) { await send(kd[0], 127); await noteOff(kd[0]); r.hotdel = await W(() => decks[0].track.hot[1] == null); } else r.hotdel = 'absent';
    // Casque
    const [kq] = keyOf(m, e => e.id === 'A.cuech');
    const q0 = await W(() => decks[0].cueOn); await send(kq, 127); await noteOff(kq); r.cuech = await W(q => decks[0].cueOn !== q, q0); if (r.cuech) { await send(kq, 127); await noteOff(kq); }
    const ok = r.play && r.led && r.pause && r.cue && r.sync && r.pitchOk && [r.fader, r.high, r.low, r.filter, r.xf].every(x => x === 'ok') && r.touch && r.untouch && r.jog && r.browse && r.load && r.hot && r.hotdel === true && r.cuech;
    check(ok, tag + ' : messages simulés (play et voyant, cue, sync, pitch 14 bits, fader, EQ, filtre, crossfader, jog, navigation, chargement, hot cue, Shift + pad, casque)', ok ? '' : JSON.stringify(r));
  }
  // 4 platines : la DDJ-FLX6 envoie la platine 4 sur le canal 4
  await W(() => { Controllers.load(MIXLAB_MAPPINGS.find(m => m.name === 'Pioneer DJ DDJ-FLX6'), true); decks[3].pause(); });
  await W(() => { __midi.send('in1', 0x93, 0x0B, 127); __midi.send('in1', 0x83, 0x0B, 0); });
  check(await W(() => decks[3].playing), 'DDJ-FLX6 : Play sur le canal 4 → platine D');
  await W(() => decks[3].pause());

  /* ---------- 3. couleurs des pads ---------- */
  await W(() => {
    Controllers.load({ name: 'Test couleurs', device: '', map: {
      'n7.0': { id: 'A.pad.hot.1', led: { rgb: 'h232' } }, 'n7.1': { id: 'A.pad.hot.2', led: { rgb: 'h232' } },
      'n7.2': { id: 'A.pad.hot.3', led: { rgb: 'index', palette: [['#ff0000', 5], ['#00ff00', 9], ['#0000ff', 13]] } },
      'n7.3': { id: 'A.pad.hot.4', led: { rgb: 'h232' } } } }, true);
    const t = decks[0].track; t.hot[0] = 1; t.hot[1] = 2; t.hot[2] = 3; t.hot[3] = null;
    t.hotMeta = t.hotMeta || []; t.hotMeta[0] = { color: '#ff0000' }; t.hotMeta[1] = { color: '#00ff00' }; t.hotMeta[2] = { color: '#2030f0' };
    midi.last = {}; __midi.log.length = 0;
  });
  const col = k => W(k => { const L = __midi.log.filter(x => x.data[0] === 0x97 && x.data[1] === k); return L.length ? L[L.length - 1].data[2] : null; }, k);
  await wait(() => __midi.log.some(x => x.data[0] === 0x97 && x.data[1] === 2));
  const c1 = await col(0), c2 = await col(1), c3 = await col(2), c4 = await col(3);
  check(c1 === 0x60 && c2 === 0x1C && c3 === 13 && c4 === 0, 'Pads RGB : rouge 0x60, vert 0x1C (table Hercules), palette à index, pad vide éteint', [c1, c2, c3, c4].join(','));
  await W(() => { decks[0].track.hotMeta[0] = { color: '#ffffff' }; });
  check(await wait(() => { const L = __midi.log.filter(x => x.data[0] === 0x97 && x.data[1] === 0); return L.length && L[L.length - 1].data[2] === 0x7F; }), 'Pads RGB : la couleur suit le changement de couleur du cue (blanc 0x7F)');
  await W(() => { decks[0].track.hotMeta = []; decks[0].track.hot = decks[0].track.hot.map(() => null); });

  /* ---------- 4. leçons : « Sur ta table » ---------- */
  await W(() => Controllers.load(MIXLAB_MAPPINGS.find(m => m.name === 'Pioneer DJ DDJ-FLX4'), true));
  const hw = await W(() => ['A.play', 'B.sync', 'A.fader', 'B.pad3', 'xf', 'A.jog', 'master', '#p-lib'].map(id => { const r = Controllers.hwFor(id); return r ? r.text : null; }));
  check(hw[0] === 'Sur ta table : PLAY/PAUSE, platine gauche' && hw[1] === 'Sur ta table : BEAT SYNC, platine droite' && /fader de voie, platine gauche/.test(hw[2]) && /pad 3 \(mode HOT CUE\), platine droite/.test(hw[3]) && /crossfader$/.test(hw[4]) && /JOG/.test(hw[5]) && /MASTER LEVEL/.test(hw[6]) && hw[7] === null,
    'Correspondance commande du logiciel → commande de la table', JSON.stringify(hw));
  await W(() => { Parcours.go(0, 0); Parcours.go(0, Parcours.P.steps.findIndex(s => s.target === 'A.play')); });
  check(await wait(() => { const e = document.querySelector('#pc-now .cx-hw'); return e && /Sur ta table : PLAY\/PAUSE, platine gauche/.test(e.textContent); }), 'Parcours : l’étape indique le bouton de la table');
  await page.screenshot({ path: '/tmp/mixlab-mapping-lecon.png' });
  await W(() => Parcours.go(0, Parcours.P.steps.findIndex(s => s.target === 'A.fader')));
  check(await wait(() => { const e = document.querySelector('#pc-now .cx-hw'); return e && /fader de voie, platine gauche/.test(e.textContent); }), 'Parcours : l’indication suit l’étape (fader de A)');
  await W(() => { midi.map = {}; Controllers.clearMeta(); });
  check(await wait(() => !document.querySelector('#pc-now .cx-hw')), 'Sans mapping : pas d’indication');
  await W(() => Parcours.exit && Parcours.exit());
  await W(() => Controllers.load(MIXLAB_MAPPINGS.find(m => m.name === 'Hercules DJControl Inpulse 200'), true));
  check(await W(() => { const r = Controllers.hwFor('A.cuech'); return r && r.text === 'Sur ta table : PFL (casque), platine gauche'; }), 'Inpulse 200 : PFL pour le casque de A');

  /* ---------- 5. Tester ma table ---------- */
  await W(() => { Controllers.load(MIXLAB_MAPPINGS.find(m => m.name === 'Pioneer DJ DDJ-FLX4'), true); document.querySelector('#midi-modal').hidden = false; decks[0].pause(); });
  check(await W(() => [...document.querySelectorAll('#lib-maps li')].filter(li => /Non vérifié sur le matériel/.test(li.textContent)).length >= 6 && /non vérifié sur le matériel/.test(document.querySelector('#map-active').textContent)), 'Bibliothèque et mapping actif : « non vérifié sur le matériel » affiché');
  await page.click('#cxt-btn');
  check(await W(() => !document.querySelector('#cxt-modal').hidden && document.querySelectorAll('#cxt-list .cxt-c').length === Object.keys(midi.map).length), 'Tester ma table : une pastille par commande du mapping');
  await W(() => { __midi.send('in1', 0x90, 0x0B, 127); __midi.send('in1', 0x80, 0x0B, 0); __midi.send('in1', 0xB0, 0x13, 100); __midi.send('in1', 0xB0, 0x33, 3); __midi.send('in1', 0x9A, 0x05, 127); });
  const tm = await W(() => ({ play: document.querySelector('#cxt-list .cxt-c[data-key="n0.11"]').classList.contains('hit'), fader: document.querySelector('#cxt-list .cxt-c[data-key="c0.19"]').classList.contains('hit'),
    pad: document.querySelector('#cxt-list .cxt-c[data-key="n10.5"]').classList.contains('hit'), n: document.querySelector('#cxt-n').textContent, deck: decks[0].playing }));
  check(tm.play && tm.fader && tm.pad && /^3 \//.test(tm.n) && !tm.deck, 'Tester ma table : chaque commande touchée s’éclaire, sans piloter le logiciel', JSON.stringify(tm));
  await W(() => __midi.send('in1', 0x9F, 0x40, 127));
  check(await W(() => /Message inconnu/.test(document.querySelector('#cxt-mon').textContent)), 'Tester ma table : un message que le mapping ne connaît pas est signalé');
  await page.screenshot({ path: '/tmp/mixlab-tester-table.png' });
  const leds = await W(() => Controllers.testLeds().length);
  await W(() => { __midi.log.length = 0; Controllers.testSweep(15); });
  check(await wait(() => !Controllers.T.sweep, 15000), 'Tester ma table : balayage des voyants terminé');
  const sw = await W(() => { const L = Controllers.testLeds(); const on = L.filter(l => __midi.log.some(x => { const p = /^([nc])(\d+)\.(\d+)$/.exec(l.out); return x.data[0] === ((p[1] === 'n' ? 0x90 : 0xB0) | +p[2]) && x.data[1] === +p[3] && x.data[2] === l.on; })).length; const last = __midi.log[__midi.log.length - 1]; return { on, n: L.length, lastOff: last && last.data[2] === 0 }; });
  check(leds > 40 && sw.on === sw.n && sw.lastOff, 'Tester ma table : chaque voyant allumé tour à tour, puis éteint', JSON.stringify(sw));
  await page.keyboard.press('Escape');
  check(await W(() => document.querySelector('#cxt-modal').hidden && !Controllers.T.on), 'Échap ferme le test');
  await W(() => { __midi.send('in1', 0x90, 0x0B, 127); __midi.send('in1', 0x80, 0x0B, 0); });
  check(await W(() => decks[0].playing), 'Après le test, la table pilote de nouveau le logiciel');
  await W(() => decks[0].pause());

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Mappings de marque : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
