import { CatPrinter, isBluetoothSupported, PRINT_WIDTH } from './printer.js';
import { renderBlock, layout, compose, canvasToRows, loadImage, boxWidth, effectThumb, applyEffect, GRAIN_EFFECTS, DITHER_EFFECTS, FULL, MIN_W } from './render.js';
import { FONTS, DEFAULT_FONT, linkFont, linkAllFonts } from './fonts.js';
import { pix, pixFlash, stopAnim, pixelCursor, catGrid, gridRects } from './pixel.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const icon = id => `<svg class="icon" aria-hidden="true"><use href="#${id}"/></svg>`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DOTS_PER_MM = 8;

/* ================= Block types ================= */

const ALIGN_OPTS = [['left', 'Left'], ['center', 'Center'], ['right', 'Right']];

const TYPES = {
  receipt: {
    label: 'Receipt', icon: 'i-receipt',
    make: () => ({
      business: 'MINI CAFÉ', subtitle: '12 Paper Street, Tel Aviv\nTel. 03-555-0101',
      liveDate: true, date: '', number: String(Math.floor(100000 + Math.random() * 900000)),
      items: 'Espresso | 2 | 9.00\nCroissant | 1 | 14.50\nOrange juice | 1 | 16.00',
      currency: '₪', tax: 0, lang: 'en', footer: 'Thank you & see you soon!', barcode: true,
      font: 'Space Mono', size: 22,
    }),
    fields: [
      { k: 'business', t: 'input', label: 'Business name' },
      { k: 'subtitle', t: 'textarea', label: 'Address / phone', placeholder: 'Street, city\nPhone' },
      { k: 'liveDate', t: 'check', label: 'Today’s date', hint: 'updates on print', rebuild: true },
      { k: 'date', t: 'input', label: 'Date', placeholder: '01/01/2026 12:00', show: b => !b.liveDate },
      { k: 'number', t: 'input', label: 'Receipt no.', placeholder: '000123' },
      { k: 'items', t: 'textarea', label: 'Items', hint: 'Name | qty | price', placeholder: 'Coffee | 2 | 9.00\nCake | 1 | 18' },
      { k: 'currency', t: 'input', label: 'Currency symbol', placeholder: '₪' },
      { k: 'tax', t: 'range', label: 'Tax / VAT', min: 0, max: 25, fmt: v => (v ? `${v}%` : 'None') },
      { k: 'lang', t: 'seg', label: 'Labels', opts: [['en', 'English'], ['he', 'עברית']] },
      { k: 'footer', t: 'textarea', label: 'Footer message', placeholder: 'Thank you!' },
      { k: 'barcode', t: 'check', label: 'Barcode', hint: 'from receipt no.' },
      { k: 'font', t: 'font', label: 'Font' },
      { k: 'size', t: 'range', label: 'Text size', min: 14, max: 32, fmt: v => `${v} pt` },
    ],
  },
  text: {
    label: 'Text', icon: 'i-text',
    make: () => ({ text: 'Hello!', font: DEFAULT_FONT, size: 48, bold: true, align: 'auto', invert: false, lineHeight: 1.2, padY: 8, tracking: 0 }),
    fields: [
      { k: 'text', t: 'textarea', label: 'Text', placeholder: 'Type here — Hebrew or English…' },
      { k: 'font', t: 'font', label: 'Font' },
      { k: 'size', t: 'range', label: 'Size', min: 14, max: 180, fmt: v => `${v} pt` },
      { k: 'align', t: 'seg', label: 'Align', opts: [['auto', 'Auto'], ...ALIGN_OPTS] },
      { k: 'tracking', t: 'range', label: 'Letter spacing', min: -6, max: 40, fmt: v => (v > 0 ? `+${v}` : `${v}`) },
      { k: 'bold', t: 'check', label: 'Bold' },
      { k: 'invert', t: 'check', label: 'Inverted', hint: 'white on black' },
      { k: 'lineHeight', t: 'range', label: 'Line spacing', min: 0.9, max: 2, step: 0.05, fmt: v => v.toFixed(2) },
      { k: 'padY', t: 'range', label: 'Padding', min: 0, max: 48, fmt: mm },
    ],
  },
  image: {
    label: 'Photo', icon: 'i-image',
    make: () => ({ src: '', brightness: 0, contrast: 10, dither: 'atkinson', grain: 6, dot: 1, invert: false, rotate: 0 }),
    fields: [
      { k: 'dither', t: 'effect', label: 'Effect' },
      { k: 'dot', t: 'range', label: 'Dot size', min: 1, max: 10, fmt: v => `${v}×`, show: b => DITHER_EFFECTS.has(b.dither) },
      { k: 'grain', t: 'range', label: 'Grain', min: 2, max: 18, fmt: v => `${v} px`, show: b => GRAIN_EFFECTS.has(b.dither) },
      { k: 'brightness', t: 'range', label: 'Brightness', min: -100, max: 100, fmt: signed },
      { k: 'contrast', t: 'range', label: 'Contrast', min: -100, max: 100, fmt: signed },
      { k: 'invert', t: 'check', label: 'Negative' },
      { t: 'imageActions' },
    ],
  },
  list: {
    label: 'List', icon: 'i-list',
    make: () => ({ items: 'Milk\nBread\nEggs', style: 'check', font: DEFAULT_FONT, size: 30, bold: false, gap: 8, tracking: 0 }),
    fields: [
      { k: 'items', t: 'textarea', label: 'Items', hint: 'One per line', placeholder: 'First item\nSecond item' },
      { k: 'style', t: 'seg', label: 'Marker', opts: [['check', 'Boxes'], ['bullet', 'Dots'], ['number', '1, 2, 3'], ['none', 'None']] },
      { k: 'font', t: 'font', label: 'Font' },
      { k: 'size', t: 'range', label: 'Size', min: 14, max: 80, fmt: v => `${v} pt` },
      { k: 'tracking', t: 'range', label: 'Letter spacing', min: -6, max: 40, fmt: v => (v > 0 ? `+${v}` : `${v}`) },
      { k: 'bold', t: 'check', label: 'Bold' },
      { k: 'gap', t: 'range', label: 'Item spacing', min: 0, max: 32, fmt: mm },
    ],
  },
  qr: {
    label: 'QR code', icon: 'i-qr',
    make: () => ({ text: 'https://', scale: 100, align: 'center' }),
    fields: [
      { k: 'text', t: 'input', label: 'Link or text', placeholder: 'https://…' },
      { k: 'scale', t: 'range', label: 'Size', min: 25, max: 100, fmt: v => `${v}%` },
      { k: 'align', t: 'seg', label: 'Align', opts: ALIGN_OPTS },
    ],
  },
  drawing: {
    label: 'Drawing', icon: 'i-draw',
    make: () => ({ src: '', height: 384 }),
    fields: [
      { t: 'drawActions' },
      { k: 'height', t: 'seg', label: 'Canvas height', opts: [[192, 'Short'], [384, 'Square'], [576, 'Tall']] },
    ],
  },
  emoji: {
    label: 'Emoji', icon: 'i-emoji',
    make: () => ({ emoji: '⭐', size: 140, align: 'center', dither: 'atkinson' }),
    fields: [
      { k: 'emoji', t: 'emoji', label: 'Pick one' },
      { k: 'size', t: 'range', label: 'Size', min: 40, max: 320, fmt: v => `${v} pt` },
      { k: 'align', t: 'seg', label: 'Align', opts: ALIGN_OPTS },
      { k: 'dither', t: 'seg', label: 'Style', opts: [['atkinson', 'Soft'], ['floyd', 'Detail'], ['threshold', 'Comic'], ['halftone', 'Halftone'], ['pixel', 'Pixel']] },
    ],
  },
  divider: {
    label: 'Divider', icon: 'i-divider',
    make: () => ({ style: 'dashed', thickness: 3, padY: 12 }),
    fields: [
      { k: 'style', t: 'seg', label: 'Style', opts: [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double'], ['wave', 'Wave'], ['stars', 'Stars']] },
      { k: 'thickness', t: 'range', label: 'Weight', min: 1, max: 10, fmt: v => `${v}` },
      { k: 'padY', t: 'range', label: 'Padding', min: 0, max: 48, fmt: mm },
    ],
  },
  spacer: {
    label: 'Space', icon: 'i-spacer',
    make: () => ({ height: 40 }),
    fields: [
      { k: 'height', t: 'range', label: 'Height', min: 8, max: 320, step: 8, fmt: mm },
    ],
  },
};

const BOX_FIELDS = [
  { t: 'box', label: 'Place on paper' },
  { k: 'w', t: 'range', label: 'Box width', min: MIN_W, max: FULL, step: 4, fmt: mm },
];

const EFFECT_GROUPS = [
  ['Dither', [
    ['atkinson', 'Atkinson'], ['floyd', 'Floyd–Steinberg'], ['stucki', 'Stucki'], ['jarvis', 'Jarvis'],
    ['sierra', 'Sierra'], ['bayer2', 'Bayer 2×2'], ['ordered', 'Bayer 4×4'], ['bayer8', 'Bayer 8×8'],
    ['noise', 'Noise'], ['random', 'Random'],
  ]],
  ['Art', [
    ['threshold', 'Comic'], ['halftone', 'Halftone'], ['lines', 'Lines'], ['crosshatch', 'Hatch'],
    ['pixel', 'Pixel'], ['stipple', 'Stipple'], ['sketch', 'Sketch'],
  ]],
];

function mm(v) { return `${(v / DOTS_PER_MM).toFixed(v % 8 ? 1 : 0)} mm`; }
function signed(v) { return v > 0 ? `+${v}` : `${v}`; }

const EMOJIS = ['⭐', '❤️', '😊', '😂', '🥰', '😎', '🎉', '🎂', '🎁', '🌸', '🌈', '☀️', '🌙', '⚡', '🔥', '✨', '👍', '👏', '🙏', '💪', '🐱', '🐶', '🦄', '🐻', '🍕', '🍦', '☕', '🍎', '⚽', '🎵', '📌', '✅', '❗', '💡', '🏠', '✈️', '📚', '✏️', '💌', '🎈'];

function newBlock(type, overrides = {}) {
  return { id: uid(), type, ...TYPES[type].make(), ...overrides };
}

/* ================= Templates ================= */

const today = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

const TEMPLATES = [
  { name: 'Receipt', make: () => [newBlock('receipt')] },
  { name: 'קבלה', make: () => [newBlock('receipt', {
    business: 'הקפה של מיני', subtitle: 'רחוב הנייר 12, תל אביב\nטל׳ 03-5550101', lang: 'he',
    items: 'אספרסו | 2 | 9\nקרואסון | 1 | 14.50\nמיץ תפוזים | 1 | 16', tax: 18,
    footer: 'תודה ולהתראות!', font: 'Heebo',
  })] },
  { name: 'Groceries', make: () => [
    newBlock('text', { text: 'GROCERIES', font: 'Montserrat', size: 46, align: 'center' }),
    newBlock('divider', { style: 'dashed' }),
    newBlock('list', { items: 'Milk\nBread\nEggs\nTomatoes\nCoffee', size: 30, font: 'Montserrat' }),
  ] },
  { name: 'To-do today', make: () => [
    newBlock('text', { text: 'To-do', font: 'Montserrat', size: 54, bold: true, align: 'left', padY: 4 }),
    newBlock('text', { text: today(), font: 'Montserrat', size: 22, bold: false, align: 'left', padY: 0 }),
    newBlock('divider', { style: 'solid', thickness: 2 }),
    newBlock('list', { items: 'First task\nSecond task\nThird task', size: 28, font: 'Montserrat' }),
  ] },
  { name: 'רשימת קניות', make: () => [
    newBlock('text', { text: 'רשימת קניות', font: 'Secular One', size: 52, align: 'center' }),
    newBlock('divider', { style: 'dashed' }),
    newBlock('list', { items: 'חלב\nלחם\nביצים\nעגבניות', size: 32, font: 'Heebo' }),
  ] },
  { name: 'Name tag', make: () => [
    newBlock('text', { text: 'HELLO, MY NAME IS', font: 'Montserrat', size: 24, align: 'center', invert: true, padY: 10 }),
    newBlock('spacer', { height: 16 }),
    newBlock('text', { text: 'Your Name', font: 'Pacifico', size: 64, bold: false, align: 'center' }),
    newBlock('spacer', { height: 16 }),
  ] },
  { name: 'Sweet note', make: () => [
    newBlock('emoji', { emoji: '💌', size: 120 }),
    newBlock('text', { text: 'שיהיה לך יום נפלא!', font: 'Gveret Levin', size: 54, align: 'center' }),
    newBlock('divider', { style: 'stars', thickness: 2 }),
  ] },
  { name: 'Photo + caption', make: () => [
    newBlock('image'),
    newBlock('text', { text: 'A moment to remember', font: 'Caveat', size: 48, align: 'center' }),
  ] },
  { name: 'QR + title', make: () => [
    newBlock('text', { text: 'SCAN ME', font: 'Montserrat', size: 44, align: 'center' }),
    newBlock('qr', { text: 'https://example.com', scale: 70 }),
    newBlock('text', { text: 'example.com', font: 'Space Mono', size: 22, bold: false, align: 'center' }),
  ] },
  { name: 'Date label', make: () => [
    newBlock('text', { text: today(), font: 'Bebas Neue', size: 64, bold: false, align: 'center', invert: true, padY: 12 }),
  ] },
];

/* ================= State & persistence ================= */

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('miniprinter:' + key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('miniprinter:' + key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
};

const state = {
  blocks: store.get('draft', null) || TEMPLATES[0].make(),
  selected: null,
  settings: { darkness: 'normal', speed: 'normal', feed: 120, copies: 1, theme: 'light', ...store.get('settings', {}) },
};

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!store.set('draft', state.blocks)) toast('Not enough storage for autosave — try a smaller photo', 'error');
  }, 400);
}

for (const b of state.blocks) {
  if (b.type === 'image' && b.scale != null && b.w == null) {
    b.w = Math.round(FULL * b.scale / 100);
    b.x = b.align === 'right' ? FULL - b.w : b.align === 'left' ? 0 : Math.round((FULL - b.w) / 2);
    delete b.scale;
  }
}

const getBlock = id => state.blocks.find(b => b.id === id);

/* ================= Paper (preview) ================= */

const paper = $('#paper');
const sheet = document.createElement('div');
sheet.className = 'sheet';
paper.appendChild(sheet);
const nodes = new Map(); // id -> { el, canvas, token, h }
const scale = () => sheet.clientWidth / FULL || 1;
new ResizeObserver(() => sheet.style.setProperty('--k', scale())).observe(sheet);

function syncPaper() {
  const ids = new Set(state.blocks.map(b => b.id));
  for (const [id, n] of nodes) if (!ids.has(id)) { n.el.remove(); nodes.delete(id); }
  state.blocks.forEach((b, i) => {
    let n = nodes.get(b.id);
    if (!n) {
      n = makeNode(b);
      nodes.set(b.id, n);
      redraw(b.id);
    }
    n.el.setAttribute('aria-label', `${TYPES[b.type].label}, block ${i + 1}. Arrow keys move it.`);
    n.el.setAttribute('aria-current', String(state.selected === b.id));
    // DOM order = stacking order.
    if (sheet.children[i] !== n.el) sheet.insertBefore(n.el, sheet.children[i] || null);
  });
  paper.hidden = !state.blocks.length;
  $('#empty').hidden = state.blocks.length > 0;
  if (!state.blocks.length && !$('#empty-cat').firstChild) pix($('#empty-cat'), 'sleep');
  placeBlocks();
}

function makeNode(b) {
  const el = document.createElement('div');
  el.className = 'block';
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.innerHTML = `
    <span class="block-tag">${TYPES[b.type].label}</span>
    <button type="button" class="block-x" aria-label="Delete ${TYPES[b.type].label}" title="Delete">${icon('i-close')}</button>
    <span class="block-resize" aria-hidden="true" title="Drag to resize"></span>`;
  $('.block-x', el).addEventListener('click', e => { e.stopPropagation(); blockAction('del', b.id); });
  $('.block-x', el).addEventListener('pointerdown', e => e.stopPropagation());
  $('.block-resize', el).addEventListener('pointerdown', e => {
    e.stopPropagation();
    if (state.selected !== b.id) select(b.id);
    startDrag(e, b.id, 'resize');
  });
  el.addEventListener('pointerdown', e => {
    const wasSelected = state.selected === b.id;
    if (!wasSelected) select(b.id);
    // On touch, the first tap selects; dragging starts once it's selected (so the page still scrolls).
    if (e.pointerType === 'mouse' || wasSelected) startDrag(e, b.id, 'move');
  });
  el.addEventListener('keydown', e => {
    if (e.target !== el) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(b.id, { focus: true }); }
  });
  return { el, canvas: null, token: 0, h: null };
}

/** Position every node; commit positions for blocks that were waiting on their height. */
function placeBlocks() {
  const heights = state.blocks.map(b => nodes.get(b.id)?.h);
  const boxes = layout(state.blocks, heights);
  if (heights.every(h => h != null)) {
    let changed = false;
    state.blocks.forEach((b, i) => {
      if (b.y == null || b.x == null || b.w == null) { Object.assign(b, { x: boxes[i].x, y: boxes[i].y, w: boxes[i].w }); changed = true; }
    });
    if (changed) persist();
  }
  state.blocks.forEach((b, i) => {
    const n = nodes.get(b.id);
    if (!n) return;
    n.el.style.setProperty('--x', boxes[i].x);
    n.el.style.setProperty('--y', boxes[i].y);
    n.el.style.setProperty('--w', boxes[i].w);
  });
  const H = Math.max(0, ...boxes.map(p => p.y + p.h));
  sheet.style.setProperty('--h', Math.max(H, 40));
  if (document.body.classList.contains('sheet-open')) fitPaper();
  $('#meta').textContent = state.blocks.length ? `≈ ${(H / DOTS_PER_MM / 10).toFixed(1)} cm` : '';
  return boxes;
}

/* ---- Drag to move / resize ---- */
const SNAP = 6;

function snap(v, targets) {
  let best = v, dist = SNAP + 1;
  for (const t of targets) { const d = Math.abs(v - t); if (d < dist) { dist = d; best = t; } }
  return dist <= SNAP ? best : null;
}

function startDrag(e, id, mode) {
  const b = getBlock(id), n = nodes.get(id);
  if (!b || !n || e.button > 0) return;
  e.preventDefault();
  const target = e.currentTarget;
  try { target.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  const k = scale();
  const sx = e.clientX, sy = e.clientY;
  const ox = b.x ?? 0, oy = b.y ?? 0, ow = boxWidth(b);
  const others = state.blocks.filter(o => o.id !== id).map(o => ({ x: o.x ?? 0, y: o.y ?? 0, w: boxWidth(o), h: nodes.get(o.id)?.h ?? 0 }));
  let moved = false;

  const onMove = ev => {
    const dx = (ev.clientX - sx) / k, dy = (ev.clientY - sy) / k;
    if (!moved && Math.hypot(dx * k, dy * k) < 4) return;
    if (!moved) { moved = true; n.el.classList.add('dragging'); }
    const look = ev.movementX < -1 ? 'look-left' : ev.movementX > 1 ? 'look-right' : null;
    if (look && mascot.dataset.mood !== look) pix(mascot, look);
    if (mode === 'move') {
      const w = ow, h = n.h ?? 0;
      let x = Math.max(0, Math.min(FULL - w, ox + dx));
      let y = Math.max(0, oy + dy);
      const xs = [0, (FULL - w) / 2, FULL - w, ...others.flatMap(o => [o.x, o.x + o.w, o.x - w, o.x + o.w - w])];
      const ys = [0, ...others.flatMap(o => [o.y, o.y + o.h, o.y - h, o.y + o.h - h])];
      x = snap(x, xs) ?? x;
      y = snap(y, ys) ?? y;
      b.x = Math.round(x);
      b.y = Math.round(Math.max(0, y));
    } else {
      const maxW = FULL - (b.x ?? 0);
      let w = Math.max(MIN_W, Math.min(maxW, ow + dx));
      w = snap(w, [maxW, FULL / 2, ...others.map(o => o.x - (b.x ?? 0))]) ?? w;
      b.w = Math.round(w);
      redraw(id);
    }
    placeBlocks();
  };
  const onUp = () => {
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onUp);
    target.removeEventListener('pointercancel', onUp);
    n.el.classList.remove('dragging');
    if (mascot.dataset.mood?.startsWith('look')) pix(mascot, 'idle');
    if (moved) {
      persist();
      if (mode === 'resize') buildInspector();
      if (!isDesktop()) revealAboveSheet(id);
    }
  };
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onUp);
}

const pending = new Set();
let frame = 0;
function redraw(id) {
  pending.add(id);
  if (!frame) frame = requestAnimationFrame(flushRedraws);
}
function flushRedraws() {
  frame = 0;
  for (const id of pending) drawNode(id);
  pending.clear();
}

// Preview canvases show white as transparent so overlapping blocks stay visible.
function inkOnly(c) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 127) d[i + 3] = 0;
  ctx.putImageData(img, 0, 0);
  return c;
}

async function drawNode(id) {
  const n = nodes.get(id), b = getBlock(id);
  if (!n || !b) return;
  const token = ++n.token;
  try {
    const c = await renderBlock(b, { preview: true });
    if (token !== n.token || !c) return;
    c.setAttribute('aria-hidden', 'true');
    inkOnly(c);
    const first = !n.canvas;
    if (n.canvas) n.canvas.replaceWith(c); else n.el.prepend(c);
    n.canvas = c;
    n.h = c.height;
    placeBlocks();
    // A just-added block only has a size now — make sure it isn't hidden under the sheet.
    if (first && state.selected === id && !isDesktop()) revealAboveSheet(id);
  } catch (err) {
    console.error(err);
  }
}

/* ================= Selection & inspector ================= */

const inspector = $('#inspector');
const inspectorBody = $('#inspector-body');
const isDesktop = () => matchMedia('(min-width: 900px)').matches;

function select(id, { focus = false } = {}) {
  state.selected = id;
  syncPaper();
  buildInspector();
  document.body.classList.toggle('sheet-open', !!id && !isDesktop());
  fitPaper();
  if (id) {
    inspector.hidden = false;
    requestAnimationFrame(() => inspector.classList.add('open'));
    if (!isDesktop()) requestAnimationFrame(() => revealAboveSheet(id));
    if (focus) setTimeout(() => $('textarea, input.input', inspectorBody)?.focus(), 300);
  } else {
    inspector.classList.remove('open');
    if (!isDesktop()) setTimeout(() => { if (!state.selected) inspector.hidden = true; }, 300);
  }
}

let thumbTimer;
// Phones: while editing, the paper lives in the space above the (lower) edit sheet and
// shrinks to fit, so the whole design stays visible while you change it.
const paperWrap = $('.paper-wrap');
function fitPaper() {
  const editing = !isDesktop() && document.body.classList.contains('sheet-open');
  if (!editing) { paperWrap.style.maxWidth = ''; return; }
  document.documentElement.style.setProperty('--tb', `${$('.topbar').getBoundingClientRect().bottom}px`);
  const stage = $('.stage');
  const H = Math.max(40, +sheet.style.getPropertyValue('--h') || 40);
  const padX = 32, padY = 36 + 12; // paper padding + torn edge
  const availW = stage.clientWidth - 32;
  const availH = stage.clientHeight - 24 - padY;
  const fit = Math.min(availW - padX, availH * FULL / H) + padX;
  paperWrap.style.maxWidth = `${Math.max(180, Math.min(availW, fit))}px`;
}
addEventListener('resize', fitPaper);

function revealAboveSheet(id) {
  const el = nodes.get(id)?.el;
  if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Let the cat react to an action — unless it's busy printing or connecting. */
function react(mood, ms = 900) {
  if (printer.busy || connBtn.dataset.state === 'busy') return;
  pixFlash(mascot, mood, ms);
}

function update(id, patch) {
  const b = getBlock(id);
  if (!b) return;
  Object.assign(b, patch);
  if ('w' in patch && b.x != null) b.x = Math.min(b.x, FULL - boxWidth(b));
  if (b.type === 'image' && ['brightness', 'contrast', 'invert', 'grain', 'dot', 'rotate', 'src'].some(k => k in patch)) {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => $('.effects', inspectorBody)?.closest('.field')?.refresh?.(), 300);
  }
  redraw(id);
  placeBlocks();
  persist();
}

function buildInspector() {
  const b = getBlock(state.selected);
  $('.inspector-actions').hidden = !b;
  if (!b) {
    $('#inspector-title').innerHTML = '<span>Edit</span><b>Block</b>';
    inspectorBody.innerHTML = `<p class="inspector-empty">Tap anything on the paper to edit it, or add a new block.</p>`;
    return;
  }
  const T = TYPES[b.type];
  $('#inspector-title').innerHTML = `<span>Edit</span><b>${T.label}</b>`;
  const idx = state.blocks.indexOf(b);
  $('[data-act="up"]').disabled = idx === state.blocks.length - 1;
  $('[data-act="down"]').disabled = idx === 0;
  inspectorBody.innerHTML = '';
  const set = patch => update(b.id, patch);
  for (const f of [...T.fields, ...BOX_FIELDS]) if (!f.show || f.show(b)) inspectorBody.appendChild(buildField(f, b, set));
}

let fieldSeq = 0;
function buildField(f, obj, set) {
  const wrap = document.createElement('div');
  const id = `f${++fieldSeq}`;
  const put = v => set({ [f.k]: v });

  switch (f.t) {
    case 'textarea':
    case 'input': {
      wrap.className = 'field';
      const tag = f.t === 'textarea' ? 'textarea' : 'input';
      wrap.innerHTML = `
        <div class="field-head"><label class="field-label" for="${id}">${f.label}</label>${f.hint ? `<span class="field-hint">${f.hint}</span>` : ''}</div>
        <${tag} class="${tag === 'textarea' ? 'textarea' : 'input'}" id="${id}" dir="auto" placeholder="${esc(f.placeholder || '')}"></${tag}>`;
      const el = $(tag, wrap);
      el.value = obj[f.k];
      el.addEventListener('input', () => { put(el.value); react('type', 1200); });
      break;
    }
    case 'range': {
      wrap.className = 'field';
      wrap.innerHTML = `
        <div class="field-head"><label class="field-label" for="${id}">${f.label}</label><output class="field-value" for="${id}"></output></div>
        <input type="range" class="range" id="${id}" min="${f.min}" max="${f.max}" step="${f.step || 1}">`;
      const el = $('input', wrap), out = $('output', wrap);
      const paint = () => {
        const v = +el.value;
        out.textContent = f.fmt ? f.fmt(v) : v;
        el.style.setProperty('--pct', `${((v - f.min) / (f.max - f.min)) * 100}%`);
      };
      el.value = obj[f.k];
      paint();
      let last = +el.value;
      el.addEventListener('input', () => {
        paint(); put(+el.value);
        react(+el.value >= last ? 'look-right' : 'look-left', 600);
        last = +el.value;
      });
      break;
    }
    case 'seg': {
      wrap.className = 'field';
      wrap.innerHTML = `<span class="field-label" id="${id}">${f.label}</span>
        <div class="segmented" role="radiogroup" aria-labelledby="${id}">
          ${f.opts.map(([v, l]) => `<button type="button" role="radio" data-v="${v}">${l}</button>`).join('')}
        </div>`;
      bindSegmented($('.segmented', wrap), String(obj[f.k]), v => { put(typeof f.opts[0][0] === 'number' ? +v : v); react('happy', 600); });
      break;
    }
    case 'check': {
      wrap.className = 'check-row';
      wrap.innerHTML = `<label class="check-row-label" for="${id}">${f.label}${f.hint ? `<small>${f.hint}</small>` : ''}</label>
        <span class="check"><input type="checkbox" id="${id}"><span>${icon('i-check')}</span></span>`;
      const el = $('input', wrap);
      el.checked = !!obj[f.k];
      el.addEventListener('change', () => { put(el.checked); react(el.checked ? 'happy' : 'oops', 700); if (f.rebuild) buildInspector(); });
      wrap.addEventListener('click', e => { if (e.target === wrap) el.click(); });
      break;
    }
    case 'font': {
      wrap.className = 'field';
      linkFont(obj[f.k]);
      wrap.innerHTML = `<span class="field-label">${f.label}</span>
        <button type="button" class="font-btn" aria-haspopup="dialog" aria-label="Font: ${esc(obj[f.k])}. Change">
          <span style="font-family:'${obj[f.k]}', var(--font)">${esc(obj[f.k])}</span><span class="chev">${icon('i-chevron')}</span>
        </button>`;
      $('button', wrap).addEventListener('click', () => openFontPicker(obj[f.k], name => { put(name); buildInspector(); }));
      break;
    }
    case 'emoji': {
      wrap.className = 'field';
      wrap.innerHTML = `<span class="field-label">${f.label}</span>
        <div class="emoji-grid">${EMOJIS.map(e => `<button type="button" aria-pressed="${e === obj.emoji}" aria-label="${e}">${e}</button>`).join('')}</div>
        <label class="field" style="margin-top:8px"><span class="field-label">Or type your own</span>
          <input class="input" maxlength="8" value="${esc(obj.emoji)}"></label>`;
      const input = $('input', wrap);
      $$('.emoji-grid button', wrap).forEach(btn => btn.addEventListener('click', () => {
        $$('.emoji-grid button', wrap).forEach(x => x.setAttribute('aria-pressed', String(x === btn)));
        input.value = btn.textContent;
        put(btn.textContent);
        react('happy', 700);
      }));
      input.addEventListener('input', () => input.value.trim() && put(input.value.trim()));
      break;
    }
    case 'imageActions': {
      wrap.className = 'three';
      wrap.innerHTML = `
        <button type="button" class="pill pill-dark pill-sm">${obj.src ? 'Replace' : 'Choose'}</button>
        <button type="button" class="pill pill-light pill-sm">${icon('i-camera')}Camera</button>
        <button type="button" class="pill pill-light pill-sm" ${obj.src ? '' : 'disabled'}>${icon('i-rotate')}Rotate</button>`;
      const [pick, shoot, rot] = $$('button', wrap);
      pick.addEventListener('click', () => pickImage(obj.id));
      shoot.addEventListener('click', () => openCamera(obj.id));
      rot.addEventListener('click', () => { set({ rotate: ((obj.rotate || 0) + 90) % 360 }); react('spin', 700); });
      break;
    }
    case 'effect': {
      wrap.className = 'field';
      wrap.innerHTML = `<span class="field-label" id="${id}">${f.label}</span>
        <div class="effects" role="radiogroup" aria-labelledby="${id}">
          ${EFFECT_GROUPS.map(([group, list]) => `<span class="effects-group">${group}</span>` + list.map(([v, l]) =>
            `<button type="button" class="effect" role="radio" data-v="${v}">
              <span class="effect-thumb" aria-hidden="true"></span><span class="effect-name">${l}</span></button>`).join('')).join('')}
        </div>`;
      bindSegmented($('.effects', wrap), obj[f.k], v => { put(v); buildInspector(); react('wow', 1000); });
      // Live previews of this photo in every effect, drawn one at a time to stay smooth.
      let run = 0;
      const refresh = async () => {
        if (!obj.src) return;
        const mine = ++run;
        for (const btn of $$('.effect', wrap)) {
          if (mine !== run || !wrap.isConnected) return;
          try {
            const c = await effectThumb(obj, btn.dataset.v);
            $('.effect-thumb', btn).replaceChildren(inkOnly(c));
          } catch { /* leave this tile blank */ }
          await new Promise(r => setTimeout(r));
        }
      };
      wrap.refresh = refresh;
      requestAnimationFrame(() => {
        // Scroll the row (not the page) so the chosen effect is visible.
        const row = $('.effects', wrap), cur = $('[aria-checked="true"]', row);
        if (cur) {
          const r = row.getBoundingClientRect(), c = cur.getBoundingClientRect();
          row.scrollLeft += c.left - r.left - (r.width - c.width) / 2;
        }
        refresh(); // after the field is in the DOM
      });
      break;
    }
    case 'box': {
      wrap.className = 'field';
      wrap.innerHTML = `<span class="field-label" id="${id}">${f.label}</span>
        <div class="segmented" role="group" aria-labelledby="${id}">
          <button type="button" data-p="full">Full</button>
          <button type="button" data-p="left">Left half</button>
          <button type="button" data-p="right">Right half</button>
          <button type="button" data-p="center">Center</button>
        </div>`;
      $$('button', wrap).forEach(btn => btn.addEventListener('click', () => {
        const w = boxWidth(obj);
        const half = FULL / 2;
        const patch = { full: { x: 0, w: FULL }, left: { x: 0, w: half }, right: { x: half, w: half }, center: { x: Math.round((FULL - w) / 2) } }[btn.dataset.p];
        set(patch);
        placeBlocks();
        buildInspector();
      }));
      break;
    }
    case 'drawActions': {
      wrap.className = 'field';
      wrap.innerHTML = `<button type="button" class="pill pill-dark">${obj.src ? 'Edit drawing' : 'Open canvas'}</button>`;
      $('button', wrap).addEventListener('click', () => openDraw(obj.id));
      break;
    }
  }
  return wrap;
}

function bindSegmented(group, value, onChange) {
  const btns = $$('[role="radio"]', group);
  const mark = v => btns.forEach(x => {
    const on = x.dataset.v === v;
    x.setAttribute('aria-checked', String(on));
    x.tabIndex = on ? 0 : -1;
  });
  mark(value);
  if (!btns.some(x => x.dataset.v === value) && btns[0]) btns[0].tabIndex = 0;
  btns.forEach((btn, i) => {
    btn.addEventListener('click', () => { mark(btn.dataset.v); onChange(btn.dataset.v); });
    btn.addEventListener('keydown', e => {
      const dir = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      const next = btns[(i + dir + btns.length) % btns.length];
      next.focus();
      next.click();
    });
  });
}

/* ================= Block actions ================= */

function addBlock(type, tile) {
  // New blocks land full-width under everything on the paper, on top of the stack.
  const boxes = placeBlocks();
  const bottom = Math.max(0, ...boxes.map(p => p.y + p.h));
  const b = newBlock(type, { x: 0, y: bottom, w: FULL });
  state.blocks.push(b);
  persist();
  pixFlash(mascot, 'wow', 1200);
  select(b.id, { focus: type === 'text' || type === 'list' || type === 'qr' });
  if (type === 'image') pickImage(b.id);
  if (type === 'drawing') openDraw(b.id);
}

function blockAction(act, id = state.selected) {
  const i = state.blocks.findIndex(b => b.id === id);
  if (i < 0) return;
  if (act === 'done') { react('happy', 600); return select(null); }
  if (act === 'del') {
    const [removed] = state.blocks.splice(i, 1);
    persist();
    pixFlash(mascot, 'oops', 1500);
    select(null);
    toast(`${TYPES[removed.type].label} deleted`, 'info', { label: 'Undo', run: () => { state.blocks.splice(i, 0, removed); persist(); select(removed.id); } });
    return;
  }
  if (act === 'dup') {
    const src = state.blocks[i];
    const copy = { ...structuredClone(src), id: uid(), x: Math.min((src.x ?? 0) + 16, FULL - boxWidth(src)), y: (src.y ?? 0) + 16 };
    state.blocks.push(copy);
    persist();
    pixFlash(mascot, 'happy', 900);
    return select(copy.id);
  }
  // Array order is stacking order: "up" brings the block in front.
  const j = act === 'up' ? i + 1 : i - 1;
  if (j < 0 || j >= state.blocks.length) return;
  [state.blocks[i], state.blocks[j]] = [state.blocks[j], state.blocks[i]];
  persist();
  react(act === 'up' ? 'wow' : 'oops', 600);
  select(id);
}

function setBlocks(blocks) {
  state.blocks = blocks;
  for (const n of nodes.values()) n.el.remove();
  nodes.clear();
  blocks.forEach(b => b.font && linkFont(b.font));
  persist();
  select(null);
}

/* ================= Images ================= */

const fileInput = $('#file-input');
let fileTarget = null;
function pickImage(id) {
  fileTarget = id;
  fileInput.value = '';
  fileInput.click();
}
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file || !fileTarget) return;
  try {
    const src = await downscale(file, 1024);
    update(fileTarget, { src, rotate: 0 });
    react('wow', 1500);
    if (state.selected === fileTarget) buildInspector();
  } catch {
    toast("Couldn't open that image", 'error');
  }
});

async function downscale(file, max) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ================= Dialogs ================= */

function openDialog(dlg) {
  if (!dlg.open) dlg.showModal();
}
$$('dialog').forEach(dlg => {
  dlg.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) dlg.close();
    else if (e.target === dlg && dlg.id !== 'dlg-progress') dlg.close(); // backdrop
  });
});

/* ---- Font picker ---- */
const FONT_FILTERS = [['all', 'All'], ['he', 'Hebrew'], ['en', 'English only'], ['נקי', 'Clean'], ['כותרות', 'Display'], ['כתב יד', 'Handwritten'], ['סריף', 'Serif'], ['מיוחד', 'Fun']];
const CAT_EN = Object.fromEntries(FONT_FILTERS.slice(3).map(([k, v]) => [k, v]));
CAT_EN['עגול'] = 'Rounded';
let fontFilter = 'all', fontCallback = null, fontCurrent = null;

const filterBox = $('#font-filters');
filterBox.classList.add('segmented');
filterBox.innerHTML = FONT_FILTERS.map(([v, l]) => `<button type="button" role="radio" data-v="${v}">${l}</button>`).join('');
bindSegmented(filterBox, fontFilter, v => { fontFilter = v; renderFontList(); });
$('#font-search').addEventListener('input', renderFontList);

function openFontPicker(current, cb) {
  linkAllFonts();
  fontCurrent = current;
  fontCallback = cb;
  $('#font-search').value = '';
  renderFontList();
  openDialog($('#dlg-fonts'));
  react('search', 1600);
  requestAnimationFrame(() => $('#font-list [aria-selected="true"]')?.scrollIntoView({ block: 'center' }));
}

function renderFontList() {
  const q = $('#font-search').value.trim().toLowerCase();
  const list = FONTS.filter(f =>
    (fontFilter === 'all' || (fontFilter === 'he' && f.he) || (fontFilter === 'en' && !f.he) || f.cat === fontFilter) &&
    (!q || f.name.toLowerCase().includes(q) || (CAT_EN[f.cat] || '').toLowerCase().includes(q)));
  $('#font-list').innerHTML = list.length ? list.map(f => `
    <button type="button" class="font-item" role="option" aria-selected="${f.name === fontCurrent}" data-name="${esc(f.name)}">
      <span class="font-item-text">
        <span class="font-sample" style="font-family:'${f.name}', var(--font)">${f.he ? 'Hello · שלום' : 'Hello World'}</span>
        <span class="font-name">${esc(f.name)}<em>${f.he ? 'Hebrew + English' : 'English'} · ${CAT_EN[f.cat]}</em></span>
      </span>
      <span class="check" aria-hidden="true"><span>${icon('i-check')}</span></span>
    </button>`).join('') : `<p class="saved-empty">No fonts found</p>`;
}
$('#font-list').addEventListener('click', e => {
  const item = e.target.closest('.font-item');
  if (!item) return;
  fontCallback?.(item.dataset.name);
  pixFlash(mascot, 'happy', 700);
  $('#dlg-fonts').close();
});

/* ---- Templates & saved designs ---- */
const tplCache = new Map();

async function thumb(blocks) {
  const canvases = await Promise.all(blocks.map(b => renderBlock(b, { preview: true })));
  return compose(canvases, layout(blocks, canvases.map(c => c?.height ?? 0)));
}

function openTemplates(tab = 'tpl') {
  showTab(tab);
  const grid = $('#tpl-grid');
  if (!grid.children.length) {
    grid.innerHTML = TEMPLATES.map((t, i) => `
      <button type="button" class="tpl" data-i="${i}" style="animation-delay:${i * 40}ms">
        <div class="tpl-thumb" aria-hidden="true"></div>
        <span class="tpl-name">${t.name}</span>
      </button>`).join('');
    TEMPLATES.forEach(async (t, i) => {
      if (!tplCache.has(i)) tplCache.set(i, thumb(t.make()));
      $(`.tpl[data-i="${i}"] .tpl-thumb`, grid).replaceChildren(await tplCache.get(i));
    });
  }
  renderSaved();
  openDialog($('#dlg-templates'));
  react('search', 1600);
}

function showTab(tab) {
  $$('#dlg-templates .tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
  $('#tpl-grid').hidden = tab !== 'tpl';
  $('#saved-list').hidden = tab !== 'saved';
}
$$('#dlg-templates .tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

$('#tpl-grid').addEventListener('click', e => {
  const t = e.target.closest('.tpl');
  if (!t) return;
  const tpl = TEMPLATES[+t.dataset.i];
  setBlocks(tpl.make());
  $('#dlg-templates').close();
  pixFlash(mascot, 'wow', 1400);
  toast(`"${tpl.name}" loaded`, 'success');
});

function renderSaved() {
  const designs = store.get('designs', []);
  $('#saved-list').innerHTML = designs.length ? designs.map(d => `
    <div class="saved-item">
      <button type="button" class="saved-open" data-id="${d.id}">
        <strong>${esc(d.name)}</strong>
        <span>${new Date(d.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${d.blocks.length} blocks</span>
      </button>
      <button type="button" class="icon-btn" data-del="${d.id}" aria-label="Delete ${esc(d.name)}">${icon('i-trash')}</button>
    </div>`).join('') : `<p class="saved-empty">No saved designs yet.<br>Tap “Save” above the paper to keep the current one.</p>`;
}
$('#saved-list').addEventListener('click', e => {
  const designs = store.get('designs', []);
  const open = e.target.closest('.saved-open');
  const del = e.target.closest('[data-del]');
  if (open) {
    const d = designs.find(x => x.id === open.dataset.id);
    if (d) { setBlocks(structuredClone(d.blocks)); $('#dlg-templates').close(); toast(`"${d.name}" opened`, 'success'); }
  } else if (del) {
    store.set('designs', designs.filter(x => x.id !== del.dataset.del));
    renderSaved();
  }
});

/* ---- Save / New ---- */
$('#btn-save').addEventListener('click', () => {
  if (!state.blocks.length) return toast('Nothing to save — the paper is blank', 'error');
  $('#save-name').value = '';
  openDialog($('#dlg-save'));
  $('#save-name').focus();
});
$('#save-form').addEventListener('submit', e => {
  const name = $('#save-name').value.trim();
  if (!name) { e.preventDefault(); return; }
  const designs = store.get('designs', []);
  designs.unshift({ id: uid(), name, blocks: structuredClone(state.blocks), updated: Date.now() });
  if (store.set('designs', designs)) { toast(`"${name}" saved`, 'success'); pixFlash(mascot, 'love', 2400); }
  else toast('Out of storage — delete some old designs', 'error');
});

$('#btn-new').addEventListener('click', async () => {
  if (state.blocks.length && !(await confirmBox('Start fresh?', 'The current design will be cleared. Save it first if you want to keep it.', 'Clear paper'))) return;
  setBlocks([]);
});

/* ---- Settings ---- */
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') {
    document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else document.documentElement.dataset.theme = t;
}

function openSettings() {
  const body = $('#settings-body');
  body.innerHTML = '';
  const fields = [
    { k: 'darkness', t: 'seg', label: 'Print darkness', opts: [['light', 'Light'], ['normal', 'Normal'], ['dark', 'Dark'], ['max', 'Max']] },
    { k: 'speed', t: 'seg', label: 'Print speed', opts: [['normal', 'Normal'], ['slow', 'Slow & safe']] },
    { k: 'copies', t: 'range', label: 'Copies', min: 1, max: 10, fmt: v => `× ${v}` },
    { k: 'feed', t: 'range', label: 'Paper feed after print', min: 0, max: 200, step: 8, fmt: mm },
    { k: 'theme', t: 'seg', label: 'Appearance', opts: [['light', 'Light'], ['dark', 'Dark'], ['auto', 'System']] },
  ];
  const set = patch => {
    Object.assign(state.settings, patch);
    store.set('settings', state.settings);
    if ('theme' in patch) { applyTheme(); if (patch.theme === 'dark') react('sleep', 1500); }
  };
  for (const f of fields) body.appendChild(buildField(f, state.settings, set));
  openDialog($('#dlg-settings'));
  react('search', 1200);
}

/* ---- Confirm ---- */
function confirmBox(title, text, okLabel) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog dialog-sm';
    dlg.innerHTML = `
      <div class="dialog-body" style="padding-top:28px;gap:8px"><h2 class="title-md"><b>${title}</b></h2><p class="muted" style="font-size:14px">${text}</p></div>
      <div class="dialog-foot"><button class="pill pill-light" data-v="0">Cancel</button><button class="pill pill-dark" data-v="1">${okLabel}</button></div>`;
    document.body.appendChild(dlg);
    let result = false;
    dlg.addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (b) { result = b.dataset.v === '1'; dlg.close(); }
      else if (e.target === dlg) dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
    $('[data-v="1"]', dlg).focus();
  });
}

/* ---- Drawing ---- */
const draw = { canvas: $('#draw-canvas'), mode: 'pen', size: 6, undo: [], target: null, drawing: false, last: null };
draw.ctx = draw.canvas.getContext('2d', { willReadFrequently: true });
bindSegmented($('#draw-mode'), 'pen', v => { draw.mode = v; });
bindSegmented($('#draw-size'), '6', v => { draw.size = +v; });

async function openDraw(id) {
  const b = getBlock(id);
  draw.target = id;
  draw.undo = [];
  const { canvas, ctx } = draw;
  canvas.width = PRINT_WIDTH;
  canvas.height = b.height || 384;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (b.src) {
    const img = await loadImage(b.src);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.width * img.naturalHeight / img.naturalWidth);
  }
  openDialog($('#dlg-draw'));
}

function pos(e) {
  const r = draw.canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * draw.canvas.width / r.width, (e.clientY - r.top) * draw.canvas.height / r.height];
}
function stroke(from, to) {
  const { ctx } = draw;
  ctx.strokeStyle = draw.mode === 'eraser' ? '#fff' : '#000';
  ctx.lineWidth = draw.mode === 'eraser' ? draw.size * 3 : draw.size;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(...from);
  ctx.lineTo(...to);
  ctx.stroke();
}
draw.canvas.addEventListener('pointerdown', e => {
  draw.canvas.setPointerCapture(e.pointerId);
  draw.undo.push(draw.ctx.getImageData(0, 0, draw.canvas.width, draw.canvas.height));
  if (draw.undo.length > 30) draw.undo.shift();
  draw.drawing = true;
  draw.last = pos(e);
  stroke(draw.last, draw.last);
});
draw.canvas.addEventListener('pointermove', e => {
  if (!draw.drawing) return;
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of events) { const p = pos(ev); stroke(draw.last, p); draw.last = p; }
  if (Math.abs(e.movementX) > 1) react(e.movementX > 0 ? 'look-right' : 'look-left', 500);
});
['pointerup', 'pointercancel'].forEach(t => draw.canvas.addEventListener(t, () => { draw.drawing = false; }));
$('#draw-undo').addEventListener('click', () => { const s = draw.undo.pop(); if (s) draw.ctx.putImageData(s, 0, 0); react('oops', 600); });
$('#draw-clear').addEventListener('click', () => {
  draw.undo.push(draw.ctx.getImageData(0, 0, draw.canvas.width, draw.canvas.height));
  draw.ctx.fillStyle = '#fff';
  draw.ctx.fillRect(0, 0, draw.canvas.width, draw.canvas.height);
});
$('#draw-done').addEventListener('click', () => {
  update(draw.target, { src: draw.canvas.toDataURL('image/png'), height: draw.canvas.height });
  if (state.selected === draw.target) buildInspector();
  $('#dlg-draw').close();
});

/* ---- Camera: live preview already in the print effect ---- */
const CAM_EFFECTS = [
  ['atkinson', 'Atkinson'], ['bayer8', 'Bayer 8×8'], ['halftone', 'Halftone'], ['pixel', 'Pixel'],
  ['threshold', 'Comic'], ['lines', 'Lines'], ['crosshatch', 'Hatch'], ['sketch', 'Sketch'], ['noise', 'Noise'],
];
const cam = { stream: null, facing: 'environment', mode: 'atkinson', raf: 0, last: 0, shot: null, target: null };
// The camera only picks the effect; fine-tuning (dot size, grain, brightness…) happens
// in the photo's edit panel afterwards. These are the photo block defaults.
const camLook = { dither: 'atkinson', dot: 1, grain: 6, brightness: 0, contrast: 10 };
const camView = $('#cam-view'), camVideo = $('#cam-video'), camDlg = $('#dlg-camera');

$('#cam-effects').innerHTML = CAM_EFFECTS.map(([v, l]) => `<button type="button" role="radio" data-v="${v}">${l}</button>`).join('');
bindSegmented($('#cam-effects'), cam.mode, v => { cam.mode = camLook.dither = v; react('wow', 700); if (cam.shot) showShot(); });

function camMessage(text) {
  $('#cam-msg').hidden = !text;
  $('#cam-msg').textContent = text || '';
}

function camReview(on) {
  $('#cam-review').hidden = !on;
  $('.cam-bar:not(.cam-review)', camDlg).hidden = on;
}

/** targetId: replace that photo block's image; otherwise a new photo block is added. */
async function openCamera(targetId = null) {
  if (!navigator.mediaDevices?.getUserMedia) return toast("This browser can't open the camera", 'error');
  cam.target = targetId;
  cam.shot = null;
  camReview(false);
  openDialog(camDlg);
  await startCamera();
}

async function startCamera() {
  stopCamera();
  camMessage('Starting camera…');
  react('search', 2500);
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: cam.facing, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false,
    });
    camVideo.srcObject = cam.stream;
    await camVideo.play();
    camMessage(null);
    camLoop();
  } catch (err) {
    camMessage(err?.name === 'NotAllowedError'
      ? 'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.'
      : 'No camera found on this device.');
    react('sad', 1600);
  }
}

function stopCamera() {
  cancelAnimationFrame(cam.raf);
  cam.stream?.getTracks().forEach(t => t.stop());
  cam.stream = null;
}

// Draw a source (video or image) at print width, mirrored for the selfie camera, then apply the effect.
function camRender(src, sw, sh, mirror) {
  const h = Math.round(FULL * sh / sw);
  if (camView.width !== FULL || camView.height !== h) { camView.width = FULL; camView.height = h; }
  const ctx = camView.getContext('2d', { willReadFrequently: true });
  ctx.save();
  if (mirror) { ctx.translate(FULL, 0); ctx.scale(-1, 1); }
  ctx.drawImage(src, 0, 0, FULL, h);
  ctx.restore();
  applyEffect(camView, cam.mode, { brightness: camLook.brightness, contrast: camLook.contrast, cell: camLook.grain, dot: camLook.dot });
}

function camLoop(t = 0) {
  cam.raf = requestAnimationFrame(camLoop);
  // ~12 fps is plenty for a 1-bit preview and keeps phones cool.
  if (t - cam.last < 80 || !camVideo.videoWidth) return;
  cam.last = t;
  camRender(camVideo, camVideo.videoWidth, camVideo.videoHeight, cam.facing === 'user');
}

async function showShot() {
  const img = await loadImage(cam.shot);
  camRender(img, img.naturalWidth, img.naturalHeight, false);
}

async function capture() {
  if (!camVideo.videoWidth) return;
  cancelAnimationFrame(cam.raf);
  const k = Math.min(1, 1024 / Math.max(camVideo.videoWidth, camVideo.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(camVideo.videoWidth * k);
  c.height = Math.round(camVideo.videoHeight * k);
  const ctx = c.getContext('2d');
  if (cam.facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(camVideo, 0, 0, c.width, c.height);
  cam.shot = c.toDataURL('image/jpeg', 0.9);
  await showShot();
  camReview(true);
  react('happy', 1200);
}

/* Self-timer: Off → 3s → 10s. With a timer set, the shutter starts a countdown. */
const TIMER_STEPS = [0, 3, 10];
cam.timer = 0;
cam.countdown = 0;

function cancelCountdown() {
  clearInterval(cam.countdown);
  cam.countdown = 0;
  $('#cam-count').hidden = true;
  $('#cam-shutter').classList.remove('counting');
  $('#cam-shutter').setAttribute('aria-label', 'Take photo');
}

$('#cam-timer').addEventListener('click', () => {
  cam.timer = TIMER_STEPS[(TIMER_STEPS.indexOf(cam.timer) + 1) % TIMER_STEPS.length];
  $('#cam-timer-label').textContent = cam.timer ? `${cam.timer}s` : 'Off';
  $('#cam-timer').setAttribute('aria-label', `Self-timer: ${cam.timer ? cam.timer + ' seconds' : 'off'}`);
  $('#cam-timer').classList.toggle('on', !!cam.timer);
  react(cam.timer ? 'wow' : 'oops', 600);
});

$('#cam-shutter').addEventListener('click', () => {
  if (cam.countdown) { cancelCountdown(); react('oops', 600); return; }
  if (!cam.timer) { capture(); return; }
  let left = cam.timer;
  const count = $('#cam-count');
  count.textContent = left;
  count.hidden = false;
  $('#cam-shutter').classList.add('counting');
  $('#cam-shutter').setAttribute('aria-label', 'Cancel timer');
  pix(mascot, 'wow');
  cam.countdown = setInterval(() => {
    left -= 1;
    if (left > 0) { count.textContent = left; return; }
    cancelCountdown();
    capture();
  }, 1000);
});

$('#cam-retake').addEventListener('click', () => {
  cancelCountdown();
  cam.shot = null;
  camReview(false);
  camLoop();
});

$('#cam-use').addEventListener('click', () => {
  const src = cam.shot;
  if (!src) return;
  if (cam.target && getBlock(cam.target)) {
    update(cam.target, { src, rotate: 0, ...camLook });
    if (state.selected === cam.target) buildInspector();
  } else {
    const boxes = placeBlocks();
    const bottom = Math.max(0, ...boxes.map(p => p.y + p.h));
    const b = newBlock('image', { src, ...camLook, x: 0, y: bottom, w: FULL });
    state.blocks.push(b);
    persist();
    select(b.id);
  }
  camDlg.close();
  pixFlash(mascot, 'love', 1800);
});

$('#cam-flip').addEventListener('click', () => {
  cancelCountdown();
  cam.facing = cam.facing === 'user' ? 'environment' : 'user';
  react('spin', 700);
  startCamera();
});

camDlg.addEventListener('close', () => { cancelCountdown(); stopCamera(); });

/* ================= Printer ================= */

const printer = new CatPrinter();
const connBtn = $('#btn-connect');

const mascot = $('#mascot');
function setConn(st, label) {
  connBtn.dataset.state = st;
  $('.conn-label', connBtn).textContent = label;
  const dot = $('.conn-dot', connBtn);
  // While connecting, the status dot becomes a tiny cat scanning for the printer.
  if (st === 'busy') { pix(dot, 'search'); pix(mascot, 'search'); }
  else stopAnim(dot);
}
printer.addEventListener('connect', () => { setConn('on', printer.name); toast(`Connected to ${printer.name}`, 'success'); pixFlash(mascot, 'happy'); });
printer.addEventListener('disconnect', () => { setConn('off', 'Connect'); pixFlash(mascot, 'sad'); });
printer.addEventListener('reconnecting', () => setConn('busy', 'Reconnecting'));
printer.addEventListener('status', e => {
  const s = e.detail;
  if (s.noPaper) toast('The printer is out of paper', 'error');
  else if (s.coverOpen) toast('The printer cover is open', 'error');
  else if (s.overheat) toast('The printer is too hot — give it a minute', 'error');
  else if (s.lowBattery) toast('Printer battery is low — plug it in', 'error');
});

async function connect() {
  if (!isBluetoothSupported()) { toast("This browser can't use Bluetooth", 'error'); return false; }
  setConn('busy', 'Connecting');
  try {
    if (printer.device && !printer.connected) await printer.reconnect().catch(() => printer.connect());
    else await printer.connect();
    return true;
  } catch (err) {
    setConn('off', 'Connect');
    if (err?.name !== 'NotFoundError') {
      // Say what actually went wrong, so it can be fixed (or reported).
      const hint = {
        NetworkError: 'The printer may be connected to another device (the Mac, or Tiny Print). Disconnect it there and try again.',
        SecurityError: 'Bluetooth permission is off for this browser — allow it in the phone Settings.',
        NotAllowedError: 'Bluetooth permission is off for this browser — allow it in the phone Settings.',
        InvalidStateError: 'Bluetooth is off — turn it on and try again.',
      }[err?.name] || 'Is the printer on and nearby?';
      toast(`Connection failed. ${hint} (${err?.name || 'Error'}: ${err?.message || 'unknown'})`, 'error');
      console.error(err);
    }
    else pix(mascot, 'idle');
    return false;
  }
}

connBtn.addEventListener('click', async () => {
  if (printer.connected) {
    if (await confirmBox('Disconnect?', `${printer.name} will disconnect from this device.`, 'Disconnect')) printer.disconnect();
  } else connect();
});

const printBtn = $('#btn-print');

function setProgress(p) {
  const pct = Math.round(p * 100);
  $('#prog-bar').style.width = pct + '%';
  $('#prog-bar').parentElement.setAttribute('aria-valuenow', pct);
  $('#prog-text').textContent = pct + '%';
  printBtn.style.setProperty('--p', p);
}

async function doPrint() {
  if (!state.blocks.length) return toast('The paper is blank — add something first', 'error');
  if (!printer.connected && !(await connect())) return;
  const canvases = await Promise.all(state.blocks.map(b => renderBlock(b, { preview: false })));
  const rows = canvasToRows(compose(canvases, layout(state.blocks, canvases.map(c => c?.height ?? 0))));
  if (!rows.length) return toast('Nothing to print — the blocks are empty', 'error');
  if (printer.status?.noPaper) return toast('The printer is out of paper', 'error');

  const dlg = $('#dlg-progress');
  const copies = state.settings.copies || 1;
  setProgress(0);
  pix($('#prog-cat'), 'print');
  pix(mascot, 'print');
  openDialog(dlg);
  printBtn.disabled = true;
  printBtn.classList.add('printing');
  try {
    for (let c = 0; c < copies; c++) {
      $('#prog-title').innerHTML = copies > 1 ? `<span>Copy ${c + 1} of ${copies}</span><b>Printing</b>` : '<span>Now</span><b>Printing</b>';
      const done = await printer.print(rows, {
        darkness: state.settings.darkness,
        slow: state.settings.speed === 'slow',
        feed: c < copies - 1 ? 24 : state.settings.feed,
        onProgress: setProgress,
      });
      if (!done) { toast('Printing stopped'); break; }
      if (c === copies - 1) { toast('Printed! Tap Feed to push more paper out', 'success'); pixFlash(mascot, 'happy', 2400); }
    }
  } catch (err) {
    console.error(err);
    toast('Printing failed — the connection dropped. Try again', 'error');
  } finally {
    if (mascot.dataset.mood === 'print') pix(mascot, 'idle');
    dlg.close();
    printBtn.disabled = false;
    printBtn.classList.remove('printing');
    setProgress(0);
  }
}

$('#prog-cancel').addEventListener('click', () => printer.cancel());

const feedBtn = $('#btn-feed');
feedBtn.addEventListener('click', async () => {
  if (!printer.connected && !(await connect())) return;
  feedBtn.disabled = true;
  try {
    await printer.feed(96); // ~12 mm per tap
    pixFlash(mascot, 'walk', 900);
  } catch {
    toast("Couldn't feed — is the printer still connected?", 'error');
  } finally {
    setTimeout(() => { feedBtn.disabled = false; }, 500);
  }
});
$('#dlg-progress').addEventListener('cancel', e => { e.preventDefault(); printer.cancel(); });

/* ================= Toasts ================= */

function toast(msg, kind = 'info', action) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span class="toast-cat"></span><span>${esc(msg)}</span>`;
  pix($('.toast-cat', el), kind === 'success' ? 'happy' : kind === 'error' ? 'sad' : 'idle');
  if (kind === 'error') pixFlash(mascot, 'sad', 2200);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.addEventListener('click', () => { action.run(); el.remove(); });
    el.appendChild(b);
  }
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), action || msg.length > 80 ? 9000 : 3200);
}

/* ================= Menu & intro ================= */

const menuBtn = $('#btn-menu'), menu = $('#menu');
function toggleMenu(open = menu.hidden) {
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  react(open ? 'look-right' : 'idle', open ? 4000 : 10);
  if (open) $('button', menu).focus();
}
menuBtn.addEventListener('click', () => toggleMenu());
document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('.menu-wrap')) toggleMenu(false); });
menu.addEventListener('click', e => {
  const item = e.target.closest('[data-menu]');
  if (!item) return;
  toggleMenu(false);
  ({ templates: () => openTemplates('tpl'), saved: () => openTemplates('saved'), settings: openSettings, home: showSplash })[item.dataset.menu]();
});

/* ---- Intro: on every load the cat prints row by row and the name "compiles" ---- */
const intro = $('#intro');
const GLYPHS = '01<>/_#$%&*+=?';
let introDone = null;

function playIntro() {
  intro.hidden = false;
  intro.classList.remove('done');
  const name = $('.intro-text', intro), log = $('#intro-log');
  const catSvg = $('#intro-cat');
  const grid = catGrid('idle');
  const timers = [];
  // Plays even with the OS "reduce motion" setting: it's brief and has no large movement.
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  name.textContent = log.textContent = '';
  log.dataset.prev = '';
  catSvg.innerHTML = '';

  // 1. The cat comes out like a printout, one row at a time.
  grid.forEach((_, r) => at(60 + r * 55, () => { catSvg.innerHTML = gridRects(grid.slice(0, r + 1)); }));

  // 2. A short boot log types itself.
  const lines = ['> boot minip', '> load cat ........ ok', '> warm print head . ok', '> ready_'];
  let t = 120;
  lines.forEach(line => {
    for (let i = 1; i <= line.length; i++) { const txt = line.slice(0, i); const done = log.dataset; at(t, () => { log.textContent = (done.prev || '') + txt; }); t += 14; }
    at(t, () => { log.dataset.prev = (log.dataset.prev || '') + line + '\n'; });
    t += 90;
  });

  // 3. The name decodes from random glyphs, left to right.
  const target = 'MiniP';
  const start = 450, frames = 22;
  for (let f = 0; f <= frames; f++) {
    at(start + f * 45, () => {
      const out = [...target].map((ch, i) => (f >= 6 + i * 3 || ch === ' ' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
      name.textContent = out;
    });
  }

  return new Promise(resolve => {
    const finish = () => {
      timers.forEach(clearTimeout);
      log.dataset.prev = '';
      catSvg.innerHTML = gridRects(grid);
      name.textContent = target;
      intro.classList.add('done');
      setTimeout(() => { intro.hidden = true; resolve(); }, 260);
      intro.removeEventListener('click', finish);
      introDone = null;
    };
    introDone = finish;
    intro.addEventListener('click', finish);
    at(start + frames * 45 + 650, finish);
  });
}
function showSplash() { playIntro(); }

/* ================= Wiring ================= */

function buildAddButtons() {
  const order = ['text', 'image', 'list', 'qr', 'drawing', 'emoji', 'divider', 'spacer', 'receipt'];
  const tile = (k, label, ic) => `<button type="button" class="tile" data-add="${k}" aria-label="Add ${label}">${icon(ic)}<span>${label}</span></button>`;
  const html = order.map(k => tile(k, TYPES[k].label, TYPES[k].icon) + (k === 'image' ? tile('camera', 'Camera', 'i-camera') : '')).join('');
  $('#add-row').innerHTML = html;
  $('#add-grid').innerHTML = html;
  $$('[data-add]').forEach(b => b.addEventListener('click', () => (b.dataset.add === 'camera' ? openCamera() : addBlock(b.dataset.add, b))));
}

$$('.inspector-actions [data-act]').forEach(b => b.addEventListener('click', () => blockAction(b.dataset.act)));
printBtn.addEventListener('click', doPrint);
$('#btn-empty-templates').addEventListener('click', () => openTemplates());

document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape' && !menu.hidden) return toggleMenu(false);
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === 'Escape' && state.selected) select(null);
  if (!typing && state.selected && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); blockAction('del'); }
  const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!typing && state.selected && nudge && !e.target.closest?.('[role="radio"]')) {
    e.preventDefault();
    const b = getBlock(state.selected), step = e.shiftKey ? 8 : 1;
    b.x = Math.max(0, Math.min(FULL - boxWidth(b), (b.x ?? 0) + nudge[0] * step));
    b.y = Math.max(0, (b.y ?? 0) + nudge[1] * step);
    placeBlocks();
    persist();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'p') { e.preventDefault(); doPrint(); }
});

matchMedia('(min-width: 900px)').addEventListener('change', () => {
  inspector.hidden = !isDesktop() && !state.selected;
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

if (!isBluetoothSupported()) $('#bt-banner').hidden = false;

// The intro plays on every load (#app skips it — handy for testing).
if (location.hash === '#app') intro.hidden = true;
else playIntro();

applyTheme();
pix(mascot, 'idle');
mascot.addEventListener('click', () => pixFlash(mascot, 'wow', 1700));
if (matchMedia('(hover: hover) and (pointer: fine)').matches) document.documentElement.style.setProperty('--cursor', pixelCursor());
buildAddButtons();
state.blocks.forEach(b => b.font && linkFont(b.font));
syncPaper();
buildInspector();
inspector.hidden = !isDesktop();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
