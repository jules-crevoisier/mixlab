# Mixlab

Logiciel DJ pour Windows, macOS et Linux, pensé pour apprendre à mixer. Il fonctionne avec n'importe quel contrôleur MIDI et se présente comme les logiciels du marché grâce à des dispositions prêtes à l'emploi.

## Ce qu'il fait

- 2 ou 4 platines avec jog, sync, key lock, slip, reverse et censor.
- 8 hot cues, rolls, saut de beat, boucles et sampler.
- Mixer avec EQ 3 bandes, filtre, gain automatique, casque et courbe de crossfader.
- 2 unités d'effets calées sur le tempo.
- Bibliothèque avec playlists et détection du BPM et de la tonalité. Elle surligne les morceaux compatibles.
- Import de fichiers ou de dossiers entiers. La bibliothèque, les cues et les playlists sont gardés d'un lancement à l'autre.
- Sortie master et sortie casque sur deux cartes son différentes, ou en split sur une seule.
- MIDI Learn pour tout contrôleur, avec retour des voyants.
- Enregistrement du mix.
- Dispositions Performance, Export, Studio, Mix et École.
- Coach en direct : pendant que tu mixes, il signale ce qui ne va pas (saturation, basses superposées, tempo ou phase décalés, tonalités qui frottent, écart de volume, fin de morceau, silence, filtre ou effet oublié), fait clignoter la commande à toucher à l'écran et sur la table, et note chaque transition sur 100 avec des conseils.
- Trois leçons guidées : caler à l'oreille, échanger les basses et sortir en écho.

## Lancer en développement

L'application est une fenêtre [Tauri](https://tauri.app) (Rust) autour de l'interface. Il faut Node 22 et Rust stable ; sous Linux, les paquets `libwebkit2gtk-4.1-dev libasound2-dev librsvg2-dev`.

```bash
npm install
npm run app      # application de bureau
npm run web      # même interface dans le navigateur (Chrome ou Edge) sur http://localhost:8080
npm test         # tests sans interface graphique (démarrage, bibliothèque, coach en direct)
```

## Fabriquer les installeurs

```bash
npm run app:build    # installeurs du système courant
```

GitHub Actions construit les installeurs Windows (.exe et .msi), macOS (.dmg universel Intel et Apple Silicon) et Linux (AppImage et .deb) à chaque push sur `main`. Ils se récupèrent dans l'onglet Actions, sous « Artifacts ». Un tag `v0.3.0` les joint en plus à un brouillon de release.

L'installeur pèse une dizaine de Mo, contre une centaine pour l'ancienne version Electron, qui reste disponible à la main (workflow « Electron (version de secours) », `npm run dist`).

Les installeurs ne sont pas encore signés. Au premier lancement, Windows SmartScreen demande de cliquer sur « Informations complémentaires » puis « Exécuter quand même ». Sur macOS, il faut faire un clic droit sur l'appli puis « Ouvrir ».

## Limites de cette version

- Le son passe encore par le moteur Web Audio de l'interface. Le moteur natif Rust (`engine/`) est prêt et testé, mais il n'est pas encore branché.
- Sous Windows, le casque peut sortir sur une deuxième carte son. Sous macOS et Linux, la WebView ne sait pas choisir la carte : il faut utiliser le mode split en attendant le moteur natif.
- Le MIDI passe par le pilote natif du système (CoreMIDI, WinMM, ALSA). Il n'a pas encore été essayé avec un vrai contrôleur.

## Organisation

| Dossier | Contenu |
|---|---|
| `app/` | L'interface et le moteur audio (Web Audio). Elle tourne aussi seule dans un navigateur. |
| `app/engine.js` | Le moteur : platines, mixer, effets, analyse BPM et tonalité, sampler, enregistrement. |
| `app/app.js` | L'interface : platines, mixer, bibliothèque, dispositions, MIDI, clavier. |
| `app/learn.js` | Les leçons guidées. |
| `app/coach-live.js` | Le coach en direct : règles, conseils, bilans de transition. |
| `app/tauri-bridge.js` | Le pont vers l'appli : fichiers, bibliothèque, MIDI natif. |
| `app/desktop.js` | L'intégration bureau : cartes son, import de dossiers, bibliothèque persistante. |
| `src-tauri/` | L'application : fenêtre, accès aux fichiers, bibliothèque, MIDI natif (midir). |
| `engine/` | Le moteur audio natif en Rust (pas encore branché). |
| `electron/` | L'ancienne version Electron, gardée en secours. |
| `docs/SPEC.md` | La spécification produit et la feuille de route. |

## Suite prévue

Voir `docs/SPEC.md`. Les prochains chantiers sont les suivants :

- refonte visuelle ;
- mappings prêts à l'emploi pour les contrôleurs les plus vendus ;
- brancher le moteur audio natif (ASIO et CoreAudio) pour une latence plus basse, le casque sur une carte 4 canaux et un time-stretch de qualité studio ;
- leçons supplémentaires.
