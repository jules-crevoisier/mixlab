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
