//! Une platine : lecture à vitesse variable, cue, boucle, et sa tranche de mixer
//! (gain, EQ 3 bandes, filtre, fader, envoi casque).

use std::sync::Arc;

use crate::decode::Track;
use crate::dsp::{DjFilter, Eq3, Smoothed};

/// Côté du crossfader auquel la platine est assignée.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum XfSide { A, B, Thru }

pub struct Deck {
    out_sr: f64,
    pub(crate) track: Option<Arc<Track>>,
    /// Position en trames du morceau (à sa fréquence d'origine).
    pub(crate) pos: f64,
    pub(crate) playing: bool,
    /// Vitesse demandée par le pitch fader (1,0 = tempo d'origine).
    pub(crate) speed: f64,
    /// Correction temporaire (jog, boutons nudge), additionnée à la vitesse.
    pub(crate) nudge: f64,
    pub(crate) cue_point: f64,
    /// Boucle active en trames : (début, fin).
    pub(crate) looping: Option<(f64, f64)>,
    pub(crate) xf_side: XfSide,
    pub(crate) cue_on: bool,
    eq: Eq3,
    filter: DjFilter,
    trim: Smoothed,
    fader: Smoothed,
    play_gain: Smoothed,
    cue_gain: Smoothed,
}

impl Deck {
    pub fn new(out_sr: u32, xf_side: XfSide) -> Self {
        let sr = out_sr as f32;
        Self {
            out_sr: out_sr as f64,
            track: None,
            pos: 0.0,
            playing: false,
            speed: 1.0,
            nudge: 0.0,
            cue_point: 0.0,
            looping: None,
            xf_side,
            cue_on: false,
            eq: Eq3::new(sr),
            filter: DjFilter::new(sr),
            trim: Smoothed::new(1.0, sr, 0.01),
            fader: Smoothed::new(1.0, sr, 0.01),
            play_gain: Smoothed::new(0.0, sr, 0.004),
            cue_gain: Smoothed::new(0.0, sr, 0.01),
        }
    }

    /// Remplace le morceau et renvoie l'ancien, pour qu'il soit libéré hors du fil audio.
    pub(crate) fn load(&mut self, track: Arc<Track>, cue: f64) -> Option<Arc<Track>> {
        self.playing = false;
        self.play_gain.snap(0.0);
        self.looping = None;
        self.nudge = 0.0;
        let frames = cue * track.sample_rate as f64;
        self.cue_point = frames;
        self.pos = frames;
        self.track.replace(track)
    }

    pub fn track_sr(&self) -> f64 { self.track.as_ref().map_or(self.out_sr, |t| t.sample_rate as f64) }
    pub fn position_secs(&self) -> f64 { self.pos / self.track_sr() }
    pub(crate) fn set_position_secs(&mut self, s: f64) {
        let max = self.track.as_ref().map_or(0.0, |t| t.frames() as f64);
        self.pos = (s * self.track_sr()).clamp(0.0, max);
    }
    pub(crate) fn set_trim(&mut self, g: f32) { self.trim.target = g.clamp(0.0, 4.0); }
    pub(crate) fn set_fader(&mut self, g: f32) { self.fader.target = g.clamp(0.0, 1.0); }
    pub(crate) fn set_eq_db(&mut self, band: usize, db: f32) { self.eq.set_gain_db(band.min(2), db); }
    pub(crate) fn set_filter(&mut self, a: f32) { self.filter.set(a); }

    /// Lecture interpolée (Hermite 4 points) d'une trame stéréo à une position fractionnaire.
    #[inline]
    fn read(t: &Track, pos: f64) -> (f32, f32) {
        let n = t.frames() as isize;
        let i = pos.floor() as isize;
        let f = (pos - i as f64) as f32;
        let s = &t.samples;
        let at = |k: isize, c: usize| -> f32 { if k < 0 || k >= n { 0.0 } else { s[(k as usize) * 2 + c] } };
        let mut out = [0.0f32; 2];
        for (c, o) in out.iter_mut().enumerate() {
            let (y0, y1, y2, y3) = (at(i - 1, c), at(i, c), at(i + 1, c), at(i + 2, c));
            let c1 = 0.5 * (y2 - y0);
            let c2 = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
            let c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
            *o = ((c3 * f + c2) * f + c1) * f + y1;
        }
        (out[0], out[1])
    }

    /// Calcule une trame : renvoie (sortie post-fader, envoi casque pré-fader).
    #[inline]
    pub(crate) fn tick(&mut self) -> ([f32; 2], [f32; 2]) {
        self.play_gain.target = if self.playing { 1.0 } else { 0.0 };
        self.cue_gain.target = if self.cue_on { 1.0 } else { 0.0 };
        let pg = self.play_gain.next();
        let trim = self.trim.next();
        let fader = self.fader.next();
        let cue = self.cue_gain.next();
        let Some(t) = self.track.as_ref() else { return ([0.0; 2], [0.0; 2]) };
        if pg < 1e-5 && !self.playing { return ([0.0; 2], [0.0; 2]); }

        let (l, r) = Self::read(t, self.pos);
        let step = (self.speed + self.nudge) * t.sample_rate as f64 / self.out_sr;
        self.pos += step;
        if let Some((a, b)) = self.looping {
            if b > a && self.pos >= b { self.pos = a + (self.pos - b) % (b - a); }
        }
        let end = t.frames() as f64;
        if self.pos >= end { self.pos = end; self.playing = false; }

        let g = pg * trim;
        let mut x = [l * g, r * g];
        for (c, v) in x.iter_mut().enumerate() {
            *v = self.filter.process(c, self.eq.process(c, *v));
        }
        ([x[0] * fader, x[1] * fader], [x[0] * cue, x[1] * cue])
    }
}
