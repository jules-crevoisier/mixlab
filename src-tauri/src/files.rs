//! Accès aux fichiers de musique et à la bibliothèque.
//!
//! Seuls les fichiers que l'utilisateur a choisis (dialogue, dossier,
//! bibliothèque déjà enregistrée) sont lisibles depuis l'interface.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Response;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

const AUDIO_EXT: &[&str] = &["mp3", "wav", "aif", "aiff", "flac", "ogg", "m4a", "aac", "opus", "mp4"];
/// Un mix d'une heure en WAV tient dedans.
const MAX_FILE: u64 = 400 * 1024 * 1024;
const MAX_LIBRARY: usize = 50_000_000;
/// Collections d'autres logiciels et listes de lecture qu'on sait relire.
const LIBRARY_EXT: &[&str] = &["xml", "m3u", "m3u8", "csv", "txt"];
const MAX_IMPORT: u64 = 100 * 1024 * 1024;
const MAX_EXPORT: usize = 100_000_000;
/// Deux heures de mix en WAV 24 bits stéréo à 48 kHz.
const MAX_RECORDING: u64 = 2_100_000_000;
/// Liens d'achat qu'on accepte d'ouvrir dans le navigateur du système.
const SHOP_PREFIX: &[&str] = &["https://bandcamp.com/search?", "https://www.beatport.com/search?"];

#[derive(Default)]
pub struct Allowed(Mutex<HashSet<PathBuf>>);

impl Allowed {
    fn add(&self, p: &Path) {
        self.0.lock().unwrap().insert(p.to_path_buf());
    }
    fn has(&self, p: &Path) -> bool {
        self.0.lock().unwrap().contains(p)
    }
}

#[derive(Serialize)]
pub struct Picked {
    path: String,
    name: String,
}

pub fn is_audio(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXT.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Parcourt un dossier et ses sous-dossiers (12 niveaux au plus).
pub fn walk(dir: &Path, out: &mut Vec<PathBuf>, depth: u32) {
    if depth > 12 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let name = e.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        let Ok(ft) = e.file_type() else { continue };
        let p = e.path();
        if ft.is_dir() {
            walk(&p, out, depth + 1);
        } else if ft.is_file() && is_audio(&p) {
            out.push(p);
        }
    }
}

fn describe(allowed: &Allowed, paths: Vec<PathBuf>) -> Vec<Picked> {
    paths
        .into_iter()
        .map(|p| {
            allowed.add(&p);
            Picked {
                name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                path: p.to_string_lossy().into_owned(),
            }
        })
        .collect()
}

#[tauri::command]
pub async fn pick_files(app: AppHandle, allowed: State<'_, Allowed>) -> Result<Vec<Picked>, String> {
    let picked = app.dialog().file().add_filter("Audio", AUDIO_EXT).blocking_pick_files();
    let paths: Vec<PathBuf> = picked.unwrap_or_default().into_iter().filter_map(|f| f.into_path().ok()).collect();
    Ok(describe(&allowed, paths))
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle, allowed: State<'_, Allowed>) -> Result<Vec<Picked>, String> {
    let Some(dir) = app.dialog().file().blocking_pick_folder().and_then(|f| f.into_path().ok()) else {
        return Ok(vec![]);
    };
    let mut out = Vec::new();
    walk(&dir, &mut out, 0);
    out.sort();
    Ok(describe(&allowed, out))
}

/// Renvoie le fichier brut ; l'interface le reçoit comme un ArrayBuffer.
#[tauri::command]
pub async fn read_file(path: String, allowed: State<'_, Allowed>) -> Result<Response, String> {
    let p = PathBuf::from(&path);
    if !allowed.has(&p) {
        return Err("Fichier non autorisé".into());
    }
    let size = std::fs::metadata(&p).map_err(|e| e.to_string())?.len();
    if size > MAX_FILE {
        return Err("Fichier trop gros".into());
    }
    Ok(Response::new(std::fs::read(&p).map_err(|e| e.to_string())?))
}

#[tauri::command]
pub async fn exists(path: String, allowed: State<'_, Allowed>) -> Result<bool, String> {
    let p = PathBuf::from(path);
    Ok(allowed.has(&p) && p.is_file())
}

fn library_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("library.json"))
}

/// Bibliothèque : analyses, cues et playlists survivent au redémarrage.
#[tauri::command]
pub async fn library_load(app: AppHandle, allowed: State<'_, Allowed>) -> Result<Option<serde_json::Value>, String> {
    let Ok(text) = std::fs::read_to_string(library_file(&app)?) else { return Ok(None) };
    let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) else { return Ok(None) };
    if let Some(tracks) = data.get("tracks").and_then(|t| t.as_array()) {
        for p in tracks.iter().filter_map(|t| t.get("path").and_then(|p| p.as_str())) {
            allowed.add(Path::new(p));
        }
    }
    Ok(Some(data))
}

#[tauri::command]
pub async fn library_save(app: AppHandle, json: String) -> Result<bool, String> {
    if json.len() > MAX_LIBRARY {
        return Ok(false);
    }
    let f = library_file(&app)?;
    let tmp = f.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &f).map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn is_library_file(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| LIBRARY_EXT.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Décode les %XX (UTF-8) ; une séquence invalide est gardée telle quelle.
pub fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Emplacement lu dans une collection (rekordbox, iTunes, M3U) vers un chemin :
/// `file://localhost/C:/Musique/a%20b.mp3` donne `C:/Musique/a b.mp3`,
/// `file:///Users/moi/a.mp3` donne `/Users/moi/a.mp3`, `file://serveur/partage/a.mp3`
/// donne `//serveur/partage/a.mp3`. Un chemin ordinaire est rendu tel quel.
pub fn location_to_path(loc: &str) -> String {
    let loc = loc.trim();
    let is_uri = loc.get(..7).map(|p| p.eq_ignore_ascii_case("file://")).unwrap_or(false);
    if !is_uri {
        return loc.to_string();
    }
    let rest = &loc[7..];
    let (host, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, ""),
    };
    let mut p = percent_decode(path);
    let b = p.as_bytes();
    if b.len() >= 3 && b[0] == b'/' && b[1].is_ascii_alphabetic() && b[2] == b':' {
        p.remove(0);
    }
    if !host.is_empty() && !host.eq_ignore_ascii_case("localhost") {
        p = format!("//{host}{p}");
    }
    p
}

#[derive(Serialize)]
pub struct LibraryFile {
    path: String,
    name: String,
    text: String,
}

/// Choix d'une collection à importer (rekordbox XML, iTunes XML, M3U, CSV) ; renvoie son texte.
#[tauri::command]
pub async fn pick_library_file(app: AppHandle) -> Result<Option<LibraryFile>, String> {
    let picked = app.dialog().file().add_filter("Collections et playlists", LIBRARY_EXT).blocking_pick_file();
    let Some(p) = picked.and_then(|f| f.into_path().ok()) else { return Ok(None) };
    if !is_library_file(&p) {
        return Err("Type de fichier non pris en charge".into());
    }
    if std::fs::metadata(&p).map_err(|e| e.to_string())?.len() > MAX_IMPORT {
        return Err("Fichier trop gros".into());
    }
    let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
    Ok(Some(LibraryFile {
        name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        path: p.to_string_lossy().into_owned(),
        text: String::from_utf8_lossy(&bytes).into_owned(),
    }))
}

/// Ouvre l'accès aux morceaux cités par une collection importée : seulement les
/// fichiers audio qui existent. Renvoie, pour chaque emplacement, le chemin lisible ou null.
#[tauri::command]
pub async fn allow_paths(paths: Vec<String>, allowed: State<'_, Allowed>) -> Result<Vec<Option<String>>, String> {
    Ok(paths
        .iter()
        .map(|loc| {
            let s = location_to_path(loc);
            let p = PathBuf::from(&s);
            (is_audio(&p) && p.is_file()).then(|| {
                allowed.add(&p);
                s
            })
        })
        .collect())
}

/// Enregistre un export (rekordbox XML, M3U8, tracklist) là où l'utilisateur le choisit.
#[tauri::command]
pub async fn save_export(app: AppHandle, name: String, text: String) -> Result<Option<String>, String> {
    if text.len() > MAX_EXPORT {
        return Err("Export trop gros".into());
    }
    let ext = Path::new(&name).extension().and_then(|e| e.to_str()).unwrap_or("txt").to_string();
    let Some(p) = app
        .dialog()
        .file()
        .set_file_name(&name)
        .add_filter(ext.to_uppercase(), &[ext.as_str()])
        .blocking_save_file()
        .and_then(|f| f.into_path().ok())
    else {
        return Ok(None);
    };
    std::fs::write(&p, text).map_err(|e| e.to_string())?;
    Ok(Some(p.to_string_lossy().into_owned()))
}

/// Nom proposé pour un enregistrement : le dernier segment, sans caractères interdits,
/// avec l'extension .wav imposée.
pub fn safe_wav_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let clean: String = base.chars().filter(|c| !c.is_control() && !":*?\"<>|".contains(*c)).collect();
    let stem = clean.trim().trim_end_matches(".wav").trim_end_matches(".WAV").trim();
    format!("{}.wav", if stem.is_empty() { "mixlab-mix" } else { stem })
}

/// Enregistre le mix en WAV là où l'utilisateur le choisit. Le son arrive en binaire
/// brut (pas en JSON) : une heure de mix pèse plusieurs centaines de Mo.
#[tauri::command]
pub async fn save_binary(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Données binaires attendues".into());
    };
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("Ce n'est pas un fichier WAV".into());
    }
    if bytes.len() as u64 > MAX_RECORDING {
        return Err("Enregistrement trop gros".into());
    }
    let raw = request.headers().get("x-mixlab-name").and_then(|v| v.to_str().ok()).unwrap_or("");
    let name = safe_wav_name(&percent_decode(raw));
    let Some(p) = app
        .dialog()
        .file()
        .set_file_name(&name)
        .add_filter("WAV", &["wav"])
        .blocking_save_file()
        .and_then(|f| f.into_path().ok())
    else {
        return Ok(None);
    };
    std::fs::write(&p, bytes).map_err(|e| e.to_string())?;
    Ok(Some(p.to_string_lossy().into_owned()))
}

pub fn is_shop_link(url: &str) -> bool {
    SHOP_PREFIX.iter().any(|p| url.starts_with(p)) && !url.chars().any(|c| c.is_whitespace() || c == '"' || c == '\\')
}

/// Ouvre une recherche Bandcamp ou Beatport dans le navigateur du système.
#[tauri::command]
pub async fn open_shop(url: String) -> Result<bool, String> {
    if !is_shop_link(&url) {
        return Err("Lien refusé".into());
    }
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", &url]).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(&url).spawn();
    r.map(|_| true).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recording_names_are_cleaned_and_end_in_wav() {
        assert_eq!(safe_wav_name("mixlab-mix-2026-10-10.wav"), "mixlab-mix-2026-10-10.wav");
        assert_eq!(safe_wav_name("../../etc/passwd"), "passwd.wav");
        assert_eq!(safe_wav_name("C:\\x\\Mon mix?.WAV"), "Mon mix.wav");
        assert_eq!(safe_wav_name(""), "mixlab-mix.wav");
    }

    #[test]
    fn location_decodes_rekordbox_itunes_and_windows_uris() {
        assert_eq!(location_to_path("file://localhost/C:/Musique/Mon%20Morceau.mp3"), "C:/Musique/Mon Morceau.mp3");
        assert_eq!(location_to_path("file://localhost/Users/moi/Music/a%20b%20(Remix).flac"), "/Users/moi/Music/a b (Remix).flac");
        assert_eq!(location_to_path("file:///home/dj/Ann%C3%A9e%2090/b.wav"), "/home/dj/Année 90/b.wav");
        assert_eq!(location_to_path("file:///D:/Sets/x.mp3"), "D:/Sets/x.mp3");
        assert_eq!(location_to_path("FILE://localhost/e:/a.mp3"), "e:/a.mp3");
        assert_eq!(location_to_path("file://NAS/partage/c.mp3"), "//NAS/partage/c.mp3");
        assert_eq!(location_to_path("/deja/un/chemin.mp3"), "/deja/un/chemin.mp3");
        assert_eq!(location_to_path("C:\\Musique\\d.mp3"), "C:\\Musique\\d.mp3");
        assert_eq!(location_to_path("file:///x/100%25%zz.mp3"), "/x/100%%zz.mp3");
        assert_eq!(location_to_path("file:///x/fin%2"), "/x/fin%2");
    }

    #[test]
    fn library_and_audio_extension_filters() {
        for f in ["rekordbox.xml", "Library.XML", "set.m3u", "set.M3U8", "spotify.csv", "liste.txt"] {
            assert!(is_library_file(Path::new(f)), "{f}");
        }
        for f in ["a.mp3", "b.json", "c", "d.xml.exe"] {
            assert!(!is_library_file(Path::new(f)), "{f}");
        }
        assert!(is_audio(Path::new("x.AIFF")) && !is_audio(Path::new("x.xml")));
    }

    #[test]
    fn allow_paths_rules_need_existing_audio() {
        let root = std::env::temp_dir().join("mixlab-allow-test");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("mon dossier")).unwrap();
        std::fs::write(root.join("mon dossier/a b.mp3"), b"x").unwrap();
        std::fs::write(root.join("notes.txt"), b"x").unwrap();
        let uri = format!("file://localhost{}", root.join("mon dossier/a b.mp3").to_string_lossy().replace(' ', "%20"));
        let p = PathBuf::from(location_to_path(&uri));
        assert!(is_audio(&p) && p.is_file());
        let t = PathBuf::from(location_to_path(&root.join("notes.txt").to_string_lossy()));
        assert!(t.is_file() && !is_audio(&t));
    }

    #[test]
    fn only_shop_search_links_open() {
        assert!(is_shop_link("https://bandcamp.com/search?q=daft%20punk"));
        assert!(is_shop_link("https://www.beatport.com/search?q=x"));
        assert!(!is_shop_link("https://evil.com/?https://bandcamp.com/search?"));
        assert!(!is_shop_link("https://bandcamp.com/search?q=a b"));
        assert!(!is_shop_link("file:///etc/passwd"));
    }

    #[test]
    fn walk_finds_audio_in_subfolders_and_skips_hidden() {
        let root = std::env::temp_dir().join("mixlab-walk-test");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("house/2024")).unwrap();
        std::fs::create_dir_all(root.join(".cache")).unwrap();
        for f in ["a.MP3", "house/b.flac", "house/2024/c.wav", "notes.txt", ".cache/d.mp3"] {
            std::fs::write(root.join(f), b"x").unwrap();
        }
        let mut out = Vec::new();
        walk(&root, &mut out, 0);
        out.sort();
        let names: Vec<_> = out.iter().map(|p| p.strip_prefix(&root).unwrap().to_string_lossy().replace('\\', "/")).collect();
        assert_eq!(names, ["a.MP3", "house/2024/c.wav", "house/b.flac"]);
    }
}
