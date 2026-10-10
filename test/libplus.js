'use strict';
// Test de la grille (carte de tempo, édition, horloge, annulation) et de la bibliothèque en plus
// (LUFS, passages vocaux, dossiers de playlists, Serato, Traktor, dossiers surveillés, charge).
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };

/* ---------- fichiers fabriqués ---------- */
// WAV mono 16 bits : un kick tous les temps (tempo qui peut changer), plus des blocs en option.
function wav(sec, bpmAt, extra = []) {
  const sr = 22050, n = Math.round(sr * sec), data = Buffer.alloc(n * 2), x = new Float32Array(n);
  let t = .5;
  while (t < sec - .3) { const s0 = Math.round(t * sr); for (let k = 0; k < sr * .18 && s0 + k < n; k++) { const tt = k / sr; x[s0 + k] += Math.sin(2 * Math.PI * (50 * tt + 3 * (1 - Math.exp(-30 * tt)))) * Math.exp(-9 * tt) * .8; } t += 60 / bpmAt(t); }
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 30000))), i * 2);
  const fmt = Buffer.alloc(16); fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(sr, 4); fmt.writeUInt32LE(sr * 2, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14);
  const chunk = (id, b) => { const h = Buffer.alloc(8); h.write(id, 0, 'latin1'); h.writeUInt32LE(b.length, 4); return Buffer.concat([h, b, b.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
  const body = Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', fmt), chunk('data', data), ...extra.map(([id, b]) => chunk(id, b))]);
  const head = Buffer.alloc(8); head.write('RIFF', 0); head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}
const be32 = v => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b; };
const f32 = v => { const b = Buffer.alloc(4); b.writeFloatBE(v); return b; };
const cstr = s => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.alloc(1)]);
const syncsafe = v => Buffer.from([(v >> 21) & 127, (v >> 14) & 127, (v >> 7) & 127, v & 127]);
// Serato Markers2 : COLOR, deux CUE, une LOOP, BPMLOCK
function markers2() {
  const ent = (name, d) => Buffer.concat([cstr(name), be32(d.length), d]);
  const cue = (i, ms, rgb, name) => Buffer.concat([Buffer.from([0, i]), be32(ms), Buffer.from([0, ...rgb, 0, 0]), cstr(name)]);
  const loop = Buffer.concat([Buffer.from([0, 0]), be32(4000), be32(5920), Buffer.from([255, 255, 255, 255, 0, 0x27, 0xaa, 0xe1, 0]), cstr('Boucle Serato')]);
  const payload = Buffer.concat([Buffer.from([1, 1]), ent('COLOR', Buffer.from([0, 0xcc, 0, 0])), ent('CUE', cue(0, 1500, [0xcc, 0, 0], 'Intro')), ent('CUE', cue(3, 9000, [0, 0xcc, 0], '')),
    ent('LOOP', loop), ent('BPMLOCK', Buffer.from([0])), Buffer.alloc(1)]);
  let b64 = payload.toString('base64').replace(/=+$/, ''); b64 = b64.replace(/(.{72})/g, '$1\n');
  return Buffer.concat([Buffer.from([1, 1]), Buffer.from(b64, 'latin1'), Buffer.alloc(1)]);
}
// Serato BeatGrid : 64 temps à 120 BPM depuis 0,5 s, puis 124 BPM
const beatgrid = () => Buffer.concat([Buffer.from([1, 0]), be32(2), f32(.5), be32(64), f32(32.5), f32(124), Buffer.from([0])]);
function id3(frames) {
  const fr = frames.map(([desc, data]) => { const body = Buffer.concat([Buffer.from([0]), cstr('application/octet-stream'), cstr(''), cstr(desc), data]); return Buffer.concat([Buffer.from('GEOB'), syncsafe(body.length), Buffer.from([0, 0]), body]); });
  const all = Buffer.concat(fr);
  return Buffer.concat([Buffer.from('ID3'), Buffer.from([4, 0, 0]), syncsafe(all.length), all]);
}
// MP4 : moov > udta > meta > ilst > « ---- » (mean, name, data), comme les tags Serato des M4A
function mp4() {
  const atom = (t, ...b) => { const body = Buffer.concat(b); return Buffer.concat([be32(8 + body.length), Buffer.from(t, 'latin1'), body]); };
  const tag = (name, raw) => {
    const inner = Buffer.concat([cstr('application/octet-stream'), cstr(''), cstr(name === 'markersv2' ? 'Serato Markers2' : 'Serato BeatGrid'), raw]).toString('base64');
    return atom('----', atom('mean', Buffer.alloc(4), Buffer.from('com.serato.dj')), atom('name', Buffer.alloc(4), Buffer.from(name)), atom('data', Buffer.from([0, 0, 0, 1, 0, 0, 0, 0]), Buffer.from(inner)));
  };
  return Buffer.concat([atom('ftyp', Buffer.from('M4A \0\0\0\0M4A ')), atom('moov', atom('udta', atom('meta', Buffer.alloc(4), atom('ilst', tag('markersv2', markers2()), tag('beatgrid', beatgrid())))))]);
}
// crates Serato et base « database V2 »
const u16 = s => { const b = Buffer.alloc(s.length * 2); for (let i = 0; i < s.length; i++) b.writeUInt16BE(s.charCodeAt(i), i * 2); return b; };
const sch = (tag, b) => Buffer.concat([Buffer.from(tag, 'latin1'), be32(b.length), b]);
const crate = paths => Buffer.concat([sch('vrsn', u16('1.0/Serato ScratchLive Crate')), ...paths.map(p => sch('otrk', sch('ptrk', u16(p))))]);
const database = recs => Buffer.concat([sch('vrsn', u16('2.0/Serato Scratch LIVE Database')), ...recs.map(r => sch('otrk', Buffer.concat([sch('ttyp', u16('wav')), sch('pfil', u16(r.p)), sch('tsng', u16(r.t)), sch('tart', u16(r.a)), sch('tbpm', u16(r.bpm))])))]);
const NML = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<NML VERSION="19"><HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"></HEAD>
<COLLECTION ENTRIES="2">
<ENTRY MODIFIED_DATE="2026/9/1" TITLE="Live" ARTIST="Traktor"><LOCATION DIR="/:Users/:dj/:Music/:" FILE="Traktor - Live.wav" VOLUME="Macintosh HD" VOLUMEID="x"></LOCATION>
<INFO BITRATE="352800" GENRE="Disco" COMMENT="joué en live" PLAYCOUNT="3" RANKING="204" COLOR="3" IMPORT_DATE="2026/8/30" PLAYTIME="30"></INFO>
<TEMPO BPM="122.000000" BPM_QUALITY="100.000000"></TEMPO><MUSICAL_KEY VALUE="21"></MUSICAL_KEY>
<CUE_V2 NAME="AutoGrid" DISPL_ORDER="0" TYPE="4" START="500.000" LEN="0.000000" REPEATS="-1" HOTCUE="-1"><GRID BPM="120.000000"></GRID></CUE_V2>
<CUE_V2 NAME="n.n." DISPL_ORDER="0" TYPE="4" START="16500.000" LEN="0.000000" REPEATS="-1" HOTCUE="-1"><GRID BPM="124.000000"></GRID></CUE_V2>
<CUE_V2 NAME="Drop" DISPL_ORDER="0" TYPE="0" START="2000.000" LEN="0.000000" REPEATS="-1" HOTCUE="0"></CUE_V2>
<CUE_V2 NAME="n.n." DISPL_ORDER="0" TYPE="5" START="4000.000" LEN="2000.000" REPEATS="-1" HOTCUE="1"></CUE_V2>
<CUE_V2 NAME="Pont" DISPL_ORDER="0" TYPE="0" START="12000.000" LEN="0.000000" REPEATS="-1" HOTCUE="-1"></CUE_V2>
</ENTRY>
<ENTRY TITLE="Absent" ARTIST="Personne"><LOCATION DIR="/:Users/:dj/:Music/:" FILE="absent.mp3" VOLUME="Macintosh HD"></LOCATION><TEMPO BPM="128"></TEMPO></ENTRY>
</COLLECTION>
<PLAYLISTS><NODE TYPE="FOLDER" NAME="$ROOT"><SUBNODES COUNT="1">
<NODE TYPE="FOLDER" NAME="Soirées"><SUBNODES COUNT="1"><NODE TYPE="FOLDER" NAME="2026"><SUBNODES COUNT="1">
<NODE TYPE="PLAYLIST" NAME="Warm"><PLAYLIST ENTRIES="2" TYPE="LIST" UUID="u1">
<ENTRY><PRIMARYKEY TYPE="TRACK" KEY="Macintosh HD/:Users/:dj/:Music/:Traktor - Live.wav"></PRIMARYKEY></ENTRY>
<ENTRY><PRIMARYKEY TYPE="TRACK" KEY="Macintosh HD/:Users/:dj/:Music/:absent.mp3"></PRIMARYKEY></ENTRY>
</PLAYLIST></NODE></SUBNODES></NODE></SUBNODES></NODE>
</SUBNODES></NODE></PLAYLISTS></NML>`;

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.length >= 4 && decks[1].track && window.Grid && window.LibPlus, null, { timeout: 60000 });
  await sleep(500);

  /* ---------- LUFS ---------- */
  const lu = await page.evaluate(() => {
    const sr = ctx.sampleRate, A = Math.pow(10, -14 / 20), mk = (sec, sil) => { const n = Math.round(sr * sec), b = ctx.createBuffer(2, n, sr); for (let c = 0; c < 2; c++) { const x = b.getChannelData(c); for (let i = 0; i < n; i++) x[i] = i < sil * sr ? 0 : A * Math.sin(2 * Math.PI * 997 * i / sr); } return b; };
    // « presque sinus » : une sinusoïde modulée en amplitude, calée pour la même énergie
    const am = (() => { const n = sr * 12, b = ctx.createBuffer(2, n, sr), g = A / Math.sqrt(1 + .25 / 2); for (let c = 0; c < 2; c++) { const x = b.getChannelData(c); for (let i = 0; i < n; i++) x[i] = g * (1 + .5 * Math.sin(2 * Math.PI * 2 * i / sr)) * Math.sin(2 * Math.PI * 997 * i / sr); } return b; })();
    return { sine: LibPlus.lufs(mk(12, 0)), gated: LibPlus.lufs(mk(20, 8)), am: LibPlus.lufs(am), silent: LibPlus.lufs(ctx.createBuffer(2, sr * 3, sr)), sr };
  });
  check(Math.abs(lu.sine + 14) <= .3, 'LUFS : sinus 997 Hz à -14 LUFS mesuré à ' + lu.sine, lu.sr + ' Hz');
  check(Math.abs(lu.gated + 14) <= .3, 'LUFS : 8 s de silence avant ne changent rien (portes)', String(lu.gated));
  check(Math.abs(lu.am + 14) <= .3, 'LUFS : sinus modulé de même énergie', String(lu.am));
  check(lu.silent === -70, 'LUFS : silence à -70 (porte absolue)');

  // gain automatique façon ReplayGain : mesuré à la sortie du gain auto de la platine
  const ag = await page.evaluate(async () => {
    const sr = ctx.sampleRate, A = Math.pow(10, -14 / 20), n = sr * 20, b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) { const x = b.getChannelData(c); for (let i = 0; i < n; i++) x[i] = A * Math.sin(2 * Math.PI * 997 * i / sr); }
    const t = addTrack(b, { title: 'Sinus', artist: 'Test' });
    for (let k = 0; k < 100 && t.lufs == null; k++) await new Promise(r => setTimeout(r, 100));
    LibPlus.P.agMode = 'lufs'; LibPlus.P.lufsTarget = -10; S.autoGain = true;
    const d = decks[0]; if (d.sync) d.toggleSync(); d.load(t); d.seek(2);
    const an = ctx.createAnalyser(); an.fftSize = 4096; d.auto.connect(an);
    d.togglePlay(); await new Promise(r => setTimeout(r, 700));
    const buf = new Float32Array(an.fftSize); let s = 0, c = 0;
    for (let k = 0; k < 10; k++) { an.getFloatTimeDomainData(buf); for (const v of buf) { s += v * v; c++; } await new Promise(r => setTimeout(r, 50)); }
    d.togglePlay(); d.auto.disconnect(an);
    const db = LibPlus.agDb(d); LibPlus.P.agMode = 'rms'; LibPlus.P.lufsTarget = -14; d.applyAutoGain();
    return { lufs: t.lufs, db, rms: 10 * Math.log10(s / c), col: !!document.querySelector('th, .th') };
  });
  check(Math.abs(ag.db - 4) < .35, 'Gain auto LUFS : +' + ag.db.toFixed(1) + ' dB pour viser -10 LUFS');
  check(Math.abs(ag.rms - (-14 - 3.01 + 4)) < .6, 'Gain auto LUFS : niveau mesuré après le gain', ag.rms.toFixed(2) + ' dB RMS');

  /* ---------- carte de tempo : morceau joué en live, de 118 à 126 BPM ---------- */
  const tm = await page.evaluate(() => {
    const sr = ctx.sampleRate, dur = 60, n = sr * dur, buf = ctx.createBuffer(2, n, sr), L = buf.getChannelData(0), beats = []; let t = 1;
    while (t < dur - 1) { beats.push(t); t += 60 / (118 + 8 * (t / dur)); }
    for (const bt of beats) { const s0 = Math.round(bt * sr); for (let k = 0; k < sr * .2 && s0 + k < n; k++) { const tt = k / sr; L[s0 + k] += Math.sin(2 * Math.PI * (50 * tt + 3 * (1 - Math.exp(-30 * tt)))) * Math.exp(-8 * tt) * .8; } }
    buf.copyToChannel(L, 1);
    const tr = addTrack(buf, { title: 'Live', artist: 'Batteur' });
    const err = () => { const e = []; for (const bt of beats.slice(4, -4)) { const b = Math.round(Grid.beatOf(tr, bt)); e.push(Math.abs(Grid.timeOf(tr, b) - bt)); } e.sort((a, b) => a - b); return { med: e[e.length >> 1] * 1000, max: e[e.length - 1] * 1000 }; };
    const before = err(), d = decks[0];
    d.load(tr); Grid.Undo.clear();
    const res = Grid.analyzeTempo(d), after = err();
    // tout ce qui compte les temps passe par la carte
    d.seek(15); const p1 = d.position(), bi = d.beatIdx(p1), back = d.timeOfBeat(bi);
    const local15 = d.bpm, local45 = (d.seek(45), d.bpm);
    let mono = true; for (let k = 1; k < 200; k++) if (Grid.timeOf(tr, k) <= Grid.timeOf(tr, k - 1)) mono = false;
    // sync : la platine B suit le tempo local de A (pas son BPM moyen)
    const o = decks[1]; if (o.sync) o.toggleSync(); d.seek(30); S.master = d; o.sync = true; o.matchTempo(true);
    const syncOk = Math.abs(o.bpm - d.bpm) < .02, aBpm = d.bpm, oBpm = o.bpm; o.sync = false; o.setPitch(0); S.master = null;
    const sv = Object.values(store.get('grid.tracks', {})).some(r => r.tm && r.tm.m.length === tr.tempoMap.m.length);
    return { kind: res && res.kind, n: tr.tempoMap && tr.tempoMap.m.length, before, after, back: Math.abs(back - p1), local15, local45, mono, syncOk, aBpm, oBpm, avg: tr.bpm, saved: sv, undo: Grid.Undo.size };
  });
  check(tm.kind === 'map' && tm.n >= 3, 'Grille dynamique : carte de tempo à ' + tm.n + ' repères');
  check(tm.after.med < 6 && tm.after.max < 15, 'Grille dynamique : temps placés à ' + tm.after.med.toFixed(1) + ' ms (médiane), ' + tm.after.max.toFixed(1) + ' ms au pire', 'grille fixe : ' + tm.before.med.toFixed(0) + ' ms');
  check(tm.before.med > 30, 'La grille fixe ne suivait pas ce morceau (contrôle)', tm.before.med.toFixed(0) + ' ms');
  check(tm.back < 1e-6 && tm.mono, 'Positions : temps ↔ numéro de temps cohérents sur la platine');
  check(Math.abs(tm.local15 - 120) < 1 && Math.abs(tm.local45 - 124) < 1, 'BPM local suivi : ' + tm.local15.toFixed(1) + ' à 15 s, ' + tm.local45.toFixed(1) + ' à 45 s', 'moyenne ' + tm.avg);
  check(tm.syncOk, 'Sync sur le tempo local de la carte', tm.aBpm.toFixed(2) + ' → ' + tm.oBpm.toFixed(2));
  check(tm.saved, 'Carte de tempo gardée pour le morceau');
  check(tm.undo === 1, 'Analyse du tempo annulable');

  /* ---------- horloge maître ---------- */
  const ck = await page.evaluate(async () => {
    const o = decks[1]; Grid.clock.setBpm(128); Grid.clock.setOn(true);
    const tgt = o.syncTarget() === Grid.clock; o.toggleSync(); const bpm = o.bpm, master = S.master === Grid.clock;
    o.togglePlay(); await new Promise(r => setTimeout(r, 600));
    const ph = Math.abs(((o.beatPos() - Grid.clock.beatPos()) % 1 + 1.5) % 1 - .5);
    o.togglePlay(); o.toggleSync(); Grid.clock.setOn(false); o.setPitch(0);
    return { tgt, bpm, master, ph, btn: !!document.querySelector('#clk-btn') };
  });
  check(ck.tgt && Math.abs(ck.bpm - 128) < .01, 'Horloge interne : la platine en Sync suit 128 BPM sans autre platine', ck.bpm.toFixed(2));
  check(!ck.master && ck.btn, 'Horloge : jamais maître d’une platine, bouton présent');
  check(ck.ph < .06, 'Horloge : platine en phase avec l’horloge', 'écart ' + ck.ph.toFixed(3) + ' temps');

  /* ---------- édition de grille et annulation ---------- */
  const ge = await page.evaluate(() => {
    const d = decks[1], tr = LIB.tracks.find(t => t.title === 'Quai 9'); d.load(tr); Grid.Undo.clear();
    const g0 = tr.grid, b0 = tr.bpm, r = {};
    Grid.nudge(d, 10); r.nudge = Math.abs(tr.grid - g0 - .01) < 1e-9;
    Grid.stretch(d, .1); r.stretch = Math.abs(tr.bpm - b0 - .1) < 1e-6;
    Grid.setBpmExact(d, '126,5'); r.exact = tr.bpm === 126.5;
    // deux points : A sur un temps, B 64 temps plus loin à 127,3 BPM
    d.seek(tr.grid + 4 * 60 / 127.3); Grid.pointA(d); d.seek(tr.grid + 68 * 60 / 127.3); const pb = Grid.pointB(d);
    r.two = pb && Math.abs(tr.bpm - 127.3) < .01;
    d.seek(tr.grid + 60 / tr.bpm * 5); const before = Math.round(d.beatIdx(d.position())); Grid.downbeat(d); const after = Math.round(d.beatIdx(d.position()));
    r.down = ((after % 4) + 4) % 4 === 0 && before % 4 !== 0;
    r.size = Grid.Undo.size;
    return { ...r, g0, b0 };
  });
  check(ge.nudge && ge.stretch && ge.exact, 'Grille : décalage en ms, étirement, BPM exact');
  check(ge.two, 'Grille sur deux points : BPM retrouvé à 127,30');
  check(ge.down, 'Temps fort posé sous la tête de lecture');
  for (let k = 0; k < 5; k++) await page.keyboard.press('Control+z');
  const gu = await page.evaluate(([g0, b0]) => { const tr = decks[1].track; return { ok: Math.abs(tr.grid - g0) < 1e-9 && tr.bpm === b0, size: Grid.Undo.size }; }, [ge.g0, ge.b0]);
  check(gu.ok && gu.size === 0, 'Ctrl+Z ×5 : grille revenue à l’état d’origine');

  const un = await page.evaluate(() => {
    const d = decks[1], tr = d.track; if (d.playing) d.togglePlay(); Grid.Undo.clear(); const r = {};
    const c0 = tr.cue; d.seek(20.3); d.cueDown(); d.cueUp(); r.cueSet = tr.cue !== c0;
    Grid.undo(); r.cue = tr.cue === c0;
    tr.hot[5] = null; d.seek(33); d.hotDown(5); r.hotSet = tr.hot[5] != null; Grid.undo(); r.hot = tr.hot[5] == null;
    const other = LIB.tracks.find(t => t.title === 'Ligne 7'); d.load(other); r.loaded = d.track === other; Grid.undo(); r.load = d.track === tr;
    r.empty = Grid.undo() === null;
    return r;
  });
  check(un.cueSet && un.cue, 'Annuler : point de cue');
  check(un.hotSet && un.hot, 'Annuler : hot cue');
  check(un.loaded && un.load, 'Annuler : chargement (le morceau précédent revient)');
  check(un.empty, 'Annuler sans rien : « Rien à annuler »');

  /* ---------- passages vocaux, repères de minutes, mini-waveform ---------- */
  const vo = await page.evaluate(async () => {
    const base = LIB.tracks.find(t => t.title === 'Halogène').buffer, sr = base.sampleRate, n = base.length, buf = ctx.createBuffer(2, n, sr);
    const L = new Float32Array(base.getChannelData(0)), v0 = 40, v1 = 70; let ph = 0;
    const F = [[700, 80], [1200, 90], [2600, 120]], st = F.map(() => [0, 0]);
    const co = F.map(([f, bw]) => { const r = Math.exp(-Math.PI * bw / sr), th = 2 * Math.PI * f / sr; return [2 * r * Math.cos(th), -r * r]; });
    for (let i = Math.round(v0 * sr); i < v1 * sr && i < n; i++) {
      const t = i / sr, syl = (t * 2.2) % 1, env = syl < .8 ? Math.sin(Math.PI * syl / .8) : 0;
      const f0 = 200 * Math.pow(2, (Math.sin(t * .9) * 4 + Math.floor(t * 2.2) % 5) / 12) * (1 + .03 * Math.sin(2 * Math.PI * 5.5 * t));
      ph += f0 / sr; ph -= Math.floor(ph); const src = (ph < .4 ? Math.sin(Math.PI * ph / .4) : 0) - .25;
      let y = 0; F.forEach((c, k) => { const s = st[k], o = src * .1 + co[k][0] * s[0] + co[k][1] * s[1]; s[1] = s[0]; s[0] = o; y += o / (k + 1); });
      L[i] += y * env * .04;
    }
    buf.copyToChannel(L, 0); buf.copyToChannel(L, 1);
    const voc = await LibPlus.vocalsOf(buf), none = await LibPlus.vocalsOf(base);
    const t = addTrack(buf, { title: 'Chanté', artist: 'Test' });
    for (let k = 0; k < 150 && !t.vocals; k++) await new Promise(r => setTimeout(r, 100));
    // vue d'ensemble : bande vocale en haut, repères de minutes en bas
    const W = 800, H = 40, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    Structure.drawOv(g, t, W, H);
    const px = (x, y) => g.getImageData(x, y, 1, 1).data;
    const xm = Math.round(60 / t.duration * W), xv = Math.round(55 / t.duration * W), xn = Math.round(20 / t.duration * W);
    const tick = px(xm, H - 2)[3] > 0 && px(xm, H - 2).join() !== px(xm + 3, H - 2).join();
    const band = px(xv, 1).join() !== px(xn, 1).join();
    return { voc, none, tv: t.vocals, tick, band };
  });
  const inVoice = vo.voc.length && vo.voc.every(r => r.start >= 38 && r.end <= 72) && vo.voc.reduce((s, r) => s + r.end - r.start, 0) > 20;
  check(inVoice, 'Passages vocaux : voix de synthèse trouvée entre 40 et 70 s', JSON.stringify(vo.voc));
  check(vo.none.length === 0, 'Passages vocaux : rien sur la démo sans voix');
  check(vo.tv && vo.tv.length > 0, 'Passages vocaux calculés en fond à l’import');
  check(vo.tick && vo.band, 'Vue d’ensemble : repère de la minute 1 et bande vocale dessinés');
  await page.evaluate(() => { lib.view = 'all'; renderTable(); });
  await sleep(200);
  const mw = await page.evaluate(() => ({ n: document.querySelectorAll('td.lx-mw img').length, src: (document.querySelector('td.lx-mw img') || {}).src || '', th: [...document.querySelectorAll('th')].some(x => /Forme/.test(x.textContent)) }));
  check(mw.n >= 4 && mw.src.startsWith('data:image/png') && mw.th, 'Liste : colonne mini-waveform (' + mw.n + ' vignettes)');

  /* ---------- analyse complétée, analyse forcée ---------- */
  const an = await page.evaluate(async () => {
    const t = LIB.tracks.find(x => x.title === 'Néons'); for (let k = 0; k < 100 && t.lufs == null; k++) await new Promise(r => setTimeout(r, 100));
    const l0 = t.lufs; delete t.lufs; const n1 = await LibPlus.complete([t]);
    const tr = LIB.tracks.find(x => x.title === 'Live'), had = Grid.has(tr); await LibPlus.force([tr]);
    return { l0, l1: t.lufs, n1, had, after: Grid.has(tr), bpm: tr.bpm };
  });
  check(an.n1 === 1 && an.l1 === an.l0, 'Analyse complétée : seule la loudness manquante est recalculée', an.l1 + ' LUFS');
  check(an.had && !an.after && an.bpm > 100, 'Analyse forcée : grille recalculée', an.bpm + ' BPM');

  /* ---------- Serato : tags et crates ---------- */
  const srt = { wav: wav(40, t => t < 32.5 ? 120 : 124, [['id3 ', id3([['Serato Markers2', markers2()], ['Serato BeatGrid', beatgrid()]])]]).toString('base64'), mp4: mp4().toString('base64'),
    crates: [['House.crate', crate(['Users/dj/Music/Serato - Test.wav'])], ['House%%Deep.crate', crate(['Users/dj/Music/Serato - Test.wav', 'Users/dj/Music/inconnu.mp3'])], ['House%%Deep%%Late.crate', crate(['Users/dj/Music/Traktor - Live.wav'])]].map(([n, b]) => [n, b.toString('base64')]),
    db: database([{ p: 'Users/dj/Music/Serato - Test.wav', t: 'Titre Serato', a: 'Artiste Serato', bpm: '120.00' }]).toString('base64') };
  const se = await page.evaluate(async s => {
    const u8 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
    const m = LibPlus.serato.parse(u8(s.mp4));
    const r = { mp4: m && m.cues.length === 2 && m.cues[0].name === 'Intro' && m.loops.length === 1 && m.grid && m.grid.length === 2 && Math.abs(m.grid[0].bpm - 120) < .01 && m.color === '#cc0000' };
    await importFiles([new File([u8(s.wav)], 'Serato - Test.wav', { type: 'audio/wav' })], null);
    const t = LIB.tracks.find(x => x.file === 'Serato - Test.wav');
    r.found = !!t;
    if (t) {
      r.hot0 = Math.abs(t.hot[0] - 1.5) < .01 && t.hotMeta[0] && t.hotMeta[0].name === 'Intro'; r.hot3 = Math.abs(t.hot[3] - 9) < .01;
      r.loop = t.loops && t.loops.length === 1 && Math.abs(t.loops[0].start - 4) < .01 && t.loops[0].label === 'Boucle Serato';
      r.color = t.color > 0; r.map = Grid.has(t) && Math.abs(Grid.bpmAt(t, 10) - 120) < .05 && Math.abs(Grid.bpmAt(t, 36) - 124) < .05;
    }
    const files = s.crates.map(([n, b]) => ({ name: 'Subcrates/' + n, bytes: u8(b) })).concat([{ name: 'database V2', bytes: u8(s.db) }]);
    const res = LibPlus.serato.dir(files, '/Users/dj/Music/_Serato_');
    r.parsed = res.tracks.length === 3 && res.tracks[0].path === '/Users/dj/Music/Serato - Test.wav' && res.tracks[0].title === 'Titre Serato' && res.tree.length === 3;
    r.win = LibPlus.serato.root('E:\\_Serato_') === 'E:\\' && LibPlus.serato.root('/Volumes/USB/_Serato_') === '/Volumes/USB/';
    const rep = await LibPlus.importTree(res);
    const by = n => LIB.playlists.find(p => p.name === n);
    const H = by('House'), D = by('Deep'), Lt = by('Late'), T = LibPlus.tree.pl;
    r.nest = !!(H && D && Lt && T[D.id] && T[D.id].parent === 'pl:' + H.id && T[Lt.id] && T[Lt.id].parent === 'pl:' + D.id);
    r.union = H && LibPlus.plIds(H).includes(t.id) && H.ids.length === 1;
    r.missing = rep.missing.length;
    return r;
  }, srt);
  check(se.mp4, 'Serato MP4 : cues, boucle, couleur et grille lus dans les atomes');
  check(se.found && se.hot0 && se.hot3, 'Serato : hot cues et noms repris du tag GEOB à l’import');
  check(se.loop && se.color, 'Serato : boucle et couleur reprises');
  check(se.map, 'Serato : grille à deux repères (120 puis 124 BPM) posée en carte de tempo');
  check(se.parsed && se.win, 'Serato : crates, sous-crates (%%) et database V2 lues');
  check(se.nest && se.union, 'Serato : sous-crates imbriquées, la crate parente montre aussi leurs morceaux');
  check(se.missing >= 1, 'Serato : morceaux absents signalés', se.missing + ' absent(s)');

  /* ---------- Traktor NML ---------- */
  const live = wav(30, () => 122).toString('base64');
  const tk = await page.evaluate(async ([nml, w]) => {
    const u8 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
    await importFiles([new File([u8(w)], 'Traktor - Live.wav', { type: 'audio/wav' })], null);
    const res = LibPlus.parseNML(nml), r0 = res.tracks[0];
    const r = { n: res.tracks.length, path: r0.path, key: r0.key && r0.key.pc === 9 && r0.key.minor, rating: r0.rating, tm: r0.tempoMap && r0.tempoMap.m.length,
      win: LibPlus.nmlPath('C:', '/:Musique/:', 'a.mp3'), ext: LibPlus.nmlPath('USB', '/:Sets/:', 'b.mp3'), tree: JSON.stringify(res.tree.map(x => x.path)) };
    const rep = await LibPlus.importTree(res);
    const t = LIB.tracks.find(x => x.file === 'Traktor - Live.wav');
    r.hot = t && Math.abs(t.hot[0] - 2) < .01 && t.hotMeta[0] && t.hotMeta[0].name === 'Drop' && Math.abs(t.hot[1] - 4) < .01;
    r.loop = t && t.loops.length === 1 && Math.abs(t.loops[0].end - 6) < .01;
    r.mem = t && (t.memCues || []).some(m => m.label === 'Pont');
    r.map = t && Grid.has(t) && Math.abs(Grid.bpmAt(t, 5) - 120) < .1 && Math.abs(Grid.bpmAt(t, 20) - 124) < .1;
    const f = LibPlus.tree.folders.find(x => x.name === 'Soirées'), y = LibPlus.tree.folders.find(x => x.name === '2026'), w2 = LIB.playlists.find(p => p.name === 'Warm');
    r.folders = !!(f && y && y.parent === 'fo:' + f.id && w2 && LibPlus.tree.pl[w2.id].parent === 'fo:' + y.id && w2.ids.includes(t.id));
    r.fview = f && LibPlus.folderIds('fo:' + f.id).includes(t.id);
    r.cycle = f && y && LibPlus.setParent('fo:' + f.id, 'fo:' + y.id) === false;
    r.missing = rep.missing.length; r.fid = f && f.id;
    return r;
  }, [NML, live]);
  check(tk.n === 2 && tk.path === '/Users/dj/Music/Traktor - Live.wav' && tk.key && tk.rating === 4, 'Traktor NML : morceaux, chemin, tonalité et note lus');
  check(tk.win === 'C:\\Musique\\a.mp3' && tk.ext === '/Volumes/USB/Sets/b.mp3', 'Traktor NML : chemins Windows et disque externe');
  check(tk.hot && tk.loop && tk.mem, 'Traktor NML : hot cues, boucle et cue mémoire repris');
  check(tk.tm === 2 && tk.map, 'Traktor NML : grille à deux repères en carte de tempo');
  check(tk.folders && tk.fview, 'Traktor NML : playlist dans ses groupes (Soirées › 2026 › Warm)', tk.tree);
  check(tk.cycle, 'Groupes : un groupe ne peut pas entrer dans son propre sous-groupe');
  check(tk.missing === 1, 'Traktor NML : morceau absent signalé');

  // barre latérale : arbre déplié, clic sur un dossier
  await page.evaluate(() => renderSide());
  const fo = page.locator('#lib-side button.lx-fo', { hasText: 'Soirées' });
  check(await fo.count() === 1, 'Barre latérale : groupe « Soirées » affiché');
  await fo.click();
  await sleep(150);
  const fv = await page.evaluate(id => ({ view: lib.view, rows: lib.rows.map(r => r.t.file) }), tk.fid);
  check(fv.view === 'fo:' + tk.fid && fv.rows.includes('Traktor - Live.wav'), 'Clic sur un groupe : ses morceaux s’affichent', fv.rows.length + ' morceau(x)');
  await page.click('#lib-side button:has-text("Warm")', { button: 'right' });
  await sleep(100);
  const menu = await page.evaluate(() => document.body.innerText);
  check(/Nouvelle sous-crate/.test(menu) && /Couleur…/.test(menu) && /Renommer…/.test(menu), 'Menu de playlist : sous-crate, couleur, renommer');
  await page.keyboard.press('Escape');
  const cl = await page.evaluate(() => {
    const p = LIB.playlists.find(x => x.name === 'Warm'); LibPlus.tree.pl[p.id].color = 3; LibPlus.tree.pl[p.id].fav = 1; renderSide();
    const side = document.querySelector('#lib-side').innerText; const dot = [...document.querySelectorAll('#lib-side .lx-dot')].some(d => d.style.background);
    return { fav: /Favoris/i.test(side), dot, side: side.slice(0, 400).replace(/\n/g, ' / '), pl: JSON.stringify(LibPlus.tree.pl[p.id]) };
  });
  check(cl.fav && cl.dot, 'Couleur de crate et favoris dans la barre latérale', cl.fav && cl.dot ? '' : cl.side + ' ' + cl.pl);

  /* ---------- dossiers surveillés (navigateur, File System Access simulé) ---------- */
  const ws = await page.evaluate(async w => {
    const bytes = Uint8Array.from(atob(w), c => c.charCodeAt(0));
    const fileH = name => ({ kind: 'file', name, getFile: async () => new File([bytes], name, { type: 'audio/wav' }) });
    const sub = { kind: 'directory', name: 'Edits', entries: [fileH('Veilleur - Edit.wav')], async *values() { yield* this.entries; } };
    const root = { kind: 'directory', name: 'Nouveautés', entries: [fileH('Veilleur - Un.wav'), { kind: 'file', name: 'notes.txt', getFile: async () => new File(['x'], 'notes.txt') }, sub],
      async *values() { yield* this.entries; }, queryPermission: async () => 'granted' };
    window.showDirectoryPicker = async () => root;
    const n0 = LIB.tracks.length;
    await LibPlus.addRoot(true);
    for (let k = 0; k < 100 && LIB.tracks.length < n0 + 2; k++) await new Promise(r => setTimeout(r, 100));
    const first = LIB.tracks.length - n0;
    // un fichier arrive dans le dossier : la surveillance le prend seule
    LibPlus.P.watchSec = 1; root.entries.push(fileH('Veilleur - Deux.wav'));
    for (let k = 0; k < 100 && LIB.tracks.length < n0 + 3; k++) await new Promise(r => setTimeout(r, 100));
    const second = LIB.tracks.length - n0;
    const again = await LibPlus.scan(true);
    LibPlus.P.watchSec = 30;
    // onglet Fichiers : explorateur du dossier
    lib.view = 'files'; renderTable(); await new Promise(r => setTimeout(r, 300));
    const el = document.querySelector('#lx-files'), txt = el ? el.innerText : '';
    return { first, second, again, files: !!el && !el.hidden && /Veilleur - Un\.wav/.test(txt) && /Edits/.test(txt) && !/notes\.txt/.test(txt), names: LIB.tracks.slice(n0).map(t => t.file) };
  }, wav(6, () => 120).toString('base64'));
  check(ws.first === 2, 'Dossier surveillé : les 2 fichiers audio importés (sous-dossier compris)', ws.names.join(', '));
  check(ws.second === 3, 'Dossier surveillé : un nouveau fichier est importé tout seul');
  check(ws.again === 0, 'Dossier surveillé : rien n’est importé deux fois');
  check(ws.files, 'Onglet Fichiers : dossier, sous-dossier et fichiers audio listés');
  await page.evaluate(() => { lib.view = 'all'; renderTable(); });

  /* ---------- charge ---------- */
  await sleep(1200);
  const ld = await page.evaluate(() => { const el = document.querySelector('#load-ind'); return el ? el.textContent : ''; });
  check(/^Charge \d+ %$/.test(ld), 'Indicateur de charge affiché', ld);
  const ov = await page.evaluate(() => { const t = document.querySelector('#top'); return t.scrollWidth <= t.clientWidth + 1; });
  check(ov, 'Barre du haut sans débordement');

  // réglages déclarés
  const st = await page.evaluate(() => (window.MixlabSettings || []).map(s => s.key));
  check(['grid.step', 'grid.clockBpm', 'plus.agMode', 'plus.lufsTarget', 'plus.watchSec'].every(k => st.includes(k)), 'Réglages déclarés dans les Préférences');

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Grille, analyse et bibliothèque en plus : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
