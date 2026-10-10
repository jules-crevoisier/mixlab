'use strict';
// Test de la bibliothèque pro : lecture des collections (rekordbox, iTunes, M3U, CSV),
// import avec le pont natif simulé, fichiers manquants, crates intelligentes, recherche par champ,
// édition et sauvegarde, export rekordbox aller-retour, tracklist, doublons, playlists en ligne,
// et tenue de la table avec 5 000 morceaux.
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
let failed = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + what + (extra ? ' · ' + extra : '')); if (!ok) failed++; };

const RB = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>
  <COLLECTION Entries="3">
    <TRACK TrackID="11" Name="Kick 120" Artist="Testeur" Genre="Techno" Kind="WAV File" TotalTime="8" AverageBpm="120.00" DateAdded="2024-03-01" PlayCount="7" Rating="204" Location="file://localhost/musique/Testeur%20-%20Kick%20120.wav" Tonality="Am" Comments="Ouverture &amp; montée" Colour="0xFF0000">
      <TEMPO Inizio="0.050" Bpm="120.00" Metro="4/4" Battito="1"/>
      <POSITION_MARK Name="" Type="0" Start="0.050" Num="-1"/>
      <POSITION_MARK Name="Break" Type="0" Start="4.050" Num="-1"/>
      <POSITION_MARK Name="Drop" Type="0" Start="2.050" Num="0" Red="40" Green="226" Blue="20"/>
      <POSITION_MARK Name="" Type="4" Start="6.050" End="8.000" Num="2"/>
    </TRACK>
    <TRACK TrackID="12" Name="Absent" Artist="Fantôme" AverageBpm="128.00" Rating="255" Tonality="8A" Colour="0x25FDE9" Location="file://localhost/C:/Perdu/Fant%C3%B4me%20-%20Absent.mp3">
      <TEMPO Inizio="0.300" Bpm="128.00" Metro="4/4" Battito="3"/>
    </TRACK>
    <TRACK TrackID="13" Name="Néons" Artist="Démo Mixlab" AverageBpm="124.00" Rating="153" Colour="0x660099" Location="file://localhost/demo/neons.wav"/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="2">
      <NODE Name="Club" Type="0" Count="1">
        <NODE Name="Samedi" Type="1" KeyType="0" Entries="2"><TRACK Key="11"/><TRACK Key="12"/></NODE>
      </NODE>
      <NODE Name="Par chemin" Type="1" KeyType="1" Entries="1"><TRACK Key="file://localhost/musique/Testeur%20-%20Kick%20120.wav"/></NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>`;

const ITUNES = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Major Version</key><integer>1</integer>
<key>Tracks</key><dict>
 <key>101</key><dict><key>Track ID</key><integer>101</integer><key>Name</key><string>One More Time</string><key>Artist</key><string>Daft Punk</string><key>Genre</key><string>House</string><key>BPM</key><integer>123</integer><key>Rating</key><integer>80</integer><key>Play Count</key><integer>12</integer><key>Total Time</key><integer>320000</integer><key>Location</key><string>file:///Users/dj/Music/Daft%20Punk/One%20More%20Time.m4a</string><key>Comments</key><string>Classique &amp; efficace</string></dict>
 <key>102</key><dict><key>Track ID</key><integer>102</integer><key>Name</key><string>Un podcast</string><key>Podcast</key><true/><key>Location</key><string>file:///p.mp3</string></dict>
 <key>103</key><dict><key>Track ID</key><integer>103</integer><key>Name</key><string>Note d'album</string><key>Rating</key><integer>60</integer><key>Rating Computed</key><true/><key>Location</key><string>file://localhost/C:/Music/x.mp3</string></dict>
</dict>
<key>Playlists</key><array>
 <dict><key>Name</key><string>Bibliothèque</string><key>Master</key><true/><key>Playlist Items</key><array><dict><key>Track ID</key><integer>101</integer></dict></array></dict>
 <dict><key>Name</key><string>Musique</string><key>Distinguished Kind</key><integer>4</integer><key>Playlist Items</key><array><dict><key>Track ID</key><integer>101</integer></dict></array></dict>
 <dict><key>Name</key><string>Warm-up</string><key>Playlist Items</key><array><dict><key>Track ID</key><integer>103</integer></dict><dict><key>Track ID</key><integer>101</integer></dict></array></dict>
</array></dict></plist>`;

const M3U = '#EXTM3U\r\n#EXTINF:300,Daft Punk - One More Time\r\n../musique/One More Time.mp3\r\n#EXTINF:200,Sans artiste\r\nC:\\Sets\\b.mp3\r\nfile:///home/dj/c%20d.flac\r\n';

const CSV = `"Track URI","Track Name","Album Name","Artist Name(s)","Release Date","Duration (ms)"
"spotify:track:1","Néons - Extended Mix","Album","Démo Mixlab","2024-01-01","300000"
"spotify:track:2","Quai 9 (feat. Quelqu'un)","Album","Démo Mixlab,Quelqu'un","2024","1"
"spotify:track:3","Halogène - Tiga Remix","A","Démo Mixlab","",""
"spotify:track:4","Inconnu, le morceau","A","Personne","",""`;

const LIST = '1. Démo Mixlab - Ligne 7 (Original Mix)\ndemo mixlab – neons\nhttps://open.spotify.com/track/xyz\nPersonne - Rien du tout\n';

// Pont natif simulé : un seul fichier audio réel, et un dossier « nouveau » pour relocaliser.
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
    const ok = new Set(['/musique/Testeur - Kick 120.wav', '/nouveau/Fantôme - Absent.mp3']);
    window.__saved = ${JSON.stringify(saved)};
    window.__exports = [];
    window.mixlabNative = {
      platform: 'test',
      pickFiles: async () => [], pickFolder: async () => [{ path: '/nouveau/Fantôme - Absent.mp3', name: 'Fantôme - Absent.mp3' }],
      readFile: async () => wav(), exists: async p => ok.has(p),
      droppedPath: async () => null,
      loadLibrary: async () => window.__saved ? JSON.parse(window.__saved) : null,
      saveLibrary: async j => { window.__saved = j; return true; },
      pickLibraryFile: async () => ({ path: '/home/dj/rekordbox.xml', name: 'rekordbox.xml', text: window.__rb }),
      allowPaths: async locs => locs.map(l => { const p = decodeURIComponent(l.replace(/^file:\\/\\/localhost/, '')); return ok.has(p) ? p : null; }),
      saveText: async (name, text) => { window.__exports.push({ name, text }); return '/export/' + name; },
      openShop: async () => true,
    };
  })();`;

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };

  /* ---------- 1. Appli (pont natif simulé) ---------- */
  let page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  watch(page);
  await page.addInitScript(fakeNative(null));
  await page.addInitScript(rb => { window.__rb = rb; }, RB);
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.length >= 4 && decks[1].track, null, { timeout: 60000 });
  const W = (f, a) => page.evaluate(f, a);

  // Lecture des formats.
  const rb = await W(x => { const r = LibPro.parseRekordbox(x); return { n: r.tracks.length, t0: r.tracks[0], t1: r.tracks[1], key0: keyInfo(r.tracks[0].key).code, key1: keyInfo(r.tracks[1].key).code, pls: r.playlists }; }, RB);
  check(rb.n === 3, 'rekordbox : 3 morceaux lus');
  check(rb.t0.path === '/musique/Testeur - Kick 120.wav' && rb.t1.path === 'C:/Perdu/Fantôme - Absent.mp3', 'rekordbox : emplacements décodés (%20, accents, lecteur Windows)', rb.t1.path);
  check(rb.t0.bpm === 120 && rb.key0 === '8A' && rb.key1 === '8A' && rb.t0.rating === 4 && rb.t1.rating === 5 && rb.t0.color === 2 && rb.t1.color === 6, 'rekordbox : BPM, tonalité, note et couleur');
  check(rb.t0.comment === 'Ouverture & montée' && rb.t0.plays === 7 && rb.t0.genre === 'Techno', 'rekordbox : commentaire, lectures, genre');
  check(Math.abs(rb.t0.grid - 0.05) < 1e-6 && Math.abs(rb.t1.grid - 1.2375) < 1e-6, 'rekordbox : grille (Battito 3 ramené sur le premier temps de la mesure)', rb.t1.grid);
  check(rb.t0.cue === 0.05 && rb.t0.mem.length === 1 && rb.t0.mem[0].name === 'Break' && rb.t0.hot[0] === 2.05 && rb.t0.hotName[0] === 'Drop' && rb.t0.hot[2] === 6.05, 'rekordbox : cue, cue mémoire nommé, hot cues (et boucle)');
  check(JSON.stringify(rb.pls) === JSON.stringify([{ name: 'Club / Samedi', items: [0, 1] }, { name: 'Par chemin', items: [0] }]), 'rekordbox : playlists et dossiers', JSON.stringify(rb.pls));

  const it = await W(x => LibPro.parseItunes(x), ITUNES);
  check(it.tracks.length === 2 && it.tracks[0].title === 'One More Time' && it.tracks[0].rating === 4 && it.tracks[0].bpm === 123 && it.tracks[0].plays === 12 && Math.abs(it.tracks[0].duration - 320) < 1e-6, 'iTunes : morceaux (podcast écarté), note, BPM, lectures, durée');
  check(it.tracks[0].path === '/Users/dj/Music/Daft Punk/One More Time.m4a' && it.tracks[1].path === 'C:/Music/x.mp3' && it.tracks[1].rating === 0 && it.tracks[0].comment === 'Classique & efficace', 'iTunes : chemins, note calculée ignorée, commentaire');
  check(JSON.stringify(it.playlists) === JSON.stringify([{ name: 'Warm-up', items: [1, 0] }]), 'iTunes : playlists (bibliothèque et listes système écartées)', JSON.stringify(it.playlists));

  const m3u = await W(x => LibPro.parseM3U(x, '/home/dj/sets/soirée.m3u8'), M3U);
  check(m3u.tracks.length === 3 && m3u.tracks[0].path === '/home/dj/sets/../musique/One More Time.mp3' && m3u.tracks[0].artist === 'Daft Punk' && m3u.tracks[0].duration === 300, 'M3U : chemin relatif et #EXTINF', m3u.tracks[0].path);
  check(m3u.tracks[1].path === 'C:\\Sets\\b.mp3' && m3u.tracks[1].title === 'Sans artiste' && m3u.tracks[2].path === '/home/dj/c d.flac' && m3u.playlists[0].name === 'soirée', 'M3U : chemin Windows, URI file://, nom de la playlist');

  const csv = await W(x => LibPro.parseList(x), CSV);
  check(csv.items.length === 4 && csv.items[1].title === "Quai 9 (feat. Quelqu'un)" && csv.items[1].artist === "Démo Mixlab,Quelqu'un" && csv.items[3].title === 'Inconnu, le morceau', 'CSV Exportify : colonnes trouvées, virgules entre guillemets');
  const kinds = await W(([a, b, c, d]) => [LibPro.parseAny(a).kind, LibPro.parseAny(b).kind, LibPro.parseAny(c, 'x.m3u').kind, LibPro.parseAny(d).kind], [RB, ITUNES, M3U, CSV]);
  check(kinds.join() === 'rekordbox,itunes,m3u,list', 'détection du format', kinds.join());
  const locs = await W(() => [LibPro.locToPath('file://localhost/C:/A%20b/c.mp3'), LibPro.locToPath('file:///Users/x/%C3%A9t%C3%A9.mp3'), LibPro.locToPath('file://NAS/m/a.mp3'), LibPro.locToPath('file:///x/100%25.mp3'), LibPro.pathToLoc('C:\\Mes sons\\été #1.mp3'), LibPro.pathToLoc('/Users/x/a b.mp3')]);
  check(locs.join('|') === 'C:/A b/c.mp3|/Users/x/été.mp3|//NAS/m/a.mp3|/x/100%.mp3|file://localhost/C:/Mes%20sons/%C3%A9t%C3%A9%20%231.mp3|file://localhost/Users/x/a%20b.mp3', 'emplacements file:// dans les deux sens', locs.join('|'));

  // Recherche par champ et crates intelligentes, sur des morceaux factices.
  const sr = await W(() => {
    const k = s => LibPro.parseKey(s), d = n => new Date(Date.now() - n * 864e5);
    const F = [
      { id: 1, title: 'Alpha', artist: 'Ana', genre: 'Techno', bpm: 124, key: k('8A'), rating: 5, color: 2, tags: ['peak'], energy: 8, added: d(2), plays: 0 },
      { id: 2, title: 'Bravo', artist: 'Ben', genre: 'House', bpm: 121.6, key: k('9A'), rating: 3, color: 5, tags: ['warm-up'], energy: 4, energyUser: 9, added: d(40), plays: 2 },
      { id: 3, title: 'Charlie', artist: 'Céline', genre: 'Deep house', bpm: 118, key: k('8B'), rating: 4, color: 0, tags: ['peak', 'vocal'], added: d(5), plays: 1, comment: 'parfait pour ouvrir' },
      { id: 4, title: 'Delta', artist: 'Ana', genre: 'Techno', bpm: 132, key: k('3A'), rating: 0, color: 2, tags: [], energy: 10, added: d(100), plays: 0 }];
    const q = s => LibPro.search(s, F).map(t => t.title).join(',');
    const c = (match, rules) => LibPro.crateTracks({ match, rules }, F).map(t => t.title).join(',');
    return {
      a: q('bpm:120-126 key:8A rating:>=4 tag:peak'), b: q('bpm:122'), c: q('key:~8A'), d: q('rating:>=4'), e: q('énergie:>=8'), f: q('couleur:rouge ana'),
      g: q('celine'), h: q('genre:"deep house"'), i: q('tag:vocal ouvrir'), j: q('artiste:ana bpm:>130'),
      c1: c('all', [{ f: 'bpm', a: 120, b: 126 }, { f: 'key', op: 'compat', a: '8A' }]),
      c2: c('any', [{ f: 'rating', a: 5 }, { f: 'tag', a: 'vocal' }]),
      c3: c('all', [{ f: 'genre', a: 'house' }, { f: 'played', a: 'yes' }]),
      c4: c('all', [{ f: 'added', a: 30 }, { f: 'played', a: 'no' }]),
      c5: c('all', [{ f: 'energy', a: 8, b: 10 }, { f: 'color', a: 2 }]),
      c6: c('all', [{ f: 'key', op: 'is', a: 'Am' }]),
    };
  });
  check(sr.a === 'Alpha', 'recherche : bpm:120-126 key:8A rating:>=4 tag:peak', sr.a);
  check(sr.b === 'Bravo' && sr.c === 'Alpha,Bravo,Charlie' && sr.d === 'Alpha,Charlie' && sr.e === 'Alpha,Bravo,Delta', 'recherche : BPM arrondi, tonalités compatibles, note, énergie (réglage perso prioritaire)', [sr.b, sr.c, sr.d, sr.e].join(' / '));
  check(sr.f === 'Alpha,Delta' && sr.g === 'Charlie' && sr.h === 'Charlie' && sr.i === 'Charlie' && sr.j === 'Delta', 'recherche : couleur + texte libre, accents, guillemets, tags + commentaire, alias français', [sr.f, sr.g, sr.h, sr.i, sr.j].join(' / '));
  check(sr.c1 === 'Alpha,Bravo' && sr.c2 === 'Alpha,Charlie' && sr.c3 === 'Bravo,Charlie' && sr.c4 === 'Alpha' && sr.c5 === 'Alpha,Delta' && sr.c6 === 'Alpha', 'crates : ET / OU, BPM, compatibles, note, tag, genre, joué, ajouté récemment, énergie, couleur', JSON.stringify(sr));

  // Import rekordbox dans l'appli : le fichier présent est ouvert, les autres vont dans les manquants.
  await page.getByRole('button', { name: 'Import / export' }).click();
  await page.getByRole('button', { name: 'Choisir un fichier…' }).click();
  await page.waitForSelector('.lpm .xout p.ok', { timeout: 30000 });
  const imp = await W(() => { const t = LIB.tracks.find(t => t.path === '/musique/Testeur - Kick 120.wav'); const pl = LIB.playlists.find(p => p.name === 'Club / Samedi');
    return { ok: !!t, rating: t && t.rating, color: t && t.color, bpm: t && t.bpm, grid: t && t.grid, cue: t && t.cue, hot0: t && t.hot[0], mem: t && t.mem, key: t && keyInfo(t.key).code, inPl: !!(pl && t && pl.ids.includes(t.id)), missing: Desktop.missing.map(m => m.title), txt: document.querySelector('.lpm .xout').textContent }; });
  check(imp.ok && imp.rating === 4 && imp.color === 2 && imp.bpm === 120 && imp.grid === 0.05 && imp.cue === 0.05 && imp.hot0 === 2.05 && imp.key === '8A' && imp.mem.length === 1, 'import appli : morceau ouvert avec note, couleur, grille, cues et tonalité de rekordbox', JSON.stringify(imp));
  check(imp.inPl && imp.missing.join() === 'Absent,Néons' && /2 introuvables/.test(imp.txt), 'import appli : playlist créée, introuvables listés', imp.txt);
  await page.getByRole('button', { name: 'Relocaliser les introuvables…' }).click();
  await page.getByRole('button', { name: 'Chercher dans un dossier…' }).click();
  await page.waitForFunction(() => LIB.tracks.some(t => t.title === 'Absent'), null, { timeout: 30000 });
  const rel = await W(() => { const t = LIB.tracks.find(t => t.title === 'Absent'), pl = LIB.playlists.find(p => p.name === 'Club / Samedi'); return { path: t.path, rating: t.rating, color: t.color, inPl: pl.ids.includes(t.id), missing: Desktop.missing.length, bpm: t.bpm }; });
  check(rel.path === '/nouveau/Fantôme - Absent.mp3' && rel.rating === 5 && rel.color === 6 && rel.inPl && rel.missing === 1 && rel.bpm === 128, 'relocalisation : retrouvé par nom de fichier, infos et playlist rendues', JSON.stringify(rel));
  await page.keyboard.press('Escape');

  // Édition au clic droit : note, couleur, énergie, tags, commentaire.
  await page.fill('.libbar input[type=search]', 'kick');
  await page.waitForFunction(() => lib.rows.length === 1);
  await page.click('.lt tbody tr:not(.vpad)', { button: 'right' });
  await page.waitForSelector('.ctx');
  check(await W(() => [...document.querySelectorAll('.ctx button')].map(b => b.textContent).join('|').includes('Charger sur la platine A')), 'clic droit sur une ligne : menu (infos, charger, playlists)');
  await page.click('.ctx button:has-text("Modifier les infos")');
  await page.waitForSelector('.lpe');
  await page.click('.lpe .srow .st:nth-child(5)');
  await page.click('.lpe .sw[title="Vert"]');
  await W(() => { const t = LIB.tracks.find(t => t.title === 'Kick 120'); t.energy = 3; const r = document.querySelector('.lpe input[type=range]'); r.value = '8'; r.dispatchEvent(new Event('input')); });
  await page.fill('.lpe input[list=lp-tags]', 'peak, vocal, peak');
  await page.fill('.lpe textarea', 'À garder pour le closing');
  const ed = await W(() => { const t = LIB.tracks.find(t => t.title === 'Kick 120'); return { rating: t.rating, color: t.color, eu: t.energyUser, tags: t.tags.join(), comment: t.comment, cell: document.querySelector('.lt tbody tr:not(.vpad) td.nrg').textContent }; });
  check(ed.rating === 5 && ed.color === 5 && ed.eu === 8 && ed.tags === 'peak,vocal' && ed.comment === 'À garder pour le closing' && ed.cell === '8', 'panneau d’infos : note, couleur, énergie perso, tags sans doublon, commentaire', JSON.stringify(ed));
  await page.click('.lpe button:has-text("Auto")');
  check(await W(() => { const t = LIB.tracks.find(t => t.title === 'Kick 120'); return t.energyUser == null && document.querySelector('.lt td.nrg').textContent === '3'; }), 'énergie : « Auto » rend la valeur de l’analyse');
  await W(() => { const r = document.querySelector('.lpe input[type=range]'); r.value = '8'; r.dispatchEvent(new Event('input')); });
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('.lpe')), 'panneau d’infos : Échap le ferme');
  // Clic direct sur une étoile dans la table.
  await page.fill('.libbar input[type=search]', 'halog');
  await page.waitForFunction(() => lib.rows.length === 1);
  await page.click('.lt tbody tr:not(.vpad) td.stars span:nth-child(3)');
  check(await W(() => LIB.tracks.find(t => t.title === 'Halogène').rating === 3), 'note directe en cliquant une étoile de la table');
  await page.fill('.libbar input[type=search]', 'rating:>=5 tag:peak');
  await page.waitForFunction(() => lib.rows.length === 1 && lib.rows[0].t.title === 'Kick 120');
  check(true, 'recherche par champ dans la barre de la bibliothèque');
  await page.fill('.libbar input[type=search]', '');

  // Choix des colonnes.
  await page.click('details.colmenu summary');
  await page.click('details.colmenu label:has-text("Commentaire") input');
  check(await W(() => !!document.querySelector('.lt th.c-comment') && !LibPro.hidden('comment') && JSON.parse(localStorage.getItem('mixlab2.libcols')).indexOf('comment') < 0), 'colonnes : Commentaire affiché et mémorisé');
  await page.click('details.colmenu label:has-text("Énergie") input');
  check(await W(() => !document.querySelector('.lt th.c-energy')), 'colonnes : Énergie masquée');
  await page.click('details.colmenu label:has-text("Énergie") input');
  await page.click('details.colmenu summary');

  // Crate créée dans l'éditeur, puis listée et ouverte depuis la barre latérale.
  await page.getByRole('button', { name: '+ Nouvelle crate' }).click();
  await page.fill('.lpm input[aria-label="Nom de la crate"]', 'Peak notés');
  await W(() => { const s = document.querySelector('.lpm .rule select[aria-label=Champ]'); s.value = 'rating'; s.dispatchEvent(new Event('change')); });
  await page.click('.lpm button:has-text("+ Règle")');
  await W(() => { const s = [...document.querySelectorAll('.lpm .rule select[aria-label=Champ]')][1]; s.value = 'tag'; s.dispatchEvent(new Event('change')); });
  await page.fill('.lpm .rules .rule:nth-child(2) input', 'peak');
  const prev = await page.textContent('.lpm .pv');
  await page.click('.lpm button:has-text("Enregistrer")');
  const cr = await W(() => ({ n: LibPro.crates.length, view: lib.view, rows: lib.rows.map(r => r.t.title).join(), side: [...document.querySelectorAll('#lib-side .it')].some(b => b.textContent.includes('Peak notés')) }));
  check(cr.n === 1 && cr.view.startsWith('sc:') && cr.rows === 'Kick 120' && cr.side && /1 morceau/.test(prev), 'crate intelligente : éditeur, aperçu en direct, vue dans la barre latérale', JSON.stringify(cr) + ' ' + prev);
  await W(() => { LIB.tracks.find(t => t.title === 'Absent').tags = ['peak']; renderTable(); });
  check((await W(() => lib.rows.map(r => r.t.title).sort().join())) === 'Absent,Kick 120', 'crate : nouveau morceau correspondant ajouté en direct');
  await W(() => { lib.view = 'all'; renderSide(); renderTable(); });

  // Historique : on simule deux morceaux joués.
  await W(() => { const a = LIB.tracks.find(t => t.title === 'Kick 120'), b = LIB.tracks.find(t => t.title === 'Absent'), t0 = Date.now() - 600000;
    LIB.history.push({ track: a, time: new Date(t0), deck: 'A' }, { track: b, time: new Date(t0 + 210000), deck: 'B' }); a.lastPlayed = new Date(); renderSide(); });

  // Sauvegarde puis relance : tout revient.
  await W(() => Desktop.save());
  const saved = await W(() => window.__saved);
  check(saved && saved.includes('"crates"') && saved.includes('"rating":5') && saved.includes('Néons'), 'sauvegarde : notes, crates et morceau manquant gardés');
  await page.close();

  page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  watch(page);
  await page.addInitScript(fakeNative(saved));
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.filter(t => t.path).length >= 2, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => { const t = LIB.tracks.find(t => t.title === 'Kick 120'), a = LIB.tracks.find(t => t.title === 'Absent'), pl = LIB.playlists.find(p => p.name === 'Club / Samedi');
    return { rating: t.rating, color: t.color, eu: t.energyUser, tags: t.tags.join(), comment: t.comment, mem: t.mem && t.mem[0].name, hotName: t.hotName && t.hotName[0], last: !!t.lastPlayed, aPath: a && a.path, inPl: !!(pl && a && pl.ids.includes(a.id) && pl.ids.includes(t.id)), crates: LibPro.crates.map(c => c.name).join(), missing: Desktop.missing.map(m => m.title).join(), sets: LibPro.sets.length, setItems: LibPro.sets[0] && LibPro.sets[0].items.length }; });
  check(back.rating === 5 && back.color === 5 && back.eu === 8 && back.tags === 'peak,vocal' && back.comment === 'À garder pour le closing' && back.mem === 'Break' && back.hotName === 'Drop' && back.last, 'relance : note, couleur, énergie, tags, commentaire, cues nommés', JSON.stringify(back));
  check(back.aPath === '/nouveau/Fantôme - Absent.mp3' && back.inPl && back.crates === 'Peak notés' && back.missing === 'Néons' && back.sets === 1 && back.setItems === 2, 'relance : morceau relocalisé, playlist, crate, manquant et set précédent conservés', JSON.stringify(back));

  // Tracklist du set précédent.
  await page.getByRole('button', { name: /Exporter la tracklist/ }).click();
  const tl = await page.textContent('pre.tl');
  check(/^Mixlab · set du/.test(tl) && tl.includes('00:00 Testeur - Kick 120\n03:30 Fantôme - Absent'), 'historique : tracklist du set précédent', JSON.stringify(tl));
  await page.click('.setrow button:has-text("CSV")');
  await page.waitForFunction(() => window.__exports.length === 1);
  const ex = await W(() => window.__exports[0]);
  check(/^tracklist-.*\.csv$/.test(ex.name) && ex.text.split('\n')[0] === 'Position,Début,Heure,Platine,Artiste,Titre,BPM,Tonalité' && ex.text.split('\n')[2].startsWith('2,03:30,') && ex.text.includes(',B,Fantôme,Absent,128,8A'), 'historique : CSV enregistré par l’appli', ex.text.split('\n')[2]);
  await page.keyboard.press('Escape');
  const hx = await W(() => { const t0 = new Date(2026, 9, 10, 22, 0, 0), T = (title, artist) => ({ title, artist, bpm: 124, key: { pc: 9, minor: true } });
    const H = [{ track: T('Un', 'X'), time: t0, deck: 'A' }, { track: T('Deux, "le retour"', 'Y'), time: new Date(+t0 + 210000), deck: 'B' }, { track: T('Trois', ''), time: new Date(+t0 + 3725000), deck: 'A' }];
    return { txt: LibPro.tracklistText(H), csv: LibPro.tracklistCSV(H) }; });
  check(hx.txt === 'Mixlab · set du 10/10/2026 à 22h00\n\n00:00 X - Un\n03:30 Y - Deux, "le retour"\n1:02:05 Trois\n', 'tracklist texte : temps relatifs au début, heures', JSON.stringify(hx.txt));
  check(hx.csv.split('\n')[2] === '2,03:30,22:03:30,B,Y,"Deux, ""le retour""",124,8A', 'tracklist CSV : guillemets échappés', hx.csv.split('\n')[2]);

  // Export rekordbox puis relecture : identique.
  const rt = await W(() => {
    const ts = LIB.tracks.filter(t => t.path), pl = { id: 'x', name: 'Aller-retour', ids: ts.map(t => t.id).reverse() };
    const xml = LibPro.toRekordbox(ts, [pl], []), r = LibPro.parseRekordbox(xml), diff = [];
    ts.forEach((t, i) => { const x = r.tracks[i], same = (a, b, e = .0011) => a == null ? b == null : Math.abs(a - b) < e;
      if (x.title !== t.title || x.artist !== t.artist || x.genre !== t.genre || x.path !== t.path) diff.push('texte ' + i);
      if (!same(x.bpm, t.bpm, .006) || !same(x.grid, t.grid) || !same(x.cue, t.cue)) diff.push('tempo ' + i + ' ' + [x.bpm, t.bpm, x.grid, t.grid, x.cue, t.cue]);
      if (keyInfo(x.key)?.code !== keyInfo(t.key)?.code || x.rating !== (t.rating || 0) || x.color !== (t.color || 0) || x.comment !== (t.comment || '')) diff.push('infos ' + i);
      if (t.hot.some((h, n) => !same(x.hot[n], h)) || JSON.stringify((t.mem || []).map(m => m.name)) !== JSON.stringify(x.mem.map(m => m.name))) diff.push('cues ' + i);
    });
    if (JSON.stringify(r.playlists) !== JSON.stringify([{ name: 'Aller-retour', items: ts.map((_, i) => i).reverse() }])) diff.push('playlist ' + JSON.stringify(r.playlists));
    return { diff, n: r.tracks.length, xml };
  });
  check(rt.n === 2 && !rt.diff.length, 'export rekordbox XML puis relecture : identique', rt.diff.join(' | '));
  check(rt.xml.includes('Location="file://localhost/nouveau/Fant%C3%B4me%20-%20Absent.mp3"') && rt.xml.includes('Colour="0x00FF00"') && rt.xml.includes('Rating="255"'), 'export rekordbox : emplacement encodé, couleur, note');
  const m3 = await W(() => LibPro.toM3U(LIB.tracks.filter(t => t.path), 'Set'));
  check(m3.startsWith('#EXTM3U\n#PLAYLIST:Set\n#EXTINF:8,Testeur - Kick 120\n/musique/Testeur - Kick 120.wav\n'), 'export M3U8', JSON.stringify(m3.slice(0, 90)));
  await page.getByRole('button', { name: 'Import / export' }).click();
  await page.click('.lpm button:has-text("Collection en rekordbox XML")');
  await page.waitForFunction(() => window.__exports.length === 2);
  check(await W(() => window.__exports[1].name === 'mixlab-rekordbox.xml' && window.__exports[1].text.includes('<DJ_PLAYLISTS')), 'export rekordbox depuis la fenêtre Import / export');
  await page.keyboard.press('Escape');

  // Playlists : menus contextuels (renommer, monter, supprimer, réordonner, retirer).
  await W(() => { lib.view = 'all'; renderSide(); renderTable(); });
  const plBtn = n => page.locator('#lib-side button.it', { hasText: n }).first();
  await plBtn('Warm-up').click({ button: 'right' });
  await page.click('.ctx button:has-text("Renommer")');
  await page.fill('.lpm input[aria-label="Nom de la playlist"]', 'Ouverture');
  await page.keyboard.press('Enter');
  await plBtn('Ouverture').click({ button: 'right' });
  await page.click('.ctx button:text-is("Monter")');
  await plBtn('Peak time').click({ button: 'right' });
  await page.click('.ctx button:has-text("Supprimer")');
  await page.click('.lpm button.red');
  const pls = await W(() => LIB.playlists.map(p => p.name).join());
  check(pls.startsWith('Ouverture,Préparation') && !pls.includes('Peak time'), 'playlists : renommer, monter, supprimer', pls);
  await plBtn('Club / Samedi').click();
  await page.waitForFunction(() => lib.rows.length === 2);
  const o0 = await W(() => lib.rows.map(r => r.t.title).join());
  await page.click('.lt tbody tr:not(.vpad) >> nth=1', { button: 'right' });
  await page.click('.ctx button:has-text("Monter dans la playlist")');
  const o1 = await W(() => lib.rows.map(r => r.t.title).join());
  await page.click('.lt tbody tr:not(.vpad) >> nth=0', { button: 'right' });
  await page.click('.ctx button:has-text("Retirer de")');
  const o2 = await W(() => lib.rows.map(r => r.t.title).join());
  check(o0 === 'Kick 120,Absent' && o1 === 'Absent,Kick 120' && o2 === 'Kick 120', 'playlist : réordonner et retirer un morceau', [o0, o1, o2].join(' → '));
  await W(() => Desktop.save());
  const saved2 = await W(() => window.__saved);

  // Clavier : « / » et Ctrl+F vers la recherche, Échap l'efface, flèches, Entrée et Maj+flèches pour charger.
  await W(() => { lib.view = 'all'; ui.sel = null; renderSide(); renderTable(); document.activeElement && document.activeElement.blur(); });
  await page.keyboard.press('/');
  check(await W(() => document.activeElement.matches('.libbar input[type=search]')), 'clavier : « / » place le curseur dans la recherche');
  await page.keyboard.type('124 house');
  await page.waitForTimeout(100);
  check((await W(() => lib.rows.map(r => r.t.title).join())) === 'Néons', 'recherche mot à mot : « 124 house »');
  await page.keyboard.press('Escape');
  check(await W(() => lib.q === '' && document.querySelector('.libbar input[type=search]').value === '' && lib.rows.length > 4), 'clavier : Échap efface la recherche');
  await page.keyboard.press('Control+f');
  check(await W(() => document.activeElement.matches('.libbar input[type=search]')), 'clavier : Ctrl+F place le curseur dans la recherche');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');
  const sel = await W(() => ({ sel: ui.sel, want: lib.rows[1].t.id, dom: document.querySelector('.lt tr.sel') && document.querySelector('.lt tr.sel')._r.t.id }));
  check(sel.sel === sel.want && sel.dom === sel.want, 'clavier : ↓ / ↑ déplacent la sélection', JSON.stringify(sel));
  await W(() => { ui.sel = LIB.tracks.find(t => t.title === 'Kick 120').id; });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => decks[0].track && decks[0].track.title === 'Kick 120');
  await W(() => { ui.sel = LIB.tracks.find(t => t.title === 'Absent').id; });
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForFunction(() => decks[1].track && decks[1].track.title === 'Absent');
  check(true, 'clavier : Entrée charge sur A, Maj+→ sur B');
  await W(() => { decks[0].ui.fader.set(1); ui.setX(.5); controls.get('A.play').press({}); ui.sel = LIB.tracks.find(t => t.title === 'Halogène').id; });
  await page.waitForTimeout(200);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(300);
  check(await W(() => decks[0].track.title === 'Kick 120' && decks[0].playing), 'clavier : la platine à l’antenne n’est pas remplacée');
  await W(() => controls.get('A.play').press({}));

  // Double-clic : jamais sur un morceau prêt sans demander.
  await page.fill('.libbar input[type=search]', 'halog');
  await page.waitForFunction(() => lib.rows.length === 1);
  await page.dblclick('.lt tbody tr:not(.vpad)');
  await page.waitForSelector('.ctx');
  const dq = await W(() => ({ t: document.querySelector('.ctx-t').textContent, a: decks[0].track.title, b: decks[1].track.title }));
  check(dq.t === 'Remplacer quelle platine ?' && dq.a === 'Kick 120' && dq.b === 'Absent', 'double-clic : platines prêtes, Mixlab demande laquelle remplacer');
  await page.click('.ctx button:has-text("B ·")');
  await page.waitForFunction(() => decks[1].track.title === 'Halogène');
  await W(() => { decks[0].logged = true; });
  await page.fill('.libbar input[type=search]', 'ligne');
  await page.waitForFunction(() => lib.rows.length === 1);
  await page.dblclick('.lt tbody tr:not(.vpad)');
  await page.waitForFunction(() => decks[0].track.title === 'Ligne 7');
  check(!(await page.isVisible('.ctx')), 'double-clic : charge directement sur la platine déjà jouée');
  await page.fill('.libbar input[type=search]', '');

  // La platine maître bouge : les pastilles changent sans reconstruire la table.
  const cp = await W(async () => { lib.view = 'all'; renderTable(); const tr = lib.tbody.querySelector('tr:not(.vpad)'); S.master = decks[0]; decks[0].setPitch(.04);
    await new Promise(r => setTimeout(r, 1300)); const same = tr.isConnected; decks[0].setPitch(0); return same; });
  check(cp, 'platine maître modifiée : lignes gardées, seules les classes changent');

  // Doublons.
  const dup = await W(() => { const F = [{ id: 1, title: 'Néons', artist: 'Démo  Mixlab', path: '/a.wav' }, { id: 2, title: 'NEONS', artist: 'demo mixlab', path: '/b.wav' }, { id: 3, title: 'Autre', artist: 'X', path: '/a.wav' }, { id: 4, title: 'Seul', artist: 'Y', path: '/c.wav' }];
    return LibPro.duplicates(F).map(g => g.map(t => t.id).join('+')).join(' '); });
  check(dup === '1+3 2' || dup === '1+3 1+2' || dup === '1+2 1+3', 'doublons : même chemin, même artiste et titre (accents et casse ignorés)', dup);
  await W(() => { const t = LIB.tracks.find(t => t.title === 'Néons'); addTrack(t.buffer, { title: 'Neons', artist: 'Démo Mixlab' }); lib.view = 'dups'; renderSide(); renderTable(); });
  check(await W(() => lib.rows.length === 2 && lib.rows.every(r => /n[ée]ons/i.test(r.t.title))), 'doublons : vue de la barre latérale');
  await W(() => { lib.view = 'all'; renderTable(); });

  // Playlist Spotify / Deezer retrouvée dans la collection.
  const mt = await W(([csv, list]) => { const a = LibPro.matchList(LibPro.parseList(csv).items), b = LibPro.matchList(LibPro.parseList(list).items);
    return { a: a.map(r => r.track ? r.track.title : '-').join(), b: b.map(r => r.track ? r.track.title : '-').join(), links: LibPro.parseList(list).links }; }, [CSV, LIST]);
  check(mt.a === 'Néons,Quai 9,-,-', 'correspondance CSV : version et feat. ignorés, remix distinct, inconnu absent', mt.a);
  check(mt.b === 'Ligne 7,Néons,-' && mt.links === 1, 'correspondance liste collée : numéros, tiret long, accents, lien ignoré', mt.b);
  await W(csv => LibPro.exchangeList(csv, 'Ma playlist Spotify.csv'), CSV);
  const shops = await W(() => [...document.querySelectorAll('.lpm a.shop')].map(a => a.href));
  check(shops.length === 4 && shops[0].startsWith('https://bandcamp.com/search?q=') && shops[1].startsWith('https://www.beatport.com/search?q='), 'introuvables : liens Bandcamp et Beatport', shops[0]);
  await page.click('.lpm button:has-text("Créer la playlist")');
  check(await W(() => { const p = LIB.playlists.find(p => p.name === 'Ma playlist Spotify'); return p && p.ids.length === 2 && lib.view === 'pl:' + p.id; }), 'playlist créée avec les morceaux trouvés');
  await W(() => { lib.view = 'all'; renderSide(); renderTable(); });

  // 5 000 morceaux : la table reste rapide.
  const perf = await W(() => {
    const n0 = LIB.tracks.length, keys = [...Array(24)].map((_, i) => ({ pc: i % 12, minor: i < 12 }));
    for (let i = 0; i < 5000; i++) LIB.tracks.push({ id: ++LIB.seq, title: 'Morceau ' + i, artist: 'Artiste ' + (i % 300), genre: ['House', 'Techno', 'Disco'][i % 3], bpm: 110 + (i % 30), grid: 0, key: keys[i % 24], duration: 300, hot: Array(8).fill(null), cue: 0, plays: i % 5, added: new Date(Date.now() - i * 1e6), rating: i % 6, color: i % 9, tags: i % 7 ? [] : ['peak'], energy: 1 + i % 10 });
    let t = performance.now(); renderSide(); const side = performance.now() - t;
    t = performance.now(); renderTable(); const all = performance.now() - t;
    lib.sort = { k: 'title', dir: 1 }; t = performance.now(); renderTable(); const sorted = performance.now() - t;
    lib.q = 'bpm:120-126 rating:>=4 tag:peak'; t = performance.now(); renderTable(); const q = performance.now() - t; const nq = lib.rows.length;
    lib.q = ''; renderTable(); t = performance.now(); refreshCompat(); const rc = performance.now() - t;
    return { side, all, sorted, q, nq, rc, dom: lib.tbody.children.length, rows: lib.rows.length - n0 };
  });
  check(perf.rows === 5000 && perf.dom < 150, 'table virtuelle : 5 000 morceaux de plus, moins de 150 lignes dans la page', perf.dom + ' lignes');
  check(perf.all < 250 && perf.sorted < 300 && perf.q < 300 && perf.side < 300 && perf.rc < 30, 'temps de rendu avec 5 000 morceaux', `liste ${perf.all.toFixed(0)} ms · tri ${perf.sorted.toFixed(0)} ms · recherche ${perf.q.toFixed(0)} ms (${perf.nq}) · barre latérale ${perf.side.toFixed(0)} ms · pastilles maître ${perf.rc.toFixed(1)} ms`);
  await W(() => { lib.tw.scrollTop = lib.tw.scrollHeight / 2; });
  await page.waitForTimeout(150);
  const mid = await W(() => { const r = [...lib.tbody.querySelectorAll('tr:not(.vpad)')], b = lib.tw.getBoundingClientRect(); const vis = r.filter(x => { const y = x.getBoundingClientRect(); return y.bottom > b.top + 30 && y.top < b.bottom; }); return { n: vis.length, first: vis[0] && vis[0].children[2].textContent, h: lib.tw.scrollHeight }; });
  check(mid.n > 3 && mid.first && mid.first !== 'Kick 120', 'défilement au milieu : les lignes visibles sont dessinées', JSON.stringify(mid));
  await W(() => { lib.tw.scrollTop = 0; });
  await page.waitForTimeout(100);
  await page.screenshot({ path: '/tmp/mixlab-library.png' });
  await page.close();

  // Relance de l'appli : playlists renommées, déplacées, supprimées restent comme on les a laissées.
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watch(page);
  await page.addInitScript(fakeNative(saved2));
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.filter(t => t.path).length >= 2, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  const pl3 = await W(() => LIB.playlists.map(p => p.name + ':' + p.ids.map(i => LIB.tracks.find(t => t.id === i).title).join('+')).join(' | '));
  check(pl3.startsWith('Ouverture:') && pl3.includes('Préparation:') && !pl3.includes('Peak time') && pl3.includes('Club / Samedi:Kick 120 |'), 'relance : playlists renommées, déplacées, supprimées, réordonnées', pl3);
  await page.close();

  /* ---------- 2. Navigateur : IndexedDB, et seulement les infos des morceaux déjà présents ---------- */
  const rate = 22050, n = rate * 4, wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = (i % (rate / 2)) / rate; wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 18) * 30000), 44 + i * 2); }
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  watch(page);
  await page.goto(url);
  await page.waitForFunction(() => LIB.tracks.length >= 4 && LibPro.state, null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Import / export' }).click();
  check((await page.textContent('.lpm')).includes('Dans le navigateur, Mixlab ne peut pas ouvrir les fichiers audio'), 'navigateur : la limite est expliquée');
  await page.setInputFiles('.lpm input[type=file]', { name: 'rekordbox.xml', mimeType: 'application/xml', buffer: Buffer.from(RB) });
  await page.waitForSelector('.lpm .xout p.ok');
  const br = await W(() => { const t = LIB.tracks.find(t => t.title === 'Néons'); return { rating: t.rating, color: t.color, txt: document.querySelector('.lpm .xout').textContent, pls: LIB.playlists.map(p => p.name) }; });
  check(br.rating === 3 && br.color === 8 && /1 retrouvé dans/.test(br.txt) && /2 introuvables/.test(br.txt), 'navigateur : infos rekordbox appliquées au morceau déjà là', br.txt);
  await page.keyboard.press('Escape');
  await W(() => { const t = LIB.tracks.find(t => t.title === 'Quai 9'); t.rating = 2; t.tags = ['warm-up']; t.hot[3] = 12.5; t.cue = 4; LibPro.edit(t); });
  await page.click('.lpe .sw[title="Bleu"]');
  await page.keyboard.press('Escape');
  await W(() => LibPro.saveCrate({ id: 'cb', name: 'Warm-up', match: 'all', rules: [{ f: 'tag', a: 'warm-up' }] }));
  // Un vrai fichier importé, mis dans une playlist renommée ; une playlist de départ supprimée.
  await page.setInputFiles('.libbar label.filebtn input', { name: 'Testeur - Kick 120.wav', mimeType: 'audio/wav', buffer: wav });
  await page.waitForFunction(() => LIB.tracks.some(t => t.file === 'Testeur - Kick 120.wav'), null, { timeout: 30000 });
  await W(() => { const k = LIB.tracks.find(t => t.file === 'Testeur - Kick 120.wav'), q = LIB.tracks.find(t => t.title === 'Quai 9'); k.rating = 4; k.cue = 1.5;
    const p = LIB.playlists.find(p => p.id === 'warm'); p.name = 'Mon warm-up'; p.ids = [k.id, q.id]; LIB.playlists.splice(LIB.playlists.findIndex(p => p.id === 'peak'), 1); renderSide(); });
  await W(() => LibPro.saveBrowser());
  await page.reload();
  await page.waitForFunction(() => LIB.tracks.length >= 4 && LibPro.state, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const br2 = await W(() => { const t = LIB.tracks.find(t => t.title === 'Quai 9'), p = LIB.playlists.find(p => p.id === 'warm');
    return { rating: t.rating, color: t.color, tags: (t.tags || []).join(), hot: t.hot[3], cue: t.cue, crates: LibPro.crates.map(c => c.name).join(), n: LibPro.crateTracks(LibPro.crates[0]).length,
      pls: LIB.playlists.map(p => p.name).join(), warm: p && p.ids.map(i => LIB.tracks.find(t => t.id === i).title).join(), missing: LibPro.missingList().map(m => m.file).join(),
      side: [...document.querySelectorAll('#lib-side .it')].find(b => b.textContent.startsWith('Fichiers manquants')).textContent }; });
  check(br2.color === 7 && br2.rating === 2 && br2.tags === 'warm-up' && br2.hot === 12.5 && br2.cue === 4 && br2.crates === 'Warm-up' && br2.n === 1, 'navigateur : infos, cues et crates gardées après rechargement (IndexedDB)', JSON.stringify(br2));
  check(br2.pls.includes('Mon warm-up') && !br2.pls.includes('Peak time') && br2.warm === 'Quai 9' && br2.missing === 'Testeur - Kick 120.wav' && br2.side === 'Fichiers manquants1', 'navigateur : playlists gardées, fichier à réimporter signalé', JSON.stringify(br2));
  await page.click('#lib-side .it:has-text("Fichiers manquants")');
  check((await page.textContent('.lpm')).includes('Réimporte ces fichiers'), 'navigateur : la fenêtre explique qu’il faut réimporter');
  await page.keyboard.press('Escape');
  await page.setInputFiles('.libbar label.filebtn input', { name: 'Testeur - Kick 120.wav', mimeType: 'audio/wav', buffer: wav });
  await page.waitForFunction(() => LIB.tracks.some(t => t.file === 'Testeur - Kick 120.wav'), null, { timeout: 30000 });
  const br3 = await W(() => { const k = LIB.tracks.find(t => t.file === 'Testeur - Kick 120.wav'), p = LIB.playlists.find(p => p.id === 'warm');
    return { rating: k.rating, cue: k.cue, warm: p.ids.map(i => LIB.tracks.find(t => t.id === i).title).join(), missing: LibPro.missingList().length }; });
  check(br3.rating === 4 && br3.cue === 1.5 && br3.warm === 'Quai 9,Kick 120' && br3.missing === 0, 'navigateur : le fichier réimporté retrouve note, cue et playlist', JSON.stringify(br3));
  await page.close();


  await browser.close();
  check(!errors.length, 'Aucune erreur dans la page', errors.join(' | '));
  console.log(failed ? failed + ' échec(s)' : 'Bibliothèque pro : tout est vert');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
