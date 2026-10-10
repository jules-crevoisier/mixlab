'use strict';
// Test du coach en direct : on joue de vraies situations de mix et on vérifie
// que le bon conseil apparaît, sur la bonne commande, puis disparaît une fois corrigé.
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
  await page.waitForFunction(() => typeof LIB !== 'undefined' && LIB.tracks.length >= 2 && decks[1].track, null, { timeout: 30000 });
  await page.mouse.click(800, 5);
  const W = f => page.evaluate(f);
  const issues = () => W(() => [...MixCoach.state.issues.keys()]);
  const wait = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await W(fn)) return true; await sleep(100); } return false; };

  await W(() => { resetMixer(); MixCoach.setLevel('debutant'); ui.setX(.5); decks[0].seek(decks[0].timeOfBeat(64)); decks[1].seek(decks[1].timeOfBeat(0)); decks[0].ui.fader.set(1); decks[1].ui.fader.set(0); });
  await W(() => controls.get('A.play').press({}));
  await sleep(1500);
  check((await issues()).length === 0, 'A seule, réglages neutres : aucun conseil', JSON.stringify(await issues()));

  // B entre sans Sync, basses ouvertes, fader en haut.
  await W(() => { controls.get('B.play').press({}); decks[1].ui.fader.set(1); });
  check(await wait(() => MixCoach.state.issues.has('tempo') && MixCoach.state.issues.has('bass')), 'B sans Sync, basses ouvertes : tempo et basses signalés', JSON.stringify(await issues()));
  // Panneau Coach ouvert : le conseil y est déjà, le bandeau ne le répète pas.
  const coachOpen = await W(() => !document.getElementById('p-coach').hidden);
  if (coachOpen) check(await wait(() => document.querySelector('.coach-hud').hidden && /Tempos|basses/i.test(document.querySelector('#coach-direct .cl-list').textContent)), 'Panneau Coach ouvert : le conseil est dans le panneau, pas de bandeau en double');
  await W(() => setCoach(false));
  check(await wait(() => !document.querySelector('.coach-hud').hidden && document.querySelector('.coach-hud').classList.contains('bad')), 'Panneau fermé : bandeau du coach visible en rouge');
  // Le bandeau se range dans la bibliothèque, entre la barre d'outils et la liste : aucune ligne cachée.
  check(await W(() => { const hud = document.querySelector('.coach-hud'), r = hud.getBoundingClientRect();
    const rows = [...document.querySelectorAll('#p-lib tbody tr:not(.vpad)')].map(x => x.getBoundingClientRect()).filter(b => b.height > 0);
    return !!hud.closest('#p-lib') && rows.every(b => b.bottom <= r.top + 0.5 || b.top >= r.bottom - 0.5); }), 'Bandeau dans la bibliothèque, sans recouvrir de ligne');
  await W(() => setCoach(true));
  check(await W(() => !!document.querySelector('.coach-target')), 'Halo sur la commande à toucher', await W(() => MixCoach.target));

  await W(() => controls.get('B.sync').press({}));
  check(await wait(() => !MixCoach.state.issues.has('tempo')), 'Après Sync : le conseil tempo disparaît');
  await W(() => controls.get('B.low').set(0));
  check(await wait(() => !MixCoach.state.issues.has('bass')), 'LOW de B coupé : le conflit de basses disparaît');

  // Échange des basses puis sortie de A : bilan de transition.
  await sleep(1500);
  await W(() => { controls.get('A.low').set(0); controls.get('B.low').set(.5); });
  await sleep(800);
  await W(() => controls.get('A.fader').set(0));
  check(await wait(() => MixCoach.state.hist.length > 0, 5000), 'Bilan de transition A → B', JSON.stringify(await W(() => MixCoach.state.hist[0])));
  check(await W(() => !!document.querySelector('.trcard')), 'Bilan affiché dans le panneau');

  // Écart de volume entre deux pistes à EQ neutres.
  await W(() => { decks[0].ui.k.low.set(.5); decks[0].ui.fader.set(1); decks[0].ui.k.trim.set(.15); decks[1].ui.k.trim.set(.85); });
  check(await wait(() => MixCoach.state.issues.has('gain'), 7000), 'Gains très différents : écart de volume signalé', JSON.stringify(await issues()));
  await W(() => { decks[0].ui.k.trim.set(.5); decks[1].ui.k.trim.set(.5); });

  // Saturation.
  await W(() => { decks[0].ui.fader.set(0); controls.get('master').set(1); decks[1].ui.k.trim.set(1); decks[1].ui.k.low.set(1); });
  check(await wait(() => MixCoach.state.issues.has('clip') || MixCoach.state.issues.has('hot')), 'Gain et master à fond : saturation signalée', JSON.stringify(await issues()));
  await W(() => { decks[1].ui.k.trim.set(.5); decks[1].ui.k.low.set(.5); controls.get('master').set(.8); });

  // Fin de morceau sans relève.
  await W(() => { decks[0].pause(); decks[0].track = null; const b = decks[1]; b.seek(b.track.duration - 25); });
  check(await wait(() => MixCoach.state.issues.has('ending')), 'Fin de morceau proche : il faut préparer la suite', JSON.stringify(await W(() => MixCoach.state.issues.get('ending'))));

  // Silence.
  await W(() => decks[1].pause());
  check(await wait(() => MixCoach.state.issues.has('silence')), 'Plus rien ne joue : silence signalé');

  // Coach coupé.
  await W(() => MixCoach.setLevel('off'));
  check(await wait(() => MixCoach.state.issues.size === 0 && document.querySelector('.coach-hud').hidden), 'Coach coupé : plus aucun conseil');

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Coach en direct : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
