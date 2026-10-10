'use strict';
// Processus principal : fenêtre, permissions (MIDI, cartes son), accès aux fichiers de musique.
const { app, BrowserWindow, ipcMain, dialog, session, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const AUDIO_EXT = /\.(mp3|wav|aiff?|flac|ogg|m4a|aac|opus|mp4)$/i;
const MAX_FILE = 400 * 1024 * 1024; // un mix d'une heure en WAV tient dedans
const libFile = () => path.join(app.getPath('userData'), 'library.json');

// Le moteur audio doit tourner sans geste utilisateur et sans être ralenti en arrière-plan.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// Seuls les fichiers que l'utilisateur a choisis (dialogue, glisser-déposer, bibliothèque) sont lisibles.
const allowed = new Set();

async function walk(dir, out, depth = 0) {
  if (depth > 12) return;
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out, depth + 1);
    else if (e.isFile() && AUDIO_EXT.test(e.name)) out.push(p);
  }
}
const describe = p => ({ path: p, name: path.basename(p) });

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 960, minWidth: 1024, minHeight: 640,
    backgroundColor: '#08090b',
    title: 'Mixlab',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  // Les liens externes s'ouvrent dans le navigateur, jamais dans l'appli.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
}

app.whenReady().then(() => {
  // MIDI (contrôleurs), SysEx (LED de certaines tables) et périphériques audio (noms des cartes son).
  const ok = new Set(['midi', 'midiSysex', 'media', 'speaker-selection']);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(ok.has(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => ok.has(perm));

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Fichier', submenu: [{ role: 'quit', label: 'Quitter' }] },
    { label: 'Affichage', submenu: [{ role: 'reload', label: 'Recharger' }, { role: 'togglefullscreen', label: 'Plein écran' }, { role: 'toggleDevTools', label: 'Outils de développement' }] },
  ]));

  ipcMain.handle('pick-files', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'aif', 'aiff', 'flac', 'ogg', 'm4a', 'aac', 'opus', 'mp4'] }] });
    if (r.canceled) return [];
    r.filePaths.forEach(p => allowed.add(p));
    return r.filePaths.map(describe);
  });
  ipcMain.handle('pick-folder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return [];
    const out = [];
    await walk(r.filePaths[0], out);
    out.sort((a, b) => a.localeCompare(b));
    out.forEach(p => allowed.add(p));
    return out.map(describe);
  });
  // Fichier glissé depuis l'explorateur : le chemin vient de webUtils dans le preload.
  ipcMain.handle('allow-dropped', (_e, p) => { if (typeof p === 'string' && AUDIO_EXT.test(p)) { allowed.add(p); return true; } return false; });
  ipcMain.handle('read-file', async (_e, p) => {
    if (!allowed.has(p)) throw new Error('Fichier non autorisé');
    const st = await fs.stat(p);
    if (st.size > MAX_FILE) throw new Error('Fichier trop gros');
    const b = await fs.readFile(p);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  });

  // Bibliothèque : analyses, cues et playlists survivent au redémarrage.
  ipcMain.handle('library-load', async () => {
    try {
      const data = JSON.parse(await fs.readFile(libFile(), 'utf8'));
      (data.tracks || []).forEach(t => t && typeof t.path === 'string' && allowed.add(t.path));
      return data;
    } catch { return null; }
  });
  ipcMain.handle('library-save', async (_e, json) => {
    if (typeof json !== 'string' || json.length > 50e6) return false;
    const tmp = libFile() + '.tmp';
    await fs.writeFile(tmp, json, 'utf8');
    await fs.rename(tmp, libFile());
    return true;
  });
  ipcMain.handle('exists', async (_e, p) => { if (!allowed.has(p)) return false; try { await fs.access(p); return true; } catch { return false; } });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
