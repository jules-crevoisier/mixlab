'use strict';
// Test de fumée : l'interface démarre sans erreur, l'import de dossier, la bibliothèque
// persistante et le routage casque fonctionnent (le pont natif est simulé).
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');

// Pont natif simulé : un « dossier » contenant un WAV de 8 s à 120 BPM.
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
      platform: 'test',
      pickFiles: async () => [f], pickFolder: async () => [f],
      readFile: async () => wav(), exists: async p => p === f.path,
      droppedPath: async () => null,
      loadLibrary: async () => window.__saved ? JSON.parse(window.__saved) : null,
      saveLibrary: async j => { window.__saved = j; return true; },
    };
  })();`;

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };

  // 1. Premier lancement : import d'un dossier, pose d'un cue, sauvegarde.
  let page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(fakeNative(null));
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.length >= 4 && decks[0].track, null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Dossier' }).click();
  await page.waitForFunction(() => LIB.tracks.some(t => t.path), null, { timeout: 30000 });
  const imported = await page.evaluate(() => { const t = LIB.tracks.find(t => t.path); t.cue = 2.5; t.hot[0] = 1; LIB.playlists[1].ids.push(t.id); return { title: t.title, artist: t.artist, bpm: t.bpm }; });
  console.log('import', imported);
  if (imported.title !== 'Kick 120' || imported.artist !== 'Testeur') fail('titre ou artiste mal lus');
  if (Math.abs(imported.bpm - 120) > 1) fail('BPM détecté ' + imported.bpm);
  await page.evaluate(() => Desktop.save());
  const saved = await page.evaluate(() => window.__saved);
  if (!saved || !saved.includes('Kick 120')) fail('bibliothèque non sauvegardée');

  // Import en double refusé.
  await page.getByRole('button', { name: 'Dossier' }).click();
  await page.waitForTimeout(500);
  if (await page.evaluate(() => LIB.tracks.filter(t => t.path).length) !== 1) fail('doublon importé');

  // Fenêtre Audio et routage casque sur une deuxième sortie.
  await page.click('#audio-btn');
  if (!(await page.isVisible('#audio-modal'))) fail('fenêtre Audio absente');
  const route = await page.evaluate(async () => {
    const ok = await Desktop.setHeadphones('default');
    const r1 = { ok, hp: S.hpDevice, split: S.split, dest: !!bus.hpDest };
    setSplit(true);
    const r2 = { hp: S.hpDevice, split: S.split };
    await Desktop.setHeadphones('');
    return { r1, r2, after: S.hpDevice };
  });
  console.log('routage', JSON.stringify(route));
  if (route.r1.ok && (route.r1.hp !== 'default' || !route.r1.dest)) fail('casque non routé');
  if (route.r2.hp !== null || !route.r2.split) fail('split ne reprend pas la main');
  await page.close();

  // 2. Relance : la bibliothèque revient avec ses cues et sa playlist.
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(fakeNative(saved));
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.some(t => t.path), null, { timeout: 60000 });
  const back = await page.evaluate(() => { const t = LIB.tracks.find(t => t.path); return { cue: t.cue, hot0: t.hot[0], inWarm: LIB.playlists[1].ids.includes(t.id) }; });
  console.log('relance', back);
  if (back.cue !== 2.5 || back.hot0 !== 1 || !back.inWarm) fail('cues ou playlist perdus à la relance');
  await page.close();

  // 3. Navigateur sans pont natif : le bouton Importer classique reste là.
  page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.length >= 2, null, { timeout: 60000 });
  if (!(await page.isVisible('label.filebtn'))) fail('bouton Importer absent en mode navigateur');

  await browser.close();
  if (errors.length) fail('erreurs JS : ' + errors.join(' | '));
  console.log(process.exitCode ? 'Échec' : 'OK');
})().catch(e => { console.error(e); process.exit(1); });
