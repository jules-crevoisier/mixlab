# Mixlab : liste de parité avec les logiciels DJ du marché

Écrite le 10 octobre 2026, remise à jour le même jour d'après le code de la branche `nuit`. Elle complète `docs/ROADMAP.md` et la recherche `analyse-logiciels-dj.md` (§9.2 et §9.3).

**But.** Un DJ qui vient de n'importe quel logiciel du marché doit retrouver dans Mixlab chaque fonction qu'il utilise, **y compris celles qui sont payantes ailleurs** (abonnements, extensions, packs). Rien ne doit manquer.

**Méthode.**
- Les fonctions viennent des sites et des notes de version 2025-2026 des éditeurs, en plus de la recherche existante.
  - Serato DJ Pro 4 et ses extensions.
  - rekordbox 7 et ses plans Free, Core, Creative et Professional.
  - Traktor Pro 4 (stems, grilles flexibles, Pattern Player, maximiseur).
  - VirtualDJ 2026 (paroles et playlists par IA, nouveau moteur d'effets).
  - djay Pro (Neural Mix, Automix AI).
  - Engine DJ 4 et 5 (stems sur la machine, waveforms RGB, assistant d'import).
  - Mixxx 2.5 et 2.6 (fichiers STEM, édition des hot cues).
  - DJ.Studio (montage de set sur une timeline).
- Chaque fonction a été comparée au code actuel :
  - interface : `app/engine.js`, `app/app.js`, `app/perf.js`, `app/deck-pro.js`, `app/library-pro.js`, `app/structure.js`, `app/automix.js`, `app/controllers.js`, `app/tags.js`, `app/persist.js`, `app/parcours.js`, `app/academie.js`, `app/learn.js`, `app/coach-live.js`, `app/desktop.js` ;
  - application de bureau : `src-tauri/src/*.rs` ;
  - moteur natif : `engine/src/*.rs`, pas encore branché.

## Résumé

**335 fonctions** recensées (le premier décompte, 338, comptait aussi les trois lignes de la légende).

| État | Nombre | Part |
|---|---|---|
| Fait | 176 | 53 % |
| Partiel | 53 | 16 % |
| Manque | 106 | 32 % |

**Ce qui est solide.**
- Le cœur du jeu : platines, cues nommés, cues mémoire, boucles gardées, pads (slicer, pitch play, sampler), sync à la mesure ou à la phrase et mixer réglable.
- Les effets : deux unités assignables aux voies et au master, en chaîne de 3, déclenchées sur le temps.
- La bibliothèque : tags, cache d'analyse, crates intelligentes, import et export rekordbox, iTunes, M3U.
- La structure des morceaux, l'auto-mix et les suggestions.
- Le coach, le parcours débutant et l'Académie, qui n'ont pas d'équivalent sur le marché.

**Les trois grands manques.**
1. Les stems.
2. Les mappings validés sur les contrôleurs du marché.
3. Le moteur natif, pour la latence, le key lock de qualité et le casque en 4 canaux.

**Les fonctions payantes ailleurs** (stems, vidéo, DVS, lyrics, cloud) sont toutes à faire.

## Légende

**Abréviations des logiciels**

| Abréviation | Logiciel |
|---|---|
| S | Serato DJ Pro |
| RB | rekordbox 7 |
| TR | Traktor Pro 4 |
| VDJ | VirtualDJ |
| DJAY | djay Pro |
| ENG | Engine DJ (logiciel et machines autonomes) |
| MX | Mixxx |
| DJS | DJ.Studio |
| tous | les 6 à 8 logiciels |

**Où la fonction est payante.** *(payant : …)* précise le plan ou l'extension qui la débloque.
- Serato : DJ Lite est gratuit, DJ Pro est payant, et les extensions (DVS, Pitch 'n Time DJ, Video, Play) ou le DJ Suite sont payants en plus.
- rekordbox : les plans Core, Creative et Professional sont payants.
- djay : la version gratuite est limitée, djay Pro est un abonnement.
- VirtualDJ : la licence Pro est payante dès qu'on utilise un contrôleur professionnel.

**État dans Mixlab**

| État | Sens |
|---|---|
| **Fait** | Utilisable aujourd'hui dans l'interface |
| **Partiel** | Existe, mais en dessous de ce qu'un DJ attend (qualité, options, sauvegarde ou ergonomie) |
| **Manque** | N'existe pas, ou seulement dans le moteur Rust qui n'est pas branché |

**Priorité**

| Priorité | Sens |
|---|---|
| P1 | Attendu par tout DJ. Sans elle, il repart |
| P2 | Attendu par un DJ confirmé ou pro |
| P3 | Niche ou différenciation |

**Effort** : S = moins d'un jour, M = quelques jours, L = une semaine ou plus, ou une dépendance lourde (moteur natif, modèle d'IA, partenariat).

---

## 1. Platines et lecture

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| 2 platines | tous | **Fait** : platines A et B | P1 | S |
| 4 platines (C/D sur les côtés) | tous sauf DJS *(S : 4 platines avec un matériel compatible)* | **Fait** : bouton 2/4, C à gauche et D à droite | P1 | S |
| Lecture et pause | tous | **Fait** | P1 | S |
| Cue façon CDJ (pose à l'arrêt, retour en lecture, pré-écoute en maintenant) | tous | **Fait** : `cueDown` et `cueUp` | P1 | S |
| Choix du mode de cue (CDJ, Denon, Numark, Mixxx) | MX, VDJ | **Fait** : CDJ, Denon ou Numark (Réglages de jeu) ; le mode Mixxx suit le comportement CDJ | P3 | S |
| Stutter / play depuis le cue (« Cue Play ») | S, RB, VDJ | **Fait** : bouton CUP sur chaque platine, mappable | P3 | S |
| Temps écoulé et temps restant (bascule) | tous | **Partiel** : temps restant seulement, aucune bascule | P1 | S |
| Alerte de fin de piste (clignotement à 30 s) | tous | **Fait** : vue d'ensemble, platine et compteur passent au rouge | P1 | S |
| Platine (jog) à l'écran : nudge en lecture, recherche à l'arrêt | tous | **Fait** : platine ronde dessinée | P1 | S |
| Mode vinyle et scratch au jog (le jog arrête la lecture) | tous | **Partiel** : scratch au toucher du jog d'un contrôleur ; la platine à l'écran fait seulement du pitch bend | P2 | M |
| Scratch avec la souris sur la waveform | S, VDJ, MX | **Partiel** : on se déplace en glissant, sans son de scratch | P3 | M |
| Pitch fader | tous | **Fait** | P1 | S |
| Plages de pitch ±6/8/10/16/25/50/100 % | tous | **Partiel** : ±8, ±16 et ±50 seulement | P2 | S |
| Sens du pitch fader au choix (haut = plus lent ou plus rapide) | tous | **Fait** : réglage « Sens du pitch », à l'écran et sur la table | P2 | S |
| Pitch bend et nudge (boutons et jog) | tous | **Fait** : ‹ ›, jog et clavier | P1 | S |
| Reset du pitch en douceur (« tempo reset ») | RB, ENG, MX | **Partiel** : double-clic, retour sec | P3 | S |
| Key lock, aussi appelé master tempo | tous *(S : qualité « Pitch 'n Time DJ » payante)* | **Partiel** : pitch shifter granulaire du navigateur, artefacts audibles | P1 | L |
| Démarrage et arrêt progressifs (vinyl brake, start/stop time) | S, RB, TR, VDJ, MX | **Partiel** : Frein vinyle et Backspin en effet ; pas de temps de démarrage et d'arrêt sur Play | P2 | S |
| Reverse | tous | **Fait** | P2 | S |
| Censor (reverse avec slip) | S, RB, VDJ | **Fait** | P2 | S |
| Slip mode | tous | **Fait** : hot cue maintenu, roll et censor, avec position fantôme affichée | P1 | S |
| Temps de relâchement du slip (« Slip Release ») | S 4.0 | **Manque** | P3 | S |
| Chargement par glisser-déposer et par bouton | tous | **Fait** | P1 | S |
| Garde-fou « platine à l'antenne » au chargement | RB, TR, MX | **Fait** : refus si la platine est audible | P2 | S |
| Clone de platine (instant doubles) | S, RB, TR, ENG, MX | **Fait** : bouton Doubler (morceau, position, tempo, ton et boucle) | P2 | S |
| Platine de pré-écoute dans la bibliothèque | RB, TR, VDJ, ENG, MX | **Fait** : lecteur au casque dans la barre de la bibliothèque, waveform cliquable, platines intactes | P1 | M |
| Lecture du morceau suivant de la file (auto-chargement) | VDJ, DJAY, RB | **Fait** : option des Réglages de jeu (file de l'auto-mix, sinon la liste affichée) | P2 | S |
| Platines d'entrée ligne ou micro (« Live Input ») | TR, VDJ, MX, RB | **Fait** : une entrée de la carte son dans la voie d'une platine (gain, EQ, filtre, effets, fader), choix de l'entrée dans Entrées et sorties (io.js) | P2 | M |
| Mode entraînement sans matériel (« Practice Mode ») | S | **Fait** : Mixlab marche sans matériel | P2 | S |
| Platine principale ou maître (Master) | tous | **Fait** : bouton Master | P1 | S |
| Formats MP3, AAC/M4A, WAV, AIFF, FLAC, OGG | tous | **Fait** : décodage du navigateur ; symphonia dans le moteur Rust | P1 | S |
| Formats ALAC, Opus, WMA, fichiers vidéo (MP4) | S, RB, VDJ | **Partiel** : Opus est accepté par l'import ; ALAC et vidéo dépendent de la WebView | P3 | M |
| Chargement rapide de gros fichiers (décodage en flux, mémoire) | tous | **Partiel** : tout le fichier est décodé en mémoire, 400 Mo au plus | P2 | L |

## 2. Cues, boucles et pads

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| 8 hot cues par piste | tous *(S Lite : 4 ; RB et MX : jusqu'à 16 ou 36)* | **Fait** | P1 | S |
| 16 hot cues ou plus (banques A/B) | RB, MX, VDJ | **Manque** | P3 | S |
| Hot cues colorés, couleur choisie par cue | tous | **Fait** : 12 couleurs au choix (clic droit sur le pad) | P1 | S |
| Hot cues nommés | tous | **Fait** : nom sur le pad et sur la waveform | P1 | S |
| Hot cues sauvegardés par piste | tous | **Fait** : `library.json` dans l'appli (avec noms, couleurs, cues mémoire et boucles) ; positions seulement dans le navigateur | P1 | S |
| Effacer un hot cue | tous | **Fait** : Maj+clic ou clic droit | P1 | S |
| Déplacer un hot cue ou le caler sur la grille | MX 2.6, RB, S | **Partiel** : « Déplacer ici » dans l'éditeur du cue, calé sur la grille avec Quantize ; pas de glisser sur la waveform | P2 | S |
| Cues mémoire (liste distincte des hot cues) | RB, TR, ENG, VDJ | **Fait** : liste ☰ de la platine, marqueurs sur les waveforms | P1 | M |
| Liste éditable des cues (nom, couleur, temps) | RB, S, TR | **Partiel** : nom, couleur et saut pour les cues mémoire et les boucles ; temps non éditable, hot cues à part | P2 | M |
| Hot cues de boucle (boucles sauvegardées) | tous | **Fait** : boucles gardées avec le morceau | P1 | M |
| Mode « saved loop » sur les pads | S, RB, TR | **Fait** : mode de pads Boucles | P2 | S |
| Cue automatique sur le premier son | RB, S, ENG, MX | **Partiel** : le cue se pose sur le premier temps de la grille | P1 | S |
| Hot cues automatiques (sur la structure ou les phrases) | RB *(Creative)*, ENG, DJAY | **Partiel** : cues mémoire posés sur la structure (intro, drop, break, outro) ; ils ne remplissent pas les pads | P2 | M |
| Transfert des cues entre logiciels (import et export) | RB, S, TR, ENG, DJS | **Partiel** : rekordbox XML en import et en export ; pas Serato ni Traktor | P1 | L |
| Boucle auto de 1/32 à 32 temps | tous | **Fait** | P1 | S |
| Boucle manuelle In / Out | tous | **Fait** | P1 | S |
| Reloop et sortie de boucle | tous | **Fait** | P1 | S |
| Boucle ×2 / ÷2 | tous | **Fait** | P1 | S |
| Réglage fin du début et de la fin de boucle | RB, TR, S, MX | **Manque** | P2 | S |
| Déplacer une boucle (loop move) | TR, RB, MX | **Partiel** : un beat jump pendant une boucle la déplace | P2 | S |
| Boucle active (« active loop ») ou boucle à venir | RB, MX | **Manque** | P3 | S |
| Loop roll (pads 1/16 à 8) | tous | **Fait** | P1 | S |
| Beat jump avec un pas réglable | tous | **Fait** : 1 à 32 temps | P1 | S |
| Pads de beat jump | S, RB, TR | **Fait** | P2 | S |
| Saut de phrase ou de mesure (16 et 32 temps et plus) | RB, TR | **Partiel** : 32 temps au plus | P3 | S |
| Onglets de mode des pads | tous | **Fait** : Hot cue, Roll, Saut, Sampler | P1 | S |
| Pads Slicer | S, RB, VDJ, TR (Freeze) | **Fait** : 8 tranches d'un temps, reprise façon slip | P2 | M |
| Pads Keyboard / Pitch Play (hot cue rejoué à d'autres hauteurs) | S *(Pitch Play, payant : Pitch 'n Time DJ)*, RB | **Fait** : mode Pitch, −5 à +5 demi-tons depuis le dernier hot cue | P2 | M |
| Pads Key Shift | RB, VDJ, ENG | **Partiel** : le mode Pitch transpose en rejouant le hot cue ; pas de pads qui transposent sans sauter | P2 | S |
| Pads de beat loop | RB, ENG | **Manque** | P3 | S |
| Pads d'effets (Pad FX, Roll FX) | RB *(Pad FX)*, S *(Stems Pad FX)* | **Manque** | P2 | M |
| Pads de stems | S, RB, VDJ, DJAY, ENG | **Manque** | P2 | M |
| Freeze ou Flux mode | TR | **Partiel** : Slip (le Flux) et Slicer (proche du Freeze) | P3 | S |
| Hot cue maintenu puis verrouillé en lecture (« play latch ») | MX 2.6, CDJ | **Manque** | P3 | S |
| Gate cue / hot cue en mode « maintien » | VDJ, MX | **Partiel** : le hot cue maintenu avec slip revient au relâchement | P3 | S |
| Séquences de cues enregistrées (Serato Flip) | S *(Flip, extension autrefois payante, intégrée à Pro)* | **Manque** | P3 | M |

## 3. Tempo, grille et sync

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| Détection du BPM | tous | **Fait** : 87,5 à 175 BPM, au centième | P1 | S |
| Plage de BPM d'analyse réglable (pour la DnB, le hip-hop, etc.) | RB, TR, S, MX | **Fait** : 60-120, 70-140, 88-175 ou 100-200 (Panneaux) | P1 | S |
| Grille de temps et premier temps | tous | **Fait** | P1 | S |
| Tap tempo | tous | **Fait** | P2 | S |
| BPM ÷2 / ×2 | tous | **Fait** | P1 | S |
| Décaler la grille | tous | **Fait** : pas de 10 ms | P1 | S |
| « 1 ici » (premier temps de mesure ou de phrase) | tous | **Fait** | P1 | S |
| Édition fine de la grille (étirer, grille sur deux points, réglage au ms) | RB, TR, S | **Manque** | P2 | M |
| Verrou de grille ou de BPM (« lock ») | RB, TR, MX | **Fait** : bouton Verrou par platine, gardé avec le morceau | P2 | S |
| Grille dynamique (tempo variable) | RB, TR 4 *(Flexible Beatgrid)*, DJAY, MX, DJS, VDJ 2026 | **Manque** | P2 | L |
| Métronome sur la grille | RB, TR | **Fait** : bouton Métro, clics au casque calés sur la grille, temps fort marqué | P3 | S |
| Sync tempo | tous | **Fait** | P1 | S |
| Sync de phase (calage sur le temps) | tous | **Fait** : le départ attend le temps suivant de la platine suivie | P1 | S |
| Sync de mesure ou de phrase (Bar / Phrase sync) | RB, TR, ENG | **Fait** : réglage « Sync calée sur » le temps, la mesure ou la phrase de 8 mesures | P2 | M |
| Smart Sync / Sync à états (tempo seul, ou tempo et phase) | S *(Pro)*, MX | **Partiel** : un seul mode | P3 | S |
| Platine maître automatique | tous | **Fait** : la première platine lancée devient maître | P1 | S |
| Tempo maître interne (horloge sans platine) | TR, RB, MX | **Manque** | P3 | S |
| Quantize (cues, boucles, sauts) | tous | **Fait** : bouton Q global | P1 | S |
| Plage de pitch élargie automatiquement par Sync | MX, TR | **Fait** : avec un avertissement | P3 | S |
| Sync double ou moitié de tempo (ex. 87 sur 174) | TR, MX, RB | **Fait** : `matchTempo` teste ×2 et ÷2 | P2 | S |
| Phasemètre (écart de phase à l'écran) | TR, VDJ, RB | **Partiel** : une aiguille dans le coach (A/B), absente des platines | P2 | S |
| Compteur de mesure et de phrase | RB, VDJ, ENG | **Fait** : lanes « 3.2 · P4 » et coach | P1 | S |
| Indicateur de distance au prochain cue ou à la fin de phrase (« beat countdown ») | RB, ENG, VDJ | **Fait** : compte à rebours en mesures.temps sur chaque platine (hot cue, cue mémoire ou fin de phrase) | P2 | S |

## 4. Tonalité et harmonie

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| Détection de la tonalité | tous *(S : à partir de Pro)* | **Fait** : profils de Krumhansl | P1 | S |
| Précision de détection au niveau du marché | RB, TR, MX (KeyFinder), Mixed In Key | **Partiel** : algorithme simple, jamais mesuré sur un corpus | P1 | M |
| Notation au choix : Camelot, Open Key, classique, musicale | tous | **Partiel** : Camelot et nom (« 8A Am ») sans choix | P2 | S |
| Couleur de tonalité (roue) | MX 2.6, VDJ, RB | **Fait** : `keyColor` | P2 | S |
| Indicateur de compatibilité avec la platine maître | RB, S, VDJ, DJAY | **Fait** : tonalité en vert et colonne mise en avant | P1 | S |
| Filtre « compatibles » dans la bibliothèque | RB *(Related)*, VDJ, DJAY | **Fait** : bouton Compatibles (tonalité et BPM) | P2 | S |
| Key shift par demi-ton | tous | **Fait** : ±6 | P1 | S |
| Key shift fin (cents) | VDJ, MX | **Fait** : ±50 cents par pas de 5, mappable (rendu approximatif du pitch shifter du navigateur) | P3 | S |
| Accord auto sur la platine maître (« key sync ») | RB, VDJ, DJAY, ENG, S *(Pitch 'n Time DJ)* | **Fait** : bouton Key sync (même tonalité ou compatible, le plus petit écart, cents compris) | P2 | S |
| Tonalité affichée après pitch (sans key lock) | RB, MX, VDJ | **Fait** : `keyNow` | P2 | S |
| Correction manuelle de la tonalité | tous | **Fait** : clic sur la tonalité de la platine, gardée avec le morceau | P2 | S |
| Roue harmonique pédagogique | aucun logiciel DJ | **Partiel** : roue des tonalités dans le chapitre du parcours ; pas encore un outil permanent | P2 | M |

## 5. Mixer

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| Gain / trim par voie | tous | **Fait** : ±12 dB | P1 | S |
| Gain automatique | tous | **Partiel** : RMS ; le passage en LUFS ou ReplayGain est prévu | P1 | S |
| EQ 3 bandes | tous | **Fait** : shelf et peak, de kill à +6 dB | P1 | S |
| Kill par bande | tous | **Fait** | P1 | S |
| EQ 4 bandes | TR, RB (DJM), VDJ | **Fait** : mode « EQ 4 bandes » (100 Hz, 400 Hz, 2,5 kHz, 8 kHz), potard H-mid avec kill dans chaque voie | P3 | S |
| Modèles d'EQ (isolateur, DJM, Xone, etc.) | TR, RB, MX, VDJ | **Partiel** : isolateur ou classique (plancher à −26 dB) ; pas de modèles DJM ou Xone | P2 | M |
| Filtre bipolaire passe-bas / passe-haut | tous | **Fait** | P1 | S |
| Résonance du filtre réglable | TR, VDJ, MX | **Fait** : réglage de 0,5 à 8 (Réglages de jeu) | P3 | S |
| Fader de voie | tous | **Fait** | P1 | S |
| Courbe des faders de voie | RB, TR, MX, VDJ | **Fait** : douce, progressive, linéaire ou rapide | P2 | S |
| Crossfader | tous | **Fait** | P1 | S |
| Courbe du crossfader | tous | **Fait** : Mix, Douce, Cut | P1 | S |
| Courbe continue ou réglable, reverse du crossfader (hamster) | S, RB, TR, MX | **Fait** : courbe Réglable (de douce à cut) et crossfader inversé (hamster) | P2 | S |
| Assignation des voies au crossfader (A, thru, B) | tous | **Fait** | P1 | S |
| VU-mètres par voie et master | tous | **Fait** : avec maintien de crête | P1 | S |
| VU pré-fader | RB, TR, S | **Partiel** : le coach mesure le pré-fader, mais il n'est pas affiché | P3 | S |
| Limiteur master | tous | **Fait** | P1 | S |
| Indicateur de compression du limiteur | TR, RB | **Fait** : jauge et voyant LIM sur le master | P3 | S |
| Maximiseur ou mastering de sortie | TR 4 *(Ozone Maximizer)* | **Fait** : 3 bandes compressées, limiteur et écrêteur doux au plafond (-0,1 à -6 dB), plafond vérifié à la mesure ; pas de lookahead ni de suréchantillonnage | P3 | M |
| Volume master | tous | **Fait** | P1 | S |
| Balance master | TR, MX, VDJ | **Fait** : Réglages de jeu, mappable ; l'enregistrement reste centré | P3 | S |
| Sortie booth (volume à part) | RB, TR, VDJ, MX | **Fait** : copie du mix avant le volume master, son volume et son limiteur, vers une autre carte son ou les canaux 3-4 d'une carte multicanal | P2 | M |
| Cue casque par voie | tous | **Fait** | P1 | S |
| Mix cue/master et volume casque | tous | **Fait** | P1 | S |
| Split cue (casque en mono sur un canal, master sur l'autre) | tous | **Fait** | P1 | S |
| Casque sur une deuxième carte son | tous | **Fait** : `setSinkId` | P1 | S |
| Casque sur une carte 4 canaux (sorties 3-4) | tous | **Partiel** : existe dans le moteur Rust, qui n'est pas branché | P1 | L |
| ASIO, CoreAudio, faible latence (3 à 10 ms) | tous | **Partiel** : Web Audio en mode interactif ; le moteur `cpal` est prêt mais pas branché | P1 | L |
| Réglage de la taille du buffer et de la fréquence | tous | **Partiel** : buffer (latencyHint, de 3 à 40 ms) et fréquence choisis au démarrage, ce que le navigateur donne vraiment est affiché, mesure aller-retour par clics ; le navigateur arrondit le buffer, l'ASIO reste au moteur natif | P2 | M |
| Mixer interne ou mixer externe (mode table) | tous | **Partiel** : le mixer peut être masqué et chaque platine peut sortir à part (voir ligne suivante) ; latence et dérive des cartes comme ci-dessous | P1 | L |
| Sorties séparées par platine (mixer externe) | tous | **Partiel** : chaque platine (après le gain, avant l'EQ) vers une autre carte son (setSinkId) ou une paire de canaux d'une carte multicanal ; par une autre carte, 20 à 60 ms de plus et pas de correction de dérive d'horloge : pour une table, préférer une carte multicanal ou le moteur natif | P2 | L |
| Entrée micro avec talkover / ducking | VDJ, RB, S, MX | **Fait** : voie micro (passe-haut, volume) vers master et booth, talkover à la voix ou permanent, baisse réglable de 3 à 30 dB | P2 | M |
| Pré-écoute du sampler au casque | S, RB, MX | **Manque** | P3 | S |

## 6. Effets

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| Effets calés sur le tempo (beats 1/4 à 8) | tous | **Fait** : 1/4 à 8 temps | P1 | S |
| Écho / delay | tous | **Fait** | P1 | S |
| Reverb | tous | **Fait** | P1 | S |
| Flanger | tous | **Fait** | P1 | S |
| Phaser | tous | **Fait** | P2 | S |
| Gate / trans | tous | **Fait** | P2 | S |
| Filtre LFO | tous | **Fait** | P2 | S |
| Roll / Slip roll en effet | RB, S, TR | **Fait** : effet Répétition, plus les pads Roll | P2 | S |
| Bitcrusher | tous | **Fait** | P2 | S |
| Vinyl brake / backspin en effet | S, RB, TR, VDJ | **Fait** : Frein vinyle et Backspin | P2 | S |
| Spiral, ping-pong, tape delay | S, RB, TR | **Partiel** : Spirale et Ping-pong ; pas de tape delay | P2 | S |
| Noise / white noise riser | S, RB, TR | **Fait** : Bruit montant, calé sur la durée choisie | P2 | S |
| Beatmasher, Gater, Turntable FX, Reverse FX | TR | **Partiel** : Trans / Gater, Répétition, Frein et Backspin ; pas de Reverse en effet (seulement le bouton Censor) | P3 | M |
| Pitch / Helix / Shimmer / Mobius | RB, S *(packs payants autrefois)* | **Fait** : Pitch (-12 à +12 demi-tons), Hélice, Shimmer, Möbius dans les unités FX (fx-plus.js) ; pitch shifter granulaire, moins propre qu'un vocodeur de phase | P3 | M |
| Reverb Rise / Drop sur 32 temps | ENG 5, RB | **Fait** : Reverb montante et Reverb qui retombe sur 8, 16 ou 32 temps de la platine | P3 | S |
| Unités d'effets assignables (2 à 4) par voie ou au master | tous | **Fait** : FX1 et FX2, chacune sur les platines A à D et le master | P1 | M |
| Chaînage de 3 effets par unité | S, TR, MX, VDJ | **Fait** : mode Chaîne | P2 | M |
| Effet sur le master | tous | **Fait** : cible M des unités FX1 et FX2 | P2 | S |
| Effets par voie à un bouton (Sound Color / Mixer FX / Quick effect) | RB, TR, MX, VDJ, DJAY (Fusion) | **Fait** : Filtre, Écho, Bruit ou Espace sur le potard FILTRE | P1 | M |
| Effets de crossfader ou de fader (Crossfader FX) | DJAY *(Crossfader Fusion)*, VDJ | **Fait** : filtre, écho ou reverb qui monte sur la platine que le crossfader éloigne (réglages du mixer) | P3 | M |
| Paramètres avancés d'effet (feedback, X-pad, temps en ms) | tous | **Partiel** : deux réglages par effet (retour, tonalité, largeur…) et durée en temps ; pas de temps en ms ni de X-pad | P2 | S |
| Effet déclenché quantisé (Beat FX on sur le temps) | RB, S | **Fait** : avec Quantize, l'unité démarre sur le temps suivant | P2 | S |
| Post-fader / pré-fader au choix (queue d'écho après la coupe) | RB, TR, MX | **Partiel** : l'effet est avant le fader, mais une queue existe pour l'écho | P2 | S |
| Effets par stem | S *(Stems FX)*, RB, VDJ, MX 2.6 | **Manque** | P2 | M |
| Réglages des effets gardés d'une session à l'autre | tous | **Fait** : type, durée, dosage, réglages, mode et cibles rendus au démarrage (l'unité reste coupée) | P2 | S |
| Banques ou favoris d'effets | VDJ 2026, TR | **Fait** : bouton Fav de chaque unité, chaîne gardée sous un nom (mode, durée, effets, réglages), 4 premiers rappelables en MIDI | P3 | S |
| Effets en plugin (VST/AU) | VDJ, MX (LV2), DJS | **Manque** : impossible dans le moteur web (pas de chargement de code natif) ; à faire dans le moteur natif `engine/` une fois branché | P3 | L |
| Effets « RMX » (Build-up, Break-down, Scene) | RB *(Creative, RMX EFFECTS)* | **Fait** : macros Montée, Descente (8, 16 ou 32 temps) et Scène (le Dosage pilote filtre, écho et reverb) | P3 | M |

## 7. Sampler, séquenceur et remix

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| Sampler à 8 slots | tous *(S Lite : 4 ; Pro : 32)* | **Fait** : 8 pads, sons intégrés ou les tiens | P1 | S |
| Charger ses propres sons dans le sampler | tous | **Fait** : gardés d'une session à l'autre | P1 | S |
| Banques de sampler (4×8 et plus) | S, RB, VDJ, MX | **Manque** | P2 | S |
| Modes de lecture (one-shot, gate, loop, toggle) | S, RB, VDJ, MX | **Fait** : un coup, boucle calée, maintien | P2 | S |
| Sampler synchronisé au tempo (boucles calées) | RB, S, TR, MX | **Fait** : mode Boucle calée sur la platine maître, départ sur le temps | P2 | M |
| Volume du sampler | tous | **Fait** | P1 | S |
| Sampler routé dans une voie (EQ, crossfader) | RB, TR, MX | **Manque** | P3 | S |
| Capture d'une boucle de la platine vers le sampler | RB, TR (Remix decks), VDJ | **Manque** | P3 | M |
| Séquenceur de sampler (16 pas) | RB *(séquenceur ; sauvegarde payante Core)*, DJAY | **Manque** | P3 | M |
| Pattern Player (boîte à rythmes, kits) | TR 4 | **Manque** | P3 | L |
| Remix decks, Loop recorder | TR, VDJ | **Manque** | P3 | L |
| Looper par piste (djay Looper) | DJAY | **Manque** | P3 | M |
| Packs de sons fournis | S *(Sound Packs)*, RB, VDJ | **Partiel** : 8 sons maison | P3 | S |

## 8. Stems

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| Séparation en temps réel ou à l'analyse (voix, batterie, basse, mélodie) | S, RB *(stems dans les plans)*, TR 4, VDJ, DJAY (Neural Mix), ENG 5 | **Manque** : le ROADMAP prévoit HT-Demucs en ONNX | P1 | L |
| Mute ou volume par stem | idem | **Manque** | P1 | M |
| Acapella / instrumental en un bouton | S, RB, VDJ, DJAY | **Manque** | P1 | S |
| Effets par stem (Stems FX, echo out sur la voix) | S, RB, VDJ, MX | **Manque** | P2 | M |
| Pré-calcul et cache des stems | S, ENG 5, VDJ | **Manque** | P2 | M |
| Lecture de fichiers .stem.mp4 (NI STEMS) | TR, MX 2.6 | **Manque** | P3 | M |
| Transitions de stems (« Neural Mix », swap voix/batterie) | DJAY, VDJ | **Manque** | P3 | M |
| Stems à 5 voies ou plus (piano, guitare…) | DJAY, VDJ | **Manque** | P3 | L |
| Qualité de séparation en option (rapide ou haute qualité) | VDJ, S | **Manque** | P3 | M |

## 9. Bibliothèque et préparation

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| Import de fichiers et de dossiers entiers | tous | **Fait** : bureau (fichiers, dossier, glisser-déposer) | P1 | S |
| Bibliothèque persistante | tous | **Fait** : `library.json`, appli de bureau seulement | P1 | S |
| Cache de l'analyse (pas de réanalyse au démarrage) | tous | **Fait** : BPM, grille, tonalité, waveform, sections, énergie et cues de structure gardés dans IndexedDB sous l'empreinte du fichier (taille + hachage du début et de la fin) ; le morceau est seulement redécodé. Invalidation : version de l'analyse, plage de BPM, fichier modifié, plus anciens au-delà de 2000 (`app/persist.js`) | P1 | M |
| Analyse par lots en tâche de fond | tous | **Partiel** : séquentielle, sur le fil de l'interface | P1 | M |
| Recherche instantanée | tous | **Fait** : titre, artiste, genre, BPM, tonalité | P1 | S |
| Recherche par champ (`bpm:120-126`, `key:8A`) | MX, TR, RB | **Fait** : `bpm:120-126 key:~8A rating:>=4 tag:peak` | P2 | S |
| Tri par colonne | tous | **Fait** | P1 | S |
| Colonnes configurables | tous | **Fait** : menu Colonnes, choix gardé | P2 | S |
| Lecture des tags ID3, Vorbis et MP4 (titre, artiste, album, genre, année, commentaire) | tous | **Fait** : ID3v1, v2.2 à v2.4, MP4/M4A, FLAC, Ogg Vorbis et Opus, en JavaScript (`app/tags.js`), avec BPM (guide l'analyse) et tonalité ; ne remplace jamais une info modifiée à la main | P1 | M |
| Écriture des tags et édition des métadonnées | tous | **Partiel** : infos modifiables dans Mixlab (titre, artiste, genre, note…) ; rien n'est écrit dans le fichier | P2 | M |
| Pochettes | tous | **Fait** : lues dans les tags, vignette de 96 px dans la liste et sur la platine | P2 | S |
| Note (étoiles) | tous | **Fait** | P1 | S |
| Couleur de piste | tous | **Fait** : 8 couleurs | P2 | S |
| Commentaire, énergie, label, année, bitrate | tous | **Partiel** : commentaire et énergie ; année lue dans les tags ; ni label ni bitrate | P2 | S |
| Tags personnalisés (My Tag) | RB, VDJ, ENG | **Fait** : tags libres, recherche `tag:` | P2 | M |
| Compteur de lectures et date de dernière lecture | tous | **Fait** : colonnes Joué et Dernière lecture | P2 | S |
| Playlists / crates | tous | **Fait** : création, ajout et glisser-déposer | P1 | S |
| Renommer, supprimer et réordonner les playlists et leurs morceaux | tous | **Fait** : clic droit sur une playlist, glisser dans la liste | P1 | S |
| Dossiers de playlists, sous-crates | tous | **Manque** | P2 | S |
| Smart crates / playlists intelligentes à règles | S *(Pro)*, RB, TR, VDJ, ENG, MX | **Fait** : règles ET / OU, mises à jour en direct | P1 | M |
| Couleur, favoris et tri des crates | S 4.0 | **Manque** | P3 | S |
| Historique des sets | tous | **Fait** : sets gardés d'une session à l'autre (bibliothèque de l'appli, IndexedDB dans le navigateur), listés par date dans la barre latérale | P1 | S |
| Export de la tracklist (texte, CSV) | tous | **Fait** : texte, CSV et M3U8 pour chaque set | P2 | S |
| File d'attente / Prepare / Sidelist | S, VDJ, RB, TR | **Fait** : file de l'auto-mix (glisser, remplir depuis une playlist) et playlist Préparation | P1 | S |
| Afficher dans quelles playlists se trouve une piste | S 4.0, RB | **Fait** : coches dans le menu clic droit du morceau | P3 | S |
| Doublons | RB, VDJ, MX | **Fait** : vue Doublons | P2 | S |
| Fichiers manquants et relocalisation | tous | **Fait** : fenêtre Fichiers manquants, relocalisation | P1 | M |
| Dossiers surveillés (import automatique) | RB, ENG, MX, DJAY | **Manque** | P2 | M |
| Navigateur de fichiers (onglet Files) | S, TR, MX | **Manque** | P2 | S |
| Import de la collection rekordbox (XML) avec cues et grilles | S, TR, VDJ, ENG, MX, DJS | **Fait** : cues, grille, note, couleur et playlists | P1 | M |
| Import Serato (crates, cues dans les tags) | RB, VDJ, ENG, MX | **Manque** | P1 | M |
| Import Traktor (NML) | RB, VDJ, ENG, MX | **Manque** | P2 | M |
| Import iTunes / Musique (XML) | tous | **Fait** | P2 | S |
| Import et export M3U / M3U8 / PLS | tous | **Partiel** : M3U et M3U8 ; pas de PLS | P1 | S |
| Export rekordbox XML | DJS, MX, ENG | **Fait** | P2 | M |
| Synchronisation cloud de la bibliothèque | RB *(Creative)*, DJAY (iCloud), ENG *(Engine Cloud)* | **Manque** | P3 | L |
| Sauvegarde et restauration de la bibliothèque | RB, S, TR | **Partiel** : un seul fichier, pas de copies datées | P2 | S |
| Streaming (Beatport, Beatsource, SoundCloud, TIDAL, Apple Music, Spotify) | tous sauf MX *(abonnements payants)* | **Manque** : il faut des partenariats | P2 | L |
| Mode hors ligne du streaming | S, RB, TR, ENG | **Manque** | P3 | L |
| Import de playlists de streaming en métadonnées et correspondance avec la collection | aucun | **Fait** : liste ou CSV Spotify, Deezer… retrouvé dans la collection, liens d'achat pour le reste | P3 | M |
| Fiche détaillée d'une piste (onglet Info) | tous | **Partiel** : panneau Infos pour éditer ; pas d'onglet d'informations complet | P2 | S |
| Mini-waveform dans la liste | MX 2.6, ENG, RB | **Manque** | P3 | S |
| Écran de préparation (une grande platine) | RB *(Export)*, S *(Prepare)*, ENG | **Manque** : voir le preset Export (§17) | P2 | M |

## 10. Analyse automatique

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| BPM, grille, tonalité, volume | tous | **Fait** | P1 | S |
| Waveform 3 bandes | tous | **Fait** | P1 | S |
| Analyse de phrases et structure (intro, couplet, refrain, montée, drop, outro) | RB *(Phrase)*, DJAY (Automix AI), VDJ, ENG, DJS | **Fait** : intro, couplet, break, montée, drop, outro par phrases de 8 mesures, en tâche de fond | P1 | L |
| Détection des passages vocaux | RB *(Creative : Vocal position)*, VDJ, S | **Manque** | P2 | M |
| Énergie de la piste (1 à 10) | Mixed In Key, DJS, VDJ, ENG | **Fait** : estimée à l'analyse, modifiable | P2 | M |
| Détection du genre et de l'ambiance (IA) | DJAY, VDJ, RB (Track Suggestion) | **Manque** | P3 | L |
| Intro et outro pour l'auto-mix | MX, VDJ, DJAY | **Fait** | P2 | M |
| Silence en début et en fin | tous | **Partiel** : premier son pour la grille, fin de la musique repérée pour l'auto-mix | P2 | S |
| Loudness LUFS / ReplayGain | MX, VDJ, ENG | **Manque** : RMS | P2 | S |
| Nouvelle analyse forcée et analyse partielle (seulement ce qui manque) | tous | **Manque** | P2 | S |
| Paroles générées par IA | VDJ 2026, RB *(Creative : Lyric via service)* | **Manque** | P3 | L |

## 11. Auto-mix et suggestions

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| Auto-mix depuis une playlist ou une file | S (Autoplay), RB, VDJ, DJAY, MX | **Fait** : file remplie à la main ou depuis une playlist | P1 | M |
| Auto-mix « intelligent » (phrases, EQ, effets) | DJAY *(Automix AI)*, VDJ, RB | **Fait** : départ sur les phrases, échange des basses, filtre, écho ou coupe selon les morceaux | P2 | L |
| Réglage de la durée et du type de transition auto | VDJ, MX, DJAY | **Fait** : style et durée en mesures | P2 | S |
| Suggestion du morceau suivant (Related / Track Suggestion / GeniusDJ) | RB, VDJ, DJAY, S, DJS | **Fait** : note sur 100 (tonalité, tempo, énergie, déjà joué) avec les raisons | P2 | M |
| Mix Point Link (préparer la transition entre deux pistes) | RB *(Free bloqué si contrôleur)* | **Manque** | P3 | M |
| Playlists générées par IA (requête en langage naturel) | VDJ 2026, DJAY | **Manque** | P3 | L |
| Planificateur de set en timeline (ordre, chevauchements, automation) | DJS | **Manque** : prévu (ROADMAP) | P3 | L |
| Rendu hors ligne d'un set planifié (MP3, WAV, vidéo) | DJS | **Manque** | P3 | L |
| Export du set planifié vers d'autres logiciels | DJS (vers RB, S, Ableton) | **Manque** | P3 | M |

## 12. Enregistrement et diffusion

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| Enregistrement du mix | tous *(RB Free : non ; S : pas avec le streaming)* | **Fait** : WAV 16 ou 24 bits sur le disque (appli) ou téléchargé (navigateur), ou WebM/Opus léger | P1 | S |
| Enregistrement WAV, FLAC, MP3 et AIFF sur le disque | tous | **Partiel** : WAV 16 et 24 bits ; pas de FLAC, MP3 ni AIFF | P1 | M |
| Tracklist horodatée liée à l'enregistrement (cue sheet) | RB, VDJ, TR, MX | **Fait** : .cue et tracklist texte créées à chaque enregistrement, datées quand un morceau passe devant (fader × crossfader) | P2 | S |
| Enregistrement de l'entrée micro ou de la table | TR, VDJ, MX | **Fait** : le micro ou une platine d'entrée enregistrés à part (WebM), rangés dans Enregistrements | P3 | M |
| Diffusion Icecast / Shoutcast | TR, VDJ, MX | **Manque** | P2 | M |
| Diffusion Twitch, YouTube, Mixcloud Live | VDJ, RB, DJS (Mixcloud) | **Manque** | P3 | L |
| Partage du mix (Mixcloud, SoundCloud) | RB *(Core)*, S | **Manque** | P3 | M |
| Envoi des titres joués vers un fichier ou OBS (« now playing ») | MX, VDJ, S (plugins) | **Manque** | P3 | S |

## 13. Vidéo, karaoké et paroles

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| Lecture de clips vidéo sur les platines | S *(payant : Serato Video)*, RB *(Creative)*, VDJ, DJAY | **Manque** | P3 | L |
| Transitions vidéo et effets vidéo | S, RB, VDJ | **Manque** | P3 | L |
| Sortie vidéo sur un second écran | S, RB, VDJ, DJAY | **Manque** | P3 | M |
| Visuels générés (visualiseur audio-réactif) | VDJ, RB, DJAY, S *(Serato Visualizer)* | **Manque** | P3 | M |
| Texte, logo et messages à l'écran | S, RB, VDJ | **Manque** | P3 | M |
| Karaoké (CDG, file de chanteurs, second écran) | VDJ, S (extensions) | **Manque** | P3 | L |
| Paroles synchronisées (Lyric) | RB *(Creative)*, VDJ 2026 (IA) | **Manque** | P3 | L |

## 14. Matériel

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| MIDI Learn | tous *(S : MIDI mapping à partir de Pro ; RB Free : non)* | **Fait** | P1 | S |
| Retour des LED | tous | **Fait** : play, sync, cue, pads, boucle, FX et coach clignotant | P1 | S |
| MIDI natif sur macOS et Linux (sans Web MIDI) | tous | **Fait** : `midir` et `tauri-bridge.js` | P1 | S |
| Mappings fournis pour les contrôleurs du marché (100+ chez les autres) | S, RB, TR, VDJ, DJAY, MX | **Partiel** : un mapping générique fourni et une bibliothèque de mappings à partager ; aucun mapping validé par modèle | P1 | L |
| Détection automatique du contrôleur et chargement du mapping | tous | **Fait** : mapping proposé au branchement | P1 | M |
| Format de mapping partageable (import et export) | TR (TSI), MX (XML+JS), VDJ (XML) | **Fait** : JSON Mixlab | P2 | S |
| Mapping avancé : Shift, modificateurs, banques et pages | tous | **Fait** : calque Shift et bascule de platine A/C et B/D | P1 | M |
| Encodeurs relatifs (sens, accélération) et jog en 14 bits | tous | **Fait** : 3 codages relatifs, paires 14 bits | P1 | M |
| Soft takeover / pickup des potards | TR, MX, VDJ | **Fait** : rattrapage des potards | P2 | S |
| Jog : toucher du plateau (scratch) et anneau de lecture | tous | **Fait** : toucher = scratch, sinon pitch bend | P1 | M |
| Pitch fader 14 bits (MSB et LSB) | tous | **Fait** | P2 | S |
| Afficheurs des contrôleurs (écrans dans les jogs, texte) | S, RB, TR, MX 2.6, VDJ | **Manque** | P3 | L |
| Couleur RGB des pads selon la couleur du cue | tous | **Manque** : LED allumée ou éteinte | P2 | M |
| Scripts de mapping (VDJScript, JS) | VDJ, MX | **Manque** | P2 | L |
| HID (jogs haute résolution, Traktor Kontrol, DDJ) | S, RB, TR, VDJ, MX | **Manque** | P2 | L |
| Carte son intégrée au contrôleur (4 canaux, casque en 3-4) | tous | **Partiel** : moteur Rust, pas branché | P1 | L |
| DVS timecode (vinyle et CD) | S *(payant : DVS)*, RB *(Free : sans REL/ABS)*, TR, VDJ, MX, DJAY | **Manque** | P2 | L |
| Modes DVS absolu, relatif et interne, calibration | S, RB, TR, MX | **Manque** | P2 | L |
| Export sur clé USB pour CDJ et XDJ (base de données matériel) | RB *(gratuit en mode Export)*, DJS, ENG (pour ses machines) | **Manque** | P2 | L |
| Export pour les machines Engine DJ | ENG, MX 2.6 | **Manque** | P3 | L |
| Link avec des CDJ / Pro DJ Link (jouer la bibliothèque depuis le PC) | RB *(Link Export)* | **Manque** | P3 | L |
| Ableton Link | TR, RB, S, VDJ, DJAY, ENG, MX | **Manque** | P2 | M |
| MIDI clock en sortie | TR, VDJ, RB, MX | **Fait** : horloge, Start et Stop vers une sortie MIDI | P2 | M |
| MIDI clock en entrée | TR, VDJ | **Manque** | P3 | M |
| OSC (contrôle par réseau) | VDJ, MX (expérimental), TR (non) | **Manque** | P3 | M |
| Lumières : DMX, SoundSwitch, Lighting mode | RB *(Lighting)*, S, VDJ, ENG (SoundSwitch) | **Manque** | P3 | L |
| Lumières Philips Hue | RB, S, VDJ, ENG | **Manque** | P3 | M |
| Mixer externe en Thru, avec effets du mixer | RB, S (DJM, Rane) | **Manque** | P3 | L |
| Application compagnon sur téléphone ou tablette | VDJ (remote), RB (app) | **Manque** | P3 | L |
| Raccourcis clavier | tous | **Fait** : touches physiques (AZERTY ou QWERTY), modifiables | P1 | S |
| Éditeur de raccourcis clavier | S, TR, VDJ, MX | **Fait** : dans la fenêtre Contrôleur | P2 | S |
| Contrôle tactile (écran multi-touch) | DJAY, VDJ, RB (mode tactile) | **Partiel** : la souris marche au doigt, sans ergonomie dédiée | P3 | M |

## 15. Interface et presets

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| Waveforms horizontales empilées | tous | **Fait** | P1 | S |
| Waveform par platine | TR, MX, VDJ | **Fait** : preset Studio | P1 | S |
| Waveforms verticales | S, ENG, RB | **Manque** | P3 | M |
| Schémas de couleur : 3 bandes, RGB, mono, daltonien | tous | **Fait** | P2 | S |
| Zoom des waveforms | tous | **Fait** | P1 | S |
| Vue d'ensemble avec partie jouée, cues et boucle | tous | **Fait** | P1 | S |
| Repères de minutes sur la vue d'ensemble | MX 2.6 | **Manque** | P3 | S |
| Marqueurs de mesure et de phrase sur la waveform | tous | **Fait** : trait par mesure, bande de phrase de 32 temps | P1 | S |
| Bande de structure colorée (intro, drop…) | RB, ENG | **Fait** : sur les waveforms et la vue d'ensemble | P2 | M |
| Vue « beatgrid » comparée (deux pistes alignées) | VDJ, RB | **Manque** | P3 | M |
| Thème sombre | tous | **Fait** | P1 | S |
| Thème clair / jour | S, VDJ, TR | **Manque** | P2 | S |
| Taille de l'interface, mise à l'échelle | tous | **Manque** | P2 | S |
| Plein écran | tous | **Partiel** : celui de la fenêtre Tauri ou du navigateur | P3 | S |
| Afficher ou masquer les panneaux | tous | **Fait** : effets, waveforms, mixer, bibliothèque | P1 | S |
| Tailles de platine (mini, compacte, complète) | TR, MX | **Manque** | P2 | M |
| Mise en page personnalisée et sauvegardée | VDJ (skins), MX, TR | **Manque** : 5 presets fixes | P3 | L |
| Barre globale (horloge, CPU, REC, MIDI) | tous | **Partiel** : horloge, REC, MIDI, audio et BPM maître ; pas de CPU | P2 | S |
| Indicateur de charge CPU ou audio | tous | **Manque** | P2 | S |
| Préférences regroupées (fenêtre de réglages) | tous | **Partiel** : fenêtre Réglages de jeu (platines, mixer, casque, enregistrement) ; audio, contrôleur et affichage restent à part | P1 | M |
| Info-bulles sur les commandes | S, TR, MX | **Fait** : `title` sur toutes les commandes | P2 | S |
| Langues de l'interface | tous | **Partiel** : français seulement | P2 | M |
| Accessibilité (clavier, lecteur d'écran, contraste) | MX, DJAY | **Partiel** : ARIA sur les boutons et curseurs | P2 | M |
| Annuler la dernière action (cue, grille, chargement) | S, TR | **Manque** | P3 | M |

## 16. Apprentissage

| Fonction | Où on la trouve | Mixlab | Priorité | Effort |
|---|---|---|---|---|
| Leçons guidées avec validation automatique | aucun | **Fait** : 3 leçons (tempo, échange des basses, écho) | P1 | S |
| Coach en direct (alertes : saturation, basses, tempo, phase, tonalité, fin de piste…) | aucun | **Fait** : 12 règles | P1 | S |
| Halo à l'écran et LED clignotante sur la commande à toucher | aucun | **Fait** | P1 | S |
| Bilan noté de chaque transition | aucun | **Fait** | P1 | S |
| Parcours « De zéro à ton premier set » (14 chapitres) | aucun | **Fait** : 14 chapitres | P1 | L |
| Interface qui se débloque au fil des chapitres | aucun (modes Lite, Starter ou Play à part) | **Fait** | P1 | M |
| Progression sauvegardée et badges | DJAY (DJ School, en vidéo) | **Fait** | P2 | M |
| Glossaire intégré | aucun | **Fait** : mots cliquables dans le parcours et l'Académie | P2 | S |
| Mode « à l'oreille » (waveforms et BPM masqués) | aucun | **Partiel** : dans les exercices du parcours ; pas de bouton pour tout le jeu | P2 | S |
| Relecture d'une transition sur une mini-timeline (courbes des faders et des EQ) | DJS (hors ligne) | **Manque** | P2 | M |
| Bac à sable / essai au casque | VDJ (Sandbox) | **Manque** | P2 | M |
| Morceaux d'entraînement libres de droits | aucun | **Partiel** : 4 démos synthétisées | P2 | M |
| Tutoriels vidéo et visite guidée | DJAY, TR (Play) | **Manque** | P3 | M |
| Leçons qui s'adaptent au contrôleur branché | aucun | **Manque** | P3 | M |

---

## 17. Presets : quelle disposition ils reprennent et ce qui manque pour s'y retrouver

**Règle.** On reprend des **emplacements et des conventions** du métier, jamais de noms, logos, couleurs signature, icônes, typographies ou visuels de marque. Les noms des logiciels apparaissent ici seulement, comme repères internes.

### Performance (familier aux utilisateurs de Serato DJ Pro)

**Ce qu'il fait déjà**
- Waveforms parallèles en haut, grandes platines rondes, bibliothèque en dessous.
- Effets en haut, mixer masqué.
- En 4 platines, l'ordre est C A | B D.

**Ce qui manque pour s'y sentir chez soi**
- Mode vertical des waveforms, placé entre les platines.
- Bande de marqueurs de temps sous les waveforms, qui sert de phasemètre.
- Mini-mixer (gain, VU et cue) au lieu de rien quand le mixer est masqué.
- Panneaux à bascule dans la barre (Sampler, FX, Rec) au lieu de cases à cocher.
- **Prepare** (file d'attente) à droite de la bibliothèque, onglets Files, Browse et History.
- Temps écoulé ou restant au choix.

### Export (familier aux utilisateurs de rekordbox, mode préparation)

**L'écart à corriger d'abord.** Le preset actuel est une disposition de **jeu** : waveforms, platines autour du mixer, effets, bibliothèque. La recherche (§9.5) en fait un **écran de préparation**.

**Ce qui manque**
- Une grande platine (ou deux superposées pour comparer), avec la bande de structure.
- La liste des cues mémoire et des hot cues, et un éditeur de grille.
- La bibliothèque sur environ 60 % de la hauteur, avec un arbre, des colonnes configurables et un panneau « Related ».
- La platine de pré-écoute à placer dans l'écran (le lecteur existe dans la barre de la bibliothèque).
- Des actions en avant : analyser, éditer les tags, **exporter** (USB, XML, M3U).
- Pas de mixer ni d'effets.
- Un en-tête de platine dense (BPM, tonalité, temps et pitch sur une ligne).

### Studio (familier aux utilisateurs de Traktor Pro)

**Ce qu'il fait déjà**
- Pas de platine ronde, une waveform par platine.
- Effets en haut, mixer au centre, A/C à gauche et B/D à droite.

**Ce qui manque**
- Une **section globale à trois blocs** : FX 1, maître (horloge, tempo maître, enregistreur, limiteur), FX 2.
- Unités d'effets assignables avec 3 effets chaînés (Group / Single).
- Un phasemètre dans l'en-tête de chaque platine.
- Des tailles de platine à faire défiler.
- Des types de platine : piste, stems, remix et entrée live.
- Un bouton d'effet de voie (Mixer FX) dans chaque tranche.
- Un EQ 4 bandes en option.
- Un navigateur avec arbre et pré-écoute.
- Un mode Freeze ou Flux.

### Mix (familier aux utilisateurs de VirtualDJ)

**Ce qu'il fait déjà**
- Waveforms en haut, grandes platines, mixer central, bibliothèque.

**Ce qui manque**
- Le compteur de temps (1-4) et de phrase **au-dessus** des waveforms, au lieu du texte dans la lane.
- Un bouton **Sandbox** (essai au casque).
- **Stems visibles en permanence** : 4 boutons par platine.
- Un panneau latéral à onglets dans la bibliothèque : file d'attente, auto-mix, sampler et historique.
- Des gros boutons pour les DJ mobiles.
- Le micro avec talkover.

### École (propre à Mixlab)

**Ce qu'il fait déjà**
- Disposition Mix avec le coach ancré à droite.
- Leçons, coach en direct, phasemètre et compteurs de phrase.

**Ce qui manque**
- L'interface qui grandit au fil des chapitres.
- Le compte à rebours « lance B dans 4… 3… 2… 1 ».
- La roue harmonique.
- Le mode « à l'oreille ».
- La relecture en timeline.
- Le verrouillage de Sync par la leçon.

### Pour tous les presets

**Ce qui manque**
- Un thème clair.
- 3 niveaux de densité.
- La mise à l'échelle de l'interface.
- Une fenêtre de préférences.

---

## 18. Ordre de réalisation proposé

Les lots vont du plus bloquant pour un DJ qui arrive d'un autre logiciel au plus niche. Chaque lot arrive avec ses tests, conformément au ROADMAP.

### Lot A · « Je peux venir avec ma musique » (P1, surtout S/M)

**Lecture des fichiers**
- Lecture des tags (titre, artiste, album, genre, pochette).

**Analyse**
- Cache complet de l'analyse, waveform comprise : plus de réanalyse au démarrage.
- Analyse en tâche de fond (Worker).
- Plage de BPM réglable.

**Import d'autres logiciels**
- rekordbox XML, Serato et M3U/M3U8, avec les cues et les grilles.
- iTunes.

**Organisation de la bibliothèque**
- Note, couleur, commentaire et énergie.
- Colonnes configurables.
- Renommer, supprimer et réordonner les playlists.
- Dossiers de playlists.
- Smart crates.
- Historique des sets sauvegardé, avec export de la tracklist.
- File d'attente (Prepare).
- Relocalisation des fichiers manquants.

### Lot B · « Mes cues et mes pads » (P1/P2, S/M)

**Cues**
- Hot cues nommés et colorés (palette), déplaçables.
- Cues mémoire et liste éditable.
- Boucles sauvegardées et mode Saved loop.
- Hot cues automatiques.

**Pads**
- Modes Slicer, Pitch play / Keyboard, Key shift, Pad FX et Beat loop.
- 16 hot cues.

**Lecture**
- Temps écoulé ou restant.
- Plages de pitch complètes et sens du fader.
- Clone de platine.
- Vinyl brake et start/stop.
- Cue Play.

### Lot C · « Le son d'un vrai logiciel » (P1, L) : moteur natif

**Moteur**
- Brancher le moteur Rust : ASIO/CoreAudio, buffer réglable, casque sur une carte 4 canaux.
- Key lock de qualité studio (Signalsmith Stretch).
- Décodage en flux.

**Enregistrement**
- Enregistrement en WAV/FLAC sur le disque, avec cue sheet.

**Sorties**
- Sortie booth.
- Mixer externe (sorties par platine).
- Entrée micro avec talkover.

### Lot D · « Mon contrôleur marche tout de suite » (P1, L)

**Mapping**
- Mapping avancé : Shift, pages, 14 bits, soft takeover, toucher du jog, mode vinyle, scratch.
- RGB des pads.
- Détection automatique et bibliothèque de mappings (10 à 20 contrôleurs les plus vendus, à valider sur du vrai matériel).

**Clavier**
- Éditeur de raccourcis clavier.

**Ensuite**
- HID.

### Lot E · « Effets et mixer de niveau club » (P1/P2, M)

**Effets**
- Unités assignables (voies et master), chaînage de 3 effets.
- Paramètres avancés et déclenchement quantisé.
- Bitcrusher, brake, spiral, noise, ping-pong, roll FX, Reverb Rise.

**Mixer**
- Effet de voie à un bouton : filtre, dub echo, noise, space.
- Modèles d'EQ et EQ 4 bandes.
- Courbe des faders de voie et reverse du crossfader.
- Indicateur du limiteur.
- LUFS.

**Sampler**
- Sons utilisateur, banques, modes de lecture, sampler synchronisé.

### Lot F · « Structure et automatismes » (P1/P2, L)

**Analyse**
- Analyse de phrases et structure, avec la bande colorée.
- Détection vocale.
- Énergie.

**Sync et grille**
- Bar/Phrase sync.
- Phasemètre sur les platines.
- Grille dynamique.
- Verrou et métronome.

**Harmonie**
- Key sync.
- Correction de la tonalité.
- Choix de la notation.
- Vérifier la précision de la tonalité sur un corpus.

**Auto-mix et suggestions**
- Auto-mix (simple, puis sur les phrases).
- Suggestions notées.
- Mix Point Link.

### Lot G · « Stems » (P1/P2, L)

- Séparation HT-Demucs en ONNX, en tâche de fond, avec cache.
- Mute et volume par stem, acapella et instrumental.
- Pads de stems et effets par stem.
- Lecture des fichiers `.stem.mp4`.

### Lot H · « École complète » (P1/P2, M/L), à mener en parallèle

- Parcours en 14 chapitres et interface qui grandit.
- Progression, badges et glossaire.
- Mode « à l'oreille ».
- Relecture en timeline.
- Sandbox.
- Roue harmonique.
- Pistes d'entraînement.
- Leçons adaptées au contrôleur.

### Lot I · « Écosystème » (P2, M/L)

**Synchronisation**
- Ableton Link, MIDI clock en sortie et en entrée.
- OSC.

**Diffusion**
- Icecast/Shoutcast.
- « Now playing » vers OBS.

**Export**
- rekordbox XML.
- Clé USB pour CDJ.
- Export pour les machines Engine.

**Matériel**
- DVS timecode (absolu, relatif, calibration).

**Interface**
- Thème clair, échelle et préférences.
- Presets refaits selon le §17, en commençant par l'écran de préparation du preset Export.

### Lot J · Niche (P3, L)

**Vidéo**
- Vidéo, karaoké et paroles synchronisées.
- Visualiseur.

**Studio et IA**
- Pattern Player, séquenceur, remix decks et looper.
- Plugins VST.
- Playlists par IA.

**Préparation**
- Planificateur de set en timeline, avec rendu et export.

**Matériel et services**
- Lumières DMX, SoundSwitch et Hue.
- Écrans des contrôleurs.
- Application compagnon.
- Synchronisation cloud.
- Streaming, sous réserve de partenariats.

---

### Sources principales (2025-2026)

- rekordbox, plans et limites : https://rekordbox.com/en/support/faq/plans/
- Serato DJ Pro et ses extensions : https://serato.com/dj/pro ; notes de version 4.0 : https://serato.com/dj/pro/downloads/4.0.0/releasenotes
- Traktor Pro 4 (stems, Ozone Maximizer, Pattern Player, Flexible Beatgrid) : https://musictech.com/news/gear/traktor-pro-4-update/
- VirtualDJ 2026 (paroles et playlists par IA, moteur d'effets) : https://www.digitaldjtips.com/virtualdj-2026/
- Engine DJ 5.0 (stems sur la machine, RGB, assistant d'import) : https://djtechtools.com/2026/05/13/engine-dj-5-0-on-bard-stems-on-the-system-1-rgb-waveforms-for-everyone/
- Mixxx 2.6 (STEM, édition des hot cues, couleurs de tonalité) : https://mixxx.org/news/2025-05-11-mixxx-2_6_beta-released
- djay, version gratuite contre Pro : https://help.algoriddim.com/archive/free-vs-pro
- Recherche interne : `/mnt/project-files/dj-app/research/analyse-logiciels-dj.md`
