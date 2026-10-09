//! Sortie vers les cartes son (feature `device`).
//! Trois cas couverts, comme dans les logiciels DJ :
//! 1. tout sur une carte stéréo (le casque n'est pas séparé) ;
//! 2. table DJ à carte son 4 canaux : master sur 1-2, casque sur 3-4 ;
//! 3. deux cartes distinctes : master sur l'une, casque sur l'autre.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SizedSample};

use crate::engine::Engine;

const CHUNK: usize = 4096;

#[derive(Clone, Debug)]
pub struct OutputInfo {
    pub name: String,
    pub channels: u16,
    pub sample_rate: u32,
}

/// Liste des sorties audio disponibles.
pub fn list_outputs() -> Vec<OutputInfo> {
    let host = cpal::default_host();
    let Ok(devs) = host.output_devices() else { return vec![] };
    devs.filter_map(|d| {
        let cfg = d.default_output_config().ok()?;
        Some(OutputInfo { name: d.name().ok()?, channels: cfg.channels(), sample_rate: cfg.sample_rate().0 })
    })
    .collect()
}

#[derive(Clone, Debug, Default)]
pub struct OutputSetup {
    /// Sortie master ; `None` = sortie par défaut du système.
    pub master: Option<String>,
    /// Sortie casque sur une autre carte ; `None` = pas de carte casque séparée.
    pub headphones: Option<String>,
    /// Sur une carte 4 canaux, envoyer le casque sur les canaux 3-4.
    pub headphones_on_3_4: bool,
}

/// Garde les flux ouverts ; les relâcher coupe le son.
pub struct Running {
    _master: cpal::Stream,
    _hp: Option<cpal::Stream>,
    pub sample_rate: u32,
}

fn find(host: &cpal::Host, name: &Option<String>) -> Result<cpal::Device, String> {
    match name {
        None => host.default_output_device().ok_or_else(|| "aucune sortie audio".to_string()),
        Some(n) => host
            .output_devices()
            .map_err(|e| e.to_string())?
            .find(|d| d.name().map(|x| &x == n).unwrap_or(false))
            .ok_or_else(|| format!("sortie « {n} » introuvable")),
    }
}

/// Ouvre les sorties et démarre le moteur. `make_engine` reçoit la fréquence de la carte master.
pub fn start(setup: &OutputSetup, make_engine: impl FnOnce(u32) -> Engine) -> Result<Running, String> {
    let host = cpal::default_host();
    let dev = find(&host, &setup.master)?;
    let supported = dev.default_output_config().map_err(|e| e.to_string())?;
    let sample_rate = supported.sample_rate().0;
    let channels = supported.channels() as usize;
    let engine = make_engine(sample_rate);

    // Casque sur une deuxième carte : le fil master lui passe le signal par un tampon circulaire.
    let mut hp_stream = None;
    let mut hp_tx = None;
    if let Some(name) = &setup.headphones {
        let hdev = find(&host, &Some(name.clone()))?;
        let hcfg = hdev.default_output_config().map_err(|e| e.to_string())?;
        if hcfg.sample_rate().0 != sample_rate {
            return Err(format!("la carte casque tourne à {} Hz et la carte master à {} Hz : règle-les sur la même fréquence", hcfg.sample_rate().0, sample_rate));
        }
        let (tx, rx) = rtrb::RingBuffer::<f32>::new(sample_rate as usize); // ~0,5 s stéréo
        hp_tx = Some(tx);
        hp_stream = Some(build_hp(&hdev, &hcfg, rx)?);
    }

    let to_34 = setup.headphones_on_3_4 && channels >= 4 && hp_tx.is_none();
    let master = build_master(&dev, &supported, engine, channels, to_34, hp_tx)?;
    master.play().map_err(|e| e.to_string())?;
    if let Some(s) = &hp_stream { s.play().map_err(|e| e.to_string())?; }
    Ok(Running { _master: master, _hp: hp_stream, sample_rate })
}

fn build_master(
    dev: &cpal::Device,
    cfg: &cpal::SupportedStreamConfig,
    engine: Engine,
    channels: usize,
    to_34: bool,
    hp_tx: Option<rtrb::Producer<f32>>,
) -> Result<cpal::Stream, String> {
    macro_rules! go { ($t:ty) => { master_stream::<$t>(dev, &cfg.config(), engine, channels, to_34, hp_tx) } }
    match cfg.sample_format() {
        cpal::SampleFormat::F32 => go!(f32),
        cpal::SampleFormat::I16 => go!(i16),
        cpal::SampleFormat::I32 => go!(i32),
        cpal::SampleFormat::U16 => go!(u16),
        f => Err(format!("format d'échantillon non géré : {f:?}")),
    }
}

fn master_stream<T: SizedSample + FromSample<f32>>(
    dev: &cpal::Device,
    config: &cpal::StreamConfig,
    mut engine: Engine,
    channels: usize,
    to_34: bool,
    mut hp_tx: Option<rtrb::Producer<f32>>,
) -> Result<cpal::Stream, String> {
    let mut m = vec![0.0f32; CHUNK * 2];
    let mut h = vec![0.0f32; CHUNK * 2];
    dev.build_output_stream(
        config,
        move |data: &mut [T], _| {
            let frames = data.len() / channels;
            let mut done = 0;
            while done < frames {
                let n = (frames - done).min(CHUNK);
                engine.render(&mut m[..n * 2], &mut h[..n * 2]);
                for i in 0..n {
                    let f = &mut data[(done + i) * channels..(done + i + 1) * channels];
                    for (c, s) in f.iter_mut().enumerate() {
                        let v = match c {
                            0 | 1 => m[2 * i + c],
                            2 | 3 if to_34 => h[2 * i + c - 2],
                            _ => 0.0,
                        };
                        *s = T::from_sample(v);
                    }
                }
                if let Some(tx) = hp_tx.as_mut() {
                    // Si la carte casque prend du retard, on jette plutôt que de bloquer le master.
                    for v in &h[..n * 2] { if tx.push(*v).is_err() { break; } }
                }
                done += n;
            }
        },
        |e| eprintln!("sortie master : {e}"),
        None,
    )
    .map_err(|e| e.to_string())
}

fn build_hp(dev: &cpal::Device, cfg: &cpal::SupportedStreamConfig, rx: rtrb::Consumer<f32>) -> Result<cpal::Stream, String> {
    macro_rules! go { ($t:ty) => { hp_stream::<$t>(dev, &cfg.config(), rx) } }
    match cfg.sample_format() {
        cpal::SampleFormat::F32 => go!(f32),
        cpal::SampleFormat::I16 => go!(i16),
        cpal::SampleFormat::I32 => go!(i32),
        cpal::SampleFormat::U16 => go!(u16),
        f => Err(format!("format d'échantillon non géré : {f:?}")),
    }
}

fn hp_stream<T: SizedSample + FromSample<f32>>(dev: &cpal::Device, config: &cpal::StreamConfig, mut rx: rtrb::Consumer<f32>) -> Result<cpal::Stream, String> {
    let channels = config.channels as usize;
    dev.build_output_stream(
        config,
        move |data: &mut [T], _| {
            for f in data.chunks_mut(channels) {
                let (l, r) = if rx.slots() >= 2 { (rx.pop().unwrap_or(0.0), rx.pop().unwrap_or(0.0)) } else { (0.0, 0.0) };
                for (c, s) in f.iter_mut().enumerate() {
                    *s = T::from_sample(match c { 0 => l, 1 => r, _ => 0.0 });
                }
            }
        },
        |e| eprintln!("sortie casque : {e}"),
        None,
    )
    .map_err(|e| e.to_string())
}
