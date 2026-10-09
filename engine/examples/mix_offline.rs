//! Rend une transition entre deux morceaux dans un fichier WAV, sans carte son.
//! Usage : cargo run --release --example mix_offline -- A.mp3 BPM_A B.mp3 BPM_B sortie.wav
//! Le morceau B est calé sur le tempo de A, entre avec les graves coupés, puis on
//! échange les basses et on bascule le crossfader sur 16 mesures.

use std::sync::Arc;

use mixlab_engine::dsp::eq_knob_to_db;
use mixlab_engine::*;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 6 {
        eprintln!("usage : mix_offline A BPM_A B BPM_B sortie.wav");
        std::process::exit(2);
    }
    let (bpm_a, bpm_b): (f64, f64) = (a[2].parse().expect("BPM A"), a[4].parse().expect("BPM B"));
    let ta = Arc::new(decode_file(&a[1]).expect("morceau A"));
    let tb = Arc::new(decode_file(&a[3]).expect("morceau B"));
    let sr = 48000u32;
    let (mut e, c) = Engine::new(sr);
    c.send(Command::Load { deck: 0, track: ta, cue_secs: 0.0 });
    c.send(Command::Load { deck: 1, track: tb, cue_secs: 0.0 });
    c.send(Command::Speed { deck: 1, ratio: bpm_a / bpm_b });
    c.send(Command::Crossfader(0.0));
    c.send(Command::Play { deck: 0, on: true });

    let bar = 4.0 * 60.0 / bpm_a;
    let mut out = Vec::new();
    let mut render = |e: &mut Engine, secs: f64| {
        let n = (secs * sr as f64) as usize * 2;
        let (mut m, mut h) = (vec![0.0f32; n], vec![0.0f32; n]);
        for (cm, ch) in m.chunks_mut(1024).zip(h.chunks_mut(1024)) { e.render(cm, ch); }
        out.extend_from_slice(&m);
    };
    render(&mut e, bar * 16.0);
    // Entrée de B sur la mesure 17, graves coupés.
    c.send(Command::Eq { deck: 1, band: 0, db: eq_knob_to_db(0.0) });
    c.send(Command::Play { deck: 1, on: true });
    for step in 0..16 {
        c.send(Command::Crossfader((step as f32 + 1.0) / 16.0));
        if step == 8 {
            // Échange des basses sur le premier temps.
            c.send(Command::Eq { deck: 0, band: 0, db: eq_knob_to_db(0.0) });
            c.send(Command::Eq { deck: 1, band: 0, db: 0.0 });
        }
        render(&mut e, bar);
    }
    render(&mut e, bar * 8.0);

    let spec = hound::WavSpec { channels: 2, sample_rate: sr, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut w = hound::WavWriter::create(&a[5], spec).expect("sortie");
    for v in &out { w.write_sample((v.clamp(-1.0, 1.0) * 32767.0) as i16).unwrap(); }
    w.finalize().unwrap();
    println!("{} s rendues dans {}", out.len() / 2 / sr as usize, a[5]);
}
