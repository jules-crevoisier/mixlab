'use strict';
/* =====================================================================
   Mixlab · pictogrammes
   Un petit jeu de pictogrammes au trait, dessinés sur une grille de 16 px
   (trait de 1,5 px, extrémités carrées, couleur du texte). Ils remplacent
   les caractères Unicode et les emoji : ▶ ✓ ⚡ ☰ ⋯ ⛶ 🔒 🏅…
   icon('nom') renvoie un <svg class="ic ic-nom"> prêt à poser dans un bouton.
   ===================================================================== */
const ICONS={
  // transport (pleins)
  play:'<path class="f" d="M4 2.5v11l9-5.5z"/>',
  stop:'<path class="f" d="M3.5 3.5h9v9h-9z"/>',
  // flèches et chevrons
  'chev-l':'<path d="M10 3.5 5.5 8l4.5 4.5"/>',
  'chev-r':'<path d="M6 3.5 10.5 8 6 12.5"/>',
  'chev-u':'<path d="M3.5 10 8 5.5l4.5 4.5"/>',
  'chev-d':'<path d="M3.5 6 8 10.5 12.5 6"/>',
  'jump-l':'<path d="M3.5 3v10M13 3.5 7.5 8l5.5 4.5"/>',
  'jump-r':'<path d="M12.5 3v10M3 3.5 8.5 8 3 12.5"/>',
  'nudge-l':'<path d="M2.5 8h7M5.5 5 2.5 8l3 3M13.5 3v10"/>',
  'nudge-r':'<path d="M13.5 8h-7M10.5 5l3 3-3 3M2.5 3v10"/>',
  // outils
  list:'<path d="M2.5 4h11M2.5 8h11M2.5 12h7"/>',
  more:'<path class="f" d="M2.5 7h2v2h-2zM7 7h2v2H7zM11.5 7h2v2h-2z"/>',
  fs:'<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
  close:'<path d="m4 4 8 8M12 4l-8 8"/>',
  check:'<path d="m3 8.5 3.2 3L13 4.5"/>',
  gear:'<path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6 5 5M11 11l1.4 1.4M3.6 12.4 5 11M11 5l1.4-1.4"/><circle cx="8" cy="8" r="2.6"/>',
  lock:'<path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2"/><path d="M3 7h10v6.5H3z"/>',
  energy:'<path d="M3 13.5v-3M6.3 13.5V8.5M9.7 13.5V6M13 13.5V3"/>',
  crate:'<path d="M2 4.5h12v9H2zM2 4.5l1.5-2h9l1.5 2M6 8h4"/>',
  phones:'<path d="M2.5 10V8a5.5 5.5 0 0 1 11 0v2"/><path d="M2.5 9.5h2.5v4H2.5zM11 9.5h2.5v4H11z"/>',
  stage:'<path d="M2 3h12v8H2zM5.5 14h5M8 11v3"/><path class="f" d="M4 5h3v4H4z"/>',
  grid:'<path d="M4 2.5v11M8 2.5v11M12 2.5v11"/>',
  dot:'<circle class="f" cx="8" cy="8" r="2.5"/>',
};
function icon(name,label){
  const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
  s.setAttribute('viewBox','0 0 16 16');s.setAttribute('class','ic ic-'+name);
  if(label){s.setAttribute('role','img');s.setAttribute('aria-label',label);}else s.setAttribute('aria-hidden','true');
  s.innerHTML=ICONS[name]||'';return s;
}
