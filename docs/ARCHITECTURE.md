# Architecture cible : Tauri + moteur Rust

## Pourquoi quitter Electron

| | Electron (v0.1) | Tauri + moteur Rust (cible) |
|---|---|---|
| Taille de l'installeur | ~100 Mo (Chromium embarqué) | ~10 à 15 Mo (WebView du système) |
| Mémoire au repos | 250 à 400 Mo | 60 à 120 Mo (plus les morceaux chargés) |
| Latence audio | Web Audio, 20 à 40 ms, pas d'ASIO | WASAPI exclusif ou ASIO, CoreAudio, ALSA : 3 à 10 ms |
| Casque séparé | Deuxième carte par élément audio, avec un léger décalage | Carte 4 canaux (1-2 master, 3-4 casque) ou deuxième carte |
| Charge du processeur | Le moteur tourne dans la page | Le moteur tourne dans un fil temps réel natif |

Les chiffres d'Electron et de Tauri sont des ordres de grandeur publics. Ils n'ont pas été mesurés sur Mixlab.

L'interface reste en HTML, CSS et JS. Elle sera reprise après l'analyse des logiciels du marché. Le prototype navigateur continue de fonctionner avec le moteur Web Audio.

## Découpage

```
app/        interface (HTML/CSS/JS), commune au navigateur et à l'appli
engine/     moteur audio Rust (crate mixlab-engine)
  decode    MP3, AAC/M4A, FLAC, WAV, AIFF, OGG → PCM stéréo (symphonia)
  deck      lecture à vitesse variable (interpolation Hermite), cue, boucle,
            tranche de mixer : gain, EQ 3 bandes avec kill, filtre, fader, envoi casque
  engine    4 platines, crossfader (3 courbes), limiteur master, bus casque
            (mélange cue/master), commandes sans verrou, état atomique pour l'UI
  device    sorties carte son (cpal) : stéréo, 4 canaux, ou deux cartes
src-tauri/  fenêtre Tauri, fichiers, bibliothèque, MIDI natif (midir) ; le moteur reste à brancher
```

## Ce que fait déjà le moteur

Le moteur passe 9 tests automatiques :
- vitesse de lecture exacte, y compris avec le pitch ;
- isolation du crossfader ;
- forme des trois courbes de crossfader ;
- boucles ;
- kill des graves (plus de 26 dB) sans toucher aux aigus ;
- casque qui entend la préécoute fader baissé ;
- limiteur sous le plafond même avec 4 platines à fond ;
- décodage du mono et de différentes fréquences d'échantillonnage ;
- silence quand aucun morceau n'est chargé.

Le module carte son compile, mais il n'a pas encore été écouté sur du vrai matériel.

`cargo run --release --example mix_offline` rend une transition dans un WAV, sans carte son. 75 s de mix (décodage MP3 compris) sont calculées en 0,9 s.

## Étapes suivantes

1. ~~Fenêtre Tauri~~ (fait en v0.3) et ~~MIDI natif avec midir~~ (fait en v0.3, `app/tauri-bridge.js` fournit `navigator.requestMIDIAccess`).
2. Brancher l'interface sur le moteur par `invoke()` pour les commandes et un événement à 60 Hz pour les positions et les vumètres.
3. Analyse BPM, grille et tonalité portée en Rust, et calcul des formes d'onde en tâche de fond.
4. Key lock de qualité studio, avec Signalsmith Stretch (licence MIT) ou Rubber Band (licence commerciale).
5. Effets, sampler, slip, enregistrement du master.
6. ASIO sur Windows (feature `asio` de cpal, SDK Steinberg à récupérer à part).
