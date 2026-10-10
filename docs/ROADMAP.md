# Mixlab : feuille de route vers un logiciel DJ complet et gratuit

Écrite le 10 octobre 2026, à la demande de jules, pour le travail de la nuit et des semaines suivantes.

**But.** Retrouver dans Mixlab tout ce que les DJ utilisent dans les logiciels payants, gratuitement, et y ajouter ce que personne n'a : un vrai professeur intégré. Il prend quelqu'un qui n'a jamais touché une platine et l'emmène jusqu'à son premier set.

**Règle de travail.** Chaque chantier arrive avec ses tests automatiques. Rien n'est annoncé comme fini sans avoir été vérifié. Le travail de la nuit part sur la branche `nuit`, avec une pull request qui fait tourner la CI. `main` reste toujours installable.

---

## Ce qui existe déjà (v0.3)

- 4 platines : sync, key lock, slip, reverse, censor, 8 hot cues, rolls, boucles, saut de beat et sampler.
- Mixer : EQ 3 bandes avec kill, filtre, gain automatique, casque (split ou deuxième carte), 3 courbes de crossfader et enregistrement.
- 2 unités d'effets calées sur le tempo.
- Bibliothèque : analyse du BPM, de la grille et de la tonalité, morceaux compatibles, playlists, import de dossiers, sauvegarde.
- MIDI Learn avec retour des LED, et 5 dispositions.
- Coach en direct, 3 leçons et un bilan noté de chaque transition.
- Appli Tauri pour Windows, macOS et Linux, plus un moteur Rust (pas encore branché).

---

## Chantier 1 · Le parcours « De zéro à ton premier set » (priorité n° 1)

Un mode dédié, séparé des leçons isolées. On le choisit au premier lancement (« Je n'ai jamais mixé ») ou depuis le menu École.

**Principes**
- **Interface qui grandit.** Au début, on ne voit qu'une platine, un fader et le volume. Chaque chapitre débloque les commandes qu'il enseigne. À la fin, c'est l'interface complète.
- **Une chose à la fois.** Chaque étape a une consigne, le pourquoi, et une vérification automatique sur l'état réel de l'appli. Le halo et la LED montrent quoi toucher.
- **Écouter avant de voir.** Des exercices « à l'oreille » cachent les waveforms et le BPM, puis les révèlent avec la note.
- **Progression sauvegardée.** Chapitres validés, badges, temps passé. On reprend là où on s'est arrêté.
- **Vocabulaire expliqué.** Un glossaire intégré : chaque mot technique est cliquable.

**Chapitres**
1. Bienvenue : à quoi sert un DJ, ce qu'est une platine et un mixer. Visite guidée de l'écran.
2. Lire un morceau : play, pause, cue et revenir au début. Charger un morceau depuis la bibliothèque.
3. Le volume : fader, gain, VU-mètres et pourquoi rester hors du rouge.
4. Le casque : pré-écouter un morceau sans que la salle l'entende.
5. Le rythme : temps, mesures, phrases de 8 mesures, compter « 1-2-3-4 » sur la grosse caisse.
6. La structure d'un morceau : intro, couplet, break, montée, drop, outro. Repérer les endroits où mixer.
7. Le tempo : BPM, pitch, Sync, puis caler sans Sync (leçon existante).
8. L'EQ : couper les basses, l'échange des basses (leçon existante).
9. Première transition complète, de A vers B, avec le bilan du coach.
10. Les transitions de base : au filtre, en écho (leçon existante), en coupe, en boucle.
11. L'harmonie : tonalités compatibles et roue des tonalités.
12. Les outils de scène : hot cues, boucles, effets (dosage, durée) et sampler.
13. Préparer un set : choisir 5 morceaux, les ordonner par énergie, poser des cues.
14. **Ton premier set** : 5 morceaux, 4 transitions, enregistré, noté par le coach. Il produit un résumé à partager et la tracklist.

**Bonus**
- Mode entraînement libre avec des objectifs du jour.
- Relecture de chaque transition sur une mini-timeline (faders, EQ, filtre).
- Pas de pénalité : on peut toujours passer une étape.

---

## Chantier 2 · Les automatismes des logiciels payants

| Fonction | Chez les autres | Plan Mixlab |
|---|---|---|
| Analyse de structure (intro, drop, outro, phrases) | rekordbox (Phrase), VirtualDJ | Analyse d'énergie et des ruptures, alignée sur la grille. Bandes colorées sous la waveform. |
| Cues automatiques | rekordbox, Engine DJ | Cues mémoire posés sur l'intro, le premier drop, le break et l'outro. |
| Auto-mix | VirtualDJ, djay, Serato (Autoplay) | File d'attente et transitions automatiques sur les phrases (basses, filtre ou écho selon les morceaux). C'est aussi un « DJ de démonstration » pour le parcours. |
| Suggestion du morceau suivant | djay, rekordbox (Related Tracks) | Tonalité, tempo, énergie, genre et historique, avec une note de compatibilité. |
| Gain automatique | tous | Déjà fait ; à passer en loudness LUFS. |
| Grille dynamique | rekordbox, Traktor | Correction du tempo variable (morceaux joués par des musiciens). |
| Stems (voix, batterie, basse, instruments) | Serato, rekordbox, VirtualDJ, djay, Traktor | Séparation HT-Demucs (licence MIT) en ONNX, calculée en tâche de fond dans le moteur Rust, puis 4 boutons par platine. **Lourd : prévu après le branchement du moteur natif.** |
| Key shift et harmonie | Mixed In Key, rekordbox | Déjà en partie fait ; ajouter « accorder sur la platine maître ». |
| Beat FX quantisés | Pioneer, Serato | Effets déclenchés sur le temps, avec une durée en temps. |

---

## Chantier 3 · Bibliothèque de niveau pro

- Tags, note (étoiles), couleur, commentaire, énergie (1 à 10) et genre éditables.
- **Crates intelligentes** : règles du type « BPM entre 120 et 126 ET tonalité 8A ET note ≥ 4 ».
- Historique des sets, avec export de la tracklist (texte, CSV).
- **Import depuis les autres logiciels** : rekordbox XML (morceaux, playlists, cues, grille), collection iTunes/Musique (XML), M3U/M3U8. Lecture des cues et des grilles quand elles existent.
- **Export** : rekordbox XML (pour une clé USB de club), M3U.
- Doublons, fichiers manquants à relocaliser, dossiers surveillés.
- Pochettes, recherche par colonne, colonnes configurables.
- Platine de pré-écoute dans la bibliothèque.

---

## Chantier 4 · Performance et scène

- Cues mémoire **nommés et colorés**, boucles sauvegardées.
- Mode de pads **slicer**, roll, saut et boucles sauvegardées.
- Effet couleur par voie (un bouton : filtre, écho, bruit, espace).
- Effets supplémentaires : gater, bitcrusher, vinyl brake, spiral, noise.
- Mappings prêts à l'emploi pour les contrôleurs les plus vendus. **À valider avec du vrai matériel.** On commence par un format de mapping partageable et un assistant de mapping guidé.
- Ableton Link (synchro avec d'autres logiciels), avec le moteur natif.
- Enregistrement avec tracklist horodatée (Mixcloud, YouTube).

---

## Chantier 5 · Musique en ligne et organisation

**La réalité des services de streaming**
- Spotify, Beatport, SoundCloud, Tidal et Apple Music ne s'ouvrent aux logiciels DJ qu'**avec un partenariat signé**. Spotify est revenu en 2025 dans rekordbox, Serato et djay, mais par accord commercial. Leur API publique ne donne pas accès au son.
- Pour Mixlab gratuit, on prépare l'architecture « sources de musique ». On commence par ce qui est autorisé :
  - **Fichiers locaux** (déjà fait).
  - **Import de playlists Spotify, Deezer et YouTube Music** (métadonnées seulement, par leurs API publiques). Mixlab retrouve les morceaux dans ta collection et liste ceux qui manquent, avec des liens d'achat (Bandcamp, Beatport).
  - **Bandcamp et Beatport** : dossier de téléchargements surveillé, import automatique des achats.
- Si Mixlab grandit : dossier de candidature aux programmes partenaires (Beatport/Beatsource Streaming, SoundCloud, Tidal).

---

## Chantier 6 · Moteur natif et qualité audio

1. Brancher le moteur Rust à l'interface : latence de 3 à 10 ms, casque sur une carte 4 canaux, ASIO.
2. Time-stretch de qualité studio pour le key lock (Signalsmith Stretch).
3. Stems (voir le chantier 2).
4. Enregistrement en WAV ou FLAC sans perte.

---

## Mes propositions en plus

1. **Planificateur de set** : une timeline pour préparer un mix à l'avance, morceau par morceau, avec la courbe d'énergie. On peut l'écouter, puis le jouer en vrai.
2. **Courbe d'énergie en direct** du set, avec des conseils (« ça fait 20 minutes au même niveau »).
3. **Défis et badges** : « 10 transitions à plus de 80/100 », « une transition en écho parfaite ». Avec une série de jours d'entraînement.
4. **Mode « à l'oreille »** pour progresser sans regarder l'écran.
5. **Partage du set** : tracklist et résumé du coach en une image ou un lien.
6. **Diffusion en direct** (Twitch, YouTube) depuis l'appli.
7. **Lumières DMX** synchronisées sur le tempo (soirées).
8. **Application compagnon** sur téléphone : télécommande et bibliothèque.
9. **Thèmes visuels** et taille d'interface réglable (accessibilité, écran tactile).

---

## Ordre de travail de la nuit (branche `nuit`)

1. Parcours « De zéro à ton premier set » : moteur de parcours, interface qui grandit, chapitres 1 à 14, sauvegarde et glossaire.
2. Analyse de structure, cues automatiques et auto-mix.
3. Bibliothèque : tags, notes, couleurs, crates intelligentes, import et export rekordbox XML, M3U, iTunes.
4. Performance : cues mémoire nommés, slicer, effets supplémentaires, suggestion du morceau suivant.
5. Import de playlists externes (métadonnées) et correspondance avec la collection.
6. Si le temps le permet : relecture des transitions, planificateur de set, défis.

Chaque étape est vérifiée par des tests (navigateur headless et Rust), poussée sur la branche `nuit` et visible dans la pull request.
