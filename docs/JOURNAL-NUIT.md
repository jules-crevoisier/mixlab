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
