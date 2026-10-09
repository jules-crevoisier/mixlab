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

const AUDIO_EXT: &[&str] = &["mp3", "wav", "aif", "aiff", "flac", "ogg", "m4a", "aac", "opus"];
/// Un mix d'une heure en WAV tient dedans.
const MAX_FILE: u64 = 400 * 1024 * 1024;
const MAX_LIBRARY: usize = 50_000_000;

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

#[cfg(test)]
mod tests {
    use super::*;

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
