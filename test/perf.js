'use strict';
// Test des pads, cues, effets, mixer et sampler (lots B et E) : on joue de vraies situations
// et on mesure le son à l'analyseur quand c'est possible.
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };

// Pont natif simulé (comme test/smoke.js) : un morceau sur « disque » pour tester la persistance.
const fakeNative = saved => `
  (() => {
    function wav() {
      const sr = 44100, n = sr * 8, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
      const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
      v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) { const t = (i % (sr / 2)) / sr; const x = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 18); v.setInt16(44 + i * 2, x * 30000, true); }
      return b;
    }
    const f = { path: '/musique/Testeur - Kick 120.wav', name: 'Testeur - Kick 120.wav' };
    window.__saved = ${JSON.stringify(saved)};
    window.mixlabNative = {
      platform: 'test', pickFiles: async () => [f], pickFolder: async () => [f],
      readFile: async () => wav(), exists: async p => p === f.path, droppedPath: async () => null,
      loadLibrary: async () => window.__saved ? JSON.parse(window.__saved) : null,
      saveLibrary: async j => { window.__saved = j; return true; },
    };
  })();`;

// Mesures dans la page : RMS et part d'énergie au-dessus de 5 kHz, moyennées sur une durée.
const helpers = () => {
  window.__meas = async (an, ms) => {
    const b = new Float32Array(an.fftSize), f = new Float32Array(an.frequencyBinCount), hz = ctx.sampleRate / an.fftSize;
    let s = 0, n = 0, hi = 0, all = 0; const t = performance.now();
    while (performance.now() - t < ms) {
      an.getFloatTimeDomainData(b); for (const v of b) s += v * v; n += b.length;
      an.getFloatFrequencyData(f); for (let i = 1; i < f.length; i++) { const p = Math.pow(10, f[i] / 10); all += p; if (i * hz > 5000) hi += p; }
      await new Promise(r => setTimeout(r, 23));
    }
    return { rms: Math.sqrt(s / Math.max(1, n)), hf: hi / (all || 1) };
  };
  window.__wav = (sec, fn, sr = 44100) => {
    const n = Math.round(sr * sec), b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, fn(i / sr))) * 30000, true);
    return b;
  };
};

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };

  // ---------- 1. Cues nommés et colorés, cues mémoire, boucles gardées : persistance ----------
  let page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  watch(page);
  await page.addInitScript(fakeNative(null));
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.length >= 4 && decks[1].track, null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Dossier' }).click();
  await page.waitForFunction(() => LIB.tracks.some(t => t.path), null, { timeout: 30000 });
  await page.evaluate(() => { const t = LIB.tracks.find(t => t.path); decks[0].load(t); decks[0].seek(2); decks[0].padMode = 'hot'; renderPads(decks[0]); });
  // pose du hot cue 1 puis édition (clic droit) : nom et couleur
  await page.evaluate(() => controls.get('A.pad1').press({}));
  await page.click('#p-deckA .pad >> nth=0', { button: 'right' });
  check(await page.isVisible('.popx'), 'Clic droit sur un pad : éditeur de hot cue ouvert');
  await page.fill('.popx input.pin', 'Drop');
  await page.click('.popx .sw >> nth=5');
  const meta = await page.evaluate(() => ({ m: decks[0].track.hotMeta[0], txt: decks[0].ui.pads[0].textContent, hc: decks[0].ui.pads[0].style.getPropertyValue('--hc') }));
  check(meta.m && meta.m.name === 'Drop' && meta.m.color === '#2fa8ff' && meta.txt === 'Drop' && meta.hc === '#2fa8ff', 'Hot cue nommé « Drop », coloré, affiché sur le pad', JSON.stringify(meta));
  await page.keyboard.press('Escape');
  // cues mémoire : ajout depuis la liste puis saut
  await page.evaluate(() => decks[0].seek(4));
  await page.click('#p-deckA .tabs .lst');
  await page.getByRole('button', { name: '+ Cue ici' }).click();
  const mem = await page.evaluate(() => decks[0].track.memCues.slice());
  check(mem.length === 1 && Math.abs(mem[0].t - 4) < .6 && mem[0].label === 'Cue 1', 'Cue mémoire ajouté à la position', JSON.stringify(mem));
  await page.evaluate(() => decks[0].seek(6.5));
  await page.click('.popx .pr .tm');
  const jumped = await page.evaluate(() => decks[0].position());
  check(Math.abs(jumped - mem[0].t) < .02, 'Saut au cue mémoire', jumped.toFixed(3));
  await page.keyboard.press('Escape');
  // boucles gardées : garder la boucle sur un pad vide, puis la rappeler
  const lp = await page.evaluate(() => {
    const d = decks[0]; d.seek(2); d.loopAuto(2); const want = { start: d.loop.start, end: d.loop.end };
    d.padMode = 'sloop'; renderPads(d); controls.get('A.pad1').press({}); controls.get('A.pad1').release();
    d.exitLoop(); d.seek(6);
    controls.get('A.pad1').press({}); controls.get('A.pad1').release();
    return { want, saved: d.track.loops[0], on: d.loop.on, start: d.loop.start, end: d.loop.end, pos: d.position(), txt: d.ui.pads[0].textContent };
  });
  check(lp.saved && lp.on && Math.abs(lp.start - lp.want.start) < 1e-6 && Math.abs(lp.end - lp.want.end) < 1e-6 && Math.abs(lp.pos - lp.want.start) < .02, 'Boucle gardée puis rappelée depuis le mode Boucles', JSON.stringify(lp));
  await page.evaluate(() => { decks[0].exitLoop(); decks[0].padMode = 'hot'; renderPads(decks[0]); return Desktop.save(); });
  const saved = await page.evaluate(() => window.__saved);
  await page.close();

  page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  watch(page);
  await page.addInitScript(fakeNative(saved));
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.some(t => t.path), null, { timeout: 60000 });
  const back = await page.evaluate(() => { const t = LIB.tracks.find(t => t.path); return { m: t.hotMeta[0], mem: t.memCues, loops: t.loops }; });
  check(back.m && back.m.name === 'Drop' && back.m.color === '#2fa8ff' && back.mem.length === 1 && back.loops.length === 1, 'Nom, couleur, cues mémoire et boucles retrouvés à la relance', JSON.stringify(back));
  await page.close();

  // ---------- 2. Pads, effets, mixer, sampler sur les démos ----------
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  page = await context.newPage();
  watch(page);
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.length >= 4 && decks[1].track, null, { timeout: 60000 });
  await page.mouse.click(683, 5);
  await page.evaluate(helpers);
  const W = (f, a) => page.evaluate(f, a);

  await W(() => { resetMixer(); const a = decks[0]; a.ui.fader.set(1); decks[1].ui.fader.set(0); ui.setX(0); a.seek(a.timeOfBeat(64)); a.play(); });
  await sleep(1200);

  // Slicer : la tranche 4 de la fenêtre de 8 temps, puis retour là où le morceau en serait.
  const sl = await W(async () => {
    const a = decks[0]; a.padMode = 'slice'; renderPads(a);
    const t0 = ctx.currentTime, p0 = a.position(), w = Math.floor(a.beatIdx(p0) / 8 + 1e-6) * 8;
    controls.get('A.pad4').press({});
    const st = a.loop.start, want = a.timeOfBeat(w + 3), inSlice = a.position() >= st - .01 && a.position() <= st + a.beatLen + .01;
    await new Promise(r => setTimeout(r, 700));
    const inLoop = a.loop.on && a.position() >= st - .01 && a.position() <= a.loop.end + .01;
    controls.get('A.pad4').release();
    const expect = p0 + (ctx.currentTime - t0) * a.rate;
    return { st, want, inSlice, inLoop, after: a.position(), expect, loopOff: !a.loop.on };
  });
  check(Math.abs(sl.st - sl.want) < 1e-6 && sl.inSlice && sl.inLoop, 'Slicer : le pad 4 rejoue le 4e temps de la fenêtre', JSON.stringify(sl));
  check(sl.loopOff && Math.abs(sl.after - sl.expect) < .06, 'Slicer : au relâchement, reprise là où le morceau en serait', (sl.after - sl.expect).toFixed(3));

  // Pitch play : le dernier hot cue rejoué transposé.
  const pp = await W(() => {
    const a = decks[0]; a.padMode = 'hot'; a.track.hot[2] = a.timeOfBeat(32); a.ppCue = 2;
    a.padMode = 'pitch'; renderPads(a); controls.get('A.pad8').press({}); controls.get('A.pad8').release();
    const r = { ks: a.keyShift, pos: a.position(), cue: a.track.hot[2], label: a.ui.pads[7].textContent };
    controls.get('A.pad5').press({}); r.ks0 = a.keyShift; a.padMode = 'hot'; renderPads(a); return r;
  });
  check(pp.ks === 5 && pp.ks0 === 0 && Math.abs(pp.pos - pp.cue) < .05 && pp.label === '+5', 'Pitch play : +5 demi-tons depuis le hot cue 3, puis retour à 0', JSON.stringify(pp));

  // Effets : FX1 sur A, mesure à l'analyseur de la voie.
  const an = 'decks[0].an';
  const meas = ms => page.evaluate(([e, ms]) => __meas(eval(e), ms), [an, ms]);
  await W(() => { const u = FXU[0]; u.setMode('single'); u.toggle('A', true); S.quantize = false; window.__dryPos = decks[0].position(); });
  const dry = await meas(1500);
  await W(() => { const u = FXU[0]; u.beats = .5; u.setSlot(0, { type: 'gate', amount: 1, p1: 0 }); u.setOn(true); });
  await sleep(150);
  const gated = await meas(1500);
  check(gated.rms < dry.rms * .75, 'Trans / Gater sur A : le niveau chute', `${dry.rms.toFixed(3)} → ${gated.rms.toFixed(3)}`);
  await W(() => { const u = FXU[0]; u.setSlot(0, { type: 'crush', amount: 1, p1: 1, p2: 0 }); decks[0].seek(window.__dryPos); });
  await sleep(200);
  // même passage du morceau que la mesure à sec, pour comparer des aigus comparables
  const crushed = await meas(1500);
  check(crushed.hf > dry.hf * 2, 'Bitcrusher sur A : les aigus explosent', `${(dry.hf * 1000).toFixed(2)}‰ → ${(crushed.hf * 1000).toFixed(2)}‰`);
  // Écho : on coupe la platine, la queue continue de résonner.
  await W(() => { const u = FXU[0]; u.setOn(false); });
  await sleep(200);
  await W(() => decks[0].pause()); await sleep(250);
  const silent = await meas(400);
  await W(() => { const u = FXU[0]; u.beats = .5; u.setSlot(0, { type: 'echo', amount: 1, p1: .7 }); u.setOn(true); decks[0].play(); });
  await sleep(1200);
  await W(() => decks[0].pause()); await sleep(120);
  const tail = await meas(400);
  check(silent.rms < .002 && tail.rms > .01, 'Écho sur A : la queue résonne après l’arrêt de la platine', `${silent.rms.toFixed(4)} / ${tail.rms.toFixed(4)}`);
  await W(() => { FXU[0].setOn(false); decks[0].play(); });
  await sleep(1500);

  // Master : FX1 retiré de A et posé sur le master.
  const mbefore = await page.evaluate(() => __meas(bus.anL, 1500));
  await W(() => { const u = FXU[0]; u.toggle('A', false); u.toggle('M', true); u.setSlot(0, { type: 'crush', amount: 1, p1: 1, p2: 0 }); u.setOn(true); });
  await sleep(200);
  const mafter = await page.evaluate(() => __meas(bus.anL, 1500));
  const chOnly = await meas(800);
  check(mafter.hf > mbefore.hf * 2 && chOnly.hf < mafter.hf / 2, 'FX1 sur le master : le master change, la voie A reste propre', `master ${(mbefore.hf * 1000).toFixed(2)}‰ → ${(mafter.hf * 1000).toFixed(2)}‰ · voie ${(chOnly.hf * 1000).toFixed(2)}‰`);
  await W(() => { const u = FXU[0]; u.setOn(false); u.toggle('M', false); u.toggle('A', true); });

  // Chaîne : 3 effets en série.
  const chain = await W(() => { const u = FXU[1]; u.toggle('A', true); u.setMode('chain'); u.setSlot(0, { type: 'echo', on: true }); u.setSlot(1, { type: 'flanger', on: true }); u.setSlot(2, { type: 'crush', on: true }); u.setOn(true);
    const r = u.inst.A.map(s => s.type); u.setOn(false); u.toggle('A', false); u.setMode('single'); return r; });
  check(chain.join() === 'echo,flanger,crush', 'Mode Chaîne : trois effets montés en série sur A', chain.join());

  // Quantize : l'effet démarre sur le temps suivant.
  await sleep(300);
  const q = await W(() => { S.quantize = true; const u = FXU[0], a = decks[0], now = ctx.currentTime; u.setSlot(0, { type: 'gate' }); u.setOn(true); const b = a.beatIdx(a.positionAt(u.onAt)); const r = { wait: u.onAt - now, frac: b - Math.round(b), pend: u.pendAt > 0 }; u.setOn(false); return r; });
  check(q.wait > 0 && q.wait < .6 && Math.abs(q.frac) < .01 && q.pend, 'FX quantisé : démarrage calé sur le temps suivant', JSON.stringify(q));

  // Frein vinyle : la platine s'arrête, puis repart quand on coupe l'effet.
  const br = await W(async () => {
    const u = FXU[0], a = decks[0]; S.quantize = false; u.beats = 1; u.setSlot(0, { type: 'brake' }); u.setOn(true);
    await new Promise(r => setTimeout(r, 900)); const stopped = !a.playing && a.spun;
    u.setOn(false); const again = a.playing; return { stopped, again };
  });
  check(br.stopped && br.again, 'Frein vinyle : la platine s’arrête puis repart', JSON.stringify(br));
  await W(() => { FXU[0].setSlot(0, { type: 'echo', amount: .5 }); });

  // Effet de voie (couleur) : Bruit sur A à l'arrêt.
  await W(() => { decks[0].pause(); setColorFx('noise'); decks[0].ui.k.filter.set(.5); });
  await sleep(300);
  const n0 = await meas(400);
  await W(() => decks[0].ui.k.filter.set(.95));
  await sleep(200);
  const n1 = await meas(500);
  const lab = await W(() => $('span', decks[0].ui.k.filter.el).textContent);
  check(n0.rms < .002 && n1.rms > .01 && lab === 'BRUIT', 'Effet de voie « Bruit » : le potard ajoute du bruit filtré', `${n0.rms.toFixed(4)} → ${n1.rms.toFixed(4)} · ${lab}`);
  const spaceTail = async knob => {
    await W(k => { const a = decks[0]; setColorFx('space'); a.ui.k.filter.set(k); a.seek(a.timeOfBeat(96)); a.play(); }, knob);
    await sleep(900); await W(() => decks[0].pause()); await sleep(80); return (await meas(300)).rms;
  };
  const sp0 = await spaceTail(.5); await sleep(2500);
  const sp1 = await spaceTail(.2);
  check(sp0 < .002 && sp1 > .003 && sp1 > sp0 * 4, 'Effet de voie « Espace » : la reverb continue après l’arrêt', `${sp0.toFixed(4)} → ${sp1.toFixed(4)}`);
  await W(() => { decks[0].ui.k.filter.set(.5); setColorFx('filter'); });

  // EQ isolateur ou classique.
  const eq = await W(() => { S.eqMode = 'classic'; const c = eqDb(0); S.eqMode = 'iso'; return { c, i: eqDb(0) }; });
  check(eq.c === -26 && eq.i === -60, 'Modes d’EQ : classique -26 dB, isolateur -60 dB', JSON.stringify(eq));

  // Sampler : un son à soi (WAV fabriqué dans la page), gardé après rechargement.
  const smp = await W(async () => {
    const bytes = __wav(1, t => Math.sin(2 * Math.PI * 440 * t) * .6);
    await Perf.loadSample(2, bytes, 'Mon la');
    const p = SAMPLER.pads[2]; decks[0].padMode = 'smp'; renderPads(decks[0]);
    controls.get('A.pad3').press({}); const playing = !!SAMPLER.playing[2]; controls.get('A.pad3').release();
    return { name: p.name, custom: p.custom, dur: p.buf.duration, playing, txt: decks[0].ui.pads[2].textContent };
  });
  check(smp.name === 'Mon la' && smp.custom && Math.abs(smp.dur - 1) < .02 && smp.playing && smp.txt === 'Mon la', 'Sampler : son personnel chargé sur le pad 3 et joué', JSON.stringify(smp));
  const gate = await W(() => { const p = SAMPLER.pads[2]; samplerStop(2); p.mode = 'gate'; samplerVol(2, .5); samplerDown(2); const a = !!SAMPLER.playing[2]; samplerUp(2); const b = !!SAMPLER.playing[2]; p.mode = 'shot'; return { a, b }; });
  check(gate.a && !gate.b, 'Sampler en mode Maintien : s’arrête au relâchement', JSON.stringify(gate));
  await page.click('#p-deckA .pad >> nth=2', { button: 'right' });
  await page.selectOption('.popx select', 'loop');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForFunction(() => LIB.tracks.length >= 2 && SAMPLER.pads[2] && SAMPLER.pads[2].custom, null, { timeout: 30000 }).catch(() => {});
  const kept = await page.evaluate(() => { const p = SAMPLER.pads[2]; return { name: p.name, custom: !!p.custom, mode: p.mode, vol: p.vol, dur: p.buf && p.buf.duration }; });
  check(kept.custom && kept.name === 'Mon la' && kept.mode === 'loop' && kept.vol === .5 && Math.abs(kept.dur - 1) < .02, 'Sampler : son, mode et volume retrouvés après rechargement', JSON.stringify(kept));

  // Plage d'analyse BPM : une boucle à 70 BPM.
  const bpm = await page.evaluate(() => {
    const sr = ctx.sampleRate, n = sr * 20, b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), B = 60 / 70;
    for (let k = 0; k * B < 20; k++) { const s0 = Math.round(k * B * sr); for (let i = 0; i < sr * .3 && s0 + i < n; i++) { const t = i / sr; d[s0 + i] += Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-t * 30)) * t) * Math.exp(-t * 7) * .9; } const h0 = Math.round((k + .5) * B * sr); for (let i = 0; i < sr * .03 && h0 + i < n; i++) d[h0 + i] += (Math.random() * 2 - 1) * .25 * Math.exp(-i / sr * 120); }
    Perf.setBpmRange('88-175'); const hi = addTrack(b, { title: 'Boucle 70 (88-175)' }).bpm;
    Perf.setBpmRange('60-120'); const lo = addTrack(b, { title: 'Boucle 70 (60-120)' }).bpm;
    const kept = store.get('bpmRange'); Perf.setBpmRange('88-175'); return { hi, lo, kept };
  });
  check(Math.abs(bpm.lo - 70) < .3 && Math.abs(bpm.hi - 140) < .6 && bpm.kept === '60-120', 'Plage d’analyse BPM : 70 en 60-120, 140 en 88-175', JSON.stringify(bpm));

  // La leçon « Sortie en écho » pilote toujours l'unité assignée à A.
  const les = await W(() => { Coach.start('echo'); const u = fxOf(decks[0]); return { sel: u.ui.sel.value, A: u.targets.has('A'), mode: u.mode, beats: u.beats }; });
  check(les.sel === 'reverb' && les.A && les.mode === 'single' && les.beats === .5, 'Leçon « Sortie en écho » : prépare l’unité d’effet de A', JSON.stringify(les));
  await W(() => setCoach(false));

  // Captures : pads, unités d'effets, mixer.
  await W(() => { layout.preset = 'perf'; layout.visible = new Set(['fx', 'wave', 'mixer', 'lib']); layout.coach = false; applyLayout();
    View.setSize('compact', true); // en 1366×768, Performance passe en platines mini : on veut voir les pads
    const a = decks[0]; a.load(LIB.tracks[0]); a.track.hot[0] = 10; a.track.hotMeta[0] = { name: 'Drop', color: '#2fa8ff' }; a.track.hot[1] = 30; a.track.hotMeta[1] = { name: 'Voix', color: '#e86bff' }; a.track.hot[4] = 50;
    a.track.memCues = [{ t: 20, label: 'Intro', color: '#ffffff' }]; a.padMode = 'hot'; renderPads(a);
    FXU[1].setMode('chain'); renderFxUnit(FXU[1]); FXU[0].setSlot(0, { type: 'echo' }); renderFxUnit(FXU[0]); });
  await sleep(400);
  await (await page.$('#p-deckA')).screenshot({ path: '/tmp/perf-pads.png' });
  await (await page.$('#p-fx')).screenshot({ path: '/tmp/perf-fx.png' });
  await (await page.$('#p-mixer')).screenshot({ path: '/tmp/perf-mixer.png' });
  await page.screenshot({ path: '/tmp/perf-1366.png' });
  await page.click('#p-deckA .pad >> nth=0', { button: 'right' });
  await sleep(100);
  await page.screenshot({ path: '/tmp/perf-popover.png' });
  await page.keyboard.press('Escape');

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Pads, effets, mixer et sampler : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
