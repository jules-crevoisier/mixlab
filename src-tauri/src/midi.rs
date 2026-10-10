//! MIDI natif (midir) : CoreMIDI sur macOS, WinMM sur Windows, ALSA sur Linux.
//!
//! L'interface garde son code Web MIDI : `app/tauri-bridge.js` fournit un
//! `navigator.requestMIDIAccess` qui s'appuie sur ces commandes. Les messages
//! entrants arrivent par l'événement `midi` ; les LED partent par `midi_send`.

use std::sync::Mutex;

use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct Midi {
    inputs: Mutex<Vec<MidiInputConnection<()>>>,
    outputs: Mutex<Vec<(String, MidiOutputConnection)>>,
}

#[derive(Serialize, Clone)]
pub struct Port {
    id: String,
    name: String,
}

#[derive(Serialize)]
pub struct Ports {
    inputs: Vec<Port>,
    outputs: Vec<Port>,
}

#[derive(Serialize, Clone)]
struct MidiEvent {
    port: String,
    data: Vec<u8>,
}

/// Identifiants stables : le nom du port, numéroté s'il y en a plusieurs du même nom.
fn ids(names: Vec<String>) -> Vec<Port> {
    let mut seen = std::collections::HashMap::<String, u32>::new();
    names
        .into_iter()
        .map(|name| {
            let n = seen.entry(name.clone()).or_default();
            *n += 1;
            let id = if *n == 1 { name.clone() } else { format!("{name} #{n}") };
            Port { id, name }
        })
        .collect()
}

fn input_names() -> Vec<String> {
    let Ok(mi) = MidiInput::new("Mixlab") else { return vec![] };
    mi.ports().iter().filter_map(|p| mi.port_name(p).ok()).collect()
}

fn output_names() -> Vec<String> {
    let Ok(mo) = MidiOutput::new("Mixlab") else { return vec![] };
    mo.ports().iter().filter_map(|p| mo.port_name(p).ok()).collect()
}

/// Liste des ports, que l'interface compare pour voir un contrôleur branché ou débranché.
#[tauri::command]
pub fn midi_signature() -> String {
    format!("{:?}|{:?}", input_names(), output_names())
}

/// (Re)connecte tous les contrôleurs présents.
#[tauri::command]
pub fn midi_open(app: AppHandle, midi: State<'_, Midi>) -> Ports {
    let mut ins = midi.inputs.lock().unwrap();
    let mut outs = midi.outputs.lock().unwrap();
    ins.clear();
    outs.clear();

    let mut inputs = Vec::new();
    if let Ok(probe) = MidiInput::new("Mixlab") {
        let ports = probe.ports();
        let named = ids(ports.iter().map(|p| probe.port_name(p).unwrap_or_default()).collect());
        for (port, info) in ports.iter().zip(named) {
            let Ok(mut mi) = MidiInput::new("Mixlab") else { continue };
            // l'horloge MIDI (0xF8, Start, Stop) passe : Mixlab peut suivre un tempo externe
            mi.ignore(midir::Ignore::SysexAndActiveSense);
            let (app, id) = (app.clone(), info.id.clone());
            let cb = move |_ts: u64, data: &[u8], _: &mut ()| {
                let _ = app.emit("midi", MidiEvent { port: id.clone(), data: data.to_vec() });
            };
            if let Ok(conn) = mi.connect(port, "Mixlab in", cb, ()) {
                ins.push(conn);
                inputs.push(info);
            }
        }
    }

    let mut outputs = Vec::new();
    if let Ok(probe) = MidiOutput::new("Mixlab") {
        let ports = probe.ports();
        let named = ids(ports.iter().map(|p| probe.port_name(p).unwrap_or_default()).collect());
        for (port, info) in ports.iter().zip(named) {
            let Ok(mo) = MidiOutput::new("Mixlab") else { continue };
            if let Ok(conn) = mo.connect(port, "Mixlab out") {
                outs.push((info.id.clone(), conn));
                outputs.push(info);
            }
        }
    }
    Ports { inputs, outputs }
}

/// Envoie un message (LED, afficheur) à un contrôleur.
#[tauri::command]
pub fn midi_send(port: String, data: Vec<u8>, midi: State<'_, Midi>) -> bool {
    let mut outs = midi.outputs.lock().unwrap();
    outs.iter_mut().find(|(id, _)| *id == port).map(|(_, c)| c.send(&data).is_ok()).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicate_port_names_get_distinct_ids() {
        let p = ids(vec!["DDJ".into(), "DDJ".into(), "Launch".into()]);
        let got: Vec<_> = p.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(got, ["DDJ", "DDJ #2", "Launch"]);
    }
}
