# Mixlab : critique produit n° 2 (10 octobre 2026, après la nuit)

Méthode : branche `nuit` à jour (commit `978f0ad`), `app/index.html` ouvert tel quel dans Chromium headless (Playwright, `--autoplay-policy=no-user-gesture-required`), en 1366×768 et 1600×950. J'ai testé les 5 presets à 2 et 4 platines, le Mode scène, la bibliothèque plein écran avec 64 puis 3 000 morceaux, l'accueil (`#welcome`), les chapitres 1, 2 et 5 du parcours, l'Académie (liste, cours, quiz), le coach pendant une transition ratée (B lancé sans Sync, basses ouvertes) puis son bilan, les fenêtres Audio, Contrôleur et Réglages de jeu, le menu Affichage, l'auto-mix, les unités d'effets en mode Chaîne, les 7 modes de pads et l'éditeur de hot cue. J'ai aussi mesuré le temps d'image, avec et sans ralentissement du processeur ×4. Les captures sont dans [`2/`](2/).

---

## 1. Verdict en 5 lignes

1. **Énorme progrès depuis la critique 1** : tout tient à l'écran sans défilement, la bibliothèque est visible partout (et en plein écran), l'accueil débutant et le parcours en 14 chapitres existent, les leçons posent un halo sur la commande à toucher, l'auto-mix, les playlists, la recherche multi-mots et la sauvegarde web marchent, et 3 000 morceaux ne figent plus rien (pire image 33 ms, contre 1 517 ms avant).
2. **Ce qui bloque encore la débutante** : l'interface « qui grandit » laisse passer des commandes avancées (KEY LOCK, SLIP, REV, CENSOR et AUTO-MIX actifs dès le chapitre 1, bibliothèque pro complète au chapitre 2). Les commandes verrouillées restent affichées en gris, donc elle voit toujours environ 150 commandes. Le bandeau du coach recouvre maintenant la bibliothèque. Et le temps restant disparaît en École à 1366.
3. **Ce qui bloque le pro** : le menu **Affichage est invisible** (rogné par `#top{overflow:hidden}`). Les Réglages de jeu, la plage BPM, les couleurs de waveform, la taille des platines et le Mode scène sont donc inaccessibles à la souris. Le preset **Performance n'a ni pads, ni boucle, ni pitch à 1366**. Le mixer est minuscule (faders de 58 px), et la latence reste à 42 ms, sans explication.
4. **Le style reste « formulaire »** : des centaines de boutons au même poids (contour gris, majuscules espacées en 10 px), des couleurs saturées partout (waveforms rouge-vert-bleu pur, pastilles Camelot arc-en-ciel, CUE jaune plein sur une platine à l'arrêt), aucune hiérarchie entre ce qui est vital en live et ce qui est réglage.
5. **Priorité de la prochaine nuit** : déboucher le menu Affichage, rendre au preset Performance ses pads, refermer l'interface du parcours, donner sa place au mixer, puis lancer une passe visuelle sur les jetons de couleur, la typographie et les waveforms (section 4).

---

## 2. Où en sont les points de la critique 1

| # | Point de la critique 1 | État | Constat d'aujourd'hui |
|---|---|---|---|
| 1 | Bibliothèque invisible à 1366 et 1280 | **Corrigé** | 4 à 5 lignes visibles dans tous les presets, séparateurs glissables, plein écran par Tab ou le bouton Biblio (`2/biblio-plein-ecran-1366.png`). Reste un débordement horizontal du tableau en Mix et École (problème n° 8). |
| 2 | Gel de 1,5 s avec 3 000 morceaux | **Corrigé** | 3 000 morceaux et pitch bougé en continu pendant 4 s : pire image 33 ms, 0 image au-delà de 50 ms. |
| 3 | Aucun accueil débutant, première leçon trop dure | **Corrigé** | Écran « Tu as déjà mixé ? », avec Serato, rekordbox, Traktor et VirtualDJ (`2/welcome-1366.png`). Le chapitre 1 commence par « à quoi sert un DJ ». |
| 4 | Pas de halo dans les leçons | **Corrigé** | Halo violet sur ▶ (`2/parcours-ch1-1366.png`) et sur la waveform au chapitre 5 (`2/parcours-ch5-1366.png`). |
| 5 | Pas d'auto-mix | **Corrigé** | Panneau Auto-mix avec style, durée, file d'attente et suggestions (`2/automix-1366.png`). Le texte est à polir (« 5A frotte avec 8A »), et il suggère « Quai 9 », déjà chargé sur B. |
| 6 | Pas de navigation clavier dans la bibliothèque | **Partiel** | Flèches, Entrée, Maj+←/→ et « / » marchent. Mais la ligne sélectionnée se voit à peine (`2/biblio-menu-contextuel-1366.png`), et Tab a été pris pour le plein écran (problème n° 10). |
| 7 | Raccourcis QWERTY | **Corrigé** | Touches par position physique, modifiables (`2/reglages-controleur-1366.png`). |
| 8 | Alerte du coach sur les waveforms | **Partiel** | Elle n'est plus sur les waveforms, mais elle couvre maintenant les lignes 3 et 4 de la bibliothèque, et elle répète le message déjà affiché dans le panneau (`2/coach-mauvaise-transition-1366.png`). |
| 9 | Bugs « Silence » et « fader encore bas » | **Corrigé** (d'après le journal et `test/coach.js`, pas revérifié à la main) | |
| 10 | Titres réduits à 1 lettre en 4 platines | **Corrigé** | Titres complets (`2/4p-perf-1366.png`). En revanche, **le temps restant a disparu** des platines compactes (problème n° 5). |
| 11 | Textes trop petits, contraste, zoom | **Partiel** | Zoom Ctrl +/− et Mode scène ajoutés, contraste relevé. Mais en Studio à 1366, **172 textes sur 296 font encore 10 px ou moins** (52 en 9 px, 16 en 9,5 px). Le Mode scène est inaccessible à 1366 (problème n° 4). |
| 12 | « ÷2 » lu « +2 », RELOOP coupé | **Corrigé** | « /2 » et « ×2 », RELOOP entier. La notation n'est pas uniforme : « /2 » pour la boucle, « ½ » pour la grille. |
| 13 | Rien de persistant sur le web | **Corrigé** | IndexedDB pour la bibliothèque, l'analyse et le sampler (`library-pro.js`, `persist.js`, `perf.js`). |
| 14 | Playlists inutilisables, recherche contiguë | **Corrigé** | Double-clic pour renommer, clic droit pour le menu ; « 124 house » et « house 124 » donnent le même résultat. |
| 15 | Waveforms coûteuses | **Partiel** | Dessin par tuiles. 4 platines à 1366 : 17,0 ms en moyenne, 5 images sur 236 au-delà de 20 ms. **Avec le processeur ralenti ×4 : 38,1 ms en moyenne (environ 26 i/s), p95 66,7 ms, 85 images sur 106 au-delà de 20 ms** (68,6 ms avant). C'est mieux, mais un portable d'entrée de gamme saccade encore (problème n° 15). |
| — | Échap ne ferme pas les modales | **Corrigé** | |
| — | Polices sur Google Fonts | **Corrigé** | woff2 dans `app/fonts`. |
| — | CONSEILS et COACH côte à côte | **Partiel** | CONSEILS a disparu, mais il y a maintenant **PARCOURS et COACH** côte à côte, et le panneau Coach contient lui aussi le parcours. Les deux portes mènent au même endroit. |
| — | Glossaire, infobulles du jargon | **Corrigé dans le parcours** | Les mots soulignés ouvrent leur définition. Hors parcours, rien pour CUP, CT, VERROU (problème n° 9 et quick wins). |
| — | Ouvrir le coach change la forme des platines | **Partiel** | Platine A : 524×279 sans coach, 353×309 avec. Elle reste « compacte » dans les deux cas, ce qui est mieux, mais tout se redistribue encore. |
| — | Latence de 42 ms | **Non corrigé** | Toujours affichée sans avertissement ni réglage (`2/reglages-audio-1366.png`). |

---

## 3. Top 15 des nouveaux problèmes (par impact)

### 1. Le menu « Affichage » ne s'ouvre pas : il est rogné par la barre du haut
- **Ce que j'ai vu** (`2/affichage-menu-1366.png`) : un clic sur AFFICHAGE ouvre bien le `<details>` (`open=true`), mais son panneau de 260×569 px est découpé par `#top{overflow:hidden}` (`index.html`, ligne 861). Sous le bouton, on ne voit qu'un trait de 2 px, et `elementFromPoint` au milieu du panneau renvoie `.fxu`. C'est pareil à 1600.
- **Pourquoi c'est grave** : ce menu sert de tiroir à tout le reste : panneaux affichés, couleurs des waveforms, zoom, hauteur et zoom des waveforms, taille des platines, Mode scène, bibliothèque plein écran, « Réglages de jeu… » (mode CUE CDJ/Denon, sens du pitch, sync à la mesure, courbes des faders, enregistrement), plage d'analyse BPM (`perf.js`, ligne 134). **Un pro ne peut atteindre aucun de ces réglages à la souris.** Les tests passent parce qu'ils appellent `DeckPro.openSettings()` directement.
- **Correction** : sortir le panneau du flux de `#top`. Le plus simple : attribut `popover` (couche supérieure, jamais rogné) ou `position:fixed` calculée depuis le bouton. Ajouter dans `test/layout.js` un test de visibilité réelle (elementFromPoint) du panneau ouvert.
- **Effort** : S.

### 2. Le preset Performance n'a ni pads, ni boucles, ni pitch à 1366×768
- **Ce que j'ai vu** (`2/preset-perf-1366.png`, à comparer avec `2/preset-perf-1600.png`) : à 1366, `View.fit` passe les platines en taille `mini` (`.sz-mini .dk-pitch, .dk-pads, .dk-loop{display:none}`, ligne 964). Il ne reste que CUE, ▶, SYNC et MASTER, sous une vue d'ensemble étirée sur **130 px de haut** qui n'apporte rien de plus que la vue d'ensemble de 34 px.
- **Pourquoi c'est grave (pro)** : le preset qui s'appelle « Performance » perd justement les commandes de performance sur l'écran visé. Un DJ habitué aux pads ne trouve plus ses hot cues.
- **Correction** : dans `View.fit` (`view.js`), avant de passer en `mini`, d'abord (1) réduire la part de la bibliothèque à 0,30 sous 800 px de haut (aujourd'hui `lib:.45`), (2) replier la rangée FX sur une ligne de 34 px, (3) limiter `.dk-ov` à 34 px. Et en `mini`, garder au moins la rangée de 8 pads et la boucle.
- **Effort** : M.

### 3. L'interface du parcours « grandit » mal : des commandes avancées passent, et tout reste affiché
- **Ce que j'ai vu** (`2/parcours-ch1-1366.png`, `2/parcours-ch2-1366.png`) : au chapitre 1 (« Bienvenue »), KEY LOCK, SLIP, REV et CENSOR sont actifs et en pleine lumière sur A et B, alors que SYNC et MASTER sont gris. AUTO-MIX, CONTRÔLEUR, AUDIO et BIBLIO sont actifs. Au chapitre 2 (« Lire un morceau »), toute la bibliothèque pro s'ouvre : IMPORT/EXPORT, COMPATIBLES, crates intelligentes, pré-écoute. L'étiquette « 🔒 Débloqué au chapitre 4 » est posée sur les boutons SLIP et REV et se lit mal.
- **Pourquoi c'est grave (débutante)** : la promesse « une commande à la fois » n'est pas tenue. En gris, les commandes restent visibles : Léa voit toujours plus de 150 commandes, et 7 boutons avancés répondent à ses clics.
- **Correction** :
  - dans `LOCKS` (`parcours.js`, ligne 117), le sélecteur `.dk-ctr .r:nth-child(2)` ne vise plus la bonne rangée depuis l'ajout des rangées de `deck-pro.js`. Le remplacer par `[data-ctl$=".keylock"],[data-ctl$=".slip"],[data-ctl$=".rev"],[data-ctl$=".censor"]` ;
  - ajouter `#am-btn`, `#midi-btn` et la barre d'outils de la bibliothèque (sauf la recherche) avec un déverrouillage tardif ;
  - pour les chapitres 1 à 4, passer en mode `'hide'` plutôt que griser (pads, boucles, rangées pro) ;
  - dans `test/parcours.js`, compter les commandes actives et non verrouillées à chaque chapitre, avec un plafond par chapitre.
- **Effort** : M.

### 4. Le Mode scène est inaccessible à 1366, et il change trop peu
- **Ce que j'ai vu** : `@media (max-width:1500px){#stage-btn{display:none}}` (ligne 870), et son autre accès est dans le menu Affichage rogné (n° 1). Aucun raccourci clavier. Une fois activé (`2/scene-perf-1366.png`), la barre du haut déborde : « COAC » est coupé, et le bouton plein écran et le placeholder de recherche (« Rechercher (/ ou Ctrl+F ») disparaissent. Le gain est faible : BPM de 22 à 26 px, waveforms pas plus hautes, potards identiques. À 1600 (`2/scene-perf-1600.png`), « CASQUE » touche « GAIN » et « LOW FILTRE » se chevauchent.
- **Pourquoi c'est grave (pro, cabine sombre)** : c'est la fonction pensée pour le portable en cabine, et elle n'existe pas sur le portable.
- **Correction** : un bouton icône toujours visible (ou dans un menu « ⋯ » de débordement), un raccourci (F9, par exemple) et `#top` qui replie ses boutons dans « ⋯ » au lieu de les couper. En scène, faire vraiment les choses : waveforms +40 %, temps restant à 32 px, FX repliés, libellés en 11 px minimum, potards en 28 px.
- **Effort** : M.

### 5. Le temps restant disparaît des platines compactes
- **Ce que j'ai vu** (`2/preset-ecole-1366.png`, `2/4p-perf-1366.png`) : en École à 1366, l'en-tête de platine ne montre que TONALITÉ et BPM. En 4 platines Performance, c'est pareil. Le temps restant n'est plus que dans la lane, en 10 px, en haut à droite.
- **Pourquoi c'est grave (les deux profils)** : c'est l'information n° 1 en live. Pour la débutante, c'est l'alerte « prépare la suite ».
- **Correction** : ne jamais masquer RESTANT. En compact, masquer d'abord le libellé TONALITÉ (le badge Camelot coloré suffit), puis le nom de l'artiste. Ajouter le cas dans `test/layout.js`.
- **Effort** : S.

### 6. Le bandeau du coach couvre la bibliothèque et répète le panneau
- **Ce que j'ai vu** (`2/coach-mauvaise-transition-1366.png`) : « Tempos pas calés : B plus rapide de 3.0 BPM » s'affiche en bas au centre (`.coach-hud{position:fixed;bottom:14px}`, ligne 598), par-dessus les lignes 3 et 4 de la bibliothèque. Le même texte est déjà en rouge dans le panneau Coach ouvert à droite. Le toast du bilan (« Transition A → B : 25/100 ») se pose au même endroit (`2/coach-bilan-1366.png`).
- **Pourquoi c'est grave** : pendant une transition, on cherche justement le morceau suivant dans la bibliothèque.
- **Correction** : masquer le bandeau quand le panneau Coach est visible. Sinon, le placer dans une zone réservée qui ne cache aucune donnée, par exemple dans la poignée de séparation entre platines et bibliothèque (`.split`), qui deviendrait une barre de 28 px quand une alerte est active.
- **Effort** : S.

### 7. Le mixer est trop petit pour jouer
- **Ce que j'ai vu** (`2/preset-studio-1366.png`, `2/preset-mix-1366.png`) : faders de voie de **58 px de course** (mesuré : 26×58), potards d'environ 16 px, boutons Kill en **carrés de 8 px sans libellé** à côté de HI, MID et LOW, VU-mètres de 4 px. Deux listes (Filtre, EQ iso, Mix) occupent la place centrale. À côté, chaque platine a une vue d'ensemble de 130 px de haut à moitié vide.
- **Pourquoi c'est grave** : à la souris, une course de 58 px donne environ 1,7 % de volume par pixel, donc impossible de faire une montée propre. Le coach demande « coupe le LOW de B » sur un potard de 16 px.
- **Correction** : faders de 110 px minimum, potards de 28 px, kill intégré (Maj+clic ou appui long sur le potard, avec un anneau rouge) ou bouton « K » de 18 px, VU à 10 segments. Déplacer les trois listes dans les réglages (n° 9). Rendre au mixer la hauteur prise par les vues d'ensemble.
- **Effort** : M.

### 8. Tableau de bibliothèque : débordement, colonnes vides, barre d'outils sur deux lignes
- **Ce que j'ai vu** (`2/preset-mix-1366.png`, `2/preset-ecole-1366.png`) : en Mix et en École à 1366, la colonne TAGS est coupée (« T ») et CHARGER est hors champ. COULEUR et TAGS sont vides, et JOUÉ affiche 0 partout. La barre d'outils passe sur deux lignes, avec à droite un rectangle vide qui ressemble à un champ de saisie (c'est la barre de pré-écoute à l'arrêt).
- **Pourquoi c'est grave (pro)** : on perd la colonne de chargement. Et ce rectangle vide fait croire à un champ cassé.
- **Correction** : un jeu de colonnes par défaut selon la largeur du tableau (sous 1 100 px : masquer Couleur, Tags, Joué et Genre ; afficher la couleur en liseré de ligne). Masquer la barre de pré-écoute tant qu'aucune pré-écoute ne joue. Déplacer « N morceaux » dans la barre latérale.
- **Effort** : S.

### 9. Les réglages sont éparpillés, et le JSON brut est montré
- **Ce que j'ai vu** : Audio (fenêtre), Contrôleur (fenêtre avec un **JSON brut** au milieu, `2/reglages-controleur-1366.png`), Réglages de jeu (dans Affichage, donc invisibles), plage BPM et couleurs de waveform (Affichage), niveau du coach (panneau Coach), style d'auto-mix (panneau Auto-mix), Filtre et EQ iso (listes dans le mixer). Le jargon n'est pas expliqué : CUP, CT, VERROU, MÉTRO (`2/preset-export-1366.png`).
- **Pourquoi c'est grave** : un pro qui arrive de rekordbox ou Serato cherche une fenêtre « Préférences ». Une débutante a peur d'un texte JSON.
- **Correction** : une seule fenêtre « Préférences » (Ctrl+,) avec onglets Audio, Jeu, Mixer, Affichage, Analyse et bibliothèque, Contrôleurs, Clavier, Coach, et un champ de recherche. Le JSON passe sous « Avancé ». Le menu Affichage ne garde que l'affichage.
- **Effort** : M.

### 10. Tab ouvre la bibliothèque plein écran et casse la navigation au clavier
- **Ce que j'ai vu** : `view.js`, ligne 324 : Tab sans modificateur bascule la bibliothèque plein écran, sauf dans un champ de saisie.
- **Pourquoi c'est grave** : Tab est la touche standard pour passer de commande en commande. Une personne qui navigue au clavier ou au lecteur d'écran ne peut plus atteindre les boutons (WCAG 2.1.1). Le focus visible noté dans la critique 1 ne sert plus à rien.
- **Correction** : une touche dédiée (F2, ou Ctrl+B), modifiable dans la liste des raccourcis, et garder Tab pour le focus.
- **Effort** : S.

### 11. Audio : 42 ms de latence sans explication ni réglage
- **Ce que j'ai vu** (`2/reglages-audio-1366.png`) : « Latence de sortie : 42 ms · 44100 Hz ». Pas de taille de tampon, pas de bouton de test, la liste « Sortie master » est vide dans le navigateur, et l'option casque est coupée (« bouton Split pour… »).
- **Pourquoi c'est grave (pro)** : au-delà de 20 ms, le cue, le nudge et le scratch se sentent en retard. Sans explication, le pro conclut que « le logiciel est mou ».
- **Correction** :
  - un message honnête : « 42 ms : correct pour mixer, trop pour scratcher ; l'appli de bureau descend à X ms » ;
  - un choix `latencyHint` (« interactive » ou « playback »), un bouton « Tester la sortie » et une liste élargie ;
  - côté Tauri, un choix de tampon ;
  - à terme, brancher le moteur natif (lot C de PARITE.md).
- **Effort** : M pour l'interface, L pour le moteur.

### 12. Bibliothèque : ligne sélectionnée invisible, menu contextuel incomplet
- **Ce que j'ai vu** (`2/biblio-menu-contextuel-1366.png`) : après ↓ ↓, la ligne « Quai 9 » n'est que très légèrement plus claire. Le menu contextuel propose Modifier, Charger sur A ou B et Ajouter à une playlist, mais pas « Ajouter à la file auto-mix », « Pré-écouter », « Retirer de la playlist », « Analyser à nouveau » ni « Afficher le fichier ».
- **Pourquoi c'est grave (pro)** : en cabine sombre, le curseur de navigation doit sauter aux yeux. La file auto-mix est la fonction n° 1 de Sophie.
- **Correction** : ligne sélectionnée avec un liseré de 3 px dans la couleur d'accent, un fond nettement plus clair et un texte blanc. Ajouter les 5 entrées au menu (`rowMenu`, `library-pro.js`).
- **Effort** : S.

### 13. L'Académie est lue dans une colonne de 340 px, à côté d'un mixer allumé
- **Ce que j'ai vu** (`2/academie-1366.png`, `2/academie-cours-1366.png`) : cours, « à retenir », quiz, et plus loin la courbe d'énergie à dessiner, tout passe dans le panneau Coach étroit. Les platines restent affichées à gauche, sans rapport avec la lecture.
- **Pourquoi c'est grave (débutante)** : on lit mal une colonne de 6 mots par ligne. Une courbe à dessiner sur 300 px est imprécise. Le contenu est bon, mais sa présentation le dessert.
- **Correction** : un mode « Lecture » : l'Académie occupe la zone platines et bibliothèque sur une colonne de 680 à 720 px centrée, avec un bouton « Retour aux platines » et Échap. Les exercices liés à la bibliothèque rouvrent la bibliothèque à côté.
- **Effort** : M.

### 14. Effets : le mode Chaîne est illisible, et la rangée FX coûte cher en hauteur
- **Ce que j'ai vu** (`2/fx-chaine-full-1366.png`) : en Chaîne, trois listes et trois potards **sans libellé**, avec des cases « 1 », « 2 », « 3 » dont on ne comprend pas le rôle. La durée en temps est un « 1 » entre ‹ ›. Le bouton ON est violet, la couleur réservée au coach. La rangée FX prend environ 70 px en Performance et Studio, même effets coupés.
- **Pourquoi c'est grave (pro)** : on lance un effet à l'aveugle. En Performance, c'est cette hauteur qui fait passer les platines en `mini` (n° 2).
- **Correction** : libellé sous chaque potard (nom de l'effet ou du paramètre), durée en sélecteur segmenté (¼ ½ 1 2 4 8), ON allumé dans la couleur de la platine ciblée, et une rangée repliable à 34 px (nom de l'effet, Dosage, ON) quand aucun effet ne joue.
- **Effort** : M.

### 15. Encore environ 26 images par seconde sur un portable lent
- **Ce que j'ai vu** : 4 platines en lecture à 1366, processeur ralenti ×4 : 38,1 ms par image en moyenne, p95 à 66,7 ms, 85 images sur 106 au-delà de 20 ms.
- **Pourquoi c'est grave (débutant, public gratuit)** : le premier ordinateur d'un débutant est souvent lent, et une waveform qui saccade rend le calage visuel impossible.
- **Correction** :
  - ne pas redessiner les lanes et vues d'ensemble des platines à l'arrêt (à vérifier dans `frame()`) ;
  - dessiner la vue d'ensemble une seule fois par morceau et ne mettre à jour que la tête de lecture (un calque) ;
  - plafonner à 30 i/s quand la fenêtre n'a pas le focus, et proposer « Animations réduites » dans les préférences ;
  - mesurer dans `test/perf.js` avec le ralentissement ×4 comme seuil.
- **Effort** : M.

**Juste en dessous** :
- Studio et Mix sont presque identiques à 1366 (`2/preset-studio-1366.png` et `2/preset-mix-1366.png`).
- Le texte de l'auto-mix est à polir : « frotte », trois suggestions notées 49, 49 et 45 sur fond gris, et « Quai 9 » suggéré alors qu'il est déjà sur B.
- Le pad Pitch « 0 » est illisible (texte blanc sur magenta) et les noms du sampler sont coupés (« mbobina », `2/pads-montage.png`).
- Le tempo maître affiche « — » sans libellé quand rien ne joue.
- Il reste deux blocs `:root` concurrents dans `index.html` (lignes 16 et 405), avec deux palettes de platines différentes (C vert puis rose, D violet puis vert).

---

## 4. Style visuel : une direction pour un rendu de logiciel pro

jules trouve le style faible, et il a raison sur un point précis : **tout a le même poids**. Le fond est bon (noir, trois niveaux, coins arrondis, polices Inter et JetBrains Mono embarquées). Ce qui manque, c'est une hiérarchie, une discipline de la couleur et une waveform qui a de la matière. Voici une direction, sans reprendre l'habillage d'aucune marque.

### 4.1 Trois niveaux de hiérarchie, et seulement trois
| Niveau | Contenu | Traitement |
|---|---|---|
| **1 · Vital en live** | temps restant, BPM, waveforms, tête de lecture, état lecture, phase, alerte du coach | grand (24 à 32 px en chiffres), blanc pur ou couleur de platine, **seul niveau autorisé à briller** |
| **2 · Jeu** | potards, faders, pads, boucle, SYNC, CUE | taille moyenne, fond plein `--s2` sans contour, texte `--tx` ; couleur **seulement quand c'est actif** |
| **3 · Réglage** | presets, Quantize, Gain auto, listes, modes, onglets de pads | petit, `--mu`, sans fond au repos ; regroupé dans des menus ; jamais en majuscules espacées |

**Avant** (`2/preset-studio-1366.png`) : SYNC, MASTER, KEY LOCK, SLIP, REV, CENSOR, IN, OUT, RELOOP, LOOP, les 7 onglets de pads et les 8 pads ont tous le même rectangle à contour gris, en majuscules de 10 px. L'œil ne sait pas où aller. Le seul élément qui crie est **le CUE jaune plein de la platine à l'arrêt**.
**Après** : ▶ et CUE restent les deux gros boutons, mais CUE est neutre au repos (fond `--s3`, texte ambre) et ne s'allume en plein que pendant l'appui ou le clignotement « prêt ». SLIP, REV et CENSOR passent dans une rangée « pro » en niveau 3 (petits, sans contour, texte `--mu`), allumés dans la couleur de la platine seulement quand ils sont actifs. Le temps restant et le BPM sont les plus gros éléments de la platine.

### 4.2 La couleur : réservée, pas décorative
- **Identité des platines** : A, B, C et D n'apparaissent que sur la pastille de lettre, un liseré de 2 px en haut du panneau, la tête de lecture et l'état actif (▶ allumé, SYNC allumé). Rien d'autre.
- **États** : vert pour « calé / compatible », ambre pour « attention / cue », rouge pour « erreur / fin de morceau / saturation ». Ils ne servent à rien d'autre.
- **Violet** : uniquement le coach (halo, panneau, parcours). Aujourd'hui, le ON des FX et les curseurs des réglages sont violets, ce qui brouille le message « c'est le prof qui parle ».
- **Conflit à régler** : B est orange (#ff8f3a) et CUE ambre (#f5b83d). Sur la platine B, CUE et ▶ se confondent. Pousser B vers un orange plus rouge, ou rendre CUE neutre (voir 4.1).
- **Tonalité** : le badge Camelot reste coloré (c'est une convention du métier), mais en **contour et texte** au repos, et **plein** seulement quand la tonalité est compatible avec la platine maître. Aujourd'hui, toute la colonne est un arc-en-ciel de pastilles pleines.
- **Jetons** : un seul bloc `:root` (supprimer celui de la ligne 16), des jetons sémantiques (`--live`, `--state-ok`, `--state-warn`, `--state-bad`, `--deck-a…d`, `--coach`, `--surface-0…3`, `--text-hi/mid/lo`) et un bloc pour la scène. Interdire les couleurs en dur dans `app.js`.

### 4.3 Typographie
- Une échelle courte : **11 / 13 / 16 / 24 / 32 px**. **Rien sous 11 px**. Aujourd'hui, 172 textes visibles sur 296 font 10 px ou moins.
- Majuscules espacées **seulement** pour les titres de section (COLLECTION, PLAYLISTS, MASTER). Boutons et libellés en casse normale, graisse 500 : « Sync », « Key lock », « Boucle ». Cela se lit mieux en petit et paraît moins « interface de test ».
- Chiffres en JetBrains Mono, avec `font-variant-numeric: tabular-nums`. Le BPM en 600, le temps restant en 700. En Mode scène : 32 et 40 px.
- Libellés de potards sous le potard, centrés, en 11 px `--mu`. Fini les « LOW FILTRE » collés.

### 4.4 Waveforms : passer du « vu-mètre arc-en-ciel » au relief
- **Avant** (`2/preset-perf-1366.png`) : trois bandes en rouge, vert et bleu purs à 100 % de saturation. La vue d'ensemble étirée sur 130 px est un mur de couleur. Le passé est assombri mais garde la même teinte criarde.
- **Après** :
  - **palette 3 bandes adoucie** : graves en bleu profond (#2b5cff à 85 %), médiums en ambre doux (#f0a54a à 70 %), aigus presque blancs (#e8ecf2 à 90 %), superposés en ordre graves, médiums, aigus, avec un léger dégradé vertical vers le centre. Le kick doit ressortir comme une masse, le charley comme une crête claire ;
  - option « monochrome » teintée par la couleur de la platine, où la luminosité donne l'énergie ;
  - **passé** désaturé à 35 % et assombri : on voit d'un coup d'œil ce qui est joué ;
  - **grille** : petits traits en haut et en bas de la lane (pas sur toute la hauteur), le temps 1 de chaque mesure plus long et le début de phrase marqué par un fanion numéroté. Aujourd'hui, les traits pleine hauteur hachent la forme ;
  - **tête de lecture** : 2 px blanc pur avec un halo de 6 px, et un petit triangle en haut et en bas ;
  - **repères** : triangles dans la couleur du cue, avec le numéro dans le triangle ; sections (intro, drop…) en bandeau de 4 px sous la lane, et non en texte sur la forme ;
  - **vue d'ensemble** : 24 à 28 px partout, jamais étirée. La place gagnée revient aux lanes défilantes (90 px par platine à 1366 en 2 platines).

### 4.5 Potards et faders
- **Potards** : 28 à 32 px. Un anneau de valeur (arc de 270°) **bipolaire pour les EQ** (il part du centre), unipolaire pour le gain, le filtre et le dosage. Arc dans la couleur de la platine quand la valeur n'est pas neutre, gris quand elle l'est : un mixer neutre est calme, un EQ touché se voit. Kill : arc rouge et capuchon barré. Le capuchon est sombre avec un trait indicateur clair.
- **Faders** : rail fin (4 px) avec des graduations (0, −6, −12, −∞), capuchon de 36×16 px avec un trait central, course de 110 px au moins. VU à 10 segments à côté (vert, puis ambre, puis rouge), avec un pic qui reste affiché 1 s.
- **Crossfader** : rail plus large, graduation centrale, capuchon de 20×28 px.
- **Pads** : 40 px de haut au moins, coins de 8 px. Un pad attribué est **rempli à 25 %** de sa couleur et passe à 100 % à l'appui. Un pad vide n'a qu'un contour en pointillés, sans « · ». Le nom du cue en 11 px dans le pad.

### 4.6 Densité et espacement
- Une grille de 8 px. 12 px de marge intérieure dans les panneaux. Les groupes sont séparés **par l'espace et des fonds différents, pas par des contours** : la plupart des contours de boutons doivent disparaître (fond `--s2`, survol `--s3`).
- Moins de commandes visibles : 169 en Studio à 1366. Avec une rangée « pro » repliable par platine, des onglets de pads en liste déroulante sous 440 px et les listes du mixer dans les préférences, on descend vers 110 sans rien perdre.
- La barre du haut se regroupe en trois zones : à gauche la marque et le preset ; au centre, en niveau 1, le tempo maître, l'horloge et REC ; à droite les boutons outils (Biblio, Auto-mix, Coach) et un menu « ⋯ » qui reçoit ce qui ne tient pas, au lieu de couper.

### 4.7 Ce qui fait l'identité de Mixlab
Le compteur de phrase (P1…P8), les bilans notés et le halo violet du coach n'existent nulle part ailleurs. Ce sont eux qu'il faut mettre en avant : compteur de phrase en grand au-dessus des lanes en Mix et École, et une couleur coach rare, réservée, donc précieuse.

---

## 5. Quick wins (moins de 30 minutes chacun)

1. `index.html` ligne 861 : supprimer `#top{overflow:hidden}` et mettre le panneau de `details.menu` en `position:fixed` (ou `popover`). Le menu Affichage réapparaît (n° 1).
2. Supprimer `@media (max-width:1500px){#stage-btn{display:none}}` (bouton icône à la place) et ajouter un raccourci F9 pour le Mode scène.
3. `parcours.js`, `LOCKS` : remplacer `.dk-ctr .r:nth-child(2)` par les sélecteurs `data-ctl` de keylock, slip, rev et censor, et ajouter `#am-btn` au chapitre 13.
4. Ne jamais masquer le RESTANT des platines compactes et mini (`.dk-stat`).
5. Masquer `.coach-hud` quand `#p-coach` est visible.
6. Masquer la barre de pré-écoute tant qu'aucune pré-écoute ne joue.
7. Ligne sélectionnée de la bibliothèque : liseré de 3 px dans la couleur d'accent et fond plus clair.
8. Colonnes Couleur et Tags masquées par défaut sous 1 500 px de large.
9. Remplacer Tab par F2 pour la bibliothèque plein écran.
10. Uniformiser « /2 » et « ½ » : écrire « ½ » partout, ou « /2 » partout.
11. Infobulles : CUP → « Cue Play », CT → « Transposition en centièmes de demi-ton », VERROU → « Verrouiller la grille ».
12. Auto-mix : « frotte avec » → « peu compatible avec », et ne pas suggérer un morceau déjà chargé sur une platine.
13. Pad Pitch « 0 » : texte foncé sur fond magenta. Noms du sampler : coupure au mot ou police de 10 px condensée.
14. Bouton ON des FX allumé dans la couleur de la platine ciblée, pas en violet.
15. Liste « Sortie casque » : `min-width:100%` et texte court (« Même carte que le master »).
16. Tempo maître : masquer « — » quand aucune platine ne joue, ou afficher « Pas de maître ».
17. Supprimer le premier bloc `:root` (ligne 16) pour n'avoir qu'une palette.

---

### Annexe : captures (`docs/critiques/2/`)

- **Presets** : `preset-{perf,export,studio,mix,ecole}-{1366,1600}.png`, `4p-perf-1366.png`, `4p-mix-1366.png`
- **Accueil et parcours** : `welcome-1366.png`, `parcours-ch1-1366.png`, `parcours-ch2-1366.png`, `parcours-ch5-1366.png`
- **Académie** : `academie-1366.png`, `academie-cours-1366.png`
- **Coach** : `coach-mauvaise-transition-1366.png`, `coach-mauvaise-transition-1600.png`, `coach-bilan-1366.png`
- **Mode scène** : `scene-perf-1366.png`, `scene-perf-1600.png`
- **Bibliothèque** : `biblio-plein-ecran-1366.png`, `biblio-menu-contextuel-1366.png`
- **Réglages** : `reglages-audio-1366.png`, `reglages-controleur-1366.png`, `reglages-jeu-1366.png`, `affichage-menu-1366.png` (le menu ouvert n'apparaît pas : c'est le bug n° 1)
- **Effets et pads** : `fx-chaine-full-1366.png`, `pads-montage.png` (les 7 modes, de haut en bas : Hot cue, Roll, Saut, Slicer, Boucles, Pitch, Sampler), `pads-editeur-cue-1366.png`
- **Auto-mix** : `automix-1366.png`

Les captures sont réduites à 256 couleurs pour rester légères (environ 2 Mo au total).
