//! Moteur audio natif de Mixlab.
//!
//! Il remplace le moteur Web Audio du prototype pour trois raisons :
//! une latence plus basse (WASAPI/ASIO, CoreAudio, ALSA), la sortie casque
//! sur une carte 4 canaux ou une deuxième carte, et un rendu qui ne dépend
//! pas du navigateur. L'interface reste en HTML/JS et pilote le moteur par
//! des `Command` (via Tauri dans l'application).

pub mod deck;
pub mod decode;
pub mod dsp;
pub mod engine;
#[cfg(feature = "device")]
pub mod device;

pub use deck::XfSide;
pub use decode::{decode_file, Track};
pub use engine::{Command, Controller, Engine, Status, XfCurve, DECKS};
