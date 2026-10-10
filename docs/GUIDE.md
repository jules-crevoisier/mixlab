# Guide de Mixlab

Mixlab est un logiciel DJ gratuit pour Windows, macOS et Linux. Il a 2 ou 4 platines, un mixer, des effets, une bibliothèque et un professeur intégré. Ce guide explique tout, bouton par bouton. Les noms entre guillemets ou en gras sont ceux que tu vois à l'écran.

Version décrite : 0.3, branche `nuit` du 10 octobre 2026.

## Sommaire

1. [Installer](#installer)
2. [Premier lancement](#premier-lancement)
3. [L'écran](#lécran)
4. [La bibliothèque](#la-bibliothèque)
5. [Les platines](#les-platines)
6. [Mixer et effets](#mixer-et-effets)
7. [Le sampler](#le-sampler)
8. [Enregistrer ton mix](#enregistrer-ton-mix)
9. [Contrôleurs MIDI](#contrôleurs-midi)
10. [Le clavier](#le-clavier)
11. [Le coach en direct](#le-coach-en-direct)
12. [Le parcours débutant](#le-parcours-débutant)
13. [L'Académie](#lacadémie)
14. [L'auto-mix](#lauto-mix)
15. [Réglages](#réglages)
16. [Dépannage](#dépannage)

---

## Installer

### Où trouver l'installeur

Les installeurs sont fabriqués automatiquement sur GitHub, dans le dépôt `jules-crevoisier/mixlab`.

- **Releases** : quand une version est publiée (tag `v0.3.0` par exemple), les installeurs sont joints à la release. C'est le plus simple.
- **Actions** : à chaque envoi sur `main` (et pour chaque pull request), le workflow « Appli Mixlab » fabrique les installeurs. Ouvre la dernière exécution verte, descends jusqu'à « Artifacts » et télécharge celui de ton système. Il faut être connecté à GitHub. Le fichier arrive dans un `.zip` : décompresse-le d'abord.

| Système | Artifact | Fichier |
|---|---|---|
| Windows 10 et 11 | `mixlab-windows-latest` | `.exe` (installeur classique) ou `.msi` |
| macOS 11 ou plus récent | `mixlab-macos-latest` | `.dmg` universel (Intel et Apple Silicon) |
| Linux | `mixlab-ubuntu-22.04` | `.AppImage` ou `.deb` |

L'installeur pèse une dizaine de Mo.

### Windows

Lance le `.exe` ou le `.msi`. Les installeurs ne sont pas encore signés, donc Windows SmartScreen affiche « Windows a protégé votre ordinateur ».

1. Clique sur **Informations complémentaires**.
2. Clique sur **Exécuter quand même**.

### macOS

Ouvre le `.dmg` et glisse Mixlab dans le dossier Applications. L'appli n'est pas signée par Apple, donc le premier lancement est bloqué.

1. Dans le Finder, fais un clic droit (ou Ctrl + clic) sur Mixlab, puis **Ouvrir**, puis encore **Ouvrir**.
2. Si macOS refuse quand même (c'est le cas sur les versions récentes) : ouvre **Réglages Système › Confidentialité et sécurité**, descends jusqu'au message sur Mixlab et clique sur **Ouvrir quand même**.
3. En dernier recours, dans le Terminal : `xattr -dr com.apple.quarantine /Applications/Mixlab.app`

Il ne faut le faire qu'une fois.

### Linux

- **AppImage** : rends le fichier exécutable (`chmod +x Mixlab_*.AppImage`), puis lance-le.
- **.deb** (Debian, Ubuntu, Mint) : `sudo apt install ./mixlab_*.deb`

### Sans installer : dans le navigateur

Mixlab tourne aussi dans Chrome ou Edge. Ouvre `app/index.html`, ou lance `npm run web` et va sur `http://localhost:8080`. Dans le navigateur, le son des morceaux n'est pas gardé d'une session à l'autre (seules leurs infos le sont), et le MIDI ne marche que dans Chrome et Edge.

---

## Premier lancement

Au premier lancement, Mixlab charge quatre morceaux de démo (« Néons », « Quai 9 », « Halogène », « Ligne 7 ») et te demande : **Tu as déjà mixé ?**

- **Je n'ai jamais mixé** : le parcours débutant démarre. L'interface s'ouvre petit à petit, chapitre par chapitre. Voir [Le parcours débutant](#le-parcours-débutant).
- **Je sais déjà mixer** : tu as l'interface complète tout de suite.
- **Je mixe déjà sur** : choisis ton logiciel, Mixlab prend la disposition la plus proche.
  - **Serato** : disposition Performance.
  - **rekordbox** : disposition Préparation.
  - **Traktor** : disposition Studio.
  - **VirtualDJ** : disposition Mix.

Ton choix devient ton profil : disposition et niveau du coach. Il se change à tout moment dans **Préférences › Profil**, qui peut aussi te remontrer cet écran. Échap ferme cette fenêtre sans rien changer. Le parcours reste toujours disponible avec le bouton **Parcours**, en haut.

Le son ne démarre qu'après un premier clic ou une première touche. Tant que le son n'est pas actif, la barre du haut affiche « Clique n'importe où pour activer le son ».

---

## L'écran

### La barre du haut

De gauche à droite :

| Élément | Rôle |
|---|---|
| **Performance, Préparation, Studio, Mix, École** | Les cinq dispositions (presets). |
| **2 platines / 4 platines** | Nombre de platines à l'écran. |
| **Affichage** | Menu : panneaux, zoom, taille des platines, waveforms, mode scène, et **Préférences…**. |
| **Quantize** | Les cues, hot cues, boucles et effets se calent sur le temps. |
| **Gain auto** | Égalise le volume des morceaux au chargement. |
| **MASTER** | Le BPM de la platine maître (rien ne s'affiche tant qu'aucune platine ne donne le tempo). |
| **Biblio** | Bibliothèque plein écran (touche F2). |
| **REC** | Enregistre le mix. Affiche la durée pendant l'enregistrement. |
| **Audio** | Cartes son : ouvre **Préférences › Audio**. |
| **Contrôleur** | MIDI, mappings, horloge. Le point s'allume quand une table est branchée. |
| **Auto-mix** | Le panneau de l'auto-mix. |
| **Parcours** | Le parcours « De zéro à ton premier set ». |
| **Coach** | Le panneau du coach : conseils en direct, leçons, Académie. Le point s'allume quand les conseils en direct sont actifs. |
| **Préférences** | Tous les réglages (Ctrl+,). Voir [Réglages](#réglages). |
| L'heure, puis **◐** | Mode scène (touche F9). |
| **⛶** | Plein écran. |
| **⋯** | Apparaît quand la fenêtre est trop étroite : les boutons qui ne tiennent plus dans la barre (Gain auto, Quantize, Audio, Contrôleur…) s'y rangent, au lieu d'être coupés. |

### Les dispositions (presets)

Chaque disposition reprend l'organisation d'une famille de logiciels connus.

- **Performance** : waveforms parallèles sur toute la largeur, grandes platines, petit mixer, grande bibliothèque. Pensée pour jouer sur une table.
- **Préparation** : un grand lecteur avec la structure, la liste des cues, l'éditeur de grille et la bibliothèque en grand. Pas de mixer ni d'effets. Clique sur l'en-tête d'une petite platine pour la mettre dans le grand lecteur. Le panneau **Préparation** à droite regroupe la **Grille** (Tap, ½, ×2, ◁ 10 ms, 10 ms ▷, **Poser le 1**), les **Hot cues** (**Poser ici**, aller au cue, **×** pour effacer), les **Cues mémoire** et la **Structure** du morceau.
- **Studio** : effets en haut, A et C à gauche, B et D à droite, mixer complet au centre, une waveform par platine. Dense.
- **Mix** : waveforms parallèles avec compteur de temps et de phrase, grandes platines, mixer au centre, panneau latéral à onglets (**File et auto-mix**, **Historique**).
- **École** : la disposition Mix en plus simple, avec le coach à droite. C'est la disposition par défaut.

### Le menu Affichage

- **Panneaux** : cases à cocher **Effets**, **Waveforms**, **Mixer**, **Bibliothèque**.
- **Zoom de l'interface** : **−**, **100 %**, **+**. De 80 à 150 %.
- **Platines (clic sur l'en-tête)** : **Auto**, **Complètes**, **Compactes** ou **Mini**.
- **Waveforms : hauteur et zoom** : **−** et **+** pour la hauteur, **Zoom −** et **Zoom +** pour voir plus ou moins de temps.
- **Mode scène** : case à cocher (ou touche F9).
- **Bibliothèque plein écran** et **Plein écran**.
- **Disposition par défaut** : remet les séparateurs et la taille des platines de ce preset.
- **Préférences…** : la fenêtre de tous les réglages, ouverte sur l'onglet Affichage. Les couleurs des waveforms et la plage d'analyse BPM s'y trouvent.

### Séparateurs

Entre les waveforms et les platines, et entre les platines et la bibliothèque, une fine barre se glisse à la souris. Chaque preset garde ses propres tailles. Double-clic sur un séparateur : retour à la taille par défaut. Au clavier, sélectionne-le puis utilise ↑ et ↓.

### Taille des platines

Rien ne défile : Mixlab répartit la hauteur entre waveforms, platines et bibliothèque. Les platines choisissent seules leur taille (complète, compacte, mini) selon la place. Tu peux forcer :

- **un clic sur l'en-tête d'une platine** (la zone avec la lettre et le titre) passe à la taille suivante ;
- ou le menu **Affichage › Platines**.

S'il n'y a pas assez de hauteur, un message le dit : réduis la bibliothèque ou le zoom.

### Mode scène

Bouton **◐** en haut à droite, touche **F9**, ou **Affichage › Mode scène**. Contraste renforcé, textes d'au moins 11 px, waveforms 40 % plus hautes, temps restant en très gros (32 px), potards plus grands, rangée d'effets repliée sur une ligne. Pour une cabine sombre.

### Zoom

- **Interface** : Ctrl + et Ctrl − (Cmd sur Mac), Ctrl 0 pour revenir à 100 %. Le texte reste net.
- **Waveforms** : Ctrl + molette sur une waveform, ou les petits boutons **−** et **+** sur la waveform.

### Plein écran

Bouton **⛶** en haut à droite, ou **Affichage › Plein écran**. Dans le navigateur, si ça ne marche pas, essaie F11.

---

## La bibliothèque

### La barre de la bibliothèque

- **Rechercher (/ ou Ctrl+F)** : la recherche.
- **Compatibles** : ne montre que les morceaux compatibles (tonalité et tempo) avec la platine maître.
- **Ajouter à…** : ajoute le morceau sélectionné à une playlist.
- **Importer** (navigateur) ou **Fichiers** et **Dossier** (appli) : ajoute des morceaux.
- **Infos** : modifie les infos du morceau sélectionné.
- **Colonnes** : choisis les colonnes affichées.
- **Import / export** : rekordbox, iTunes, M3U, playlists Spotify ou Deezer.
- **▶ Pré-écoute** : écoute au casque le morceau sélectionné.

### Importer des morceaux

- Dans l'appli : **Fichiers** pour des morceaux, **Dossier** pour un dossier entier (sous-dossiers compris).
- Dans le navigateur : **Importer**.
- Partout : glisse des fichiers depuis l'explorateur sur la fenêtre, ou directement sur une platine pour les charger dessus.

Formats : MP3, WAV, AIFF, FLAC, OGG, M4A, AAC.

À l'import, Mixlab lit les tags (titre, artiste, album, genre, année, commentaire, BPM, tonalité, pochette) puis analyse le BPM, la grille, la tonalité, la waveform et la structure. L'analyse est gardée : un morceau déjà analysé ne l'est pas une deuxième fois.

Dans l'appli, préfère **Fichiers** ou **Dossier** : un morceau glissé depuis l'explorateur est bien lu, mais il n'est pas gardé au prochain lancement (voir [Dépannage](#dépannage)).

### La table

- Clic : sélectionne un morceau.
- Double-clic ou Entrée : charge le morceau sur une platine libre. Si toutes sont occupées, Mixlab demande laquelle remplacer. Il ne remplace jamais une platine « à l'antenne » (qui joue avec son fader ouvert).
- Colonne **Charger** : un bouton par platine (A, B, C, D).
- Glisse une ligne sur une platine pour la charger, ou sur une playlist pour l'y ajouter.
- Clic sur un titre de colonne : tri. Un deuxième clic inverse le tri.
- En vert : BPM et tonalité compatibles avec la platine maître.
- La table reste fluide même avec plusieurs milliers de morceaux.

Colonnes disponibles : #, Titre, Artiste, BPM, Tonalité, Durée, Genre, Joué, Note, Couleur, Énergie, Tags, Commentaire, Dernière lecture, Charger. Commentaire et Dernière lecture sont masqués au départ.

### Infos, notes, couleurs et tags

- Clique une étoile dans la colonne **Note** pour noter de 1 à 5. Le même clic enlève la note.
- Clic droit sur une ligne, puis **Modifier les infos…** (ou le bouton **Infos**) : titre, artiste, genre, note, couleur, énergie (1 calme, 10 à fond, ou **Auto** pour revenir à l'estimation), tags séparés par des virgules, commentaire.
- Le clic droit propose aussi : **Charger sur la platine A/B/C/D**, **Ajouter à la file auto-mix**, **Pré-écouter au casque**, **Ajouter à « … »**, dans une playlist **Monter**, **Descendre**, **Retirer de la playlist « … »**, et **Analyser à nouveau** (BPM, grille, tonalité, waveform ; impossible quand la grille est verrouillée).
- La ligne sélectionnée (souris ou flèches) est bordée d'un liseré bleu de 3 px.
- Les colonnes s'adaptent à la largeur du tableau : sous 1 300 px, **Couleur** et **Tags** sont masquées (la couleur devient un liseré au bout de la ligne) ; sous 1 100 px, **Joué** et **Genre** aussi. **Charger** reste toujours visible. Une colonne que tu coches dans **Colonnes** reste affichée.

### Recherche par champ

Tape des mots libres (dans n'importe quel ordre), ou des champs :

| Exemple | Ce qu'il trouve |
|---|---|
| `bpm:120-126` | BPM entre 120 et 126 |
| `bpm:124` | BPM arrondi à 124 |
| `key:8A` | tonalité 8A exactement (aussi `key:Am`, `key:1m` façon Open Key) |
| `key:~8A` | tonalités compatibles avec 8A |
| `rating:>=4` | 4 étoiles ou plus (`>`, `<`, `<=`, `=` marchent aussi) |
| `tag:peak` | tag qui contient « peak » |
| `genre:house` | genre qui contient « house » |
| `energie:>=7` | énergie de 7 ou plus |
| `couleur:rouge` | couleur rouge |
| `artiste:`, `titre:`, `commentaire:`, `joue:` | les autres champs |

Les mots français marchent aussi : `tonalite:`, `note:`, `etoiles:`, `energie:`, `couleur:`.

### Playlists

La barre latérale a trois playlists de départ : **Préparation**, **Warm-up**, **Peak time**. **+ Nouvelle playlist** en crée une. Glisse des morceaux dessus pour les ajouter. Double-clic sur une playlist pour la renommer. Clic droit : **Renommer…**, **Monter**, **Descendre**, **Exporter en M3U8**, **Vider**, **Supprimer…**.

Dans une playlist triée par ordre d'ajout, glisse une ligne sur une autre pour changer l'ordre.

### Crates intelligentes

Une crate se remplit toute seule avec les morceaux qui respectent ses règles, même ceux importés plus tard.

1. **+ Nouvelle crate**.
2. Donne un nom, choisis **toutes les règles (ET)** ou **au moins une règle (OU)**.
3. Ajoute des règles avec **+ Règle** : **BPM entre**, **Tonalité** (est, compatible avec, compatible avec la platine maître), **Note au moins**, **Couleur**, **Genre contient**, **Tag**, **Énergie entre**, **Ajouté il y a moins de** (jours), **Déjà joué**.
4. **Enregistrer**.

Clic droit sur une crate pour la modifier ou la supprimer.

### Outils

- **Doublons** : les morceaux présents deux fois (même fichier, ou même artiste et titre).
- **Fichiers manquants** : les morceaux dont le fichier a bougé. Voir [Dépannage](#dépannage).

### Import et export (rekordbox, iTunes, M3U)

Bouton **Import / export**.

**Importer une collection** : **Choisir un fichier…**
- rekordbox : dans rekordbox, Fichier › Exporter la collection au format xml.
- iTunes ou Musique : Fichier › Bibliothèque › Exporter la bibliothèque.
- Une playlist M3U ou M3U8.

Mixlab reprend les notes, couleurs, cues, grilles et playlists. Dans l'appli, les morceaux sont importés directement. Les fichiers introuvables vont dans **Fichiers manquants** (bouton **Relocaliser les introuvables…**). Dans le navigateur, Mixlab ne peut pas ouvrir les fichiers listés : il reprend seulement les infos des morceaux déjà importés (même nom de fichier, ou même artiste et titre).

**Exporter** :
- **Collection en rekordbox XML** : toute ta collection avec BPM, tonalité, note, couleur, cues, grille et playlists (les crates deviennent des playlists). Dans rekordbox : Préférences › Avancé › Base de données › rekordbox xml, puis exporte sur ta clé USB.
- **M3U8** : choisis une playlist, une crate ou la vue affichée.

### Playlists Spotify, Deezer…

**Import / export › Retrouver une playlist…**

Mixlab ne se connecte pas à Spotify ni à Deezer. Il compare une liste à ta collection.

1. Colle une liste « Artiste - Titre », ou **Ouvrir un CSV…** (Exportify pour Spotify, TuneMyMusic ou Soundiiz pour Deezer, YouTube Music, Apple Music).
2. **Chercher dans ma collection**. Les accents, les « feat. », les versions et les remixes sont pris en compte.
3. **Créer la playlist** avec les morceaux trouvés.

Pour les morceaux absents, Mixlab donne des liens de recherche **Bandcamp** et **Beatport**. Les liens seuls (URL Spotify) ne suffisent pas : exporte la playlist en CSV.

### Historique

Un morceau entre dans l'historique après 30 secondes de lecture.

- **Ce set** : le set en cours.
- En dessous, les sets précédents, classés par date.
- **Exporter la tracklist** : chaque set en **Texte**, **CSV** ou **M3U**. Pratique pour Mixcloud, YouTube ou un client.

### Pré-écoute

Sélectionne un morceau, puis **▶ Pré-écoute** dans la barre de la bibliothèque (ou clic droit, **Pré-écouter au casque**). Le morceau joue au casque seulement, sans toucher aux platines. Une petite waveform apparaît alors à côté du bouton : clique ou glisse dessus pour te déplacer. Si tu sélectionnes un autre morceau pendant la pré-écoute, elle passe au nouveau.

Il faut une sortie casque séparée : bouton **Split** du mixer, ou sortie casque dans **Audio**.

---

## Les platines

### Ce que tu vois

- **L'en-tête** : la lettre de la platine, le titre, l'artiste, **Restant** (temps restant, en rouge sous 30 s), **Tonalité** (en vert si compatible avec la platine maître) et **BPM**.
- **La vue d'ensemble** : tout le morceau, avec les sections en couleur. Clique pour te déplacer.
- **La waveform** : glisse pour te déplacer. En lecture, glisser freine ou pousse.
- **La platine (jog)** : en lecture elle freine ou pousse, à l'arrêt elle déplace la tête de lecture.
- **Le pitch** à droite, avec sa plage (**±8**, **±16**, **±50**) et les boutons de nudge **‹** et **›**.

Les sections détectées ont une couleur : Intro bleu, Couplet gris, Break violet, Montée jaune, Drop rouge, Outro turquoise. Survole la waveform pour lire leur nom.

Sur les waveforms parallèles, chaque ligne affiche le titre, le BPM, la tonalité, la position (mesure.temps et phrase P1, P2…), SYNC et MASTER.

### Lecture, cue et cue play

- **▶ (Play)** : lecture et pause.
- **Cue** : à l'arrêt, pose le point de départ. En lecture, y revient. Maintiens-le pour pré-écouter.
- **CUP (Cue Play)** : revient au cue et lance la lecture. Appuie plusieurs fois pour bégayer.

Le comportement du bouton Cue se règle dans **Préférences › Platines** :
- **CDJ** (par défaut) : en lecture, retour au cue et arrêt. Maintenu sur le cue, il pré-écoute ; appuie sur Play pendant ce temps pour continuer.
- **Denon** : à l'arrêt, pose le cue là où tu es. Pas de pré-écoute en maintenant.
- **Numark** : revient toujours au cue et s'arrête. Le cue se pose quand tu appuies sur Play.

### Hot cues

Les 8 pads, onglet **Hot cue** :
- un clic pose le repère, le suivant y saute ;
- Maj + clic efface ;
- clic droit (ou appui long sur écran tactile) : **Nom** (Drop, Voix…), couleur, **Déplacer ici**, **Effacer**.

Avec Quantize, le repère se cale sur le temps le plus proche. Les hot cues apparaissent sur la waveform, la vue d'ensemble et la platine.

### Cues mémoire et boucles gardées

Le bouton **☰** à droite des onglets de pads ouvre la liste du morceau :
- **Cues mémoire** : **+ Cue ici** pose un repère sans prendre de pad. Nom, couleur, aller au cue, supprimer.
- **Boucles gardées** : **+ Garder la boucle** garde la boucle en cours. Nom, rappel, suppression.

L'analyse de structure pose aussi des cues mémoire automatiques (intro, drop, break, outro).

### Les modes de pads

| Onglet | Ce que font les 8 pads |
|---|---|
| **Hot cue** | Repères (voir plus haut). |
| **Roll** | Maintiens pour répéter 1/16 à 8 temps. Le morceau reprend là où il en serait. |
| **Saut** | Avance ou recule de 1, 4, 8 ou 16 temps. |
| **Slicer** | Les 8 temps en cours, découpés en 8 tranches. Maintiens un pad pour rejouer sa tranche. |
| **Boucles** | Un pad rappelle sa boucle gardée. Pad vide pendant une boucle : il la garde. Clic droit : supprimer. |
| **Pitch** | Rejoue le dernier hot cue utilisé, transposé de −5 à +5 demi-tons. |
| **Sampler** | Les 8 sons du sampler. Voir [Le sampler](#le-sampler). |

Sur une platine compacte, les onglets défilent à la molette.

### Boucles et saut

La rangée sous les pads :
- **In** et **Out** : boucle manuelle. Out la lance.
- **Reloop** : relance la dernière boucle, ou en sort.
- **½** et **×2** : divise ou double la boucle. Le chiffre entre les deux est la taille.
- **Loop** : boucle automatique de la taille affichée.
- **Saut ◀ et ▶** : recule ou avance du nombre de temps affiché. Clique le chiffre pour changer la taille du saut (1 à 32).

### Grille

- **Tap** : tape le tempo (4 fois ou plus).
- **BPM ½** et **BPM ×2**.
- **◁** et **▷** : décale la grille de 10 ms.
- **1 ici** : la position actuelle devient le premier temps d'une phrase.
- **Verrou** : verrouille le BPM et la grille de ce morceau, pour ne plus les modifier par erreur.
- **Métro** : un métronome au casque, calé sur la grille. Pour vérifier qu'elle tombe juste.

Le compteur à droite de cette rangée montre, en mesures.temps, le temps qui reste jusqu'au prochain cue ou à la fin de la phrase. Il passe en orange dans les 4 derniers temps.

### Tempo, sync et master

- **Pitch** : par défaut, en haut plus lent, en bas plus rapide (réglable dans **Préférences › Platines › Sens du pitch**). Double-clic : retour à 0.
- **‹ et ›** (nudge) : maintiens pour freiner ou pousser un instant.
- **Sync** : cale le tempo et la phase sur la platine maître. Dans **Préférences › Platines**, choisis si Sync se cale sur **le temps**, **la mesure (4 temps)** ou **la phrase (8 mesures)**.
- **Master** : les autres platines en Sync suivent celle-ci.

### Tonalité : key lock, transposition, key sync

- **Key lock** : garde la tonalité quand tu changes le tempo.
- **− 0 +** à côté de Key lock : transpose d'un demi-ton (jusqu'à ±6).
- **ct − 0 +** : ton fin, par pas de 5 cents. Double-clic sur la valeur : 0.
- **Key sync** : accorde la tonalité sur la platine maître (même tonalité ou compatible, le plus petit écart possible).
- **Clic sur la tonalité dans l'en-tête** : corrige la tonalité du morceau si l'analyse s'est trompée. **Revenir à la tonalité d'origine** annule.

### Slip, reverse, censor

- **Slip** : après une boucle, un roll, un slicer ou un hot cue maintenu, le morceau reprend là où il en serait.
- **Rev** : lecture à l'envers.
- **Censor** : maintiens pour lire à l'envers, puis reprendre là où le morceau en serait.

### Instant double

**Doubler** charge sur cette platine le morceau d'une autre (la platine maître, sinon la voisine), à la même position, au même tempo, boucle comprise. Pas possible si la platine est à l'antenne.

### Chargement automatique

Dans **Préférences › Platines**, coche **Charger le morceau suivant à la fin** : quand un morceau se termine, la platine charge le suivant (la file de l'auto-mix, sinon la liste affichée).

---

## Mixer et effets

### Une voie du mixer

De haut en bas :
- **GAIN** : règle-le pour que le VU-mètre reste sous le rouge.
- **HI**, **MID**, **LOW** : l'EQ 3 bandes, chacun avec son bouton **kill** qui coupe la bande.
- **FILTRE** : à gauche passe-bas (étouffé), à droite passe-haut (aminci). Son nom change selon l'effet de voie choisi.
- **Cue** : écoute de la voie au casque.
- Le VU-mètre et le **fader de voie**.
- **A · B** : côté du crossfader (A, milieu non affecté, B).

Les potards : glisse vers le haut ou le bas, molette, flèches du clavier quand ils sont sélectionnés. Maj + glisser pour un réglage fin. Double-clic : retour au centre.

### La section MASTER

- **MASTER** : volume général, avec son VU-mètre stéréo.
- **LIM** : le limiteur du master. Il s'allume quand il réduit le volume pour éviter la saturation. S'il reste allumé, baisse les gains.
- **MIX** : casque, à gauche le cue seul, à droite le master.
- **CASQUE** : volume du casque.
- **Split** : casque à gauche, master à droite, sur une seule carte son (avec un câble répartiteur).
- **SAMPLER** : volume du sampler.
- **Effet de voie** : ce que fait le potard FILTRE de chaque voie : **Filtre**, **Écho**, **Bruit** ou **Espace**.
- **Mode d'EQ** : **EQ iso** (isolateur, les potards coupent complètement la bande) ou **EQ classique** (plancher à −26 dB, comme un mixer de club).

### Crossfader

En bas du mixer. Double-clic : centre. La liste à droite choisit la courbe : **Mix** (les deux à fond au centre), **Douce** (fondu long), **Cut** (coupe nette pour le scratch) ou **Réglable** (la forme se règle dans **Préférences › Mixer**).

### Courbes et réglages du mixer

Dans **Préférences › Mixer** :
- **Faders de voie** : **Douce (lente au début)**, **Progressive**, **Linéaire**, **Rapide (forte tout de suite)**.
- **Crossfader** et sa forme quand il est **Réglable**.
- **Crossfader inversé (hamster)**.
- **Résonance du filtre** : plus elle est haute, plus le filtre siffle.
- **Balance du master**. Double-clic : centre.
- **Limiteur** du master, allumé par défaut.

### Les unités d'effets FX1 et FX2

Le panneau **Effets** a deux unités. Pour chacune :
- **A B C D M** : où agit l'unité (platines A à D, M = master). Plusieurs à la fois si tu veux.
- **Simple** ou **Chaîne** : un effet avec tous ses réglages, ou jusqu'à 3 effets en série.
- **‹ durée ›** : la durée en temps (de 1/16 à 32), calée sur le BPM.
- **On** : active l'unité. Avec Quantize, elle démarre sur le temps suivant. L'écho continue de résonner quand tu le coupes.
- Pour chaque effet : la liste des effets, **Dosage**, deux réglages propres à l'effet, et en mode Chaîne un bouton **1**, **2** ou **3** pour l'activer.

Effets disponibles : Écho, Ping-pong, Spirale, Reverb, Flanger, Phaser, Trans / Gater, Filtre LFO, Bitcrusher, Bruit montant, Répétition, Frein vinyle, Backspin.

Les réglages des unités sont gardés d'une session à l'autre.

---

## Le sampler

Le sampler joue sur les pads, onglet **Sampler** de n'importe quelle platine. Il a 8 sons de départ : Corne, Sirène, Montée, Impact, Laser, Rembobinage, Crash, Clap.

- Un clic sur un pad joue le son.
- Clic droit (ou appui long) : nom, **Volume**, **Lecture** et **Charger un son…**, ou **Son d'origine** pour revenir au son livré.
- Tu peux aussi glisser un fichier audio sur un pad en mode Sampler.

Modes de lecture :
- **Un coup** : joue le son, un nouvel appui le coupe.
- **Boucle calée** : boucle au tempo de la platine maître, départ sur le temps.
- **Maintien** : joue tant que le pad est appuyé.

Tes sons sont gardés d'une session à l'autre. Le volume général du sampler est le potard **SAMPLER** du mixer.

---

## Enregistrer ton mix

Clique sur **REC** en haut. La durée s'affiche. Clique encore pour arrêter.

Le format se choisit dans **Préférences › Audio › Format d'enregistrement** :
- **WAV 16 bits (qualité CD)** : par défaut.
- **WAV 24 bits (studio)**.
- **WebM / Opus (compressé, léger)**.

Dans l'appli, à l'arrêt d'un WAV, une fenêtre te demande où l'enregistrer. Dans le navigateur, il se télécharge. Dans les deux cas, le mix reste aussi dans la bibliothèque, section **Enregistrements**, jusqu'à la fermeture. L'enregistrement prend le master après le limiteur, sans la balance.

---

## Contrôleurs MIDI

Bouton **Contrôleur** en haut. Toutes les tables MIDI sont reconnues, quelle que soit la marque. Dans l'appli, le MIDI passe par le pilote du système. Dans le navigateur, il faut Chrome ou Edge.

Mixlab ne livre pas encore de mapping de marque vérifié sur une vraie table. Il livre un modèle, **Générique 2 platines**, et un assistant qui apprend ta table en deux minutes.

### 1. Brancher

Branche ta table en USB, puis **Connecter un contrôleur**. Elle apparaît dans la liste. La ligne « Dernier message » montre ce que la table envoie.

Quand tu branches une table :
- si un mapping la connaît : « Contrôleur reconnu… Charger le mapping ? » **Charger** ou **Plus tard** ;
- sinon : **Lancer l'assistant**, **Modèle générique** ou **Plus tard**.

### 2. L'assistant de mapping

**Assistant de mapping**. Il te demande chaque commande, une par une : Play, Cue, Sync, pitch, jog (toucher puis tourner), EQ aigus, médiums, graves, filtre, fader, les 8 pads, pour la platine gauche puis la droite, plus le crossfader et Shift. Bouge la commande demandée, il reconnaît seul le type (bouton, potard, encodeur, 14 bits, jog).

Boutons : **Retour**, **Passer** (si ta table n'a pas cette commande), **Recommencer**, **Terminer maintenant**. À la fin, donne un nom et le nom du contrôleur (il sert à le reconnaître au prochain branchement), puis **Enregistrer le mapping**.

### 3. MIDI Learn

Pour une commande précise :
1. **Activer MIDI Learn**. Une barre apparaît en bas.
2. Clique une commande du logiciel (bouton, potard, fader, pad).
3. Bouge le bouton correspondant sur ta table.
4. Recommence pour les autres, puis **Terminer**.

Juste après chaque commande apprise, la barre propose des options : type (**Auto**, **Absolu**, **Bouton**, **Relatif**, **Jog (tourner)**, **Jog (toucher)**, **Shift**, **Changer de platine**), codage des encodeurs, **Inverser**, **14 bits**, **Rattrapage** (le potard ne prend la main qu'en passant par la valeur du logiciel) et une deuxième fonction avec **Shift**.

**Changer de platine** fait basculer un côté de la table entre A et C, ou entre B et D.

### Le mapping actif

La liste **Mapping actif** montre chaque commande. **⚙** ouvre ses options, **×** la supprime.

Les voyants de la table suivent l'état : play, cue, sync, key lock, slip, hot cues, boucle, effet. Ils clignotent quand le coach ou le parcours te montre quoi toucher.

### Partager et importer

- **Préférences › Avancé › Mapping MIDI en texte** : **Copier pour partager** copie le mapping en texte, **Importer** lit un mapping collé dans la zone, **Tout effacer** vide le mapping actif.
- **Bibliothèque de mappings** : **Importer un fichier** (`.json`), **Exporter l'actif**, et pour chaque mapping **Charger**, **Exporter**, **×**.

### Horloge MIDI

Envoie le tempo de la platine maître (24 impulsions par temps) à une boîte à rythmes, un séquenceur ou des lumières. Choisis la sortie, puis **Envoyer l'horloge**. **Start** et **Stop** suivent la lecture, ou s'envoient à la main.

---

## Le clavier

Les touches suivent leur place sur le clavier, pas la lettre : elles tombent au même endroit en AZERTY et en QWERTY. Elles se changent dans **Préférences › Contrôleurs et clavier** (ou **Contrôleur › Raccourcis clavier…**) : **Changer**, **×**, **Ajouter une touche**, **Réinitialiser**.

### Platines (par défaut)

| AZERTY | QWERTY | Action |
|---|---|---|
| A | Q | Play A |
| Z | W | Cue A |
| E | E | Sync A |
| Q | A | Nudge − A (freiner) |
| S | S | Nudge + A (pousser) |
| & é " ' (touches 1 à 4) | 1 2 3 4 | Pads 1 à 4 de A |
| P | P | Play B |
| O | O | Cue B |
| I | I | Sync B |
| K | K | Nudge − B |
| L | L | Nudge + B |
| è _ ç à (touches 7 à 0) | 7 8 9 0 | Pads 1 à 4 de B |
| W | Z | Crossfader vers A |
| X | X | Crossfader vers B |

Sur AZERTY, les touches de la rangée des chiffres marchent sans Maj.

### Bibliothèque

| Touche | Action |
|---|---|
| / ou Ctrl+F | Aller dans la recherche |
| Échap (dans la recherche) | Effacer la recherche |
| ↓ ou Entrée (dans la recherche) | Passer dans la liste |
| ↑ ↓ | Morceau précédent, suivant |
| Entrée ou Maj+← | Charger sur la platine A |
| Maj+→ | Charger sur la platine B |
| F2 | Bibliothèque plein écran, et retour (marche aussi depuis la recherche) |

### Affichage et fenêtres

| Touche | Action |
|---|---|
| Ctrl + / Ctrl − | Zoom de l'interface |
| Ctrl 0 | Zoom à 100 % |
| Ctrl + molette sur une waveform | Zoom de la waveform |
| F9 | Mode scène, et retour |
| Tab | Passe d'une commande à la suivante (navigation au clavier) |
| Ctrl+, | Ouvre ou ferme les Préférences |
| Échap | Ferme la fenêtre ou le menu ouvert, quitte la bibliothèque plein écran, le mode lecture de l'Académie, arrête MIDI Learn |
| F11 | Plein écran (dans le navigateur) |
| ↑ ↓ sur un séparateur | Change sa position |
| Entrée ou Espace sur la lettre d'une platine | Change sa taille |

Sur Mac, Cmd remplace Ctrl. F2 et F9 se changent comme les autres touches, dans **Préférences › Contrôleurs et clavier**.

### Parcours

| Touche | Action |
|---|---|
| T | Taper le temps (exercice à l'oreille) |
| M | Marquer le break ou le drop (exercice à l'oreille) |

---

## Le coach en direct

Le coach écoute ton mix pendant que tu joues, sans leçon. Il affiche un conseil à la fois dans un bandeau, sur la commande à toucher : un halo à l'écran, et le voyant qui clignote sur ta table. Le **×** du bandeau masque ce conseil pour la session.

Ouvre le panneau avec **Coach**. En haut, la liste **Conseils** règle le niveau (aussi dans **Préférences › Coach et apprentissage**) :
- **Débutant** : tous les conseils, y compris les petites astuces.
- **Essentiel** : seulement les problèmes et les alertes.
- **Coupé**.

### Ce qu'il signale

| Problème | Ce qu'il conseille |
|---|---|
| Le son sature | Baisser le GAIN de la voie trop forte, ou le MASTER. |
| Voie dans le rouge | Baisser son GAIN. |
| Tempos pas calés | Monter ou descendre le pitch, ou Sync. |
| Kicks qui se décalent | Retenir ou pousser avec ‹ ou ›. |
| Deux basses en même temps | Couper le LOW de la piste qui entre. |
| Tonalités peu compatibles | Passage court, ou baisser les MID. Il cite les tonalités voisines. |
| Écart de volume entre deux pistes | Régler le GAIN, faders en haut. |
| Deux morceaux à fond depuis longtemps | Finir la transition sur la prochaine phrase. |
| Fin de morceau dans 30 s | Charger ou lancer le suivant sur le prochain début de phrase. |
| Silence | Relancer du son tout de suite. |
| Filtre resté fermé ou ouvert | Le ramener au centre. |
| Effet qui tourne depuis longtemps | Le couper ou baisser son dosage. |
| EQ poussé à fond | Couper plutôt que booster. |

Les quatre derniers sont des astuces : le niveau Essentiel ne les montre pas.

### Le bilan de chaque transition

À la fin de chaque transition, le coach donne une note sur 100 (un message apparaît, et le détail va dans **Dernières transitions**). Il regarde :
- le départ sur le 1 d'une phrase ;
- les basses superposées ;
- l'écart de tempo et le calage des temps ;
- la compatibilité des tonalités ;
- le saut de volume après la transition ;
- la durée de la transition.

Le panneau Coach montre aussi le tempo, la phase entre A et B (l'aiguille doit rester dans le vert) et les phrases de chaque platine.

### Les leçons guidées

Dans le panneau Coach, trois leçons vérifient chaque étape sur l'état réel des platines :
- **Première transition : l'échange des basses** (niveau 1) ;
- **Sortie en écho** (niveau 2) ;
- **Caler le tempo à l'oreille** (niveau 3).

**Commencer**, puis suis les étapes. **Passer l'étape**, **Recommencer**, **Toutes les leçons**.

---

## Le parcours débutant

« De zéro à ton premier set » : 14 chapitres, environ 2 heures. Il démarre avec **Je n'ai jamais mixé** au premier lancement, le bouton **Parcours** en haut, ou la carte du panneau Coach.

L'interface grandit avec toi : au début, tu ne vois qu'une platine, un fader et le volume. Chaque chapitre débloque les commandes qu'il enseigne. Un halo montre la commande à toucher, et chaque étape se valide toute seule quand tu l'as réussie.

1. **Bienvenue** : à quoi sert un DJ. La platine, le mixer.
2. **Lire un morceau** : play, pause, cue. Charger un morceau.
3. **Le volume** : fader, gain, VU-mètres. Rester hors du rouge.
4. **Le casque** : pré-écouter sans que la salle entende.
5. **Le rythme** : temps, mesures, phrases. Compter 1-2-3-4.
6. **La structure d'un morceau** : intro, couplet, break, drop, outro.
7. **Le tempo** : BPM, pitch, Sync, puis caler à l'oreille.
8. **L'EQ** : couper les basses. L'échange des basses.
9. **Première transition complète** : de A vers B, notée par le coach.
10. **Les transitions de base** : au filtre, en écho, en coupe, en boucle.
11. **L'harmonie** : tonalités compatibles et roue des tonalités.
12. **Les outils de scène** : hot cues, boucles, effets et sampler.
13. **Préparer un set** : choisir, ordonner par énergie, poser des cues.
14. **Ton premier set** : des morceaux, des transitions, enregistré et noté.

Certains exercices se font à l'oreille, waveforms et BPM cachés : taper le temps (bouton **Tape ici** ou touche T), repérer le break et le drop (touche M).

En bas du parcours :
- **Carte** : les 14 chapitres, ton temps de pratique et tes badges. **Reprendre**, **Tout recommencer**.
- **Glossaire** : les mots du DJ. Les mots en gras des explications ouvrent leur définition.
- **Tout afficher** : montre toutes les commandes, quel que soit le chapitre.
- **Passer l'étape** : pas de pénalité, tu peux toujours y revenir.
- **Quitter**.

Ta progression est gardée. Pendant le parcours, le coach en direct ne montre que ce qui concerne le chapitre.

---

## L'Académie

Le métier de DJ au-delà des gestes. Elle s'ouvre depuis le panneau **Coach**, carte « Le métier de DJ », bouton **Commencer** (ou **Reprendre**).

4 modules, 12 leçons :
- **Construire un set** : warm-up, peak time, closing ; la courbe d'énergie ; enchaîner tempo, tonalité et ambiance ; préparer sans tout figer.
- **Lire le public** : quoi regarder pendant que tu joues ; mariage, bar, club, anniversaire ; gérer les demandes.
- **Trouver et ranger sa musique** : où trouver de la musique légalement ; digger ; ranger sa collection pour le direct.
- **Sur scène** : installer son matériel ; prendre et passer le relais.

Chaque leçon a ses points clés, un quiz avec une explication à chaque réponse, et parfois un exercice sur ta vraie bibliothèque :
- **Courbe d'énergie** : dessine la courbe de ton set et compare-la à un modèle (warm-up, peak time, closing, mariage, bar, anniversaire). Tu peux partir d'une playlist ; la note d'énergie de chaque morceau est enregistrée dans la bibliothèque.
- **Assistant de plan de set** : choisis un modèle et une durée. Il remplit des créneaux de 5 minutes avec tes morceaux. Les trous sont marqués « À trouver ». Le plan s'enregistre en playlist.
- **Lire la salle** : trois situations (club à 1 h, mariage à 23 h, bar à 21 h). Tu choisis le morceau suivant et la piste réagit.
- **Ranger ses morceaux** : crée une crate intelligente et tague tes morceaux par moment du set.

Boutons : **‹ Précédente**, **Modules**, **Suivante ›**, **J'ai lu, leçon terminée**, **Glossaire**, **Fermer**.

L'Académie s'ouvre en **mode lecture** : elle prend la place des platines, sur une colonne large et centrée. **Retour aux platines** (ou Échap) la remet dans la colonne du coach, à droite ; **Mode lecture** l'agrandit à nouveau. Les exercices sur ta bibliothèque (courbe d'énergie, plan de set, crate) ouvrent la bibliothèque en grand à côté de la leçon.

---

## L'auto-mix

Bouton **Auto-mix** en haut (en disposition Mix, il est aussi dans l'onglet **File et auto-mix** du panneau latéral).

1. Remplis la **File d'attente** : **+ Sélection** ajoute le morceau sélectionné, ou choisis une playlist puis **Remplir**. Tu peux aussi glisser des morceaux dans la file. **Vider** la vide.
2. Choisis le **Style** : **Auto** (choisi selon les morceaux), **Basses** (échange des basses), **Filtre**, **Écho** ou **Coupe**.
3. Choisis la **Durée** : 4, 8, 16 ou 32 mesures.
4. **Démarrer**.

L'auto-mix charge le morceau suivant sur la platine libre, le synchronise, le lance sur le 1 d'une phrase calée sur l'outro de celui qui sort, puis fait la transition avec les vraies commandes : tu vois l'interface bouger. Si tu touches une commande pendant une transition, il te laisse la main jusqu'au morceau suivant.

**File vide : continuer avec les suggestions** : quand la file est vide, il prend le meilleur morceau suggéré.

**Suivant suggéré** : les morceaux qui vont le mieux après celui qui joue, avec une note sur 100 (tonalité, tempo, énergie, déjà joué ou non) et les raisons. **Ensuite** met un morceau en tête de file.

**Fermer** cache le panneau ; l'auto-mix continue. **Arrêter** l'arrête.

---

## Réglages

Tous les réglages sont dans une seule fenêtre, **Préférences**. Pour l'ouvrir :
- le bouton **Préférences** de la barre du haut (rangé dans **⋯** si la fenêtre est étroite) ;
- **Affichage › Préférences…** ;
- **Ctrl+,** (Cmd+, sur Mac), qui la referme aussi.

**Échap** ferme la fenêtre. Chaque réglage s'applique tout de suite et reste gardé d'une session à l'autre.

À gauche, les onglets et un champ **Rechercher un réglage** : tape un mot (« crossfader », « latence », « raccourcis »…), la fenêtre ne montre plus que les réglages qui correspondent, tous onglets confondus. Vide le champ pour revenir à l'onglet.

Quelques boutons restent là où on s'en sert en jouant, et mènent au bon onglet : **Audio** (barre du haut) ouvre l'onglet Audio, **Réglages › Tous les réglages du mixer…** (sous MASTER) l'onglet Mixer, **Raccourcis clavier…** (fenêtre Contrôleur) l'onglet Contrôleurs et clavier. La liste **Conseils** du panneau Coach, les listes du mixer (effet de voie, égaliseur), la courbe sous le crossfader, **Quantize** et **Gain auto** changent les mêmes réglages que la fenêtre.

### Profil

- **Je mixe déjà sur** : aucun logiciel, Serato, rekordbox, Traktor ou VirtualDJ. Mixlab reprend la disposition la plus proche (Performance, Préparation, Studio, Mix), jamais les noms ni les logos de ces logiciels.
- **Niveau** : **Débutant** (disposition École, coach complet), **Je sais mixer** (disposition Mix, coach essentiel) ou **Pro** (disposition Performance, coach coupé). Si tu as choisi un logiciel, c'est sa disposition qui l'emporte.
- **Revenir aux touches d'origine** : coché, les raccourcis clavier reviennent à ceux d'origine.
- **Appliquer ce profil** : applique la disposition, le niveau du coach et, si coché, les raccourcis.
- **Revoir l'écran d'accueil** : le choix fait sur cet écran passe par ce même profil.
- **Progression du parcours › Remettre à zéro**, après confirmation.

L'écran d'accueil du premier lancement écrit ce même profil : ce que tu y choisis se retrouve ici et se change à tout moment.

### Affichage

**Disposition**, **Nombre de platines**, **Panneaux** (Effets, Waveforms, Mixer, Bibliothèque), **Taille des platines**, **Disposition par défaut**, **Zoom de l'interface** (de 80 à 150 %, textes compris), **Mode scène**, **Effets repliés**, et pour les waveforms : **Couleurs** (3 bandes, RGB, monochrome, daltonien), **Hauteur** et **Zoom**.

Le menu **Affichage** garde les réglages utiles en jouant (panneaux, zoom, taille des platines, waveforms, mode scène, plein écran).

### Audio

- **Sortie master** et **Sortie casque** : voir [Le casque](#le-casque).
- **Split** : casque à gauche, master à droite, sur une seule carte son.
- **État** : la latence de sortie et la fréquence d'échantillonnage.
- **Métronome** : volume des clics, au casque.
- **Format d'enregistrement** : WAV 16 bits, WAV 24 bits ou WebM / Opus.

### Platines

- **Bouton Cue** : CDJ, Denon ou Numark.
- **Sens du pitch** et **Plage du pitch** (±8, ±16 ou ±50 %, pour toutes les platines au démarrage).
- **Sync calée sur** : le temps, la mesure ou la phrase.
- **Key lock** : allumé sur toutes les platines au démarrage.
- **Quantize** et **Gain auto** (aussi dans la barre du haut).
- **Charger le morceau suivant à la fin**.
- **Plage d'analyse BPM** : 60 à 120 (hip-hop, downtempo), 70 à 140, 88 à 175 (house, par défaut), 100 à 200 (drum and bass). Elle s'applique aux morceaux importés ensuite.
- **Auto-mix** : style et durée des transitions, remplissage de la file.

### Mixer

**Faders de voie** (courbe), **Crossfader** (Mix, Douce, Cut, Réglable) et sa **Forme réglable**, **Crossfader inversé** (hamster), **Égaliseur** (isolateur ou classique), **Effet de voie**, **Résonance du filtre**, **Limiteur** du master (allumé par défaut ; ne le coupe que si ta table ou ta sono limite déjà) et **Balance du master** (double-clic : centre).

### Contrôleurs et clavier

- **Ouvrir la fenêtre Contrôleur** : brancher, MIDI Learn, mapping actif, bibliothèque de mappings, horloge MIDI.
- **Lancer l'assistant** de mapping.
- **Clavier** : la liste des raccourcis (**Changer**, **×**, **Ajouter une touche**, **Réinitialiser**) et **Ton clavier** (AZERTY, QWERTY, QWERTZ) quand le système ne le donne pas.

### Coach et apprentissage

- **Conseils pendant le mix** : Débutant, Essentiel ou Coupé (aussi dans le panneau Coach).
- **Réafficher les conseils masqués** avec le **×** du bandeau.
- **Parcours** et **Académie** : ta progression, **Ouvrir**, et **Remettre à zéro** après confirmation.

### Bibliothèque

- **Colonnes affichées** de la table (aussi le bouton **Colonnes**).
- **Cache d'analyse** : nombre de morceaux déjà analysés, et **Vider le cache d'analyse** après confirmation. Tes morceaux, cues et playlists sont gardés ; les morceaux seront réanalysés à leur prochain import.

### Avancé

- **Exporter mes réglages** : un fichier `mixlab-reglages-AAAA-MM-JJ.json` avec la disposition, les réglages, les mappings et les raccourcis. Pas la bibliothèque ni la progression.
- **Importer un fichier** : remplace tes réglages par ceux du fichier, après confirmation, puis l'appli redémarre.
- **Réinitialiser tous les réglages** : comme au premier lancement (l'écran d'accueil revient), après confirmation. Ta bibliothèque et ta progression sont gardées.
- **Mapping MIDI en texte** : le mapping actif en texte, avec **Copier pour partager**, **Importer** et **Tout effacer**.

---

## Dépannage

### Pas de son

- Clique n'importe où dans la fenêtre, ou appuie sur une touche. Les navigateurs et les WebView bloquent le son tant que tu n'as pas touché la page. Le message « Clique n'importe où pour activer le son » disparaît quand c'est bon.
- Vérifie le fader de voie, le crossfader (côté A · B de la voie) et le potard **MASTER**.
- Vérifie la sortie choisie dans **Préférences › Audio › Sortie master**.
- Si **LIM** reste allumé et que le son est écrasé : baisse les **GAIN**.

### Le casque

Pour pré-écouter sans que la salle entende, il faut deux sorties.

- **Split** (mixer) : sur une seule carte son, casque à gauche et master à droite, avec un câble répartiteur. Marche partout.
- **Préférences › Audio › Sortie casque** : une deuxième carte son (ou la sortie casque de ta table). Dans l'appli, ça marche sous Windows. Sous macOS et Linux, la WebView ne sait pas encore choisir la carte : utilise Split en attendant le moteur audio natif. Dans le navigateur, ça marche dans Chrome et Edge.

Sans l'un des deux, la pré-écoute de la bibliothèque et le métronome se mélangent au master. Mixlab te prévient la première fois.

### Fichier introuvable

Un disque débranché ou un dossier renommé : le morceau reste dans la bibliothèque avec ses cues et ses playlists, et va dans **Outils › Fichiers manquants**.

- **Dans l'appli** : **Chercher dans un dossier…**. Mixlab cherche chaque fichier par son nom, sous-dossiers compris, et lui rend ses cues et ses playlists. **Oublier** ou **Tout oublier** le retire.
- **Dans le navigateur** : le son n'est jamais gardé, seulement les infos. Réimporte les fichiers (**Importer** ou glisser-déposer) : ils retrouvent tout. Dans Chrome et Edge, les fichiers ouverts avec **Importer** peuvent être rouverts d'un clic (**Rouvrir n fichiers**).

### Un morceau a disparu au redémarrage de l'appli

Dans l'appli, un morceau glissé depuis l'explorateur est joué mais pas gardé. Importe-le avec **Fichiers** ou **Dossier** pour qu'il reste dans la bibliothèque.

### Le BPM ou la tonalité est faux

- BPM moitié ou double : **BPM ½** ou **BPM ×2**, ou change la **Plage d'analyse BPM** et réimporte.
- Grille décalée : **◁ ▷**, **1 ici**, et **Métro** pour vérifier. Puis **Verrou**.
- Tonalité : clique sur la tonalité dans l'en-tête de la platine pour la corriger.

### Le contrôleur ne répond pas

- **Contrôleur › Connecter un contrôleur**, et regarde « Dernier message » quand tu bouges un bouton. Si rien n'arrive, la table n'est pas vue : rebranche-la.
- Dans le navigateur : Chrome ou Edge seulement, et autorise le MIDI quand la page le demande.
- Un potard ne fait rien : c'est peut-être le **Rattrapage**. Le message « amène la commande vers … % » s'affiche : tourne le potard jusqu'à la valeur du logiciel.
- Une commande va dans le mauvais sens : **⚙ › Inverser**.

### Si ça rame

- Passe en **2 platines**.
- Décoche des panneaux dans **Affichage** (Effets, Waveforms).
- Choisis des platines **Compactes** ou **Mini**.
- Ferme les autres onglets ou logiciels gourmands.
- Garde peu d'effets en chaîne sur le master.
- L'analyse d'un gros dossier prend du temps la première fois seulement : ensuite elle est en cache.

Le son passe encore par le moteur Web Audio de l'interface, avec 20 à 40 ms de latence. Un moteur natif plus rapide est prêt mais pas encore branché.
