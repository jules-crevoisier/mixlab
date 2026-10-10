'use strict';
// Test des entrées, sorties, du mastering et des effets en plus (io.js, fx-plus.js) :
// talkover, booth, sorties séparées, maximiseur, effets nouveaux, effet de crossfader,
// EQ 4 bandes, platines d'entrée, enregistrement du micro, latence, cue sheet.
// On mesure le son à l'analyseur. Micro et cartes son sont simulés par Chromium.
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };
const r1 = x => Math.round(x * 10) / 10;

// Mesures dans la page : RMS, crête et énergie par bandes (dB), sur une durée.
const helpers = () => {
  const tick = () => new Promise(r => setTimeout(r, 20));
  window.__rms = async (an, ms) => { const b = new Float32Array(an.fftSize); let s = 0, n = 0; const t = performance.now(); while (performance.now() - t < ms) { an.getFloatTimeDomainData(b); for (const v of b) s += v * v; n += b.length; await tick(); } return Math.sqrt(s / Math.max(1, n)); };
  window.__peak = async (an, ms) => { const b = new Float32Array(an.fftSize); let p = 0; const t = performance.now(); while (performance.now() - t < ms) { an.getFloatTimeDomainData(b); for (const v of b) { const a = Math.abs(v); if (a > p) p = a; } await tick(); } return p; };
  window.__bands = async (an, ms) => {
    const f = new Float32Array(an.frequencyBinCount), hz = ctx.sampleRate / an.fftSize, E = new Float64Array(20), sm = an.smoothingTimeConstant; an.smoothingTimeConstant = 0; let k = 0; const t = performance.now();
    while (performance.now() - t < ms) { an.getFloatFrequencyData(f); for (let i = 1; i < f.length; i++) { const fr = i * hz; if (fr < 60 || fr > 16000) continue; const bi = Math.min(19, Math.floor(Math.log(fr / 60) / Math.log(16000 / 60) * 20)); E[bi] += Math.pow(10, f[i] / 10); } k++; await tick(); }
    an.smoothingTimeConstant = sm; return Array.from(E, e => 10 * Math.log10(e / Math.max(1, k) + 1e-20));
  };
  // écart spectral moyen sur les bandes qui portent le son de référence (à moins de 40 dB de la plus forte)
  window.__dist = (a, b) => { const top = Math.max(...b); let s = 0, n = 0; for (let i = 0; i < a.length; i++) { if (b[i] < top - 40) continue; s += Math.abs(a[i] - b[i]); n++; } return s / Math.max(1, n); };
  // niveau (dB) aux fréquences données, crête sur ±2 cases de la FFT
  window.__at = async (an, fs, ms) => {
    const f = new Float32Array(an.frequencyBinCount), hz = ctx.sampleRate / an.fftSize, E = fs.map(() => 0); an.smoothingTimeConstant = 0; let k = 0; const t = performance.now();
    while (performance.now() - t < ms) { an.getFloatFrequencyData(f); fs.forEach((x, j) => { const c = Math.round(x / hz); let m = -200; for (let i = c - 2; i <= c + 2; i++) m = Math.max(m, f[i]); E[j] += Math.pow(10, m / 10); }); k++; await new Promise(r => setTimeout(r, 30)); }
    return E.map(e => 10 * Math.log10(e / Math.max(1, k) + 1e-20));
  };
  window.__an = node => { const a = ctx.createAnalyser(); a.fftSize = 2048; node.connect(a); return a; };
  // morceau stable : accord tenu et bruit, pour des mesures qui ne bougent pas avec la musique
  window.__steady = () => {
    const sr = ctx.sampleRate, n = sr * 60, b = ctx.createBuffer(2, n, sr);
    let seed = 7; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) { const t = i / sr; d[i] = .14 * Math.sin(2 * Math.PI * 110 * t) + .12 * Math.sin(2 * Math.PI * 440 * t) + .1 * Math.sin(2 * Math.PI * 1000 * t) + .08 * Math.sin(2 * Math.PI * 2500 * t) + .06 * Math.sin(2 * Math.PI * 6000 * t) + .05 * rnd(); } }
    const tr = addTrack(b, { title: 'Stable', artist: 'Testeur' }); tr.bpm = 120; tr.grid = 0; return tr;
  };
};

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  let page = await context.newPage();
  watch(page);
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.length >= 4 && decks[1].track, null, { timeout: 60000 });
  await page.mouse.click(683, 5);
  await page.evaluate(helpers);
  const W = (f, a) => page.evaluate(f, a);

  // ---------- 0. Branchement ----------
  const boot = await W(() => ({ io: IO.N.ok, opts: [...document.querySelectorAll('#p-fx select')[0].options].map(o => o.value), fav: document.querySelectorAll('.fxfav').length, mic: !!document.querySelector('#p-mixer .mxpop .iomic'), eq4: !!document.querySelector('#p-mixer select.eqm option[value="4band"]'), xfx: !!document.querySelector('#p-mixer .mxpop select[aria-label="Effet de crossfader"]') }));
  const want = ['pitchfx', 'helix', 'shimmer', 'mobius', 'revrise', 'revdrop', 'buildup', 'breakdown', 'scene'];
  check(boot.io && want.every(t => boot.opts.includes(t)), 'Les sélecteurs des unités FX listent les nouveaux effets', boot.opts.slice(-9).join(', '));
  check(boot.fav === 2 && boot.mic && boot.eq4 && boot.xfx, 'Mixer : bouton Micro, option EQ 4 bandes, effet de crossfader ; bouton Fav sur chaque unité', JSON.stringify(boot));

  await W(() => { S.quantize = false; const tr = __steady(); decks[0].load(tr); decks[0].seek(1); decks[0].ui.fader.set(1); ui.setX(.5); decks[0].play(); });
  await sleep(600);

  // ---------- 1. Talkover : profondeur du ducking ----------
  const duck = await W(async () => {
    const o = ctx.createOscillator(); o.frequency.value = 300; const og = ctx.createGain(); og.gain.value = 0; o.connect(og); o.start();
    IO.setMicSource(og); IO.setMic({ talk: 'auto', depth: 12 }); await IO.micSet(true);
    const a = await __rms(IO.N.music, 700);
    og.gain.value = .3; await new Promise(r => setTimeout(r, 400));
    const b = await __rms(IO.N.music, 700), master = await __rms(bus.anL, 300);
    og.gain.value = 0; await new Promise(r => setTimeout(r, 1300));
    const c = await __rms(IO.N.music, 700);
    IO.setMic({ talk: 'on' }); await new Promise(r => setTimeout(r, 300)); const d = await __rms(IO.N.music, 500);
    IO.setMic({ talk: 'auto' }); await IO.micSet(false); IO.setMicSource(null); o.stop();
    return { a, b, c, d, master };
  });
  const dd = 20 * Math.log10(duck.b / duck.a), back = 20 * Math.log10(duck.c / duck.a), forced = 20 * Math.log10(duck.d / duck.a);
  check(Math.abs(dd + 12) < 1.5, 'Talkover : la musique baisse de 12 dB quand on parle', r1(dd) + ' dB');
  check(Math.abs(back) < 1, 'Talkover : la musique remonte quand on se tait', r1(back) + ' dB');
  check(Math.abs(forced + 12) < 1.5, 'Talkover « tant que le micro est ouvert » : baisse sans parler', r1(forced) + ' dB');

  // ---------- 2. Micro réel (simulé par Chromium) et enregistrement du micro ----------
  const mic = await W(async () => {
    const ok = await IO.micSet(true); await new Promise(r => setTimeout(r, 600));
    const p = await __peak(IO.N.micAn, 500);
    const n0 = lib.recs.length; IO.recInput('mic'); await new Promise(r => setTimeout(r, 1300)); IO.recInput('mic');
    for (let i = 0; i < 50 && lib.recs.length === n0; i++) await new Promise(r => setTimeout(r, 100));
    const it = lib.recs[lib.recs.length - 1]; await IO.micSet(false); IO.setMicSource(null);
    return { ok, p, name: it && it.name, size: it && it.blob && it.blob.size };
  });
  check(mic.ok && mic.p > .01, 'Micro ouvert : le signal arrive dans la voie micro', mic.p.toFixed(3));
  check(/^micro-.*\.webm$/.test(mic.name || '') && mic.size > 200, 'Enregistrement du micro gardé dans la bibliothèque', mic.name + ' · ' + mic.size + ' o');

  // ---------- 3. Booth : volume indépendant du master ----------
  const booth = await W(async () => {
    setMasterVol(.8); IO.setBooth(.8); await new Promise(r => setTimeout(r, 200));
    const b1 = await __rms(IO.N.boothAn, 600), m1 = await __rms(bus.anL, 600);
    setMasterVol(.2); await new Promise(r => setTimeout(r, 200));
    const b2 = await __rms(IO.N.boothAn, 600), m2 = await __rms(bus.anL, 600);
    IO.setBooth(.4); await new Promise(r => setTimeout(r, 200));
    const b3 = await __rms(IO.N.boothAn, 600); IO.setBooth(.8); setMasterVol(.8);
    return { b1, b2, b3, m1, m2 };
  });
  const dm = 20 * Math.log10(booth.m2 / booth.m1), db1 = 20 * Math.log10(booth.b2 / booth.b1), db2 = 20 * Math.log10(booth.b3 / booth.b2);
  check(dm < -10 && Math.abs(db1) < 1, 'Booth : le master baisse de 12 dB, le booth ne bouge pas', 'master ' + r1(dm) + ' dB, booth ' + r1(db1) + ' dB');
  check(Math.abs(db2 + 6) < 1, 'Booth : son propre volume (moitié = -6 dB)', r1(db2) + ' dB');

  // ---------- 4. Sorties : booth et platine vers une autre carte, canaux d'une carte multicanal ----------
  const outs = await W(async () => {
    const devs = await IO.listDevices(), dev = devs.out.find(d => d.deviceId !== 'default');
    const okB = await IO.setOut('booth', 'dev:' + dev.deviceId);
    const tA = __an(IO.N.tap.A);
    const m0 = await __rms(bus.anL, 500);
    const okA = await IO.setOut('A', 'dev:' + dev.deviceId); await new Promise(r => setTimeout(r, 200));
    const m1 = await __rms(bus.anL, 500), t1 = await __rms(tA, 500);
    await IO.setOut('A', ''); await new Promise(r => setTimeout(r, 200));
    const m2 = await __rms(bus.anL, 500);
    const okCh = await IO.setOut('booth', 'ch:2');
    await IO.setOut('booth', '');
    return { n: devs.out.length, okB, okA, m0, m1, m2, t1, okCh, max: IO.maxChannels(), tgt: IO.Q.booth.target };
  });
  check(outs.okB && outs.okA, 'Booth et platine A envoyés vers une autre carte son (setSinkId)', outs.n + ' sorties');
  check(outs.m1 < outs.m0 * .02 && outs.t1 > .01 && outs.m2 > outs.m0 * .8, 'Mixer externe : la platine A sort à part et quitte le master, puis y revient', JSON.stringify({ m0: r1(outs.m0 * 1000), m1: r1(outs.m1 * 1000), t1: r1(outs.t1 * 1000), m2: r1(outs.m2 * 1000) }));
  check(outs.max >= 4 ? outs.okCh : !outs.okCh, 'Canaux 3-4 : refusés honnêtement sur une carte à ' + outs.max + ' canaux', String(outs.okCh));

  // ---------- 5. Maximiseur : le plafond n'est jamais dépassé ----------
  const mx = await W(async () => {
    const t = Structure && LIB.tracks.find(x => x.demo);
    decks[1].load(LIB.tracks[1]); decks[1].seek(30); decks[1].ui.fader.set(1); decks[1].play();
    decks.slice(0, 2).forEach(d => d.ui.k.trim.set(1)); setMasterVol(1);
    const an = __an(bus.out); an.fftSize = 2048;
    const off = await __peak(an, 1500);
    IO.setMax({ on: true, ceiling: -1, drive: 12 }); await new Promise(r => setTimeout(r, 100));
    const on = await __peak(an, 3000), red = IO.maxReduction();
    IO.setMax({ ceiling: -3 }); await new Promise(r => setTimeout(r, 100));
    const on3 = await __peak(an, 2000);
    IO.setMax({ on: false, ceiling: -1, drive: 3 });
    decks.slice(0, 2).forEach(d => d.ui.k.trim.set(.5)); setMasterVol(.8); decks[1].pause();
    return { off, on, on3, red, c1: dbToGain(-1), c3: dbToGain(-3) };
  });
  check(mx.on <= mx.c1 + 1e-4 && mx.on > mx.c1 * .8, 'Maximiseur : crête sous le plafond de -1 dB, poussé de +12 dB', 'crête ' + r1(20 * Math.log10(mx.on)) + ' dBFS, réduction ' + r1(mx.red) + ' dB, sans maximiseur ' + r1(20 * Math.log10(mx.off)) + ' dBFS');
  check(mx.on3 <= mx.c3 + 1e-4, 'Maximiseur : plafond à -3 dB respecté', r1(20 * Math.log10(mx.on3)) + ' dBFS');

  // ---------- 6. Chaque nouvel effet change le son ----------
  await W(() => { decks[0].seek(1); const u = FXU[0]; u.targets.clear(); u.targets.add('A'); u.setMode('single'); u.beats = 1; });
  // référence : deux mesures après un temps de repos (fin des rampes du test précédent), moyennées
  const base = await W(async () => { await new Promise(r => setTimeout(r, 1500)); const a = await __bands(decks[0].an, 1500), b = await __bands(decks[0].an, 1500); return { a: a.map((x, i) => (x + b[i]) / 2), noise: __dist(b, a) }; });
  check(base.noise < 1.2, 'Mesure de référence stable (morceau tenu)', r1(base.noise) + ' dB');
  for (const ty of want) {
    const r = await W(async ([ty, ref]) => {
      const u = FXU[0]; u.setSlot(0, { type: ty }); u.setSlot(0, { amount: .8, p2: ty === 'scene' ? .5 : FX_P[ty][1] && /Durée/.test(FX_P[ty][1][0]) ? 0 : u.slots[0].p2 });
      u.setOn(true); await new Promise(r => setTimeout(r, ty === 'revrise' || ty === 'buildup' || ty === 'breakdown' || ty === 'shimmer' ? 2500 : 900));
      const on = await __bands(decks[0].an, 800); u.setOn(false); await new Promise(r => setTimeout(r, 2800));
      return __dist(on, ref);
    }, [ty, base.a]);
    check(r > Math.max(1.5, 2 * base.noise), 'Effet « ' + ty + ' » : le son change nettement', r1(r) + ' dB d’écart spectral');
  }
  const after = await W(async ([ref]) => __dist(await __bands(decks[0].an, 1200), ref), [base.a]);
  check(after < 1, 'Effets coupés : le son revient à l’original', r1(after) + ' dB');

  // ---------- 7. Favoris d'effets ----------
  const fav = await W(async () => {
    const u = FXU[0]; u.setMode('chain'); u.setSlot(0, { type: 'shimmer', amount: .3, on: true }); u.setSlot(1, { type: 'helix', on: true }); u.beats = 2;
    FxPlus.saveFav(u, 'Test chaîne'); u.setMode('single'); u.setSlot(0, { type: 'echo' }); u.setSlot(1, { type: 'reverb', on: false }); u.beats = 1;
    const ok = FxPlus.recall(u, 'Test chaîne');
    return { ok, mode: u.mode, t0: u.slots[0].type, a0: u.slots[0].amount, t1: u.slots[1].type, on1: u.slots[1].on, beats: u.beats, sel: u.ui.slots[0].sel.value, n: FxPlus.list().length };
  });
  check(fav.ok && fav.mode === 'chain' && fav.t0 === 'shimmer' && Math.abs(fav.a0 - .3) < 1e-6 && fav.t1 === 'helix' && fav.on1 && fav.beats === 2 && fav.sel === 'shimmer', 'Favori : la chaîne de l’unité est gardée puis rappelée', JSON.stringify(fav));
  await W(() => { layout.visible.add('fx'); applyLayout(); });
  await page.click('#fxu-1 .fxfav');
  const favUi = await W(() => ({ open: !!document.querySelector('.popx'), txt: (document.querySelector('.popx') || {}).textContent || '' }));
  check(favUi.open && favUi.txt.includes('Test chaîne'), 'Bouton Fav : la liste des favoris s’ouvre', '');
  await page.keyboard.press('Escape');
  await W(() => { const u = FXU[0]; u.setOn(false); u.setMode('single'); u.setSlot(0, { type: 'echo' }); u.setSlot(1, { type: 'reverb', on: false }); u.beats = 1; FxPlus.remove('Test chaîne'); });

  // ---------- 8. Effet de crossfader ----------
  const xfx = await W(async () => {
    const X = IO.N.xfx.A, an = __an(X.ret);
    ui.setX(0); IO.setXfx({ type: 'echo', depth: .8 }); await new Promise(r => setTimeout(r, 400));
    const e0 = await __rms(an, 500);
    ui.setX(.9); await new Promise(r => setTimeout(r, 900));
    const e9 = await __rms(an, 500);
    IO.setXfx({ type: 'filter' }); ui.setX(1); await new Promise(r => setTimeout(r, 300)); const f9 = X.hp.frequency.value;
    ui.setX(0); await new Promise(r => setTimeout(r, 300)); const f0 = X.hp.frequency.value;
    IO.setXfx({ type: 'off' }); ui.setX(.5);
    return { e0, e9, f0, f9 };
  });
  check(xfx.e0 < .002 && xfx.e9 > .01, 'Effet de crossfader (écho) : il monte quand le crossfader s’éloigne de A', JSON.stringify({ e0: xfx.e0.toFixed(4), e9: xfx.e9.toFixed(3) }));
  check(xfx.f0 < 20 && xfx.f9 > 1000, 'Effet de crossfader (filtre) : le passe-haut monte avec le crossfader', Math.round(xfx.f0) + ' → ' + Math.round(xfx.f9) + ' Hz');

  // ---------- 9. EQ 4 bandes ----------
  await page.click('#p-mixer .mxset summary');
  await page.selectOption('#p-mixer select.eqm', '4band');
  await page.click('#p-mixer .mxset summary');
  const eq = await W(async () => {
    const d = decks[0]; d.seek(1); if (!d.playing) d.play(); await new Promise(r => setTimeout(r, 300));
    const k = d.ui.k, vis = !k.mid2.el.closest('.eq').hidden, lab = k.mid.lab.textContent;
    const an = __an(d.fader); an.fftSize = 16384; await new Promise(r => setTimeout(r, 600));
    const a = await __at(an, [110, 2500], 800);
    k.mid2.set(0); await new Promise(r => setTimeout(r, 300));
    const b = await __at(an, [110, 2500], 800); k.mid2.set(.5);
    return { vis, lab, mode: S.eqMode, d25: b[1] - a[1], d110: b[0] - a[0] };
  });
  check(eq.vis && eq.mode === '4band' && eq.lab === 'L-mid', 'EQ 4 bandes : le potard H-mid apparaît, Mid devient L-mid', JSON.stringify({ vis: eq.vis, lab: eq.lab }));
  check(eq.d25 < -15 && Math.abs(eq.d110) < 1.5, 'EQ 4 bandes : H-mid à zéro coupe 2,5 kHz sans toucher les graves', r1(eq.d25) + ' dB à 2,5 kHz, ' + r1(eq.d110) + ' dB à 110 Hz');
  await W(() => { S.eqMode = 'iso'; store.set('eqMode', 'iso'); document.querySelector('#p-mixer select.eqm').value = 'iso'; decks.forEach(applyMix); });
  const eqOff = await W(() => ({ hid: decks[0].ui.k.mid2.el.closest('.eq').hidden, g: decks[0].mid2.gain.value }));
  check(eqOff.hid, 'EQ isolateur : le potard H-mid se cache', JSON.stringify(eqOff));

  // ---------- 10. Platine d'entrée ----------
  const live = await W(async () => {
    const d = decks[1]; d.pause(); d.ui.fader.set(1);
    const o = ctx.createOscillator(); o.frequency.value = 220; const og = ctx.createGain(); og.gain.value = .3; o.connect(og); o.start();
    IO.attachLive(d, og, null, 'Test'); await new Promise(r => setTimeout(r, 300));
    const a = await __rms(d.an, 500), badge = (document.querySelector('#p-deckB .io-live') || {}).textContent;
    d.ui.fader.set(0); await new Promise(r => setTimeout(r, 300)); const b = await __rms(d.an, 400); d.ui.fader.set(1);
    IO.liveClose(d); o.stop();
    const x = await IO.liveOpen(d, ''); await new Promise(r => setTimeout(r, 700)); const c = await __peak(d.an, 1500);
    const n0 = lib.recs.length; IO.recInput('B'); await new Promise(r => setTimeout(r, 1100)); IO.recInput('B');
    for (let i = 0; i < 50 && lib.recs.length === n0; i++) await new Promise(r => setTimeout(r, 100));
    IO.liveClose(d);
    return { a, b, c, badge, x: !!x, rec: lib.recs[lib.recs.length - 1].name, gone: !document.querySelector('#p-deckB .io-live') };
  });
  check(live.a > .02 && live.b < .001 && live.badge === 'Entrée : Test', 'Platine d’entrée : l’entrée passe par la voie (fader compris)', JSON.stringify({ a: live.a.toFixed(3), b: live.b.toFixed(4) }));
  check(live.x && live.c > .005 && /^entree-B-.*\.webm$/.test(live.rec) && live.gone, 'Platine d’entrée sur une vraie entrée, enregistrée puis débranchée', live.rec + ' · crête ' + live.c.toFixed(3));

  // ---------- 11. Latence : mesure en boucle (sortie → retard connu → entrée) ----------
  const lat = await W(async () => {
    const out = ctx.createGain(), dl = ctx.createDelay(1); dl.delayTime.value = .05; out.connect(dl);
    const r = await IO.measure({ input: dl, output: out }); out.disconnect(); return { r, info: IO.latencyInfo() };
  });
  check(lat.r && Math.abs(lat.r.ms - 50) < 1.5 && lat.r.n >= 5, 'Mesure de latence en boucle : 50 ms retrouvés', lat.r && r1(lat.r.ms) + ' ms, ' + lat.r.n + ' clics');
  check(lat.info.sampleRate > 0 && lat.info.baseMs >= 0 && typeof lat.info.rateOk === 'boolean', 'Latence annoncée par le navigateur affichée', JSON.stringify({ sr: lat.info.sampleRate, buf: r1(lat.info.baseMs), out: r1(lat.info.outMs) }));
  await page.click('#p-mixer .mxset summary');
  await page.click('#p-mixer [data-ctl="io.open"]');
  await page.waitForFunction(() => !document.querySelector('#io-modal').hidden, null, { timeout: 5000 });
  const modal = await W(() => { const m = document.querySelector('#io-modal'); return { open: !m.hidden, txt: m.textContent }; });
  check(modal.open && /Mesure aller-retour : 50/.test(modal.txt) && /Booth/.test(modal.txt) && /Maximiseur/.test(modal.txt) && /Platines d’entrée/.test(modal.txt), 'Fenêtre Entrées et sorties : latence mesurée, booth, maximiseur, entrées', '');
  await page.getByRole('button', { name: 'Son de test' }).click();
  const tone = await W(() => !!(IO && document.querySelector('#io-modal .b.on')));
  await page.getByRole('button', { name: 'Son de test' }).click();
  check(tone, 'Son de test : marche et arrêt', '');
  await page.click('#io-modal .mbox h2 .b');

  // ---------- 12. Cue sheet de l'enregistrement ----------
  const cs = await W(async () => {
    DeckPro.P.recFormat = 'webm';
    const A = decks[0], B = decks[1]; B.load(LIB.tracks[1]); B.seek(10); B.ui.fader.set(1); ui.setX(0);
    if (!A.playing) A.play();
    document.querySelector('#rec-btn').click();
    await new Promise(r => setTimeout(r, 2600));
    B.play(); ui.setX(1); const tSw = (performance.now() - REC.t0) / 1000;
    await new Promise(r => setTimeout(r, 2600));
    document.querySelector('#rec-btn').click();
    for (let i = 0; i < 60 && !lib.recs.some(r => /\.cue$/.test(r.name)); i++) await new Promise(r => setTimeout(r, 100));
    const s = IO.sheet, cueRec = lib.recs.find(r => /\.cue$/.test(r.name)), txtRec = lib.recs.find(r => /\.txt$/.test(r.name));
    const fetched = cueRec ? await (await fetch(cueRec.url)).text() : '';
    A.pause(); B.pause(); ui.setX(.5);
    return { tSw, list: s && s.list, cue: s && s.cue, txt: s && s.txt, file: s && s.file, cueName: cueRec && cueRec.name, txtName: txtRec && txtRec.name, same: fetched === (s && s.cue), A: A.track.title, B: B.track.title, idx: s && s.list[1] ? IO.cueTime(s.list[1].t) : '' };
  });
  check(cs.list && cs.list.length === 2 && cs.list[0].title === cs.A && cs.list[0].t === 0 && cs.list[1].title === cs.B, 'Cue sheet : les deux morceaux joués, dans l’ordre', JSON.stringify(cs.list));
  check(cs.list && Math.abs(cs.list[1].t - cs.tSw) < .4, 'Cue sheet : l’horodatage suit le changement de morceau', cs.list && (r1(cs.list[1].t) + ' s pour ' + r1(cs.tSw) + ' s'));
  check(cs.cue && /FILE "mixlab-mix-\d+\.webm"/.test(cs.cue) && cs.cue.includes('TRACK 02 AUDIO') && cs.cue.includes('INDEX 01 00:00:00') && cs.cue.includes('INDEX 01 ' + cs.idx) && cs.same, 'Fichier .cue : FILE, TRACK, INDEX en minutes:secondes:images', cs.idx);
  check(cs.cueName && cs.txtName && cs.cueName.replace('.cue', '') === cs.file.replace(/\.[^.]+$/, '') && cs.txt.split('\n').filter(l => /^\d\d:\d\d  /.test(l)).length === 2, 'Cue sheet et tracklist texte rangées à côté de l’enregistrement', cs.cueName + ', ' + cs.txtName);

  // ---------- 13. Buffer et fréquence gardés pour le prochain démarrage ----------
  await W(() => IO.setCtxPref({ hint: '10', sr: 48000 }));
  await page.close();
  page = await context.newPage(); watch(page);
  await page.goto(url);
  await page.waitForFunction(() => window.IO && IO.N.ok, null, { timeout: 60000 });
  const re = await page.evaluate(() => ({ sr: ctx.sampleRate, li: IO.latencyInfo(), opt: window.MixlabCtxOpts }));
  check(re.sr === 48000 && re.opt.latencyHint === .01 && re.li.hint === '10' && re.li.rateOk, 'Buffer 10 ms et 48 kHz appliqués au redémarrage', JSON.stringify({ sr: re.sr, buf: r1(re.li.baseMs) }));
  await page.evaluate(() => IO.setCtxPref({ hint: 'interactive', sr: 0 }));
  const desc = await page.evaluate(() => (window.MixlabSettings || []).filter(s => /^io\./.test(s.key)).map(s => s.key + '=' + s.get()));
  check(desc.length >= 8, 'Réglages exposés à la fenêtre Préférences', desc.join(' '));
  await page.close();

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Entrées, sorties, mastering et effets en plus : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
