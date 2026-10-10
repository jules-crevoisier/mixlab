'use strict';
// Test des pads et du sampler de performance (perf-plus.js) : banques de hot cues, hot cue maintenu
// et verrouillé, séquences de cues, réglage fin des boucles, boucles actives, Pad FX, retour du slip,
// banques et routage du sampler, casque, capture, boucles calées, séquenceur, styles, looper.
// On mesure le son quand c'est possible (analyseurs, prise exacte des échantillons par AudioWorklet).
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };

const helpers = () => {
  // mesure sur le temps audio (pas l'horloge murale) : une machine chargée ne fausse pas la fenêtre
  window.__meas = async (an, ms) => {
    const b = new Float32Array(an.fftSize); let s = 0, n = 0; const t = performance.now(), a0 = ctx.currentTime;
    while ((performance.now() - t < ms || ctx.currentTime - a0 < ms / 1000) && performance.now() - t < ms * 6) { an.getFloatTimeDomainData(b); for (const v of b) s += v * v; n += b.length; await new Promise(r => setTimeout(r, 23)); }
    return Math.sqrt(s / Math.max(1, n));
  };
  window.__an = node => { const a = ctx.createAnalyser(); a.fftSize = 2048; node.connect(a); return a; };
  // prise des échantillons d'un nœud avec leur date exacte
  window.__rec = async node => {
    const R = { chunks: [] }; R.h = await PerfPlus.tap(node, c => R.chunks.push(c));
    R.stop = () => { R.h.stop(); const sr = ctx.sampleRate, t0 = R.chunks.length ? R.chunks[0].t : 0, n = R.chunks.reduce((a, c) => Math.max(a, Math.round((c.t - t0) * sr) + c.l.length), 0), x = new Float32Array(n);
      for (const c of R.chunks) x.set(c.l, Math.round((c.t - t0) * sr)); return { t0, x, sr }; };
    return R;
  };
  // attaques : passage au-dessus de hi après au moins 20 ms sous lo
  window.__onsets = (r, hi = .15, lo = .05) => {
    const out = [], q = Math.round(r.sr * .02); let quiet = q, armed = true;
    for (let i = 0; i < r.x.length; i++) { const a = Math.abs(r.x[i]); if (a < lo) { if (++quiet >= q) armed = true; } else quiet = 0; if (a > hi && armed) { out.push(r.t0 + i / r.sr); armed = false; } }
    return out;
  };
};

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  let page = await context.newPage();
  watch(page);
  const boot = async () => {
    await page.goto(url);
    await page.waitForFunction(() => LIB.tracks.length >= 4 && decks[1].track && decks[0].ui.pp, null, { timeout: 60000 });
    await page.mouse.click(683, 5);
    await page.evaluate(helpers);
  };
  await boot();
  const W = (f, a) => page.evaluate(f, a);

  // ---------- 1. Hot cues : 16 par morceau, banques 1-8 et 9-16 ----------
  const bank = await W(() => {
    const a = decks[0]; resetMixer(); a.ui.fader.set(1); decks[1].ui.fader.set(0); ui.setX(0); S.quantize = false;
    a.padMode = 'hot'; renderPads(a); a.seek(a.timeOfBeat(16));
    controls.get('A.hotbank').press({});
    const lab = a.ui.pp.bank.textContent;
    controls.get('A.pad1').press({}); controls.get('A.pad1').release();
    const r = { lab, bank: a.ppBank, h8: a.track.hot[8], h0: a.track.hot[0], want: a.timeOfBeat(16), txt: a.ui.pads[0].textContent, len: a.track.hot.length };
    controls.get('A.hotbank').press({}); r.back = a.ui.pp.bank.textContent; r.txt0 = a.ui.pads[0].textContent; return r;
  });
  check(bank.len === 16 && bank.lab === '9-16' && bank.bank === 1 && Math.abs(bank.h8 - bank.want) < 1e-6 && bank.h0 == null && bank.txt === '9' && bank.back === '1-8' && bank.txt0 === '1',
    'Banque 9-16 : le pad 1 pose le hot cue 9, la banque 1-8 reste libre', JSON.stringify(bank));

  // ---------- 2. Hot cue maintenu à l'arrêt, Play verrouille ----------
  const hold1 = await W(async () => {
    const a = decks[0]; a.ppBank = 1; renderPads(a); a.seek(a.timeOfBeat(40));
    controls.get('A.pad1').press({}); const playing = a.playing;
    await new Promise(r => setTimeout(r, 120)); const rms = await __meas(a.an, 400);
    controls.get('A.pad1').release();
    return { playing, rms, after: a.playing, pos: a.position(), cue: a.track.hot[8] };
  });
  await sleep(250);
  const quiet1 = await W(() => __meas(decks[0].an, 300));
  check(hold1.playing && hold1.rms > .02 && !hold1.after && Math.abs(hold1.pos - hold1.cue) < .01 && quiet1 < .002,
    'Hot cue maintenu à l’arrêt : joue pendant l’appui, revient au cue au relâchement', `${hold1.rms.toFixed(3)} → ${quiet1.toFixed(4)}`);
  const latch = await W(async () => {
    const a = decks[0]; controls.get('A.pad1').press({}); await new Promise(r => setTimeout(r, 150));
    controls.get('A.play').press({}); controls.get('A.pad1').release(); await new Promise(r => setTimeout(r, 200));
    const r = { playing: a.playing, pos: a.position() - a.track.hot[8] }; a.pause(); return r;
  });
  check(latch.playing && latch.pos > .25, 'Play pendant l’appui : la lecture est verrouillée', JSON.stringify(latch));

  // ---------- 3. Séquences de hot cues : enregistrées avec leur rythme, rejouées, en boucle ----------
  const rec = await W(async () => {
    const a = decks[0], w = ms => new Promise(r => setTimeout(r, ms)); a.ppBank = 0; renderPads(a);
    a.track.hot[0] = a.timeOfBeat(64); a.track.hot[1] = a.timeOfBeat(80); a.track.hot[2] = a.timeOfBeat(96);
    a.seek(a.timeOfBeat(60)); a.play(); await w(200);
    PerfPlus.seqRecToggle(a);
    const T = [];
    for (const [i, ms] of [[1, 0], [2, 350], [3, 300]]) { await w(ms); T.push(ctx.currentTime); controls.get('A.pad' + i).press({}); controls.get('A.pad' + i).release(); }
    await w(400); const s = PerfPlus.seqRecToggle(a);
    return { s, gaps: [T[1] - T[0], T[2] - T[1]], bpm: a.bpm };
  });
  const spb = 60 / rec.bpm;
  const okRec = rec.s && rec.s.hits.length === 3 && rec.s.hits.map(h => h.i).join() === '0,1,2' && Math.abs(rec.s.hits[1].b * spb - rec.gaps[0]) < .01 && Math.abs((rec.s.hits[2].b - rec.s.hits[1].b) * spb - rec.gaps[1]) < .01;
  check(okRec, 'Séquence enregistrée : 3 appuis avec leur rythme (en temps)', JSON.stringify(rec.s && rec.s.hits));
  const play = await W(async () => {
    const a = decks[0], log = [], ss = a.startSource; a.startSource = function (pos, when) { log.push([pos, when]); return ss.call(this, pos, when); };
    PerfPlus.seqPlay(a, 0, false); const t0 = PerfPlus.seqState(a).play.t0;
    await new Promise(r => setTimeout(r, 1400)); a.startSource = ss;
    return { log, t0, cues: a.track.hot.slice(0, 3), done: !PerfPlus.seqState(a).play };
  });
  // date effective du saut : départ planifié, moins l'avance prise dans le cue si le saut est parti en retard
  const offs = play.log.map((l, i) => l[1] - (l[0] - play.cues[i]) - play.t0), want = rec.s.hits.map(h => h.b * spb);
  check(play.log.length === 3 && play.done && offs.every((o, i) => Math.abs(o - want[i]) < .003) && play.log.every((l, i) => l[0] >= play.cues[i] - 1e-6 && l[0] - play.cues[i] < .2),
    'Séquence rejouée : chaque saut tombe au temps enregistré (à 3 ms près)', offs.map((o, i) => (o - want[i]).toFixed(4)).join(' '));
  const loopSeq = await W(async () => {
    const a = decks[0]; let n = 0; const ss = a.startSource; a.startSource = function () { n++; return ss.apply(this, arguments); };
    PerfPlus.seqPlay(a, 0, true); const len = PerfPlus.seqState(a).play.seq.len * 60 / a.bpm;
    await new Promise(r => setTimeout(r, len * 2000 + 150)); const on = !!PerfPlus.seqState(a).play; PerfPlus.seqStop(a); a.startSource = ss; a.pause(); return { n, on };
  });
  check(loopSeq.on && loopSeq.n >= 6, 'Séquence en boucle : elle repart à la fin', JSON.stringify(loopSeq));

  // ---------- 4. Boucles : réglage fin, ½ et ×2 depuis chaque bord ----------
  const adj = await W(() => {
    const a = decks[0], B = a.beatLen; a.seek(a.timeOfBeat(32) + .01); a.loopAuto(4);
    const s0 = a.loop.start, e0 = a.loop.end, r = {};
    PerfPlus.loopAdjust(a, 'start', 1, 'ms10'); r.s1 = a.loop.start - s0;
    PerfPlus.loopAdjust(a, 'start', -1, 'ms10'); PerfPlus.loopAdjust(a, 'end', -1, 'b1'); r.e1 = (a.loop.end - e0) / B;
    PerfPlus.loopAdjust(a, 'end', 1, 'b1'); PerfPlus.loopAdjust(a, 'both', 2, 'b4'); r.mv = [(a.loop.start - s0) / B, (a.loop.end - e0) / B];
    PerfPlus.loopAdjust(a, 'both', -2, 'b4');
    PerfPlus.loopHalf(a, 'end'); r.hEnd = [(a.loop.start - s0) / B, (a.loop.end - e0) / B];
    PerfPlus.loopDouble(a, 'end'); r.dEnd = [(a.loop.start - s0) / B, (a.loop.end - e0) / B];
    PerfPlus.loopHalf(a, 'start'); r.hSt = [(a.loop.start - s0) / B, (a.loop.end - e0) / B, a.loop.beats];
    PerfPlus.loopDouble(a, 'start'); r.dSt = [(a.loop.start - s0) / B, (a.loop.end - e0) / B, a.loop.beats];
    a.exitLoop(); return r;
  });
  const near = (v, w) => Math.abs(v - w) < 1e-6;
  check(near(adj.s1, .01) && near(adj.e1, -1) && near(adj.mv[0], .5) && near(adj.mv[1], .5), 'Réglage fin : début +10 ms, fin −1 temps, boucle déplacée d’1/2 temps', JSON.stringify(adj));
  check(near(adj.hEnd[0], 2) && near(adj.hEnd[1], 0) && near(adj.dEnd[0], 0) && near(adj.dEnd[1], 0) && near(adj.hSt[0], 0) && near(adj.hSt[1], -2) && near(adj.hSt[2], 2) && near(adj.dSt[1], 0) && near(adj.dSt[2], 4),
    '½ et ×2 depuis la fin ou depuis le début', JSON.stringify([adj.hEnd, adj.dEnd, adj.hSt, adj.dSt]));

  // ---------- 5. Pads Boucle auto ----------
  const bl = await W(() => {
    const a = decks[0]; a.padMode = 'bloop'; renderPads(a); a.seek(a.timeOfBeat(48));
    controls.get('A.pad6').press({}); controls.get('A.pad6').release(); padLights(a);
    const r = { on: a.loop.on, beats: a.loop.beats, len: (a.loop.end - a.loop.start) / a.beatLen, txt: a.ui.pads[5].textContent, lit: a.ui.pads[5].classList.contains('lit') };
    controls.get('A.pad6').press({}); r.off = !a.loop.on; a.padMode = 'hot'; renderPads(a); return r;
  });
  check(bl.on && bl.beats === 4 && Math.abs(bl.len - 4) < 1e-6 && bl.txt === '4' && bl.lit && bl.off, 'Pads Boucle auto : le pad « 4 » lance puis arrête une boucle de 4 temps', JSON.stringify(bl));

  // ---------- 6. Boucle active : elle s'enclenche toute seule ----------
  const act = await W(async () => {
    const a = decks[0], tr = a.track; tr.loops = [{ start: a.timeOfBeat(130), end: a.timeOfBeat(132), label: 'Boucle 1' }]; PerfPlus.setActive(a, 0, true);
    a.seek(a.timeOfBeat(127)); a.play(); const nx = PerfPlus.nextActive(a, a.position());
    await new Promise(r => setTimeout(r, 4 * a.beatLen * 1000 + 300));
    const r = { nx: !!nx, on: a.loop.on, st: a.loop.start - tr.loops[0].start, en: a.loop.end - tr.loops[0].end, pos: a.position(), saved: PerfPlus.T[PerfPlus.tkey(tr)].al };
    a.exitLoop(); a.pause(); return r;
  });
  check(act.nx && act.on && Math.abs(act.st) < 1e-6 && Math.abs(act.en) < 1e-6 && act.saved && act.saved.length === 1, 'Boucle active : enclenchée quand la tête de lecture arrive dessus, gardée avec le morceau', JSON.stringify(act));

  // ---------- 7. Retour du slip en fondu ----------
  const slip = await W(async () => {
    const a = decks[0], w = ms => new Promise(r => setTimeout(r, ms)); PerfPlus.P.slipMs = 100; a.slip = true; let r = null;
    // lecture des deux gains pendant le fondu, à une date audio connue (on recommence si la machine a sauté le fondu)
    for (let k = 0; k < 4 && !(r && r.e > .01 && r.e < .09); k++) {
      a.seek(a.timeOfBeat(64)); a.play(); await w(300);
      controls.get('A.pad1').press({}); await w(300);
      const sh = a.slipShadowPos(); controls.get('A.pad1').release(); const t = ctx.currentTime, g = a.ppGhost;
      while (ctx.currentTime - t < .02) await w(2);
      const e = ctx.currentTime - t;
      r = { ghost: !!g && Math.abs(g.until - t - .1) < .03, e, gv: g && g.g.gain.value, nv: a.srcGain && a.srcGain.gain.value, d: a.position() - sh - e * a.rate, tries: k + 1 };
      await w(250); r.nv2 = a.srcGain.gain.value; a.pause();
    }
    a.slip = false; PerfPlus.P.slipMs = 0; return r;
  });
  check(slip.ghost && Math.abs(slip.nv - slip.e / .1) < .15 && Math.abs(slip.gv - (1 - (slip.e - .006) / .094)) < .15 && slip.nv2 > .99 && Math.abs(slip.d) < .03,
    'Retour du slip sur 100 ms : la position fantôme reprend en fondu', JSON.stringify(slip));

  // ---------- 8. Pad FX et Roll FX : effet tant que le pad est maintenu ----------
  await W(() => { const a = decks[0]; a.seek(a.timeOfBeat(64)); a.play(); a.padMode = 'pfx'; renderPads(a); S.quantize = false; });
  await sleep(500);
  const dry = await W(() => __meas(decks[0].an, 1200));
  const fx = await W(() => { const a = decks[0], u = fxOf(a), before = { type: u.slots[0].type, beats: u.beats, mode: u.mode, on: u.on }; window.__fxb = before;
    controls.get('A.pad4').press({}); return { before, type: u.slots[0].type, beats: u.beats, on: u.on, txt: a.ui.pads[3].textContent }; });
  await sleep(100);
  const wet = await W(() => __meas(decks[0].an, 1200));
  const rel = await W(() => { const a = decks[0], u = fxOf(a); controls.get('A.pad4').release(); return { on: u.on, beats: u.beats, mode: u.mode, type: u.slots[0].type }; });
  await sleep(2700);
  const rest = await W(() => fxOf(decks[0]).slots[0].type);
  check(fx.type === 'gate' && fx.on && fx.beats === .25 && wet < dry * .85 && /^Trans/.test(fx.txt), 'Pad FX « Trans 1/4 » maintenu : le niveau de la voie chute', `${dry.toFixed(3)} → ${wet.toFixed(3)} · ${fx.txt}`);
  check(!rel.on && rel.beats === fx.before.beats && rel.mode === fx.before.mode && rest === fx.before.type, 'Pad FX relâché : l’unité retrouve ses réglages', JSON.stringify({ rel, rest }));
  const roll = await W(() => { const a = decks[0], u = fxOf(a); controls.get('A.pad7').press({}); const r = { type: u.slots[0].type, beats: u.beats, on: u.on, lit: (padLights(a), a.ui.pads[6].classList.contains('lit')) }; controls.get('A.pad7').release(); r.off = !u.on; a.pause(); a.padMode = 'hot'; renderPads(a); return r; });
  check(roll.type === 'repeat' && roll.beats === .25 && roll.on && roll.lit && roll.off, 'Roll FX : répétition d’1/4 de temps pendant l’appui', JSON.stringify(roll));

  // ---------- 9. Sampler : 4 banques de 8 ----------
  const sb = await W(() => {
    const a = decks[0]; a.padMode = 'smp'; renderPads(a); PerfPlus.setBank(0);
    controls.get('A.hotbank').press({}); const r = { bank: PerfPlus.P.smpBank, lab: a.ui.pp.bank.textContent, txt: a.ui.pads[0].textContent, n: SAMPLER.pads.length };
    controls.get('A.pad1').press({}); r.p8 = !!SAMPLER.playing[8]; r.p0 = !!SAMPLER.playing[0]; controls.get('A.pad1').release(); samplerStop(8);
    r.names = [1, 2, 3].map(b => SAMPLER.pads[b * 8].name); return r;
  });
  check(sb.n === 32 && sb.bank === 1 && sb.lab === 'S2' && sb.txt === 'Kick' && sb.p8 && !sb.p0, 'Sampler : 4 banques de 8, la banque 2 (kit) joue le Kick sur le pad 1', JSON.stringify(sb));

  // ---------- 10. Sampler routé dans la voie A : il suit le fader ----------
  const routeMeas = async fader => W(async f => {
    const a = decks[0]; a.ui.fader.set(f); await new Promise(r => setTimeout(r, 60));
    let s = 0; for (let k = 0; k < 3; k++) { samplerStop(8); samplerDown(8); s += await __meas(a.an, 160); }
    const m = await __meas(bus.anL, 50); samplerStop(8); return s / 3;
  }, fader);
  await W(() => { decks.forEach(d => d.pause()); PerfPlus.setRoute('A'); SAMPLER.pads[8].mode = 'shot'; });
  const rUp = await routeMeas(1), rDown = await routeMeas(0);
  await W(() => { PerfPlus.setRoute('M'); decks[0].ui.fader.set(1); });
  const rM = await routeMeas(1);
  check(rUp > .02 && rDown < rUp * .01 && rM < rUp * .01, 'Sampler dans la voie A : passe par le fader de A (et plus du tout en sortie Master)', `fader haut ${rUp.toFixed(4)} · bas ${rDown.toFixed(5)} · master ${rM.toFixed(5)}`);

  // ---------- 11. Pré-écoute au casque ----------
  const hp = await W(async () => {
    const cueAn = __an(bus.cue); PerfPlus.setCue(false); await new Promise(r => setTimeout(r, 300));
    PerfPlus.preview(12); const c = await __meas(cueAn, 300); const m = await __meas(bus.anL, 300);
    PerfPlus.setCue(true); await new Promise(r => setTimeout(r, 50)); samplerStop(8); samplerDown(8); const c2 = await __meas(cueAn, 300); samplerStop(8); PerfPlus.setCue(false);
    return { c, m, c2 };
  });
  check(hp.c > .01 && hp.m < .001 && hp.c2 > .01, 'Casque : pré-écoute d’un son sans le master, et sampler au casque à la demande', JSON.stringify(hp));

  // ---------- 12. Capture d'une boucle de 4 temps, boucle calée qui suit le tempo ----------
  const cap = await W(async () => {
    const a = decks[0]; a.seek(a.timeOfBeat(64) + .005); a.loopAuto(4);
    const p = await PerfPlus.capture(a, 24), sr = ctx.sampleRate, want = Math.round(4 * a.beatLen * sr);
    const src = a.track.buffer.getChannelData(0), st = Math.round(a.loop.start * sr), cap = p.buf.getChannelData(0);
    let num = 0, da = 0, db = 0; for (let i = 0; i < cap.length; i += 3) { num += cap[i] * src[st + i]; da += cap[i] * cap[i]; db += src[st + i] * src[st + i]; }
    a.exitLoop(); return { len: p.buf.length, want, mode: p.mode, beats: p.beats, corr: num / Math.sqrt(da * db), name: p.name };
  });
  check(Math.abs(cap.len - cap.want) <= 1 && cap.mode === 'loop' && cap.beats === 4 && cap.corr > .999, 'Capture : la boucle de 4 temps de A dure exactement 4 temps dans le slot', JSON.stringify(cap));
  const sync = await W(async () => {
    const a = decks[0]; a.setPitch(0); a.seek(a.timeOfBeat(64)); a.play(); await new Promise(r => setTimeout(r, 300));
    S.quantize = true; samplerDown(24); const v = SAMPLER.playing[24], r0 = v.s.playbackRate.value, bp = a.beatIdx(a.positionAt(v.t));
    samplerStop(24); S.quantize = false; samplerDown(24); const w = SAMPLER.playing[24], bw = a.beatIdx(a.positionAt(w.t)), dur = w.s.buffer.duration;
    const ph = (((bw - 64) % 4) + 4) % 4 / 4 * dur;
    a.setPitch(.04); await new Promise(r => setTimeout(r, 300)); const r1 = w.rt;
    samplerStop(24); a.setPitch(0); a.pause(); return { r0, r1, frac: bp - Math.round(bp), off: v.off, phase: (w.off - ph) * 1000 };
  });
  check(Math.abs(sync.r0 - 1) < .002 && Math.abs(sync.r1 - 1.04) < .002 && Math.abs(sync.frac) < .01 && Math.abs(sync.phase) < 2, 'Boucle calée : départ sur le temps (ou tout de suite à la bonne phase), vitesse 1 puis 1,04 quand A passe à +4 %', JSON.stringify(sync));

  // ---------- 13. Séquenceur 16 pas : les coups tombent sur la grille de la platine maître ----------
  const seq = await W(async () => {
    const a = decks[0]; a.ui.fader.set(0); a.seek(a.timeOfBeat(64)); a.play(); S.master = a;
    const P = PerfPlus.P; P.seq.bank = 1; P.seq.steps = PerfPlus.stepsOf('none'); P.seq.steps[0] = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0];
    await new Promise(r => setTimeout(r, 200));
    const R = await __rec(SAMPLER.gain); PerfPlus.seqStart(); await new Promise(r => setTimeout(r, 3200)); PerfPlus.seqHalt(); await new Promise(r => setTimeout(r, 200));
    const x = R.stop(), on = __onsets(x), now = ctx.currentTime, bp = a.beatPos(), spb = a.beatLen / a.rate;
    const steps = on.map(t => (bp + (t - now) / spb) * 4), err = steps.map(s => (s - Math.round(s)) * spb / 4 * 1000);
    const kinds = steps.map(s => ((Math.round(s) % 16) + 16) % 16);
    a.pause(); return {  n: on.length, err: Math.max(...err.map(Math.abs)), kinds: [...new Set(kinds)].sort((p, q) => p - q) };
  });
  check(seq.n >= 5 && seq.err < 3 && seq.kinds.every(k => [0, 4, 8, 13].includes(k)) && seq.kinds.includes(13), 'Séquenceur calé sur A : chaque coup tombe sur son pas (écart max en ms)', JSON.stringify(seq));
  const intc = await W(async () => {
    const P = PerfPlus.P; await new Promise(r => setTimeout(r, 600)); /* laisse finir les coups programmés par le séquenceur précédent */ decks.forEach(d => d.pause()); P.seq.bpm = 120; P.seq.steps = PerfPlus.stepsOf('none'); P.seq.steps[0] = Array(16).fill(0).map((_, k) => k % 4 ? 0 : 1);
    const R = await __rec(SAMPLER.gain); PerfPlus.seqStart(); await new Promise(r => setTimeout(r, 2300)); PerfPlus.seqHalt(); await new Promise(r => setTimeout(r, 150));
    const on = __onsets(R.stop()), gaps = on.slice(1).map((t, i) => t - on[i]); return { n: on.length, dev: Math.max(...gaps.map(g => Math.abs(g - .5))) * 1000 };
  });
  check(intc.n >= 4 && intc.dev < 1, 'Séquenceur sans platine : tempo interne 120 BPM, un coup toutes les 500 ms', JSON.stringify(intc));
  const pat = await W(async () => {
    PerfPlus.setGenre('techno'); const P = PerfPlus.P, G = PerfPlus.GENRES.find(g => g[0] === 'techno');
    const r = { bank: P.seq.bank, bpm: P.seq.bpm, kick: P.seq.steps[0].join(''), hats: P.seq.steps[3].reduce((a, b) => a + b, 0), genres: PerfPlus.GENRES.length };
    const h0 = PerfPlus.seq.hits; PerfPlus.seqStart(); await new Promise(r => setTimeout(r, 600)); PerfPlus.seqHalt(); r.hits = PerfPlus.seq.hits - h0; return r;
  });
  check(pat.bank === 1 && pat.bpm === 130 && pat.kick === '1000100010001000' && pat.hats === 16 && pat.genres >= 8 && pat.hits >= 6, 'Styles de rythmes : le style Techno remplit la grille avec le kit et joue', JSON.stringify(pat));

  // ---------- 14. Looper : 1 mesure de A, calée et fidèle, overdub, vers le sampler ----------
  const lp = await W(async () => {
    const a = decks[0], L = PerfPlus.LOOPERS.A, w = ms => new Promise(r => setTimeout(r, ms)); S.quantize = true;
    a.ui.fader.set(1); a.setPitch(0); a.seek(a.timeOfBeat(96)); a.play(); await w(300);
    await L.rec(1); const p0 = a.positionAt(L.t0), sr = ctx.sampleRate;
    while (L.first || L.state === 'rec') await w(50);
    const buf = L.buf[0], src = a.track.buffer.getChannelData(0), s0 = Math.round(p0 * sr);
    let best = -2, lag = 0;
    for (let k = -200; k <= 200; k++) { let n = 0, da = 0, db = 0; for (let i = 2000; i < buf.length - 2000; i += 4) { const x = buf[i], y = src[s0 + i + k]; n += x * y; da += x * x; db += y * y; } const c = n / Math.sqrt(da * db + 1e-12); if (c > best) { best = c; lag = k; } }
    const e0 = buf.reduce((s, v) => s + v * v, 0);
    await L.setDub(true); await w(L.len * 1000 + 400); await L.setDub(false); const e1 = L.buf[0].reduce((s, v) => s + v * v, 0);
    a.pause(); await w(400);
    const out = await __meas(bus.anL, 500), deck = await __meas(a.an, 300);
    const p = await PerfPlus.looperToSampler('A', 25); L.stop();
    return { len: buf.length, want: Math.round(4 * a.beatLen * sr), corr: best, lagMs: lag / sr * 1000, startBeat: ((a.beatIdx(p0) % 4) + 4) % 4, dub: e1 / e0, out, deck, smp: p && Math.abs(p.buf.duration - L.len) < .001, smpBeats: p && p.beats };
  });
  check(Math.abs(lp.len - lp.want) <= 1 && Math.min(lp.startBeat, 4 - lp.startBeat) < .01, 'Looper : 1 mesure exacte, départ sur le premier temps de la mesure', JSON.stringify({ len: lp.len, want: lp.want, startBeat: lp.startBeat }));
  check(lp.corr > .98 && Math.abs(lp.lagMs) < .5, 'Looper : l’enregistrement colle à la piste, à 0,5 ms près', `corrélation ${lp.corr.toFixed(4)} · décalage ${lp.lagMs.toFixed(3)} ms`);
  check(lp.dub > 1.5 && lp.out > .01 && lp.deck < .001, 'Looper : l’overdub s’ajoute, la boucle continue au master quand A est arrêtée', JSON.stringify({ dub: lp.dub, out: lp.out, deck: lp.deck }));
  check(lp.smp && lp.smpBeats === 4, 'Looper vers le sampler : la boucle devient un slot calé de 4 temps', JSON.stringify({ smp: lp.smp, beats: lp.smpBeats }));

  // ---------- 15. Fenêtre d'outils, réglages, persistance ----------
  await W(() => { decks[0].padMode = 'hot'; renderPads(decks[0]); });
  await page.click('#p-deckA .pp-tools');
  const ui1 = await W(() => ({ vis: !!document.querySelector('.popx.ppx'), tabs: document.querySelectorAll('.ppx .pp-tabs .b').length }));
  await page.click('.ppx .pp-tabs .b >> text=Séquenceur');
  const ui2 = await W(() => ({ steps: document.querySelectorAll('.ppx .pp-grid .pp-st').length, v: PerfPlus.P.seq.steps[0][1] }));
  await page.click('.ppx .pp-grid .pp-st >> nth=1');
  const ui3 = await W(() => PerfPlus.P.seq.steps[0][1]);
  await page.screenshot({ path: '/tmp/perfplus-seq.png' });
  await page.click('.ppx .pp-tabs .b >> text=Boucle');
  await page.screenshot({ path: '/tmp/perfplus-loop.png' });
  await page.click('.ppx .pp-tabs .b >> text=Cues');
  await page.screenshot({ path: '/tmp/perfplus-cues.png' });
  await page.keyboard.press('Escape');
  check(ui1.vis && ui1.tabs === 5 && ui2.steps === 128 && ui3 === 1 - ui2.v, 'Fenêtre d’outils : 5 onglets, grille 8 × 16 du séquenceur cliquable', JSON.stringify({ ui1, ui2, ui3 }));
  const st = await W(() => (window.MixlabSettings || []).filter(s => /^perfplus\./.test(s.key)).map(s => s.key));
  check(st.length >= 4 && st.includes('perfplus.slipMs') && st.includes('perfplus.hotStop'), 'Réglages déclarés pour la fenêtre Préférences', st.join(', '));
  await (await page.$('#p-deckA')).screenshot({ path: '/tmp/perfplus-deck.png' });

  await page.reload();
  await page.waitForFunction(() => LIB.tracks.length >= 4 && decks[0].track && decks[0].ui.pp, null, { timeout: 60000 });
  await sleep(600);
  const back = await W(() => { const t = decks[0].track; return { h8: t.hot[8], seqs: (t.cueSeqs || []).length, act: (t.loops || []).filter(l => l.active).length, cap: SAMPLER.pads[24] && SAMPLER.pads[24].custom, capMode: SAMPLER.pads[24] && SAMPLER.pads[24].mode }; });
  check(back.h8 != null && back.seqs === 1 && back.cap && back.capMode === 'loop', 'Après rechargement : hot cue 9, séquence et boucle capturée retrouvés', JSON.stringify(back));

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Pads et sampler de performance : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
