// Free Google Fonts available in the app. `he` = includes Hebrew glyphs.
// `w` = weights to request (only weights the family actually ships).
export const FONTS = [
  // Hebrew + Latin — clean
  { name: 'Heebo', he: true, w: [400, 700, 900], cat: 'נקי' },
  { name: 'Rubik', he: true, w: [400, 700, 900], cat: 'נקי' },
  { name: 'Assistant', he: true, w: [400, 700, 800], cat: 'נקי' },
  { name: 'Noto Sans Hebrew', he: true, w: [400, 700, 900], cat: 'נקי' },
  { name: 'IBM Plex Sans Hebrew', he: true, w: [400, 700], cat: 'נקי' },
  { name: 'Arimo', he: true, w: [400, 700], cat: 'נקי' },
  { name: 'Alef', he: true, w: [400, 700], cat: 'נקי' },
  { name: 'Varela Round', he: true, w: [400], cat: 'עגול' },
  { name: 'Fredoka', he: true, w: [400, 700], cat: 'עגול' },
  { name: 'Playpen Sans Hebrew', he: true, w: [400, 700], cat: 'כתב יד' },
  // Hebrew + Latin — display
  { name: 'Secular One', he: true, w: [400], cat: 'כותרות' },
  { name: 'Suez One', he: true, w: [400], cat: 'כותרות' },
  { name: 'Karantina', he: true, w: [400, 700], cat: 'כותרות' },
  { name: 'Amatic SC', he: true, w: [400, 700], cat: 'כתב יד' },
  { name: 'Gveret Levin', he: true, w: [400], cat: 'כתב יד' },
  { name: 'Solitreo', he: true, w: [400], cat: 'כתב יד' },
  // Hebrew + Latin — serif
  { name: 'Frank Ruhl Libre', he: true, w: [400, 700, 900], cat: 'סריף' },
  { name: 'David Libre', he: true, w: [400, 700], cat: 'סריף' },
  { name: 'Noto Serif Hebrew', he: true, w: [400, 700, 900], cat: 'סריף' },
  { name: 'Miriam Libre', he: true, w: [400, 700], cat: 'סריף' },
  { name: 'Bellefair', he: true, w: [400], cat: 'סריף' },
  { name: 'Tinos', he: true, w: [400, 700], cat: 'סריף' },
  { name: 'Bona Nova', he: true, w: [400, 700], cat: 'סריף' },
  { name: 'Noto Rashi Hebrew', he: true, w: [400, 700], cat: 'סריף' },
  // Hebrew + Latin — playful
  { name: 'Rubik Bubbles', he: true, w: [400], cat: 'מיוחד' },
  { name: 'Rubik Puddles', he: true, w: [400], cat: 'מיוחד' },
  { name: 'Rubik Doodle Shadow', he: true, w: [400], cat: 'מיוחד' },
  { name: 'Rubik Marker Hatch', he: true, w: [400], cat: 'מיוחד' },
  { name: 'Rubik Spray Paint', he: true, w: [400], cat: 'מיוחד' },
  { name: 'Rubik Wet Paint', he: true, w: [400], cat: 'מיוחד' },
  { name: 'Rubik Dirt', he: true, w: [400], cat: 'מיוחד' },
  { name: 'Rubik Glitch', he: true, w: [400], cat: 'מיוחד' },
  { name: 'Rubik Maze', he: true, w: [400], cat: 'מיוחד' },
  { name: 'Rubik Iso', he: true, w: [400], cat: 'מיוחד' },
  // Latin only
  { name: 'Montserrat', he: false, w: [400, 700, 900], cat: 'נקי' },
  { name: 'Bebas Neue', he: false, w: [400], cat: 'כותרות' },
  { name: 'Righteous', he: false, w: [400], cat: 'כותרות' },
  { name: 'Bungee', he: false, w: [400], cat: 'כותרות' },
  { name: 'Abril Fatface', he: false, w: [400], cat: 'כותרות' },
  { name: 'Playfair Display', he: false, w: [400, 700, 900], cat: 'סריף' },
  { name: 'Special Elite', he: false, w: [400], cat: 'מיוחד' },
  { name: 'Space Mono', he: false, w: [400, 700], cat: 'מיוחד' },
  { name: 'Press Start 2P', he: false, w: [400], cat: 'מיוחד' },
  { name: 'Pacifico', he: false, w: [400], cat: 'כתב יד' },
  { name: 'Lobster', he: false, w: [400], cat: 'כתב יד' },
  { name: 'Dancing Script', he: false, w: [400, 700], cat: 'כתב יד' },
  { name: 'Caveat', he: false, w: [400, 700], cat: 'כתב יד' },
  { name: 'Permanent Marker', he: false, w: [400], cat: 'כתב יד' },
  { name: 'Indie Flower', he: false, w: [400], cat: 'כתב יד' },
  { name: 'Shadows Into Light', he: false, w: [400], cat: 'כתב יד' },
];

export const DEFAULT_FONT = 'Heebo';

const linked = new Set();

// One stylesheet per family, so a single bad request can't break the rest.
// The browser only downloads a font file once text actually uses it.
export function linkFont(name) {
  if (linked.has(name)) return;
  const f = FONTS.find(x => x.name === name);
  if (!f) return;
  linked.add(name);
  const fam = name.replace(/ /g, '+') + (f.w.length > 1 ? ':wght@' + f.w.join(';') : '');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
  document.head.appendChild(link);
}

export function linkAllFonts() {
  FONTS.forEach(f => linkFont(f.name));
}

export function nearestWeight(name, bold) {
  const f = FONTS.find(x => x.name === name);
  if (!f) return bold ? 700 : 400;
  if (!bold) return f.w[0];
  // Single-weight families get the browser's synthetic bold.
  return f.w.includes(700) || f.w.length === 1 ? 700 : f.w[f.w.length - 1];
}

// Resolves when the face is ready (or gives up after a timeout, falling back).
export async function ensureFont(name, weight, sample) {
  linkFont(name);
  try {
    await Promise.race([
      document.fonts.load(`${weight} 40px "${name}"`, sample || 'אבג Abc'),
      new Promise(r => setTimeout(r, 4000)),
    ]);
  } catch { /* fall back to system font */ }
}
