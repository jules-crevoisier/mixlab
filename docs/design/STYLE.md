# Mixlab · guide de style visuel

Référence de la direction visuelle « console » (v5, après l'audit
[`AUDIT-STYLE-IA.md`](AUDIT-STYLE-IA.md)). Toute couleur, taille ou espacement de
l'interface vient des jetons déclarés **une seule fois** dans le bloc `:root` de
`app/index.html`. Le dessin des canvas (`app/app.js`, `structure.js`, `deck-pro.js`) relit
ces jetons avec `readTokens()` : aucune couleur n'est codée en dur dans le JavaScript.
Le mode scène ne fait que redéfinir des jetons (`html.stage`). Les règles de composants
de la direction « console » sont regroupées dans le dernier bloc de la feuille de style
(« Thème v5 »).

Le but : un logiciel de DJ sérieux, lisible dans une cabine sombre sur un portable,
qui ressemble à du matériel et pas à un tableau de bord web, sans ressembler à un
produit existant (pas de logo, de nom, de couleur signature ni d'agencement repris à un
logiciel ou à un appareil du commerce).

## 0. L'idée : une façade de matériel

- **Des modules, pas des cartes.** Les panneaux sont des façades mates posées côte à côte
  sur un joint noir de 3 px, arêtes vives (rayon 3 px), un filet clair d'un pixel en haut
  comme une tôle pliée. Dans un panneau, les groupes sont séparés par l'espace ou par un
  filet, jamais par une carte dans la carte.
- **Des commandes en caoutchouc.** Léger dégradé vertical, reflet d'un pixel en haut, ombre
  d'un pixel en bas. Une commande allumée est **rétroéclairée** (fond teinté, contour fin),
  jamais entourée d'un halo.
- **Une sérigraphie.** Les légendes (Restant, Tonalité, Gain, en-têtes de colonnes,
  sur-titres) sont en JetBrains Mono 11 px, casse normale, sans espacement de lettres.
- **Peu de couleur.** Gris neutres ; couleur de platine pour l'identité ; un vert, un ambre,
  un rouge pour les états ; le coach en vert anis, seul.
- **Pas de décor.** Ni emoji, ni caractères Unicode en guise d'icônes, ni pastilles, ni
  dégradés colorés, ni flou, ni pilules.

## 1. Hiérarchie à trois niveaux

| Niveau | Quoi | Traitement |
|---|---|---|
| 1. Vital, en direct | tête de lecture, Play en cours, temps restant, BPM, VU, fader, kill actif, tonalité compatible | couleur pleine, contraste maximal ; seul niveau rétroéclairé à plein |
| 2. Jeu | Cue, Sync, Master, pads, boucle, potards, effets | caoutchouc (`--surface-2` en relief), texte `--text-mid`, couleur de platine seulement à l'état actif |
| 3. Réglages | onglets de pads, grille, Pro, Slip/Rev/Censor, transposition, sélecteurs, zoom, réglages du mixer | sans relief au repos, texte `--text-lo`, 24 px de haut ; souvent repliés (bouton « Pro » de chaque platine, menu « Réglages » du mixer) |

Règles qui en découlent :

- **Couleur de platine** (`--deck-a…d`) : uniquement sur la pastille, le liseré
  supérieur du panneau, la tête de lecture, le nom de voie du mixer, les modes de pads et
  les états actifs (Play, Sync, Master, On des effets). Jamais en aplat décoratif.
- **Vert anis** (`--coach`) : réservé au coach, au parcours, à l'académie et au MIDI Learn.
  **Une seule touche pleine à la fois** (l'étape en cours) ; les autres actions du coach
  sont secondaires (texte anis, contour fin).
- **Cue neutre au repos** : texte blanc. Ambre (`--cue`) en contour quand la platine est à
  l'arrêt sur son point de cue, plein pendant l'appui.
- **Badges de tonalité** neutres (contour et texte `--text-lo`), **verts pleins** seulement
  quand la tonalité est compatible avec la platine maître.
- **Rouge** (`--state-bad`) : kill actif, fin de morceau (< 30 s), saturation, erreur.

## 2. Jetons

### Surfaces et lignes (gris neutres)

| Jeton | Valeur | Usage |
|---|---|---|
| `--surface-0` | `#0b0b0c` | fond, champs de saisie, fond des pistes |
| `--surface-1` | `#161617` | façade des modules |
| `--surface-2` | `#1f1f21` | commande au repos, barre de titre des fenêtres |
| `--surface-3` | `#29292c` | survol, sélection, onglet actif |
| `--surface-4` | `#363639` | relief, diodes et repères éteints |
| `--line-1` / `--line-2` | `#232325` / `#38383c` | filets entre sections, contours de listes |

Le joint entre modules est du noir pur (`#app{background:#000}`).

### Textes

| Jeton | Valeur | Usage |
|---|---|---|
| `--text-hi` | `#efeee9` | vital, titres, valeurs (blanc cassé de sérigraphie) |
| `--text-mid` | `#c3c2bc` | corps, boutons au repos |
| `--text-lo` | `#908f89` | légendes, réglages (contraste ≥ 4,5:1 sur `--surface-2`) |

### Identité et états

| Jeton | Valeur |
|---|---|
| `--deck-a` `--deck-b` `--deck-c` `--deck-d` | `#5e9fd6` bleu acier, `#e2874f` cuivre, `#4dbcb2` sarcelle, `#d4789e` vieux rose |
| `--state-ok` `--state-warn` `--state-bad` | `#63c46f` `#e9ad3d` `#e5484d` |
| `--cue` | `#e9ad3d` |
| `--coach` | `#c5d64b` (vert anis d'un voyant « learn ») |
| `--live` | `#ffffff` (tête de lecture) |
| `--accent` | `#efeee9` (ligne choisie de la bibliothèque) |

Pas de violet, pas de dégradé bleu-violet. Les seules couleurs hors jetons sont celles que
l'utilisateur choisit (couleur d'un morceau, d'un hot cue).

### Waveforms

| Jeton | Valeur | Bande |
|---|---|---|
| `--wave-low` | `#3d6dd6` | graves, bleu acier |
| `--wave-mid` | `#de9746` | médiums, ambre |
| `--wave-high` | `#ebeae4` | aigus, blanc cassé |
| `--wave-bg` | `#08080a` | fond des pistes |

Les anciens noms (`--bg`, `--s1`, `--tx`, `--A`…) restent comme **alias** des jetons
pour les modules qui les utilisent encore ; ne pas en créer de nouveaux.

### Mode scène

`html.stage` noircit les surfaces (`--surface-0:#000`…), éclaircit les textes
(`--text-lo:#c6c5bf`, contraste ≥ 7:1), passe BPM et temps restant à 32 px et les
pistes de waveform 40 % plus hautes. Aucune autre règle de couleur.

## 3. Typographie

Deux polices embarquées (`app/fonts`, licence SIL OFL 1.1), deux rôles :

- **Inter pour lire** : titres, phrases, boutons, titres de morceaux. Variantes `cv05` et
  `cv08` activées (l à queue, I à empattements) pour distinguer l, I et 1 dans les titres.
- **JetBrains Mono pour la sérigraphie et les valeurs** : légendes des commandes, en-têtes de
  colonnes, sur-titres, numéros, BPM, temps, tonalités, compteurs. Chiffres tabulaires.

Échelle unique, **rien sous 11 px** (vérifié par `test/layout.js`) :

| Jeton | Taille | Usage |
|---|---|---|
| `--fs-1` | 11 px | légendes, en-têtes de colonnes, réglages |
| `--fs-2` | 13 px | boutons, corps de texte, tableau, titres de panneau |
| `--fs-3` | 16 px | titre de morceau, titre de leçon |
| `--fs-4` | 24 px | BPM et temps restant |
| `--fs-5` | 32 px | BPM et temps restant en mode scène |

- **Casse normale partout**, boutons comme légendes (« Sync », « Restant », « Module 1 ·
  Construire un set »). **Pas de capitales espacées.** Seuls les sigles restent en capitales
  (BPM, FX1, MIDI).
- Marque : « Mixlab » en Inter 700, sans espacement.

## 4. Espacement et formes

- Grille de 4 px : `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16.
- Rayons d'usinage : `--r-1` 2 px (badges, diodes, petites commandes), `--r-2` 3 px (boutons,
  modules, pads), `--r-3` 4 px (grosses touches, fenêtres). **Pas de pilule.**
- Ombres : un pixel sous les commandes, une ombre portée sous les fenêtres et menus. Pas de
  halo coloré, pas de `backdrop-filter`.

## 5. Composants

- **Potards usinés** 28–32 px (`knob()` dans `app.js`) : graduation de 11 traits autour de
  270° (trait central plus long sur les potards bipolaires), anneau de valeur fin (à la
  couleur de la platine hors neutre, vide au neutre), jupe moletée, dessus plat, trait
  indicateur blanc qui part du centre. EQ et filtre bipolaires. Le libellé d'une bande d'EQ
  est aussi son **kill** (clic, ou Maj+clic sur le potard) : libellé rouge plein, anneau
  rouge et trait barré.
- **Faders** : rail noir creusé de 4 px, capuchon strié 30 × 18 px avec trait blanc central,
  graduations sérigraphiées de part et d'autre (0 dB en haut plus long, centre du pitch
  marqué). Au moins 110 px quand la place le permet (92 px en mixer compact). Crossfader
  avec repère central.
- **VU à diodes** (10 à 22 segments, vert, ambre au-dessus de 70 %, rouge au-dessus de 88 %),
  crête tenue une seconde ; un segment éteint reste visible dans sa couleur très assombrie.
- **Pads** 40 px (32 px en platine compacte) : caoutchouc éteint au repos ; cue posé =
  rétroéclairé à 22 % de sa couleur avec un filet de 2 px en bas ; appui = plein. Les pads
  des autres modes (roll, saut, slicer…) prennent la couleur de la platine.
- **Transport** : Cue et Play en grosses touches de 40 px ; Play rétroéclairé à plein à la
  couleur de la platine pendant la lecture.
- **Voyants** de la barre du haut : diodes carrées de 6 px, sans lueur.
- **Note d'un morceau** : cinq repères carrés, ambre quand ils comptent.
- **Unités d'effets** : nom de l'effet, potards libellés, sélecteur de temps segmenté
  (¼ ½ 1 2 4 8, molette et flèches), On à la couleur de la platine assignée, rangée
  repliable sur une ligne.
- **Waveforms** : trois bandes adoucies, partie jouée désaturée, graduations sur les bords,
  tête de lecture blanche de 2 px **bordée de noir** (lisible sans halo) avec triangles,
  repères de phrase en bas. Vue d'ensemble de 24 à 28 px dans la platine.
- **Coach, parcours, académie** : sections séparées par un filet ; chapitres et leçons en
  lignes de liste (numéro dans un carré, coche verte quand c'est fait, liseré anis sur la
  ligne en cours) ; avancement en rangée de diodes.
- **Fenêtres** : barre de titre `--surface-2` séparée par un trait noir, titre en casse
  normale 13 px.
- **Premier lancement** : une feuille de réglage (barre de titre, une phrase, liste « Ton
  niveau », rangée de dispositions, pied avec `Échap`), alignée en haut, sans flou.

### Pictogrammes

`app/icons.js` : `icon('nom')` renvoie un `<svg class="ic">` dessiné au trait sur une grille
de 16 px (trait 1,5 px, extrémités carrées, couleur du texte). Jeu actuel : `play`, `stop`,
`chev-l/r/u/d`, `jump-l/r`, `nudge-l/r`, `list`, `more`, `fs`, `close`, `check`, `gear`,
`lock`, `energy`, `crate`, `phones`, `stage`, `grid`, `dot`. **Aucun emoji ni caractère
Unicode décoratif** (▶ ✓ ★ ⚡ 🔒…) dans l'interface ; dans un texte, on nomme la commande
(« appuie sur Play »).

## 5 bis. Le ton

Phrases courtes et factuelles, tutoiement, **pas de point d'exclamation**, pas d'emoji, pas
de superlatif ni de tournure marketing. On dit ce qui se passe et quoi faire :
« Chapitre validé. », « Aucun conseil en cours. », « Les grosses caisses vont se décaler.
Descends le pitch de B ou appuie sur Sync. » Les noms de commandes sont écrits comme sur
l'écran (Play, Cue, Sync, Gain).

## 6. Moins de commandes visibles

Les réglages rares sont regroupés : bouton **Pro** de chaque platine (Slip, Rev, Censor,
transposition, grille, commandes avancées), menu **Réglages** du mixer (effet de voie,
mode d'EQ, volume du sampler), un seul bouton de côté de crossfader (A → Thru → B),
zoom des waveforms au survol de la piste, un seul bouton pour replier les effets.
Une commande désignée par le coach ou le parcours déplie d'elle-même la rangée Pro
(`revealCtl`).
Toutes les fonctions restent atteignables, au clavier, au MIDI et par le parcours.

## 7. Performance de l'affichage

- Une platine à l'arrêt n'est pas redessinée tant que rien ne change (signature
  position, zoom, cues, taille).
- La vue d'ensemble est dessinée une fois par morceau, zoom ou taille ; la progression
  se fait par CSS (`clip-path` et `transform`), sans canvas.
- Fenêtre sans le focus : 30 images par seconde au plus.
- `frame()` dessine d'abord tous les canvas, puis écrit dans le DOM seulement les
  valeurs qui ont changé.
- Aucun canvas ne dicte la hauteur de son bloc (VU et faders posés en absolu) : sinon
  le canvas, redimensionné à sa boîte à chaque image, la fait grandir sans fin.

Mesure (Performance, 4 platines en lecture, 1366 × 768, fenêtre au premier plan) :
`frame()` 5,5 ms → 2,1 ms en moyenne ; avec le processeur ralenti ×4, 27,3 ms → 14,9 ms ;
deux platines arrêtées sur quatre, ×4 : 28,5 ms → 9,1 ms.

## 8. Captures

- `docs/design/v2/avant/` et `docs/design/v2/apres/` : la passe « console » (audit
  [`AUDIT-STYLE-IA.md`](AUDIT-STYLE-IA.md)). Presets Performance, Mix et École en 1366 × 768
  et 1600 × 950, 4 platines, mode scène, premier lancement, parcours (chapitres 1 et 5),
  Académie (liste et leçon), coach (panneau et bandeau), menus, fenêtres Contrôleur et Audio,
  Auto-mix.
- `docs/design/avant/` et `docs/design/apres/` : la passe précédente (critique 2).
