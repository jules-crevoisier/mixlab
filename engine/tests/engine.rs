use std::sync::Arc;

use mixlab_engine::dsp::eq_knob_to_db;
use mixlab_engine::*;

const SR: u32 = 48000;

fn sine(freq: f32, secs: f32, sr: u32) -> Arc<Track> {
    let n = (secs * sr as f32) as usize;
    let s: Vec<f32> = (0..n).map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / sr as f32).sin() * 0.5).collect();
    Arc::new(Track::from_channels(sr, &s, None))
}

/// Rend `secs` secondes et renvoie (master, casque).
fn run(e: &mut Engine, secs: f32) -> (Vec<f32>, Vec<f32>) {
    let n = (secs * SR as f32) as usize * 2;
    let (mut m, mut h) = (vec![0.0; n], vec![0.0; n]);
    for (cm, ch) in m.chunks_mut(512).zip(h.chunks_mut(512)) { e.render(cm, ch); }
    (m, h)
}
fn rms(x: &[f32]) -> f32 { (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt() }
fn tail(x: &[f32]) -> &[f32] { &x[x.len() / 2..] }

#[test]
fn silence_without_tracks() {
    let (mut e, _c) = Engine::new(SR);
    let (m, h) = run(&mut e, 0.2);
    assert!(m.iter().chain(&h).all(|v| *v == 0.0));
}

#[test]
fn playback_advances_at_pitch_speed() {
    let (mut e, c) = Engine::new(SR);
    c.send(Command::Load { deck: 0, track: sine(440.0, 10.0, 44100), cue_secs: 0.0 });
    c.send(Command::Play { deck: 0, on: true });
    run(&mut e, 1.0);
    assert!((c.status.position(0) - 1.0).abs() < 0.002, "{}", c.status.position(0));
    c.send(Command::Speed { deck: 0, ratio: 1.06 });
    run(&mut e, 1.0);
    assert!((c.status.position(0) - 2.06).abs() < 0.003, "{}", c.status.position(0));
    c.send(Command::Play { deck: 0, on: false });
    run(&mut e, 0.5);
    let p = c.status.position(0);
    run(&mut e, 0.5);
    assert_eq!(p, c.status.position(0), "à l'arrêt la position ne bouge plus");
}

#[test]
fn crossfader_isolates_sides() {
    let (mut e, c) = Engine::new(SR);
    c.send(Command::Load { deck: 0, track: sine(300.0, 5.0, SR), cue_secs: 0.0 });
    c.send(Command::Load { deck: 1, track: sine(300.0, 5.0, SR), cue_secs: 0.0 });
    c.send(Command::Play { deck: 1, on: true });
    c.send(Command::Crossfader(0.0));
    let (m, _) = run(&mut e, 0.3);
    assert!(rms(tail(&m)) < 1e-4, "B doit être muet crossfader à gauche");
    c.send(Command::Crossfader(1.0));
    let (m, _) = run(&mut e, 0.3);
    assert!(rms(tail(&m)) > 0.1);
}

#[test]
fn curves_shape() {
    let (a, b) = Engine::xf_gains(XfCurve::Mix, 0.5);
    assert_eq!((a, b), (1.0, 1.0));
    let (a, b) = Engine::xf_gains(XfCurve::Smooth, 0.5);
    assert!((a * a + b * b - 1.0).abs() < 1e-5);
    assert_eq!(Engine::xf_gains(XfCurve::Cut, 0.1), (1.0, 1.0));
}

#[test]
fn loop_wraps() {
    let (mut e, c) = Engine::new(SR);
    c.send(Command::Load { deck: 0, track: sine(440.0, 10.0, SR), cue_secs: 1.0 });
    c.send(Command::Loop { deck: 0, range: Some((1.0, 1.5)) });
    c.send(Command::Play { deck: 0, on: true });
    run(&mut e, 2.2);
    let p = c.status.position(0);
    assert!((1.0..1.5).contains(&p), "{p}");
    c.send(Command::Loop { deck: 0, range: None });
    run(&mut e, 1.0);
    assert!(c.status.position(0) > 1.9);
}

fn level_with_low_kill(freq: f32, kill: bool) -> f32 {
    let (mut e, c) = Engine::new(SR);
    c.send(Command::Load { deck: 0, track: sine(freq, 5.0, SR), cue_secs: 0.0 });
    c.send(Command::Play { deck: 0, on: true });
    if kill { c.send(Command::Eq { deck: 0, band: 0, db: eq_knob_to_db(0.0) }); }
    let (m, _) = run(&mut e, 0.5);
    rms(tail(&m))
}

#[test]
fn eq_kill_removes_bass_keeps_highs() {
    let (bass, bass_killed) = (level_with_low_kill(50.0, false), level_with_low_kill(50.0, true));
    assert!(bass_killed < bass * 0.05, "graves : {bass} -> {bass_killed} (il faut plus de 26 dB)");
    let (hi, hi_killed) = (level_with_low_kill(6000.0, false), level_with_low_kill(6000.0, true));
    assert!((hi - hi_killed).abs() < hi * 0.05, "aigus : {hi} -> {hi_killed}");
}

#[test]
fn headphones_hear_cue_not_master() {
    let (mut e, c) = Engine::new(SR);
    c.send(Command::Load { deck: 0, track: sine(440.0, 5.0, SR), cue_secs: 0.0 });
    c.send(Command::Play { deck: 0, on: true });
    c.send(Command::Fader { deck: 0, gain: 0.0 });
    c.send(Command::CueListen { deck: 0, on: true });
    c.send(Command::CueMix(0.0));
    let (m, h) = run(&mut e, 0.5);
    assert!(rms(tail(&m)) < 1e-4, "fader baissé : la salle n'entend rien");
    assert!(rms(tail(&h)) > 0.1, "le casque entend la préécoute");
}

#[test]
fn limiter_keeps_master_under_ceiling() {
    let (mut e, c) = Engine::new(SR);
    for d in 0..4 {
        c.send(Command::Load { deck: d, track: sine(100.0, 5.0, SR), cue_secs: 0.0 });
        c.send(Command::Trim { deck: d, gain: 4.0 });
        c.send(Command::XfAssign { deck: d, side: XfSide::Thru });
        c.send(Command::Play { deck: d, on: true });
    }
    c.send(Command::MasterVolume(1.5));
    let (m, _) = run(&mut e, 0.5);
    let peak = m.iter().fold(0.0f32, |a, v| a.max(v.abs()));
    assert!(peak <= 0.892, "crête {peak}");
    assert!(m.iter().all(|v| v.is_finite()));
}

#[test]
fn decodes_wav_any_rate_and_mono() {
    let dir = std::env::temp_dir().join("mixlab-engine-test");
    std::fs::create_dir_all(&dir).unwrap();
    let p = dir.join("mono.wav");
    let spec = hound::WavSpec { channels: 1, sample_rate: 44100, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut w = hound::WavWriter::create(&p, spec).unwrap();
    for i in 0..44100 { w.write_sample(((i as f32 * 0.05).sin() * 12000.0) as i16).unwrap(); }
    w.finalize().unwrap();
    let t = decode_file(&p).unwrap();
    assert_eq!(t.sample_rate, 44100);
    assert_eq!(t.frames(), 44100);
    assert_eq!(t.samples[0], t.samples[1], "le mono est dupliqué sur les deux canaux");
}
