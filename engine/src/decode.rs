//! Décodage de fichiers audio (MP3, AAC/M4A, FLAC, WAV, AIFF, OGG) en PCM stéréo flottant.

use std::fs::File;
use std::path::Path;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// Un morceau décodé en mémoire : échantillons stéréo entrelacés à sa fréquence d'origine.
#[derive(Clone, Debug)]
pub struct Track {
    pub sample_rate: u32,
    /// Stéréo entrelacé : [g0, d0, g1, d1, …]
    pub samples: Vec<f32>,
}

impl Track {
    pub fn frames(&self) -> usize { self.samples.len() / 2 }
    pub fn duration(&self) -> f64 { self.frames() as f64 / self.sample_rate as f64 }
    /// Construit un morceau à partir de canaux séparés (mono dupliqué en stéréo).
    pub fn from_channels(sample_rate: u32, left: &[f32], right: Option<&[f32]>) -> Self {
        let right = right.unwrap_or(left);
        let mut samples = Vec::with_capacity(left.len() * 2);
        for (l, r) in left.iter().zip(right) { samples.push(*l); samples.push(*r); }
        Self { sample_rate, samples }
    }
}

#[derive(Debug)]
pub enum DecodeError {
    Io(std::io::Error),
    Unsupported(String),
    NoAudio,
}

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DecodeError::Io(e) => write!(f, "lecture impossible : {e}"),
            DecodeError::Unsupported(e) => write!(f, "format non pris en charge : {e}"),
            DecodeError::NoAudio => write!(f, "aucune piste audio dans le fichier"),
        }
    }
}
impl std::error::Error for DecodeError {}

pub fn decode_file(path: impl AsRef<Path>) -> Result<Track, DecodeError> {
    let path = path.as_ref();
    let file = File::open(path).map_err(DecodeError::Io)?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) { hint.with_extension(ext); }

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| DecodeError::Unsupported(e.to_string()))?;
    let mut format = probed.format;
    let track = format.default_track().ok_or(DecodeError::NoAudio)?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| DecodeError::Unsupported(e.to_string()))?;
    let mut sample_rate = track.codec_params.sample_rate.unwrap_or(44100);

    let mut out: Vec<f32> = Vec::new();
    let mut buf: Option<SampleBuffer<f32>> = None;
    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(SymError::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(SymError::ResetRequired) => break,
            Err(e) => return Err(DecodeError::Unsupported(e.to_string())),
        };
        if packet.track_id() != track_id { continue; }
        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            // Un paquet abîmé ne doit pas faire échouer tout le morceau.
            Err(SymError::DecodeError(_)) => continue,
            Err(e) => return Err(DecodeError::Unsupported(e.to_string())),
        };
        let spec = *decoded.spec();
        sample_rate = spec.rate;
        let channels = spec.channels.count().max(1);
        let sb = buf.get_or_insert_with(|| SampleBuffer::new(decoded.capacity() as u64, spec));
        if sb.capacity() < decoded.capacity() * channels {
            *sb = SampleBuffer::new(decoded.capacity() as u64, spec);
        }
        sb.copy_interleaved_ref(decoded);
        let s = sb.samples();
        match channels {
            1 => s.iter().for_each(|v| { out.push(*v); out.push(*v); }),
            2 => out.extend_from_slice(s),
            n => s.chunks_exact(n).for_each(|f| { out.push(f[0]); out.push(f[1]); }),
        }
    }
    if out.is_empty() { return Err(DecodeError::NoAudio); }
    Ok(Track { sample_rate, samples: out })
}
