'use strict';
// Test de l'analyse de structure, des cues mémoire, de la suggestion du morceau suivant
// et de l'auto-mix : une vraie transition A → B jouée toute seule, notée par le coach.
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => typeof LIB !== 'undefined' && LIB.tracks.length >= 4 && LIB.tracks.every(t => t.sections), null, { timeout: 60000 });
  await page.mouse.click(800, 5);
  const W = (f, a) => page.evaluate(f, a);
  const wait = async (fn, ms = 4000, a) => { const t = Date.now(); while (Date.now() - t < ms) { if (await W(fn, a)) return true; await sleep(100); } return false; };

  // 1. Sections
  const st = await W(() => LIB.tracks.map(t => ({ title: t.title, dur: t.duration, energy: t.energy, hot: t.hot.filter(x => x != null).length,
    s: t.sections.map(s => ({ type: s.type, start: s.start, end: s.end, bars: s.bars })), mc: t.memCues.map(m => ({ t: m.t, label: m.label })) })));
  for (const t of st) {
    const s = t.s, sorted = s.every((x, i) => x.end > x.start && (!i || Math.abs(x.start - s[i - 1].end) < 1e-6));
    check(s.length >= 3 && s[0].type === 'intro' && s[s.length - 1].type === 'outro' && s.some(x => x.type === 'drop' || x.type === 'break'),
      `Sections de « ${t.title} » : intro, drop ou break, outro`, s.map(x => x.type + ' ' + x.bars).join(' · '));
    check(sorted && s[0].start === 0 && Math.abs(s[s.length - 1].end - t.dur) < 1e-6, `Sections de « ${t.title} » triées et couvrant le morceau`);
    check(t.mc.length >= 3 && t.mc[0].label === 'Intro' && t.mc.some(m => m.label === 'Outro') && t.mc.every((m, i) => !i || m.t > t.mc[i - 1].t), `Cues mémoire de « ${t.title} »`, t.mc.map(m => m.label + ' ' + m.t.toFixed(1)).join(' · '));
    check(t.hot === 0, `Hot cues de « ${t.title} » laissés vides`);
    check(Number.isInteger(t.energy) && t.energy >= 1 && t.energy <= 10, `Énergie de « ${t.title} » entre 1 et 10`, String(t.energy));
  }
  const halo = st.find(t => t.title === 'Halogène');
  const brk = halo.s.find(x => x.type === 'break'), drop = halo.s.find(x => x.type === 'drop');
  check(brk && Math.abs(brk.start - 32 * 240 / 126) < .1 && drop && Math.abs(drop.start - 40 * 240 / 126) < .1, 'Halogène : break mesure 33, drop mesure 41', JSON.stringify({ brk, drop }));
  check(await W(() => Structure.at(LIB.tracks[2], 65).type === 'break' && Structure.tag(LIB.tracks[2], 65).includes('BREAK')), 'Section lue à une position donnée');

  // 2. Colonne Énergie
  const col = await W(() => { const th = document.querySelector('.lt th[data-k="energy"]'); const cells = [...document.querySelectorAll('.lt td.nrg')].map(td => td.textContent.trim()); return { th: th && th.textContent, cells }; });
  check(col.th === 'Énergie' && col.cells.length >= 4 && col.cells.every(c => /^\d+$/.test(c)), 'Colonne Énergie dans la bibliothèque', JSON.stringify(col));
  await W(() => document.querySelector('.lt th[data-k="energy"]').click());
  check(await W(() => lib.sort.k === 'energy'), 'Tri par énergie');

  // 3. Suivant suggéré
  await W(() => { resetMixer(); decks[0].load(LIB.tracks[1]); decks[1].load(LIB.tracks[0]); });
  const sug = await W(() => Suggest.next(decks[0]).map(s => ({ title: s.t.title, score: s.score, keyOk: s.keyOk, bpmOk: s.bpmOk, why: s.why.join(', ') })));
  console.log('     suggestions après Quai 9 :', sug.map(s => s.title + ' ' + s.score).join(' · '));
  check(sug.length === 3 && sug[0].title === 'Halogène' && sug[0].keyOk && sug[0].bpmOk, 'Suggest.next : Halogène (4A → 5A, 126 BPM) en tête', JSON.stringify(sug[0]));
  check(sug.every((s, i) => !i || s.score <= sug[i - 1].score) && !sug.some(s => s.title === 'Quai 9'), 'Classement décroissant, sans le morceau en cours');
  const dbl = await W(() => Suggest.rate({ key: LIB.tracks[1].key, bpm: 63.5, energy: 7 }, LIB.tracks[2]).bpmOk);
  check(dbl, 'Tempo moitié / double accepté (63,5 ↔ 126 BPM)');

  // 4. Auto-mix : A joue Quai 9 près de l'outro, Halogène en file, transition « Basses » de 8 mesures.
  await W(() => {
    MixCoach.setLevel('debutant'); MixCoach.state.hist.length = 0;
    const a = decks[0]; a.seek(a.timeOfBeat(4 * 58)); controls.get('A.fader').set(1); controls.get('A.play').press({});
    AutoMix.queue = [LIB.tracks[2].id]; AutoMix.setStyle('bass'); AutoMix.setBars(8); AutoMix.setOpen(true); AutoMix.start();
  });
  check(await wait(() => AutoMix.state.inc === decks[1] && decks[1].track === LIB.tracks[2] && decks[1].sync && decks[1].p.fader === 0 && decks[1].p.low === 0, 3000), 'Morceau suivant chargé sur B, synchronisé, fader et graves en bas');
  const pl = await W(() => AutoMix.state.plan);
  check(pl && pl.start === 64 * 4 && pl.len === 32 && pl.style === 'bass', 'Transition prévue sur le 1 de l’outro (mesure 65), 8 mesures', JSON.stringify(pl));
  await page.screenshot({ path: '/tmp/mixlab-automix-wait.png' });
  // pendant la transition : on relève basses, crête du master et position des commandes
  await W(() => { window.__am = { both: 0, swap: false, peak: 0, mixSeen: false, bFaderMid: false };
    window.__amT = setInterval(() => { const a = decks[0], b = decks[1], g = d => d.p.fader * d.p.fader * xfGainOf(d);
      if (a.playing && b.playing && bassOn(a) && bassOn(b) && g(a) > .25 && g(b) > .25) __am.both++;
      if (b.playing && a.playing && !bassOn(a) && bassOn(b)) __am.swap = true;
      if (AutoMix.state.st === 'mix') __am.mixSeen = true;
      if (b.p.fader > .2 && b.p.fader < .9) __am.bFaderMid = true;
      __am.peak = Math.max(__am.peak, level(bus.anL), level(bus.anR)); }, 50); });
  check(await wait(() => __am.mixSeen, 20000), 'La transition démarre');
  await sleep(2500);
  await page.screenshot({ path: '/tmp/mixlab-automix-mix.png' });
  check(await wait(() => MixCoach.state.hist.length > 0, 35000), 'Transition terminée et notée par le coach');
  const res = await W(() => { clearInterval(__amT); const h = MixCoach.state.hist[0]; return { am: __am, h, st: AutoMix.state.st, main: AutoMix.state.main && AutoMix.state.main.id,
    aPlay: decks[0].playing, bPlay: decks[1].playing, bAud: audible(decks[1]), bLow: decks[1].p.low, bFader: decks[1].p.fader, master: S.master && S.master.id, lastStart: decks[1].lastStart && decks[1].lastStart.otherBeat }; });
  console.log('     bilan :', JSON.stringify(res.h));
  check(res.main === 'B' && res.bPlay && res.bAud && !res.aPlay && res.master === 'B', 'B est devenue la platine principale, A arrêtée', JSON.stringify({ main: res.main, master: res.master, aPlay: res.aPlay }));
  check(res.am.swap && res.am.both === 0 && res.bLow === .5, 'Échange des basses sans superposition', JSON.stringify(res.am));
  check(res.am.bFaderMid && res.bFader > .99, 'Le fader de B a bougé à l’écran (commandes pilotées)');
  check(res.am.peak < .98, 'Pas de saturation', res.am.peak.toFixed(3));
  check(Math.abs(res.lastStart - 256) < .2, 'B lancée sur le 1 de la phrase', String(res.lastStart));
  check(res.h && res.h.from === 'A' && res.h.to === 'B' && res.h.score >= 60, 'Note du coach ≥ 60', res.h && res.h.score + '/100');

  // 5. Il enchaîne : le morceau suivant (suggestion) est préparé sur A.
  check(await wait(() => AutoMix.state.st === 'play' && AutoMix.state.inc === decks[0] && decks[0].track && !decks[0].playing && decks[0].p.fader === 0, 6000), 'Morceau suivant préparé sur A', await W(() => decks[0].track && decks[0].track.title));

  // 6. Reprise en main : on rapproche B de sa fin, la transition démarre, on touche le fader de A.
  await W(() => { const b = decks[1]; const p = AutoMix.state.plan; b.seek(b.timeOfBeat(p.start - 6)); });
  check(await wait(() => AutoMix.state.st === 'mix', 8000), 'Deuxième transition lancée');
  await sleep(600);
  await W(() => controls.get('A.fader').set(.7));
  check(await wait(() => AutoMix.state.st === 'take', 2000), 'Commande touchée : l’auto-mix rend la main', await W(() => AutoMix.state.msg));
  const fz = await W(() => decks[0].p.fader);
  await sleep(1500);
  check(await W(f => Math.abs(decks[0].p.fader - f) < 1e-6, fz), 'Plus d’automatisme sur la transition reprise');
  await W(() => AutoMix.stop());
  check(await W(() => !AutoMix.state.on && document.querySelector('#am-btn') && !document.querySelector('#p-automix').hidden), 'Arrêt de l’auto-mix, panneau toujours là');
  await page.screenshot({ path: '/tmp/mixlab-automix.png' });

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Structure, suggestions et auto-mix : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
