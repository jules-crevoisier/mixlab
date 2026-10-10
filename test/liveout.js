'use strict';
// Test des sorties live : titre en cours et page OBS, paroles (LRC, SYLT, USLT, .lrc importé avec le morceau),
// clip vidéo calé sur la platine, sortie vidéo et transitions, visualiseur, texte et logo, karaoké,
// horloge MIDI en entrée, OSC, diffusion (transport simulé : la vraie poignée de main Icecast est testée en Rust).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const CLIP = path.resolve(__dirname, 'fixtures', 'Clip - Mire.webm');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };

/* ---------- fichiers fabriqués ici ---------- */
const B = (...a) => Buffer.concat(a.map(x => Buffer.isBuffer(x) ? x : typeof x === 'string' ? Buffer.from(x, 'latin1') : Buffer.from(x)));
const u32be = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
function wav(sec) {
  const sr = 44100, n = sr * sec, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = (i % (sr / 2)) / sr; b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t * 16) * 28000), 44 + i * 2); }
  return b;
}
// ID3v2.3 (Latin-1) avec USLT et SYLT (temps en millisecondes), puis des trames MP3 muettes.
function id3Lyrics() {
  const fr = (id, body) => B(id, u32be(body.length), [0, 0], body);
  const uslt = fr('USLT', B([0], 'fra', [0], 'Texte libre\nsans temps'));
  const sylt = fr('SYLT', B([0], 'fra', [2, 1], [0], 'Ligne un', [0], u32be(1000), 'Ligne deux', [0], u32be(2500)));
  const body = B(uslt, sylt, Buffer.alloc(32));
  const ss = n => Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
  return B('ID3', [3, 0, 0], ss(body.length), body);
}
const mp3Frames = n => { const fl = 417, b = Buffer.alloc(fl * n); for (let i = 0; i < n; i++) b.set([0xFF, 0xFB, 0x90, 0x64], i * fl); return b; };
const LRC = '[ti:Voix]\n[ar:Testeur]\n[00:00.50]Bonjour la salle\n[00:02.00]Deuxième ligne\n[00:04.00]Fin\n';

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const watch = p => { p.on('pageerror', e => { errors.push(e.message); if (process.env.DEBUG) console.log('ERREUR', e.stack); }); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  watch(page);
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.length >= 4 && decks[1].track && window.LiveOut && window.Video, null, { timeout: 60000 });
  await page.mouse.click(800, 5);
  const W = (f, a) => page.evaluate(f, a);
  await W(() => { resumeAudio(); window.__sleep = ms => new Promise(r => setTimeout(r, ms)); });

  // ---------- 1. Titre en cours : le morceau le plus fort, après le délai ----------
  const np1 = await W(async () => {
    LiveOut.cfg.np.hold = 1; LiveOut.cfg.np.tpl = '{artist} - {title} ({bpm})';
    const [a, b] = decks; a.load(LIB.tracks[0]); b.load(LIB.tracks[1]);
    controls.get('A.fader').set(1); controls.get('B.fader').set(1); controls.get('xf').set(0);
    a.play(); await __sleep(1300);
    const first = LiveOut.nowPlaying();
    controls.get('xf').set(1); b.play(); await __sleep(450);
    const early = LiveOut.nowPlaying().title;
    await __sleep(1200);
    const now = LiveOut.nowPlaying(), p = LiveOut.payload();
    a.pause(); b.pause();
    return { first: first && first.title, want0: LIB.tracks[0].title, early, now: now.title, want1: LIB.tracks[1].title, text: p.text,
      exp: LiveOut.format('{artist} - {title} ({bpm})', now), hist: LiveOut.state.history.length, art: LIB.tracks[1].artist };
  });
  check(np1.first === np1.want0, 'Titre en cours : la platine à l’antenne (A, crossfader à gauche)', np1.first);
  check(np1.early === np1.want0 && np1.now === np1.want1, 'Changement de titre seulement après le délai (B au crossfader)', np1.early + ' → ' + np1.now);
  check(np1.text === np1.exp && np1.text.includes(np1.want1) && /\(\d+(\.\d)?\)$/.test(np1.text) && np1.hist >= 2, 'Texte du titre selon le format, historique gardé', np1.text);
  const fmtNoArtist = await W(() => LiveOut.format('{artist} - {title}', { title: 'Seul', artist: '' }));
  check(fmtNoArtist === 'Seul', 'Sans artiste : pas de tiret orphelin', fmtNoArtist);

  // ---------- 2. Page OBS : relit now.json et affiche titre, artiste, paroles ----------
  const html = await W(() => LiveOut.overlayHtml({ poll: 150, pos: 'bc' }));
  let nowJson = { title: 'Premier titre', artist: 'Artiste Un', lyric: '' };
  const obs = await context.newPage();
  watch(obs);
  await obs.route('http://obs.mixlab.test/**', r => {
    const u = r.request().url();
    if (u.includes('now.json')) r.fulfill({ contentType: 'application/json', body: JSON.stringify(nowJson) });
    else r.fulfill({ contentType: 'text/html', body: html });
  });
  await obs.goto('http://obs.mixlab.test/');
  await obs.waitForFunction(() => document.getElementById('t').textContent === 'Premier titre' && document.getElementById('np').classList.contains('on'), null, { timeout: 5000 }).catch(() => {});
  const o1 = await obs.evaluate(() => ({ t: document.getElementById('t').textContent, a: document.getElementById('a').textContent, on: document.getElementById('np').classList.contains('on'), bg: getComputedStyle(document.body).backgroundColor }));
  check(o1.t === 'Premier titre' && o1.a === 'Artiste Un' && o1.on && o1.bg === 'rgba(0, 0, 0, 0)', 'Page OBS : titre et artiste affichés sur fond transparent', JSON.stringify(o1));
  nowJson = { title: 'Deuxième titre', artist: 'Artiste Deux', lyric: 'Une ligne chantée' };
  await obs.waitForFunction(() => document.getElementById('t').textContent === 'Deuxième titre', null, { timeout: 5000 }).catch(() => {});
  const o2 = await obs.evaluate(() => ({ t: document.getElementById('t').textContent, l: document.getElementById('ly').textContent }));
  check(o2.t === 'Deuxième titre' && o2.l === 'Une ligne chantée', 'Page OBS : nouveau titre et paroles suivis sans recharger', JSON.stringify(o2));
  await obs.close();

  // ---------- 3. Paroles : analyse LRC et temps ----------
  const ly = await W(() => {
    const L = Video.Lyrics;
    const l = L.parse('[ti:Essai]\n[ar:Mixlab]\n[offset:+200]\n[00:01.00][00:09.00]Premier refrain\n[00:03.50]Deuxième ligne\n[00:05.00]<00:05.00>Mots <00:05.50>un <00:06.00>par <00:06.50>un\n\n[00:08.00]\n');
    const a0 = L.at(l, .5), a1 = L.at(l, 3.4), a2 = L.at(l, 5.55), a3 = L.at(l, 7.9), a4 = L.at(l, 20);
    const plain = L.parse('un\ndeux\ntrois', 60);
    const crlf = L.parse('[01:02.5]Avec virgule\r\n[1:03]Court');
    return { meta: l.meta, times: l.lines.map(x => Math.round(x.t * 100) / 100), texts: l.lines.map(x => x.text), a0, a1, a2, a3, a4,
      plain: { synced: plain.synced, t: plain.lines.map(x => Math.round(x.t)) }, crlf: crlf.lines.map(x => x.t) };
  });
  check(ly.meta.ti === 'Essai' && ly.meta.ar === 'Mixlab' && JSON.stringify(ly.times) === '[0.8,3.3,4.8,7.8,8.8]', 'LRC : métadonnées, temps multiples et décalage [offset]', JSON.stringify(ly.times));
  check(ly.texts[0] === 'Premier refrain' && ly.texts[4] === 'Premier refrain' && ly.texts[2] === 'Mots un par un' && ly.texts[3] === '', 'LRC : textes dans l’ordre, mots enrichis recollés, ligne vide gardée', JSON.stringify(ly.texts));
  check(ly.a0.i === -1 && ly.a0.next === 'Premier refrain' && ly.a1.line === 'Deuxième ligne' && ly.a3.line === '' && ly.a4.line === 'Premier refrain' && ly.a4.next === '', 'LRC : ligne à l’instant t (avant, pendant, silence, fin)', JSON.stringify([ly.a0, ly.a1.line, ly.a4.line]));
  check(Math.abs(ly.a2.progress - 6.5 / 14) < .02, 'LRC : avancement mot par mot pour le karaoké', ly.a2.progress.toFixed(3));
  check(ly.plain.synced === false && JSON.stringify(ly.plain.t) === '[0,18,36]' && JSON.stringify(ly.crlf) === '[62.5,63]', 'Paroles sans temps réparties sur la durée ; fins de ligne Windows', JSON.stringify(ly.plain) + ' ' + JSON.stringify(ly.crlf));

  // ---------- 4. Paroles des tags : USLT et SYLT (ID3) ----------
  const tagBytes = [...B(id3Lyrics(), mp3Frames(4))];
  const tg = await W(bytes => { const R = Tags.parse(Uint8Array.from(bytes)); const l = Video.Lyrics.fromSylt(R.sylt); return { lyrics: R.lyrics, sylt: R.sylt, l }; }, tagBytes);
  check(tg.lyrics === 'Texte libre\nsans temps' && tg.sylt && tg.sylt.length === 2 && tg.sylt[1].t === 2.5 && tg.l.lines[1].text === 'Ligne deux', 'Tags : USLT lu en texte, SYLT en lignes minutées', JSON.stringify(tg.sylt));

  // ---------- 5. Import : clip vidéo, .lrc importé avec le morceau, MP3 avec SYLT ----------
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mixlab-live-'));
  fs.writeFileSync(path.join(tmp, 'Testeur - Voix.wav'), wav(6));
  fs.writeFileSync(path.join(tmp, 'Testeur - Voix.lrc'), LRC);
  fs.writeFileSync(path.join(tmp, 'Chanteur - Paroles.mp3'), B(id3Lyrics(), mp3Frames(160)));
  const input = page.locator('label.filebtn input[type=file]').first();
  await input.setInputFiles([path.join(tmp, 'Testeur - Voix.wav'), path.join(tmp, 'Testeur - Voix.lrc'), path.join(tmp, 'Chanteur - Paroles.mp3'), CLIP]);
  await page.waitForFunction(() => ['Testeur - Voix.wav', 'Chanteur - Paroles.mp3', 'Clip - Mire.webm'].every(f => LIB.tracks.some(t => t.file === f)), null, { timeout: 30000 });
  const imp = await W(async () => {
    const voix = LIB.tracks.find(t => t.file === 'Testeur - Voix.wav'), mp3 = LIB.tracks.find(t => t.file === 'Chanteur - Paroles.mp3'), clip = LIB.tracks.find(t => t.file === 'Clip - Mire.webm');
    const lv = await Video.ensureLyrics(voix); const lm = await Video.ensureLyrics(mp3);
    return { lv: lv && { n: lv.lines.length, src: voix.lyricsSrc, ti: lv.meta.ti }, lm: lm && { n: lm.lines.length, src: mp3.lyricsSrc }, clip: { dur: clip.duration, video: Video.isVideo(clip) } };
  });
  check(imp.lv && imp.lv.n === 3 && imp.lv.src === 'lrc' && imp.lv.ti === 'Voix', 'Fichier .lrc importé avec le morceau : paroles rattachées', JSON.stringify(imp.lv));
  check(imp.lm && imp.lm.n === 2 && imp.lm.src === 'sylt', 'MP3 avec SYLT : paroles minutées du tag (priorité sur USLT)', JSON.stringify(imp.lm));
  check(imp.clip.video && Math.abs(imp.clip.dur - 6) < .2, 'Clip WebM importé : son décodé, marqué vidéo', JSON.stringify(imp.clip));

  // paroles sur la platine
  await W(() => { const d = decks[1]; d.load(LIB.tracks.find(t => t.file === 'Testeur - Voix.wav')); d.seek(2.3); });
  await sleep(300);
  const dl = await W(() => { const e = document.querySelector('#p-deckB .vx-ly'); return e ? e.textContent : null; });
  check(dl === 'Deuxième ligne', 'Paroles sur la platine B à la position', String(dl));
  const dl2 = await W(async () => { decks[1].seek(.2); await __sleep(250); const e = document.querySelector('#p-deckB .vx-ly'); return e ? e.textContent : null; });
  check(dl2 === '… Bonjour la salle', 'Avant la première ligne : la ligne à venir', String(dl2));

  // ---------- 6. Vidéo calée sur la position de la platine ----------
  await W(() => { const d = decks[0]; d.load(LIB.tracks.find(t => t.file === 'Clip - Mire.webm')); });
  await page.waitForFunction(() => Video.media.A && Video.media.A.ok && Video.media.A.el.readyState >= 2, null, { timeout: 10000 }).catch(() => {});
  const v0 = await W(async () => { const d = decks[0], el = Video.media.A.el; d.seek(2); await __sleep(500); return { ct: el.currentTime, pos: d.position(), paused: el.paused, thumb: !!document.querySelector('#p-deckA .vx-th video') }; });
  check(Math.abs(v0.ct - 2) < .06 && v0.paused && v0.thumb, 'Vidéo : position de la platine suivie à l’arrêt, vignette sur la platine', JSON.stringify(v0));
  const v1 = await W(async () => {
    const d = decks[0], el = Video.media.A.el; d.play(); await __sleep(1200);
    // écarts mesurés pendant la lecture : médiane (le calage) et maximum (une machine chargée peut sauter une image)
    const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
    const e1 = []; for (let i = 0; i < 12; i++) { e1.push(Math.abs(el.currentTime - d.position())); await __sleep(80); }
    const worst = Math.max(...e1), m1 = med(e1);
    const playing = !el.paused;
    d.setPitch(.06); await __sleep(900);
    const e2 = []; for (let i = 0; i < 10; i++) { e2.push(Math.abs(el.currentTime - d.position())); await __sleep(80); }
    const w2 = med(e2);
    const rate = el.playbackRate;
    d.seek(1); await __sleep(500); const afterSeek = Math.abs(el.currentTime - d.position());
    d.pause(); d.setPitch(0); await __sleep(300);
    return { worst, m1, playing, rate, w2, afterSeek, paused: el.paused, still: Math.abs(el.currentTime - d.position()) };
  });
  check(v1.playing && v1.m1 < .1 && v1.worst < .3, 'Vidéo : lecture calée sur le son (écart médian et maximal)', (v1.m1 * 1000).toFixed(0) + ' ms · max ' + (v1.worst * 1000).toFixed(0) + ' ms');
  check(Math.abs(v1.rate - 1.06) < .12 && v1.w2 < .12, 'Vidéo : pitch +6 % suivi (vitesse et écart)', 'vitesse ' + v1.rate.toFixed(3) + ' · écart ' + (v1.w2 * 1000).toFixed(0) + ' ms');
  check(v1.afterSeek < .15 && v1.paused && v1.still < .05, 'Vidéo : saut et pause suivis', JSON.stringify(v1));

  // ---------- 7. Sortie vidéo : transitions selon le crossfader ----------
  const tr = await W(async () => {
    Video.force = true; const out = {};
    const [a, b] = decks; b.load(LIB.tracks[1]); controls.get('A.fader').set(1); controls.get('B.fader').set(1);
    const snap = () => { Video.render(); const p = Video.lastPlan; return { a: p.a && p.a.id, b: p.b && p.b.id, p: Math.round(p.p * 100) / 100, layers: p.layers.slice(), shown: p.shown, edge: p.edge }; };
    Video.cfg.transition = 'fade'; controls.get('xf').set(0); out.left = snap();
    controls.get('xf').set(.5); out.fade = snap();
    Video.cfg.transition = 'cut'; controls.get('xf').set(.8); out.cut = snap();
    Video.cfg.transition = 'wipe'; controls.get('xf').set(.5); out.wipe = snap();
    // pixels : à gauche la mire du clip (A), à droite le visualiseur (B)
    const g = Video.canvas.getContext('2d'), px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data);
    out.leftPx = px(200, 200); out.rightPx = px(1200, 40);
    Video.cfg.transition = 'fade'; controls.get('xf').set(0);
    return out;
  });
  check(tr.left.a === 'A' && !tr.left.b && tr.left.layers.join() === 'video', 'Crossfader à gauche : seule la vidéo de A', JSON.stringify(tr.left));
  check(tr.fade.a && tr.fade.b && tr.fade.layers.join() === (tr.fade.a === 'A' ? 'video,viz' : 'viz,video') && tr.fade.p > .3 && tr.fade.p <= .5, 'Fondu au milieu : A et B mélangés selon leurs volumes', JSON.stringify(tr.fade));
  check(tr.cut.shown === 'B' && tr.cut.layers.join() === 'viz', 'Coupe : B seul passé le milieu (visualiseur, pas de vidéo sur B)', JSON.stringify(tr.cut));
  check(tr.wipe.layers.length === 2 && tr.wipe.edge > 300 && tr.wipe.edge < 980, 'Volet : B entre par la droite jusqu’à la position du crossfader', JSON.stringify(tr.wipe));
  check(tr.leftPx.slice(0, 3).some(v => v > 40) && tr.rightPx[0] < 40 && tr.rightPx[1] < 40 && tr.rightPx[2] < 60, 'Volet : image du clip à gauche, fond du visualiseur à droite', JSON.stringify([tr.leftPx, tr.rightPx]));

  // ---------- 8. Visualiseur réactif au son ----------
  const vz = await W(async () => {
    const [a, b] = decks; controls.get('A.fader').set(0); controls.get('xf').set(1); b.seek(b.track.grid || 0); b.play();
    let on = 0; for (let i = 0; i < 12; i++) { await __sleep(60); Video.render(); on = Math.max(on, Video.lastPlan.energy); }
    b.pause(); await __sleep(900);
    let off = 0; for (let i = 0; i < 5; i++) { await __sleep(60); Video.render(); off = Math.max(off, Video.lastPlan.energy); }
    return { on, off, layers: Video.lastPlan.layers.join() };
  });
  check(vz.layers === 'viz' && vz.on > .05 && vz.off < vz.on * .5, 'Visualiseur : barres au son du master, calmes au silence', 'son ' + vz.on.toFixed(3) + ' · silence ' + vz.off.toFixed(3));

  // ---------- 9. Texte et logo par-dessus ----------
  const ov = await W(async () => {
    Video.cfg.textOn = true; Video.cfg.text = 'Bienvenue au club'; Video.cfg.textScroll = false; Video.cfg.logoPos = 'br';
    const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.fillStyle = '#ff0000'; x.fillRect(0, 0, 16, 16);
    Video.loadLogo(c.toDataURL()); await __sleep(150); Video.render();
    const g = Video.canvas.getContext('2d'), d = g.getImageData(0, 720 * .08 - 20, 1280, 40).data;
    let bright = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) bright++;
    const logo = Array.from(g.getImageData(1280 - 24 - 40, 720 - 24 - 40, 1, 1).data);
    const plan = Video.lastPlan; Video.cfg.textOn = false; Video.loadLogo(null);
    return { bright, logo, text: plan.text, hasLogo: plan.logo };
  });
  check(ov.text === 'Bienvenue au club' && ov.bright > 300, 'Message texte sur la sortie vidéo', ov.bright + ' pixels blancs');
  check(ov.hasLogo && ov.logo[0] > 200 && ov.logo[1] < 60, 'Logo en bas à droite', JSON.stringify(ov.logo));

  // ---------- 10. Karaoké : file de chanteurs, transposition, paroles en grand ----------
  const ka = await W(async () => {
    decks.forEach(d => d.pause());
    const voix = LIB.tracks.find(t => t.file === 'Testeur - Voix.wav');
    Video.karaoke.add('Léa', voix, 2); Video.karaoke.add('Sam', LIB.tracks[2], 0);
    const q0 = Video.karaoke.state.queue.length;
    const d = Video.karaoke.next(); Video.cfg.karaoke = true;
    controls.get('A.fader').set(0); controls.get('B.fader').set(0); controls.get(d.id + '.fader').set(1); controls.get('xf').set(d.xfa === 'A' ? 0 : 1);
    d.seek(2.5); await __sleep(200); Video.render();
    const p = Video.lastPlan, lyr = p.lyric;
    Video.cfg.karaoke = false;
    return { q0, deck: d.id, track: d.track.file, shift: d.keyShift, cur: Video.karaoke.state.current.singer, next: Video.karaoke.state.queue[0].singer, line: lyr && lyr.line, prog: lyr && lyr.progress };
  });
  check(ka.q0 === 2 && ka.track === 'Testeur - Voix.wav' && ka.shift === 2 && ka.cur === 'Léa' && ka.next === 'Sam', 'Karaoké : chanteur suivant chargé, transposé de +2', JSON.stringify(ka));
  check(ka.line === 'Deuxième ligne' && ka.prog > 0 && ka.prog < 1, 'Karaoké : ligne en cours qui se remplit sur la sortie', JSON.stringify([ka.line, ka.prog]));

  // ---------- 11. Horloge MIDI en entrée ----------
  const ck = await W(async () => {
    const d = decks[0]; d.load(LIB.tracks[0]); d.setPitch(0); S.master = d; const base = d.track.bpm;
    LiveOut.cfg.clock.follow = true; LiveOut.cfg.clock.transport = true;
    let t = performance.now() + 10;
    // horloge régulière, chaque message arrive avec ±1 ms de gigue (USB, pilote)
    const send = (bpm, n) => { const iv = 60000 / bpm / 24; for (let i = 0; i < n; i++) { t += iv; onMidi({ data: new Uint8Array([0xF8]), timeStamp: t + (Math.random() - .5) * 2 }); } };
    send(126, 120); const a = { est: LiveOut.clock.bpm, deck: d.bpm };
    send(129.5, 130); const b = { est: LiveOut.clock.bpm, deck: d.bpm };
    t += 3000; send(base / 2, 120); const c = { est: LiveOut.clock.bpm, deck: d.bpm };
    onMidi({ data: new Uint8Array([0xFA]), timeStamp: t }); const started = d.playing;
    onMidi({ data: new Uint8Array([0xFC]), timeStamp: t + 10 }); const stopped = !d.playing;
    LiveOut.cfg.clock.follow = false; LiveOut.cfg.clock.transport = false; d.setPitch(0);
    return { base, a, b, c, started, stopped };
  });
  check(Math.abs(ck.a.est - 126) < .3 && Math.abs(ck.a.deck - 126) < .3, 'Horloge MIDI 126 BPM (avec gigue) : tempo lu et suivi par la platine maître', JSON.stringify(ck.a));
  check(Math.abs(ck.b.est - 129.5) < .3 && Math.abs(ck.b.deck - 129.5) < .3, 'Horloge MIDI : changement de tempo suivi', JSON.stringify(ck.b));
  check(Math.abs(ck.c.deck - ck.base) < .3, 'Horloge à la moitié du tempo du morceau : la platine reste au tempo double, sans saut', JSON.stringify(ck.c) + ' base ' + ck.base.toFixed(2));
  check(ck.started && ck.stopped, 'Start et Stop MIDI lancent puis arrêtent la platine maître', JSON.stringify(ck));

  // ---------- 12. OSC vers le registre des commandes ----------
  const osc = await W(async () => {
    const r = {};
    r.fader = LiveOut.oscIn({ addr: '/mixlab/A.fader', args: [0.3] }) && decks[0].p.fader;
    r.xf = LiveOut.oscIn({ addr: '/mixlab/xf', args: [0.75] }) && S.xf;
    const was = decks[1].playing; LiveOut.oscIn({ addr: '/mixlab/B/play', args: [1] }); LiveOut.oscIn({ addr: '/mixlab/B/play', args: [0] }); r.play = decks[1].playing !== was;
    decks[1].pause();
    r.unknown = LiveOut.oscIn({ addr: '/mixlab/pas.une.commande', args: [1] });
    r.other = LiveOut.oscIn({ addr: '/autre/A.play', args: [1] });
    r.count = LiveOut.osc.count;
    return r;
  });
  check(Math.abs(osc.fader - .3) < 1e-6 && Math.abs(osc.xf - .75) < 1e-6 && osc.play && osc.unknown === false && osc.other === false && osc.count >= 5, 'OSC : /mixlab/A.fader, /mixlab/xf et /mixlab/B/play pilotent les commandes', JSON.stringify(osc));

  // ---------- 13. Diffusion : navigateur, puis transport simulé avec reconnexion ----------
  const st = await W(async () => {
    const r = {};
    LiveOut.cfg.stream.host = 'radio.test'; LiveOut.cfg.stream.reconnect = true;
    r.browser = await LiveOut.stream.start(); r.bState = LiveOut.stream.state; r.bErr = LiveOut.stream.error;
    const log = { starts: 0, chunks: [], stops: 0, meta: [] }; let failNext = false;
    LiveOut.stream.setTransport({
      start: async c => { log.starts++; log.cfg = c; },
      send: async b => { if (failNext) { failNext = false; throw new Error('Connexion perdue'); } log.chunks.push({ n: b.length, bytes: Array.from(b.slice(0, 4)), start: log.starts }); },
      stop: async () => { log.stops++; }, meta: async (c, s) => { log.meta.push(s); },
    });
    decks[0].play();
    r.ok = await LiveOut.stream.start(); r.mime = LiveOut.stream.mime;
    await __sleep(1700); r.live = LiveOut.stream.state; r.sent1 = LiveOut.stream.sent;
    failNext = true; await __sleep(900); r.retry = LiveOut.stream.state;
    await __sleep(3200); r.again = LiveOut.stream.state;
    await LiveOut.stream.stop(); decks[0].pause();
    r.off = LiveOut.stream.state; r.log = { starts: log.starts, stops: log.stops, meta: log.meta, cfg: log.cfg, firsts: [1, 2].map(s => log.chunks.filter(c => c.start === s).flatMap(c => c.bytes).slice(0, 4)), n: log.chunks.length };
    LiveOut.stream.setTransport(null);
    return r;
  });
  check(st.browser === false && st.bState === 'app' && /appli Mixlab/.test(st.bErr), 'Navigateur : la diffusion explique qu’il faut l’appli', st.bErr);
  const HDR = h => h && ((h[0] === 0x1A && h[1] === 0x45 && h[2] === 0xDF && h[3] === 0xA3) || (h[0] === 0x4F && h[1] === 0x67 && h[2] === 0x67 && h[3] === 0x53));
  check(st.ok && st.live === 'live' && st.sent1 > 2000 && st.log.cfg.contentType && st.log.cfg.host === 'radio.test', 'Diffusion : connexion puis octets encodés envoyés', st.mime + ' · ' + st.sent1 + ' octets');
  check(st.retry === 'retry' && st.again === 'live' && st.log.starts === 2, 'Coupure : reconnexion automatique', JSON.stringify({ retry: st.retry, again: st.again, starts: st.log.starts }));
  check(HDR(st.log.firsts[0]) && HDR(st.log.firsts[1]), 'Chaque connexion commence par l’en-tête du flux (Ogg ou WebM)', JSON.stringify(st.log.firsts));
  check(st.off === 'off' && st.log.stops >= 1 && st.log.meta.length >= 1, 'Arrêt propre, titre envoyé au serveur', JSON.stringify(st.log.meta));

  // ---------- 14. Fenêtre Live et sortie vidéo ----------
  await page.click('#live-btn').catch(async () => { await W(() => LiveOut.open()); });
  await W(() => { if ($('#live-modal').hidden) LiveOut.open(); });
  const tabs = await page.$$eval('#live-modal .lv-tabs button', bs => bs.map(b => b.textContent));
  check(tabs.join('|') === 'Titre en cours|Diffusion|Vidéo|Paroles|Karaoké|Connexions', 'Fenêtre Live : six onglets', tabs.join(', '));
  for (const t of tabs) { await page.click(`#live-modal .lv-tabs button:has-text("${t}")`); await sleep(120); await page.screenshot({ path: '/tmp/liveout-' + t.replace(/\W+/g, '-').toLowerCase() + '.png' }); }
  await page.click('#live-modal .lv-tabs button:has-text("Vidéo")');
  const [pop] = await Promise.all([context.waitForEvent('page'), page.click('#live-modal button:has-text("Ouvrir la sortie vidéo")')]);
  await pop.waitForFunction(() => { const v = document.querySelector('video'); return v && v.srcObject && v.videoWidth > 0; }, null, { timeout: 8000 }).catch(() => {});
  const pv = await pop.evaluate(() => { const v = document.querySelector('video'); return { title: document.title, w: v.videoWidth, h: v.videoHeight, live: !!v.srcObject }; });
  check(pv.live && pv.w === 1280 && pv.h === 720 && /sortie vidéo/.test(pv.title), 'Sortie vidéo : fenêtre ouverte, image du mix en 1280×720', JSON.stringify(pv));
  await pop.screenshot({ path: '/tmp/liveout-sortie.png' });
  await pop.close(); await sleep(300);
  check(await W(() => Video.win === null), 'Fenêtre de sortie fermée : Mixlab le voit');
  await page.keyboard.press('Escape');

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Diffusion, vidéo, paroles et connexions : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
