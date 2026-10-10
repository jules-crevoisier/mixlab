# Audit : ce qui fait « généré par IA » dans Mixlab

10 octobre 2026, branche `finitions` (commit `c38fdc0`), avant la passe « console ».

jules trouve que l'interface « fait trop IA ». J'ai repris l'appli telle quelle dans Chromium
headless (Playwright, `file://app/index.html`) en 1366 × 768 et 1600 × 950 : presets Performance,
Mix et École, 4 platines, mode scène, premier lancement (`#welcome`), parcours (chapitres 1 et 5),
Académie (liste et leçon), coach pendant une transition ratée (panneau et bandeau), menus
(Affichage, clic droit sur une ligne), fenêtres Contrôleur et Audio, panneau Auto-mix.
Les captures citées sont dans [`v2/avant/`](v2/avant/) ; les mêmes vues après correction sont
dans [`v2/apres/`](v2/apres/).

Le fond était sain (noir, chiffres à chasse fixe, hiérarchie de la critique 2). Ce qui trahissait
le gabarit, ce sont des réflexes de tableau de bord SaaS posés sur un logiciel de cabine.

## 1. Les indices relevés

| # | Indice | Où | Capture (avant) |
|---|---|---|---|
| 1 | **Accent violet** `#a78bfa` (le violet-400 des kits d'interface) sur tout ce qui touche au coach : boutons « Commencer » et « Continuer » pleins, sur-titres, halo, pastilles, focus clavier, MIDI Learn, curseurs | coach, parcours, académie, barre du haut | `coach-1366`, `parcours-1366`, `academie-1366` |
| 2 | **Écran d'accueil de page d'atterrissage** : fenêtre centrée sur fond flouté (`backdrop-filter`), sur-titre violet en capitales espacées « BIENVENUE DANS MIXLAB », grosse question amicale « Tu as déjà mixé ? », deux cartes côte à côte, puces de marques dans un cadre pointillé | premier lancement | `welcome-1366` |
| 3 | **Sur-titres en capitales espacées partout** (`letter-spacing .14–.18em`) : COACH, PARCOURS · CHAPITRE 1/14, ÉTAPE 1/7, MODULE 1 · CONSTRUIRE UN SET, RESTANT, TONALITÉ, COLLECTION, PLAYLISTS, MASTER, « M I X L A B » | partout | `perf-1600`, `coach-1366`, `academie-1366` |
| 4 | **Tout est une carte** : panneaux à 8–10 px de rayon flottant sur le fond, cartes empilées dans le coach, chaque leçon de l'Académie dans sa tuile arrondie avec un numéro dans un rond | coach, académie, carte du parcours | `coach-1366`, `academie-1366` |
| 5 | **Rayons uniformes et pilules** : boutons à 6 px, pads à 8 px, badges à 20 px (« pilules »), puces de tags à 9 px | partout | `perf-1366`, `parcours-ch5-1366` |
| 6 | **Halos et lueurs** : Play allumé avec halo coloré, tête de lecture avec halo blanc, pad appuyé, bouton On des effets, voyants ronds avec `box-shadow` lumineux | platines, effets, barre du haut | `perf-1600`, `mix-1600` |
| 7 | **Unicode et emoji en guise d'icônes** : ▶ ◀ ◁ ▷ ▴ ▾ ☰ ⋯ ⛶ ● ■ ○ ✓ ★ ⚡ ⚙ ↻, 🔒 sur les panneaux verrouillés, 🏅 sur les badges, ⚡ devant les crates et les énergies, ✓ dans les toasts | platines, bibliothèque, parcours, académie | `perf-1366`, `parcours-1366`, `academie-1366`, `menu-ligne-1366` |
| 8 | **Notes en étoiles ★★★★★** décoratives dans le tableau | bibliothèque | `perf-1600` |
| 9 | **Potards « rond + arc »** : un disque en dégradé radial, un arc fin, aucun repère de graduation, aucune matière | mixer, effets | `perf-1600` |
| 10 | **Faders de navigateur** : `input range` à peine maquillé, rail plat, capuchon arrondi lisse | mixer, pitch | `perf-1600` |
| 11 | **VU en barres colorées sur fond vide** : les diodes éteintes disparaissent, rien ne ressemble à une rangée de LED | mixer | `perf-1600` |
| 12 | **Arc-en-ciel décoratif** : badges Camelot saturés (jaune, violet, rose, rouge), pads de modes en magenta, violet, cyan, jaune | bibliothèque, platines | `perf-1600`, `mix-1600` |
| 13 | **Gris bleutés « slate »** (`#111317`, `#191c21`, `#2a2e36`) : la teinte par défaut des thèmes sombres générés | fonds | toutes |
| 14 | **Inter partout, sans parti pris** : mêmes graisses, mêmes tailles pour libellés, boutons et légendes ; la seule autre police (JetBrains Mono) réservée aux chiffres | partout | toutes |
| 15 | **Ton bavard ou enjoué** : « Chapitre réussi ! » avec 🏅, « Bravo, leçon réussie. », « Piste sauvée ! », « Break ! », « Drop ! », « Ton set est fini ! », « Les grosses caisses vont « galoper » », « Rien à signaler. Le coach écoute le mix. », « Tu n'as jamais touché une platine ? » | coach, parcours, académie | `coach-1366`, `parcours-ch5-1366` |
| 16 | **Pointillés et hachures « état vide »** : pads vides en pointillé, cadre pointillé autour des marques, panneaux verrouillés en capitales espacées avec un cadenas emoji | platines, accueil, parcours | `perf-1366`, `welcome-1366`, `parcours-1366` |
| 17 | **Bouton thème « ◑ »** et plein écran « ⛶ » en caractères, qui sautaient ou se coupaient à droite de la barre | barre du haut | `coach-1366` |
| 18 | **Deux touches pleines concurrentes** dans le coach : deux « Commencer » violets pleins l'un sous l'autre, plus le bouton de l'étape | coach | `coach-1366` |

Ce qui n'était **pas** un problème et que j'ai gardé : la disposition des presets, la hiérarchie à
trois niveaux, les waveforms en trois bandes, le compteur de phrase, les menus jamais rognés.

## 2. Ce qui a été fait

La direction s'appelle « console » : une façade de matériel de cabine, mate et sérigraphiée.

| # | Correction |
|---|---|
| 1 | Coach en **vert anis** `#c5d64b` (la couleur d'un voyant « learn »), réservé : une seule touche pleine à la fois (l'étape en cours), liseré de l'étape, halo, voyant du bouton Coach. Les « Commencer » de la liste des cours deviennent secondaires. Plus aucun violet dans l’interface (focus en blanc, MIDI Learn au vert anis) ; il ne reste que les couleurs que l’utilisateur choisit lui-même pour ses morceaux et ses hot cues. |
| 2 | Premier lancement réécrit en **feuille de réglage** : barre de titre « Mixlab · premier lancement », une phrase d'explication, une liste « Ton niveau » (deux lignes cliquables avec durée et chevron), une rangée « Disposition proche de ton logiciel habituel », un pied avec `Échap`. Pas de flou, alignée en haut, à gauche. Mêmes identifiants, mêmes effets immédiats. |
| 3 | **Légendes sérigraphiées** : JetBrains Mono 11 px, casse normale, sans espacement (`Restant`, `Tonalité`, `Module 1 · Construire un set`). Marque « Mixlab » en Inter 700 sans espacement. |
| 4 | **Modules au lieu de cartes** : les panneaux sont posés sur un joint noir de 3 px, rayon 3 px, arête claire d'un pixel en haut. Le coach, le parcours et l'Académie sont des **sections séparées par un filet** ; les chapitres et les leçons sont des **lignes de liste**, numéro dans un carré. |
| 5 | Rayons ramenés à 2, 3 et 4 px ; plus de pilules (badges, tags, chips à 2 px). |
| 6 | **Aucun halo** : Play allumé = rétroéclairé à plein, pads posés = rétroéclairés à 22 % avec un filet de couleur, tête de lecture blanche bordée de noir, voyants carrés sans lueur. |
| 7 | Un jeu de **pictogrammes au trait** dessinés en SVG (`app/icons.js`, grille 16 px, trait 1,5 px) : chevrons, saut, décalage de grille, liste, plus, plein écran, casque (pré-écoute), stop, coche, engrenage, énergie, crate. Tous les emoji ont disparu ; les ▶ des textes du parcours deviennent « Play ». |
| 8 | Note en **cinq repères carrés** (ambre quand ils comptent). |
| 9 | **Potards usinés** : graduation de 11 traits autour de 270° (trait central plus long sur les bipolaires), anneau de valeur fin, jupe moletée, dessus plat, trait indicateur qui part du centre. |
| 10 | **Faders** : rail creusé noir, capuchon strié avec trait blanc central, graduations sérigraphiées (0 dB et centre du pitch marqués). |
| 11 | **VU à diodes** : chaque segment éteint reste visible dans sa couleur très assombrie, comme une LED au repos. |
| 12 | Badges de tonalité **neutres**, verts seulement quand la tonalité est compatible ; pads de modes à la couleur de la platine ; teintes de la roue harmonique adoucies (saturation 38 %). |
| 13 | Gris **neutres** (ni bleutés ni chauds), sérigraphie blanc cassé `#efeee9`. Couleurs des platines revues pour ne ressembler à aucun produit : bleu acier, cuivre, sarcelle, vieux rose. |
| 14 | Couple typographique assumé : **Inter pour lire** (titres, phrases, boutons ; variantes `cv05` et `cv08` qui distinguent l, I et 1), **JetBrains Mono pour la sérigraphie** (légendes, en-têtes de colonnes, valeurs, numéros). Pas de nouvelle police : aucun paquet OFL supplémentaire n'était disponible hors ligne. |
| 15 | Ton sobre et factuel, tutoiement, sans point d'exclamation : « Chapitre validé. », « Leçon validée. », « Piste sauvée. », « Break », « Drop », « Aucun conseil en cours. », « Les grosses caisses vont se décaler. », « Pour débuter : l'interface s'ouvre commande par commande… ». |
| 16 | Pads vides en caoutchouc éteint (plus de pointillés) ; panneaux verrouillés : hachures discrètes et légende en clair, sans cadenas. |
| 17 | Plein écran et « plus » dessinés en SVG ; la classe des pictogrammes (`.ic`) ne touche plus la marge des boutons de la barre, qui ne déborde plus. |
| 18 | Une seule touche pleine dans le coach (voir 1). |

## 3. Ce qui reste générique (avis franc)

- **La mise en page** reste celle d'une appli web en grille : modules rectangulaires de largeur
  égale, bibliothèque en tableau. Un vrai logiciel de cabine a des proportions plus irrégulières
  (mixer plus étroit et plus haut, platines plus denses). Je n'y ai pas touché : c'est le travail
  des presets et des tests de disposition.
- **Inter** reste la police de lecture. Elle est bien réglée mais reconnaissable ; une police
  avec plus de caractère (une grotesque condensée pour les légendes) donnerait plus d'identité.
  Il faudrait l'ajouter en woff2 avec sa licence OFL.
- **Le panneau Contrôleur** et l'**Auto-mix** restent des formulaires denses ; ils sont sobres
  mais pas « matériel ».
- Les **séparateurs « · »** sont encore nombreux dans les sur-titres et la ligne d'info des
  waveforms.
- Les **couleurs des hot cues** (palette de 8, dont un violet et un magenta) n'ont pas changé :
  ce sont des données de l'utilisateur, importées et exportées vers d'autres logiciels.
