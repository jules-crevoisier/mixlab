'use strict';
// Test du parcours « De zéro à ton premier set » : premier lancement, interface qui grandit,
// validation automatique des étapes des chapitres 1 à 5 par de vraies actions sur les commandes,
// reprise après rechargement, étape passée, glossaire, bilan du premier set.
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
  const ready = p => p.waitForFunction(() => typeof LIB !== 'undefined' && LIB.tracks.length >= 4 && document.getElementById('pc'), null, { timeout: 60000 });

  // 1. Premier lancement : « Je n'ai jamais mixé ».
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();watch(page);
  await page.goto(url + '#welcome');
  await ready(page);
  await page.mouse.click(800, 5);
  const W = f => page.evaluate(f);
  const wait = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await W(fn)) return true; await sleep(80); } return false; };
  const pos = () => W(() => [Parcours.prog.ch, Parcours.prog.step]);
  const stepIs = (c, s, ms) => wait(new Function(`return Parcours.prog.ch===${c}&&Parcours.prog.step===${s}`), ms);
  const press = id => W(new Function(`controls.get(${JSON.stringify(id)}).press({})`));
  const set = (id, v) => W(new Function(`controls.get(${JSON.stringify(id)}).set(${v})`));
  const next = async () => { await page.click('#pc-next'); await sleep(120); };
  const locked = sel => W(new Function(`const e=document.querySelector(${JSON.stringify(sel)});return !!e&&(e.classList.contains('pc-lock')||e.classList.contains('pc-lockp')||e.classList.contains('pc-hide'))&&e.inert;`));

  check(await page.isVisible('.pc-wel'), 'Carte de bienvenue affichée au premier lancement');
  await page.click('#pc-novice');
  check(await W(() => store.get('welcome') === 'novice' && Parcours.active && document.body.classList.contains('parcours') && !document.querySelector('.pc-wel')), 'Choix « Je n’ai jamais mixé » : mémorisé, parcours ouvert');
  check(JSON.stringify(await pos()) === '[0,0]', 'On démarre au chapitre 1, étape 1', JSON.stringify(await pos()));

  // Interface qui grandit : au chapitre 1, une platine, un fader, le volume.
  check(await locked('#p-deckB') && await locked('#p-lib') && await locked('#p-wave'), 'Chapitre 1 : platine B, bibliothèque et waveforms verrouillées');
  check(await locked('[data-ctl="A.trim"]') && await locked('[data-ctl="A.cue"]') && await locked('#ch-A .eq'), 'Chapitre 1 : gain, cue et EQ grisés');
  check(!(await locked('[data-ctl="A.play"]')) && !(await locked('[data-ctl="A.fader"]')) && !(await locked('[data-ctl="master"]')), 'Chapitre 1 : play, fader et master disponibles');

  // Chapitre 1
  await next(); await next(); await next();
  check(await stepIs(0, 3), 'Chapitre 1 : les 3 étapes de visite passent avec « Continuer »');
  check(await W(() => Parcours.target === 'A.play' && controls.get('A.play').el.classList.contains('coach-target')), 'Halo sur ▶ de A', await W(() => Parcours.target));
  await press('A.play');
  check(await stepIs(0, 4), 'Play détecté');
  await set('A.fader', 0); check(await stepIs(0, 5), 'Fader baissé détecté');
  await set('A.fader', 1); check(await stepIs(0, 6), 'Fader remonté détecté');
  await set('master', .5);
  check(await wait(() => Parcours.prog.done[0] && document.querySelector('.pc-done')), 'Chapitre 1 réussi', JSON.stringify(await pos()));
  check(await W(() => Parcours.prog.badges.includes('Premier son')), 'Badge du chapitre 1');

  // Chapitre 2
  await page.click('#pc-nextch');
  check(JSON.stringify(await pos()) === '[1,0]', 'Chapitre suivant : chapitre 2');
  check(!(await locked('#p-lib')) && !(await locked('[data-ctl="A.cue"]')) && await locked('[data-ctl="A.trim"]'), 'Chapitre 2 : bibliothèque et cue débloqués, gain toujours verrouillé');
  await sleep(300); await press('A.play'); check(await stepIs(1, 1), 'Pause détectée');
  await press('A.play'); check(await stepIs(1, 2), 'Relance détectée');
  await sleep(500); await press('A.cue'); check(await stepIs(1, 3), 'CUE en lecture : retour au cue et arrêt');
  await W(() => decks[0].seek(12)); await press('A.cue'); check(await stepIs(1, 4), 'Nouveau point de cue posé');
  await press('A.cue'); check(await stepIs(1, 5), 'CUE maintenu : pré-écoute détectée');
  await W(() => controls.get('A.cue').release());
  await W(() => loadTo(decks[0], LIB.tracks[1])); check(await stepIs(1, 6), 'Morceau chargé depuis la bibliothèque');
  await press('A.play'); check(await wait(() => Parcours.prog.done[1]), 'Chapitre 2 réussi');

  // Chapitre 3
  await page.click('#pc-nextch');
  check(!(await locked('[data-ctl="A.trim"]')) && !(await locked('.mvu')), 'Chapitre 3 : gain et VU-mètres débloqués');
  await next();
  await set('A.trim', .9); check(await stepIs(2, 2), 'Gain au rouge détecté');
  await set('A.trim', .5); check(await stepIs(2, 3, 4000), 'Gain redescendu (tenu 1 s)');
  await next();
  await set('A.fader', 1); check(await wait(() => Parcours.prog.done[2], 8000), 'Chapitre 3 réussi : master hors du rouge 2 s', JSON.stringify(await pos()));

  // Chapitre 4
  await page.click('#pc-nextch');
  check(!(await locked('#p-deckB')) && !(await locked('[data-ctl="cuemix"]')), 'Chapitre 4 : platine B et casque débloqués');
  await next();
  await set('B.fader', 0); check(await stepIs(3, 2), 'Fader de B en bas');
  await press('B.cuech'); check(await stepIs(3, 3), 'CUE casque de B activé');
  await press('B.play'); check(await stepIs(3, 4), 'B lancé fader en bas');
  await set('cuemix', .9); check(await stepIs(3, 5), 'MIX casque à droite');
  await set('cuemix', .1); check(await stepIs(3, 6), 'MIX casque à gauche');
  await next();
  check(await W(() => Parcours.target === 'B.cuech'), 'Halo dynamique sur le CUE de B');
  await press('B.cuech'); await press('B.play');
  check(await wait(() => Parcours.prog.done[3]), 'Chapitre 4 réussi');

  // Chapitre 5 : rythme et exercice à l'oreille
  await page.click('#pc-nextch');
  check(!(await locked('#p-wave')) && await W(() => !document.querySelector('#coach-live').classList.contains('pc-hide')), 'Chapitre 5 : waveforms et compteur de phrases débloqués');
  await next();
  await press('A.play'); check(await stepIs(4, 2, 7000), '8 temps comptés');
  await next();
  await W(() => decks[0].seek(decks[0].timeOfBeat(26)));
  check(await stepIs(4, 4, 8000), 'Début de phrase détecté');
  check(await W(() => document.body.classList.contains('pc-blind')), 'À l’oreille : waveforms et BPM cachés');
  await W(() => new Promise(res => {
    // On tape à chaque passage d'un temps, comme une oreille parfaite.
    const d = decks[0]; let last = Math.floor(d.beatPos()), n = 0;
    const iv = setInterval(() => { const b = Math.floor(d.beatPos()); if (b !== last) { last = b; Parcours.tap(); if (++n >= 8) { clearInterval(iv); res(); } } }, 2);
  }));
  check(await stepIs(4, 5), '8 coups tapés');
  const ear = await W(() => Parcours.prog.ear.tap);
  check(ear && ear.score >= 60 && Math.abs(ear.bpm - ear.real) < 5, 'Note de l’exercice à l’oreille', JSON.stringify(ear));
  check(await W(() => !document.body.classList.contains('pc-blind') && !!document.querySelector('.pc-res .pc-big')), 'Waveforms révélées avec la note');
  await next();
  check(await wait(() => Parcours.prog.done[4]), 'Chapitre 5 réussi');

  // Passer une étape, glossaire.
  await page.click('#pc-nextch');
  await page.click('#pc-skip');
  check(JSON.stringify(await pos()) === '[5,1]' && await W(() => Parcours.prog.skips === 1), 'Passer l’étape : on avance sans pénalité');
  await page.click('.pc-now .pc-gl');
  check(await page.isVisible('.pc-pop') && (await page.textContent('.pc-pop')).length > 20, 'Glossaire : un mot cliquable ouvre sa définition', await page.textContent('.pc-pop'));
  await page.mouse.click(300, 900);
  check(!(await page.isVisible('.pc-pop')), 'Clic ailleurs : la définition se ferme');
  await page.click('#pc-gloss');
  check(await W(() => document.querySelectorAll('.pc-dl dt').length >= 30), 'Glossaire complet');
  await page.click('.pc-foot .go');

  // Carte des chapitres.
  await page.click('#pc-map');
  check(await W(() => document.querySelectorAll('.pc-tile').length === 14 && document.querySelectorAll('.pc-tile.d').length === 5), 'Carte : 14 chapitres, 5 validés');
  await page.click('.pc-foot .go');

  // 2. Reprise après rechargement.
  await W(() => Parcours.prog.time > 0);
  const before = await pos();
  await page.reload(); await ready(page);
  check(await W(() => Parcours.active && document.body.classList.contains('parcours')), 'Après rechargement : le parcours reprend');
  check(JSON.stringify(await pos()) === JSON.stringify(before), 'Même chapitre, même étape', JSON.stringify(before));
  check(!(await locked('#p-deckB')) && await locked('.dk-pitch'), 'Interface du chapitre 6 restaurée (B ouverte, pitch encore verrouillé)');
  check(await W(() => Object.keys(Parcours.prog.done).length === 5 && Parcours.prog.badges.length >= 5), 'Chapitres validés et badges conservés');
  check(!(await page.isVisible('.pc-wel')), 'Pas de carte de bienvenue au relancement');

  // 3. Quitter : tout revient.
  await page.click('#pc-exit');
  check(await W(() => !Parcours.active && !document.body.classList.contains('parcours') && !document.querySelector('.pc-lock,.pc-lockp,.pc-hide,.pc-target') && !Parcours.target), 'Quitter : interface complète, plus aucun verrou ni halo');
  check(await W(() => !document.querySelector('#p-lib').hidden && !document.querySelector('[data-ctl="A.trim"]').inert), 'Commandes de nouveau actives');
  check(await W(() => !!document.querySelector('#coach-body > .pc-card:first-child')), 'Le parcours ouvre la liste des leçons');
  check(await W(() => [...document.querySelectorAll('#coach-body .lcard:not(.pc-card) .mod')].map(e => e.textContent.slice(0, 9)).join() === 'Niveau 1 ,Niveau 2 ,Niveau 3 '), 'Leçons rangées par difficulté, la plus dure en dernier',
    await W(() => [...document.querySelectorAll('#coach-body .lcard b')].map(e => e.textContent).join(' | ')));

  // Leçons isolées : halo et LED sur la commande à toucher.
  await W(() => Coach.start('swap'));
  check(await wait(() => Coach.target === 'A.play' && controls.get('A.play').el.classList.contains('coach-target') && ledState('A.play') !== null), 'Leçon : halo sur ▶ de A', await W(() => Coach.target));
  await press('A.play');
  check(await wait(() => Coach.target === 'B.sync' && controls.get('B.sync').el.classList.contains('coach-target') && !controls.get('A.play').el.classList.contains('coach-target')), 'Leçon : le halo suit l’étape (SYNC de B)');
  await W(() => { Coach.L.active = null; Coach.render(); decks.forEach(d => d.pause()); });
  check(await wait(() => !Coach.target), 'Leçon fermée : plus de halo de leçon');

  // Un seul bouton Coach, avec son voyant ; le niveau des conseils est dans le panneau.
  check(await W(() => !document.getElementById('coachlive-btn') && !!document.querySelector('#coach-btn #coachlive-dot.on') && !!document.querySelector('#coach-direct select')), 'Bouton Coach unique, niveau des conseils dans le panneau');

  // Jargon des boutons : la définition s'affiche au survol.
  await page.hover('[data-ctl="A.slip"]'); await sleep(700);
  check(await page.isVisible('.pc-pop') && /Slip/.test(await page.textContent('.pc-pop')), 'Survol de SLIP : définition du glossaire', await page.textContent('.pc-pop'));
  check(await W(() => ['A.censor', 'A.keylock'].every(id => controls.get(id).el.dataset.gloss) && document.querySelector('#q-btn').dataset.gloss === 'quantize' && document.querySelector('.dk-grid>button:last-child').dataset.gloss === '1 ici'), 'CENSOR, KEY LOCK, QUANTIZE, « 1 ICI » expliqués');
  await page.mouse.move(5, 900); await sleep(100);

  // 4. Chapitre 14 : premier set, bilan à partir de l'historique des transitions.
  await W(() => Parcours.go(13, 0));
  check(!(await locked('#rec-btn')) && !(await locked('.dk-pads')), 'Chapitre 14 : interface complète');
  const n = await W(() => Parcours.P.steps.filter(s => s.k).length);
  check(n === 3, 'Avec 4 morceaux : 3 transitions', String(n));
  await next();
  await page.click('#pc-skip');
  await sleep(200);
  await press('A.play');
  check(await stepIs(13, 3), 'Premier morceau lancé');
  for (let k = 1; k <= 3; k++) {
    await W(new Function(`MixCoach.state.hist.unshift({from:'${k % 2 ? 'A' : 'B'}',to:'${k % 2 ? 'B' : 'A'}',title:LIB.tracks[${k}].title,bars:12+${k},score:${70 + k * 5},good:['Départ sur le 1 d’une phrase.'],tips:['Kicks décalés de 20 ms en moyenne : corrige plus tôt avec le nudge.'],at:new Date(Date.now()+${k})});`));
    check(await stepIs(13, 3 + k), `Transition ${k} prise en compte`);
  }
  check(await wait(() => Parcours.prog.done[13] && !!document.querySelector('#pc-sum')), 'Bilan du set affiché');
  const sum = await W(() => ({ avg: Parcours.summary().avg, n: document.querySelectorAll('.pc-tr').length, tl: document.querySelectorAll('.pc-tl li').length, txt: Parcours.summaryText() }));
  check(sum.avg === 80 && sum.n === 3 && sum.tl >= 1, 'Bilan : note moyenne, transitions, tracklist', JSON.stringify({ avg: sum.avg, n: sum.n, tl: sum.tl }));
  check(/Tracklist/.test(sum.txt) && /80\/100/.test(sum.txt) && /À travailler/.test(sum.txt), 'Résumé texte prêt à partager');
  await page.click('#pc-copy'); await sleep(200);
  check(await W(() => (Parcours.P.copied || '').startsWith('Mon premier set')), 'Bouton « Copier le résumé »');
  check(await W(() => Parcours.prog.badges.includes('Premier set') && Parcours.prog.sets.length === 1), 'Badge « Premier set » et set archivé');
  await page.screenshot({ path: '/tmp/parcours-bilan.png' });
  await ctx.close();

  // 5. « Je sais déjà mixer » : interface complète, choix mémorisé.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await ctx2.newPage();watch(p2);
  await p2.goto(url + '#welcome'); await ready(p2);
  await p2.click('#pc-pro');
  check(await p2.evaluate(() => store.get('welcome') === 'pro' && !Parcours.active && !document.querySelector('.pc-wel,.pc-lock,.pc-lockp')), 'Choix « Je sais déjà mixer » : interface complète, choix mémorisé');
  await p2.reload(); await ready(p2);
  check(!(await p2.isVisible('.pc-wel')), 'La carte de bienvenue ne revient pas');

  // 5 bis. « Je mixe déjà sur rekordbox » : disposition la plus proche, pas de parcours.
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p3 = await ctx3.newPage();watch(p3);
  await p3.goto(url + '#welcome'); await ready(p3);
  check(await p3.evaluate(() => document.querySelectorAll('.pc-fromb').length === 4), 'Accueil : choix Serato, rekordbox, Traktor, VirtualDJ');
  await p3.click('#pc-from-rekordbox');
  check(await p3.evaluate(() => store.get('welcome') === 'rekordbox' && layout.preset === 'export' && !Parcours.active && !document.querySelector('.pc-wel')), 'rekordbox : disposition Export, parcours sauté');
  await ctx3.close();

  // 5 ter. L'interface grandit vraiment : on compte, chapitre par chapitre, les commandes actives
  // (affichées, non grisées, cliquables) et celles visibles mais grisées.
  const ctx4 = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const p4 = await ctx4.newPage();watch(p4);
  await p4.goto(url + '#welcome'); await ready(p4);
  await p4.click('#pc-novice');
  const census = () => p4.evaluate(() => {
    const sel = 'button,input:not([type="file"]),select,summary,[data-ctl],label.tb';
    const act = [], grey = [];
    for (const e of document.querySelectorAll(sel)) {
      if (e.closest('#pc,.pc-wel,.pc-pop,#coach,.toast')) continue;
      if (e.parentElement && e.parentElement.closest('[data-ctl]')) continue;   // l'input d'un fader compte avec son fader
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (getComputedStyle(e).visibility === 'hidden') continue;
      if (e.closest('.pc-lockp')) continue;                                       // dans un panneau verrouillé (étiquette « Débloqué au chapitre N »)
      const id = e.dataset.ctl || e.id || (e.textContent || e.title || e.getAttribute('aria-label') || '').trim().slice(0, 18);
      if (e.closest('[inert]')) grey.push(id); else act.push(id);
    }
    return { act, grey, hidden: document.querySelectorAll('.pc-hide').length, lock: [...document.querySelectorAll('.pc-lock')].map(e => e.dataset.ctl || e.id || e.className) };
  });
  // plafond de commandes actives par chapitre (l'interface ne grandit qu'au rythme des leçons)
  const CAPS = [7, 20, 24, 32, 34, 34, 45, 60, 70, 110, 115, 140, 170, 999];
  const counts = [], hidesEarly = [], seen = {};
  for (let c = 0; c < 14; c++) {
    await p4.evaluate(c => Parcours.go(c, 0), c); await sleep(150);
    const r = await census(); seen[c] = r; counts.push(r.act.length);
    if (c < 4 && r.lock.some(x => !/\.jog$/.test(x))) hidesEarly.push('ch' + (c + 1) + ' grise ' + r.lock.filter(x => !/\.jog$/.test(x)).join(','));
  }
  const ch1 = seen[0];
  const ctl1 = ch1.act.filter(x => /^[A-D]\.|^master$|^xf$|^cue|^split$|^sampler/.test(x)).sort();
  check(JSON.stringify(ctl1) === JSON.stringify(['A.fader', 'A.play', 'master']), 'Chapitre 1 : seules les commandes enseignées sont actives (▶ A, fader A, master)', ctl1.join(','));
  check(ch1.act.every(x => /^(A\.fader|A\.play|master|pc-btn|coach-btn|coach-close|fs-btn|sp-wave|sp-lib)$/.test(x)), 'Chapitre 1 : rien d’autre de cliquable (ni Auto-mix, ni Contrôleur, ni Audio, ni Biblio, ni sélecteurs du mixer)', ch1.act.join(','));
  check(ch1.grey.every(x => /\.jog$/.test(x)), 'Chapitre 1 : les commandes avancées sont masquées, pas grisées (seule la platine reste visible)', ch1.grey.join(','));
  check(!hidesEarly.length, 'Chapitres 1 à 4 : on masque, on ne grise pas', hidesEarly.join(' | '));
  const adv = ['A.keylock', 'A.slip', 'A.rev', 'A.censor', 'am-btn', 'midi-btn', 'A.pad1', 'A.loop', 'A.tap', 'A.cup'];
  check([0, 1, 2, 3].every(c => adv.every(x => !seen[c].act.includes(x) && !seen[c].grey.includes(x))), 'KEY LOCK, SLIP, REV, CENSOR, AUTO-MIX, CONTRÔLEUR, pads, boucles, grille et rangée pro masqués aux chapitres 1 à 4');
  check(!seen[1].act.some(x => /^(Compatibles|Import \/ export|Infos|Colonnes|preview|Tous les morceaux)/.test(x)), 'Chapitre 2 : bibliothèque réduite à la recherche, à l’import et au chargement', seen[1].act.filter(x => !/^[AB]\./.test(x)).join(','));
  check(counts.every((n, i) => n <= CAPS[i]), 'Commandes actives sous le plafond de chaque chapitre', counts.join(' '));
  check(counts.every((n, i) => !i || n >= counts[i - 1]), 'L’interface ne fait que grandir d’un chapitre à l’autre', counts.join(' '));
  check(seen[4].grey.includes('A.keylock') && !seen[4].act.includes('A.keylock'), 'Chapitre 5 : les commandes à venir apparaissent grisées');
  check(seen[10].act.includes('A.keylock') && seen[11].act.includes('A.pad1') && seen[11].act.includes('A.slip') && seen[13].act.includes('am-btn'), 'Chaque commande se débloque à son chapitre (KEY LOCK 11, pads et SLIP 12, Auto-mix 14)', [10, 11, 13].map(c => seen[c].act.filter(x => /keylock|pad1|slip|am-btn/.test(x)).join('+')).join(' / '));
  // une commande reconstruite pendant le parcours (platine rechargée, bibliothèque redessinée) reste verrouillée
  await p4.evaluate(() => Parcours.go(0, 0)); await sleep(100);
  await p4.evaluate(() => { buildDeck(decks[0]); buildLib(); }); await sleep(150);
  const reb = await census();
  check(!reb.act.includes('A.keylock') && !reb.act.includes('A.pad1') && !reb.act.includes('A.cue'), 'Commandes reconstruites : de nouveau masquées', reb.act.join(','));
  await p4.evaluate(() => Parcours.exit()); await sleep(150);
  const all = await census();
  check(all.grey.length === 0 && ['A.keylock', 'A.slip', 'A.rev', 'A.censor', 'am-btn', 'midi-btn', 'A.pad1', 'B.play'].every(x => all.act.includes(x)) && all.act.length > counts[11], 'Sortie du parcours : toutes les commandes reviennent', all.act.length + ' actives');
  await ctx4.close();

  // 6. Tour complet : chaque étape des 14 chapitres s'affiche, cible une commande qui existe, et se passe.
  const bad = [];
  for (let c = 0; c < 14; c++) {
    await p2.evaluate(c => Parcours.go(c, 0), c);
    const ns = await p2.evaluate(() => Parcours.P.steps.length);
    for (let i = 0; i < ns; i++) {
      await sleep(50);
      const r = await p2.evaluate(() => { const s = Parcours.P.steps[Parcours.prog.step]; let tg = null; try { tg = typeof s.target === 'function' ? s.target(Parcours.P.st) : s.target; } catch (e) { return 'cible en erreur : ' + e.message; } if (!tg) return null; const el = /^[#.\[]/.test(tg) ? document.querySelector(tg) : (controls.get(tg) || {}).el; if (!el) return 'cible introuvable : ' + tg; if (el.closest('.pc-hide,.pc-lock,.pc-lockp')) return 'cible encore verrouillée : ' + tg; return null; });
      if (r) bad.push(`ch${c + 1} étape ${i + 1} ${r}`);
      await p2.evaluate(() => Parcours.skip());
    }
  }
  check(!bad.length && await p2.evaluate(() => Object.keys(Parcours.prog.done).length === 14), 'Les 14 chapitres se parcourent sans erreur, toutes les cibles existent', bad.join(' | '));
  await p2.evaluate(() => Parcours.exit());
  check(await p2.evaluate(() => !document.querySelector('.pc-lock,.pc-lockp,.pc-hide,.pc-blind') && !document.body.classList.contains('pc-blind')), 'Sortie propre après le tour complet');
  await ctx2.close();

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Parcours : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
