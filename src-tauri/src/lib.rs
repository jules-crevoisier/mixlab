//! Application Mixlab : fenêtre Tauri autour de l'interface `app/`.
//!
//! Elle donne à l'interface ce que le navigateur ne sait pas faire :
//! choisir des fichiers et des dossiers entiers, relire les morceaux au
//! redémarrage, garder la bibliothèque, et parler aux contrôleurs MIDI
//! (la WebView de macOS et celle de Linux n'ont pas Web MIDI).

mod files;
mod midi;
mod net;
#[cfg(debug_assertions)]
mod selftest;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(files::Allowed::default())
        .manage(midi::Midi::default())
        .manage(net::Live::default())
        .invoke_handler(tauri::generate_handler![
            files::pick_files,
            files::pick_folder,
            files::read_file,
            files::exists,
            files::library_load,
            files::library_save,
            files::pick_library_file,
            files::allow_paths,
            files::save_export,
            files::save_binary,
            files::open_shop,
            midi::midi_open,
            midi::midi_signature,
            midi::midi_send,
            net::stream_start,
            net::stream_send,
            net::stream_stop,
            net::stream_state,
            net::stream_metadata,
            net::nowplaying_set,
            net::nowplaying_pick,
            net::nowplaying_path,
            net::overlay_start,
            net::overlay_stop,
            net::osc_start,
            net::osc_stop,
            net::link_start,
            net::link_stop,
            net::lyrics_sidecar,
        ])
        .setup(|app| {
            // fenêtre principale créée ici pour que la sortie vidéo puisse s'ouvrir (window.open)
            net::main_window(app)?;
            #[cfg(debug_assertions)]
            selftest::maybe_run(app);
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("impossible de démarrer Mixlab");
}
