'use strict';
// Test de l'Académie : ouverture depuis le coach, rendu de chaque leçon, quiz corrigés (juste / faux),
// progression gardée après rechargement, les quatre exercices (courbe d'énergie, assistant de trame,
// simulation de piste, crate intelligente), glossaire cherchable et bulles de définition.
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
  const ready = p => p.waitForFunction(() => typeof LIB !== 'undefined' && LIB.tracks.length >= 4 && document.getElementById('ac') && window.Academie, null, { timeout: 60000 });

  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage(); watch(page);
  page.on('dialog', d => d.accept());
  await page.goto(url);
  await ready(page);
  await page.mouse.click(800, 5);
  const W = (f, a) => page.evaluate(f, a);
  const wait = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await W(fn)) return true; await sleep(80); } return false; };
  const lesson = async id => { await W(id => Academie.go('lesson', id), id); await sleep(60); };

  // 1. Ouverture depuis la liste des leçons du coach.
  if (await W(() => document.getElementById('p-coach').hidden)) await page.click('#coach-btn');
  check(await W(() => !!document.querySelector('#coach-body > .pc-card:first-child') && !!document.querySelector('#coach-body .ac-card #ac-open')), 'Carte Académie dans la liste des leçons, après le parcours');
  check(await W(() => window.ACADEMIE_DATA && ACADEMIE_DATA.modules.length === 4 && Academie.LESSONS.length === 12), 'Contenu chargé : 4 modules, 12 leçons');
  await page.click('#ac-open');
  check(await W(() => Academie.active && document.body.classList.contains('academie') && !document.getElementById('ac').hidden && getComputedStyle(document.getElementById('coach-body')).display === 'none'), 'Académie ouverte dans le panneau du coach');
  check(await W(() => document.querySelectorAll('#ac .pc-tile[data-l]').length === 12 && document.querySelectorAll('#ac .ac-mod').length === 4), 'Accueil : 4 modules et 12 leçons');

  // 2. Chaque leçon s'affiche : texte, points clés, quiz, exercice.
  const bad = [];
  for (const id of await W(() => Academie.LESSONS.map(l => l.id))) {
    await W(() => Academie.go('home')); await page.click(`#ac .pc-tile[data-l="${id}"]`); await sleep(40);
    const r = await W(id => {
      const l = Academie.LESSONS.find(x => x.id === id), q = s => document.querySelectorAll(s).length;
      const errs = [];
      if (document.getElementById('ac-title').textContent !== l.title) errs.push('titre');
      if (q('#ac .ac-txt p') !== l.body.length) errs.push('texte');
      if (q('#ac .ac-keys li') !== (l.keys || []).length) errs.push('points clés');
      if (q('#ac .ac-q') !== (l.quiz || []).length) errs.push('quiz');
      if (l.quiz && l.quiz.some((x, i) => document.querySelectorAll(`#ac .ac-q[data-q="${i}"] .ac-c`).length !== x.choices.length)) errs.push('choix');
      if (!!l.exercise !== !!document.querySelector(`#ac .ac-ex[data-ex="${l.exercise ? l.exercise.type : ''}"]`)) errs.push('exercice');
      if (/\*\*/.test(document.querySelector('#ac .ac-txt').textContent)) errs.push('gras non rendu');
      return errs.join(',');
    }, id);
    if (r) bad.push(id + ' : ' + r);
  }
  check(!bad.length, 'Les 12 leçons s’affichent (texte, points clés, quiz, exercice)', bad.join(' | '));

  // 3. Quiz : réponse fausse puis juste, explication, leçon terminée.
  await lesson('set-roles');
  await page.click('#ac .ac-q[data-q="0"] .ac-c[data-c="0"]');
  check(await W(() => document.querySelector('#ac .ac-q[data-q="0"] .ac-c[data-c="0"]').classList.contains('bad') && /Pas tout à fait/.test(document.querySelector('#ac .ac-q[data-q="0"] .ac-fb.bad').textContent) && Academie.prog.quiz['set-roles'][0].ok === false), 'Quiz : mauvaise réponse marquée fausse, avec l’explication');
  check(await W(() => [...document.querySelectorAll('#ac .ac-q[data-q="0"] .ac-c')].every(b => b.disabled) && !Academie.prog.done['set-roles']), 'Quiz : choix verrouillés, leçon pas encore terminée');
  await page.click('#ac .ac-q[data-q="0"] .ac-retry');
  await page.click('#ac .ac-q[data-q="0"] .ac-c[data-c="1"]');
  check(await W(() => document.querySelector('#ac .ac-q[data-q="0"] .ac-c[data-c="1"]').classList.contains('ok') && !!document.querySelector('#ac .ac-q[data-q="0"] .ac-fb.ok') && Academie.prog.quiz['set-roles'][0].ok), 'Quiz : nouvel essai, bonne réponse validée');
  await page.click('#ac .ac-q[data-q="1"] .ac-c[data-c="0"]');
  check(await W(() => !!Academie.prog.done['set-roles'] && !!document.getElementById('ac-done')), 'Toutes les réponses justes : leçon terminée');
  // les autres quiz : la bonne réponse est reconnue, une mauvaise non
  const qbad = await W(() => {
    const out = [];
    for (const l of Academie.LESSONS) (l.quiz || []).forEach((q, i) => { if (q.a < 0 || q.a >= q.choices.length || !q.why) out.push(l.id + '#' + i); });
    return out.join(',');
  });
  check(!qbad, 'Chaque question a une bonne réponse et une explication', qbad);
  await lesson('set-flow');
  await page.click('#ac .ac-q[data-q="0"] .ac-c[data-c="1"]');
  await page.click('#ac .ac-q[data-q="1"] .ac-c[data-c="0"]');
  check(await W(() => Academie.prog.quiz['set-flow'][0].ok && !Academie.prog.quiz['set-flow'][1].ok && !Academie.prog.done['set-flow']), 'Quiz « Enchaîner » : une juste, une fausse, leçon non terminée');
  await page.click('#ac .ac-q[data-q="1"] .ac-retry'); await page.click('#ac .ac-q[data-q="1"] .ac-c[data-c="1"]');
  check(await W(() => !!Academie.prog.done['set-flow']), 'Quiz « Enchaîner » corrigé : leçon terminée');

  // Leçon sans quiz ni exercice : « J'ai lu ».
  await lesson('pub-requests');
  await page.click('#ac-read');
  check(await W(() => !!Academie.prog.done['pub-requests'] && !!document.getElementById('ac-done')), 'Leçon de lecture : terminée avec « J’ai lu »');

  // Bulle du glossaire sur un mot en gras.
  await lesson('set-roles');
  await page.click('#ac .ac-txt .pc-gl[data-g="warm-up"]');
  check(await page.isVisible('.pc-pop') && /installe l’ambiance/.test(await page.textContent('.pc-pop')), 'Mot du glossaire cliquable dans la leçon : définition en bulle', await page.textContent('.pc-pop'));
  await page.mouse.click(400, 500); await sleep(50);
  check(await W(() => Parcours.GLOSS['crate intelligente'] && Parcours.GLOSS['morceau pont']), 'Glossaire de l’Académie disponible dans le parcours');

  // 4. Exercice : courbe d'énergie.
  await lesson('set-energy');
  await page.click('#ac .ac-q[data-q="0"] .ac-c[data-c="1"]');
  await W(() => { Academie.prog.energy = null; Academie.render(); });
  await page.click('#ac-echeck');
  check(await W(() => document.getElementById('ac-efb').classList.contains('bad') && !Academie.prog.ex['set-energy']), 'Courbe plate : refusée avec un conseil', await page.textContent('#ac-efb'));
  const target = [3, 3, 4, 5, 4, 6, 7, 8];
  const box = await page.locator('#ac-ecurve').boundingBox();
  const px = i => box.x + (20 + i * 272 / 7) / 300 * box.width, py = v => box.y + (8 + (10 - v) / 9 * 106) / 130 * box.height;
  for (let i = 0; i < target.length; i++) {
    await page.mouse.move(px(i), py(5)); await page.mouse.down();
    await page.mouse.move(px(i), py((5 + target[i]) / 2), { steps: 3 }); await page.mouse.move(px(i), py(target[i]), { steps: 3 });
    await page.mouse.up();
  }
  check(await W(t => JSON.stringify(Academie.prog.energy.pts) === JSON.stringify(t), target), 'Courbe : points glissés à la souris', await W(() => JSON.stringify(Academie.prog.energy.pts)));
  check(await W(() => [...document.querySelectorAll('#ac-ecrit li')].every(li => li.classList.contains('ok'))), 'Courbe : les critères de l’escalier passent au vert');
  await page.focus('#ac-ecurve .pt[data-i="7"]'); await page.keyboard.press('ArrowUp');
  check(await W(() => Academie.prog.energy.pts[7] === 9), 'Courbe : un point se règle aussi au clavier');
  const m1 = await page.textContent('#ac-ematch');
  await page.selectOption('#ac-etpl', 'closing');
  const m2 = await page.textContent('#ac-ematch');
  check(m1 !== m2 && parseInt(m2) < parseInt(m1), 'Courbe : comparaison avec une autre trame', m1 + ' → ' + m2);
  await page.click('#ac-echeck');
  check(await W(() => !!Academie.prog.ex['set-energy'] && !!Academie.prog.done['set-energy'] && document.getElementById('ac-efb').classList.contains('ok')), 'Courbe en escalier validée : exercice et leçon réussis');
  await page.selectOption('#ac-esrc', 'prep');
  check(await W(() => document.querySelectorAll('#ac-elist li').length === LIB.playlists.find(p => p.id === 'prep').ids.length && Academie.prog.energy.ids.length >= 4), 'Courbe : on part d’une playlist, un point par morceau');
  const tid = await W(() => Academie.prog.energy.ids[0]);
  const b2 = await page.locator('#ac-ecurve').boundingBox(), n2 = await W(() => Academie.prog.energy.pts.length);
  await page.mouse.move(b2.x + 20 / 300 * b2.width, b2.y + b2.height / 2); await page.mouse.down();
  await page.mouse.move(b2.x + 20 / 300 * b2.width, b2.y + (8 + (10 - 2) / 9 * 106) / 130 * b2.height, { steps: 4 }); await page.mouse.up();
  check(await W(id => LIB.tracks.find(t => t.id === id).energyUser === 2, tid), 'Courbe : glisser un point note l’énergie du morceau dans la bibliothèque', 'points : ' + n2);
  const firstTitle = await page.textContent('#ac-elist li:first-child span');
  await page.click('#ac-elist li:first-child .b[title="Descendre"]');
  check(await W(t => document.querySelector('#ac-elist li:nth-child(2) span').textContent === t && Academie.prog.energy.ids[1] === LIB.tracks.find(x => x.title === t).id, firstTitle), 'Courbe : les morceaux se réordonnent');

  // 5. Exercice : assistant de trame.
  await lesson('set-prep');
  await page.selectOption('#ac-ptpl', 'warmup'); await page.selectOption('#ac-pmins', '60');
  await page.click('#ac-pgen');
  const plan = await W(() => Academie.prog.plan);
  check(plan && plan.tpl === 'warmup' && plan.slots.length === 12 && await W(() => document.querySelectorAll('#ac-pslots li').length === 12), 'Trame : 60 minutes, 12 tranches de 5 minutes');
  check(plan.slots.some(s => s.id) && new Set(plan.slots.filter(s => s.id).map(s => s.id)).size === plan.slots.filter(s => s.id).length, 'Trame : morceaux de ta bibliothèque placés, sans doublon', JSON.stringify(plan.slots.map(s => s.id)));
  check(await W(() => { const p = Academie.prog.plan; return p.slots.every((s, i) => !s.id || Math.abs(Academie.energyOf(LIB.tracks.find(t => t.id === s.id)) - s.target) <= 2); }), 'Trame : chaque morceau colle à l’énergie de sa tranche (±2)');
  check(await W(() => /À trouver|tranches remplies/.test(document.getElementById('ac-psum').textContent) && /2 à 3 fois plus/.test(document.getElementById('ac-psum').textContent)), 'Trame : bilan, liste de courses et réserve conseillée');
  await page.click('#ac-psave');
  const plName = 'Trame · Warm-up de club · 60 min';
  check(await W(n => { const p = LIB.playlists.find(x => x.name === n); return !!p && p.ids.length === Academie.prog.plan.slots.filter(s => s.id).length; }, plName) && await W(() => !!Academie.prog.ex['set-prep'] && !!Academie.prog.done['set-prep']), 'Trame rangée en playlist : exercice et leçon réussis');
  check(await W(n => [...document.querySelectorAll('#p-lib .it')].some(b => b.textContent.includes(n)), plName), 'La playlist de la trame apparaît dans la bibliothèque');
  await page.selectOption('#ac-ptpl', 'peak'); await page.click('#ac-pgen');
  check(await W(() => Academie.prog.plan.tpl === 'peak' && Academie.prog.plan.slots.length === 12), 'Trame : on peut en refaire une pour un autre public');

  // 6. Exercice : simulation de piste.
  await lesson('pub-types');
  await page.click('#ac .ac-q[data-q="0"] .ac-c[data-c="1"]');
  await page.click('#ac-sc-0');
  const f0 = await W(() => Academie.prog.crowd.fill);
  await page.click('#ac .ac-crowd .ac-c[data-o="1"]');
  check(await W(f => Academie.prog.crowd.fill < f && !!document.querySelector('#ac-cfb.bad'), f0), 'Piste : un mauvais choix la vide, avec l’explication');
  await page.click('#ac .ac-crowd .ac-c[data-o="1"]');
  check(await W(() => !!document.querySelector('#ac-cres.bad') && !Academie.prog.ex['pub-types']), 'Piste : échec annoncé, exercice pas encore réussi');
  await page.click('#ac-cagain');
  await page.click('#ac .ac-crowd .ac-c[data-o="0"]');
  check(await W(() => !!document.querySelector('#ac-cfb.ok') && document.querySelectorAll('#ac-floor i.on').length > 0), 'Piste : un bon choix la remplit');
  await page.click('#ac .ac-crowd .ac-c[data-o="0"]');
  check(await W(() => !!document.querySelector('#ac-cres.ok') && Academie.prog.crowd.fill >= 70 && !!Academie.prog.ex['pub-types'] && !!Academie.prog.done['pub-types']), 'Piste sauvée : exercice et leçon réussis', String(await W(() => Academie.prog.crowd.fill)));
  const scen = await W(() => ACADEMIE_DATA.scenarios.length);
  let scOk = true;
  for (let i = 1; i < scen; i++) { await page.click('#ac-sc-' + i); await page.click('#ac .ac-crowd .ac-c[data-o="0"]'); await page.click('#ac .ac-crowd .ac-c[data-o="0"]'); if (!(await W(() => !!document.querySelector('#ac-cres.ok')))) scOk = false; }
  check(scOk && scen >= 3, 'Piste : les autres situations (mariage, bar) se jouent aussi');

  // 7. Exercice : crate intelligente.
  await lesson('mus-org');
  await page.fill('#ac-cname', 'Peak'); await page.fill('#ac-ea', '7'); await page.fill('#ac-eb', '10');
  await page.click('#ac-csave');
  check(await W(() => !document.getElementById('ac-cfbk').hidden && document.getElementById('ac-cfbk').classList.contains('bad') && !Academie.prog.ex['mus-org']), 'Crate : mauvais réglages refusés avec un conseil', await page.textContent('#ac-cfbk'));
  await page.fill('#ac-cname', 'Montée'); await page.fill('#ac-ea', '6'); await page.fill('#ac-eb', '8'); await page.fill('#ac-ba', '122'); await page.fill('#ac-bb', '128');
  check(await W(() => /correspond/.test(document.getElementById('ac-cpv').textContent)), 'Crate : aperçu en direct des morceaux qui correspondent', await page.textContent('#ac-cpv'));
  await page.click('#ac-csave');
  check(await W(() => { const c = LibPro.crates.find(x => x.name === 'Montée'); return !!c && c.rules.some(r => r.f === 'energy' && r.a === 6 && r.b === 8) && c.rules.some(r => r.f === 'bpm' && r.a === 122 && r.b === 128) && !!Academie.prog.ex['mus-org'] && !!Academie.prog.done['mus-org']; }), 'Crate « Montée » créée dans la bibliothèque : exercice et leçon réussis');
  check(await W(() => { const c = LibPro.crates.find(x => x.name === 'Montée'); return JSON.stringify(LibPro.crateTracks(c).map(t => t.id)) === JSON.stringify(LIB.tracks.filter(t => { const e = t.energyUser ?? t.energy; return e != null && e >= 6 && e <= 8 && t.bpm >= 122 && t.bpm <= 128; }).map(t => t.id)); }), 'Crate : elle se remplit selon ses règles');
  await page.click('#ac-cshow');
  check(await W(() => lib.view.startsWith('sc:')), 'Crate : affichée dans la bibliothèque');
  const t0 = await W(() => LIB.tracks[0].id);
  await page.selectOption(`#ac-ctags select[data-t="${t0}"]`, 'Montée');
  check(await W(id => LIB.tracks.find(t => t.id === id).tags.includes('Montée') && LibPro.search('tag:montée').some(t => t.id === id), t0), 'Rangement par moment : tag posé, retrouvé avec tag:montée');
  await page.selectOption(`#ac-ctags select[data-t="${t0}"]`, 'Respiration');
  check(await W(id => { const t = LIB.tracks.find(t => t.id === id); return t.tags.includes('Respiration') && !t.tags.includes('Montée'); }, t0), 'Rangement : un seul moment par morceau');

  // 8. Glossaire cherchable.
  await lesson('mus-org');
  await page.click('#ac-gloss');
  const nAll = await W(() => document.querySelectorAll('#ac-gl dt').length);
  check(nAll >= 45, 'Glossaire : tous les mots (Académie et parcours)', String(nAll));
  await page.fill('#ac-gq', 'crate');
  check(await W(() => [...document.querySelectorAll('#ac-gl dt')].some(d => d.textContent === 'Crate intelligente') && document.querySelectorAll('#ac-gl dt').length < 6), 'Glossaire : recherche par mot');
  await page.fill('#ac-gq', 'ENERGIE');
  check(await W(() => [...document.querySelectorAll('#ac-gl dt')].some(d => d.textContent === 'Énergie')), 'Glossaire : recherche sans accents ni majuscules');
  await page.fill('#ac-gq', 'xyzxyz');
  check(await W(() => document.querySelectorAll('#ac-gl dt').length === 0 && /Aucun/.test(document.getElementById('ac-gcount').textContent)), 'Glossaire : aucun résultat annoncé');
  await page.click('#ac-gback');
  check(await W(() => Academie.prog.view === 'lesson' && document.getElementById('ac-title').textContent.length > 0), 'Glossaire : retour à la leçon');

  // 9. Progression gardée après rechargement.
  const before = await W(() => ({ done: Object.keys(Academie.prog.done).sort(), ex: Object.keys(Academie.prog.ex).sort(), les: Academie.prog.les }));
  await W(() => LibPro.saveBrowser && LibPro.saveBrowser());
  await sleep(600);
  await page.reload(); await ready(page); await sleep(300);
  const after = await W(() => ({ done: Object.keys(Academie.prog.done).sort(), ex: Object.keys(Academie.prog.ex).sort(), les: Academie.prog.les }));
  check(JSON.stringify(before) === JSON.stringify(after) && after.done.length >= 7 && after.ex.length === 4, 'Après rechargement : leçons et exercices réussis conservés', JSON.stringify(after));
  check(await W(() => Academie.active && document.body.classList.contains('academie') && !document.getElementById('ac').hidden && document.getElementById('ac-title').textContent === Academie.LESSONS.find(l => l.id === Academie.prog.les).title), 'Après rechargement : l’Académie rouvre sur la même leçon');
  check(await W(() => Academie.prog.quiz['set-roles'][0].ok && Academie.prog.energy.pts.length >= 4 && LibPro.crates.some(c => c.name === 'Montée')), 'Après rechargement : réponses, courbe et crate conservées');
  await W(() => Academie.go('home'));
  check(await W(() => document.querySelectorAll('#ac .pc-tile.d').length === Object.keys(Academie.prog.done).length && /\d+\/12/.test(document.getElementById('ac-stats').textContent)), 'Accueil : leçons terminées cochées, statistiques', await page.textContent('#ac-stats'));

  // 10. Fermer : le coach retrouve sa liste de leçons.
  await page.click('#ac-close');
  check(await W(() => !Academie.active && !document.body.classList.contains('academie') && document.getElementById('ac').hidden && getComputedStyle(document.getElementById('coach-body')).display !== 'none' && /Reprendre/.test(document.getElementById('ac-open').textContent)), 'Fermer : retour à la liste des leçons, carte « Reprendre »');
  await page.click('#ac-open');
  check(await W(() => Academie.active), 'Réouverture depuis la carte');
  await W(() => Parcours.open());
  check(await W(() => !Academie.active || getComputedStyle(document.getElementById('ac')).display === 'none'), 'Le parcours prend la place de l’Académie');
  await W(() => Parcours.exit());
  await ctx.close();

  // 11. Petit écran : l'Académie reste lisible.
  const ctx2 = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const p2 = await ctx2.newPage(); watch(p2);
  await p2.goto(url); await ready(p2);
  await p2.evaluate(() => { layout.coach = true; applyLayout(); Academie.open('set-energy'); });
  check(await p2.evaluate(() => { const r = document.getElementById('ac-ecurve').getBoundingClientRect(); return r.width > 200 && document.documentElement.scrollWidth <= innerWidth + 1; }), 'Petit écran : courbe lisible, pas de défilement horizontal');
  await ctx2.close();

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Académie : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
