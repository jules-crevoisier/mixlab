//! Le moteur : 4 platines, crossfader, bus master limité, bus casque (cue + mix master).
//! L'interface envoie des `Command` ; le fil audio appelle `Engine::render` sans allouer ni bloquer.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;

use crate::deck::{Deck, XfSide};
use crate::decode::Track;
use crate::dsp::{Limiter, Smoothed};

pub const DECKS: usize = 4;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum XfCurve {
    /// Fondu progressif : les deux platines restent pleines au centre.
    Mix,
    /// Puissance constante : volume perçu stable pendant le fondu.
    Smooth,
    /// Coupure nette pour le scratch : bascule sur les derniers millimètres.
    Cut,
}

#[derive(Debug)]
pub enum Command {
    Load { deck: usize, track: Arc<Track>, cue_secs: f64 },
    Play { deck: usize, on: bool },
    Seek { deck: usize, secs: f64 },
    /// Vitesse du pitch fader (1,0 = tempo d'origine).
    Speed { deck: usize, ratio: f64 },
    Nudge { deck: usize, delta: f64 },
    SetCuePoint { deck: usize, secs: f64 },
    /// Boucle en secondes ; `None` pour sortir de la boucle.
    Loop { deck: usize, range: Option<(f64, f64)> },
    Trim { deck: usize, gain: f32 },
    Eq { deck: usize, band: usize, db: f32 },
    Filter { deck: usize, amount: f32 },
    Fader { deck: usize, gain: f32 },
    CueListen { deck: usize, on: bool },
    XfAssign { deck: usize, side: XfSide },
    Crossfader(f32),
    Curve(XfCurve),
    MasterVolume(f32),
    HeadphoneVolume(f32),
    /// 0 = casque n'entend que le cue, 1 = casque n'entend que le master.
    CueMix(f32),
}

/// État lisible par l'interface sans verrou : positions, lecture, crêtes du master.
pub struct Status {
    positions: [AtomicU64; DECKS],
    playing: [AtomicBool; DECKS],
    peak: [AtomicU32; 2],
    limiting: AtomicU32,
}

impl Status {
    fn new() -> Self {
        Self {
            positions: Default::default(),
            playing: Default::default(),
            peak: Default::default(),
            limiting: AtomicU32::new(1.0f32.to_bits()),
        }
    }
    pub fn position(&self, deck: usize) -> f64 { f64::from_bits(self.positions[deck].load(Ordering::Relaxed)) }
    pub fn is_playing(&self, deck: usize) -> bool { self.playing[deck].load(Ordering::Relaxed) }
    /// Crête du master depuis la dernière lecture (remise à zéro à chaque appel).
    pub fn take_peak(&self) -> [f32; 2] {
        [f32::from_bits(self.peak[0].swap(0, Ordering::Relaxed)), f32::from_bits(self.peak[1].swap(0, Ordering::Relaxed))]
    }
    /// Gain appliqué par le limiteur (1,0 = pas de limitation).
    pub fn limiter_gain(&self) -> f32 { f32::from_bits(self.limiting.load(Ordering::Relaxed)) }
}

/// Côté interface : envoie les commandes, lit l'état, libère les morceaux déchargés.
pub struct Controller {
    tx: Sender<Command>,
    graveyard: Receiver<Arc<Track>>,
    pub status: Arc<Status>,
}

impl Controller {
    pub fn send(&self, c: Command) {
        let _ = self.tx.send(c);
        // Les morceaux remplacés sont libérés ici, jamais dans le fil audio.
        while self.graveyard.try_recv().is_ok() {}
    }
}

pub struct Engine {
    pub sample_rate: u32,
    decks: Vec<Deck>,
    rx: Receiver<Command>,
    graveyard: Sender<Arc<Track>>,
    status: Arc<Status>,
    xf: Smoothed,
    curve: XfCurve,
    master_vol: Smoothed,
    hp_vol: Smoothed,
    cue_mix: Smoothed,
    limiter: Limiter,
}

impl Engine {
    pub fn new(sample_rate: u32) -> (Engine, Controller) {
        let (tx, rx) = mpsc::channel();
        let (gtx, grx) = mpsc::channel();
        let status = Arc::new(Status::new());
        let sr = sample_rate as f32;
        let sides = [XfSide::A, XfSide::B, XfSide::A, XfSide::B];
        let engine = Engine {
            sample_rate,
            decks: sides.iter().map(|s| Deck::new(sample_rate, *s)).collect(),
            rx,
            graveyard: gtx,
            status: status.clone(),
            xf: Smoothed::new(0.5, sr, 0.005),
            curve: XfCurve::Mix,
            master_vol: Smoothed::new(0.8, sr, 0.01),
            hp_vol: Smoothed::new(0.8, sr, 0.01),
            cue_mix: Smoothed::new(0.0, sr, 0.01),
            limiter: Limiter::new(sr, -1.0),
        };
        (engine, Controller { tx, graveyard: grx, status })
    }

    /// Gains (A, B) du crossfader pour une position 0..1.
    pub fn xf_gains(curve: XfCurve, x: f32) -> (f32, f32) {
        let x = x.clamp(0.0, 1.0);
        match curve {
            XfCurve::Mix => ((2.0 * (1.0 - x)).min(1.0), (2.0 * x).min(1.0)),
            XfCurve::Smooth => ((x * std::f32::consts::FRAC_PI_2).cos(), (x * std::f32::consts::FRAC_PI_2).sin()),
            XfCurve::Cut => (if x > 0.97 { 0.0 } else { 1.0 }, if x < 0.03 { 0.0 } else { 1.0 }),
        }
    }

    fn apply(&mut self, c: Command) {
        let d = |i: usize| i.min(DECKS - 1);
        match c {
            Command::Load { deck, track, cue_secs } => {
                if let Some(old) = self.decks[d(deck)].load(track, cue_secs) { let _ = self.graveyard.send(old); }
            }
            Command::Play { deck, on } => {
                let k = &mut self.decks[d(deck)];
                if on && k.track.as_ref().is_some_and(|t| k.pos >= t.frames() as f64 - 1.0) { k.pos = k.cue_point; }
                k.playing = on && k.track.is_some();
            }
            Command::Seek { deck, secs } => self.decks[d(deck)].set_position_secs(secs),
            Command::Speed { deck, ratio } => self.decks[d(deck)].speed = ratio.clamp(0.0, 4.0),
            Command::Nudge { deck, delta } => self.decks[d(deck)].nudge = delta.clamp(-1.0, 1.0),
            Command::SetCuePoint { deck, secs } => { let k = &mut self.decks[d(deck)]; k.cue_point = secs.max(0.0) * k.track_sr(); }
            Command::Loop { deck, range } => {
                let k = &mut self.decks[d(deck)];
                let sr = k.track_sr();
                k.looping = range.filter(|(a, b)| b > a).map(|(a, b)| (a * sr, b * sr));
            }
            Command::Trim { deck, gain } => self.decks[d(deck)].set_trim(gain),
            Command::Eq { deck, band, db } => self.decks[d(deck)].set_eq_db(band, db),
            Command::Filter { deck, amount } => self.decks[d(deck)].set_filter(amount),
            Command::Fader { deck, gain } => self.decks[d(deck)].set_fader(gain),
            Command::CueListen { deck, on } => self.decks[d(deck)].cue_on = on,
            Command::XfAssign { deck, side } => self.decks[d(deck)].xf_side = side,
            Command::Crossfader(x) => self.xf.target = x.clamp(0.0, 1.0),
            Command::Curve(c) => self.curve = c,
            Command::MasterVolume(v) => self.master_vol.target = v.clamp(0.0, 1.5),
            Command::HeadphoneVolume(v) => self.hp_vol.target = v.clamp(0.0, 1.5),
            Command::CueMix(v) => self.cue_mix.target = v.clamp(0.0, 1.0),
        }
    }

    /// Remplit `master` et `hp` (stéréo entrelacé, même longueur). Sans allocation ni verrou.
    pub fn render(&mut self, master: &mut [f32], hp: &mut [f32]) {
        while let Ok(c) = self.rx.try_recv() { self.apply(c); }
        let frames = master.len().min(hp.len()) / 2;
        let mut peak = [0.0f32; 2];
        for i in 0..frames {
            let (ga, gb) = Self::xf_gains(self.curve, self.xf.next());
            let (mut m, mut c) = ([0.0f32; 2], [0.0f32; 2]);
            for k in self.decks.iter_mut() {
                let (out, cue) = k.tick();
                let g = match k.xf_side { XfSide::A => ga, XfSide::B => gb, XfSide::Thru => 1.0 };
                m[0] += out[0] * g; m[1] += out[1] * g;
                c[0] += cue[0]; c[1] += cue[1];
            }
            let mv = self.master_vol.next();
            let (l, r) = self.limiter.process(m[0] * mv, m[1] * mv);
            master[2 * i] = l; master[2 * i + 1] = r;
            peak[0] = peak[0].max(l.abs()); peak[1] = peak[1].max(r.abs());
            let (cm, hv) = (self.cue_mix.next(), self.hp_vol.next());
            hp[2 * i] = ((c[0] * (1.0 - cm) + l * cm) * hv).clamp(-1.0, 1.0);
            hp[2 * i + 1] = ((c[1] * (1.0 - cm) + r * cm) * hv).clamp(-1.0, 1.0);
        }
        for (k, deck) in self.decks.iter().enumerate() {
            self.status.positions[k].store(deck.position_secs().to_bits(), Ordering::Relaxed);
            self.status.playing[k].store(deck.playing, Ordering::Relaxed);
        }
        for c in 0..2 {
            let prev = f32::from_bits(self.status.peak[c].load(Ordering::Relaxed));
            self.status.peak[c].store(prev.max(peak[c]).to_bits(), Ordering::Relaxed);
        }
        self.status.limiting.store(self.limiter.gain_reduction().to_bits(), Ordering::Relaxed);
    }
}
