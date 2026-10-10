# Mixlab

Mixlab est un logiciel DJ gratuit pour Windows, macOS et Linux, avec un professeur intégré. Il a tout ce qu'on attend d'un logiciel de mix (2 ou 4 platines, mixer, effets, sampler, bibliothèque, tout contrôleur MIDI), et il apprend à mixer : un coach écoute ton mix en direct, un parcours emmène un débutant jusqu'à son premier set, et une Académie enseigne le métier. L'appli est une fenêtre [Tauri](https://tauri.app) autour d'une interface en JavaScript et Web Audio, qui tourne aussi dans Chrome ou Edge.

Le mode d'emploi complet est dans [docs/GUIDE.md](docs/GUIDE.md).

## Ce qu'il fait

**Platines**
- 2 ou 4 platines : jog, pitch (±8, ±16, ±50), nudge, sync au temps, à la mesure ou à la phrase, platine maître.
- Key lock, transposition, ton fin en cents, key sync, tonalité corrigeable à la main.
- Modes de cue CDJ, Denon et Numark, Cue Play, slip, reverse, censor, instant double.
- 8 hot cues nommés et colorés, cues mémoire, boucles gardées, saut de beat.
- Pads Hot cue, Roll, Saut, Slicer, Boucles, Pitch play et Sampler.
- Grille éditable et verrouillable, métronome au casque, décompte jusqu'au prochain cue.

**Mixer et effets**
- EQ 3 bandes avec kill, en mode isolateur ou classique, filtre avec résonance réglable, gain automatique.
- Effets de voie (Filtre, Écho, Bruit, Espace), limiteur sur le master, balance.
- Courbes des faders et du crossfader, crossfader inversé.
- Deux unités d'effets FX1 et FX2 assignables à chaque platine et au master, en simple ou en chaîne de 3, calées sur le tempo. 13 effets.
- Sampler 8 pads avec tes propres sons.
- Casque en split sur une carte son, ou sur une deuxième carte.
- Enregistrement du mix en WAV 16 ou 24 bits, ou en WebM.

**Bibliothèque**
- Import de fichiers ou de dossiers entiers, lecture des tags et des pochettes (MP3, M4A, FLAC, Ogg).
- Analyse du BPM, de la grille, de la tonalité et de la structure (intro, break, drop, outro), gardée en cache.
- Note, couleur, énergie, tags et commentaire. Morceaux compatibles surlignés.
- Recherche par champ (`bpm:120-126 key:~8A rating:>=4`), crates intelligentes, playlists, doublons.
- Import rekordbox XML, iTunes / Musique et M3U, export rekordbox XML et M3U8.
- Playlists Spotify ou Deezer retrouvées dans ta collection, avec liens d'achat pour les manquants.
- Historique des sets, tracklist en texte, CSV ou M3U8. Pré-écoute au casque. Fichiers manquants relocalisables.
- La table reste fluide avec des milliers de morceaux.

**Contrôleurs et clavier**
- Tout contrôleur MIDI : assistant de mapping guidé, MIDI Learn, Shift, potards 14 bits, encodeurs, jog tactile (scratch), rattrapage des potards, bascule de platine A/C et B/D, voyants.
- Bibliothèque de mappings, import et export, détection du contrôleur au branchement, horloge MIDI.
- Raccourcis clavier qui marchent en AZERTY et en QWERTY, modifiables.

**Écran**
- 5 dispositions : Performance, Préparation, Studio, Mix, École.
- Tout tient à l'écran d'un portable, sans défilement. Séparateurs, tailles de platine, bibliothèque plein écran, zoom, mode scène, plein écran.

**Apprendre**
- Coach en direct : saturation, basses superposées, tempo ou phase décalés, tonalités qui frottent, écart de volume, fin de morceau, silence, filtre ou effet oublié. Il montre la commande à toucher, à l'écran et sur la table, et note chaque transition sur 100.
- Parcours « De zéro à ton premier set » : 14 chapitres, une interface qui s'ouvre petit à petit, des exercices à l'oreille.
- Académie : 4 modules, 12 leçons, quiz et exercices (courbe d'énergie, plan de set, lire la salle, ranger sa musique).
- 3 leçons guidées : caler à l'oreille, échanger les basses, sortir en écho.
- Auto-mix sur une file d'attente, transitions calées sur les phrases, suggestion du morceau suivant.

## Installer

Les installeurs sont fabriqués par GitHub Actions (workflow « Appli Mixlab ») à chaque envoi sur `main` et pour chaque pull request. Ils se récupèrent dans l'onglet Actions, sous « Artifacts ». Un tag `v0.3.0` les joint en plus à un brouillon de release.

| Système | Fichier |
|---|---|
| Windows | `.exe` ou `.msi` |
| macOS 11 ou plus | `.dmg` universel (Intel et Apple Silicon) |
| Linux | `.AppImage` ou `.deb` |

Les installeurs ne sont pas encore signés. Sous Windows, SmartScreen demande de cliquer sur « Informations complémentaires » puis « Exécuter quand même ». Sous macOS, fais un clic droit sur l'appli puis « Ouvrir », ou va dans Réglages Système › Confidentialité et sécurité › « Ouvrir quand même ». Le détail est dans le [guide](docs/GUIDE.md#installer).

## Développer

Il faut Node 22 et Rust stable. Sous Linux, il faut aussi `libwebkit2gtk-4.1-dev libasound2-dev librsvg2-dev`.

```bash
npm install
npm run app        # appli de bureau en mode développement (tauri dev)
npm run web        # même interface dans le navigateur, sur http://localhost:8080
npm test           # les 11 suites de tests
npm run app:build  # installeurs du système courant (tauri build)
```

`npm test` lance 11 suites dans Chromium sans écran (Playwright ; la première fois, `npx playwright install chromium`) :

| Suite | Ce qu'elle vérifie |
|---|---|
| `smoke` | Démarrage sans erreur, import de dossier, bibliothèque persistante, routage du casque. |
| `coach` | Le coach en direct : le bon conseil sur la bonne commande, puis il disparaît. |
| `automix` | Structure, cues mémoire, suggestion du suivant, une transition auto-mix notée par le coach. |
| `library` | Collections rekordbox, iTunes, M3U, CSV, crates, recherche, export aller-retour, 5 000 morceaux. |
| `controllers` | Faux MIDI : mapping v2, 14 bits, Shift, jog, assistant, voyants, horloge, clavier. |
| `parcours` | Premier lancement, interface qui grandit, chapitres 1 à 5, reprise, glossaire. |
| `perf` | Pads, cues, effets, mixer et sampler, avec mesure du son. |
| `academie` | Leçons, quiz, progression, les quatre exercices, glossaire. |
| `tags` | Tags ID3, MP4, FLAC, Ogg, cache d'analyse, historique gardé, effets gardés. |
| `deckpro` | Modes de cue, pitch, key sync, instant double, pré-écoute, courbes, métronome, WAV. |
| `layout` | Tout tient à l'écran à chaque preset et taille, séparateurs, zoom, mode scène. |

Les tests Rust de l'appli : `cargo test --manifest-path src-tauri/Cargo.toml`. Ceux du moteur natif : `cargo test` dans `engine/`.

L'ancienne version Electron reste disponible à la main (`npm run dist`, workflow « Electron (version de secours) »).

## Limites de cette version

- Le son passe encore par le moteur Web Audio de l'interface. Le moteur natif Rust (`engine/`) est prêt et testé, mais pas encore branché.
- Sous Windows, le casque peut sortir sur une deuxième carte son. Sous macOS et Linux, la WebView ne sait pas choisir la carte : il faut le mode Split en attendant le moteur natif.
- Le MIDI passe par le pilote du système (CoreMIDI, WinMM, ALSA). Aucun mapping de marque n'est livré tant qu'il n'a pas été vérifié sur une vraie table.
- Pas encore de stems.

## Documentation

- [docs/GUIDE.md](docs/GUIDE.md) : le mode d'emploi.
- [docs/ROADMAP.md](docs/ROADMAP.md) : la feuille de route.
- [docs/PARITE.md](docs/PARITE.md) : la comparaison, fonction par fonction, avec les logiciels du marché.
- [docs/JOURNAL-NUIT.md](docs/JOURNAL-NUIT.md) : le journal de la nuit du 9 au 10 octobre 2026.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : les modules, les commandes de l'appli, les tests et le moteur natif.
- [docs/SPEC.md](docs/SPEC.md) : la spécification produit de départ.
