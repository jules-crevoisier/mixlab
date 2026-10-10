'use strict';
// Test de la préparation de set (planner.js) : déroulé et tempos, rendu WAV hors ligne mesuré
// (tempo calé, échange des basses dans la bande grave, traîne d'écho), exports, écoute au master
// et au casque, phrases en français vers une playlist, points de mix suivis par l'auto-mix
// et le coach, relecture des gestes d'une transition jouée en direct.
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };

// Mesures dans la page : énergie dans les graves (deux passe-bas à 120 Hz) et RMS d'un analyseur.
const helpers = () => {
  window.__low = (r, a, b) => {
    const k = Math.exp(-2 * Math.PI * 120 / r.sr), i0 = Math.max(0, Math.round((a - r.T0) * r.sr)), i1 = Math.min(r.L.length, Math.round((b - r.T0) * r.sr));
    let y1 = 0, y2 = 0, s = 0;
    for (let i = Math.max(0, i0 - 4000); i < i1; i++) { const x = (r.L[i] + r.R[i]) / 2; y1 = k * y1 + (1 - k) * x; y2 = k * y2 + (1 - k) * y1; if (i >= i0) s += y2 * y2; }
    return s / Math.max(1, i1 - i0);
  };
  window.__rms = (r, a, b) => { const i0 = Math.round((a - r.T0) * r.sr), i1 = Math.round((b - r.T0) * r.sr); let s = 0; for (let i = i0; i < i1; i++) s += r.L[i] * r.L[i]; return 10 * Math.log10(s / Math.max(1, i1 - i0) + 1e-12); };
  window.__bpmOf = (r, a, b) => {
    const i0 = Math.round((a - r.T0) * r.sr), n = Math.round((b - a) * r.sr), buf = ctx.createBuffer(2, n, r.sr);
    buf.copyToChannel(r.L.slice(i0, i0 + n), 0); buf.copyToChannel(r.R.slice(i0, i0 + n), 1);
    return analyze(buf, true).bpm;
  };
  window.__lvl = async (an, ms) => {
    const b = new Float32Array(an.fftSize); let s = 0, n = 0; const t = performance.now();
    while (performance.now() - t < ms) { an.getFloatTimeDomainData(b); for (const v of b) s += v * v; n += b.length; await new Promise(r => setTimeout(r, 30)); }
    return 10 * Math.log10(s / Math.max(1, n) + 1e-12);
  };
  window.__T = title => LIB.tracks.find(t => t.title === title);
};

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => typeof LIB !== 'undefined' && LIB.tracks.length >= 4 && LIB.tracks.every(t => t.sections), null, { timeout: 60000 });
  await page.mouse.click(800, 5);
  const W = (f, a) => page.evaluate(f, a);
  const wait = async (fn, ms = 4000, a) => { const t = Date.now(); while (Date.now() - t < ms) { if (await W(fn, a)) return true; await sleep(100); } return false; };
  await W(helpers);

  // 0. Trois morceaux de test en plus des démos, pour enchaîner sur la roue harmonique après Néons (8A).
  await W(() => {
    const mk = (title, key, seed, genre) => { const def = { ...DEMOS[0], title, seed, bars: 48, key }; addTrack(synthDemo(def), { title, artist: 'Test', genre, key }); };
    mk('Ambre', { pc: 4, minor: true }, 11, 'House');    // 9A
    mk('Brume', { pc: 11, minor: true }, 23, 'House');   // 10A
    mk('Craie', { pc: 0, minor: false }, 37, 'Techno');  // 8B
  });
  await page.waitForFunction(() => LIB.tracks.length >= 7 && LIB.tracks.every(t => t.sections), null, { timeout: 60000 });

  // 1. Vue : bouton Set, la frise prend la place des platines.
  await page.click('#set-btn');
  const view = await W(() => ({ pl: !document.querySelector('#pl').hidden, body: document.body.classList.contains('planner'), app: !!document.querySelector('#app').offsetParent, pressed: document.querySelector('#set-btn').getAttribute('aria-pressed') }));
  check(view.pl && view.body && !view.app && view.pressed === 'true', 'La préparation s’ouvre en grand à la place des platines', JSON.stringify(view));

  // 2. Déroulé et tempos : verrouillé (tout au tempo du premier), puis naturel (retour au tempo propre).
  const lock = await W(() => {
    Planner.setItems([__T('Néons').id, __T('Quai 9').id], { mode: 'lock', bpm: 0, name: 'Test set' });
    const it = Planner.plan.items;
    it[0].outT = __T('Néons').grid + 160 * 60 / 124; it[0].tr = { bars: 8, preset: 'bass', lanes: Planner.lanesOf('bass') };
    Planner.compute();
    const L = Planner.compute(), [a, b] = L.R;
    return { rIn: b.rIn, S: b.S, exp: it[0].outT - it[0].inT, trDur: a.trDur, E: a.E, total: L.total, bE: b.E, bInT: b.it.inT, endB: Math.min(b.t.duration, b.t.musicEnd), bpmB: b.bpmIn };
  });
  check(Math.abs(lock.rIn - 124 / 127) < 1e-9 && Math.abs(lock.bpmB - 124) < 1e-6, 'Tempo verrouillé : Quai 9 joué à 124 BPM', lock.bpmB.toFixed(3));
  check(Math.abs(lock.S - lock.exp) < 1e-6 && Math.abs(lock.trDur - 8 * 240 / 124) < 1e-6, 'Quai 9 entre au point de sortie de Néons, transition de 8 mesures', lock.S.toFixed(3) + ' s');
  const expTotal = lock.S + (lock.endB - lock.bInT) / lock.rIn;
  check(Math.abs(lock.total - expTotal) < 1e-6, 'Durée du set calculée', lock.total.toFixed(2) + ' s');
  const glide = await W(() => { Planner.plan.mode = 'glide'; const L = Planner.compute(), b = L.R[1]; return { rIn: b.rIn, rOut: b.rOut, segs: b.segs.length, ramp: b.segs.some(s => s.r0 !== s.r1) }; });
  check(glide.rOut === 1 && glide.ramp && Math.abs(glide.rIn - 124 / 127) < 1e-9, 'Tempo naturel : calé pendant la transition puis retour à 127 BPM en 32 temps', JSON.stringify(glide));

  // 3. Rendu WAV complet : taille exacte, en-tête, durée.
  const wav = await W(async () => {
    Planner.plan.mode = 'lock';
    const L = Planner.compute(), r = await Planner.renderWav({ bits: 16 });
    const hd = new Uint8Array(await r.blob.slice(0, 44).arrayBuffer()), dv = new DataView(hd.buffer), str = (o, n) => String.fromCharCode(...hd.slice(o, o + n));
    return { size: r.blob.size, bytes: r.bytes, frames: r.frames, sr: r.sr, exp: Math.round((L.total + 1) * r.sr), riff: str(0, 4), wave: str(8, 4), hsr: dv.getUint32(24, true), ch: dv.getUint16(22, true), bits: dv.getUint16(34, true), data: dv.getUint32(40, true) };
  });
  check(wav.riff === 'RIFF' && wav.wave === 'WAVE' && wav.ch === 2 && wav.bits === 16 && wav.hsr === wav.sr, 'En-tête WAV 16 bits stéréo', JSON.stringify({ sr: wav.hsr, bits: wav.bits }));
  check(wav.frames === wav.exp && wav.size === 44 + wav.frames * 4 && wav.data === wav.frames * 4, 'Longueur du rendu = durée du set (+1 s de traîne)', (wav.frames / wav.sr).toFixed(2) + ' s');

  // 4. Tempo dans le rendu : on mesure le BPM de Quai 9 après la transition.
  const tempo = await W(async () => {
    const L = Planner.compute(), a = L.R[0], r = await Planner.renderRange(a.E + 1, a.E + 27, { L });
    const lockBpm = __bpmOf(r, a.E + 1, a.E + 27);
    Planner.plan.mode = 'glide';
    const G = Planner.compute(), b = G.R[1], g = b.segs.find(s => s.r0 !== s.r1), r2 = await Planner.renderRange(g.t1 + 1, g.t1 + 27, { L: G });
    return { lockBpm, glideBpm: __bpmOf(r2, g.t1 + 1, g.t1 + 27) };
  });
  check(Math.abs(tempo.lockBpm - 124) < .3, 'Rendu verrouillé : Quai 9 mesuré à 124 BPM', String(tempo.lockBpm));
  check(Math.abs(tempo.glideBpm - 127) < .3, 'Rendu naturel : Quai 9 revenu à 127 BPM', String(tempo.glideBpm));

  // 5. Automation dans le rendu : échange des basses mesuré dans les graves (Néons → Ligne 7, kicks calés).
  const bass = await W(async () => {
    Planner.setItems([__T('Néons').id, __T('Ligne 7').id], { mode: 'lock' });
    const it = Planner.plan.items, nt = __T('Néons'), lt = __T('Ligne 7');
    it[0].outT = nt.grid + 160 * 60 / nt.bpm; it[1].inT = lt.grid + 96 * 60 / lt.bpm;
    const run = async lanes => { it[0].tr = { bars: 8, preset: 'bass', lanes }; const L = Planner.compute(), a = L.R[0], r = await Planner.renderRange(a.trStart - 8, a.E + 1, { L });
      const w = (p, q) => __low(r, a.trStart + p * a.trDur, a.trStart + q * a.trDur); return { before: w(-.45, -.05), mid: w(.3, .45), after: w(.6, .72) }; };
    const sw = await run(Planner.lanesOf('bass'));
    const no = Planner.lanesOf('bass'); no.in.low = [[0, .5], [1, .5]]; no.out.low = [[0, .5], [1, .5]];
    const both = await run(no);
    return { sw, both };
  });
  console.log('     graves (énergie) :', JSON.stringify(bass));
  check(bass.both.mid / bass.sw.mid > 1.8, 'Sans échange, les deux basses s’additionnent (graves ×' + (bass.both.mid / bass.sw.mid).toFixed(1) + ')');
  check(bass.sw.mid / bass.sw.before > .5 && bass.sw.mid / bass.sw.before < 1.6 && bass.sw.after / bass.sw.before > .4 && bass.sw.after / bass.sw.before < 1.8, 'Avec l’échange des basses : une seule basse avant et après le milieu',
    (bass.sw.mid / bass.sw.before).toFixed(2) + ' / ' + (bass.sw.after / bass.sw.before).toFixed(2));

  // 6. Écho : la traîne continue après la coupe du volume (piste entrante muette pour mesurer).
  const echo = await W(async () => {
    const it = Planner.plan.items, run = async e => { const l = Planner.lanesOf('echo'); l.in.vol = [[0, 0], [1, 0]]; if (!e) l.out.echo = [[0, 0], [1, 0]]; it[0].tr = { bars: 8, preset: 'echo', lanes: l };
      const L = Planner.compute(), a = L.R[0], r = await Planner.renderRange(a.trStart, a.E, { L }); return __rms(r, a.trStart + .76 * a.trDur, a.trStart + .9 * a.trDur); };
    return { on: await run(true), off: await run(false) };
  });
  check(echo.on > -50 && echo.on - echo.off > 20, 'Sortie en écho : la traîne s’entend après la coupe', `${echo.on.toFixed(1)} dB contre ${echo.off.toFixed(1)} dB`);

  // 7. Exports : M3U8, rekordbox XML, tracklist horodatée.
  const ex = await W(() => {
    Planner.setItems([__T('Néons').id, __T('Quai 9').id, __T('Halogène').id], { mode: 'glide', name: 'Test set' });
    const L = Planner.compute();
    return { m3u: Planner.m3u(), xml: Planner.rekordbox(), tl: Planner.tracklist(), S: L.R.map(r => r.S) };
  });
  const m3l = ex.m3u.trim().split('\n');
  check(m3l[0] === '#EXTM3U' && m3l[1] === '#PLAYLIST:Test set' && /Néons$/.test(m3l[2]) && /Quai 9$/.test(m3l[4]) && /Halogène$/.test(m3l[6]), 'M3U8 : les trois morceaux dans l’ordre', m3l.join(' | ').slice(0, 160));
  const node = /<NODE Name="Test set" Type="1" KeyType="0" Entries="3">([\s\S]*?)<\/NODE>/.exec(ex.xml);
  check(/^<\?xml/.test(ex.xml) && /<COLLECTION Entries="3">/.test(ex.xml) && node && (node[1].match(/<TRACK Key="\d+"\/>/g) || []).length === 3, 'rekordbox XML : collection et playlist du set');
  const keys = node ? [...node[1].matchAll(/Key="(\d+)"/g)].map(m => m[1]) : [];
  const ids = keys.map(k => (new RegExp('<TRACK TrackID="' + k + '" Name="([^"]+)"').exec(ex.xml) || [])[1]);
  check(ids.join(',') === 'Néons,Quai 9,Halogène', 'rekordbox XML : ordre du set', ids.join(','));
  const tl = ex.tl.trim().split('\n');
  const st = s => { s = Math.round(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  check(tl[0].startsWith('Mixlab · Test set') && tl[2].startsWith('00:00 Démo Mixlab - Néons (124 BPM, 8A)') && tl[3].startsWith(st(ex.S[1]) + ' Démo Mixlab - Quai 9') && tl[4].startsWith(st(ex.S[2]) + ' '), 'Tracklist horodatée', tl.slice(2).join(' | '));

  // 8. Phrases en français.
  const P = await W(() => {
    const q = s => { const r = Planner.parse(s); return { ...r, seed: r.seed && r.seed.title }; };
    return {
      a: q('house 122-126 énergie qui monte 1h'), b: q('après Néons, compatible'), c: q('deep house vers 122, 30 min'), d: q('techno sans les démos 8 morceaux'),
      e: q('closing 1h30 énergie 5-8'), f: q('peak time entre 124 et 128 bpm, harmonique'), g: q('tech house moins de 126 bpm sans techno'), h: q('en 8A calme 45 min'), i: q('house zorglub'),
      j: q('une heure et demie de warm-up après Quai 9')
    };
  });
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  check(eq(P.a.genres, ['house']) && eq(P.a.bpm, [122, 126]) && P.a.shape === 'up' && P.a.dur === 3600 && !P.a.ignored.length, '« house 122-126 énergie qui monte 1h »', P.a.chips.join(' · '));
  check(P.b.seed === 'Néons' && P.b.compat && !P.b.ignored.length, '« après Néons, compatible »', P.b.chips.join(' · '));
  check(eq(P.c.genres, ['deep house']) && eq(P.c.bpm, [119, 125]) && P.c.dur === 1800, '« deep house vers 122, 30 min »', P.c.chips.join(' · '));
  check(eq(P.d.genres, ['techno']) && P.d.noDemo && P.d.n === 8, '« techno sans les démos 8 morceaux »', P.d.chips.join(' · '));
  check(P.e.tpl === 'closing' && P.e.shape === 'down' && P.e.dur === 5400 && eq(P.e.energy, [5, 8]), '« closing 1h30 énergie 5-8 »', P.e.chips.join(' · '));
  check(P.f.tpl === 'peak' && eq(P.f.bpm, [124, 128]) && P.f.compat, '« peak time entre 124 et 128 bpm, harmonique »', P.f.chips.join(' · '));
  check(eq(P.g.genres, ['tech house']) && eq(P.g.bpm, [60, 126]) && eq(P.g.without, ['techno']), '« tech house moins de 126 bpm sans techno »', P.g.chips.join(' · '));
  check(P.h.key && P.h.key.pc === 9 && P.h.key.minor && P.h.shape === 'low' && P.h.dur === 2700, '« en 8A calme 45 min »', P.h.chips.join(' · '));
  check(eq(P.i.ignored, ['zorglub']), 'Mot inconnu signalé', P.i.ignored.join(','));
  check(P.j.seed === 'Quai 9' && P.j.dur === 5400 && P.j.tpl === 'warmup' && P.j.shape === 'up', '« une heure et demie de warm-up après Quai 9 »', P.j.chips.join(' · '));

  const B = await W(() => {
    const show = r => r.ids.map(id => { const t = LIB.tracks.find(x => x.id === id); return { title: t.title, bpm: t.bpm, genre: t.genre, key: t.key, code: (keyInfo(t.key) || {}).code, e: Academie.energyOf(t) }; });
    const a = Planner.fromQuery('house 122-126 énergie qui monte 1h'), b = Planner.fromQuery('après Néons, compatible');
    return { a: show(a), aWhy: a.why, b: show(b), compat: show(b).every((t, i, l) => !i || keysCompatible(l[i - 1].key, t.key)), techno: show(Planner.fromQuery('techno sans les démos')).map(t => t.title) };
  });
  console.log('     house 122-126 :', B.a.map(t => t.title + ' E' + t.e + ' ' + t.bpm).join(' → '), '·', B.aWhy);
  console.log('     après Néons :', B.b.map(t => t.title + ' ' + t.code).join(' → '));
  check(B.a.length >= 3 && B.a.every(t => /house/i.test(t.genre) && t.bpm >= 122 && t.bpm <= 126) && B.a.every((t, i, l) => !i || t.e >= l[i - 1].e), 'Playlist house 122-126 : genre, tempo, énergie croissante');
  check(B.b.length >= 3 && B.b[0].title === 'Néons' && B.compat, 'Playlist après Néons : chaque morceau compatible avec le précédent');
  check(eq(B.techno, ['Craie']), 'Filtre genre et « sans les démos »', B.techno.join(','));

  // 9. Interface : phrase tapée, préréglages, courbes, frise.
  await page.fill('#pl-q', 'après Néons, compatible');
  await page.press('#pl-q', 'Enter');
  await sleep(300);
  const ui1 = await W(() => ({ cards: document.querySelectorAll('#pl .pl-card').length, chips: [...document.querySelectorAll('#pl .pl-chip')].map(c => c.textContent), first: document.querySelector('#pl .pl-card .t').textContent }));
  check(ui1.cards >= 3 && ui1.first === 'Néons' && ui1.chips.some(c => /Après « Néons »/.test(c)), 'Phrase tapée : set construit et résumé affiché', ui1.chips.join(' · '));
  await page.click('#pl [data-preset="filter"]');
  const pre = await W(() => ({ p: Planner.plan.items[0].tr.preset, pressed: document.querySelector('#pl [data-preset="filter"]').getAttribute('aria-pressed'), f: Planner.plan.items[0].tr.lanes.out.filter.length }));
  check(pre.p === 'filter' && pre.pressed === 'true' && pre.f === 3, 'Préréglage Filtre appliqué à la transition', JSON.stringify(pre));
  const lb = await page.locator('#pl-lanes').boundingBox();
  const n0 = await W(() => Planner.plan.items[0].tr.lanes.in.mid.length);
  await page.mouse.click(lb.x + 82 + (lb.width - 90) * .5, lb.y + 2 * 34 + 8);
  const n1 = await W(() => ({ n: Planner.plan.items[0].tr.lanes.in.mid.length, custom: Planner.plan.items[0].tr.custom, v: Planner.lv(Planner.plan.items[0].tr.lanes.in.mid, .5) }));
  check(n1.n === n0 + 1 && n1.custom && n1.v > .7, 'Clic dans la courbe Médiums : un point ajouté', JSON.stringify(n1));
  // glisser le deuxième morceau sur la frise : le point de sortie du premier bouge d'une mesure ou plus
  const drag = await W(() => { const L = Planner.compute(), r = L.R[1], cv = document.querySelector('#pl-frise'), b = cv.getBoundingClientRect(), w = document.querySelector('#pl .pl-wrap');
    const P = (w.clientWidth - 24) / Math.max(30, L.total) * Planner.plan.zoom, t = (r.trStart + r.E) / 2 + 2; return { x: b.left + t * P - w.scrollLeft + 12, y: b.top + 24 + 68 + 14 + 30, P, out0: L.R[0].it.outT }; });
  await page.mouse.move(drag.x, drag.y); await page.mouse.down(); await page.mouse.move(drag.x - 40 * drag.P, drag.y, { steps: 6 }); await page.mouse.up();
  const out1 = await W(() => Planner.plan.items[0].outT);
  check(drag.out0 - out1 > 20, 'Glisser un morceau sur la frise avance la transition', (out1 - drag.out0).toFixed(2) + ' s');
  const px = await W(() => { const c = document.querySelector('#pl-frise'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n / (d.length / 4); });
  check(px > .05, 'La frise est dessinée', (px * 100).toFixed(1) + ' %');

  // 10. Écoute d'une transition au master puis au casque (mesurée), lecture du set.
  await W(() => { Planner.plan.selTr = 0; Planner.render(); decks.forEach(d => d.pause()); window.__cueAn = ctx.createAnalyser(); __cueAn.fftSize = 2048; bus.cue.connect(__cueAn); });
  await page.click('#pl [data-aud="master"]');
  await sleep(400);
  const am = await W(async () => ({ m: await __lvl(bus.anL, 700), c: await __lvl(__cueAn, 300), p: Planner.playing }));
  check(am.m > -40 && am.p && am.p.kind === 'tr0' && am.p.where === 'master', 'Écoute au master : la transition sort sur le master', am.m.toFixed(1) + ' dB ' + JSON.stringify(am.p));
  await page.click('#pl [data-aud="cue"]');
  await sleep(500);
  const ac = await W(async () => ({ m: await __lvl(bus.anL, 500), c: await __lvl(__cueAn, 500), p: Planner.playing }));
  check(ac.c > -40 && ac.m < -70 && ac.p.where === 'cue', 'Écoute au casque : rien sur le master', `casque ${ac.c.toFixed(1)} dB, master ${ac.m.toFixed(1)} dB`);
  await page.click('#pl [data-aud="cue"]');
  check(await wait(() => !Planner.playing, 1000), 'Arrêt de l’écoute');
  await page.click('#pl-play');
  await sleep(1200);
  const ps = await W(() => Planner.playing);
  check(ps && ps.kind === 'set' && ps.pos > .6, 'Lecture du set depuis le début', JSON.stringify(ps));
  await page.click('#pl-play');
  check(await wait(() => !Planner.playing, 1000), 'Arrêt de la lecture du set');

  // 11. Rendu par le bouton : barre de progression puis téléchargement du WAV (navigateur).
  await W(() => Planner.setItems([__T('Néons').id, __T('Ligne 7').id], { mode: 'glide', name: 'Rendu test' }));
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.click('#pl-render');
  const shown = await wait(() => !document.querySelector('#pl .pl-prog').hidden, 2000);
  const d = await dl;
  check(shown && d.suggestedFilename() === 'Rendu test.wav', 'Rendu WAV : progression puis fichier téléchargé', d.suggestedFilename());
  // chemin natif : le pont de l'appli reçoit les octets
  await W(() => { window.mixlabNative = { saveBinary: async (name, bytes) => { window.__bin = { name, len: bytes.length, riff: String.fromCharCode(...bytes.slice(0, 4)) }; return '/Musique/' + name; } }; });
  await page.click('#pl-render');
  check(await wait(() => window.__bin, 30000), 'Rendu WAV enregistré par le pont natif');
  const bin = await W(() => ({ ...window.__bin, exp: 44 + Math.round((Planner.compute().total + 1) * ctx.sampleRate) * 4 }));
  check(bin.riff === 'RIFF' && bin.len === bin.exp && bin.name === 'Rendu test.wav', 'Octets WAV complets transmis', JSON.stringify(bin));
  await W(() => { delete window.mixlabNative; });

  // 12. Point de mix : préparé ici, suivi par l'auto-mix (Quai 9 → Halogène, sortie mesure 41, entrée mesure 9).
  const lk = await W(() => {
    const q = __T('Quai 9'), g = __T('Halogène');
    Planner.setItems([q.id, g.id], { mode: 'glide', name: 'Lien' });
    const it = Planner.plan.items; it[0].outT = q.grid + 160 * 60 / q.bpm; it[1].inT = g.grid + 32 * 60 / g.bpm; it[0].tr = { bars: 8, preset: 'bass', lanes: Planner.lanesOf('bass') };
    Planner.compute(); Planner.render(); Planner.saveLink(q, g, { outT: it[0].outT, inT: it[1].inT, bars: 8, preset: 'bass' });
    const l = Planner.link(q, g); return { l, chip: !!document.querySelector('#pl-link') };
  });
  check(lk.l && lk.l.bars === 8 && lk.chip, 'Transition préparée enregistrée comme point de mix', JSON.stringify({ bars: lk.l && lk.l.bars, chip: lk.chip }));
  await page.keyboard.press('Escape');
  check(await W(() => document.querySelector('#pl').hidden && !document.body.classList.contains('planner')), 'Échap : retour aux platines');
  await W(() => {
    resetMixer(); MixCoach.state.hist.length = 0;
    const a = decks[0]; a.load(__T('Quai 9')); a.seek(a.timeOfBeat(150)); controls.get('A.fader').set(1); controls.get('A.play').press({});
    AutoMix.queue = [__T('Halogène').id]; AutoMix.setStyle('cut'); AutoMix.setBars(16); AutoMix.start();
  });
  check(await wait(() => AutoMix.state.inc && AutoMix.state.plan, 3000), 'Auto-mix : Halogène préparée sur l’autre platine');
  const am1 = await W(() => { const s = AutoMix.state, i = s.inc; return { start: s.plan.start, len: s.plan.len, style: s.plan.style, link: s.plan.link, why: s.plan.why, beat: i.beatIdx(i.position()) }; });
  check(am1.start === 160 && am1.len === 32 && am1.style === 'bass' && am1.link, 'Auto-mix : départ, durée et style du point de mix (au lieu de « Coupe » 16 mesures)', JSON.stringify(am1));
  check(Math.abs(am1.beat - 32) < .05, 'Auto-mix : platine entrante calée sur le point d’entrée', am1.beat.toFixed(2));
  check(await wait(() => AutoMix.state.st === 'mix', 8000), 'Auto-mix : transition lancée au point préparé');
  const b0 = await W(() => ({ b0: AutoMix.state.b0, out: decks[0].beatPos() }));
  check(b0.b0 === 32 && Math.abs(b0.out - 160) < 1.5, 'Halogène part de la mesure 9 quand Quai 9 atteint la mesure 41', JSON.stringify(b0));
  await W(() => { AutoMix.stop(); decks.forEach(d => d.pause()); });

  // 13. Coach : le point de mix approche ; la platine chargée à la main se cale sur l'entrée prévue.
  await W(() => { resetMixer(); decks[1].load(__T('Néons')); decks[1].pause(); const a = decks[0]; a.load(__T('Quai 9')); a.seek(a.timeOfBeat(140)); controls.get('A.fader').set(1); controls.get('A.play').press({}); MixCoach.setLevel('debutant'); });
  await sleep(500);
  await W(() => decks[1].load(__T('Halogène')));
  check(await wait(() => Math.abs(decks[1].beatIdx(decks[1].position()) - 32) < .05, 2000), 'Platine chargée à la main calée sur le point d’entrée');
  check(await wait(() => MixCoach.state.issues.has('mixpoint'), 3000), 'Coach : conseil du point de mix', await W(() => { const x = MixCoach.state.issues.get('mixpoint'); return x ? x.msg : ''; }));
  await W(() => decks.forEach(d => d.pause()));

  // 14. Relecture : une transition jouée à la main, ses gestes sur une mini frise dans le bilan.
  await W(() => { resetMixer(); MixCoach.state.hist.length = 0; const a = decks[0], b = decks[1]; a.load(__T('Néons')); b.load(__T('Ligne 7'));
    a.seek(a.timeOfBeat(64)); b.seek(b.timeOfBeat(64)); controls.get('A.fader').set(1); controls.get('B.fader').set(0); controls.get('B.low').set(0);
    a.play(); if (!b.sync) b.toggleSync(); b.play(); });
  await sleep(1500);
  for (let i = 1; i <= 8; i++) { await W(v => controls.get('B.fader').set(v), i / 8); await sleep(180); }
  await W(() => controls.get('B.low').set(.5)); await W(() => controls.get('A.low').set(0)); await sleep(500);
  for (let i = 7; i >= 0; i--) { await W(v => controls.get('A.fader').set(v), i / 8); await sleep(180); }
  check(await wait(() => MixCoach.state.hist.length > 0, 5000), 'Bilan de la transition par le coach');
  const rp = await W(() => { const r = MixCoach.state.hist[0]; return { from: r.from, to: r.to, n: r.replay && r.replay.samples.length, card: !!document.querySelector('#coach-direct .trcard canvas.pl-replay'), mine: Planner.replays.length,
    aF: r.replay && [r.replay.samples[0].a.g, r.replay.samples[r.replay.samples.length - 1].a.g], bF: r.replay && [r.replay.samples[0].b.g, r.replay.samples[r.replay.samples.length - 1].b.g] }; });
  check(rp.from === 'A' && rp.to === 'B' && rp.n > 15 && rp.aF[0] > .9 && rp.aF[1] < .05 && rp.bF[1] > .9, 'Gestes enregistrés : fader A descend, fader B monte', JSON.stringify(rp));
  check(rp.card && rp.mine >= 1, 'Mini frise dans le bilan du coach et dans la préparation');
  await W(() => decks.forEach(d => d.pause()));
  await page.click('#set-btn');
  const cp = await W(() => { Planner.setItems([__T('Néons').id, __T('Ligne 7').id]); const ok = Planner.replayToLanes(Planner.replays[0], 0), l = Planner.plan.items[0].tr.lanes;
    return { ok, outVol: [Planner.lv(l.out.vol, 0), Planner.lv(l.out.vol, 1)], inVol: [Planner.lv(l.in.vol, 0), Planner.lv(l.in.vol, 1)], rp: document.querySelectorAll('#pl-replays canvas').length }; });
  check(cp.ok && cp.outVol[0] > .9 && cp.outVol[1] < .05 && cp.inVol[0] < .1 && cp.inVol[1] > .9 && cp.rp >= 1, 'Gestes repris comme courbes d’une transition du set', JSON.stringify(cp));
  await page.screenshot({ path: '/tmp/mixlab-planner.png' });
  await page.click('#pl-close');

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Préparation de set : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
