# Journal de la nuit du 9 au 10 octobre 2026

Ce fichier raconte ce qui a été fait pendant la nuit, dans l'ordre, avec ce qui a été vérifié et ce qui reste à faire. Tout part sur la branche `nuit`. La version principale (`main`) reste installable.

## 00:00 · Point de départ

- Mixlab 0.3 est poussé sur GitHub. La CI est verte : les tests passent et les installeurs Windows (.exe et .msi), macOS (.dmg universel) et Linux (AppImage et .deb) sont fabriqués.
- La feuille de route est écrite ([ROADMAP.md](ROADMAP.md)), ainsi que l'inventaire de parité ([PARITE.md](PARITE.md)) : 334 fonctions des logiciels du marché, dont 93 déjà présentes, 49 en partie et 192 manquantes.

## 00:15 · Chantiers lancés en parallèle

Chaque chantier est développé à part, avec ses tests, puis assemblé sur `nuit`.

| Chantier | Contenu |
|---|---|
| Parcours débutant | 14 chapitres de zéro au premier set, interface qui se débloque, glossaire, progression sauvegardée |
| Structure et auto-mix | Sections des morceaux (intro, break, drop, outro), cues automatiques, énergie, auto-mix, suggestion du suivant |
| Bibliothèque pro | Notes, couleurs, tags, crates intelligentes, recherche par champ, import et export rekordbox XML, iTunes, M3U, playlists externes |
| Contrôleurs | Mapping v2 (Shift, 14 bits, encodeurs, soft-takeover), jog et scratch, assistant de mapping, horloge MIDI |
| Cues, pads, effets | Cues nommés et colorés, cues mémoire, boucles sauvegardées, slicer, pitch play, unités d'effets assignables, effet de voie, sampler perso |
| Critique produit | Tests de l'appli par trois profils (débutante, DJ résident, DJ mariages) et liste des défauts à corriger |

À suivre : l'Académie (construire un set, lire le public, trouver sa musique) et l'interface live (zoom, tailles de platine, bibliothèque plein écran, mode scène).

## 00:35 · Première critique produit

Un critique a utilisé l'appli comme trois profils : Léa, débutante ; Karim, DJ résident sur un portable 14 pouces ; Sophie, DJ mariages. Le rapport complet est dans [critiques/CRITIQUE-1.md](critiques/CRITIQUE-1.md).

**Ce qui doit être gardé** : le coach en direct et son bilan noté, les leçons qui vérifient l'état réel, l'en-tête de platine façon lecteur de club, les waveforms parallèles avec compteur de phrase, et la sobriété visuelle.

**Les principaux défauts** :
- sur un écran de portable, la bibliothèque est hors de l'écran ;
- l'interface fige avec 3 000 morceaux ;
- rien n'accueille un débutant ;
- les leçons ne montrent pas la commande à toucher ;
- pas d'auto-mix ;
- pas de navigation au clavier dans la bibliothèque ;
- les raccourcis ne marchent pas en AZERTY ;
- le texte est trop petit et pas assez contrasté.

Chaque défaut a été confié au chantier concerné.

Corrigé tout de suite :
- deux erreurs du coach : il proposait la platine qui venait de finir, et disait « fader encore bas » à tort ;
- le bandeau du coach, qui masquait les waveforms ;
- une erreur intermittente au démarrage.

## 00:45 · Assemblé : structure des morceaux, cues automatiques et auto-mix

- **Analyse de structure** : intro, couplet, break, montée, drop et outro, par phrases de 8 mesures, calculée en tâche de fond. Les bandes colorées apparaissent sur les waveforms, et une note d'énergie de 1 à 10 dans la bibliothèque.
- **Cues mémoire automatiques** : intro, drop, break et outro.
- **Suggestion du morceau suivant** : une note sur 100 (tonalité, tempo, énergie, déjà joué), avec les raisons.
- **Auto-mix** : une file d'attente et quatre styles (basses, filtre, écho, coupe), ou le mode Auto qui choisit selon les morceaux. Les transitions sont calées sur les phrases. Si tu touches une commande, l'auto-mix te laisse la main.
- **Vérifié** : 44 contrôles automatiques. Une transition auto-mix obtient 90/100 au coach : départ sur le 1, pas de basses superposées, calage à 1 ms.
- **Limites** : les phrases partent du premier temps de la grille. L'analyse est refaite à chaque import, elle n'est pas encore sauvegardée.

Lancé ensuite : l'interface live (zoom, tailles de platine, séparateurs, bibliothèque plein écran, mode scène, polices hors ligne, presets fidèles aux logiciels connus).

## 01:30 · Assemblé : bibliothèque pro

- **Grandes collections** : la table n'affiche que les lignes visibles. 5 000 morceaux se trient en une dizaine de millisecondes.
- **Infos éditables** : note, couleur, énergie, tags, commentaire et genre. Le choix des colonnes est mémorisé.
- **Recherche par champ** : `bpm:120-126 key:~8A rating:>=4 tag:peak`.
- **Crates intelligentes** : règles ET / OU sur BPM, tonalité, note, couleur, genre, tag, énergie, date d'ajout, joué ou non.
- **Clavier** : flèches, Entrée, Maj+← pour charger sur A, Maj+→ pour B, « / » pour chercher. Le double-clic ne remplace plus un morceau prêt sans demander.
- **Échanges** : import rekordbox XML (cues, grille, playlists), iTunes / Musique, M3U. Export rekordbox XML et M3U8. Les fichiers introuvables sont gardés et relocalisables.
- **Musique en ligne** : une playlist Spotify ou Deezer (liste ou CSV Exportify) est retrouvée dans ta collection. Les morceaux manquants ont des liens d'achat Bandcamp et Beatport.
- **Vérifié** : 72 contrôles.

## 01:45 · Assemblé : contrôleurs

- **Mappings complets** : encodeurs, potards 14 bits, calque Shift, rattrapage des potards, voyants, bascule de platine A/C et B/D.
- **Jog** : scratch quand on touche le plateau, pitch bend sinon.
- **Assistant de mapping guidé**, bibliothèque de mappings, détection du contrôleur au branchement, horloge MIDI en sortie.
- **Clavier** : les raccourcis marchent en AZERTY et se changent dans les réglages. Échap ferme les fenêtres.
- **Vérifié** : 58 contrôles.

## 02:00 · Assemblé : parcours « De zéro à ton premier set »

- **14 chapitres**, de la première note au premier set enregistré et noté par le coach.
- **L'interface grandit avec toi** : chaque chapitre débloque ses commandes. Un halo montre la commande à toucher.
- **Exercices à l'oreille** : taper le temps, repérer break et drop, avec waveforms et BPM cachés.
- **Accueil au premier lancement** : « jamais mixé », « déjà mixé » ou « je viens de Serato / rekordbox / Traktor / VirtualDJ ».
- **Un seul bouton Coach** regroupe le parcours, les leçons et les conseils en direct.
- **Vérifié** : 80 contrôles.

## 02:30 · Assemblé : cues, pads, effets et sampler

- **Hot cues** nommés et colorés, cues mémoire, boucles enregistrées. Tout est retrouvé à la relance.
- **Modes de pads** : Hot cue, Slicer, Boucles, Pitch play, Sampler.
- **Deux unités d'effets FX1 et FX2**, assignables à chaque platine ou au master, en simple ou en chaîne de 3. Démarrage calé sur le temps.
- **Effets de voie** (Filtre, Bruit, Espace…), modes d'EQ classique ou isolateur, limiteur sur le master.
- **Sampler perso** : tes propres sons sur les pads, gardés d'une session à l'autre.
- **Réglage de la plage d'analyse BPM** (60-120, 88-175…).
- **Corrigé à l'assemblage** : les leçons visent les nouvelles unités FX, et l'analyse de structure ne supprime plus les cues mémoire posés à la main.
- **Vérifié** : 25 contrôles. Les 7 suites de tests passent.

Lancé ensuite :
- l'Académie, avec les cours, les quiz et les exercices ;
- la lecture des tags (MP3, M4A, FLAC, pochettes), le cache d'analyse, l'historique gardé et les réglages d'effets gardés.

## 03:00 · Assemblé : l'Académie

L'Académie s'ouvre depuis le bouton Coach, juste sous le parcours débutant.

- **4 modules, 12 cours** : construire un set, lire le public, trouver sa musique, la scène. Chaque cours a ses points clés, un quiz avec explication à chaque réponse et un exercice. La progression est gardée.
- **Courbe d'énergie** : tu dessines la courbe de ton set, elle est comparée à un modèle (warm-up, peak time, closing, mariage, bar, anniversaire). Tu peux partir d'une playlist : chaque point est un morceau, et sa note d'énergie est enregistrée dans la bibliothèque.
- **Assistant de plan de set** : choisis un modèle et une durée, il remplit des créneaux de 5 minutes avec tes morceaux (énergie, BPM, tonalité compatible). Les trous sont marqués « À trouver ». Le plan s'enregistre en playlist.
- **Lire la salle** : trois situations (club à 1 h, mariage à 23 h, bar à 21 h). Tu choisis le morceau suivant et la piste réagit.
- **Ranger ses morceaux** : créer une crate intelligente et taguer ses morceaux par moment du set.
- **Glossaire** de 65 mots, avec recherche. Les mots en gras des cours ouvrent leur définition.
- **Vérifié** : les 8 suites de tests passent.

## 03:30 · Assemblé : tags, pochettes, cache d'analyse et historique

- **Tags lus à l'import** : MP3 (ID3), M4A, FLAC et Ogg. Titre, artiste, album, genre, année, commentaire, BPM, tonalité et pochette. Un tag ne remplace jamais une info que tu as modifiée.
- **Pochettes** dans la bibliothèque et sur la platine.
- **Analyse gardée** : BPM, grille, tonalité, waveform et structure sont mémorisés. Réimporter un morceau ou relancer l'appli ne relance plus l'analyse.
- **Historique** : les sets précédents restent dans la barre latérale, classés par date, exportables en texte, CSV et M3U8.
- **Effets gardés** : les réglages des unités FX sont retrouvés au lancement.
- **Fiabilisé** : un test des effets comparait deux passages différents du morceau ; il mesure maintenant au même endroit.
- **Vérifié** : les 9 suites de tests passent. L'inventaire de parité compte maintenant 100 fonctions faites sur 338.

## 04:00 · Assemblé : platines et mixer pro

- **Modes de cue** CDJ, Denon et Numark, et Cue Play.
- **Pitch** : sens du fader au choix, transposition fine en cents, accord automatique sur la platine maître, correction manuelle de la tonalité.
- **Instant doubles** : copie d'une platine sur une autre (morceau, position, tempo, boucle).
- **Pré-écoute dans la bibliothèque**, au casque, sans toucher aux platines.
- **Chargement automatique** du morceau suivant à la fin d'une platine.
- **Courbes** des faders et du crossfader, inversion (hamster), résonance du filtre, balance du master.
- **Grille verrouillée** par morceau, métronome au casque, sync à la mesure ou à la phrase, décompte jusqu'au prochain cue.
- **Enregistrement WAV** 16 ou 24 bits, enregistré par la fenêtre native dans l'appli.
- **Inventaire de parité revérifié ligne par ligne** : 176 fonctions faites sur 335 (53 %), 53 partielles, 106 manquantes. Les plus gros manques : stems, mappings validés sur de vrais contrôleurs, moteur audio natif.
- **Vérifié** : les 10 suites de tests passent, et les tests Rust aussi.

## 04:45 · Assemblé : interface live pour portable

- **Tout tient à l'écran** en 1280×800, 1366×768 et 1600×950, avec 2 ou 4 platines, dans les 5 presets, sans défilement. Les platines choisissent leur taille (grande, compacte, mini) selon la place.
- **Séparateurs** entre waveforms, platines et bibliothèque : on les glisse, chaque preset garde ses tailles, double-clic pour revenir par défaut.
- **Taille de chaque platine** : clic sur son en-tête.
- **Bibliothèque plein écran** : Tab ou le bouton Biblio, Échap pour revenir.
- **Zoom de l'interface** (Ctrl + / Ctrl −) qui reste net, zoom des waveforms (Ctrl + molette).
- **Mode scène** : textes plus gros et plus contrastés, BPM et temps restant agrandis, pour une cabine sombre.
- **Plein écran** dans l'appli.
- **Polices embarquées** : plus aucun appel à Internet au lancement.
- **Contraste** relevé partout (au moins 5,4:1 pour les étiquettes).
- **Presets plus proches des logiciels connus** : panneau Préparation (grande platine et liste) façon Export, barre latérale en Mix, compteur de temps et de phrase.
- **Plus fluide** : les waveforms sont dessinées par tuiles réutilisées. Le temps de calcul par image passe d'environ 6 ms à 4 ms avec 4 platines.
- **Vérifié** : les 11 suites de tests passent ensemble.

## 05:00 · Deuxième critique produit, et corrections

La critique complète est dans `docs/critiques/CRITIQUE-2.md`, avec 33 captures. Sur les 20 points de la première critique, 12 sont corrigés, 7 en partie, 1 pas encore (la latence audio).

Corrigé dans la foulée :
- **Menu Affichage** : il était rogné par la barre du haut et invisible. Il s'ouvre maintenant partout. Ce qui ne tient pas dans la barre passe dans un menu « ⋯ ».
- **Preset Performance en 1366×768** : pads, boucle et pitch restent accessibles.
- **Mode scène** : bouton toujours visible et touche F9. Waveforms plus hautes, temps restant en gros.
- **Temps restant** jamais masqué sur les platines compactes.
- **Bulle du coach** : elle ne couvre plus la bibliothèque, et disparaît quand le panneau du coach est ouvert.
- **Bibliothèque** : colonnes adaptées à la largeur, bouton Charger toujours visible, ligne sélectionnée bien marquée, menu clic droit plus complet (file auto-mix, pré-écoute, retirer de la playlist, analyser à nouveau).
- **Clavier** : Tab sert de nouveau à la navigation. La bibliothèque plein écran passe sur F2.
- **Académie en mode lecture** : une vraie colonne de lecture au lieu du panneau étroit.
- **Parcours débutant** : au chapitre 1, seuls Play A, le fader A et le master sont visibles. Les commandes avancées sont masquées jusqu'aux chapitres qui les enseignent.
- **Cues et rekordbox** : les noms et couleurs des hot cues, les cues mémoire et les boucles passent maintenant dans les deux sens avec rekordbox, et survivent au rechargement dans la version navigateur.
- **Fichiers Opus** acceptés à l'import.
- **Clavier hors Chromium** : choix AZERTY, QWERTY ou QWERTZ quand le système ne donne pas la disposition.
- **Tests fiabilisés** : le test de mise en page effaçait parfois lui-même les réglages qu'il vérifiait après rechargement.

Lancé ensuite : la refonte du style visuel, d'après la direction donnée par la critique.

## 06:00 · Nouveau style visuel

Avant et après, en captures : `docs/design/avant/` et `docs/design/apres/`. Les règles sont dans `docs/design/STYLE.md`.

- **Hiérarchie** : seul ce qui compte en live s'allume. La couleur de chaque platine ne sert plus qu'à la repérer (pastille, bord, tête de lecture, états actifs). Le violet est réservé au coach. CUE reste neutre au repos.
- **Textes** : une échelle 11/13/16/24/32, plus rien sous 11 px, boutons en casse normale.
- **Waveforms** : trois bandes adoucies (graves bleus, médiums ambrés, aigus presque blancs), la partie jouée désaturée, tête de lecture blanche.
- **Mixer** : vrais potards de 28 à 32 px avec anneau, kill sur l'étiquette de l'EQ, faders gradués beaucoup plus longs, VU-mètres à segments, réglages rares rangés dans un menu.
- **Platines** : pads de 40 px, bouton « Pro » qui replie Slip, Rev, Censor et la grille.
- **Effets** : potards nommés, durée en boutons segmentés, ON à la couleur de la platine, rangée repliable.
- **Fluidité** : le calcul d'une image passe de 5,5 ms à 2,2 ms avec 4 platines. Les platines à l'arrêt ne sont plus redessinées, et l'appli ralentit à 30 images par seconde quand elle n'est pas au premier plan.
- **Reste à faire** : encore trop de commandes visibles (environ 130 à 1366 px au lieu de 110 visés), et l'École est à l'étroit à côté du panneau du coach.


## Matin du 10 octobre · Finitions en parallèle

Neuf chantiers menés en même temps, chacun dans sa branche, fusionnés dans `finitions` (suite complète : 21 fichiers de test).

- **Style** : audit des traits qui font « généré » (`docs/design/AUDIT-STYLE-IA.md`), gris mats, icônes dessinées, potards et faders retravaillés, textes sobres. Captures avant et après dans `docs/design/v2/`.
- **Préférences** : une seule fenêtre (Ctrl+,) pour tout, y compris le logiciel d'origine et le niveau, modifiables à tout moment.
- **Stems** : séparation rapide en voix, batterie, basse et mélodie, lecture des fichiers .stem.mp4, mute, a cappella, pads de stems, écho out.
- **Pads, sampler, boucles** : 16 hot cues, séquences de cues, Pad FX, 32 sons de sampler, séquenceur 16 pas, looper.
- **Grille, analyse, bibliothèque** : grille dynamique, horloge maître, LUFS, playlists imbriquées, import Serato et Traktor, dossiers surveillés.
- **Entrées, sorties, mixer, effets** : micro et talkover, sorties séparées, booth, EQ 4 bandes, maximiseur, nouveaux effets, cue sheet.
- **Diffusion, vidéo, paroles** : Icecast, titre en cours et page OBS, vidéo sur les platines, paroles synchronisées, karaoké, horloge MIDI, OSC, Link.
- **Planificateur de set** : timeline avec automations, rendu WAV hors ligne, Mix Point Link, requête en français.
- **Mappings** : six contrôleurs Pioneer et Hercules, détection automatique, écran « Tester ma table ». Non vérifiés sur le matériel.

Deux vrais défauts trouvés à la fusion : le bouton ⋯ de la barre du haut restait visible à vide au chapitre 1, et deux tests dépendaient de la vitesse de la machine.
