'use strict';
// Test des tags (ID3v1/v2.3/v2.4, MP4, FLAC, Ogg), du préremplissage, du cache d'analyse,
// de l'historique gardé entre deux sessions et des réglages d'effets rendus au démarrage.
// Les fichiers sont fabriqués ici, octet par octet : MP3 (trames muettes), FLAC (verbatim), M4A et Ogg (tags seuls).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };

/* ---------- fabrication des fichiers ---------- */
const B = (...a) => Buffer.concat(a.map(x => Buffer.isBuffer(x) ? x : typeof x === 'string' ? Buffer.from(x, 'latin1') : Buffer.from(x)));
const u32be = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const u32le = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const ss = n => Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const utf16 = s => B([0xFF, 0xFE], Buffer.from(s, 'utf16le'));

// ID3v2.3 (UTF-16) ou v2.4 (UTF-8, tailles « synchsafe »)
function id3(ver, frames) {
  const enc = ver === 3 ? 1 : 3, T = s => ver === 3 ? utf16(s) : Buffer.from(s, 'utf8'), Z = ver === 3 ? Buffer.from([0, 0]) : Buffer.from([0]);
  const fr = (id, body) => B(id, ver === 4 ? ss(body.length) : u32be(body.length), [0, 0], body);
  const out = frames.map(([id, v]) => {
    if (id === 'COMM') return fr(id, B([enc], 'fra', Z, T(v)));
    if (id === 'APIC') return fr(id, B([0], 'image/png', [0, 3, 0], v));
    if (id === 'TXXX') return fr(id, B([enc], T(v[0]), Z, T(v[1])));
    return fr(id, B([enc], T(v)));
  });
  const body = B(...out, Buffer.alloc(64));
  return B('ID3', [ver, 0, 0], ss(body.length), body);
}
// Trames MP3 muettes (MPEG-1 Layer III, 128 kb/s, 44,1 kHz) : environ 26 ms chacune.
const mp3Frames = n => { const fl = 417, b = Buffer.alloc(fl * n); for (let i = 0; i < n; i++) b.set([0xFF, 0xFB, 0x90, 0x64], i * fl); return b; };
function id3v1() {
  const b = Buffer.alloc(128); b.write('TAG'); b.write('Vieux titre', 3, 'latin1'); b.write('Ancien', 33, 'latin1'); b.write('Disque', 63, 'latin1');
  b.write('1999', 93); b.write('Un commentaire', 97, 'latin1'); b[125] = 0; b[126] = 5; b[127] = 18; return b;
}
// FLAC : STREAMINFO, commentaires Vorbis, image, puis des trames VERBATIM 16 bits mono (kick à 126 BPM).
function crc8(b) { let c = 0; for (const x of b) { c ^= x; for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xFF : (c << 1) & 0xFF; } return c; }
function crc16(b) { let c = 0; for (const x of b) { c ^= x << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xFFFF : (c << 1) & 0xFFFF; } return c; }
function vorbisComment(list) { return B(u32le(6), 'Mixlab', u32le(list.length), ...list.map(s => { const x = Buffer.from(s, 'utf8'); return B(u32le(x.length), x); })); }
function flacPic(data) { return B(u32be(3), u32be(9), 'image/png', u32be(0), u32be(1), u32be(1), u32be(24), u32be(0), u32be(data.length), data); }
function flac(comments, sec) {
  const sr = 44100, bs = 4096, nf = Math.ceil(sec * sr / bs), total = nf * bs;
  const si = Buffer.alloc(34); si.writeUInt16BE(bs, 0); si.writeUInt16BE(bs, 2);
  const v = (BigInt(sr) << 44n) | (0n << 41n) | (15n << 36n) | BigInt(total); si.writeBigUInt64BE(v, 10);
  const blk = (type, data, last) => B([(last ? 0x80 : 0) | type, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255], data);
  const parts = [Buffer.from('fLaC'), blk(0, si), blk(4, vorbisComment(comments)), blk(6, flacPic(PNG), true)];
  const beat = 60 / 126;
  for (let f = 0; f < nf; f++) {
    const hd = Buffer.from([0xFF, 0xF8, 0xC9, 0x08, f]);
    const sub = Buffer.alloc(1 + bs * 2); sub[0] = 0x02;
    for (let i = 0; i < bs; i++) { const t = (f * bs + i) / sr, tb = t % beat; const x = Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-tb * 30)) * tb) * Math.exp(-tb * 9) * .8 + .05 * Math.sin(2 * Math.PI * 330 * t); sub.writeInt16BE(Math.round(x * 30000), 1 + i * 2); }
    const fr = B(hd, [crc8(hd)], sub), c = crc16(fr);
    parts.push(fr, Buffer.from([c >> 8, c & 255]));
  }
  return B(...parts);
}
// MP4 / M4A : atomes iTunes (pas d'audio, lecture des tags seulement).
const atom = (t, ...k) => { const body = B(...k); return B(u32be(body.length + 8), t, body); };
const dataAtom = (type, payload) => atom('data', u32be(type), u32be(0), payload);
function m4a() {
  const ilst = atom('ilst',
    atom('©nam', dataAtom(1, Buffer.from('Marée haute', 'utf8'))),
    atom('©ART', dataAtom(1, Buffer.from('Océane', 'utf8'))),
    atom('©alb', dataAtom(1, Buffer.from('Côtes', 'utf8'))),
    atom('©gen', dataAtom(1, Buffer.from('Deep House', 'utf8'))),
    atom('©day', dataAtom(1, Buffer.from('2019-06-21T00:00:00Z', 'utf8'))),
    atom('©cmt', dataAtom(1, Buffer.from('Fin de soirée', 'utf8'))),
    atom('tmpo', dataAtom(21, Buffer.from([0, 122]))),
    atom('----', atom('mean', u32be(0), 'com.apple.iTunes'), atom('name', u32be(0), 'initialkey'), dataAtom(1, Buffer.from('11B'))),
    atom('covr', dataAtom(14, PNG)));
  const hdlr = atom('hdlr', u32be(0), u32be(0), 'mdir', 'appl', Buffer.alloc(9));
  return B(atom('ftyp', 'M4A ', u32be(0), 'M4A mp42isom'), atom('moov', atom('mvhd', Buffer.alloc(100)), atom('udta', atom('meta', u32be(0), hdlr, ilst))), atom('mdat', Buffer.alloc(32)));
}
// Ogg Vorbis : le paquet de commentaires est coupé sur deux pages.
function ogg() {
  const page = (type, seq, lacing, data) => B('OggS', [0, type], Buffer.alloc(8), u32le(0x1234), u32le(seq), u32le(0), [lacing.length], lacing, data);
  const idp = B([1], 'vorbis', Buffer.alloc(23));
  const long = 'x'.repeat(400);
  const cp = B([3], 'vorbis', vorbisComment(['TITLE=Brume', 'ARTIST=Nord', 'ALBUM=Fjords', 'GENRE=Ambient', 'DATE=2018', 'COMMENT=' + long, 'BPM=98', 'INITIALKEY=Dm', 'METADATA_BLOCK_PICTURE=' + flacPic(PNG).toString('base64')]), [1]);
  const lac = []; let n = cp.length; while (n >= 255) { lac.push(255); n -= 255; } lac.push(n);
  const cut = 2, first = cp.subarray(0, 255 * cut), rest = cp.subarray(255 * cut);
  return B(page(2, 0, [idp.length], idp), page(0, 1, lac.slice(0, cut), first), page(1, 2, lac.slice(cut), rest));
}

const MP3 = B(id3(3, [['TIT2', 'Lumière'], ['TPE1', 'Été Club'], ['TALB', 'Nuits'], ['TYER', '2024'], ['TCON', '(35)'], ['COMM', 'Pour ouvrir'], ['TBPM', '124'], ['TKEY', '8A'], ['APIC', PNG]]), mp3Frames(300));
const MP3v24 = B(id3(4, [['TIT2', 'Vingt-quatre'], ['TPE1', 'Artiste\u0000Invité'], ['TDRC', '2023-01-02'], ['TCON', 'Techno'], ['TXXX', ['INITIALKEY', 'F#m']], ['TBPM', '128']]), mp3Frames(20));
const MP3v1 = B(mp3Frames(20), id3v1());
const FLAC = flac(['TITLE=Écume', 'ARTIST=Rivage', 'ALBUM=Marées', 'DATE=2021-05-01', 'GENRE=Techno', 'BPM=126', 'INITIALKEY=Am', 'COMMENT=Bonne intro'], 12);
const M4A = m4a(), OGG = ogg();

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
  const parseIn = (page, buf) => page.evaluate(b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++)u[i] = s.charCodeAt(i); const r = Tags.parse(u); if (r.picture) r.picture = { mime: r.picture.mime, type: r.picture.type, n: r.picture.data.length }; return r; }, buf.toString('base64'));

  /* ---------- 1. Lecture des tags ---------- */
  const ctx1 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  let page = await ctx1.newPage();
  watch(page);
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.length >= 4 && window.Tags && window.Persist && LibPro.state, null, { timeout: 60000 });
  const a = await parseIn(page, MP3);
  check(a.title === 'Lumière' && a.artist === 'Été Club' && a.album === 'Nuits' && a.year === 2024 && a.genre === 'House' && a.comment === 'Pour ouvrir' && a.bpm === 124 && a.key === '8A' && a.picture && a.picture.mime === 'image/png' && a.picture.n === PNG.length, 'ID3v2.3 (UTF-16) : titre, artiste, album, année, genre (35), commentaire, BPM, tonalité, pochette', JSON.stringify(a));
  const b = await parseIn(page, MP3v24);
  check(b.title === 'Vingt-quatre' && b.artist === 'Artiste, Invité' && b.year === 2023 && b.genre === 'Techno' && b.key === 'F#m' && b.bpm === 128, 'ID3v2.4 (UTF-8, synchsafe, valeurs multiples, TXXX INITIALKEY)', JSON.stringify(b));
  const c = await parseIn(page, MP3v1);
  check(c.title === 'Vieux titre' && c.artist === 'Ancien' && c.album === 'Disque' && c.year === 1999 && c.comment === 'Un commentaire' && c.genre === 'Techno', 'ID3v1 en secours', JSON.stringify(c));
  const d = await parseIn(page, FLAC);
  check(d.title === 'Écume' && d.artist === 'Rivage' && d.album === 'Marées' && d.year === 2021 && d.genre === 'Techno' && d.bpm === 126 && d.key === 'Am' && d.comment === 'Bonne intro' && d.picture && d.picture.type === 3, 'FLAC : commentaires Vorbis et bloc PICTURE', JSON.stringify(d));
  const e = await parseIn(page, M4A);
  check(e.title === 'Marée haute' && e.artist === 'Océane' && e.album === 'Côtes' && e.genre === 'Deep House' && e.year === 2019 && e.comment === 'Fin de soirée' && e.bpm === 122 && e.key === '11B' && e.picture && e.picture.mime === 'image/png', 'MP4 / M4A : atomes iTunes, tmpo, initialkey, covr', JSON.stringify(e));
  const f = await parseIn(page, OGG);
  check(f.title === 'Brume' && f.artist === 'Nord' && f.album === 'Fjords' && f.year === 2018 && f.bpm === 98 && f.key === 'Dm' && f.comment.length === 400 && f.picture && f.picture.mime === 'image/png', 'Ogg Vorbis : paquet sur deux pages, pochette en base64', JSON.stringify({ ...f, comment: f.comment && f.comment.length }));
  const junk = await page.evaluate(() => { const r = []; for (const n of [0, 3, 10, 200]) { const u = new Uint8Array(n); for (let i = 0; i < n; i++)u[i] = (i * 37) & 255; if (n >= 3) u.set([73, 68, 51]); r.push(Object.keys(Tags.parse(u)).length); } return r; });
  check(junk.every(n => n === 0), 'fichiers abîmés ou sans tags : aucun champ, aucune erreur', JSON.stringify(junk));

  /* ---------- 2. Import : préremplissage, pochette, puis cache ---------- */
  await page.setInputFiles('.libbar label.filebtn input', { name: 'Sans Titre - Piste 01.mp3', mimeType: 'audio/mpeg', buffer: MP3 });
  await page.waitForFunction(() => LIB.tracks.some(t => t.file === 'Sans Titre - Piste 01.mp3' && t.art), null, { timeout: 30000 });
  const im = await page.evaluate(() => { const t = LIB.tracks.find(t => t.file === 'Sans Titre - Piste 01.mp3'); return { title: t.title, artist: t.artist, album: t.album, year: t.year, genre: t.genre, comment: t.comment, key: keyInfo(t.key).code, bpm: t.bpm, art: t.art, from: t.anaFrom, fp: t._fp }; });
  check(im.title === 'Lumière' && im.artist === 'Été Club' && im.album === 'Nuits' && im.year === 2024 && im.genre === 'House' && im.comment === 'Pour ouvrir' && im.key === '8A', 'MP3 importé : les tags remplacent le nom du fichier', JSON.stringify(im));
  check(im.bpm >= 123 && im.bpm <= 125 && im.from === 'analyse', 'BPM du tag utilisé pour guider l’analyse', String(im.bpm));
  check(/^blob:/.test(im.art), 'pochette : vignette en URL d’objet', im.art);
  await page.evaluate(() => { const t = LIB.tracks.find(t => t.file === 'Sans Titre - Piste 01.mp3'); lib.view = 'all'; lib.q = 'lumière'; renderTable(); decks[0].load(t); });
  await page.waitForTimeout(100);
  const shown = await page.evaluate(() => ({ row: !!document.querySelector('.lt tbody td img.tart'), deck: (document.querySelector('#p-deckA img.dk-art') || {}).src || '' }));
  check(shown.row && /^blob:/.test(shown.deck), 'pochette affichée dans la liste et sur la platine', JSON.stringify(shown));
  const searchAlbum = await page.evaluate(() => LibPro.search('nuits').map(t => t.title).join());
  check(searchAlbum === 'Lumière', 'recherche : l’album est trouvé', searchAlbum);
  await page.evaluate(() => { lib.q = ''; renderTable(); });

  await page.setInputFiles('.libbar label.filebtn input', { name: 'rivage.flac', mimeType: 'audio/flac', buffer: FLAC });
  await page.waitForFunction(() => LIB.tracks.some(t => t.file === 'rivage.flac'), null, { timeout: 30000 });
  await page.waitForFunction(() => { const t = LIB.tracks.find(t => t.file === 'rivage.flac'); return t.sections && t.art; }, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  const fl = await page.evaluate(async () => { const t = LIB.tracks.find(t => t.file === 'rivage.flac'), r = await Persist.get(t._fp);
    return { title: t.title, artist: t.artist, key: keyInfo(t.key).code, bpm: t.bpm, grid: t.grid, energy: t.energy, ns: t.sections.length, wf: t.wf.l.length, rec: !!r, recSec: !!(r && r.sections), recWf: r && r.wf.l.length, recBpm: r && r.bpm }; });
  check(fl.title === 'Écume' && fl.artist === 'Rivage' && fl.key === '8A' && Math.abs(fl.bpm - 126) < .6, 'FLAC importé : tags Vorbis appliqués (Am = 8A)', JSON.stringify(fl));
  check(fl.rec && fl.recSec && fl.recWf === fl.wf && fl.recBpm === fl.bpm, 'analyse rangée dans le cache : BPM, waveform et structure', JSON.stringify(fl));

  // Historique : deux morceaux joués dans cette session.
  await page.evaluate(() => { const m = LIB.tracks.find(t => t.file === 'Sans Titre - Piste 01.mp3'), r = LIB.tracks.find(t => t.file === 'rivage.flac'), t0 = Date.now() - 600000;
    LIB.history.push({ track: m, time: new Date(t0), deck: 'A' }, { track: r, time: new Date(t0 + 210000), deck: 'B' }); renderSide(); });
  // Le titre modifié à la main doit survivre au réimport.
  await page.evaluate(() => { const t = LIB.tracks.find(t => t.file === 'Sans Titre - Piste 01.mp3'); t.title = 'Mon titre'; t.genre = 'Disco'; });
  // Effets : type, durée, dosage, réglages, mode et cibles.
  await page.evaluate(() => { const u = FXU[0]; u.setSlot(0, { type: 'flanger' }); u.setSlot(0, { amount: .8, p1: .3, p2: .65 }); u.beats = 2; u.setMode('chain'); u.toggle('C', true); u.setSlot(2, { type: 'crush', on: true });
    FXU[1].setSlot(0, { type: 'reverb', amount: .25 }); renderFxUnit(u); renderFxUnit(FXU[1]); });
  await page.waitForTimeout(1300);
  await page.evaluate(() => LibPro.saveBrowser());

  /* ---------- 3. Rechargement : cache, éditions gardées, historique, effets ---------- */
  await page.reload();
  await page.waitForFunction(() => LIB.tracks.length >= 4 && LibPro.state && document.querySelector('#fxu-1 select'), null, { timeout: 60000 });
  const fx = await page.evaluate(() => ({ u: Persist.fxOut(), sel: document.querySelector('#fxu-1 .slot select').value, sel2: document.querySelector('#fxu-2 .slot select').value, on: FXU[0].on }));
  const u0 = fx.u[0], s0 = u0.slots[0];
  check(s0.type === 'flanger' && Math.abs(s0.amount - .8) < 1e-9 && Math.abs(s0.p1 - .3) < 1e-9 && Math.abs(s0.p2 - .65) < 1e-9 && u0.beats === 2 && u0.mode === 'chain' && u0.targets.includes('C') && u0.slots[2].type === 'crush' && u0.slots[2].on && fx.u[1].slots[0].type === 'reverb' && Math.abs(fx.u[1].slots[0].amount - .25) < 1e-9, 'effets : réglages rendus au démarrage', JSON.stringify(fx.u));
  check(fx.sel === 'flanger' && fx.sel2 === 'reverb' && !fx.on, 'effets : l’interface montre les effets gardés, unité coupée au démarrage', JSON.stringify({ sel: fx.sel, sel2: fx.sel2, on: fx.on }));

  const hist = await page.evaluate(() => { const st = LibPro.sets.filter(s => s.id !== LibPro.state.sid); const items = [...document.querySelectorAll('#lib-side .it')].map(b => b.textContent); return { n: st.length, items: st[0] && st[0].items.map(x => x.title).join(), side: items.filter(x => /\d{2}\/\d{2}\/\d{4}/.test(x)) }; });
  check(hist.n === 1 && hist.items === 'Lumière,Écume' && hist.side.length === 1, 'historique : le set de la session précédente est gardé et listé par date', JSON.stringify(hist));

  await page.evaluate(() => { window.__calls = 0; const o = window.analyze; window.analyze = function (...x) { window.__calls++; return o.apply(this, x); }; });
  await page.setInputFiles('.libbar label.filebtn input', [{ name: 'Sans Titre - Piste 01.mp3', mimeType: 'audio/mpeg', buffer: MP3 }, { name: 'rivage.flac', mimeType: 'audio/flac', buffer: FLAC }]);
  await page.waitForFunction(() => LIB.tracks.some(t => t.file === 'rivage.flac') && LIB.tracks.some(t => t.file === 'Sans Titre - Piste 01.mp3'), null, { timeout: 30000 });
  await page.waitForTimeout(200);
  const again = await page.evaluate(() => { const m = LIB.tracks.find(t => t.file === 'Sans Titre - Piste 01.mp3'), r = LIB.tracks.find(t => t.file === 'rivage.flac');
    return { calls: window.__calls, mf: m.anaFrom, rf: r.anaFrom, rsec: !!r.sections, ren: r.energy, rmem: (r.memCues || []).length, title: m.title, genre: m.genre, artist: m.artist, album: m.album, rbpm: r.bpm, hits: Persist.stats.hits, wf: r.wf.l.length, isF32: r.wf.l instanceof Float32Array }; });
  check(again.calls === 0 && again.mf === 'cache' && again.rf === 'cache' && again.hits >= 2, 'réimport : analyse servie par le cache, sans réanalyse', JSON.stringify(again));
  check(again.rsec && again.ren >= 1 && again.rmem > 0 && again.rbpm === fl.bpm && again.wf === fl.wf && again.isF32, 'réimport : structure, énergie, cues et waveform revenus aussitôt', JSON.stringify(again));
  check(again.title === 'Mon titre' && again.genre === 'Disco' && again.artist === 'Été Club' && again.album === 'Nuits', 'réimport : les tags ne remplacent pas ce que tu as modifié', JSON.stringify(again));

  // Le set précédent dans la bibliothèque, et son export M3U.
  await page.click('#lib-side .it >> text=/\\d{2}\\/\\d{2}\\/\\d{4}/');
  const view = await page.evaluate(() => ({ v: lib.view, rows: lib.rows.map(r => r.t.title).join() }));
  check(view.v.startsWith('set:') && view.rows === 'Mon titre,Écume', 'historique : le set précédent s’ouvre dans la liste', JSON.stringify(view));
  await page.getByRole('button', { name: /Exporter la tracklist/ }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.lpm .setrow >> nth=0 >> button:has-text("M3U")')]);
  const m3u = fs.readFileSync(await dl.path(), 'utf8');
  check(/\.m3u8$/.test(dl.suggestedFilename()) && m3u.startsWith('#EXTM3U') && m3u.includes('Été Club - Mon titre') && m3u.includes('Rivage - Écume'), 'historique : export M3U du set', JSON.stringify(m3u));
  await page.keyboard.press('Escape');

  // Invalidation : version de l'analyse différente, fichier modifié, autre plage de BPM.
  const inv = await page.evaluate(async b64 => {
    const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++)u[i] = s.charCodeAt(i);
    const p1 = await Persist.pre(u.slice().buffer, 'x.flac'); const r = await Persist.get(p1.fp); r.v = 'ancienne'; await new Promise(ok => { const q = indexedDB.open('mixlab-analyse'); q.onsuccess = () => { const tx = q.result.transaction('ana', 'readwrite'); tx.objectStore('ana').put(r); tx.oncomplete = ok; }; });
    const p2 = await Persist.pre(u.slice().buffer, 'x.flac'), gone = !(await Persist.get(p1.fp));
    const v = u.slice(); v[v.length - 10] ^= 0xFF; const p3 = await Persist.pre(v.buffer, 'x.flac');
    const w = await Persist.pre(u.slice().buffer, 'x.flac');
    return { hit1: p1.hit, hit2: p2.hit, gone, other: p3.fp !== p1.fp && !p3.hit, n: await Persist.count(), w: w.hit };
  }, FLAC.toString('base64'));
  check(inv.hit1 && !inv.hit2 && inv.gone && inv.other && !inv.w, 'cache : version ou fichier différents, l’entrée est ignorée et effacée', JSON.stringify(inv));
  await page.close();
  await ctx1.close();

  /* ---------- 4. Appli de bureau : relance sans réanalyse ---------- */
  const fakeNative = saved => `(() => {
    const s = atob('${MP3.toString('base64')}'), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    const f = { path: '/musique/Sans Titre - Piste 01.mp3', name: 'Sans Titre - Piste 01.mp3' };
    window.__saved = ${JSON.stringify(saved)};
    window.mixlabNative = { platform: 'test', pickFiles: async () => [f], pickFolder: async () => [f],
      readFile: async () => u.slice().buffer, exists: async p => p === f.path, droppedPath: async () => null,
      loadLibrary: async () => window.__saved ? JSON.parse(window.__saved) : null, saveLibrary: async j => { window.__saved = j; return true; } };
  })();`;
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await ctx2.newPage();
  watch(page);
  await page.addInitScript(fakeNative(null));
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.length >= 4 && decks[0].track, null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Dossier' }).click();
  await page.waitForFunction(() => LIB.tracks.some(t => t.path && t.art), null, { timeout: 30000 });
  const n1 = await page.evaluate(() => { const t = LIB.tracks.find(t => t.path); t.artist = 'Artiste corrigé'; LIB.history.push({ track: t, time: new Date(), deck: 'A' }); renderSide(); return { title: t.title, from: t.anaFrom }; });
  check(n1.title === 'Lumière' && n1.from === 'analyse', 'bureau : import d’un dossier, tags lus', JSON.stringify(n1));
  await page.waitForTimeout(300);
  await page.evaluate(() => Desktop.save());
  const saved = await page.evaluate(() => window.__saved);
  await page.close();
  page = await ctx2.newPage();
  watch(page);
  await page.addInitScript(fakeNative(saved));
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.some(t => t.path && t.art), null, { timeout: 60000 });
  const n2 = await page.evaluate(() => { const t = LIB.tracks.find(t => t.path); return { title: t.title, artist: t.artist, from: t.anaFrom, album: t.album, sets: LibPro.sets.length }; });
  check(n2.from === 'cache' && n2.title === 'Lumière' && n2.artist === 'Artiste corrigé' && n2.album === 'Nuits' && n2.sets >= 1, 'bureau : relance sans réanalyse, artiste corrigé gardé, historique gardé', JSON.stringify(n2));
  await page.close();
  await ctx2.close();

  await browser.close();
  check(!errors.length, 'Aucune erreur dans la page', errors.join(' | '));
  console.log(failed ? failed + ' échec(s)' : 'Tags, cache, historique et effets : tout est vert');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
