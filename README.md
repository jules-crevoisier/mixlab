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
- Coach de mix avec trois leçons : caler à l'oreille, échanger les basses et sortir en écho.

## Lancer en développement

```bash
npm install
npm start        # application de bureau
npm run web      # même interface dans le navigateur (Chrome ou Edge) sur http://localhost:8080
npm test         # test de fumée sans interface graphique
```

## Fabriquer les installeurs

```bash
npm run dist:win     # .exe (installeur et portable)
npm run dist:mac     # .dmg
npm run dist:linux   # AppImage et .deb
```

GitHub Actions construit les trois à chaque push sur `main`. Les fichiers se récupèrent dans l'onglet Actions, sous « Artifacts ».

Les installeurs ne sont pas encore signés. Au premier lancement, Windows SmartScreen demande de cliquer sur « Informations complémentaires » puis « Exécuter quand même ». Sur macOS, il faut faire un clic droit sur l'appli puis « Ouvrir ».

## Organisation

| Dossier | Contenu |
|---|---|
| `app/` | L'interface et le moteur audio (Web Audio). Elle tourne aussi seule dans un navigateur. |
| `app/engine.js` | Le moteur : platines, mixer, effets, analyse BPM et tonalité, sampler, enregistrement. |
| `app/app.js` | L'interface : platines, mixer, bibliothèque, dispositions, MIDI, clavier. |
| `app/learn.js` | Le coach et les leçons. |
| `app/desktop.js` | L'intégration bureau : cartes son, import de dossiers, bibliothèque persistante. |
| `electron/` | La fenêtre, les permissions (MIDI, cartes son) et l'accès aux fichiers. |
| `docs/SPEC.md` | La spécification produit et la feuille de route. |

## Suite prévue

Voir `docs/SPEC.md`. Les prochains chantiers sont les suivants :

- refonte visuelle ;
- mappings prêts à l'emploi pour les contrôleurs les plus vendus ;
- moteur audio natif (ASIO et CoreAudio) pour une latence plus basse et un time-stretch de qualité studio ;
- leçons supplémentaires.
