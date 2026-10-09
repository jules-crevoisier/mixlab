# Logiciel DJ « école intégrée » — spécification produit v0.1

_Rédigée le 9 octobre 2026. Nom de code provisoire : **Mixlab**._

## 1. Vision

Un logiciel DJ complet, au niveau des outils professionnels, qui apprend aussi à mixer.
Le même écran sert au débutant qui découvre ce qu'est une phrase de 16 mesures et au DJ confirmé qui joue un set
de deux heures sur son contrôleur. L'apprentissage n'est pas un tutoriel séparé : c'est un « coach » qui lit en
direct l'état des platines et du mixer et qui explique ce qui se passe.

**Publics visés**

| Public | Ce qu'il attend |
|---|---|
| Débutant complet | Comprendre tempo, phrases, EQ ; réussir une première transition propre sans matériel coûteux |
| DJ amateur | Progresser (harmonie, effets, construction de set) avec son contrôleur d'entrée de gamme |
| DJ confirmé | Un outil fiable en live, mappable sur n'importe quel matériel, avec une interface qui ne le perd pas |

## 2. Parité avec les logiciels pros

Légende : **P** = prototype actuel · **M** = MVP · **V1** = version 1.0 · **+** = après V1

### Platines (decks)
| Fonction | Lot |
|---|---|
| 2 platines | P |
| 4 platines | V1 |
| Lecture, pause, cue façon CDJ (aperçu en maintenant, retour au relâchement) | P |
| Pitch fader, plages ±8 / ±16 / ±50 % | P (±8), M (plages) |
| Pitch bend / nudge | P |
| Analyse BPM et grille de temps | P |
| Édition manuelle de la grille (décaler, taper le tempo, demi/double) | M |
| Sync tempo + phase, quantize | P |
| Key lock (time-stretch qui garde la tonalité) | M (moteur natif requis) |
| Détection de tonalité, notation harmonique type roue de Camelot | M |
| Hot cues (8 par piste, couleurs, noms) | P (4), M (8) |
| Mémoire de cues sauvegardée par piste | M |
| Boucles auto 1/8 à 32 temps, boucles manuelles in/out, doubler/diviser | P (auto) , M (le reste) |
| Loop roll, beat jump, slip mode, censure/reverse | V1 |
| Waveform défilante colorée par bandes (graves/médiums/aigus) + vue d'ensemble | P |
| Compteur de phrases et de mesures | P |

### Mixer
| Fonction | Lot |
|---|---|
| Trim/gain, EQ 3 bandes avec kill, filtre bipolaire (passe-bas / passe-haut) | P |
| Faders de voie, crossfader avec choix de courbe | P |
| VU-mètres par voie et master, limiteur master | P |
| Écoute casque (cue) et mix cue/master, split cue | M (moteur natif, sorties multiples) |
| EQ 4 bandes, mode isolateur ou EQ classique | V1 |
| Sortie booth, enregistrement du mix | M |

### Effets, sampler, stems
| Fonction | Lot |
|---|---|
| Beat FX synchronisés (écho, delay, reverb, flanger, phaser, gate, roll) | M |
| Effets par voie et effets master, chaînage | V1 |
| Sampler 8 à 16 pads | V1 |
| Séparation de stems en temps réel (voix, batterie, basse, mélodie) | + (modèle IA local) |

### Bibliothèque
| Fonction | Lot |
|---|---|
| Import de fichiers (mp3, wav, aiff, flac, m4a), glisser-déposer | P |
| Analyse par lots, cache d'analyse | M |
| Playlists, dossiers intelligents, recherche, tri par BPM / tonalité / énergie | M |
| Import des collections d'autres logiciels (fichiers XML exportables) | V1 |
| Historique des sets, export de la tracklist | V1 |
| Streaming (catalogues partenaires) | + (accords commerciaux nécessaires) |
| Contrôle par vinyle timecode (DVS) | + |

## 3. Compatibilité avec n'importe quel contrôleur

Objectif : brancher **n'importe quelle table** et jouer, sans attendre qu'un éditeur publie un mapping.

1. **MIDI class-compliant** (99 % du parc) : détection automatique, mappings livrés pour les contrôleurs les plus vendus (les grandes marques du marché, citées uniquement pour indiquer la compatibilité).
2. **MIDI Learn** : on clique sur un bouton du logiciel, on bouge la commande physique, c'est mappé. Présent dans le prototype.
3. **Types de commandes gérés** : absolues (faders, potards), boutons (note on / CC), relatives (jog wheels, encodeurs en 2's complement ou 64 = centre), 14 bits (MSB/LSB) pour les pitch faders haute résolution, touche « shift » qui double chaque commande.
4. **Retour LED** (MIDI out) : boutons play/cue/hot cues allumés selon l'état.
5. **HID** pour les contrôleurs qui l'utilisent (jogs haute résolution, écrans) : moteur natif requis.
6. **Format de mapping ouvert** (JSON documenté), importable/exportable, avec une bibliothèque communautaire et un assistant « mapping guidé » qui demande de toucher chaque commande dans l'ordre.
7. **Interfaces audio** : sorties multiples (master + casque) via ASIO (Windows), CoreAudio (macOS), et la carte son intégrée des contrôleurs.

## 4. Interface modulable et presets

- L'écran est composé de **panneaux** : waveforms, platine A, platine B, mixer, bibliothèque, coach, MIDI. Chacun peut être affiché ou masqué.
- **Presets de disposition** qui reprennent les ergonomies que les DJ connaissent déjà, pour que personne ne soit perdu :

| Preset | Ergonomie reprise |
|---|---|
| **Performance** | Waveforms parallèles en haut, grandes platines de part et d'autre d'un mixer central, bibliothèque dessous (ergonomie proche de Serato DJ Pro). |
| **Export** | Préparation : grande bibliothèque, grande waveform, cues et grille (ergonomie proche du mode Export de rekordbox). |
| **Studio** | Effets en haut, waveform par platine, platines compactes (ergonomie proche de Traktor Pro 4). |
| **Mix** | Waveforms en haut, platines et mixer au centre, bibliothèque dessous (ergonomie proche de VirtualDJ). |
| **École** | Disposition Mix + panneau Coach ouvert et aides visuelles (phase, phrases, alerte basses). |

- **Point juridique** : on reprend l'*ergonomie* (placement des éléments, conventions du métier comme « platine A à gauche, waveforms en haut »), qui n'est pas protégeable. On ne reprend **ni les noms, ni les logos, ni les couleurs et l'habillage exacts** des logiciels existants (habillage commercial protégé). Les presets portent nos propres noms. À faire valider par un juriste avant la sortie publique.
- Les utilisateurs peuvent enregistrer leurs propres dispositions et les partager.

## 5. Mode apprentissage (le cœur du produit)

### 5.1 Le coach en direct
Toujours visible en mode École, il lit l'état des platines en continu :
- **Écart de tempo** entre les deux pistes, en BPM et en %.
- **Phasemètre** : de combien de millisecondes les temps des deux pistes sont décalés, et dans quel sens.
- **Compteur de phrases** : mesure 1 à 16 de la phrase en cours sur chaque platine, pour lancer une piste au bon moment.
- **Alerte « basses qui se battent »** : les deux voies sont ouvertes avec les graves à fond.
- **Alerte saturation** : niveau master dans le rouge.
- (M) **Compatibilité harmonique** des deux tonalités.

### 5.2 Leçons guidées
Chaque leçon est une suite d'étapes. Une étape a une consigne, une explication courte (« pourquoi »), et une
**condition vérifiée automatiquement** sur l'état réel du logiciel ou du contrôleur. L'étape se valide seule quand l'élève l'a réussie.

### 5.3 Parcours
| Module | Contenu | Lot |
|---|---|---|
| 1. Le signal | Gain, VU-mètres, ne pas être dans le rouge | M |
| 2. Structure d'un morceau | Temps, mesures, phrases de 8/16/32, intro/break/drop | M |
| 3. Caler le tempo | À l'oreille avec le pitch puis avec le nudge ; Sync et ses limites | **P** |
| 4. Transitions | Échange des basses (bass swap) **P**, transition au filtre, cut, echo out, transition en boucle | P / M |
| 5. Harmonie | Tonalités, roue harmonique, mix harmonique | V1 |
| 6. Construire un set | Courbe d'énergie, sélection, lecture du public | V1 |
| 7. Performance | Hot cues, effets, sampler, bases du scratch | V1 |

### 5.4 Progression
Exercices notés (précision du calage, timing de la transition, absence de clash de basses), badges, historique,
et **relecture** : enregistrement de chaque transition avec la courbe des faders et des EQ, commentée par le coach.

## 6. Stack technique recommandée pour la version finale

Le prototype tourne dans le navigateur (Web Audio + Web MIDI). C'est idéal pour valider l'ergonomie et la pédagogie,
mais pas suffisant pour un usage live :
- pas de sortie casque séparée fiable (le pré-écoute est indispensable à un DJ) ;
- latence plus élevée et sans ASIO ;
- pas de HID, pas de time-stretch de qualité pro.

**Recommandation : application de bureau native avec moteur audio C++ et interface web.**

| Couche | Choix | Pourquoi |
|---|---|---|
| Moteur audio | **C++ avec JUCE** | Standard de l'audio pro : ASIO/CoreAudio/WASAPI, MIDI et HID, latence de quelques ms, multi-sorties. |
| Time-stretch / key lock | Rubber Band (ou Élastique sous licence) | Qualité pro ; licences commerciales à prévoir. |
| Analyse (BPM, tonalité, stems) | C++ + modèles ONNX en local | Rapide, hors ligne. |
| Interface | **HTML/TypeScript (React) dans la WebView native de JUCE 8** | On réutilise directement l'interface et le moteur pédagogique du prototype ; panneaux et presets faciles à faire évoluer. |
| Plateformes | Windows, macOS ; Linux plus tard | Le marché DJ est surtout Win/Mac. |

Alternative étudiée : **Electron ou Tauri** avec un module audio natif. Plus rapide à démarrer, mais on finit par
écrire le moteur natif de toute façon et Electron ajoute du poids et un pont de communication à soigner. Réservé à
un MVP si l'équipe n'a pas de compétence C++.

Points de vigilance : licence JUCE (commerciale au-delà d'un certain chiffre d'affaires), licences du time-stretch,
signature et notarisation des applications, pilotes ASIO.

## 7. Feuille de route proposée

1. **Prototype web** (fait) : valider l'interface, les presets, le MIDI Learn et la première leçon.
2. **MVP** : moteur natif, cue casque, key lock, 8 hot cues, effets de base, bibliothèque, 10 contrôleurs mappés, modules 1 à 4.
3. **Bêta** : 4 platines, sampler, import de collections, modules 5 à 7, relecture commentée.
4. **V1** : stabilité live, mappings communautaires, export de sets.

## 8. Ce que fait le prototype (v2)

Fichiers : `index.html`, `engine.js`, `app.js`, `learn.js` (ouvrir `index.html` dans Chrome ou Edge). La v1 est gardée dans `v1/`.

- **Interface plein écran** façon logiciel pro, 5 dispositions : Performance, Export, Studio, Mix, École. Panneaux à afficher ou masquer, 2 ou 4 platines.
- **Platines** : platine rotative avec anneau de progression, waveforms 3 bandes défilantes et vue d'ensemble, BPM, tonalité (notation roue harmonique), temps restant, cue façon CDJ, Sync et Master, pitch ±8/16/50 %, key lock, transposition, nudge, slip, reverse, censor.
- **Pads** (8) : hot cues, loop roll, saut de temps, sampler (8 sons).
- **Boucles** : auto 1/32 à 32 temps, in/out manuels, reloop, ×2 ÷2, saut de temps. **Grille** : tap tempo, BPM ×2 ÷2, décalage, « 1 ici ».
- **Effets** par platine, calés sur le tempo : écho, reverb, flanger, phaser, gate, filtre LFO.
- **Mixer** 2 ou 4 voies : gain, EQ 3 bandes + kill, filtre, cue casque, affectation crossfader, VU-mètres, master stéréo, courbes de crossfader, split cue (casque à gauche, master à droite), volume du sampler.
- **Bibliothèque** : import par glisser-déposer, analyse BPM + tonalité + volume (gain auto), recherche, tri, playlists, historique du set, filtre « compatibles » (tonalité et tempo de la platine maître).
- **Enregistrement** du mix.
- **Contrôleurs** : MIDI Learn sur toutes les commandes, voyants de la table pilotés, mappings exportables, clavier.
- **Coach** : instruments en direct et 3 leçons (caler le tempo à l'oreille, échange des basses, sortie en écho).

Limites connues : le key lock du navigateur est de qualité moyenne (le moteur natif fera mieux), une seule sortie audio (d'où le split cue), pas de mappings préchargés par marque de contrôleur, pas d'analyse de structure (intro, break, drop).
