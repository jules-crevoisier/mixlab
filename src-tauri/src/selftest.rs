//! Auto-test de la version de développement : `MIXLAB_SELFTEST=1 cargo run`.
//! Vérifie dans la vraie WebView que l'interface démarre, que le pont natif
//! répond et que le son tourne, puis écrit le résultat dans la bibliothèque.

use tauri::{App, Manager};

const PROBE: &str = r#"
(async () => {
  const out = { tauri: !!window.__TAURI__, native: !!window.mixlabNative, coach: !!window.MixCoach };
  try {
    out.tracks = LIB.tracks.length;
    out.audio = ctx.state;
    out.midi = !!navigator.requestMIDIAccess;
    const m = await navigator.requestMIDIAccess();
    out.midiInputs = [...m.inputs.values()].map(i => i.name);
    out.exists = await mixlabNative.exists('/etc/passwd');
    try { await mixlabNative.readFile('/etc/passwd'); out.readBlocked = false; } catch (e) { out.readBlocked = true; }
    out.hud = !!document.querySelector('.coach-hud');
  } catch (e) { out.error = String(e); }
  await mixlabNative.saveLibrary(JSON.stringify({ selftest: out }));
})();
"#;

pub fn maybe_run(app: &mut App) {
    if std::env::var("MIXLAB_SELFTEST").is_err() {
        return;
    }
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(8));
        if let Some(w) = handle.get_webview_window("main") {
            let _ = w.eval(PROBE);
        }
    });
}
