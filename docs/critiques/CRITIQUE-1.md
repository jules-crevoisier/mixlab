# Mixlab v0.3 : critique produit n° 1 (10 octobre 2026)

Méthode : l'appli a été utilisée telle quelle (`app/index.html`, Chromium headless via Playwright) en 1600×950, 1366×768 et 1280×800, aux 5 presets, à 2 et 4 platines, avec des mix simulés (play, sync, EQ, faders), un import de fichier WAV, une bibliothèque gonflée à 3 000 morceaux et des mesures de frame time (deltas `requestAnimationFrame`). Toutes les captures sont dans ce dossier.

Verdict en une phrase : **le moteur de jeu et le coach sont de vrais atouts, mais sur un portable de 13-15", l'écran est trop dense, la bibliothèque disparaît sous le pli, et rien n'accueille une débutante. Un DJ pro ou une DJ mariage ne peut pas encore travailler avec.**

---

## 1. Léa, 19 ans, n'a jamais touché une platine

**Premier lancement** (`01-premier-lancement-1366x768.png`)
- Aucun écran d'accueil, aucune question « As-tu déjà mixé ? ». Léa arrive directement sur **138 commandes visibles** (comptées dans le viewport à 1366×768) : SLIP, REV, CENSOR, KEY LOCK, RELOOP, TAP, « 1 ICI », GRILLE, QUANTIZE, GAIN AUTO, SPLIT, MASTER (qui désigne à la fois un bouton de platine, un potard et l'horloge de tempo)…
- Le preset par défaut est bien « École », avec le coach ouvert. C'est bien, mais **la première leçon proposée est « Module 3 · Caler le tempo à l'oreille »**, c'est-à-dire le geste le plus difficile du métier. Les modules 1 et 2 (signal, structure d'un morceau) sont dans la liste « Bientôt », tout en bas, hors écran (le panneau coach défile : 729 px de contenu pour 697 px visibles).
- Il y a **deux boutons voisins « CONSEILS » et « COACH »** dans la barre du haut. Rien n'explique la différence (le premier coupe le coach en direct, le second ouvre le panneau des leçons).
- À 1366 et 1280, la barre du haut passe sur deux lignes et « COACH » se retrouve seul sur la seconde (`01-premier-lancement-1280x800.png`). C'est pourtant le bouton qui compte le plus pour elle.

**Faire du son** : un clic sur ▶︎II de A et le son part, sans blocage de l'audio (ctx `running`). Le bouton s'allume en cyan, le VU-mètre bouge et MASTER s'allume tout seul (`10-lea-play-A.png`). Ça fonctionne, mais rien ne dit à Léa *pourquoi* MASTER s'est allumé.

**Suivre une leçon** (« Première transition : l'échange des basses », `12-…`, `13-…`, `14-lea-lecon-etape3.png`)
- Chaque étape se valide toute seule, avec un « pourquoi » et des toasts verts. C'est très bon.
- Mais **les leçons ne mettent aucun halo sur la commande à toucher**. À l'étape 3 (« Coupe les basses de B, LOW à fond à gauche »), Léa doit trouver seule un potard de 32 px nommé « LOW » en 8,5 px gris, parmi 28 potards. Seul le coach en direct (`coach-live.js`) pose la classe `coach-target`. `learn.js` ne l'utilise jamais.
- L'étape 1 lui parle de « mesure 41 », de « compteur de phrase » et de « phrase = 8 mesures de 4 temps » avant qu'aucun chapitre ne les ait expliqués. Il n'y a pas de glossaire.
- Les toasts de validation (en bas, au centre) **recouvrent la bibliothèque et la colonne Tonalité** (`14-…`).
- En 1366 avec le coach ouvert, l'artiste est tronqué (« Démo Mixla… ») et le jog disparaît (container query sous 440 px). En ouvrant ou fermant le coach, toute la platine change de forme (comparer `42-…` et `43-…`). Pour une débutante, c'est déroutant : l'écran qu'elle vient d'apprendre bouge.

**Où Léa se perd** : (1) elle ne sait pas quoi faire en premier, (2) la première leçon est trop dure, (3) elle ne trouve pas la commande nommée, (4) elle ne connaît pas les mots employés.

---

## 2. Karim, résident depuis 10 ans sur rekordbox/CDJ, portable 14"

**Ce qui le rassure** : BPM en 26 px chasse fixe avec deux décimales, temps restant au dixième qui passe au rouge et clignote sous 30 s (`50-fin-de-morceau.png`), Camelot en couleur et pastille verte quand c'est compatible, pitch dans le sens CDJ (vers le bas = plus vite), plages ±8/16/50, quantize, slip, censor, compteur de phrases P1…P8 sur la waveform, double-clic pour remettre à zéro le potard et molette sur les potards. Le vocabulaire est celui du métier.

**Ce qui lui fait fermer l'appli en 5 minutes**
1. **La bibliothèque est invisible** dans 4 presets sur 5 à 1366×768. En Export (`02-preset-export-1366x768.png`), elle est entièrement sous le pli. En Mix et en École, on voit l'en-tête du tableau et zéro ligne. Même en faisant défiler `#app` jusqu'en bas, on n'a que **3 lignes visibles** (`30-sophie-import-scroll.png`). En 4 platines, `#app` mesure 1096 px pour 697 visibles, et les platines C/D comme le crossfader sont coupées (`03-4decks-mix-1366x768.png`). Dans rekordbox, le browser occupe au minimum 35 à 40 % de l'écran.
2. **Les titres sont illisibles en 4 platines Performance** : « H… », « N… », « Q… », « Li… » (`03-4decks-perf-1366x768.png`). L'artiste ne fait qu'une lettre.
3. **« ÷2 » se lit « +2 »** : à 10 px en Inter, le signe ÷ ressemble à un + (`02-preset-studio-1366x768.png`, rangée boucle et rangée GRILLE « BPM +2 »). Karim croit que le bouton *ajoute* 2 temps.
4. **Pas de navigation au clavier dans la bibliothèque** : les lignes ont `tabIndex = -1`, ArrowDown ne fait rien, aucun raccourci pour charger sur A ou B, aucun raccourci de recherche (« / » et Ctrl+F ne focalisent pas le champ), pas de barre espace. Sur CDJ/rekordbox, c'est tout au browse + load.
5. **Latence annoncée de 42 ms** (panneau Audio, `40-audio.png`). Le nudge et le cue se sentent en retard. Le moteur Rust (3 à 10 ms) n'est pas branché.
6. **Bibliothèque de 3 000 morceaux** (Karim en a 15 000) : `renderTable()` reconstruit tout le DOM en **139 à 295 ms**. Il est rappelé à chaque changement de tempo ou de tonalité de la platine de référence (voir `rkStr` dans `frame()`). En bougeant le pitch, on a mesuré **un gel de 1,5 s** (pire frame 1517 ms, 13 frames de plus de 50 ms en 5 s). Sans rien toucher, A en lecture, on compte encore 18 frames de plus de 50 ms en 4 s (le tableau non virtualisé alourdit chaque reflow). **En live, c'est rédhibitoire.**
7. **Rien n'est sauvegardé dans la version web** : playlists, imports, hot cues et historique sont perdus au rechargement (`store` ne garde que les réglages d'interface ; la sauvegarde de la bibliothèque n'existe que via Tauri).
8. Les menus Audio et Contrôleur **ne se ferment pas avec Échap**.

**Lisibilité dans le noir**
- Répartition des tailles de texte visibles (preset École) : **180 éléments sur 270 font 10 px ou moins** (8 px ×12, 8,5 px ×14, 9 px ×43, 10 px ×83). Les libellés RESTANT, TONALITÉ, BPM, GAIN/HI/MID/LOW/FILTRE et les en-têtes de colonnes sont en 8 à 9 px.
- Contraste mesuré (WCAG) : 74 textes sous 4,5:1. Libellés `--dim` #5d636e sur #131519 : **3,26:1**. Numéros de pads vides : **2,92:1**. En-têtes du tableau : **3,05:1**.
- La waveform parallèle fait 46 à 80 px de haut selon le preset, sans réglage. La moitié gauche (le passé) est assombrie à 42 %, ce qui est bien. Mais il n'y a **pas de zoom d'interface** (cherché dans la barre du haut : aucun), alors que Serato et VirtualDJ en ont un.
- Le tempo maître à droite de GAIN AUTO s'affiche « — » sans libellé sous 1420 px (le libellé MASTER est masqué par la media query). C'est un tiret orphelin dans la barre.

**Ce qui lui manque, dans l'ordre** : browser au clavier avec chargement sur une platine, colonnes et tri par Camelot, cues mémoire, import rekordbox XML, waveform plus haute avec zoom par platine, latence.

---

## 3. Sophie, DJ mariages et événements

- **Pas d'automix ni de file d'attente** (aucune occurrence dans le DOM). Pour Sophie, c'est la fonction n° 1 : le dîner, les pauses, aller aux toilettes. C'est éliminatoire.
- **Pas de demandes** (requests), pas de liste « à jouer ensuite », pas de marqueur « déjà joué » visible dans le tableau, à part une colonne « Joué » à 0.
- **Playlists** : « + Nouvelle playlist » crée « Playlist 4 », mais **on ne peut ni la renommer** (le double-clic ne fait rien) **ni la supprimer**, et il n'y a pas de menu contextuel. On ne peut pas non plus réordonner les morceaux, ni retirer un morceau d'une playlist. Pour un mariage (entrée des mariés, première danse, gâteau), c'est le cœur du travail.
- **Recherche** : la sous-chaîne doit être contiguë. « house 124 » donne 1 résultat, mais **« 124 house » donne 0**. Il faut chercher mot par mot (ET logique).
- **Import** : rapide (un WAV de 20 s analysé en 273 ms), le titre et l'artiste sont extraits du nom de fichier « Artiste - Titre » et le BPM est juste (120). En revanche, le fichier n'est pas persistant sur le web, et les toasts couvrent le tableau (`30-…`).
- **Double-clic sur une ligne pendant que A joue** : le morceau part sur B, la première platine à l'arrêt. Un morceau préparé en cue sur B est donc écrasé sans confirmation. `loadTo` ne protège que les platines « à l'antenne ».
- **Fiabilité** : quand un morceau se termine, le coach affiche « Silence sur la piste de danse : PLAY sur A ». Or A est **le morceau qui vient de finir** (`51-silence.png`). C'est un bug de la règle `silence` (`decks.find(d=>d.active&&d.track)` prend A). Juste avant, la règle `ending` disait « Lance B… fader encore bas » alors que le fader de B était déjà en haut (`50-…`).
- **L'alerte du coach se pose en haut au centre, sur les waveforms** et cache le temps restant de A (-0:23,5 masqué dans `50-fin-de-morceau.png`), c'est-à-dire l'information critique à ce moment-là.

---

## 4. Défauts transverses

**Mise en page sur portable.** `#app` défile (overflow:auto) au lieu de répartir la hauteur. La bibliothèque a un `minmax(150px,1fr)` mais passe sous les blocs « auto » des platines, qui font environ 470 px. Mesuré en 4 platines : 1096 px de contenu pour 697 px (1366×768) ou 729 px (1280×800).

**Débordements.** `RELOOP` est coupé (scrollWidth > clientWidth) et touche OUT à 1366 et 1280 (« OUT RELOOP » collés dans `01-…-1366x768.png`, « OUTRELOOI » en 1280). Les titres sont tronqués en 4 platines, l'artiste en École.

**Typo et polices.** `--ui` et `--num` pointent d'abord vers IBM Plex dans le premier bloc `:root`, puis vers Inter et JetBrains Mono dans le thème v3. Ces polices sont chargées depuis **Google Fonts** : dans une appli DJ hors ligne (club sans wifi), on retombe sur les polices système et toutes les largeurs changent. La marque est en graisse 800, qui n'est pas chargée (Inter 400 à 700 seulement).

**Performance** (Chromium headless, rendu logiciel)
| Situation | Moy. | p95 | Frames > 20 ms |
|---|---|---|---|
| 1600, 2 platines en lecture (École) | 18,4 ms | 33,3 | 22/218 |
| 1600, 4 platines (Performance) | 16,8 | 16,8 | 3/299 |
| 1366, 4 platines (Performance) | 22,1 | 50 | 50/227 |
| 1366, 4 platines, CPU ralenti ×4 (portable d'entrée de gamme) | **68,6** | 100 | 71/73 (environ 15 fps) |
| 1366, DPR 2 (écran Retina), 4 platines | 18,6 | 33,4 | 30/269 |

Le coût est dans `drawWave` : **1,3 ms par appel** (1,55 ms en DPR 2), recalculé intégralement à chaque frame pour chaque lane, avec 3 chemins de W points par couche. Overview, platter, coach et LED coûtent moins de 0,1 ms. Le rééchantillonnage prend un point (`arr[i]`) et non le max du segment : la waveform scintille (aliasing) quand on dézoome (zoom 32 s ≈ 31 px/s pour 150 points/s). Enfin, `$('#p-deck'+d.id)` est requêté dans la boucle à chaque frame.

**Clavier.** Le mappage utilise `e.key` en QWERTY : Q/W/E = play/cue/sync de A, A/S = nudge, Z/X = crossfader. **Sur un clavier AZERTY (le public visé est francophone), ces touches ne forment plus une rangée** et Z/X sont éclatées. Il faut utiliser `e.code`. Pas de barre espace. Pas de raccourci pour C et D.

**Accessibilité.** Le focus est visible (contour sur TAP, `11-focus-visible.png`), les 28 potards ont `role=slider` et tous les boutons ont un nom accessible : c'est bien. En revanche, le contraste est insuffisant (voir plus haut), les lignes de la bibliothèque ne sont pas focalisables, Échap ne ferme pas les modales, et l'alerte du coach bouge sans réserve d'espace.

**Rédaction en français.** Le ton est bon : direct, tutoiement, le « pourquoi » de chaque étape est concret. À corriger :
- « préécouter » (panneau Audio) → « pré-écouter ».
- « 1 ICI » est incompréhensible → « Poser le 1 » ou « Temps 1 ».
- Les presets « Export » et « Studio » ne disent pas ce qu'ils sont (« Export » évoque l'export de clé USB de rekordbox).
- Mélange d'anglais (KEY LOCK, SLIP, REV, CENSOR, RELOOP, TAP, SPLIT, QUANTIZE) et de français (SAUT, GRILLE, CASQUE, FILTRE, GAIN AUTO). Garder l'anglais du métier, d'accord, mais ajouter une infobulle de définition à chaque terme (glossaire).
- « 0 morceau » : la forme est correcte, mais « Aucun morceau » se lit mieux.
- La règle `ending` dit « fader encore bas » même quand il est en haut.

---

## 5. Top 15 à corriger (par priorité)

| # | Problème et preuve | Pourquoi c'est grave | Correction proposée | Effort |
|---|---|---|---|---|
| 1 | **Bibliothèque invisible ou réduite à 0-3 lignes à 1366×768 et 1280×800** dans Mix, École, Export et 4 platines (`02-preset-export-1366x768.png`, `01-…-1366x768.png`, `30-…`, `03-4decks-mix-1366x768.png`). `#app` défile : 1096 px pour 697 px. | Pas de bibliothèque, pas de set. Karim et Sophie ferment l'appli. | Mettre `#app` en `overflow:hidden` et ajouter un **séparateur glissable** entre platines et bibliothèque (minimum 35 % de la hauteur), mémorisé par preset. Sous 800 px de haut : platines « compactes » automatiquement (sans jog, pads 1×8). Ajouter **une touche bibliothèque plein écran** (Tab ou F2), comme dans rekordbox. | M |
| 2 | **Gel jusqu'à 1,5 s avec 3 000 morceaux** pendant un mouvement de pitch. `renderTable` coûte 139 à 295 ms et est relancé quand `rkStr` change (tempo au 1/10). | Le son peut tenir, mais l'interface gèle en plein mix. Impossible avec une vraie collection. | **Virtualiser le tableau** (ne rendre que les lignes visibles) et ne mettre à jour que les classes `okk`/`okb` quand la référence change, sans reconstruire le DOM. Arrondir `rkStr` au BPM entier. | M |
| 3 | **Aucun accueil débutant, et la première leçon est la plus dure** (Module 3 « à l'oreille »). Modules 1 et 2 en « Bientôt » hors écran (`01-…-1600x950.png`). | La promesse n° 1 du produit (de zéro au premier set) n'est pas tenue dans les 30 premières secondes. | Au premier lancement, un écran de choix : « Je n'ai jamais mixé / Je mixe déjà (Serato, rekordbox, Traktor, VirtualDJ) ». Le premier choix lance le chapitre 1 avec **une seule platine visible** (interface qui grandit, chantier 1). Le second choisit le preset qui ressemble au logiciel d'origine. Mettre « Tempo à l'oreille » après « Première transition (avec Sync) ». | L |
| 4 | **Les leçons ne montrent pas la commande à toucher** : `learn.js` ne pose jamais `coach-target`, alors que le coach en direct le fait. Étape « Coupe les basses de B » sans halo (`14-lea-lecon-etape3.png`). | C'est là que la débutante bloque. | Ajouter `target:'B.low'` (etc.) à chaque étape de `LESSONS` et réutiliser `setTarget` de coach-live (halo et LED de la table). Si la commande est hors écran, `scrollIntoView` puis halo. | S |
| 5 | **Pas d'automix ni de file d'attente** (absents du DOM). | Sophie ne peut pas faire un dîner de mariage. C'est aussi le « DJ de démonstration » prévu pour le parcours. | Une version 1 simple : file « À suivre » (glisser des morceaux), puis enchaînement automatique avec fondu de 8 ou 16 temps, synchronisé sur les phrases (le compteur P existe déjà), départ du suivant N secondes avant la fin. Un bouton AUTO dans la barre. | M |
| 6 | **Pas de navigation au clavier dans la bibliothèque** : lignes `tabIndex=-1`, ArrowDown sans effet, pas de raccourci de chargement, « / » et Ctrl+F ne mènent pas à la recherche, pas d'espace. | Karim travaille en « browse + load ». C'est le geste le plus fréquent d'un set. | ↑/↓ pour sélectionner, Maj+← / Maj+→ pour charger sur A ou B (comme Serato), Ctrl+F ou « / » pour la recherche, Échap pour en sortir, Entrée pour charger sur la platine à l'arrêt. Afficher ces raccourcis dans la modale Contrôleur. | S |
| 7 | **Raccourcis en `e.key` QWERTY** : sur AZERTY, Q/W/E et Z/X ne sont plus des rangées. | La cible est francophone, donc en AZERTY. | Passer à `e.code` (KeyQ, KeyW…) pour garder des positions physiques fixes, et afficher la touche locale dans l'aide via `navigator.keyboard.getLayoutMap()`. | S |
| 8 | **Alerte du coach posée sur les waveforms**, qui masque le temps restant de A à 24 s de la fin (`50-fin-de-morceau.png`, `42-coach-hud-deux-basses.png`). | Elle cache l'information critique au moment critique. | Une bande réservée (hauteur fixe) sous la barre du haut, ou sous les waveforms, qui ne recouvre jamais une donnée. Option « alertes discrètes » pour le niveau Essentiel. | S |
| 9 | **Bug du coach « Silence » : il propose de relancer la platine qui vient de finir** (`51-silence.png`). La règle `ending` dit « fader encore bas » même quand il est en haut (`50-…`). | Un conseil faux en situation de panique détruit la confiance dans le coach. | `silence` : choisir une platine chargée qui n'est pas en fin de morceau (`remaining(d)>5`), de préférence la dernière chargée. `ending` : ne dire « fader encore bas » que si `d.p.fader<.3`, sinon « baisse son fader puis lance-le ». | S |
| 10 | **Titres tronqués à 1 lettre en 4 platines Performance** (« H… », « N… », `03-4decks-perf-1366x768.png`). L'artiste est tronqué en École. | On ne sait plus quel morceau est sur quelle platine. | En largeur < 330 px, passer l'en-tête sur 2 lignes : titre sur toute la largeur, puis BPM / restant / tonalité dessous. Afficher aussi le titre dans la lane de waveform (c'est déjà le cas : le garder lisible). | S |
| 11 | **Textes trop petits et contraste faible** : 180 textes sur 270 font 10 px ou moins. Libellés 8-9 px à 3,26:1, pads à 2,92:1, en-têtes de colonnes à 3,05:1. Pas de zoom d'interface. | En cabine sombre, sur 14", à 60 cm, on ne les lit pas. | Libellés minimum 10 px et `--dim` éclairci à environ #7c838f (≥ 4,5:1). Ajouter un **zoom global 80-150 %** (Ctrl+= / Ctrl+-) via une variable `--z` sur la racine, et un **mode scène** (BPM et temps restant ×1,5, waveforms plus hautes). | M |
| 12 | **« ÷2 » se lit « +2 »** (boucle et « BPM ÷2 »), et RELOOP est coupé et touche OUT (`02-preset-studio-1366x768.png`, `01-…-1280x800.png`). | On risque une mauvaise action en live. | Écrire « ½ » et « ×2 », ou « /2 » ; boucle « − » / « + » avec la taille au centre. Raccourcir RELOOP en « RE » avec une infobulle, ou passer la rangée sur 2 lignes sous 440 px. | S |
| 13 | **Rien n'est persistant dans la version web** : playlists, imports, cues et historique sont perdus au rechargement (seul Tauri sauvegarde). | Une DJ qui prépare son mariage la veille perd tout. | Sauvegarder la bibliothèque (métadonnées, cues, playlists) dans IndexedDB, et garder les fichiers via File System Access (poignées). Afficher un indicateur « sauvegardé ». | M |
| 14 | **Playlists inutilisables pour un événement** : impossible de renommer, supprimer ou réordonner, de retirer un morceau, pas de menu contextuel. Recherche à sous-chaîne contiguë (« 124 house » donne 0 résultat). Le double-clic charge sur une platine en cue sans confirmation. | Le métier de Sophie, c'est la préparation de playlists. | Double-clic sur le nom pour renommer, clic droit pour renommer, supprimer ou dupliquer, glisser pour réordonner, Suppr pour retirer. Recherche par mots séparés (tous les mots doivent correspondre). Double-clic seulement vers une platine **vide ou arrêtée au début**, sinon toast. | M |
| 15 | **Waveforms trop coûteuses et qui scintillent** : `drawWave` prend 1,3 ms par lane et par frame, environ 15 fps en 4 platines avec un CPU ralenti ×4. Échantillonnage d'un seul point, donc aliasing au dézoom. | Sur un portable d'entrée de gamme (l'utilisateur gratuit type), l'affichage saccade. | Précalculer la waveform par zoom dans une bitmap hors écran (OffscreenCanvas) et faire un `drawImage` décalé à chaque frame. Max ou RMS par colonne au lieu d'un point. Plafonner à 30 fps quand la fenêtre n'a pas le focus. | M |

Juste en dessous du Top 15 :
- Échap ne ferme pas les modales Audio et Contrôleur.
- Polices sur Google Fonts : les embarquer (woff2 locaux) pour le hors-ligne.
- « CONSEILS » à côté de « COACH » : fusionner en un seul menu Coach (Leçons / Conseils en direct : Débutant, Essentiel, Coupé).
- Infobulle et glossaire pour SLIP, REV, CENSOR, KEY LOCK, QUANTIZE, SPLIT, « 1 ICI ».
- Ouvrir le coach change la forme des platines (le jog disparaît) : réserver la place, ou ne pas recalculer la platine.
- Latence de 42 ms : afficher un avertissement honnête dans le panneau Audio, et accélérer le branchement du moteur natif.

---

## 6. Cinq choses vraiment bonnes, à garder absolument

1. **Le coach en direct et le bilan de transition** (`42-…`, `43-bilan-transition.png`) : « Deux basses en même temps », halo sur LOW de B, note sur 100 avec des faits mesurés (« calage à 8 ms », « basses superposées 5,1 s », « B est parti mesure 2 »). Aucun concurrent n'a ça. C'est la raison d'exister de Mixlab.
2. **Les leçons qui se valident sur l'état réel**, avec un « pourquoi » concret et des indices chiffrés (« B est plus rapide de 3,00 BPM : monte le pitch »). La pédagogie est juste. Il ne manque que le halo.
3. **L'en-tête de platine façon CDJ** : BPM en gros chiffres à chasse fixe, temps restant qui passe au rouge et clignote sous 30 s, Camelot coloré avec pastille de compatibilité, et le même code couleur A/B/C/D partout (waveform, mixer, pads, bibliothèque).
4. **Les waveforms parallèles avec le compteur de phrases** (P1…P8, mesures, passé assombri, grille visible) et les 3 bandes de couleur (graves, médiums, aigus). C'est exactement ce qu'un DJ rekordbox attend, et c'est aussi ce qui permet d'enseigner les phrases.
5. **Le langage visuel sobre et cohérent** : fond quasi noir à 3 niveaux, couleurs réservées aux platines et aux cues, états « contour au repos / allumé quand actif », focus clavier visible, potards accessibles (`role=slider`, molette, double-clic pour remettre à zéro), garde-fou « platine à l'antenne » au chargement. Le look est crédible : ne pas le perdre en corrigeant la densité.

---

### Annexe : captures

`01-premier-lancement-{1600x950,1366x768,1280x800}.png` · `02-preset-{perf,export,studio,mix}-{taille}.png` · `03-4decks-{perf,mix}-{taille}.png` · `10-lea-play-A.png` · `11-focus-visible.png` · `12-lea-lecon-echange-basses.png` · `13-lea-lecon-etape2.png` · `14-lea-lecon-etape3.png` · `20-4decks-lecture-ecole-{1600,1366}.png` · `21-retina-4decks-perf-1366.png` · `30-sophie-import-scroll.png` · `31-bibli-3000.png` · `40-audio.png` · `41-controleur.png` · `42-coach-hud-deux-basses.png` · `43-bilan-transition.png` · `50-fin-de-morceau.png` · `51-silence.png`

Scripts de mesure (Playwright) : `../pw/s1.js` à `s9.js`.
