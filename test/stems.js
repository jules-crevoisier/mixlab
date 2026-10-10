'use strict';
// Test des stems : un morceau synthétisé ici (grosse caisse, basse, voix à formants, charleston,
// nappe stéréo) est séparé, chaque stem est comparé à sa vraie source, puis on joue :
// mute, a cappella, instrumental, écho out, effets par stem, swap entre platines, pads.
// Ensuite le cache (second chargement) et la lecture d'un .stem.mp4 fabriqué ici (Opus).
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };

// Outils dans la page : synthèse des sources, WAV stéréo, mesures.
const helpers = () => {
  window.__synth = (sec) => {
    const sr = ctx.sampleRate, n = Math.round(sr * sec), B = 60 / 124, TAU = 2 * Math.PI;
    const S = { voc: [new Float32Array(n), new Float32Array(n)], drums: [new Float32Array(n), new Float32Array(n)], bass: [new Float32Array(n), new Float32Array(n)], mel: [new Float32Array(n), new Float32Array(n)] };
    let seed = 7; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
    const add = (k, i, l, r) => { S[k][0][i] += l; S[k][1][i] += r; };
    for (let b = 0; b * B < sec; b++) {
      const s0 = Math.round(b * B * sr);
      for (let i = 0; i < .35 * sr && s0 + i < n; i++) { const t = i / sr, x = .9 * Math.sin(TAU * (48 * t + (110 / 30) * (1 - Math.exp(-30 * t)))) * Math.exp(-9 * t) * Math.min(1, t / .002); add('drums', s0 + i, x, x); }
      const h0 = Math.round((b * B + B / 2) * sr); let p = 0;
      for (let i = 0; i < .06 * sr && h0 + i < n; i++) { const v = rnd(), y = (v - p) * .25 * Math.exp(-i / sr * 70); p = v; add('drums', h0 + i, y, y); }
      const f = [55, 55, 65.41, 49][Math.floor(b / 4) % 4], len = B * .45;
      for (let i = 0; i < len * sr && h0 + i < n; i++) { const t = i / sr; let s = 0; for (let k = 1; k <= 3; k++) s += Math.sin(TAU * f * k * t) / k; s *= .45 * Math.min(1, t * 300) * Math.exp(-t * 3) * Math.min(1, (len - t) * 200); add('bass', h0 + i, s, s); }
    }
    // voix « chantée » : harmoniques d'une fondamentale avec vibrato, filtrées par 3 formants (voyelle a)
    const notes = [220, 246.94, 261.63, 293.66, 261.63, 246.94, 220, 196], F = [[800, 80, 1], [1150, 90, .5], [2900, 120, .25]];
    const env = f => F.reduce((a, [c, w, g]) => a + g * Math.exp(-(((f - c) / w) ** 2) / 2), 0) + .02;
    const ph = new Float64Array(30);
    for (let i = 0; i < n; i++) {
      const t = i / sr, ni = Math.floor(t / .55), tt = t - ni * .55, f0 = notes[ni % 8] * Math.pow(2, .35 / 12 * Math.sin(TAU * 5.5 * t));
      let s = 0; for (let k = 1; k <= 28; k++) { ph[k] += TAU * f0 * k / sr; if (f0 * k > 8000) break; s += Math.sin(ph[k]) * env(f0 * k) / Math.sqrt(k); }
      const e = tt < .45 ? Math.min(1, tt / .03) * Math.min(1, (.45 - tt) / .05) : 0; s *= .25 * e; add('voc', i, s, s);
    }
    // mélodie : nappe large, désaccordée entre gauche et droite, tenue 2 mesures
    const ch = [[261.63, 329.63, 392], [220, 261.63, 329.63]];
    for (let i = 0; i < n; i++) { const t = i / sr, c = ch[Math.floor(t / (8 * B)) % 2]; let l = 0, r = 0; for (const f of c) { l += Math.sin(TAU * f * t) + .5 * Math.sin(TAU * 2 * f * 1.003 * t); r += Math.sin(TAU * f * 1.004 * t + 1) + .5 * Math.sin(TAU * 2 * f * t + 2); } add('mel', i, .05 * l, .05 * r); }
    const L = new Float32Array(n), R = new Float32Array(n);
    for (const k in S) for (let i = 0; i < n; i++) { L[i] += S[k][0][i]; R[i] += S[k][1][i]; }
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    const g = .9 / pk; for (const k in S) for (const c of S[k]) for (let i = 0; i < n; i++) c[i] *= g;
    for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
    return { S, L, R, sr, n };
  };
  // WAV 32 bits flottants : le morceau décodé est identique à la synthèse
  window.__wavF = (L, R, sr) => {
    const n = L.length, b = new ArrayBuffer(44 + n * 8), v = new DataView(b);
    const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 8, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 3, true); v.setUint16(22, 2, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 8, true);
    v.setUint16(32, 8, true); v.setUint16(34, 32, true); s(36, 'data'); v.setUint32(40, n * 8, true);
    for (let i = 0; i < n; i++) { v.setFloat32(44 + i * 8, L[i], true); v.setFloat32(48 + i * 8, R[i], true); }
    return b;
  };
  // part d'énergie d'un signal passé par un filtre (rendu hors ligne)
  window.__band = async (x, type, f) => {
    const sr = ctx.sampleRate, oc = new OfflineAudioContext(1, x.length, sr), b = oc.createBuffer(1, x.length, sr); b.copyToChannel(x, 0);
    const s = oc.createBufferSource(); s.buffer = b; const q = oc.createBiquadFilter(); q.type = type; q.frequency.value = f; q.Q.value = .707;
    const q2 = oc.createBiquadFilter(); q2.type = type; q2.frequency.value = f; q2.Q.value = .707;
    s.connect(q); q.connect(q2); q2.connect(oc.destination); s.start();
    const y = (await oc.startRendering()).getChannelData(0); let a = 0, e = 0;
    for (let i = 0; i < x.length; i++) { a += x[i] * x[i]; e += y[i] * y[i]; }
    return e / (a || 1e-12);
  };
  window.__goertzel = (x, f, sr, a0 = 0, a1 = x.length) => { const c = 2 * Math.cos(2 * Math.PI * f / sr); let s1 = 0, s2 = 0; for (let i = a0; i < a1; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; } return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / (a1 - a0); };
  window.__rms = async (an, ms) => {
    const b = new Float32Array(an.fftSize); let s = 0, n = 0; const t = performance.now();
    while (performance.now() - t < ms) { an.getFloatTimeDomainData(b); for (const v of b) s += v * v; n += b.length; await new Promise(r => setTimeout(r, 20)); }
    return Math.sqrt(s / Math.max(1, n));
  };
  // MP4 minimal : ftyp, moov (une piste audio par entrée), udta/stem (JSON), mdat
  window.__mp4 = (tracks, stemJson) => {
    const enc = new TextEncoder();
    const cat = (...a) => { const p = a.flat(Infinity).map(x => x instanceof Uint8Array ? x : typeof x === 'string' ? enc.encode(x) : Uint8Array.of(x)); const o = new Uint8Array(p.reduce((s, x) => s + x.length, 0)); let k = 0; for (const x of p) { o.set(x, k); k += x.length; } return o; };
    const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], u16 = v => [(v >> 8) & 255, v & 255];
    const box = (t, ...c) => { const b = cat(...c); return cat(u32(b.length + 8), t, b); };
    const full = (t, v, f, ...c) => box(t, [v, (f >> 16) & 255, (f >> 8) & 255, f & 255], ...c);
    const matrix = [...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];
    const build = offs => {
      const traks = tracks.map((t, i) => {
        const n = t.chunks.length, dur = n * t.frame;
        const entry = t.kind === 'opus'
          ? box('Opus', [0, 0, 0, 0, 0, 0], u16(1), [0, 0, 0, 0, 0, 0, 0, 0], u16(2), u16(16), u16(0), u16(0), u32(48000 * 65536), box('dOps', [0, 2], u16(t.preSkip), u32(48000), u16(0), [0]))
          : box('mp4a', [0, 0, 0, 0, 0, 0], u16(1), [0, 0, 0, 0, 0, 0, 0, 0], u16(2), u16(16), u16(0), u16(0), u32(44100 * 65536),
            full('esds', 0, 0, [3, 25], u16(i + 1), [0], [4, 17, 0x40, 0x15, 0, 0, 0], u32(128000), u32(128000), [5, 2, 0x12, 0x10], [6, 1, 2]));
        const stbl = box('stbl', full('stsd', 0, 0, u32(1), entry), full('stts', 0, 0, u32(1), u32(n), u32(t.frame)), full('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1)),
          full('stsz', 0, 0, u32(0), u32(n), t.chunks.map(c => u32(c.length))), full('stco', 0, 0, u32(1), u32(offs[i])));
        return box('trak', full('tkhd', 0, 7, u32(0), u32(0), u32(i + 1), u32(0), u32(dur), u32(0), u32(0), u16(0), u16(i), u16(0x100), u16(0), matrix, u32(0), u32(0)),
          box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(t.rate), u32(dur), u16(0x55c4), u16(0)), full('hdlr', 0, 0, u32(0), 'soun', u32(0), u32(0), u32(0), 'SoundHandler\0'),
            box('minf', full('smhd', 0, 0, u16(0), u16(0)), box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))), stbl)));
      });
      return box('moov', full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(0), u32(0x10000), u16(0x100), new Array(10).fill(0), matrix, new Array(24).fill(0), u32(tracks.length + 1)), traks, box('udta', box('stem', JSON.stringify(stemJson))));
    };
    const ftyp = box('ftyp', 'isom', u32(512), 'isomiso2mp41');
    let moov = build(tracks.map(() => 0));
    const offs = []; let o = ftyp.length + moov.length + 8; for (const t of tracks) { offs.push(o); o += t.chunks.reduce((s, c) => s + c.length, 0); }
    moov = build(offs);
    return cat(ftyp, moov, box('mdat', tracks.map(t => t.chunks)));
  };
  // encode une piste stéréo en Opus (WebCodecs) : paquets de 20 ms
  window.__opus = async (fn, sec) => {
    const sr = 48000, n = Math.round(sr * sec), chunks = []; let desc = null;
    const e = new AudioEncoder({ output: (c, m) => { const b = new Uint8Array(c.byteLength); c.copyTo(b); chunks.push(b); if (m && m.decoderConfig && m.decoderConfig.description) desc = new Uint8Array(m.decoderConfig.description); }, error: x => { throw x; } });
    e.configure({ codec: 'opus', sampleRate: sr, numberOfChannels: 2, bitrate: 128000 });
    const d = new Float32Array(n * 2); for (let i = 0; i < n; i++) { const v = fn(i / sr); d[i] = v; d[n + i] = v; }
    e.encode(new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: 0, data: d }));
    await e.flush(); e.close();
    const preSkip = desc && desc.length >= 12 ? desc[10] | (desc[11] << 8) : 312;
    return { kind: 'opus', rate: 48000, frame: 960, chunks, preSkip };
  };
};

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
  const open = async () => {
    const page = await context.newPage(); watch(page);
    await page.goto(url);
    await page.waitForFunction(() => typeof LIB !== 'undefined' && LIB.tracks.length >= 4 && decks[1].track && window.Stems, null, { timeout: 60000 });
    await page.evaluate(helpers);
    return page;
  };
  let page = await open();

  // ---------- 1. Branchements ----------
  const hooks = await page.evaluate(() => ({ mode: PAD_MODES.some(m => m[0] === 'stem'), tab: !!document.querySelector('#p-deckA .tabs [data-m="stem"]'), row: !!document.querySelector('#p-deckA .dk-stems'),
    btns: [...document.querySelectorAll('#p-deckA .dk-stems [data-ctl]')].map(b => b.dataset.ctl), set: (window.MixlabSettings || []).filter(s => s.tab === 'Stems').map(s => s.key), q: Stems.quality,
    haute: Stems.BACKENDS.haute.available() }));
  check(hooks.mode && hooks.tab && hooks.row, 'Onglet de pads « Stems » et rangée Stems sur la platine A', JSON.stringify(hooks));
  check(['A.stem1', 'A.stem2', 'A.stem3', 'A.stem4', 'A.acapella', 'A.instru'].every(x => hooks.btns.includes(x)), 'Commandes mappables : 4 stems, a cappella, instrumental', hooks.btns.join(','));
  check(hooks.set.includes('stems.quality') && hooks.set.includes('stems.auto') && hooks.q === 'rapide' && !hooks.haute, 'Réglages déclarés (qualité, chargement) ; haute qualité indisponible, rapide par défaut', JSON.stringify(hooks.set));

  // ---------- 2. Séparation d'un morceau synthétisé ----------
  await page.evaluate(async () => {
    const T = __synth(12); window.__T = T;
    const f = new File([__wavF(T.L, T.R, T.sr)], 'Testeur - Stems 124.wav', { type: 'audio/wav' });
    await importFiles([f], null);
    window.__tr = LIB.tracks.find(t => t.file === 'Testeur - Stems 124.wav');
    decks[0].load(__tr);
  });
  const sep = await page.evaluate(async () => {
    const t0 = performance.now(), prog = []; const d = decks[0];
    const p = Stems.prepare(d, true); const iv = setInterval(() => prog.push(Stems.state(d).progress), 30);
    const src = await p; clearInterval(iv);
    return { src, ms: Math.round(performance.now() - t0), prog: prog.length, maxp: Math.max(0, ...prog.filter(x => x < 1)), stats: Stems.stats, ch: __tr._stems.buf.numberOfChannels, fp: !!__tr._fp, st: Stems.state(d).status, row: document.querySelector('#p-deckA .dk-stems .st-pg').textContent };
  });
  check(sep.src === 'calcul' && sep.ch === 8 && sep.st === 'ready' && sep.fp, 'Séparation rapide : 4 stems stéréo (8 canaux) rangés sous l’empreinte du fichier', JSON.stringify(sep));
  check(sep.stats.worker === 'worker' && sep.stats.mainThread === 0, 'Calcul dans un Web Worker (pas sur le fil de l’interface)', sep.stats.worker);
  check(sep.prog > 1 && sep.maxp > 0, 'Progression remontée pendant le calcul', sep.prog + ' relevés, max ' + Math.round(sep.maxp * 100) + ' %');
  check(sep.ms < 20000, 'Séparation de 12 s de musique en moins de 20 s', sep.ms + ' ms');

  const q = await page.evaluate(async () => {
    const b = __tr._stems.buf, n = b.length, names = ['voc', 'drums', 'bass', 'mel'], T = __T;
    const est = names.map((k, i) => [b.getChannelData(2 * i), b.getChannelData(2 * i + 1)]);
    const dot = (a, c) => { let s = 0; for (let i = 0; i < n; i++) s += a[i] * c[i]; return s; };
    const proj = est.map(e => { const ee = dot(e[0], e[0]) + dot(e[1], e[1]) || 1e-12; return names.map(s => (dot(e[0], T.S[s][0]) + dot(e[1], T.S[s][1])) / ee); });
    const sdr = names.map((s, i) => { let a = 0, e = 0; for (let c = 0; c < 2; c++) for (let j = 0; j < n; j++) { const r = T.S[s][c][j]; a += r * r; e += (r - est[i][c][j]) ** 2; } return 10 * Math.log10(a / e); });
    // somme des stems = morceau
    const L = __tr.buffer.getChannelData(0); let err = 0; for (let j = 0; j < n; j++) err = Math.max(err, Math.abs(est[0][0][j] + est[1][0][j] + est[2][0][j] + est[3][0][j] - L[j]));
    // bandes : basse sous 250 Hz, voix entre 300 Hz et 4 kHz, batterie : charleston au-dessus de 5 kHz
    const mono = i => { const x = new Float32Array(n); for (let j = 0; j < n; j++) x[j] = .5 * (est[i][0][j] + est[i][1][j]); return x; };
    const mix = new Float32Array(n); for (let j = 0; j < n; j++) mix[j] = .5 * (L[j] + __tr.buffer.getChannelData(1)[j]);
    const bassLow = await __band(mono(2), 'lowpass', 250), vocMid = await __band(mono(0), 'bandpass', 1100), vocLow = await __band(mono(0), 'lowpass', 150);
    const E = x => { let e = 0; for (let j = 0; j < n; j++) e += x[j] * x[j]; return e; };
    const hf = async x => (await __band(x, 'highpass', 5000)) * E(x);
    const mixHf = await hf(mix), drHi = (await hf(mono(1))) / mixHf, bassHi = (await hf(mono(2))) / mixHf, vocHi = (await hf(mono(0))) / mixHf, melHi = (await hf(mono(3))) / mixHf;
    return { proj, sdr, err, bassLow, vocMid, vocLow, drHi, bassHi, vocHi, melHi };
  });
  const r2 = x => Math.round(x * 100) / 100;
  check(q.proj.every((row, i) => row.indexOf(Math.max(...row)) === i), 'Chaque stem ressemble d’abord à sa vraie source (voix, batterie, basse, mélodie)', q.proj.map(r => r.map(r2).join('/')).join(' | '));
  check(q.sdr[0] > 6 && q.sdr[1] > 5 && q.sdr[2] > 4 && q.sdr[3] > 2, 'Qualité mesurée (SDR) : voix > 6 dB, batterie > 5 dB, basse > 4 dB, mélodie > 2 dB', q.sdr.map(x => x.toFixed(1) + ' dB').join(', '));
  check(q.bassLow > .9 && q.bassHi < .001, 'Basse : énergie concentrée sous 250 Hz', 'grave ' + r2(q.bassLow) + ', aigu ' + q.bassHi.toExponential(1));
  check(q.vocLow < .05 && q.vocMid > .3, 'Voix : énergie dans le médium (formants), presque rien sous 150 Hz', 'médium ' + r2(q.vocMid) + ', grave ' + q.vocLow.toFixed(3));
  check(q.drHi > .6 && q.drHi > 3 * Math.max(q.vocHi, q.bassHi, q.melHi), 'Batterie : l’essentiel de l’aigu du mix (charleston, au-dessus de 5 kHz) part dans la batterie', ['batterie', q.drHi, 'voix', q.vocHi, 'basse', q.bassHi, 'mélodie', q.melHi].map(x => typeof x === 'number' ? x.toFixed(3) : x).join(' '));
  check(q.err < 1e-4, 'La somme des 4 stems redonne exactement le morceau', 'écart max ' + q.err.toExponential(1));

  // ---------- 3. Lecture : même transport, mute, a cappella, instrumental ----------
  const play = await page.evaluate(async () => {
    const d = decks[0]; d.p.fader = .85; applyMix(d); d.seek(1); d.play();
    await new Promise(r => setTimeout(r, 300));
    const same = d.src && d.src.buffer === __tr._stems.buf && d.src.buffer.numberOfChannels === 8;
    d.setPitch(.04); await new Promise(r => setTimeout(r, 60)); const rate = d.src.playbackRate.value, want = d.rate; d.setKeyLock(true);
    const full = await __rms(d.an, 700);
    Stems.acapella(d); await new Promise(r => setTimeout(r, 150)); const acap = await __rms(d.an, 700); const sa = Stems.state(d).mute.slice();
    Stems.instrumental(d); await new Promise(r => setTimeout(r, 150)); const inst = await __rms(d.an, 700); const si = Stems.state(d).mute.slice();
    [0, 1, 2, 3].forEach(i => Stems.setMute(d, i, true)); await new Promise(r => setTimeout(r, 150)); const none = await __rms(d.an, 500);
    Stems.reset(d); await new Promise(r => setTimeout(r, 150)); const back = await __rms(d.an, 600);
    const pos = d.position(), tsrc = d.src.buffer === __tr._stems.buf;
    d.setKeyLock(false); d.setPitch(0);
    return { same, rate, want, full, acap, inst, none, back, sa, si, tsrc, pos };
  });
  check(play.same && play.tsrc, 'En lecture, la platine joue le tampon des stems avec sa propre source (même transport)', JSON.stringify({ same: play.same }));
  check(Math.abs(play.rate - play.want) < 1e-6, 'Pitch +4 % : les stems suivent la vitesse de la platine', play.rate.toFixed(4));
  check(play.sa.join() === 'false,true,true,true' && play.si.join() === 'true,false,false,false', 'A cappella et instrumental en un bouton', play.sa + ' / ' + play.si);
  check(play.acap < play.full * .5 && play.acap > play.full * .03 && play.inst > play.full * .5 && play.inst > play.acap * 2, 'Le son change : a cappella bien plus faible que le mix (voix seule), instrumental proche du mix', ['mix ' + play.full.toFixed(3), 'acap ' + play.acap.toFixed(3), 'instru ' + play.inst.toFixed(3)].join(', '));
  check(play.none < play.full * .02 && Math.abs(play.back - play.full) < play.full * .2, 'Tous coupés : silence ; tout rendu : le mix revient', 'silence ' + play.none.toExponential(1) + ', retour ' + play.back.toFixed(3));

  // ---------- 4. Écho out sur la voix, effets par stem ----------
  const echo = await page.evaluate(async () => {
    const d = decks[0]; Stems.acapella(d); await new Promise(r => setTimeout(r, 300));
    const voice = await __rms(d.an, 500);
    const c0 = ctx.currentTime; Stems.echoOut(d, 0);
    const t = Stems.state(d).echo[0], spb = d.beatLen / d.rate, ph = d.beatIdx(d.positionAt(t)), cutAfter = (t - c0) * 1000, onBeat = Math.abs(ph - Math.round(ph));
    await new Promise(r => setTimeout(r, Math.max(0, (t - ctx.currentTime) * 1000) + 250));
    const tail = await __rms(d.an, 400);
    await new Promise(r => setTimeout(r, 3500));
    const late = await __rms(d.an, 400);
    Stems.echoOut(d, 0); await new Promise(r => setTimeout(r, 900)); const ret = Stems.state(d).mute[0];
    Stems.sendToUnit(d, 0, 0, true); const unit = FXU[0].targets.has('A:voc') && !!FXU[0].inst['A:voc'] && FXU[0].refFor('A:voc') === d;
    Stems.sendToUnit(d, 0, 0, false);
    Stems.reset(d);
    return { voice, cutAfter, onBeat, spb, tail, late, ret, unit };
  });
  check(echo.cutAfter > 0 && echo.cutAfter <= echo.spb * 1000 + 100 && echo.onBeat < .02, 'Écho out : la voix se coupe sur le temps suivant', Math.round(echo.cutAfter) + ' ms, écart à la grille ' + echo.onBeat.toFixed(3) + ' temps');
  check(echo.tail > echo.late * 4 && echo.tail > echo.voice * .03, 'Écho out : la queue d’écho continue après la coupure puis s’éteint', 'queue ' + echo.tail.toFixed(4) + ', 4 s après ' + echo.late.toExponential(1));
  check(echo.ret === false, 'Second écho out : la voix revient sur le temps');
  check(echo.unit, 'Effets par stem : la voix seule peut passer dans l’unité FX1, au tempo de sa platine');

  // ---------- 5. Pads de stems ----------
  const pads = await page.evaluate(async () => {
    const d = decks[0]; d.padMode = 'stem'; renderPads(d);
    const txt = d.ui.pads.map(p => p.textContent);
    d.ui.pads[1].dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    const m1 = Stems.state(d).mute[1];
    await new Promise(r => setTimeout(r, 80)); padLights(d); const lit = d.ui.pads.slice(0, 4).map(p => p.classList.contains('set'));
    d.ui.pads[1].dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    const m2 = Stems.state(d).mute[1];
    d.padMode = 'hot'; renderPads(d);
    return { txt, m1, m2, lit };
  });
  check(pads.txt.slice(0, 4).join() === 'Voix,Batt.,Basse,Mélo' && pads.txt.slice(4).every(t => t === 'Écho'), 'Pads Stems : 1 à 4 les stems, 5 à 8 l’écho out', pads.txt.join(','));
  check(pads.m1 === true && pads.m2 === false && pads.lit.join() === 'true,false,true,true', 'Pad 2 : coupe puis rend la batterie, les pads allumés suivent', JSON.stringify(pads.lit));

  // ---------- 6. Swap de la voix entre deux platines ----------
  const sw = await page.evaluate(async () => {
    const a = decks[0], b = decks[1]; b.load(__tr); b.p.fader = .85; applyMix(b);
    const att = Stems.state(b).ready; // le même morceau : stems déjà en mémoire
    Stems.instrumental(b); b.seek(a.position()); b.play();
    const run = Stems.swap(a, b, 'voc', 4);
    await new Promise(r => setTimeout(r, 300));
    const sp = Stems.swapping; const spb = a.beatLen / a.rate;
    await new Promise(r => setTimeout(r, Math.max(0, (sp.t0 - ctx.currentTime) * 1000 + spb * 2000)));
    const mid = [a._sg.mg[0].gain.value, b._sg.mg[0].gain.value];
    const res = await run;
    const after = [Stems.state(a).mute[0], Stems.state(b).mute[0]];
    b.pause(); Stems.reset(a); Stems.reset(b);
    return { att, mid, after, beats: (res.t1 - res.t0) / spb };
  });
  check(sw.att, 'Même morceau sur la platine B : stems repris de la mémoire, sans recalcul');
  check(sw.mid[0] > .2 && sw.mid[0] < .8 && sw.mid[1] > .2 && sw.mid[1] < .8, 'Swap sur 4 temps : à mi-chemin, la voix est à moitié sur A et à moitié sur B', sw.mid.map(r2).join(' / '));
  check(sw.after[0] === true && sw.after[1] === false && Math.abs(sw.beats - 4) < .01, 'Fin du swap : voix coupée sur A, présente sur B, durée 4 temps', JSON.stringify(sw));

  // ---------- 7. Cache : second chargement ----------
  await page.evaluate(() => { decks[0].pause(); });
  const bytes = await page.evaluate(() => Array.from(new Uint8Array(__wavF(__T.L, __T.R, __T.sr)).slice(0, 4)));
  const ref = await page.evaluate(() => { const b = __tr._stems.buf; return [0, 2, 4].map(c => Array.from(b.getChannelData(c).slice(40000, 40400))); });
  await page.close();
  page = await open();
  const hit = await page.evaluate(async ref => {
    const T = __synth(12); window.__T = T;
    await importFiles([new File([__wavF(T.L, T.R, T.sr)], 'Testeur - Stems 124.wav', { type: 'audio/wav' })], null);
    const tr = LIB.tracks.find(t => t.file === 'Testeur - Stems 124.wav');
    Stems.setAuto('off'); decks[0].load(tr);
    const t0 = performance.now(); const src = await Stems.prepare(decks[0], true); const ms = performance.now() - t0;
    const b = tr._stems.buf; let e = 0; [0, 2, 4].forEach((c, k) => { const x = b.getChannelData(c); for (let i = 0; i < 400; i++) e = Math.max(e, Math.abs(x[40000 + i] - ref[k][i])); });
    Stems.setAuto('cache');
    return { src, ms: Math.round(ms), stats: Stems.stats, e, n: await Stems.cacheCount() };
  }, ref);
  check(hit.src === 'cache' && hit.stats.runs === 0 && hit.stats.hits === 1, 'Second chargement : stems lus dans le cache, pas de nouveau calcul', JSON.stringify({ src: hit.src, runs: hit.stats.runs, hits: hit.stats.hits, ms: hit.ms }));
  check(hit.e < 1e-3, 'Stems du cache identiques au calcul (stockés en 16 bits)', 'écart ' + hit.e.toExponential(1));
  // chargement automatique : un morceau déjà séparé retrouve ses stems en le chargeant
  const auto = await page.evaluate(async () => {
    const tr = decks[0].track; decks[1].load(LIB.tracks[0]); tr._stems = null; decks[0].load(LIB.tracks[1]); decks[0].load(tr);
    const t0 = performance.now(); while (!Stems.state(decks[0]).ready && performance.now() - t0 < 5000) await new Promise(r => setTimeout(r, 20));
    return { ready: Stems.state(decks[0]).ready, src: Stems.state(decks[0]).source };
  });
  check(auto.ready && auto.src === 'cache', 'Réglage « si déjà calculés » : les stems reviennent au chargement du morceau', JSON.stringify(auto));

  // ---------- 8. Fichier .stem.mp4 (Opus, fabriqué ici) ----------
  const canOpus = await page.evaluate(async () => { try { return typeof AudioEncoder !== 'undefined' && (await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported; } catch (e) { return false; } });
  const FQ = { drums: 3000, bass: 110, mel: 660, voc: 1500 };
  if (canOpus) {
    const st = await page.evaluate(async FQ => {
      const sec = 3, TAU = 2 * Math.PI, sine = f => t => .2 * Math.sin(TAU * f * t);
      const parts = [await __opus(t => FQ.drums ? sine(FQ.drums)(t) + sine(FQ.bass)(t) + sine(FQ.mel)(t) + sine(FQ.voc)(t) : 0, sec)];
      for (const k of ['drums', 'bass', 'mel', 'voc']) parts.push(await __opus(sine(FQ[k]), sec));
      const bytes = __mp4(parts, { version: 1, stems: [{ name: 'Drums', color: '#FD4A4A' }, { name: 'Bass', color: '#FFA24B' }, { name: 'Synths', color: '#00EAFF' }, { name: 'Vocals', color: '#AD65FF' }] });
      const info = Stems.parseMp4(bytes);
      const pinfo = { n: info.tracks.length, codecs: info.tracks.map(t => t.codec).join(','), names: info.stems && info.stems.stems.map(s => s.name).join(','), counts: info.tracks.map(t => t.count).join(',') };
      await importFiles([new File([bytes], 'Testeur - Fichier.stem.mp4', { type: 'audio/mp4' })], null);
      const tr = LIB.tracks.find(t => t.file === 'Testeur - Fichier.stem.mp4');
      if (!tr) return { pinfo, imported: false };
      const d = decks[2]; d.load(tr);
      const src = await Stems.prepare(d, true);
      const b = tr._stems.buf, sr = b.sampleRate, a0 = Math.round(sr * .5), a1 = Math.round(sr * 2.5);
      const g = (c, f) => __goertzel(b.getChannelData(c), f, sr, a0, a1);
      const m = tr.buffer.getChannelData(0);
      const mg = f => __goertzel(m, f, sr, a0, a1);
      const roles = ['voc', 'drums', 'bass', 'mel'].map((k, i) => { const own = g(2 * i, FQ[k]), other = Math.max(...Object.keys(FQ).filter(x => x !== k).map(x => g(2 * i, FQ[x]))); return { k, own, other }; });
      let xy = 0, xx = 0, yy = 0; for (let i = a0; i < a1; i++) { const y = b.getChannelData(0)[i] + b.getChannelData(2)[i] + b.getChannelData(4)[i] + b.getChannelData(6)[i]; xy += m[i] * y; xx += m[i] * m[i]; yy += y * y; }
      return { pinfo, imported: true, src, roles, master: Object.values(FQ).map(mg), dur: tr.duration, corr: xy / Math.sqrt(xx * yy) };
    }, FQ);
    check(st.pinfo.n === 5 && st.pinfo.codecs === 'opus,opus,opus,opus,opus' && st.pinfo.names === 'Drums,Bass,Synths,Vocals' && parseInt(st.pinfo.counts) >= 149, '.stem.mp4 démultiplexé en JS : 5 pistes Opus, noms des stems lus dans le bloc « stem »', JSON.stringify(st.pinfo));
    check(st.imported && st.master.every(x => x > .02), 'Import du .stem.mp4 : la piste master se joue (les 4 sons y sont)', st.master ? st.master.map(x => x.toFixed(3)).join(', ') : '');
    check(st.corr > .9, 'Stems du fichier calés sur la piste master (somme des stems ≈ master)', 'corrélation ' + (st.corr || 0).toFixed(3));
    check(st.src === 'fichier' && st.roles.every(r => r.own > .03 && r.own > 20 * r.other), 'Stems du fichier décodés (WebCodecs) et rangés au bon rôle : voix, batterie, basse, mélodie', st.roles ? st.roles.map(r => r.k + ' ' + r.own.toFixed(3) + '/' + r.other.toFixed(4)).join(', ') : st.src);
    // pistes de stems dans un codec que ce navigateur ne décode pas (AAC ici) : master jouée, message clair, stems calculés
    const aac = await page.evaluate(async () => {
      const master = await __opus(t => .2 * Math.sin(2 * Math.PI * 440 * t), 2);
      const fake = { kind: 'aac', rate: 44100, frame: 1024, chunks: [new Uint8Array([0x21, 0x10, 0x04, 0x60, 0x8c, 0x1c])] };
      const bytes = __mp4([master, fake, fake, fake, fake], { stems: [{ name: 'Drums' }, { name: 'Bass' }, { name: 'Other' }, { name: 'Vocals' }] });
      const info = Stems.parseMp4(bytes), t1 = info.tracks[1];
      let supported = false; try { supported = (await AudioDecoder.isConfigSupported({ codec: t1.codec, sampleRate: t1.rate, numberOfChannels: 2, description: t1.desc })).supported; } catch (e) { }
      await importFiles([new File([bytes], 'Testeur - AAC.stem.mp4')], null);
      const tr = LIB.tracks.find(t => t.file === 'Testeur - AAC.stem.mp4'); if (!tr) return { codec: t1.codec, rate: t1.rate, imported: false };
      decks[3].load(tr); const msgs = []; const o = new MutationObserver(() => document.querySelectorAll('.toast').forEach(t => msgs.push(t.textContent))); o.observe(document.body, { subtree: true, childList: true });
      const src = await Stems.prepare(decks[3]); o.disconnect();
      return { codec: t1.codec, rate: t1.rate, ch: t1.ch, imported: true, supported, src, msg: msgs.find(m => /stems/.test(m) && /navigateur/.test(m)) || msgs.join(' | '), err: tr._stemFileErr };
    });
    check(aac.codec === 'mp4a.40.2' && aac.rate === 44100 && aac.ch === 2, 'Piste AAC : codec et fréquence lus dans l’esds (AudioSpecificConfig)', JSON.stringify({ codec: aac.codec, rate: aac.rate, ch: aac.ch }));
    if (!aac.supported) check(aac.imported && aac.err === 'decodeur' && aac.src === 'calcul' && /navigateur/.test(aac.msg), 'Sans décodeur pour les pistes : master jouée, message clair, stems calculés à la place', aac.msg);
    else console.log('(ce navigateur décode l’AAC : test du message sans décodeur sauté)');
  } else {
    const st = await page.evaluate(() => {
      const bytes = __mp4([{ kind: 'aac', rate: 44100, frame: 1024, chunks: [new Uint8Array(6), new Uint8Array(7)] }, ...[0, 1, 2, 3].map(() => ({ kind: 'aac', rate: 44100, frame: 1024, chunks: [new Uint8Array(5)] }))], { stems: [{ name: 'Drums' }, { name: 'Bass' }, { name: 'Other' }, { name: 'Vocals' }] });
      const i = Stems.parseMp4(bytes); return { n: i.tracks.length, codec: i.tracks[0].codec, count: i.tracks[0].count, size: i.tracks[0].sizes[1], names: i.stems.stems.map(s => s.name).join(',') };
    });
    check(st.n === 5 && st.codec === 'mp4a.40.2' && st.count === 2 && st.size === 7 && st.names === 'Drums,Bass,Other,Vocals', 'Pas d’encodeur Opus ici : démultiplexage vérifié sur une structure de boîtes fabriquée', JSON.stringify(st));
  }

  // ---------- 9. Interface : panneau Stems ----------
  await page.evaluate(() => { decks[0].padMode = 'stem'; renderPads(decks[0]); });
  await page.click('#p-deckA .pad >> nth=0', { button: 'right' });
  const pop = await page.evaluate(() => { const p = document.querySelector('.st-pop'); return p ? { rows: p.querySelectorAll('.st-row').length, txt: p.querySelector('.st-state').textContent, q: [...p.querySelectorAll('select option')].filter(o => o.disabled).map(o => o.textContent) } : null; });
  check(pop && pop.rows === 4 && /cache|prêts/i.test(pop.txt) && pop.q.some(t => /indisponible/.test(t)), 'Clic droit sur un pad Stems : panneau avec 4 lignes (volume, FX1, FX2, écho out), état, swap, qualité', JSON.stringify(pop));
  await page.screenshot({ path: '/tmp/stems-panel.png' });
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const P = document.querySelector('#p-deckA'); P.classList.add('pro-open'); window.View && View.fit(); });
  await sleep(200);
  await (await page.$('#p-deckA')).screenshot({ path: '/tmp/stems-deck.png' });

  check(errors.length === 0, 'Aucune erreur dans la page', errors.join(' | '));
  await browser.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Stems : tout est vert');
})().catch(e => { console.error(e); process.exit(1); });
