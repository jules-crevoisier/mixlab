//! Briques de traitement du signal : lissage de paramètres, biquads, égaliseur, filtre.

use std::f32::consts::PI;

/// Lissage exponentiel d'un paramètre pour éviter les « zips » quand un bouton bouge.
#[derive(Clone, Copy, Debug)]
pub struct Smoothed {
    pub current: f32,
    pub target: f32,
    coef: f32,
}

impl Smoothed {
    pub fn new(v: f32, sample_rate: f32, time_s: f32) -> Self {
        Self { current: v, target: v, coef: (-1.0 / (time_s * sample_rate)).exp() }
    }
    #[inline]
    pub fn next(&mut self) -> f32 {
        self.current = self.target + (self.current - self.target) * self.coef;
        self.current
    }
    pub fn snap(&mut self, v: f32) {
        self.current = v;
        self.target = v;
    }
}

/// Biquad (forme directe transposée II), coefficients de l'Audio EQ Cookbook (R. Bristow-Johnson).
#[derive(Clone, Copy, Debug)]
pub struct Biquad {
    b0: f32, b1: f32, b2: f32, a1: f32, a2: f32,
    z1: [f32; 2], z2: [f32; 2],
}

pub enum Shape { LowShelf, Peak, HighShelf, LowPass, HighPass }

impl Biquad {
    pub const IDENTITY: Biquad = Biquad { b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0, z1: [0.0; 2], z2: [0.0; 2] };

    pub fn set(&mut self, shape: Shape, sr: f32, freq: f32, q: f32, gain_db: f32) {
        let w0 = 2.0 * PI * (freq / sr).clamp(1e-5, 0.49);
        let (sin, cos) = w0.sin_cos();
        let a = 10f32.powf(gain_db / 40.0);
        let alpha = sin / (2.0 * q);
        let (b0, b1, b2, a0, a1, a2) = match shape {
            Shape::Peak => (1.0 + alpha * a, -2.0 * cos, 1.0 - alpha * a, 1.0 + alpha / a, -2.0 * cos, 1.0 - alpha / a),
            Shape::LowShelf => {
                let s = 2.0 * a.sqrt() * alpha;
                (a * ((a + 1.0) - (a - 1.0) * cos + s), 2.0 * a * ((a - 1.0) - (a + 1.0) * cos), a * ((a + 1.0) - (a - 1.0) * cos - s),
                 (a + 1.0) + (a - 1.0) * cos + s, -2.0 * ((a - 1.0) + (a + 1.0) * cos), (a + 1.0) + (a - 1.0) * cos - s)
            }
            Shape::HighShelf => {
                let s = 2.0 * a.sqrt() * alpha;
                (a * ((a + 1.0) + (a - 1.0) * cos + s), -2.0 * a * ((a - 1.0) + (a + 1.0) * cos), a * ((a + 1.0) + (a - 1.0) * cos - s),
                 (a + 1.0) - (a - 1.0) * cos + s, 2.0 * ((a - 1.0) - (a + 1.0) * cos), (a + 1.0) - (a - 1.0) * cos - s)
            }
            Shape::LowPass => ((1.0 - cos) / 2.0, 1.0 - cos, (1.0 - cos) / 2.0, 1.0 + alpha, -2.0 * cos, 1.0 - alpha),
            Shape::HighPass => ((1.0 + cos) / 2.0, -(1.0 + cos), (1.0 + cos) / 2.0, 1.0 + alpha, -2.0 * cos, 1.0 - alpha),
        };
        self.b0 = b0 / a0; self.b1 = b1 / a0; self.b2 = b2 / a0; self.a1 = a1 / a0; self.a2 = a2 / a0;
    }

    #[inline]
    pub fn process(&mut self, ch: usize, x: f32) -> f32 {
        let y = self.b0 * x + self.z1[ch];
        self.z1[ch] = self.b1 * x - self.a1 * y + self.z2[ch];
        self.z2[ch] = self.b2 * x - self.a2 * y;
        y
    }

    pub fn reset(&mut self) { self.z1 = [0.0; 2]; self.z2 = [0.0; 2]; }
}

/// Égaliseur 3 bandes de table DJ : graves 200 Hz, médiums 1 kHz, aigus 3,5 kHz.
/// Les gains vont de « kill » (-60 dB) à +6 dB.
#[derive(Clone, Debug)]
pub struct Eq3 {
    sr: f32,
    bands: [Biquad; 3],
    gains_db: [f32; 3],
}

impl Eq3 {
    pub const KILL_DB: f32 = -60.0;
    pub fn new(sr: f32) -> Self {
        let mut e = Self { sr, bands: [Biquad::IDENTITY; 3], gains_db: [f32::NAN; 3] };
        for b in 0..3 { e.set_gain_db(b, 0.0); }
        e
    }
    pub fn set_gain_db(&mut self, band: usize, db: f32) {
        let db = db.clamp(Self::KILL_DB, 6.0);
        if self.gains_db[band] == db { return; }
        self.gains_db[band] = db;
        let sr = self.sr;
        match band {
            0 => self.bands[0].set(Shape::LowShelf, sr, 200.0, 0.7, db),
            1 => self.bands[1].set(Shape::Peak, sr, 1000.0, 0.7, db),
            _ => self.bands[2].set(Shape::HighShelf, sr, 3500.0, 0.7, db),
        }
    }
    #[inline]
    pub fn process(&mut self, ch: usize, x: f32) -> f32 {
        let y = self.bands[0].process(ch, x);
        let y = self.bands[1].process(ch, y);
        self.bands[2].process(ch, y)
    }
}

/// Filtre « un bouton » : à gauche passe-bas, à droite passe-haut, neutre au centre.
#[derive(Clone, Debug)]
pub struct DjFilter {
    sr: f32,
    bq: Biquad,
    amount: f32,
}

impl DjFilter {
    pub fn new(sr: f32) -> Self { Self { sr, bq: Biquad::IDENTITY, amount: 0.0 } }
    /// `amount` de -1 (passe-bas fermé) à +1 (passe-haut fermé).
    pub fn set(&mut self, amount: f32) {
        let amount = amount.clamp(-1.0, 1.0);
        if (amount - self.amount).abs() < 1e-4 { return; }
        let was_bypassed = self.amount.abs() < 0.02;
        self.amount = amount;
        if amount.abs() < 0.02 { return; }
        if was_bypassed { self.bq.reset(); }
        let t = (amount.abs() - 0.02) / 0.98;
        if amount < 0.0 {
            // 20 kHz → 80 Hz
            let f = 20000.0 * (80.0f32 / 20000.0).powf(t);
            self.bq.set(Shape::LowPass, self.sr, f, 0.9, 0.0);
        } else {
            // 20 Hz → 8 kHz
            let f = 20.0 * (8000.0f32 / 20.0).powf(t);
            self.bq.set(Shape::HighPass, self.sr, f, 0.9, 0.0);
        }
    }
    #[inline]
    pub fn process(&mut self, ch: usize, x: f32) -> f32 {
        if self.amount.abs() < 0.02 { x } else { self.bq.process(ch, x) }
    }
}

/// Convertit une position de bouton d'EQ (0..1, centre 0,5) en dB comme une table DJ :
/// 0 → kill, 0,5 → 0 dB, 1 → +6 dB.
pub fn eq_knob_to_db(v: f32) -> f32 {
    let v = v.clamp(0.0, 1.0);
    if v >= 0.5 { (v - 0.5) * 12.0 } else if v < 0.02 { Eq3::KILL_DB } else { 20.0 * (v / 0.5).powi(2).log10().max(-3.0) }
}

/// Limiteur crête simple à attaque instantanée et relâchement exponentiel, sur le bus master.
#[derive(Clone, Debug)]
pub struct Limiter {
    ceiling: f32,
    gain: f32,
    release: f32,
}

impl Limiter {
    pub fn new(sr: f32, ceiling_db: f32) -> Self {
        Self { ceiling: 10f32.powf(ceiling_db / 20.0), gain: 1.0, release: (-1.0 / (0.12 * sr)).exp() }
    }
    #[inline]
    pub fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        let peak = l.abs().max(r.abs());
        let needed = if peak > self.ceiling { self.ceiling / peak } else { 1.0 };
        let released = 1.0 - (1.0 - self.gain) * self.release;
        self.gain = released.min(needed);
        (l * self.gain, r * self.gain)
    }
    pub fn gain_reduction(&self) -> f32 { self.gain }
}
