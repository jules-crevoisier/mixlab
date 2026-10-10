//! Sorties live et réseau, sans dépendance lourde (std, plus socket2 pour Link).
//!
//! - Diffusion vers un serveur Icecast (PUT ou SOURCE) ou Shoutcast v1 : l'interface
//!   encode le master (MediaRecorder) et pousse les octets par `stream_send`.
//! - « Now playing » : un fichier texte réécrit à chaque morceau, et une petite page
//!   pour OBS servie en local (`TcpListener`) avec le titre en JSON.
//! - OSC par UDP : chaque message arrive dans l'interface par l'événement `osc`.
//! - Ableton Link, en écoute : le tempo des pairs du réseau arrive par l'événement `link`.
//! - Sortie vidéo : `window.open` depuis l'interface ouvre une vraie fenêtre (voir `main_window`).
//! - Paroles : le fichier .lrc posé à côté d'un morceau autorisé.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream, ToSocketAddrs, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::files::Allowed;

/* ---------- état partagé ---------- */

#[derive(Default)]
pub struct Live {
    stream: Mutex<Option<TcpStream>>,
    sent: AtomicU64,
    now: Arc<Mutex<Now>>,
    overlay: Mutex<Option<(u16, Arc<AtomicBool>)>>,
    osc: Mutex<Option<(u16, Arc<AtomicBool>)>>,
    link: Mutex<Option<Arc<AtomicBool>>>,
    np_path: Mutex<Option<PathBuf>>,
}

/// Ce que la page OBS affiche.
#[derive(Default, Clone)]
pub struct Now {
    pub text: String,
    pub json: String,
    pub html: String,
}

/* ---------- Base64 (authentification HTTP) ---------- */

pub fn base64(input: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for c in input.chunks(3) {
        let b = [c[0], *c.get(1).unwrap_or(&0), *c.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

fn url_encode(s: &str) -> String {
    let mut o = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
            o.push(b as char);
        } else {
            o.push_str(&format!("%{b:02X}"));
        }
    }
    o
}

/// Une valeur d'en-tête ne doit jamais casser la requête (retours à la ligne retirés).
fn hv(s: &str) -> String {
    s.chars().filter(|c| !c.is_control()).collect::<String>().trim().to_string()
}

/* ---------- diffusion ---------- */

#[derive(Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct StreamCfg {
    pub host: String,
    pub port: u16,
    pub mount: String,
    pub user: String,
    pub password: String,
    /// "icecast" (PUT, Icecast 2.4 et plus), "icecast-source" (méthode SOURCE, serveurs anciens) ou "shoutcast" (v1).
    pub kind: String,
    pub content_type: String,
    pub name: String,
    pub genre: String,
    pub description: String,
    pub url: String,
    pub public: bool,
    pub bitrate: u32,
}

impl StreamCfg {
    fn mount(&self) -> String {
        let m = hv(&self.mount);
        if m.starts_with('/') { m } else { format!("/{m}") }
    }
    fn user(&self) -> String {
        let u = hv(&self.user);
        if u.is_empty() { "source".into() } else { u }
    }
}

/// En-têtes envoyés au serveur Icecast pour ouvrir le point de montage.
pub fn source_request(c: &StreamCfg) -> String {
    let method = if c.kind == "icecast-source" { "SOURCE" } else { "PUT" };
    let proto = if method == "PUT" { "HTTP/1.1" } else { "HTTP/1.0" };
    let auth = base64(format!("{}:{}", c.user(), c.password).as_bytes());
    let mut r = format!(
        "{method} {} {proto}\r\nHost: {}:{}\r\nAuthorization: Basic {auth}\r\nUser-Agent: Mixlab/0.3\r\nContent-Type: {}\r\n",
        c.mount(),
        hv(&c.host),
        c.port,
        hv(&c.content_type)
    );
    if method == "PUT" {
        r.push_str("Expect: 100-continue\r\n");
    }
    r.push_str(&format!("Ice-Public: {}\r\n", u8::from(c.public)));
    for (k, v) in [("Ice-Name", &c.name), ("Ice-Genre", &c.genre), ("Ice-Description", &c.description), ("Ice-Url", &c.url)] {
        if !hv(v).is_empty() {
            r.push_str(&format!("{k}: {}\r\n", hv(v)));
        }
    }
    if c.bitrate > 0 {
        r.push_str(&format!("Ice-Audio-Info: bitrate={}\r\n", c.bitrate));
    }
    r.push_str("\r\n");
    r
}

/// Lit l'en-tête de réponse (jusqu'à la ligne vide, 8 Ko au plus).
fn read_head(s: &mut TcpStream) -> Result<String, String> {
    let mut buf = Vec::new();
    let mut b = [0u8; 1];
    while buf.len() < 8192 {
        match s.read(&mut b) {
            Ok(0) => break,
            Ok(_) => {
                buf.push(b[0]);
                if buf.ends_with(b"\r\n\r\n") || buf.ends_with(b"\n\n") {
                    break;
                }
                // Shoutcast v1 répond « OK2 » suivi d'un seul retour à la ligne
                if buf.starts_with(b"OK2") && buf.ends_with(b"\n") {
                    break;
                }
                if buf.starts_with(b"invalid password") && buf.ends_with(b"\n") {
                    break;
                }
            }
            Err(e) => return Err(format!("Pas de réponse du serveur ({e})")),
        }
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// Traduit la réponse du serveur en succès ou en message clair.
pub fn check_reply(head: &str, kind: &str) -> Result<(), String> {
    let first = head.lines().next().unwrap_or("").trim();
    if kind == "shoutcast" {
        return if first.starts_with("OK2") { Ok(()) } else { Err("Mot de passe refusé par le serveur Shoutcast".into()) };
    }
    let code: u16 = first.split_whitespace().nth(1).and_then(|c| c.parse().ok()).unwrap_or(0);
    match code {
        100 | 200 => Ok(()),
        401 => Err("Identifiant ou mot de passe refusé".into()),
        403 => Err("Point de montage refusé ou déjà occupé".into()),
        404 => Err("Point de montage inconnu".into()),
        405 => Err("Ce serveur n'accepte pas PUT : choisis la méthode SOURCE (Icecast ancien)".into()),
        0 => Err("Le serveur a fermé la connexion sans répondre".into()),
        _ => Err(format!("Réponse du serveur : {first}")),
    }
}

fn connect(host: &str, port: u16) -> Result<TcpStream, String> {
    let addrs: Vec<SocketAddr> = (hv(host).as_str(), port)
        .to_socket_addrs()
        .map_err(|_| format!("Adresse introuvable : {host}"))?
        .collect();
    let mut last = String::from("Adresse introuvable");
    for a in addrs {
        match TcpStream::connect_timeout(&a, Duration::from_secs(5)) {
            Ok(s) => {
                let _ = s.set_read_timeout(Some(Duration::from_secs(5)));
                let _ = s.set_write_timeout(Some(Duration::from_secs(5)));
                let _ = s.set_nodelay(true);
                return Ok(s);
            }
            Err(e) => last = format!("Connexion impossible à {a} ({e})"),
        }
    }
    Err(last)
}

/// Ouvre la connexion source et fait la poignée de main. Renvoie la socket prête à recevoir le son.
pub fn open_source(c: &StreamCfg) -> Result<TcpStream, String> {
    if hv(&c.host).is_empty() || c.port == 0 {
        return Err("Indique l'adresse et le port du serveur".into());
    }
    if c.kind == "shoutcast" {
        // Shoutcast v1 : la source se connecte au port suivant, envoie le mot de passe puis les en-têtes icy.
        let mut s = connect(&c.host, c.port.saturating_add(1))?;
        s.write_all(format!("{}\r\n", hv(&c.password)).as_bytes()).map_err(|e| e.to_string())?;
        check_reply(&read_head(&mut s)?, "shoutcast")?;
        let mut h = format!(
            "content-type:{}\r\nicy-name:{}\r\nicy-genre:{}\r\nicy-pub:{}\r\nicy-url:{}\r\n",
            hv(&c.content_type),
            hv(&c.name),
            hv(&c.genre),
            u8::from(c.public),
            hv(&c.url)
        );
        if c.bitrate > 0 {
            h.push_str(&format!("icy-br:{}\r\n", c.bitrate));
        }
        h.push_str("\r\n");
        s.write_all(h.as_bytes()).map_err(|e| e.to_string())?;
        return Ok(s);
    }
    let mut s = connect(&c.host, c.port)?;
    s.write_all(source_request(c).as_bytes()).map_err(|e| e.to_string())?;
    check_reply(&read_head(&mut s)?, &c.kind)?;
    Ok(s)
}

/// Requête de mise à jour du titre (Icecast : /admin/metadata ; Shoutcast : /admin.cgi).
pub fn metadata_request(c: &StreamCfg, song: &str) -> String {
    if c.kind == "shoutcast" {
        format!(
            "GET /admin.cgi?pass={}&mode=updinfo&song={} HTTP/1.0\r\nUser-Agent: Mozilla/5.0 (Mixlab)\r\n\r\n",
            url_encode(&c.password),
            url_encode(song)
        )
    } else {
        let auth = base64(format!("{}:{}", c.user(), c.password).as_bytes());
        format!(
            "GET /admin/metadata?mount={}&mode=updinfo&charset=UTF-8&song={} HTTP/1.0\r\nHost: {}:{}\r\nAuthorization: Basic {auth}\r\nUser-Agent: Mixlab/0.3\r\n\r\n",
            url_encode(&c.mount()),
            url_encode(song),
            hv(&c.host),
            c.port
        )
    }
}

#[derive(Serialize)]
pub struct StreamState {
    connected: bool,
    sent: u64,
}

#[tauri::command]
pub async fn stream_start(cfg: StreamCfg, live: State<'_, Live>) -> Result<String, String> {
    let s = tauri::async_runtime::spawn_blocking(move || open_source(&cfg)).await.map_err(|e| e.to_string())??;
    *live.stream.lock().unwrap() = Some(s);
    live.sent.store(0, Ordering::Relaxed);
    Ok("connecté".into())
}

/// Octets encodés du master, envoyés tels quels (binaire brut, pas de JSON).
#[tauri::command]
pub async fn stream_send(request: tauri::ipc::Request<'_>, live: State<'_, Live>) -> Result<u64, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Données binaires attendues".into());
    };
    let mut g = live.stream.lock().unwrap();
    let Some(s) = g.as_mut() else { return Err("Pas de diffusion en cours".into()) };
    if let Err(e) = s.write_all(bytes) {
        *g = None;
        return Err(format!("Connexion perdue ({e})"));
    }
    Ok(live.sent.fetch_add(bytes.len() as u64, Ordering::Relaxed) + bytes.len() as u64)
}

#[tauri::command]
pub fn stream_stop(live: State<'_, Live>) -> bool {
    let s = live.stream.lock().unwrap().take();
    if let Some(s) = s {
        let _ = s.shutdown(std::net::Shutdown::Both);
        return true;
    }
    false
}

#[tauri::command]
pub fn stream_state(live: State<'_, Live>) -> StreamState {
    StreamState { connected: live.stream.lock().unwrap().is_some(), sent: live.sent.load(Ordering::Relaxed) }
}

/// Titre en cours envoyé au serveur (au mieux : une erreur ici n'arrête pas la diffusion).
#[tauri::command]
pub async fn stream_metadata(cfg: StreamCfg, song: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut s = connect(&cfg.host, cfg.port)?;
        s.write_all(metadata_request(&cfg, &song).as_bytes()).map_err(|e| e.to_string())?;
        let head = read_head(&mut s)?;
        Ok(head.lines().next().map(|l| l.contains(" 200")).unwrap_or(false))
    })
    .await
    .map_err(|e| e.to_string())?
}

/* ---------- now playing : fichier texte et page OBS ---------- */

fn default_np_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("live");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("now-playing.txt"))
}

fn np_path(app: &AppHandle, live: &Live) -> Result<PathBuf, String> {
    if let Some(p) = live.np_path.lock().unwrap().clone() {
        return Ok(p);
    }
    // chemin choisi lors d'une session précédente
    let saved = default_np_path(app)?.with_file_name("now-playing-path.txt");
    if let Ok(p) = std::fs::read_to_string(&saved) {
        let p = PathBuf::from(p.trim());
        if p.is_absolute() && p.extension().map(|e| e == "txt").unwrap_or(false) {
            *live.np_path.lock().unwrap() = Some(p.clone());
            return Ok(p);
        }
    }
    default_np_path(app)
}

/// Titre en cours : réécrit le fichier texte (et un .json à côté) et met à jour la page OBS.
#[tauri::command]
pub async fn nowplaying_set(app: AppHandle, text: String, json: String, live: State<'_, Live>) -> Result<String, String> {
    if text.len() > 4096 || json.len() > 65536 {
        return Err("Texte trop long".into());
    }
    {
        let mut n = live.now.lock().unwrap();
        n.text = text.clone();
        n.json = json.clone();
    }
    let p = np_path(&app, &live)?;
    std::fs::write(&p, &text).map_err(|e| e.to_string())?;
    let _ = std::fs::write(p.with_extension("json"), &json);
    Ok(p.to_string_lossy().into_owned())
}

/// Choisir où écrire le fichier texte (OBS : source « Texte », lire depuis un fichier).
#[tauri::command]
pub async fn nowplaying_pick(app: AppHandle, live: State<'_, Live>) -> Result<Option<String>, String> {
    let Some(p) = app
        .dialog()
        .file()
        .set_file_name("now-playing.txt")
        .add_filter("Texte", &["txt"])
        .blocking_save_file()
        .and_then(|f| f.into_path().ok())
    else {
        return Ok(None);
    };
    let p = if p.extension().map(|e| e == "txt").unwrap_or(false) { p } else { p.with_extension("txt") };
    let _ = std::fs::write(default_np_path(&app)?.with_file_name("now-playing-path.txt"), p.to_string_lossy().as_bytes());
    *live.np_path.lock().unwrap() = Some(p.clone());
    Ok(Some(p.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn nowplaying_path(app: AppHandle, live: State<'_, Live>) -> Result<String, String> {
    Ok(np_path(&app, &live)?.to_string_lossy().into_owned())
}

/// Réponse HTTP pour la page OBS : `/` la page, `/now.json` et `/now.txt` le titre.
pub fn overlay_response(path: &str, now: &Now) -> (u16, &'static str, Vec<u8>) {
    let path = path.split('?').next().unwrap_or("/");
    match path {
        "/" | "/overlay" | "/index.html" => (200, "text/html; charset=utf-8", now.html.as_bytes().to_vec()),
        "/now.json" => (200, "application/json; charset=utf-8", if now.json.is_empty() { b"{}".to_vec() } else { now.json.as_bytes().to_vec() }),
        "/now.txt" => (200, "text/plain; charset=utf-8", now.text.as_bytes().to_vec()),
        _ => (404, "text/plain; charset=utf-8", b"introuvable".to_vec()),
    }
}

fn serve_one(mut s: TcpStream, now: &Arc<Mutex<Now>>) {
    let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
    let mut buf = [0u8; 2048];
    let n = s.read(&mut buf).unwrap_or(0);
    let req = String::from_utf8_lossy(&buf[..n]);
    let mut parts = req.lines().next().unwrap_or("").split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("/");
    let (code, ctype, body) = if method == "GET" || method == "HEAD" {
        overlay_response(path, &now.lock().unwrap())
    } else {
        (405, "text/plain; charset=utf-8", b"GET seulement".to_vec())
    };
    let status = match code {
        200 => "200 OK",
        404 => "404 Not Found",
        _ => "405 Method Not Allowed",
    };
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = s.write_all(head.as_bytes());
    if method != "HEAD" {
        let _ = s.write_all(&body);
    }
}

/// Petit serveur HTTP local (127.0.0.1 seulement) pour la source « Navigateur » d'OBS.
pub fn overlay_serve(port: u16, now: Arc<Mutex<Now>>, stop: Arc<AtomicBool>) -> std::io::Result<u16> {
    let l = TcpListener::bind((Ipv4Addr::LOCALHOST, port))?;
    let port = l.local_addr()?.port();
    l.set_nonblocking(true)?;
    std::thread::spawn(move || {
        while !stop.load(Ordering::Relaxed) {
            match l.accept() {
                Ok((s, _)) => {
                    let _ = s.set_nonblocking(false);
                    let now = now.clone();
                    std::thread::spawn(move || serve_one(s, &now));
                }
                Err(_) => std::thread::sleep(Duration::from_millis(40)),
            }
        }
    });
    Ok(port)
}

#[tauri::command]
pub fn overlay_start(port: u16, html: String, live: State<'_, Live>) -> Result<String, String> {
    live.now.lock().unwrap().html = html;
    let mut g = live.overlay.lock().unwrap();
    if let Some((p, stop)) = g.as_ref() {
        if *p == port || port == 0 {
            return Ok(format!("http://127.0.0.1:{p}/"));
        }
        stop.store(true, Ordering::Relaxed);
    }
    let stop = Arc::new(AtomicBool::new(false));
    let p = overlay_serve(port, live.now.clone(), stop.clone()).map_err(|e| format!("Port {port} indisponible ({e})"))?;
    *g = Some((p, stop));
    Ok(format!("http://127.0.0.1:{p}/"))
}

#[tauri::command]
pub fn overlay_stop(live: State<'_, Live>) -> bool {
    if let Some((_, stop)) = live.overlay.lock().unwrap().take() {
        stop.store(true, Ordering::Relaxed);
        return true;
    }
    false
}

/* ---------- OSC ---------- */

fn osc_str(b: &[u8], o: &mut usize) -> Option<String> {
    let start = *o;
    let end = start + b.get(start..)?.iter().position(|&c| c == 0)?;
    let s = String::from_utf8_lossy(&b[start..end]).into_owned();
    *o = (end + 4) & !3;
    Some(s)
}

fn be4(b: &[u8], o: &mut usize) -> Option<[u8; 4]> {
    let v = b.get(*o..*o + 4)?.try_into().ok()?;
    *o += 4;
    Some(v)
}

fn be8(b: &[u8], o: &mut usize) -> Option<[u8; 8]> {
    let v = b.get(*o..*o + 8)?.try_into().ok()?;
    *o += 8;
    Some(v)
}

/// Décode un paquet OSC 1.0 (message ou bundle) en (adresse, arguments).
pub fn osc_parse(b: &[u8], out: &mut Vec<(String, Vec<Value>)>, depth: u32) {
    if depth > 8 || b.is_empty() {
        return;
    }
    if b.starts_with(b"#bundle\0") {
        let mut o = 16;
        while o + 4 <= b.len() {
            let n = i32::from_be_bytes(b[o..o + 4].try_into().unwrap()).max(0) as usize;
            o += 4;
            if o + n > b.len() {
                break;
            }
            osc_parse(&b[o..o + n], out, depth + 1);
            o += n;
        }
        return;
    }
    let mut o = 0;
    let Some(addr) = osc_str(b, &mut o) else { return };
    if !addr.starts_with('/') {
        return;
    }
    let tags = if o < b.len() && b[o] == b',' { osc_str(b, &mut o).unwrap_or_default() } else { String::new() };
    let mut args = Vec::new();
    for t in tags.chars().skip(1) {
        let v = match t {
            'i' => be4(b, &mut o).map(|x| Value::from(i32::from_be_bytes(x))),
            'f' => be4(b, &mut o).map(|x| Value::from(f32::from_be_bytes(x) as f64)),
            'd' => be8(b, &mut o).map(|x| Value::from(f64::from_be_bytes(x))),
            'h' => be8(b, &mut o).map(|x| Value::from(i64::from_be_bytes(x))),
            's' | 'S' => osc_str(b, &mut o).map(Value::from),
            'T' | 'I' => Some(Value::from(true)),
            'F' => Some(Value::from(false)),
            'N' => Some(Value::Null),
            'b' => {
                let Some(n) = be4(b, &mut o) else { break };
                o += (i32::from_be_bytes(n).max(0) as usize + 3) & !3;
                Some(Value::Null)
            }
            _ => None,
        };
        match v {
            Some(v) => args.push(v),
            None => break,
        }
    }
    out.push((addr, args));
}

/// Fabrique un message OSC (tests).
#[cfg(test)]
pub fn osc_message(addr: &str, args: &[Value]) -> Vec<u8> {
    let pad = |v: &mut Vec<u8>| {
        v.push(0);
        while v.len() % 4 != 0 {
            v.push(0);
        }
    };
    let mut m = addr.as_bytes().to_vec();
    pad(&mut m);
    let mut tags = String::from(",");
    let mut data = Vec::new();
    for a in args {
        match a {
            Value::Bool(true) => tags.push('T'),
            Value::Bool(false) => tags.push('F'),
            Value::Number(n) if n.is_i64() => {
                tags.push('i');
                data.extend((n.as_i64().unwrap() as i32).to_be_bytes());
            }
            Value::Number(n) => {
                tags.push('f');
                data.extend((n.as_f64().unwrap_or(0.0) as f32).to_be_bytes());
            }
            Value::String(s) => {
                tags.push('s');
                data.extend(s.as_bytes());
                pad(&mut data);
            }
            _ => tags.push('N'),
        }
    }
    let mut t = tags.into_bytes();
    pad(&mut t);
    m.extend(t);
    m.extend(data);
    m
}

#[derive(Serialize, Clone)]
struct OscEvent {
    addr: String,
    args: Vec<Value>,
    from: String,
}

#[tauri::command]
pub fn osc_start(app: AppHandle, port: u16, live: State<'_, Live>) -> Result<u16, String> {
    let mut g = live.osc.lock().unwrap();
    if let Some((p, stop)) = g.take() {
        if p == port {
            *g = Some((p, stop));
            return Ok(p);
        }
        stop.store(true, Ordering::Relaxed);
    }
    let sock = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, port)).map_err(|e| format!("Port UDP {port} indisponible ({e})"))?;
    let p = sock.local_addr().map_err(|e| e.to_string())?.port();
    let _ = sock.set_read_timeout(Some(Duration::from_millis(300)));
    let stop = Arc::new(AtomicBool::new(false));
    let st = stop.clone();
    std::thread::spawn(move || {
        let mut buf = vec![0u8; 65536];
        while !st.load(Ordering::Relaxed) {
            let Ok((n, from)) = sock.recv_from(&mut buf) else { continue };
            let mut msgs = Vec::new();
            osc_parse(&buf[..n], &mut msgs, 0);
            for (addr, args) in msgs {
                let _ = app.emit("osc", OscEvent { addr, args, from: from.to_string() });
            }
        }
    });
    *g = Some((p, stop));
    Ok(p)
}

#[tauri::command]
pub fn osc_stop(live: State<'_, Live>) -> bool {
    if let Some((_, stop)) = live.osc.lock().unwrap().take() {
        stop.store(true, Ordering::Relaxed);
        return true;
    }
    false
}

/* ---------- Ableton Link (écoute du tempo) ----------
   Protocole de découverte de Link : multicast 224.76.78.75:20808, en-tête « _asdp_v » + 1,
   type de message, durée de vie, groupe, identifiant du pair, puis des entrées
   (clé sur 4 lettres, taille, données, en ordre réseau). On lit la ligne de temps
   « tmln » (microsecondes par temps) et l'état « stst » (lecture en cours). */

pub const LINK_GROUP: Ipv4Addr = Ipv4Addr::new(224, 76, 78, 75);
pub const LINK_PORT: u16 = 20808;

#[derive(Debug, Clone, PartialEq)]
pub struct LinkMsg {
    pub kind: u8,
    pub ttl: u8,
    pub id: [u8; 8],
    pub tempo: Option<f64>,
    pub playing: Option<bool>,
}

pub fn link_parse(b: &[u8]) -> Option<LinkMsg> {
    if b.len() < 20 || &b[0..8] != b"_asdp_v\x01" {
        return None;
    }
    let kind = b[8];
    let ttl = b[9];
    let id: [u8; 8] = b[12..20].try_into().ok()?;
    let mut m = LinkMsg { kind, ttl, id, tempo: None, playing: None };
    let mut o = 20;
    while o + 8 <= b.len() {
        let key = &b[o..o + 4];
        let n = u32::from_be_bytes(b[o + 4..o + 8].try_into().ok()?) as usize;
        o += 8;
        let d = b.get(o..o + n)?;
        o += n;
        match key {
            b"tmln" if n >= 8 => {
                let us = i64::from_be_bytes(d[0..8].try_into().ok()?);
                if us > 0 {
                    m.tempo = Some(60_000_000.0 / us as f64);
                }
            }
            b"stst" if n >= 1 => m.playing = Some(d[0] != 0),
            _ => {}
        }
    }
    Some(m)
}

/// Fabrique un message ALIVE (tests).
#[cfg(test)]
pub fn link_alive(id: [u8; 8], bpm: f64, playing: bool) -> Vec<u8> {
    let mut v = b"_asdp_v\x01".to_vec();
    v.extend([1u8, 5, 0, 0]);
    v.extend(id);
    let us = (60_000_000.0 / bpm).round() as i64;
    v.extend(b"tmln");
    v.extend(24u32.to_be_bytes());
    v.extend(us.to_be_bytes());
    v.extend(0i64.to_be_bytes());
    v.extend(0i64.to_be_bytes());
    v.extend(b"stst");
    v.extend(17u32.to_be_bytes());
    v.push(u8::from(playing));
    v.extend(0i64.to_be_bytes());
    v.extend(0i64.to_be_bytes());
    v
}

/// Pairs vus récemment ; le tempo de la session est celui du dernier pair qui a parlé.
#[derive(Default)]
pub struct LinkPeers {
    peers: HashMap<[u8; 8], (f64, Option<bool>, Instant, u8)>,
}

impl LinkPeers {
    pub fn update(&mut self, m: &LinkMsg, now: Instant) {
        if m.kind == 3 {
            self.peers.remove(&m.id);
        } else if let Some(t) = m.tempo {
            self.peers.insert(m.id, (t, m.playing, now, m.ttl.max(1)));
        }
        self.peers.retain(|_, p| now.duration_since(p.2) < Duration::from_secs(u64::from(p.3) + 2));
    }
    pub fn count(&self) -> usize {
        self.peers.len()
    }
}

#[derive(Serialize, Clone)]
struct LinkEvent {
    tempo: Option<f64>,
    peers: usize,
    playing: Option<bool>,
}

fn link_socket() -> std::io::Result<UdpSocket> {
    use socket2::{Domain, Protocol, Socket, Type};
    let s = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))?;
    // Ableton Live et les autres applis Link écoutent le même port sur la même machine.
    s.set_reuse_address(true)?;
    #[cfg(all(unix, not(any(target_os = "solaris", target_os = "illumos"))))]
    s.set_reuse_port(true)?;
    s.bind(&SocketAddr::from((Ipv4Addr::UNSPECIFIED, LINK_PORT)).into())?;
    s.join_multicast_v4(&LINK_GROUP, &Ipv4Addr::UNSPECIFIED)?;
    let u: UdpSocket = s.into();
    u.set_read_timeout(Some(Duration::from_millis(300)))?;
    Ok(u)
}

#[tauri::command]
pub fn link_start(app: AppHandle, live: State<'_, Live>) -> Result<bool, String> {
    let mut g = live.link.lock().unwrap();
    if g.is_some() {
        return Ok(true);
    }
    let sock = link_socket().map_err(|e| format!("Link indisponible ({e})"))?;
    let stop = Arc::new(AtomicBool::new(false));
    let st = stop.clone();
    std::thread::spawn(move || {
        let mut peers = LinkPeers::default();
        let mut buf = [0u8; 2048];
        let mut last = Instant::now() - Duration::from_secs(10);
        while !st.load(Ordering::Relaxed) {
            let got = sock.recv_from(&mut buf).ok().and_then(|(n, _)| link_parse(&buf[..n]));
            let now = Instant::now();
            if let Some(m) = &got {
                peers.update(m, now);
            }
            if got.is_some() || now.duration_since(last) > Duration::from_secs(2) {
                last = now;
                let newest = peers.peers.values().max_by_key(|p| p.2);
                let ev = LinkEvent { tempo: newest.map(|p| p.0), peers: peers.count(), playing: newest.and_then(|p| p.1) };
                let _ = app.emit("link", ev);
            }
        }
    });
    *g = Some(stop);
    Ok(true)
}

#[tauri::command]
pub fn link_stop(live: State<'_, Live>) -> bool {
    if let Some(stop) = live.link.lock().unwrap().take() {
        stop.store(true, Ordering::Relaxed);
        return true;
    }
    false
}

/* ---------- paroles : fichier .lrc à côté du morceau ---------- */

/// Texte d'un fichier en UTF-8, sinon en Latin-1 (vieux fichiers .lrc).
pub fn decode_text(b: &[u8]) -> String {
    let b = b.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(b);
    match std::str::from_utf8(b) {
        Ok(s) => s.to_string(),
        Err(_) => b.iter().map(|&c| c as char).collect(),
    }
}

pub fn sidecar_candidates(audio: &Path) -> Vec<PathBuf> {
    ["lrc", "LRC"].iter().map(|e| audio.with_extension(e)).collect()
}

#[tauri::command]
pub async fn lyrics_sidecar(path: String, allowed: State<'_, Allowed>) -> Result<Option<String>, String> {
    let p = PathBuf::from(&path);
    if !allowed.has(&p) {
        return Err("Fichier non autorisé".into());
    }
    for c in sidecar_candidates(&p) {
        if let Ok(m) = std::fs::metadata(&c) {
            if m.is_file() && m.len() < 1_000_000 {
                return Ok(Some(decode_text(&std::fs::read(&c).map_err(|e| e.to_string())?)));
            }
        }
    }
    Ok(None)
}

/* ---------- fenêtres : la sortie vidéo ---------- */

static WIN: AtomicU32 = AtomicU32::new(1);

/// Fenêtre principale créée ici (et pas par la config) pour accepter `window.open` :
/// la sortie vidéo s'ouvre dans une vraie fenêtre, à poser sur le second écran.
pub fn main_window(app: &tauri::App) -> tauri::Result<()> {
    let Some(cfg) = app.config().app.windows.iter().find(|w| w.label == "main").cloned() else { return Ok(()) };
    let h = app.handle().clone();
    tauri::WebviewWindowBuilder::from_config(app.handle(), &cfg)?
        .on_new_window(move |url, features| {
            let label = format!("sortie-{}", WIN.fetch_add(1, Ordering::Relaxed));
            match tauri::WebviewWindowBuilder::new(&h, label, tauri::WebviewUrl::External(url))
                .window_features(features)
                .title("Mixlab · sortie vidéo")
                .on_document_title_changed(|w, t| {
                    let _ = w.set_title(&t);
                })
                .build()
            {
                Ok(window) => tauri::webview::NewWindowResponse::Create { window },
                Err(_) => tauri::webview::NewWindowResponse::Deny,
            }
        })
        .build()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::BufRead;

    fn cfg(kind: &str, port: u16) -> StreamCfg {
        StreamCfg {
            host: "127.0.0.1".into(),
            port,
            mount: "live".into(),
            user: String::new(),
            password: "hackme".into(),
            kind: kind.into(),
            content_type: "audio/webm".into(),
            name: "Mixlab\r\nX-Injecte: 1".into(),
            genre: "House".into(),
            public: false,
            bitrate: 128,
            ..Default::default()
        }
    }

    #[test]
    fn base64_matches_rfc4648() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"source:hackme"), "c291cmNlOmhhY2ttZQ==");
    }

    #[test]
    fn source_request_has_auth_mount_and_no_header_injection() {
        let r = source_request(&cfg("icecast", 8000));
        assert!(r.starts_with("PUT /live HTTP/1.1\r\n"));
        assert!(r.contains("Authorization: Basic c291cmNlOmhhY2ttZQ==\r\n"));
        assert!(r.contains("Content-Type: audio/webm\r\n"));
        assert!(r.contains("Expect: 100-continue\r\n"));
        assert!(r.contains("Ice-Name: MixlabX-Injecte: 1\r\n"));
        assert!(!r.contains("\r\nX-Injecte"));
        assert!(r.ends_with("\r\n\r\n"));
        assert!(source_request(&cfg("icecast-source", 8000)).starts_with("SOURCE /live HTTP/1.0\r\n"));
    }

    /// Faux serveur Icecast : lit l'en-tête, répond `reply`, puis renvoie ce qu'il a reçu.
    fn fake_icecast(reply: &'static str) -> (u16, std::thread::JoinHandle<(String, Vec<u8>)>) {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let h = std::thread::spawn(move || {
            let (s, _) = l.accept().unwrap();
            let mut r = std::io::BufReader::new(s.try_clone().unwrap());
            let mut head = String::new();
            loop {
                let mut line = String::new();
                if r.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                    break;
                }
                head.push_str(&line);
            }
            (&s).write_all(reply.as_bytes()).unwrap();
            let mut body = Vec::new();
            let _ = r.read_to_end(&mut body);
            (head, body)
        });
        (port, h)
    }

    #[test]
    fn icecast_handshake_then_audio_bytes() {
        let (port, h) = fake_icecast("HTTP/1.1 100 Continue\r\n\r\n");
        let mut s = open_source(&cfg("icecast", port)).expect("poignée de main");
        s.write_all(b"\x1aE\xdf\xa3 octets webm").unwrap();
        drop(s);
        let (head, body) = h.join().unwrap();
        assert!(head.starts_with("PUT /live HTTP/1.1"));
        assert!(head.contains("Authorization: Basic c291cmNlOmhhY2ttZQ=="));
        assert!(head.contains("Ice-Audio-Info: bitrate=128"));
        assert_eq!(body, b"\x1aE\xdf\xa3 octets webm");
    }

    #[test]
    fn icecast_refusals_are_explained() {
        let (port, _h) = fake_icecast("HTTP/1.1 401 Authentication Required\r\n\r\n");
        assert_eq!(open_source(&cfg("icecast", port)).unwrap_err(), "Identifiant ou mot de passe refusé");
        let (port, _h) = fake_icecast("HTTP/1.0 403 Mountpoint in use\r\n\r\n");
        assert_eq!(open_source(&cfg("icecast", port)).unwrap_err(), "Point de montage refusé ou déjà occupé");
        let (port, _h) = fake_icecast("HTTP/1.0 200 OK\r\n\r\n");
        assert!(open_source(&cfg("icecast-source", port)).is_ok());
    }

    #[test]
    fn shoutcast_v1_password_then_icy_headers() {
        // le port de la source est celui du serveur + 1
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let src = l.local_addr().unwrap().port();
        let h = std::thread::spawn(move || {
            let (s, _) = l.accept().unwrap();
            let mut r = std::io::BufReader::new(s.try_clone().unwrap());
            let mut pass = String::new();
            r.read_line(&mut pass).unwrap();
            (&s).write_all(b"OK2\r\nicy-caps:11\r\n\r\n").unwrap();
            let mut rest = String::new();
            let _ = r.read_to_string(&mut rest);
            (pass, rest)
        });
        let s = open_source(&cfg("shoutcast", src - 1)).expect("Shoutcast");
        drop(s);
        let (pass, rest) = h.join().unwrap();
        assert_eq!(pass, "hackme\r\n");
        assert!(rest.contains("content-type:audio/webm\r\n") && rest.contains("icy-br:128\r\n"));
    }

    #[test]
    fn metadata_update_is_url_encoded() {
        let r = metadata_request(&cfg("icecast", 8000), "Artiste - Titre é&");
        assert!(r.starts_with("GET /admin/metadata?mount=%2Flive&mode=updinfo&charset=UTF-8&song=Artiste%20-%20Titre%20%C3%A9%26 HTTP/1.0"));
    }

    #[test]
    fn overlay_server_serves_page_and_json() {
        let now = Arc::new(Mutex::new(Now { text: "A - B".into(), json: "{\"title\":\"B\"}".into(), html: "<p>page</p>".into() }));
        let stop = Arc::new(AtomicBool::new(false));
        let port = overlay_serve(0, now.clone(), stop.clone()).unwrap();
        let get = |p: &str| {
            let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
            s.write_all(format!("GET {p} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes()).unwrap();
            let mut out = String::new();
            s.read_to_string(&mut out).unwrap();
            out
        };
        let j = get("/now.json?t=1");
        assert!(j.starts_with("HTTP/1.1 200 OK") && j.contains("application/json") && j.ends_with("{\"title\":\"B\"}"));
        assert!(get("/").ends_with("<p>page</p>"));
        now.lock().unwrap().text = "C - D".into();
        assert!(get("/now.txt").ends_with("C - D"));
        assert!(get("/../etc/passwd").starts_with("HTTP/1.1 404"));
        stop.store(true, Ordering::Relaxed);
    }

    #[test]
    fn osc_messages_and_bundles() {
        let m = osc_message("/mixlab/A/play", &[Value::from(1)]);
        let mut out = Vec::new();
        osc_parse(&m, &mut out, 0);
        assert_eq!(out, vec![("/mixlab/A/play".to_string(), vec![Value::from(1)])]);
        let f = osc_message("/mixlab/xf", &[Value::from(0.25), Value::from("x"), Value::from(true)]);
        let mut bundle = b"#bundle\0".to_vec();
        bundle.extend([0, 0, 0, 0, 0, 0, 0, 1]);
        for el in [&m, &f] {
            bundle.extend((el.len() as i32).to_be_bytes());
            bundle.extend(el.iter());
        }
        let mut out = Vec::new();
        osc_parse(&bundle, &mut out, 0);
        assert_eq!(out.len(), 2);
        assert_eq!(out[1].0, "/mixlab/xf");
        assert_eq!(out[1].1, vec![Value::from(0.25), Value::from("x"), Value::from(true)]);
        // paquet tronqué : pas de panique
        let mut out = Vec::new();
        osc_parse(&f[..f.len() - 6], &mut out, 0);
        osc_parse(b"pas osc", &mut out, 0);
        assert!(out.len() <= 1);
    }

    #[test]
    fn osc_over_udp_roundtrip() {
        let rx = UdpSocket::bind("127.0.0.1:0").unwrap();
        rx.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        let tx = UdpSocket::bind("127.0.0.1:0").unwrap();
        tx.send_to(&osc_message("/mixlab/B.fader", &[Value::from(0.5)]), rx.local_addr().unwrap()).unwrap();
        let mut buf = [0u8; 512];
        let (n, _) = rx.recv_from(&mut buf).unwrap();
        let mut out = Vec::new();
        osc_parse(&buf[..n], &mut out, 0);
        assert_eq!(out[0], ("/mixlab/B.fader".to_string(), vec![Value::from(0.5)]));
    }

    #[test]
    fn link_alive_gives_tempo_and_peers() {
        let m = link_parse(&link_alive([1; 8], 128.0, true)).unwrap();
        assert_eq!(m.kind, 1);
        assert!((m.tempo.unwrap() - 128.0).abs() < 1e-3);
        assert_eq!(m.playing, Some(true));
        assert!(link_parse(b"_asdp_v\x02xxxxxxxxxxxxxxxxxxx").is_none());
        let mut p = LinkPeers::default();
        let t = Instant::now();
        p.update(&m, t);
        p.update(&link_parse(&link_alive([2; 8], 174.0, false)).unwrap(), t);
        assert_eq!(p.count(), 2);
        let mut bye = m.clone();
        bye.kind = 3;
        p.update(&bye, t);
        assert_eq!(p.count(), 1);
        // un pair silencieux disparaît après sa durée de vie
        p.update(&link_parse(&link_alive([2; 8], 174.0, false)).unwrap(), t + Duration::from_secs(60));
        assert_eq!(p.count(), 1);
    }

    /// Vraie socket Link : port partagé et multicast. Sans route multicast sur la machine, la réception n'est pas vérifiée.
    #[test]
    fn link_socket_hears_multicast_alive() {
        let Ok(rx) = link_socket() else {
            eprintln!("pas de multicast sur cette machine : socket Link non vérifiée");
            return;
        };
        let rx2 = link_socket().expect("le port Link se partage avec une autre appli");
        drop(rx2);
        let tx = UdpSocket::bind("0.0.0.0:0").unwrap();
        let _ = tx.set_multicast_loop_v4(true);
        if tx.send_to(&link_alive([7; 8], 122.0, true), (LINK_GROUP, LINK_PORT)).is_err() {
            return;
        }
        let mut buf = [0u8; 512];
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            if let Ok((n, _)) = rx.recv_from(&mut buf) {
                if let Some(m) = link_parse(&buf[..n]) {
                    if m.id == [7; 8] {
                        assert!((m.tempo.unwrap() - 122.0).abs() < 1e-3);
                        return;
                    }
                }
            }
        }
        eprintln!("multicast non bouclé sur cette machine : réception non vérifiée");
    }

    #[test]
    fn lrc_sidecar_and_latin1() {
        assert_eq!(sidecar_candidates(Path::new("/m/Artiste - Titre.mp3"))[0], PathBuf::from("/m/Artiste - Titre.lrc"));
        assert_eq!(decode_text(b"\xEF\xBB\xBF[00:01.00]\xC3\xA9t\xC3\xA9"), "[00:01.00]été");
        assert_eq!(decode_text(b"[00:01.00]\xE9t\xE9"), "[00:01.00]été");
    }
}
