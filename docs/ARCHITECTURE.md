# Architecture de Mixlab

Ce document décrit le code tel qu'il est sur la branche `nuit` (10 octobre 2026) : l'interface `app/`, l'appli Tauri `src-tauri/`, les tests, puis le moteur audio natif `engine/`, qui n'est pas encore branché.

## Vue d'ensemble

```
app/         interface et moteur audio Web Audio, en JavaScript sans bundler
             (tourne dans l'appli Tauri, et seul dans Chrome ou Edge)
src-tauri/   fenêtre Tauri 2 : fichiers, bibliothèque, exports, MIDI natif (midir)
engine/      moteur audio natif Rust (crate mixlab-engine), pas encore branché
electron/    ancienne version Electron, gardée en secours
test/        11 suites de tests Playwright (Chromium sans écran)
docs/        guide, feuille de route, parité, journal, architecture
```

## L'interface (`app/`)

### Principe

Pas de bundler ni de framework. `index.html` charge des scripts classiques dans un ordre fixe. `engine.js` et `app.js` déclarent des globales (`ctx`, `S`, `bus`, `decks`, `LIB`, `controls`, `h`, `store`…). Chaque module suivant est une fonction auto-exécutée qui expose **une** globale `window.Xxx` et se greffe sur l'existant de trois façons :

- **appelé par `app.js`** au démarrage ou à chaque image, toujours derrière un test (`window.View&&View.build()`), pour que chaque module reste facultatif ;
- **en remplaçant une fonction globale** (`addTrack`, `faderGain`, `xfGains`, `recToggle`) ou une méthode de `Deck.prototype` ;
- **par sa propre boucle** (`setInterval`) qui pose ses commandes dans le DOM et les repose si l'interface est reconstruite.

Toutes les commandes cliquables passent par le registre `controls` de `app.js` (`regBtn`, `regAbs`, `regRel`, attribut `data-ctl`). Le MIDI, le clavier, le coach, le parcours et MIDI Learn s'appuient sur ce registre : une commande ajoutée par un module est tout de suite mappable et ciblable par un halo.

### Ordre de chargement et modules

| Fichier | Globale | Rôle | Branchement |
|---|---|---|---|
| `tauri-bridge.js` | `window.mixlabNative`, `navigator.requestMIDIAccess` | Dans l'appli seulement : expose les commandes Tauri (fichiers, bibliothèque, exports, WAV, liens d'achat) et un Web MIDI construit sur le MIDI natif. Ne fait rien dans un navigateur. | Chargé en premier, avant tout le reste. |
| `icons.js` | `icon`, `ICONS` | Pictogrammes au trait (SVG 16 px, `currentColor`), sans emoji : transport, chevrons, liste, plein écran, casque, crate, énergie, validation. | Chargé avant `engine.js` ; appelé par app.js, view.js, deck-pro.js, parcours.js, academie.js, library-pro.js, controllers.js. |
| `engine.js` | `ctx`, `S`, `bus`, `Deck`, `decks`, `LIB`, `addTrack`, `FXU`, `SAMPLER`, `REC`… | Le moteur Web Audio : 4 platines, key lock (pitch shifter granulaire), 2 unités d'effets et 13 effets, effets de voie, bus master / casque / split, limiteur, sampler, enregistrement WebM, analyse BPM, grille, tonalité et volume, morceaux de démo synthétisés. | Globales classiques. |
| `desktop.js` | `Desktop` | Sorties audio (master et casque sur deux cartes), boutons Fichiers et Dossier, bibliothèque persistante de l'appli (`library.json`), fichiers manquants et relocalisation. Dans un navigateur, il ne garde que le choix des sorties. | `Desktop.init()` puis `Desktop.boot()` dans `boot()`. |
| `app.js` | fonctions globales (`h`, `store`, `toast`, `renderTable`, `applyLayout`, `loadTo`, `importFiles`…) | Construit l'interface : barre du haut, effets, waveforms, platines, mixer, bibliothèque, dispositions, MIDI v1, clavier (`KEYS_DEF`), boucle d'affichage `frame()`. | Lance `boot()` après `DOMContentLoaded`, une fois tous les scripts exécutés. |
| `library-pro.js` | `LibPro` | Bibliothèque pro : note, couleur, énergie, tags, colonnes, recherche par champ, crates intelligentes, doublons, historique des sets, import rekordbox / iTunes / M3U / CSV, export rekordbox XML et M3U8, playlists Spotify / Deezer, menus contextuels, clavier de la table, sauvegarde du navigateur dans IndexedDB. | Remplace `addTrack`, ajoute des colonnes à `COLS` ; appelé par `buildLib`, `renderSide`, `trackRows`, `paintRows`. |
| `mappings/index.js` | `MIXLAB_MAPPINGS` | Les mappings livrés (copie de `mappings/*.json`, car `file://` ne peut pas lire de JSON). Aujourd'hui le modèle « Générique 2 platines ». | Lu par `controllers.js`. |
| `controllers.js` | `Controllers` | Mapping v2 (bouton, absolu, relatif en 3 codages, jog, toucher, 14 bits, Shift, rattrapage, inversion, bascule de platine), voyants, assistant de mapping, bibliothèque de mappings, détection au branchement, horloge MIDI, éditeur des raccourcis clavier. | `app.js` lui passe `onMidi`, `ledTick`, `renderMaps`, `onDevices`, `importText` ; `Controllers.build()` depuis `buildMidi()`. |
| `perf.js` | `Perf` | Popovers, éditeur de hot cue (nom, couleur), liste des cues mémoire et des boucles gardées, sons du sampler (IndexedDB `mixlab-sampler`), plage d'analyse BPM, préférences d'effet de voie et d'EQ. | `Perf.init()` dans `boot()` ; `Perf.padMenu`, `Perf.cueList` depuis les pads. |
| `view.js` | `View` | Interface live : répartition de la hauteur sans défilement, séparateurs, tailles de platine, bibliothèque plein écran, zoom de l'interface, mode scène, plein écran, menu Affichage, panneau Préparation, panneau latéral du preset Mix, compteur de temps et de phrase. | `View.build()` dans `boot()`, `View.layout()` depuis `applyLayout()`, `View.tick()` dans `frame()`. |
| `deck-pro.js` | `DeckPro` | Modes de cue CDJ / Denon / Numark, Cue Play, sync à la mesure ou à la phrase, key sync, ton fin, tonalité corrigée, instant double, verrou de grille, métronome, décompte, pré-écoute de la bibliothèque, chargement du suivant, courbes des faders et du crossfader, résonance, balance, enregistrement WAV (AudioWorklet), fenêtre « Réglages de jeu ». | Remplace des méthodes de `Deck.prototype`, `faderGain`, `xfGains`, `recToggle` ; sa boucle de 100 ms pose les commandes. |
| `learn.js` | `Coach` | Le panneau Coach et les 3 leçons guidées, validées sur l'état réel. Héberge les cartes du parcours et de l'Académie. | `Coach.build()`, `Coach.ready()` dans `boot()`, `Coach.tick()` dans `frame()`. |
| `coach-live.js` | `MixCoach` | Le coach en direct : 13 règles, un conseil à la fois, halo et voyant sur la commande, bilan noté de chaque transition, niveaux Débutant / Essentiel / Coupé. | `MixCoach.build()` dans `boot()`, `MixCoach.tick()` dans `frame()`. |
| `structure.js` | `Structure` | Analyse de structure en tâche de fond (intro, couplet, break, montée, drop, outro), énergie de 1 à 10, cues mémoire automatiques, dessin sur les waveforms. | `addTrack` appelle `Structure.queue()` ; `drawLane`, `drawOv` depuis le dessin ; `Structure.build()` dans `boot()`. |
| `automix.js` | `Suggest`, `AutoMix` | Note de compatibilité du morceau suivant ; auto-mix sur une file d'attente, transitions (basses, filtre, écho, coupe) jouées par les vraies commandes. | `AutoMix.build()` dans `boot()` ; sa propre boucle de 40 ms. |
| `parcours.js` | `Parcours` | Parcours « De zéro à ton premier set » : 14 chapitres, interface qui grandit (`inert` et classes `pc-lock`), exercices à l'oreille, glossaire, accueil du premier lancement, badges. | `Parcours.init()` dans `boot()`, `Parcours.tick()` dans `frame()`. |
| `academie-data.js` | `ACADEMIE_DATA` | Contenu de l'Académie : modules, leçons, quiz, modèles de set, scénarios, glossaire. | Lu par `academie.js`. |
| `academie.js` | `Academie` | L'Académie : leçons, quiz, courbe d'énergie, assistant de plan de set, simulation de piste, crate et tags. | `Academie.init()` dans `boot()`. |
| `tags.js` | `Tags` | Lecture des tags en pur JS : ID3v1 / v2.2 / v2.3 / v2.4, MP4, FLAC, Ogg Vorbis et Opus, pochettes. | Appelé par `Persist.pre()` et `Persist.post()`. |
| `persist.js` | `Persist` | Cache d'analyse dans IndexedDB (`mixlab-analyse`, clé = empreinte du fichier), tags à l'import, réglages des unités d'effets gardés. | `importFiles` et `Desktop.loadRecord` appellent `Persist.pre()` avant le décodage et `Persist.post()` après `addTrack`. |

### Démarrage

1. Les scripts s'exécutent dans l'ordre ci-dessus. Les modules ne touchent pas encore au DOM des platines : ils préparent leurs remplacements et leurs boucles.
2. `boot()` (dans `app.js`) :
   - `buildSamples()`, puis `buildTop`, `buildFx`, `buildLanes`, `buildDeck` pour A à D, `buildMixer`, `buildLib`, `buildMidi`, `Perf.init()` ;
   - `View.build()`, `Desktop.init()`, `applyLayout()` ;
   - `Coach.build()`, `MixCoach.build()`, `Structure.build()`, `AutoMix.build()` ;
   - première image de `frame()` ;
   - les 4 morceaux de démo sont synthétisés et chargés sur les platines ;
   - `Coach.ready()`, `Parcours.init()` (fenêtre d'accueil au premier lancement), `Academie.init()`, `Desktop.boot()` (sorties audio, bibliothèque enregistrée, sauvegarde toutes les 5 s).
3. `frame()` tourne à chaque image : avance des platines, historique (30 s de lecture), waveforms, vue d'ensemble, jog, voyants des boutons, VU-mètres, limiteur, effets, BPM maître, horloge, voyants MIDI, puis `View.tick`, `Coach.tick`, `MixCoach.tick`, `Parcours.tick`.

### Où sont gardées les données

| Donnée | Navigateur | Appli |
|---|---|---|
| Réglages, disposition, mappings, raccourcis, crates, progression | `localStorage`, préfixe `mixlab2.` | pareil (WebView) |
| Morceaux : infos, cues, playlists | IndexedDB `mixlab` (sans le son) | `library.json` dans le dossier de données de l'appli |
| Analyses (BPM, grille, tonalité, waveform, structure) | IndexedDB `mixlab-analyse` (2 000 morceaux max) | pareil |
| Sons du sampler | IndexedDB `mixlab-sampler` | pareil |

## L'appli (`src-tauri/`)

Tauri 2. La fenêtre charge `app/` tel quel (`frontendDist: ../app`), avec `withGlobalTauri`. Le glisser-déposer natif est coupé (`dragDropEnabled: false`) pour que l'interface reçoive les fichiers glissés comme dans un navigateur. La fenêtre a droit au plein écran (`capabilities/default.json`).

Seuls les fichiers que l'utilisateur a choisis (dialogue, dossier, bibliothèque enregistrée, collection importée) sont lisibles depuis l'interface : `files.rs` tient la liste des chemins autorisés.

### Commandes

| Commande | Fichier | Rôle |
|---|---|---|
| `pick_files` | `files.rs` | Dialogue de choix de fichiers audio. Autorise les fichiers choisis. |
| `pick_folder` | `files.rs` | Dialogue de choix d'un dossier : tous les fichiers audio, sous-dossiers compris. |
| `read_file` | `files.rs` | Renvoie un fichier autorisé en binaire brut (400 Mo max). |
| `exists` | `files.rs` | Dit si un fichier autorisé existe encore. |
| `library_load` | `files.rs` | Relit `library.json` et autorise les morceaux qu'il cite. |
| `library_save` | `files.rs` | Écrit `library.json` (50 Mo max). |
| `pick_library_file` | `files.rs` | Dialogue pour une collection à importer (XML, M3U, M3U8, CSV, TXT) ; renvoie son texte. |
| `allow_paths` | `files.rs` | Autorise les morceaux cités par une collection importée, s'ils existent. |
| `save_export` | `files.rs` | Enregistre un export texte (rekordbox XML, M3U8, tracklist) là où l'utilisateur choisit. |
| `save_binary` | `files.rs` | Enregistre le mix WAV, reçu en binaire brut avec le nom dans l'en-tête `x-mixlab-name`. |
| `open_shop` | `files.rs` | Ouvre une recherche Bandcamp ou Beatport dans le navigateur du système (seulement ces deux adresses). |
| `midi_open` | `midi.rs` | (Re)connecte toutes les entrées et sorties MIDI ; les messages arrivent par l'événement `midi`. |
| `midi_signature` | `midi.rs` | Liste des ports, comparée toutes les 2 s pour voir un contrôleur branché ou débranché. |
| `midi_send` | `midi.rs` | Envoie un message (voyant, horloge) à une sortie. |

`selftest.rs` (version de développement seulement) : `MIXLAB_SELFTEST=1 cargo run` vérifie dans la vraie WebView que l'interface démarre, que le pont natif répond, que le son tourne et que la lecture hors liste est bloquée.

## Les tests

`npm test` lance 11 suites Playwright dans Chromium sans écran, sur `app/index.html`. Le pont natif et le MIDI sont simulés quand il le faut, et le son est mesuré à l'analyseur quand c'est possible.

| Suite | Ce qu'elle couvre |
|---|---|
| `test/smoke.js` | Démarrage sans erreur, import de dossier, bibliothèque persistante, routage du casque. |
| `test/coach.js` | Coach en direct : vraies situations de mix, bon conseil sur la bonne commande, disparition une fois corrigé. |
| `test/automix.js` | Structure, cues mémoire, suggestion, transition auto-mix complète notée par le coach. |
| `test/library.js` | rekordbox, iTunes, M3U, CSV, import natif simulé, fichiers manquants, crates, recherche, export aller-retour, tracklist, doublons, playlists en ligne, 5 000 morceaux. |
| `test/controllers.js` | Faux Web MIDI : mapping v2, 14 bits, encodeurs, Shift, jog, rattrapage, assistant, voyants, horloge, clavier. |
| `test/parcours.js` | Accueil, interface qui grandit, chapitres 1 à 5 validés par de vraies actions, reprise, étape passée, glossaire, bilan. |
| `test/perf.js` | Pads, cues, effets, mixer, sampler, persistance. |
| `test/academie.js` | Ouverture, leçons, quiz, progression, quatre exercices, glossaire. |
| `test/tags.js` | Tags fabriqués octet par octet, préremplissage, cache d'analyse, historique et effets gardés. |
| `test/deckpro.js` | Modes de cue, pitch, ton fin, key sync, instant double, pré-écoute, courbes, balance, verrou, métronome, sync à la mesure et à la phrase, WAV. |
| `test/layout.js` | Chaque preset en 2 et 4 platines, en 1600×950, 1366×768 et 1280×800 : rien ne défile. Séparateurs, tailles, plein écran, zoom, mode scène, contraste, polices locales, temps d'image. |

Côté Rust : `cargo test --manifest-path src-tauri/Cargo.toml` (appli) et `cargo test` dans `engine/` (moteur).

La CI (`.github/workflows/tauri.yml`, « Appli Mixlab ») fait tourner tous ces tests, puis fabrique les installeurs Windows, macOS universel et Linux. `engine.yml` teste le moteur natif sur les trois systèmes. `build.yml` reconstruit la version Electron à la main.

## Le moteur natif (`engine/`)

### Pourquoi

| | Web Audio (actuel) | Moteur Rust (cible) |
|---|---|---|
| Latence audio | 20 à 40 ms, pas d'ASIO | WASAPI exclusif ou ASIO, CoreAudio, ALSA : 3 à 10 ms |
| Casque séparé | Deuxième carte par élément audio (Windows), sinon split | Carte 4 canaux (1-2 master, 3-4 casque) ou deuxième carte |
| Charge du processeur | Le moteur tourne dans la page | Fil temps réel natif |

Ce sont des ordres de grandeur publics, pas des mesures faites sur Mixlab.

### Découpage

```
engine/src
  decode    MP3, AAC/M4A, FLAC, WAV, AIFF, OGG vers PCM stéréo (symphonia)
  deck      lecture à vitesse variable (interpolation Hermite), cue, boucle,
            tranche de mixer : gain, EQ 3 bandes avec kill, filtre, fader, envoi casque
  engine    4 platines, crossfader (3 courbes), limiteur master, bus casque,
            commandes sans verrou, état atomique pour l'interface
  device    sorties carte son (cpal) : stéréo, 4 canaux, ou deux cartes
  dsp       lissage des paramètres, biquads, égaliseur, filtre
```

Le moteur passe 9 tests : vitesse de lecture exacte avec le pitch, isolation du crossfader, forme des trois courbes, boucles, kill des graves (plus de 26 dB) sans toucher aux aigus, casque qui entend la pré-écoute fader baissé, limiteur sous le plafond avec 4 platines à fond, décodage du mono et de différentes fréquences, silence sans morceau. Le module carte son compile, mais n'a pas encore été écouté sur du vrai matériel.

`cargo run --release --example mix_offline` rend une transition dans un WAV, sans carte son. 75 s de mix (décodage MP3 compris) sont calculées en 0,9 s.

### Étapes suivantes

1. Brancher l'interface sur le moteur par `invoke()` pour les commandes, et un événement à 60 Hz pour les positions et les VU-mètres.
2. Porter en Rust l'analyse (BPM, grille, tonalité) et le calcul des waveforms, en tâche de fond.
3. Key lock de qualité studio (Signalsmith Stretch, licence MIT, ou Rubber Band, licence commerciale).
4. Effets, sampler, slip et enregistrement du master dans le moteur.
5. ASIO sous Windows (feature `asio` de cpal, SDK Steinberg à récupérer à part).
