'use strict';
// Interface live sur portable : à chaque preset, en 2 et 4 platines, en 1600×950, 1366×768
// et 1280×800, rien ne défile et tout ce qui compte reste visible (Play, crossfader, 5 lignes
// de bibliothèque, titres lisibles). Puis : séparateurs retenus, tailles de platine,
// bibliothèque plein écran, zoom, mode scène, contraste, polices locales, temps d'image.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const SHOTS = '/tmp/mixlab-layout/';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };
const PRESETS = ['perf', 'export', 'studio', 'mix', 'ecole'];
const SIZES = [[1600, 950], [1366, 768], [1280, 800]];
const LONG = ['Une très longue nuit au bord de la mer (Extended Mix)', 'Les lumières de la ville ne s’éteignent jamais', 'Halogène, version club remasterisée', 'Ligne 7 direction Mairie des Lilas'];

const errors = [], fontReq = [];
async function open(browser, w, h, store, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: opts.dpr || 1 });
  // Les polices viennent de app/fonts : tout appel à Google Fonts est bloqué et compté.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => { fontReq.push(r.request().url()); r.abort(); });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/AudioContext/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(s => {
    if (sessionStorage.getItem('init')) return; sessionStorage.setItem('init', '1');
    localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem('mixlab2.' + k, JSON.stringify(v));
  }, { onboarded: true, ...store });
  await page.goto(url);
  await ready(page);
  return page;
}
async function ready(page) {
  await page.waitForFunction(() => typeof LIB !== 'undefined' && LIB.tracks.length >= 4 && decks[3].track && window.View && View.state.cur, null, { timeout: 30000 });
  // une vraie bibliothèque : 30 morceaux de plus, et des titres longs sur les platines
  await page.evaluate(long => {
    for (let i = 0; i < 30; i++) { const t = LIB.tracks[i % 4]; LIB.tracks.push({ ...t, id: 9000 + i, title: t.title + ' (version ' + (i + 1) + ')', demo: false, hot: t.hot.slice() }); }
    decks.forEach((d, i) => { d.track.title = long[i]; d.ui.title.textContent = long[i]; });
    renderSide(); renderTable(); View.fit();
  }, LONG);
  await sleep(250);
}
// Mesures prises dans la page : défilement, visibilité réelle (rien par-dessus), lignes, titres.
const measure = page => page.evaluate(() => {
  const inView = e => { if (!e || !e.isConnected) return false; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    if (r.top < -0.5 || r.left < -0.5 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5) return false;
    const x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y); return !!hit && (hit === e || e.contains(hit) || hit.contains(e)); };
  const A = document.querySelector('#app'), tw = document.querySelector('#p-lib .tw'), twr = tw.getBoundingClientRect();
  const rows = [...document.querySelectorAll('#p-lib tbody tr')].filter(r => { const b = r.getBoundingClientRect(); return b.height > 0 && b.top >= twr.top - 0.5 && b.bottom <= Math.min(twr.bottom, innerHeight) + 0.5; }).length;
  const act = decks.filter(d => d.active);
  const titles = act.map(d => { const t = d.ui.title, n = t.textContent.length; return t.scrollWidth > t.clientWidth + 1 ? Math.floor(t.clientWidth / (t.scrollWidth / n)) : n; });
  return {
    page: [document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight], app: [A.scrollHeight, A.clientHeight],
    plays: act.map(d => inView(d.ui.b.play)), xf: inView(document.querySelector('[data-ctl=xf] input')), mixer: !document.querySelector('#p-mixer').hidden,
    rows, titles, sizes: act.map(d => (d.ui.panel.className.match(/sz-(\w+)/) || [])[1]), lib: Math.round(document.querySelector('#p-lib').getBoundingClientRect().height),
  };
});

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  /* ---------- 1. Matrice presets × platines × tailles d'écran ---------- */
  for (const [w, h] of SIZES) for (const preset of PRESETS) for (const n of [2, 4]) {
    const page = await open(browser, w, h, { preset, decks: n });
    const m = await measure(page), tag = `${preset} ${n} pl. ${w}×${h}`;
    const okScroll = m.page[0] <= m.page[2] && m.page[1] <= m.page[2] && m.app[0] <= m.app[1] + 1;
    const okPlays = m.plays.length === n && m.plays.every(Boolean), okXf = !m.mixer && preset === 'export' ? true : m.xf;
    const okRows = m.rows >= 5, okTitles = m.titles.every(c => c > 2);
    check(okScroll && okPlays && okXf && okRows && okTitles, tag + ' : tout tient, Play, crossfader, 5 lignes, titres lisibles',
      `page ${m.page[0]}/${m.page[2]}, play ${m.plays.map(Number).join('')}, xf ${m.mixer ? Number(m.xf) : '—'}, lignes ${m.rows}, titres ${m.titles.join('/')}, platines ${m.sizes.join(',')}, biblio ${m.lib}px`);
    if (w === 1366) await page.screenshot({ path: SHOTS + `${preset}-${n}-1366x768.png` });
    if (w === 1366 && n === 2) check(m.lib >= 0.3 * h, tag + ' : bibliothèque ≥ 30 % de la hauteur par défaut', m.lib + ' px');
    if (h < 800) check(!m.sizes.includes('full') || preset === 'studio', tag + ' : platines réduites automatiquement sous 800 px', m.sizes.join(','));
    await page.context().close();
  }

  /* ---------- 2. Séparateurs : glisser, retenu par preset, double-clic ---------- */
  let page = await open(browser, 1366, 768, { preset: 'mix', decks: 2 });
  const libH = () => page.evaluate(() => Math.round(document.querySelector('#p-lib').getBoundingClientRect().height));
  const box = async sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const drag = async (sel, dy) => { const b = await box(sel); await page.mouse.move(b.x, b.y); await page.mouse.down(); for (let i = 1; i <= 6; i++) { await page.mouse.move(b.x, b.y + dy * i / 6); await sleep(30); } await page.mouse.up(); await sleep(150); };
  const h0 = await libH();
  await drag('#sp-lib', -90);
  const h1 = await libH();
  check(h1 > h0 + 40, 'Séparateur bibliothèque glissé vers le haut : la bibliothèque grandit', `${h0} → ${h1} px`);
  check((await measure(page)).plays.every(Boolean), 'Après le glisser : les Play restent visibles');
  const lane0 = await page.evaluate(() => Math.round(document.querySelector('#lane-A').getBoundingClientRect().height));
  await drag('#sp-wave', 30);
  const lane1 = await page.evaluate(() => Math.round(document.querySelector('#lane-A').getBoundingClientRect().height));
  check(lane1 > lane0, 'Séparateur des waveforms : les waveforms grandissent', `${lane0} → ${lane1} px`);
  const h2 = await libH();
  await page.reload(); await ready(page);
  const h3 = await libH(), lane2 = await page.evaluate(() => Math.round(document.querySelector('#lane-A').getBoundingClientRect().height));
  check(Math.abs(h3 - h2) <= 6 && Math.abs(lane2 - lane1) <= 3, 'Tailles retenues après rechargement', `biblio ${h2} → ${h3} px, waveform ${lane1} → ${lane2} px`);
  await page.click('#presets button[data-p=studio]'); await sleep(200);
  const hs = await libH();
  await page.click('#presets button[data-p=mix]'); await sleep(200);
  check(Math.abs((await libH()) - h3) <= 6, 'Chaque preset garde ses propres séparateurs', `Studio ${hs} px, retour Mix ${await libH()} px`);
  await page.dblclick('#sp-lib'); await page.dblclick('#sp-wave'); await sleep(200);
  check(Math.abs((await libH()) - h0) <= 8 && await page.evaluate(() => !View.state.splits['mix:2'].lib && !View.state.splits['mix:2'].lane), 'Double-clic : tailles par défaut', `${await libH()} px (défaut ${h0})`);

  /* ---------- 3. Tailles de platine au clic sur l'en-tête ---------- */
  const sizeA = () => page.evaluate(() => (decks[0].ui.panel.className.match(/sz-(\w+)/) || [])[1]);
  const seen = [await sizeA()];
  for (let i = 0; i < 3; i++) { await page.click('#p-deckA .dk-head .dk-title'); await sleep(150); seen.push(await sizeA()); }
  check(new Set(seen).size >= 2 && seen.includes('mini'), 'Clic sur l’en-tête : la platine change de taille', seen.join(' → '));
  check((await measure(page)).plays.every(Boolean), 'Toujours tout visible après les changements de taille');
  await page.click('#p-deckA .dk-head .dk-title'); await sleep(150);
  const chosen = await page.evaluate(() => View.state.sizes['mix:2']), before = await sizeA();
  await page.reload(); await ready(page);
  check(chosen && (await sizeA()) === before, 'Taille de platine retenue après rechargement', `${chosen} → ${await sizeA()}`);
  await page.evaluate(() => View.setSize('auto', true));

  /* ---------- 4. Bibliothèque plein écran ---------- */
  await page.mouse.click(683, 5);
  await page.keyboard.press('Tab'); await sleep(200);
  let lf = await page.evaluate(() => ({ on: document.querySelector('#app').classList.contains('lib-full'), lib: document.querySelector('#p-lib').getBoundingClientRect().height, deck: !!document.querySelector('#p-deckA').offsetParent, btn: document.querySelector('#lib-btn').getAttribute('aria-pressed') }));
  check(lf.on && !lf.deck && lf.lib > 768 * 0.7 && lf.btn === 'true', 'Tab : bibliothèque plein écran', `${Math.round(lf.lib)} px`);
  await page.screenshot({ path: SHOTS + 'bibliotheque-plein-ecran-1366x768.png' });
  await page.keyboard.press('Escape'); await sleep(200);
  lf = await page.evaluate(() => ({ on: document.querySelector('#app').classList.contains('lib-full'), deck: !!document.querySelector('#p-deckA').offsetParent }));
  check(!lf.on && lf.deck, 'Échap : retour aux platines');
  await page.click('#lib-btn'); await sleep(150);
  const viaBtn = await page.evaluate(() => document.querySelector('#app').classList.contains('lib-full'));
  await page.click('#lib-btn'); await sleep(150);
  check(viaBtn && !(await page.evaluate(() => View.libFull)), 'Bouton Biblio : aller et retour');

  /* ---------- 5. Zoom de l'interface ---------- */
  await page.keyboard.press('Control+Equal'); await page.keyboard.press('Control+Equal'); await sleep(250);
  let z = await page.evaluate(() => ({ z: View.zoom, sh: document.documentElement.scrollHeight, ih: innerHeight }));
  check(Math.abs(z.z - 1.2) < 0.01 && z.sh <= z.ih, 'Ctrl + : zoom 120 %, toujours sans défilement', JSON.stringify(z));
  check((await measure(page)).plays.every(Boolean), 'Zoom 120 % : les Play restent visibles');
  await page.screenshot({ path: SHOTS + 'zoom-120-1366x768.png' });
  // le zoom doit être écrit avant de recharger (sinon on teste la course, pas la sauvegarde)
  await page.waitForFunction(() => localStorage.getItem('mixlab2.uiZoom') === '1.2', null, { timeout: 3000 }).catch(() => {});
  await page.reload(); await ready(page);
  const zr = await page.evaluate(() => ({ zoom: View.zoom, stored: localStorage.getItem('mixlab2.uiZoom') }));
  check(Math.abs(zr.zoom - 1.2) < 0.01, 'Zoom retenu après rechargement', JSON.stringify(zr));
  const crisp = await page.evaluate(() => { const c = decks[0].ui.lane, r = c.getBoundingClientRect(); return [c.width, Math.round(r.width * devicePixelRatio)]; });
  check(Math.abs(crisp[0] - crisp[1]) <= 1, 'Canvas net au zoom : 1 pixel du canvas par pixel de l’écran', crisp.join(' / '));
  await page.keyboard.press('Control+Digit0'); await sleep(150);
  check((await page.evaluate(() => View.zoom)) === 1, 'Ctrl 0 : retour à 100 %');
  // zoom des waveforms : Ctrl + molette sur une lane
  const wz = await page.evaluate(() => ui.zoom), lb = await box('#lane-A');
  await page.mouse.move(lb.x, lb.y); await page.keyboard.down('Control'); await page.mouse.wheel(0, 200); await page.keyboard.up('Control'); await sleep(100);
  check((await page.evaluate(() => ui.zoom)) > wz && (await page.evaluate(() => View.zoom)) === 1, 'Ctrl + molette sur la waveform : zoom de la waveform seulement', `${wz} → ${await page.evaluate(() => ui.zoom)} s`);
  await page.context().close();

  // écran Retina : canvas à la densité de l'écran
  page = await open(browser, 1366, 768, { preset: 'perf', decks: 4 }, { dpr: 2 });
  const ret = await page.evaluate(() => { const c = decks[0].ui.lane, r = c.getBoundingClientRect(); return [c.width, Math.round(r.width * 2)]; });
  check(Math.abs(ret[0] - ret[1]) <= 1, 'Écran ×2 : waveform à 2 pixels par point', ret.join(' / '));
  await page.context().close();

  /* ---------- 6. Mode scène, tailles de texte, contraste ---------- */
  page = await open(browser, 1366, 768, { preset: 'mix', decks: 2 });
  const fontStats = () => page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), sizes = new Map();
    for (let t; (t = w.nextNode());) {
      if (!t.textContent.trim()) continue; const e = t.parentElement; if (!e || e.closest('script,style,[hidden],option,#loading,.toasts')) continue;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      const fs = parseFloat(cs.fontSize); if (!sizes.has(fs)) sizes.set(fs, e.className || e.tagName); }
    const min = Math.min(...sizes.keys()); return { min, where: sizes.get(min) };
  });
  const normal = await fontStats();
  await page.evaluate(() => View.setStage(true)); await sleep(250);
  const stage = await fontStats();
  check(stage.min >= 11 && stage.min > normal.min, 'Mode scène : aucun texte sous 11 px', `normal ${normal.min} px (${normal.where}), scène ${stage.min} px (${stage.where})`);
  const big = await page.evaluate(() => [parseFloat(getComputedStyle(decks[0].ui.bpm).fontSize), parseFloat(getComputedStyle(decks[0].ui.time).fontSize)]);
  check(big[0] >= 26 && big[1] >= 20, 'Mode scène : BPM et temps restant agrandis', big.join(' / ') + ' px');
  check((await measure(page)).plays.every(Boolean) && (await measure(page)).page[0] <= 768, 'Mode scène : tout tient encore');
  await page.screenshot({ path: SHOTS + 'mode-scene-1366x768.png' });
  const contrast = () => page.evaluate(() => {
    const lum = c => { const m = c.match(/[\d.]+/g).map(Number); return m.slice(0, 3).map(v => v / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0); };
    const bgOf = e => { const out = []; for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); const g = cs.backgroundImage.match(/rgba?\([^)]+\)/g); if (g) out.push(...g); if (!/rgba?\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) { out.push(cs.backgroundColor); break; } } return out.length ? out : ['rgb(0,0,0)']; };
    const ratio = e => { const fg = lum(getComputedStyle(e).color); return Math.min(...bgOf(e).map(b => { const l = lum(b); return (Math.max(fg, l) + .05) / (Math.min(fg, l) + .05); })); };
    const sel = ['.dk-stat .lbl', '.kn span', '.lt th', '.side .sec', '#p-mixer .ch .kn span', '.pad', '.lbl', '.tb', '.dk-artist', '.libbar .count', '.xfa button'];
    return sel.map(s => { const e = [...document.querySelectorAll(s)].find(x => x.offsetParent && x.textContent.trim()); return e ? [s, +ratio(e).toFixed(2)] : [s, null]; }).filter(x => x[1] != null);
  });
  await page.evaluate(() => View.setStage(false)); await sleep(150);
  const cN = await contrast();
  check(cN.every(([, r]) => r >= 4.5), 'Contraste des libellés ≥ 4,5:1 (mode normal)', cN.map(([s, r]) => s + ' ' + r).join(', '));
  await page.evaluate(() => View.setStage(true)); await sleep(150);
  const cS = await contrast();
  check(cS.every(([, r]) => r >= 7), 'Contraste des libellés ≥ 7:1 (mode scène)', cS.map(([s, r]) => s + ' ' + r).join(', '));
  await page.evaluate(() => View.setStage(false));

  /* ---------- 7. Polices locales ---------- */
  const fonts = await page.evaluate(async () => { await document.fonts.ready; const f = [...document.fonts]; return { loaded: [...new Set(f.filter(x => x.status === 'loaded').map(x => x.family.replace(/"/g, '')))], faces: f.filter(x => x.status === 'loaded').length }; });
  const onDisk = ['inter-latin-400-normal.woff2', 'inter-latin-600-normal.woff2', 'jetbrains-mono-latin-500-normal.woff2', 'OFL-Inter.txt', 'OFL-JetBrainsMono.txt'].every(f => fs.existsSync(path.resolve(__dirname, '..', 'app', 'fonts', f)));
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'app', 'index.html'), 'utf8');
  check(onDisk && !/fonts\.googleapis/.test(css) && /url\(fonts\/inter-latin-400-normal\.woff2\)/.test(css) && fonts.loaded.includes('Inter') && fonts.loaded.includes('JetBrains Mono') && fontReq.length === 0, 'Polices Inter et JetBrains Mono chargées depuis app/fonts, aucun appel à Google Fonts', JSON.stringify({ ...fonts, google: fontReq.length }));

  /* ---------- 8. Presets : panneaux propres ---------- */
  await page.click('#presets button[data-p=export]'); await sleep(250);
  const prep = await page.evaluate(() => ({ prep: !!document.querySelector('#p-prep').offsetParent, hot: document.querySelectorAll('#p-prep .pp-list li').length, mixer: !!document.querySelector('#p-mixer').offsetParent, fx: !!document.querySelector('#p-fx').offsetParent, big: decks[0].ui.panel.classList.contains('big'), dw: !!decks[0].ui.dw.parentElement.offsetParent }));
  check(prep.prep && prep.hot >= 8 && !prep.mixer && !prep.fx && prep.big && prep.dw, 'Préparation : grand lecteur, waveform, cues et grille ; ni mixer ni effets', JSON.stringify(prep));
  await page.evaluate(() => { decks[0].seek(4); }); await page.click('#p-prep .pp-list li:first-child .pp-go'); await sleep(150);
  check(await page.evaluate(() => decks[0].track.hot[0] != null), 'Préparation : « Poser ici » pose le hot cue 1');
  await page.click('#p-deckB .dk-head .dk-title'); await sleep(250);
  check(await page.evaluate(() => decks[1].ui.panel.classList.contains('big')), 'Préparation : clic sur l’en-tête d’une autre platine = grand lecteur');
  await page.click('#presets button[data-p=mix]'); await sleep(250);
  const mix = await page.evaluate(() => ({ side: !!document.querySelector('#p-side').offsetParent, tabs: document.querySelectorAll('#p-side [role=tab]').length, beat: !!document.querySelector('.beatrow').offsetParent }));
  check(mix.side && mix.tabs >= 2 && mix.beat, 'Mix : panneau latéral à onglets et compteur de temps au-dessus des waveforms', JSON.stringify(mix));
  await page.click('#presets button[data-p=ecole]'); await sleep(250);
  const ec = await page.evaluate(() => ({ coach: !!document.querySelector('#p-coach').offsetParent, w: document.querySelector('#p-coach').getBoundingClientRect().width / innerWidth, grid: !!document.querySelector('#p-deckA .dk-grid').offsetParent }));
  check(ec.coach && ec.w > 0.2 && ec.w < 0.32 && !ec.grid, 'École : coach à droite (environ un quart), moins de commandes', JSON.stringify(ec));
  await page.context().close();

  /* ---------- 9. Waveforms : cache par tuiles et temps d'image, 4 platines en lecture ---------- */
  page = await open(browser, 1366, 768, { preset: 'perf', decks: 4 });
  await page.mouse.click(683, 5);
  await page.evaluate(() => decks.forEach(d => !d.playing && d.togglePlay()));
  await sleep(1000);
  const cache = await page.evaluate(() => new Promise(res => { const c = decks[0].ui.lane, a = c._wc; requestAnimationFrame(() => requestAnimationFrame(() => res({ same: c._wc === a && !!a, tiles: a ? a.t.size : 0 }))); }));
  check(cache.same && cache.tiles >= 1 && cache.tiles <= 4, 'Waveform en tuiles : réutilisées d’une image à l’autre', JSON.stringify(cache));
  const perf = await page.evaluate(() => new Promise(res => {
    const js = [], raf = []; const of = window.frame; window.frame = function () { const t = performance.now(); of(); js.push(performance.now() - t); };
    let l = performance.now(); const tick = () => { const n = performance.now(); raf.push(n - l); l = n; if (raf.length < 240) requestAnimationFrame(tick); else { window.frame = of;
      const st = a => { a = a.slice().sort((x, y) => x - y); return { moy: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +a[Math.floor(a.length * .95)].toFixed(2) }; };
      res({ frame: st(js), raf: st(raf.slice(5)), plus20: raf.filter(x => x > 20).length }); } };
    requestAnimationFrame(tick); }));
  console.log('     temps d’image, 4 platines en lecture, 1366×768 :', JSON.stringify(perf));
  check(perf.frame.moy < 12, 'Boucle d’affichage légère (moyenne de frame() < 12 ms)', perf.frame.moy + ' ms');
  await page.context().close();

  check(errors.length === 0, 'Aucune erreur dans la page', errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log(failed ? failed + ' échec(s)' : 'Tout est bon');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
