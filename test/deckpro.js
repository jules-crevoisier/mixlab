'use strict';
// Test des platines et du mixer « pro » (deck-pro.js) : modes de cue, Cue Play, sens du pitch,
// ton fin, key sync, tonalité corrigée, platine doublée, pré-écoute, chargement du suivant,
// courbes des faders, résonance, balance, verrou de grille, métronome, sync à la mesure et
// à la phrase, compte à rebours, enregistrement WAV. On mesure le son quand c'est possible.
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };

// Mesures dans la page : RMS moyen sur une durée, et fréquence dominante (FFT fine).
const helpers = () => {
  window.__rms = async (an, ms) => {
    const b = new Float32Array(an.fftSize); let s = 0, n = 0; const t = performance.now();
    while (performance.now() - t < ms) { an.getFloatTimeDomainData(b); for (const v of b) s += v * v; n += b.length; await new Promise(r => setTimeout(r, 23)); }
    return Math.sqrt(s / Math.max(1, n));
  };
  // fréquence moyenne par comptage des passages à zéro sur des fenêtres de 0,74 s
  // (le pitch shifter granulaire étale le spectre : le pic de la FFT ne suffit pas)
  window.__peakHz = async (node, ms) => {
    const an = ctx.createAnalyser(); an.fftSize = 32768; node.connect(an);
    const b = new Float32Array(an.fftSize); let cr = 0, sec = 0; const t = performance.now();
    await new Promise(r => setTimeout(r, 800));
    while (performance.now() - t < ms) {
      an.getFloatTimeDomainData(b); let pk = 0; for (const v of b) pk = Math.max(pk, Math.abs(v));
      const th = pk * .1; let st = b[0] > 0 ? 1 : -1, n = 0;
      for (let i = 1; i < b.length; i++) { if (st < 0 && b[i] > th) { st = 1; n++; } else if (st > 0 && b[i] < -th) st = -1; }
      cr += n; sec += b.length / ctx.sampleRate; await new Promise(r => setTimeout(r, 750));
    }
    node.disconnect(an); return cr / sec;
  };
  // morceau de test : une sinusoïde pure (pour mesurer la hauteur)
  window.__sine = (hz, sec) => { const sr = ctx.sampleRate, n = sr * sec, b = ctx.createBuffer(2, n, sr); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = .5 * Math.sin(2 * Math.PI * hz * i / sr); } return b; };
  window.__parseWav = async blob => {
    const ab = await blob.arrayBuffer(), v = new DataView(ab), s = o => String.fromCharCode(...new Uint8Array(ab, o, 4));
    const bits = v.getUint16(34, true), ch = v.getUint16(22, true), sr = v.getUint32(24, true), len = v.getUint32(40, true);
    let sum = 0, n = 0; const B = bits / 8;
    for (let o = 44; o + B <= 44 + len; o += B * 7) { let x; if (B === 2) x = v.getInt16(o, true) / 32768; else { x = v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16); x /= 8388608; } sum += x * x; n++; }
    const dec = await ctx.decodeAudioData(ab.slice(0));
    return { riff: s(0), wave: s(8), fmt: v.getUint16(20, true), bits, ch, sr, len, size: ab.byteLength, rms: Math.sqrt(sum / Math.max(1, n)), dur: dec.duration, decCh: dec.numberOfChannels };
  };
};

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  let page = await context.newPage();
  watch(page);
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.length >= 4 && decks[1].track && decks[0].ui.dp && document.querySelector('.dp-pv'), null, { timeout: 60000 });
  await page.mouse.click(683, 5);
  await page.evaluate(helpers);
  await page.evaluate(() => { const w = document.querySelector('.pc-wel'); if (w) w.remove(); });
  const W = (f, a) => page.evaluate(f, a);

  // ---------- 1. Réglages : fenêtre ouverte depuis Panneaux, valeurs gardées ----------
  await page.click('details.menu summary:has-text("Panneaux")');
  await page.click('#dp-open');
  check(await page.isVisible('#dp-modal'), 'Panneaux › Réglages de jeu : la fenêtre s’ouvre');
  await page.selectOption('#dp-modal select[aria-label="Mode du bouton Cue"]', 'denon');
  await page.selectOption('#dp-modal select[aria-label="Sync calée sur"]', 'bar');
  await page.selectOption('#dp-modal select[aria-label="Courbe des faders de voie"]', 'lin');
  await page.selectOption('#dp-modal select[aria-label="Format d’enregistrement"]', 'wav24');
  await page.check('#dp-modal input[aria-label="Charger le morceau suivant"]');
  const st = await W(() => store.get('deckpro'));
  check(st.cueMode === 'denon' && st.syncUnit === 'bar' && st.faderCurve === 'lin' && st.recFormat === 'wav24' && st.autoNext === true, 'Réglages gardés (mode de cue, sync, courbe, format, suivant)', JSON.stringify(st));
  await page.click('#dp-modal .mbox h2 button');

  // ---------- 2. Modes du bouton Cue et Cue Play ----------
  await W(() => { resetMixer(); decks.forEach(d => { d.ui.fader.set(0); }); });
  const cueDenon = await W(() => {
    const a = decks[0]; a.load(LIB.tracks[0]); a.seek(a.timeOfBeat(16)); const p = a.position();
    a.cueDown(); const set = Math.abs(a.track.cue - a.timeOfBeat(16)) < .01;
    a.cueDown(); const noPrev = !a.playing; a.cueUp();
    return { set, noPrev, p };
  });
  check(cueDenon.set && cueDenon.noPrev, 'Cue en mode Denon : pose le point à l’arrêt, pas de pré-écoute', JSON.stringify(cueDenon));
  const cueNumark = await W(() => {
    DeckPro.P.cueMode = 'numark'; const a = decks[0], c0 = a.track.cue;
    a.seek(a.timeOfBeat(40)); a.cueDown(); const back = Math.abs(a.position() - c0) < .01 && a.track.cue === c0;
    a.seek(a.timeOfBeat(48)); a.togglePlay(); const setOnPlay = Math.abs(a.track.cue - a.timeOfBeat(48)) < .01 && a.playing;
    a.cueDown(); const stop = !a.playing && Math.abs(a.position() - a.track.cue) < .01;
    return { back, setOnPlay, stop };
  });
  check(cueNumark.back && cueNumark.setOnPlay && cueNumark.stop, 'Cue en mode Numark : retour au cue, le cue se pose sur Play', JSON.stringify(cueNumark));
  const cueCdj = await W(async () => {
    DeckPro.P.cueMode = 'cdj'; const a = decks[0]; a.seek(a.track.cue);
    a.cueDown(); const prev = a.playing && a.previewing;
    a.togglePlay(); a.cueUp(); await new Promise(r => setTimeout(r, 300));
    const keeps = a.playing && a.position() > a.track.cue + .1; a.pause();
    return { prev, keeps };
  });
  check(cueCdj.prev && cueCdj.keeps, 'Cue en mode CDJ : pré-écoute en maintenant, Play pendant la pré-écoute continue la lecture', JSON.stringify(cueCdj));
  const cup = await W(async () => {
    const a = decks[0]; a.seek(a.timeOfBeat(64)); a.play(); await new Promise(r => setTimeout(r, 400));
    controls.get('A.cueplay').press({}); const p1 = a.position(), pl1 = a.playing;
    await new Promise(r => setTimeout(r, 300)); const p2 = a.position();
    a.pause(); a.seek(a.timeOfBeat(80)); controls.get('A.cueplay').press({}); const pl2 = a.playing, p3 = a.position(); a.pause();
    return { d1: p1 - a.track.cue, pl1, adv: p2 - p1, pl2, d3: p3 - a.track.cue };
  });
  check(cup.pl1 && Math.abs(cup.d1) < .05 && cup.adv > .15 && cup.pl2 && Math.abs(cup.d3) < .05, 'Cue Play : retour au cue et lecture immédiate, en lecture comme à l’arrêt', JSON.stringify(cup));

  // ---------- 3. Sens du pitch : à l'écran et sur la table ----------
  const pdir = async dir => {
    await W(d => { DeckPro.P.pitchDir = d; DeckPro.attach(); decks[0].setPitch(0); }, dir);
    const box = await page.locator('#p-deckA input.pitch').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + 4);
    const top = await W(() => decks[0].pitch);
    const midi = await W(() => { controls.get('A.pitch').set(0); const v = decks[0].pitch; decks[0].setPitch(0); return v; });
    return { top, midi };
  };
  const down = await pdir('down'), up = await pdir('up');
  check(down.top < -.05 && up.top > .05, 'Sens du pitch à l’écran : en haut plus lent, puis en haut plus rapide', JSON.stringify({ down: down.top, up: up.top }));
  check(down.midi < -.05 && up.midi > .05, 'Sens du pitch sur la table : la commande MIDI suit le réglage', JSON.stringify({ down: down.midi, up: up.midi }));
  await W(() => { DeckPro.P.pitchDir = 'down'; DeckPro.attach(); });

  // ---------- 4. Ton fin en cents : mesuré sur une sinusoïde ----------
  const tone = await W(async () => {
    const a = decks[2]; S.numDecks = 4; applyLayout();
    const tr = addTrack(__sine(440, 20), { title: 'La 440', key: { pc: 9, minor: false } });
    a.load(tr); a.ui.fader.set(0); a.seek(1); a.play();
    const fs = []; const set0 = a.shifter.set; a.shifter.set = function (f) { fs.push(f); return set0.call(this, f); };
    const f0 = await __peakHz(a.pre, 2400);
    a.setKeyFine(50); const k1 = fs[fs.length - 1]; await new Promise(r => setTimeout(r, 100)); const wet = a.klWet.gain.value, dry0 = a.klDry.gain.value; const f1 = await __peakHz(a.pre, 2400);
    a.setKeyFine(-50); const k2 = fs[fs.length - 1]; const f2 = await __peakHz(a.pre, 2400);
    a.setKeyFine(0); a.pause(); a.shifter.set = set0; S.numDecks = 2; applyLayout();
    return { f0, f1, f2, k1, k2, wet, dry0 };
  });
  // Le pitch shifter granulaire du navigateur (grains de 100 ms) ne rend pas le cent exact : sur une
  // sinusoïde pure, le son se range sur des raies espacées de 20 Hz. On vérifie le facteur demandé,
  // puis que le son monte ou descend bien.
  check(Math.abs(tone.k1 - Math.pow(2, 50 / 1200)) < 1e-6 && Math.abs(tone.k2 - Math.pow(2, -50 / 1200)) < 1e-6 && tone.wet > .9 && tone.dry0 < .1, 'Ton fin : +50 et −50 cents envoyés au pitch shifter (voie traitée active)', JSON.stringify({ k1: tone.k1, k2: tone.k2, wet: tone.wet }));
  check(Math.abs(tone.f0 - 440) < 2 && tone.f1 > 446 && tone.f2 < 434, 'Ton fin : le la 440 monte avec +50 cents et descend avec −50 cents', `${tone.f0.toFixed(1)} → ${tone.f1.toFixed(1)} · ${tone.f2.toFixed(1)} Hz`);

  // ---------- 5. Key sync et tonalité corrigée ----------
  const ksync = await W(() => {
    const a = decks[0], b = decks[1]; a.load(LIB.tracks[0]); b.load(LIB.tracks[1]); S.master = a; b.keyLock = false; b.setPitch(0);
    DeckPro.setKeySync(b, true);
    const r = { ks: b.keyShift, fine: b.keyFine, on: b.keySync, compat: keysCompatible(b.keyNow(), a.keyNow()), kb: keyInfo(b.keyNow()).code, ka: keyInfo(a.keyNow()).code };
    b.setPitch(-.023); DeckPro.applyKeySync(b, true);
    const eff = b.keyShift + b.keyFine / 100 + 12 * Math.log2(1 + b.pitch);
    r.eff = eff; r.compat2 = keysCompatible(b.keyNow(), a.keyNow()); r.fine2 = b.keyFine;
    DeckPro.setKeySync(b, false); r.off = b.keyShift === 0 && b.keyFine === 0; b.setPitch(0);
    return r;
  });
  check(ksync.on && ksync.compat && Math.abs(ksync.ks) <= 2 && ksync.fine === 0, 'Key sync : la tonalité de B devient compatible avec A, le plus petit écart', JSON.stringify(ksync));
  check(ksync.compat2 && Math.abs(ksync.eff - Math.round(ksync.eff)) < .011 && ksync.fine2 !== 0 && ksync.off, 'Key sync avec pitch : les cents rattrapent le pitch, retour à 0 à l’arrêt', `${ksync.eff.toFixed(3)} demi-tons · ${ksync.fine2} ct`);
  await page.click('#p-deckA .dk-stat.k');
  check(await page.isVisible('.popx select[aria-label="Tonalité du morceau"]'), 'Clic sur la tonalité de la platine : éditeur ouvert');
  const opt = await W(() => { const o = [...document.querySelectorAll('.popx select[aria-label="Tonalité du morceau"] option')].find(x => x.textContent.startsWith('5A')); return o.value; });
  await page.selectOption('.popx select[aria-label="Tonalité du morceau"]', opt);
  const kfix = await W(async () => { const t = decks[0].track; await LibPro.saveBrowser(); return { code: keyInfo(t.key).code, det: keyInfo(t._k0).code, user: t.keyUser, title: t.title }; });
  check(kfix.code === '5A' && kfix.det === '8A' && kfix.user, 'Tonalité corrigée à la main : 8A → 5A', JSON.stringify(kfix));
  await page.keyboard.press('Escape');

  // ---------- 6. Verrou de grille ----------
  const lock = await W(() => {
    const a = decks[0], t = a.track, b0 = t.bpm, g0 = t.grid; DeckPro.setLock(t, true);
    a.setBpm(b0 * 2); a.gridNudge(10); a.gridHere(); for (let i = 0; i < 5; i++) a.tap();
    const same = t.bpm === b0 && t.grid === g0;
    return { same, stored: JSON.stringify(store.get('deckpro.tracks')) };
  });
  check(lock.same && lock.stored.includes('"gl":1'), 'Verrou de grille : BPM, tap et grille ne bougent plus', lock.stored);

  // relance : tonalité corrigée et verrou retrouvés
  await page.reload();
  await page.waitForFunction(() => LIB.tracks.length >= 4 && decks[1].track && decks[0].ui.dp, null, { timeout: 60000 });
  await page.mouse.click(683, 5);
  await page.evaluate(helpers);
  await page.evaluate(() => { const w = document.querySelector('.pc-wel'); if (w) w.remove(); });
  await page.waitForFunction(t => { const x = LIB.tracks.find(y => y.title === t); return x && keyInfo(x.key).code === '5A'; }, kfix.title, { timeout: 15000 }).catch(() => {});
  const back = await W(t => { const x = LIB.tracks.find(y => y.title === t); const a = decks[0]; a.load(x); const b0 = x.bpm; a.setBpm(b0 + 3); const r = { key: keyInfo(x.key).code, locked: DeckPro.locked(x), bpm: x.bpm === b0, P: DeckPro.P.cueMode + '/' + DeckPro.P.faderCurve + '/' + DeckPro.P.syncUnit };
    DeckPro.setLock(x, false); a.setBpm(b0 + 3); r.unlocked = Math.abs(x.bpm - b0 - 3) < 1e-6; a.setBpm(b0); return r; }, kfix.title);
  check(back.key === '5A' && back.locked && back.bpm && back.unlocked && back.P === 'denon/lin/bar', 'À la relance : tonalité corrigée, verrou et réglages retrouvés ; déverrouillé, le BPM se règle', JSON.stringify(back));

  // ---------- 7. Courbe des faders de voie (mesure à la voie) ----------
  await W(() => { resetMixer(); DeckPro.P.cueMode = 'cdj'; const a = decks[0]; a.load(LIB.tracks[0]); decks[1].ui.fader.set(0); ui.setX(0); a.seek(a.timeOfBeat(64)); a.play(); a.ui.fader.set(.5); });
  await sleep(500);
  const linR = await W(() => __rms(decks[0].an, 1200));
  await W(() => { DeckPro.P.faderCurve = 'prog'; DeckPro.applyFaderCurve(); decks[0].seek(decks[0].timeOfBeat(64)); });
  await sleep(250);
  const progR = await W(() => __rms(decks[0].an, 1200));
  const ratio = linR / progR;
  check(ratio > 1.6 && ratio < 2.5, 'Courbe des faders : à mi-course, linéaire ≈ 2 fois plus fort que progressive (6 dB)', `${linR.toFixed(3)} / ${progR.toFixed(3)} = ${ratio.toFixed(2)}`);

  // ---------- 8. Crossfader : courbe réglable et inversion (mesure au master) ----------
  const xg = await W(() => { DeckPro.setXfCurve('custom'); DeckPro.P.xfShape = 0; const s0 = xfGains(.5); DeckPro.P.xfShape = 1; const s1 = xfGains(.5), s1e = xfGains(.998); DeckPro.P.xfShape = .5; return { s0, s1, s1e }; });
  check(Math.abs(xg.s0[0] - .707) < .01 && xg.s1[0] === 1 && xg.s1[1] === 1 && xg.s1e[0] < .2, 'Crossfader réglable : douce (0,71 au centre) jusqu’à cut', JSON.stringify(xg));
  await W(() => { decks[0].ui.fader.set(1); ui.setX(0); });
  await sleep(300);
  const xn = await W(() => __rms(bus.anL, 800));
  await W(() => { DeckPro.P.xfRev = true; applyXf(); });
  await sleep(300);
  const xr = await W(() => __rms(bus.anL, 800));
  await W(() => { DeckPro.P.xfRev = false; DeckPro.setXfCurve('mix'); applyXf(); });
  check(xn > .02 && xr < xn * .05, 'Crossfader inversé (hamster) : à gauche, la platine A se tait', `${xn.toFixed(3)} → ${xr.toFixed(4)}`);
  const sel = await W(() => document.querySelector('#p-mixer select[aria-label="Courbe du crossfader"]').value);
  check(sel === 'mix', 'Le sélecteur du mixer suit la courbe choisie', sel);

  // ---------- 9. Résonance du filtre et balance du master ----------
  const q = await W(async () => { DeckPro.setFilterQ(6); decks[0].ui.k.filter.set(.3); await new Promise(r => setTimeout(r, 200)); const v = decks[0].lp.Q.value; decks[0].ui.k.filter.set(.5); DeckPro.setFilterQ(1.4); return v; });
  check(Math.abs(q - 6) < .3, 'Résonance du filtre réglable (Q 6)', q.toFixed(2));
  const bal = await W(async () => {
    const sp = ctx.createChannelSplitter(2), L = ctx.createAnalyser(), R = ctx.createAnalyser(); bus.out.connect(sp); sp.connect(L, 0); sp.connect(R, 1);
    const m = async () => { const x = __rms(L, 700), y = __rms(R, 700); return [await x, await y]; };
    const c = await m(); DeckPro.setBalance(-1); await new Promise(r => setTimeout(r, 150)); const l = await m(); DeckPro.setBalance(0);
    bus.out.disconnect(sp); return { c, l };
  });
  check(bal.c[0] > .02 && Math.abs(bal.c[0] - bal.c[1]) < bal.c[0] * .1 && bal.l[0] > .02 && bal.l[1] < bal.l[0] * .02, 'Balance du master à gauche : la sortie droite se tait', JSON.stringify(bal));

  // ---------- 10. Enregistrement WAV 24 bits (navigateur : téléchargement) ----------
  const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await W(() => { DeckPro.P.recFormat = 'wav24'; });
  await page.click('#rec-btn');
  await sleep(2000);
  await page.click('#rec-btn');
  const download = await dl;
  await page.waitForFunction(() => REC.last && !REC.mr, null, { timeout: 10000 });
  const wav = await W(async () => ({ ...(await __parseWav(REC.last.blob)), name: REC.last.name, rec: lib.recs[lib.recs.length - 1].name, label: lib.recs[lib.recs.length - 1].label, sr0: ctx.sampleRate }));
  check(wav.riff === 'RIFF' && wav.wave === 'WAVE' && wav.fmt === 1 && wav.bits === 24 && wav.ch === 2 && wav.sr === wav.sr0 && wav.size === wav.len + 44, 'WAV 24 bits : en-tête PCM stéréo à la fréquence de la carte', JSON.stringify({ bits: wav.bits, ch: wav.ch, sr: wav.sr, len: wav.len }));
  check(wav.dur > 1.6 && wav.dur < 2.6 && wav.decCh === 2 && wav.rms > .02, 'WAV 24 bits : 2 s de mix relues par le décodeur, avec du son', `${wav.dur.toFixed(2)} s · RMS ${wav.rms.toFixed(3)}`);
  check(!!download && /\.wav$/.test(download.suggestedFilename()) && /\.wav$/.test(wav.rec) && /WAV 24 bits/.test(wav.label), 'Navigateur : le WAV se télécharge et apparaît dans Enregistrements', (download ? download.suggestedFilename() : 'aucun') + ' · ' + wav.label);

  // ---------- 11. Platine doublée (instant double) ----------
  const dbl = await W(async () => {
    const a = decks[0], b = decks[1]; b.ui.fader.set(0); a.setPitch(.02); a.loopAuto(4);
    await new Promise(r => setTimeout(r, 300));
    const ok = DeckPro.clone(b, a); await new Promise(r => setTimeout(r, 400));
    const r = { ok, same: b.track === a.track, dp: Math.abs(b.position() - a.position()), pitch: b.pitch, loop: b.loop.on && b.loop.start === a.loop.start, playing: b.playing };
    b.ui.fader.set(1); ui.setX(.5); a.ui.fader.set(1); r.refused = !DeckPro.clone(b, a);
    a.exitLoop(); b.pause(); b.exitLoop(); b.ui.fader.set(0); a.setPitch(0);
    return r;
  });
  check(dbl.ok && dbl.same && dbl.dp < .02 && Math.abs(dbl.pitch - .02) < 1e-9 && dbl.loop && dbl.playing, 'Platine doublée : même morceau, même position, même tempo, boucle comprise', JSON.stringify(dbl));
  check(dbl.refused, 'Platine doublée : refusée si la platine cible est à l’antenne');

  // ---------- 12. Sync à la mesure et à la phrase ----------
  const bsync = await W(async unit => {
    const out = {};
    for (const u of ['bar', 'phrase']) {
      DeckPro.P.syncUnit = u; const U = u === 'bar' ? 4 : 32;
      const a = decks[0], b = decks[1]; b.pause(); b.sync = false; b.load(LIB.tracks[1]); S.master = a;
      if (!a.playing) a.play();
      b.seek(b.timeOfBeat(U === 4 ? 66 : 77)); b.sync = true; b.play();
      await new Promise(r => setTimeout(r, 900));
      const d = (((a.beatPos() - b.beatPos()) % U) + U) % U, ph = Math.min(d, U - d);
      out[u] = +ph.toFixed(3); b.pause(); b.sync = false;
      // Sync pressé pendant la lecture : même calage
      b.seek(b.timeOfBeat(U === 4 ? 70 : 85)); b.play(); await new Promise(r => setTimeout(r, 200)); b.toggleSync(); await new Promise(r => setTimeout(r, 300));
      const d2 = (((a.beatPos() - b.beatPos()) % U) + U) % U; out[u + 'Live'] = +Math.min(d2, U - d2).toFixed(3); b.sync = false; b.pause();
    }
    DeckPro.P.syncUnit = 'beat'; return out;
  });
  check(bsync.bar < .05 && bsync.barLive < .05, 'Sync à la mesure : B retombe sur le même temps de la mesure que A', JSON.stringify(bsync));
  check(bsync.phrase < .05 && bsync.phraseLive < .05, 'Sync à la phrase : B retombe au même endroit de la phrase de 8 mesures', JSON.stringify(bsync));

  // ---------- 13. Compte à rebours ----------
  const cd = await W(async () => {
    const a = decks[0]; a.pause(); a.track.hot = Array(8).fill(null); a.track.hotMeta = Array(8).fill(null); a.track.memCues = [];
    a.seek(a.timeOfBeat(40)); const ph = DeckPro.countdown(a);
    a.track.hot[0] = a.timeOfBeat(50); a.track.hotMeta[0] = { name: 'Drop', color: '#ff4d5e' };
    const hot = DeckPro.countdown(a);
    await new Promise(r => setTimeout(r, 250)); const shown = a.ui.dp.cd.textContent;
    a.track.hot[0] = null; a.track.hotMeta[0] = null;
    return { ph: ph.label + ' ' + ph.text, hot: hot.label + ' ' + hot.text, shown };
  });
  check(cd.ph === 'Phrase 6.0' && cd.hot === 'Drop 2.2' && cd.shown === 'Drop 2.2', 'Compte à rebours : 6 mesures avant la phrase, 2 mesures 2 temps avant « Drop », affiché sur la platine', JSON.stringify(cd));

  // ---------- 14. Métronome au casque ----------
  await W(() => { resetMixer(); decks[0].ui.fader.set(0); setSplit(true); });
  const metro = await W(async () => {
    const a = decks[0]; a.seek(a.timeOfBeat(32)); a.play(); await new Promise(r => setTimeout(r, 300));
    const quiet = await __rms(DeckPro.metroAn, 500);
    controls.get('A.metro').press({}); const c0 = DeckPro.clicks, b0 = a.beatPos();
    const loud = await __rms(DeckPro.metroAn, 2000);
    const master = await __rms(bus.anL, 600);
    const beats = a.beatPos() - b0, clicks = DeckPro.clicks - c0;
    controls.get('A.metro').press({}); a.pause();
    return { quiet, loud, master, beats, clicks };
  });
  check(metro.quiet < .001 && metro.loud > .01 && metro.master < .001, 'Métronome : clics au casque, rien sur le master', JSON.stringify({ quiet: metro.quiet, loud: metro.loud, master: metro.master }));
  check(Math.abs(metro.clicks - metro.beats) <= 1.5, 'Métronome : un clic par temps de la grille', `${metro.clicks} clics pour ${metro.beats.toFixed(1)} temps`);

  // ---------- 15. Pré-écoute dans la bibliothèque ----------
  const pv = await W(async () => {
    decks.forEach(d => d.pause()); const before = decks.map(d => [d.track && d.track.id, d.position(), d.playing]);
    ui.sel = LIB.tracks[2].id; paintRows();
    document.querySelector('.dp-pvb').click(); await new Promise(r => setTimeout(r, 300));
    const on = DeckPro.preview.on, tr = DeckPro.preview.tr && DeckPro.preview.tr.title;
    const rms = await __rms(DeckPro.preview.an, 700), master = await __rms(bus.anL, 500);
    const after = decks.map(d => [d.track && d.track.id, d.position(), d.playing]);
    return { on, tr, rms, master, same: JSON.stringify(before) === JSON.stringify(after), want: LIB.tracks[2].title };
  });
  check(pv.on && pv.tr === pv.want && pv.rms > .02 && pv.master < .001, 'Pré-écoute : le morceau sélectionné joue au casque, rien sur le master', JSON.stringify(pv));
  check(pv.same, 'Pré-écoute : les platines ne bougent pas');
  const cvb = await page.locator('.dp-pvc').boundingBox();
  await page.locator('.dp-pvc').click({ position: { x: cvb.width * .5, y: cvb.height / 2 } });
  const scrub = await W(() => ({ pos: DeckPro.pvPos(), dur: DeckPro.preview.tr.duration, on: DeckPro.preview.on }));
  check(scrub.on && Math.abs(scrub.pos / scrub.dur - .5) < .03, 'Pré-écoute : un clic sur sa waveform déplace la lecture', `${scrub.pos.toFixed(1)} / ${scrub.dur.toFixed(1)} s`);
  await page.click('.dp-pvb');
  check(!(await W(() => DeckPro.preview.on)), 'Pré-écoute : le bouton l’arrête');
  await W(() => setSplit(false));

  // ---------- 16. Morceau suivant chargé à la fin ----------
  const nx = await W(async () => {
    DeckPro.P.autoNext = true; lib.view = 'pl:prep'; renderTable();
    const rows = lib.rows.map(r => r.t), a = decks[0], b = decks[1];
    b.load(rows[3]); a.load(rows[0]);
    a.seek(a.track.duration - .4); a.play(); await new Promise(r => setTimeout(r, 1200));
    const fromList = a.track === rows[1] && !a.playing;
    AutoMix.state.queue = [rows[3].id, rows[2].id];
    a.seek(a.track.duration - .4); a.play(); await new Promise(r => setTimeout(r, 1200));
    const fromQueue = a.track === rows[2] && AutoMix.state.queue.length === 1;
    DeckPro.P.autoNext = false; AutoMix.state.queue = []; lib.view = 'all'; renderTable();
    return { fromList, fromQueue, t: a.track.title };
  });
  check(nx.fromList, 'Fin du morceau : la platine charge le suivant de la playlist', JSON.stringify(nx));
  check(nx.fromQueue, 'Fin du morceau : la file d’attente passe avant (en sautant le morceau déjà chargé ailleurs)', JSON.stringify(nx));
  await page.close();

  // ---------- 17. Appli de bureau : le WAV 16 bits part dans le dialogue d'enregistrement ----------
  page = await context.newPage();
  watch(page);
  await page.addInitScript(() => {
    window.__bin = null;
    window.mixlabNative = { platform: 'test', pickFiles: async () => [], pickFolder: async () => [], readFile: async () => new ArrayBuffer(0), exists: async () => false, droppedPath: async () => null,
      loadLibrary: async () => null, saveLibrary: async () => true, saveText: async () => null,
      saveBinary: async (name, bytes) => { window.__bin = { name, n: bytes.length, bytes }; return '/musique/' + name; } };
  });
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.length >= 4 && decks[1].track && decks[0].ui.dp, null, { timeout: 60000 });
  await page.mouse.click(683, 5);
  await page.evaluate(helpers);
  const nat = await page.evaluate(async () => {
    DeckPro.P.recFormat = 'wav16'; const a = decks[0]; a.ui.fader.set(1); ui.setX(.5); a.play();
    recToggle(); await new Promise(r => setTimeout(r, 1500)); REC.mr.stop();
    for (let i = 0; i < 100 && !window.__bin; i++) await new Promise(r => setTimeout(r, 50));
    a.pause();
    const b = window.__bin; if (!b) return null;
    const p = await __parseWav(new Blob([b.bytes]));
    return { name: b.name, n: b.n, bits: p.bits, ch: p.ch, dur: p.dur, rms: p.rms, ext: REC.ext };
  });
  check(!!nat && /^mixlab-mix-\d{4}-\d\d-\d\d-\d\dh\d\d\.wav$/.test(nat.name) && nat.bits === 16 && nat.ch === 2 && nat.dur > 1.1 && nat.dur < 2.2 && nat.rms > .02 && nat.ext === 'wav', 'Appli : le WAV 16 bits est envoyé au dialogue d’enregistrement natif', JSON.stringify(nat));

  // Capture pour vérifier l'allure
  await page.evaluate(() => { const w = document.querySelector('.pc-wel'); if (w) w.remove(); });
  await (await page.$('#p-deckA')).screenshot({ path: '/tmp/deckpro-deck.png' });
  await page.evaluate(() => DeckPro.openSettings());
  await page.screenshot({ path: '/tmp/deckpro-reglages.png' });

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Platines et mixer pro : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
