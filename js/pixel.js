// Pixel-art mascot (a little block cat) and 1-bit icons, drawn as crisp SVG.
// Sprites are text grids: '#' = ink, 'o' = paper fill, '.' = transparent.

/* ---------- Cat ---------- */
// 15 × 12: head (cols 0-9) with two ears, tail (cols 12-13), body, four legs.

const HEAD_TOP = ['##......##', '###....###', '####..####', '##########', '##########'];
const HEAD_BOTTOM = '##########';

const EYES = {
  open: ['##oo##oo##', '##oo##oo##'],
  left: ['#oo##oo###', '#oo##oo###'],
  right: ['###oo##oo#', '###oo##oo#'],
  shut: ['##########', '##oo##oo##'],
  small: ['##########', '###o##o###'],
  wide: ['#ooo##ooo#', '#ooo##ooo#'],
  // Looking down at the paper (eyes one row lower).
  down: ['##########', '##oo##oo##', '##oo##oo##'],
};

// Rows 0-7 of the tail column (3 chars each).
const TAIL = {
  up: Array(8).fill('##.'),
  wag: ['.##', '.##', '##.', '##.', '##.', '##.', '##.', '##.'],
  down: Array(8).fill('...'),
};

const LEGS = {
  a: '##..###..##.##.',
  b: '.##..#..##..##.',
};

function cat(eyes = 'open', tail = 'up', legs = 'a') {
  const t = TAIL[tail];
  const e = EYES[eyes];
  const head = [...HEAD_TOP, e[0], e[1], e[2] ?? HEAD_BOTTOM];
  const rows = head.map((h, r) => h + '..' + t[r]);
  const droop = tail === 'down';
  rows.push('##############.', '##############' + (droop ? '#' : '.'), '##############' + (droop ? '#' : '.'));
  rows.push(LEGS[legs]);
  return rows;
}

// Each mood is a looping list of [frame, durationMs]. One mood per kind of action:
//   idle — blinks, the odd tail flick      search — eyes scan left/right (connecting)
//   print — tail wags hard while walking    walk — just the legs (feeding paper)
//   happy — squints and wags (success)      love — squints, hearts float up (saved)
//   wow — big eyes (something new)          oops — small eyes, tail drops (deleted)
//   sad — droopy tail (error/disconnect)    sleep — eyes shut, Z's (blank paper)
//   look-left / look-right — eyes follow a dragged block
const MOODS = {
  idle: [
    [cat('open'), 2400], [cat('open', 'wag'), 220], [cat('open'), 220], [cat('open', 'wag'), 220],
    [cat('open'), 1800], [cat('shut'), 140],
  ],
  search: [
    [cat('left'), 360], [cat('open'), 140], [cat('right'), 360], [cat('open'), 140], [cat('shut'), 110],
  ],
  print: [
    [cat('open', 'wag', 'a'), 150], [cat('open', 'up', 'b'), 150], [cat('open', 'wag', 'b'), 150], [cat('open', 'up', 'a'), 150],
  ],
  walk: [[cat('open', 'up', 'a'), 160], [cat('open', 'up', 'b'), 160]],
  happy: [[cat('shut', 'wag'), 150], [cat('shut', 'up'), 150]],
  love: [[cat('shut', 'up'), 2000]],
  wow: [[cat('wide', 'up'), 1500], [cat('shut', 'up'), 120]],
  oops: [[cat('small', 'down'), 700], [cat('shut', 'down'), 140]],
  sad: [[cat('small', 'down'), 1400], [cat('shut', 'down'), 140]],
  sleep: [[cat('shut', 'down'), 4000]],
  type: [[cat('down', 'up'), 320], [cat('down', 'wag'), 320]],
  spin: [[cat('wide', 'up'), 900]],
  'look-left': [[cat('left'), 4000]],
  'look-right': [[cat('right'), 4000]],
};

export const CAT_W = 15, CAT_H = 12;

/* ---------- Icons ---------- */

export const ICONS = {
  zzz: ['#####', '...#.', '..#..', '.#...', '#####'],
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  cursor: [
    '#...........', '##..........', '#o#.........', '#oo#........', '#ooo#.......', '#oooo#......',
    '#ooooo#.....', '#oooooo#....', '#ooooooo#...', '#oooooooo#..', '#ooooo#####.', '#oo#oo#.....',
    '#o#.#oo#....', '##..#oo#....', '#....#oo#...', '.....#oo#...', '......##....',
  ],
};

/** Merge horizontal runs into rects; returns SVG markup for one grid. */
export function gridRects(rows, { x = 0, y = 0, s = 1, ink = 'currentColor', fill = 'var(--surface, #fff)' } = {}) {
  let out = '';
  rows.forEach((row, r) => {
    for (const ch of ['o', '#']) {
      let start = -1;
      for (let c = 0; c <= row.length; c++) {
        if (row[c] === ch && start < 0) start = c;
        else if (row[c] !== ch && start >= 0) {
          out += `<rect x="${x + start * s}" y="${y + r * s}" width="${(c - start) * s}" height="${s}" fill="${ch === '#' ? ink : fill}"/>`;
          start = -1;
        }
      }
    }
  });
  return out;
}

export function spriteSVG(rows, attrs = '') {
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  return `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true" ${attrs}>${gridRects(rows)}</svg>`;
}

/* ---------- Mascot ---------- */

const timers = new WeakMap();

/** Mount (or change the mood of) the cat inside `el`. */
export function pix(el, mood = 'idle') {
  clearTimeout(timers.get(el));
  el.classList.add('pix');
  el.dataset.mood = mood;
  if (!el.querySelector('svg.pix-cat')) {
    el.innerHTML = `<svg class="pix-cat" viewBox="0 0 ${CAT_W} ${CAT_H}" shape-rendering="crispEdges" aria-hidden="true"></svg>`;
  }
  el.querySelectorAll('.pix-float').forEach(f => f.remove());
  const extra = { sleep: ICONS.zzz, love: ICONS.heart }[mood];
  if (extra) el.insertAdjacentHTML('beforeend', floaters(extra));
  const svg = el.querySelector('svg.pix-cat');
  const frames = MOODS[mood] || MOODS.idle;
  let i = 0;
  const step = () => {
    if (i > 0 && !el.isConnected) return;
    const [grid, ms] = frames[i % frames.length];
    svg.innerHTML = gridRects(grid);
    i++;
    if (frames.length > 1) timers.set(el, setTimeout(step, ms));
  };
  step();
  return el;
}

function floaters(sprite) {
  return [0, 1, 2].map(i => `<span class="pix-float" style="--i:${i}">${spriteSVG(sprite)}</span>`).join('');
}

/** Show a mood briefly, then return to `back`. */
export function pixFlash(el, mood, ms = 1800, back = 'idle') {
  // Repeated triggers (e.g. each keystroke) extend the mood instead of restarting it.
  if (el.dataset.mood !== mood) pix(el, mood);
  clearTimeout(el._flash);
  el._flash = setTimeout(() => pix(el, back), ms);
}

/** Stop any running animation in `el` and clear it. */
export function stopAnim(el) {
  clearTimeout(timers.get(el));
  clearTimeout(el._flash);
  el.classList.remove('pix');
  delete el.dataset.mood;
  el.innerHTML = '';
}

/** A crisp 1-bit arrow cursor as a CSS value. */
export function pixelCursor() {
  const rows = ICONS.cursor;
  const s = 1.5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rows[0].length * s}" height="${rows.length * s}" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges">${gridRects(rows, { ink: '#111', fill: '#fff' })}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 1 1, auto`;
}

/** The cat's first frame for a mood, as a text grid. */
export const catGrid = (mood = 'idle') => MOODS[mood][0][0];

/** The cat as rects at absolute coords, for embedding inside other SVG art. */
export function catRects(x, y, s, mood = 'idle') {
  return gridRects(MOODS[mood][0][0], { x, y, s, ink: '#111', fill: '#fff' });
}
