//! Dossiers de musique : explorateur (onglet Fichiers) et dossiers surveillés.
//!
//! Seuls les dossiers que l'utilisateur a choisis dans le dialogue du système
//! sont gardés ici, et seuls eux peuvent être listés ou parcourus. Les fichiers
//! audio qu'on y trouve deviennent lisibles par l'interface.
//! On relit aussi, à la demande, le dossier _Serato_ (crates et base de données).

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::files::{describe, is_audio, walk, Allowed, Picked};

/// Nouveaux fichiers renvoyés par un passage de surveillance, au plus.
const MAX_NEW: usize = 500;
/// Fichiers d'un dossier _Serato_ : base de données et crates.
const MAX_SERATO_FILE: u64 = 64 * 1024 * 1024;
const MAX_SERATO_TOTAL: u64 = 160 * 1024 * 1024;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Root {
    pub path: String,
    pub watch: bool,
}

#[derive(Serialize)]
pub struct Entry {
    name: String,
    path: String,
}

#[derive(Serialize)]
pub struct Listing {
    dirs: Vec<Entry>,
    files: Vec<Entry>,
}

#[derive(Serialize)]
pub struct SeratoFile {
    name: String,
    data: String,
}

#[derive(Serialize)]
pub struct SeratoDir {
    dir: String,
    files: Vec<SeratoFile>,
}

fn store(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("folders.json"))
}

pub fn load_roots(f: &Path) -> Vec<Root> {
    std::fs::read_to_string(f).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

pub fn save_roots(f: &Path, roots: &[Root]) -> Result<(), String> {
    let tmp = f.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string(roots).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, f).map_err(|e| e.to_string())
}

/// Ajoute un dossier (ou change sa surveillance s'il est déjà là). Un sous-dossier d'un
/// dossier déjà gardé n'est pas ajouté une deuxième fois.
pub fn add_root(roots: &mut Vec<Root>, path: &str, watch: bool) {
    if let Some(r) = roots.iter_mut().find(|r| r.path == path) {
        r.watch = r.watch || watch;
        return;
    }
    roots.push(Root { path: path.to_string(), watch });
}

/// Le chemin est-il dans un des dossiers choisis ? Les deux côtés sont résolus
/// (liens, « .. ») avant la comparaison.
pub fn inside(roots: &[Root], p: &Path) -> bool {
    let Ok(c) = p.canonicalize() else { return false };
    roots.iter().any(|r| Path::new(&r.path).canonicalize().map(|root| c.starts_with(root)).unwrap_or(false))
}

/// Fichiers audio des dossiers surveillés qui ne sont pas encore connus.
pub fn scan_new(roots: &[Root], known: &HashSet<String>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for r in roots.iter().filter(|r| r.watch) {
        let mut all = Vec::new();
        walk(Path::new(&r.path), &mut all, 0);
        all.sort();
        for p in all {
            if out.len() >= MAX_NEW {
                return out;
            }
            if !known.contains(p.to_string_lossy().as_ref()) && !out.contains(&p) {
                out.push(p);
            }
        }
    }
    out
}

/// Contenu d'un dossier : sous-dossiers et fichiers audio, sans les fichiers cachés.
pub fn list_dir(dir: &Path) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let (mut dirs, mut files) = (Vec::new(), Vec::new());
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            if e.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            let Ok(ft) = e.file_type() else { continue };
            let p = e.path();
            if ft.is_dir() {
                dirs.push(p);
            } else if ft.is_file() && is_audio(&p) {
                files.push(p);
            }
        }
    }
    let key = |p: &PathBuf| p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    dirs.sort_by_key(key);
    files.sort_by_key(key);
    (dirs, files)
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn base64(data: &[u8]) -> String {
    let mut s = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        s.push(B64[(n >> 18) as usize & 63] as char);
        s.push(B64[(n >> 12) as usize & 63] as char);
        s.push(if c.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        s.push(if c.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    s
}

/// Trouve le dossier _Serato_ : celui choisi, ou un _Serato_ à l'intérieur.
pub fn serato_dir(picked: &Path) -> Option<PathBuf> {
    let has = |d: &Path| d.join("database V2").is_file() || d.join("Subcrates").is_dir();
    if has(picked) {
        return Some(picked.to_path_buf());
    }
    let inner = picked.join("_Serato_");
    if has(&inner) {
        return Some(inner);
    }
    None
}

/// Fichiers à relire dans un dossier _Serato_ : la base de données et les crates.
pub fn serato_files(dir: &Path) -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    let db = dir.join("database V2");
    if db.is_file() {
        out.push(("database V2".to_string(), db));
    }
    if let Ok(entries) = std::fs::read_dir(dir.join("Subcrates")) {
        let mut cr: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().map(|e| e.eq_ignore_ascii_case("crate")).unwrap_or(false))
            .collect();
        cr.sort();
        for p in cr {
            let name = format!("Subcrates/{}", p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default());
            out.push((name, p));
        }
    }
    out
}

#[tauri::command]
pub async fn folders_list(app: AppHandle) -> Result<Vec<Root>, String> {
    Ok(load_roots(&store(&app)?))
}

#[tauri::command]
pub async fn folders_add(app: AppHandle, watch: bool) -> Result<Vec<Root>, String> {
    let f = store(&app)?;
    let mut roots = load_roots(&f);
    let Some(dir) = app.dialog().file().blocking_pick_folder().and_then(|d| d.into_path().ok()) else {
        return Ok(roots);
    };
    add_root(&mut roots, &dir.to_string_lossy(), watch);
    save_roots(&f, &roots)?;
    Ok(roots)
}

#[tauri::command]
pub async fn folders_remove(app: AppHandle, path: String) -> Result<Vec<Root>, String> {
    let f = store(&app)?;
    let mut roots = load_roots(&f);
    roots.retain(|r| r.path != path);
    save_roots(&f, &roots)?;
    Ok(roots)
}

#[tauri::command]
pub async fn folders_set_watch(app: AppHandle, path: String, watch: bool) -> Result<Vec<Root>, String> {
    let f = store(&app)?;
    let mut roots = load_roots(&f);
    for r in roots.iter_mut().filter(|r| r.path == path) {
        r.watch = watch;
    }
    save_roots(&f, &roots)?;
    Ok(roots)
}

/// Liste un dossier choisi (ou un de ses sous-dossiers) ; ses fichiers audio deviennent lisibles.
#[tauri::command]
pub async fn folder_read(app: AppHandle, path: String, allowed: State<'_, Allowed>) -> Result<Listing, String> {
    let roots = load_roots(&store(&app)?);
    let p = PathBuf::from(&path);
    if !inside(&roots, &p) {
        return Err("Dossier non autorisé".into());
    }
    let (dirs, files) = list_dir(&p);
    let entry = |p: PathBuf| Entry {
        name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        path: p.to_string_lossy().into_owned(),
    };
    for f in &files {
        allowed.add(f);
    }
    Ok(Listing { dirs: dirs.into_iter().map(entry).collect(), files: files.into_iter().map(entry).collect() })
}

/// Un passage de surveillance : les fichiers audio nouveaux des dossiers surveillés.
#[tauri::command]
pub async fn folders_scan(app: AppHandle, known: Vec<String>, allowed: State<'_, Allowed>) -> Result<Vec<Picked>, String> {
    let roots = load_roots(&store(&app)?);
    let known: HashSet<String> = known.into_iter().collect();
    Ok(describe(&allowed, scan_new(&roots, &known)))
}

/// Dossier _Serato_ choisi dans le dialogue : renvoie la base et les crates, en base64.
#[tauri::command]
pub async fn serato_read(app: AppHandle) -> Result<Option<SeratoDir>, String> {
    let Some(picked) = app.dialog().file().blocking_pick_folder().and_then(|d| d.into_path().ok()) else {
        return Ok(None);
    };
    let Some(dir) = serato_dir(&picked) else {
        return Err("Pas de dossier _Serato_ ici".into());
    };
    let mut files = Vec::new();
    let mut total = 0;
    for (name, p) in serato_files(&dir) {
        let size = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
        if size > MAX_SERATO_FILE || total + size > MAX_SERATO_TOTAL {
            continue;
        }
        total += size;
        let Ok(bytes) = std::fs::read(&p) else { continue };
        files.push(SeratoFile { name, data: base64(&bytes) });
    }
    // le dossier de musique : celui qui contient _Serato_ (les chemins des crates en partent)
    let base = dir.parent().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(Some(SeratoDir { dir: base, files }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn roots_are_saved_and_reloaded() {
        let d = tmp("mixlab-roots-test");
        let f = d.join("folders.json");
        assert!(load_roots(&f).is_empty());
        let mut roots = Vec::new();
        add_root(&mut roots, "/musique", false);
        add_root(&mut roots, "/musique", true);
        add_root(&mut roots, "/sets", false);
        save_roots(&f, &roots).unwrap();
        let back = load_roots(&f);
        assert_eq!(back, vec![Root { path: "/musique".into(), watch: true }, Root { path: "/sets".into(), watch: false }]);
        std::fs::write(&f, b"pas du json").unwrap();
        assert!(load_roots(&f).is_empty());
    }

    #[test]
    fn only_chosen_folders_can_be_listed() {
        let d = tmp("mixlab-inside-test");
        std::fs::create_dir_all(d.join("musique/house")).unwrap();
        std::fs::create_dir_all(d.join("prive")).unwrap();
        let roots = vec![Root { path: d.join("musique").to_string_lossy().into_owned(), watch: false }];
        assert!(inside(&roots, &d.join("musique")));
        assert!(inside(&roots, &d.join("musique/house")));
        assert!(!inside(&roots, &d.join("prive")));
        assert!(!inside(&roots, &d.join("musique/../prive")));
        assert!(!inside(&roots, &d.join("musique/absent")));
    }

    #[test]
    fn scan_returns_new_audio_of_watched_folders_only() {
        let d = tmp("mixlab-scan-test");
        std::fs::create_dir_all(d.join("vu/sub")).unwrap();
        std::fs::create_dir_all(d.join("libre")).unwrap();
        for f in ["vu/a.mp3", "vu/sub/b.flac", "vu/notes.txt", "libre/c.mp3"] {
            std::fs::write(d.join(f), b"x").unwrap();
        }
        let roots = vec![
            Root { path: d.join("vu").to_string_lossy().into_owned(), watch: true },
            Root { path: d.join("libre").to_string_lossy().into_owned(), watch: false },
        ];
        let known: HashSet<String> = [d.join("vu/a.mp3").to_string_lossy().into_owned()].into_iter().collect();
        assert_eq!(scan_new(&roots, &known), vec![d.join("vu/sub/b.flac")]);
        std::fs::write(d.join("vu/new.wav"), b"x").unwrap();
        assert_eq!(scan_new(&roots, &known), vec![d.join("vu/new.wav"), d.join("vu/sub/b.flac")]);
        let (dirs, files) = list_dir(&d.join("vu"));
        assert_eq!(dirs, vec![d.join("vu/sub")]);
        assert_eq!(files, vec![d.join("vu/a.mp3"), d.join("vu/new.wav")]);
    }

    #[test]
    fn base64_matches_the_standard_alphabet() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(&[0, 255, 16, 200]), "AP8QyA==");
    }

    #[test]
    fn serato_folder_is_found_from_music_root() {
        let d = tmp("mixlab-serato-test");
        std::fs::create_dir_all(d.join("_Serato_/Subcrates")).unwrap();
        std::fs::write(d.join("_Serato_/database V2"), b"vrsn").unwrap();
        std::fs::write(d.join("_Serato_/Subcrates/House%%Deep.crate"), b"vrsn").unwrap();
        std::fs::write(d.join("_Serato_/Subcrates/notes.txt"), b"x").unwrap();
        let s = serato_dir(&d).unwrap();
        assert_eq!(s, d.join("_Serato_"));
        assert_eq!(serato_dir(&s).unwrap(), s);
        let names: Vec<String> = serato_files(&s).into_iter().map(|(n, _)| n).collect();
        assert_eq!(names, ["database V2", "Subcrates/House%%Deep.crate"]);
        assert!(serato_dir(&d.join("_Serato_/Subcrates")).is_none());
    }
}
