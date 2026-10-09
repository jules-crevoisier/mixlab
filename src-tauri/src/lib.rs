//! Application Mixlab : fenêtre Tauri autour de l'interface `app/`.
//!
//! Elle donne à l'interface ce que le navigateur ne sait pas faire :
//! choisir des fichiers et des dossiers entiers, relire les morceaux au
//! redémarrage, garder la bibliothèque, et parler aux contrôleurs MIDI
//! (la WebView de macOS et celle de Linux n'ont pas Web MIDI).

mod files;
mod midi;
#[cfg(debug_assertions)]
mod selftest;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(files::Allowed::default())
        .manage(midi::Midi::default())
        .invoke_handler(tauri::generate_handler![
            files::pick_files,
            files::pick_folder,
            files::read_file,
            files::exists,
            files::library_load,
            files::library_save,
            midi::midi_open,
            midi::midi_signature,
            midi::midi_send,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            selftest::maybe_run(app);
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("impossible de démarrer Mixlab");
}
