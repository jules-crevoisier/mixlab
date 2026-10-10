# Mixlab · guide de style visuel

Référence de la direction visuelle (critique 2, section 4). Toute couleur, taille ou
espacement de l'interface vient des jetons déclarés **une seule fois** dans le bloc
`:root` de `app/index.html`. Le dessin des canvas (`app/app.js`, `structure.js`,
`deck-pro.js`) relit ces jetons avec `readTokens()` : aucune couleur n'est codée en
dur dans le JavaScript. Le mode scène ne fait que redéfinir des jetons (`html.stage`).

Le but : un logiciel de DJ sérieux, lisible dans une cabine sombre sur un portable,
sans ressembler à un produit existant (pas de logo, de nom, de couleur signature ni
d'agencement repris à un logiciel du commerce).

## 1. Hiérarchie à trois niveaux

| Niveau | Quoi | Traitement |
|---|---|---|
| 1. Vital, en direct | tête de lecture, Play en cours, temps restant, BPM, VU, fader, kill actif, tonalité compatible | couleur pleine, contraste maximal ; **seul ce niveau a le droit de briller** (halo) |
| 2. Jeu | Cue, Sync, Master, pads, boucle, potards, effets | surface `--surface-2`, texte `--text-mid`/`--text-hi`, couleur de platine seulement à l'état actif |
| 3. Réglages | onglets de pads, grille, Pro, Slip/Rev/Censor, transposition, sélecteurs, zoom, réglages du mixer | fond transparent, texte `--text-lo`, 24 px de haut ; souvent repliés (bouton « Pro » de chaque platine, menu « Réglages » du mixer) |

Règles qui en découlent :

- **Couleur de platine** (`--deck-a…d`) : uniquement sur la pastille, le liseré
  supérieur du panneau, la tête de lecture, le nom de voie du mixer et les états actifs
  (Play, Sync, Master, ON des effets). Jamais en aplat décoratif.
- **Violet** (`--coach`) : réservé au coach, au parcours et à l'académie.
- **CUE neutre au repos** : texte blanc sur `--surface-3`. Ambre (`--cue`) en liseré quand
  la platine est à l'arrêt sur son point de cue, plein pendant l'appui.
- **Badges Camelot** : contour de la couleur de la clé ; remplis seulement quand la
  tonalité est compatible avec la platine de référence (`.ok`, `.okk`).
- **Rouge** (`--state-bad`) : kill actif, fin de morceau (< 30 s), saturation, erreur.

## 2. Jetons

### Surfaces et lignes

| Jeton | Valeur | Usage |
|---|---|---|
| `--surface-0` | `#08090b` | fond de l'appli |
| `--surface-1` | `#111317` | panneaux |
| `--surface-2` | `#191c21` | commande au repos |
| `--surface-3` | `#22262d` | survol, sélection, Cue |
| `--surface-4` | `#2d323a` | relief, piste des potards |
| `--line-1` / `--line-2` | `#1b1e24` / `#2a2e36` | séparations rares (les groupes sont séparés par l'espace, pas par des cadres) |

### Textes

| Jeton | Valeur | Usage |
|---|---|---|
| `--text-hi` | `#f3f5f8` | vital, titres, valeurs |
| `--text-mid` | `#c3c8d0` | corps, boutons au repos |
| `--text-lo` | `#8e95a1` | libellés, réglages (contraste ≥ 4,5:1 sur `--surface-1`) |

### Identité et états

| Jeton | Valeur |
|---|---|
| `--deck-a` `--deck-b` `--deck-c` `--deck-d` | `#3aa8ff` `#ff7547` `#ef5fa7` `#2cc4b2` |
| `--state-ok` `--state-warn` `--state-bad` | `#46d483` `#f2b441` `#ff4f5e` |
| `--cue` | `#f2b441` |
| `--coach` | `#a78bfa` |
| `--live` | `#ffffff` (tête de lecture) |
| `--accent` | `#dfe5ee` (sélection neutre, ligne choisie de la bibliothèque) |

### Waveforms

| Jeton | Valeur | Bande |
|---|---|---|
| `--wave-low` | `#2b5cff` | graves, bleu profond |
| `--wave-mid` | `#f0a54a` | médiums, ambre |
| `--wave-high` | `#e8ecf2` | aigus, presque blanc |
| `--wave-bg` | `#060709` | fond des pistes |

Les anciens noms (`--bg`, `--s1`, `--tx`, `--A`…) restent comme **alias** des jetons
pour les modules qui les utilisent encore ; ne pas en créer de nouveaux.

### Mode scène

`html.stage` noircit les surfaces (`--surface-0:#000`…), éclaircit les textes
(`--text-lo:#c1c7d0`, contraste ≥ 7:1), passe BPM et temps restant à 32 px et les
pistes de waveform 40 % plus hautes. Aucune autre règle de couleur.

## 3. Typographie

Échelle unique, **rien sous 11 px** (vérifié par `test/layout.js`) :

| Jeton | Taille | Usage |
|---|---|---|
| `--fs-1` | 11 px | libellés, en-têtes de colonnes, réglages |
| `--fs-2` | 13 px | boutons, corps de texte, tableau |
| `--fs-3` | 16 px | titre de morceau, tonalité |
| `--fs-4` | 24 px | BPM et temps restant |
| `--fs-5` | 32 px | BPM et temps restant en mode scène |

- Interface en Inter (`--ui`), chiffres en JetBrains Mono (`--num`, chiffres tabulaires).
- **Boutons en casse normale** (« Sync », « Key lock », « Réglages »). Seuls les petits
  libellés de rubrique (RESTANT, BPM, MASTER) sont en capitales espacées.

## 4. Espacement et formes

- Grille de 8 px : `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16.
- Rayons : `--r-1` 4 px (petites commandes), `--r-2` 6 px (boutons), `--r-3` 8 px (panneaux).
- Panneaux sans bordure : surface `--surface-1` sur fond `--surface-0`. Les groupes à
  l'intérieur sont séparés par l'espace.

## 5. Composants

- **Potards** 28–32 px. EQ et filtre : anneau **bipolaire** depuis midi, trait de centre.
  Le libellé d'une bande d'EQ est aussi son **kill** (clic, ou Maj+clic sur le potard) :
  libellé rouge plein, anneau rouge et trait barré quand la bande est coupée.
- **Faders** gradués, au moins 110 px quand la place le permet (92 px minimum en mixer
  compact) ; ils prennent toute la hauteur libre de la voie. Poignée 32 × 16 px.
  Crossfader avec repère central.
- **VU-mètres segmentés** (10 à 22 segments, vert, ambre au-dessus de 70 %, rouge
  au-dessus de 88 %) avec crête maintenue une seconde.
- **Pads** 40 px (32 px en platine compacte) : vides en pointillé, remplis à 25 % de leur
  couleur quand un cue est posé, à 100 % pendant l'appui.
- **Unités d'effets** : nom de l'effet, potards libellés, sélecteur de temps segmenté
  (¼ ½ 1 2 4 8, molette et flèches), ON dans la couleur de la platine assignée, rangée
  repliable sur une ligne (bouton ▴).
- **Waveforms** : trois bandes adoucies (dégradé vertical), partie déjà jouée
  désaturée, graduations de temps sur les bords (pas de grille par-dessus le signal),
  tête de lecture blanche de 2 px avec halo et triangles, repères de phrase en bas.
  Vue d'ensemble de 24 à 28 px dans la platine.

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

`docs/design/avant/` et `docs/design/apres/` : presets Performance, Mix, École et mode
scène, en 1366 × 768 et 1600 × 950.
