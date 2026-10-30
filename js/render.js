// Turns blocks into 1-bit canvases at printer resolution — what you see is what prints.
// Each block renders at its own box width (b.w dots); the page composes them at (b.x, b.y).
import { PRINT_WIDTH } from './printer.js';
import { ensureFont, nearestWeight } from './fonts.js';

export const FULL = PRINT_WIDTH;
export const MIN_W = 48;
const FALLBACK = '"Heebo", "Arial Hebrew", system-ui, sans-serif';
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

if (typeof qrcode !== 'undefined') qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

/* ---------- helpers ---------- */

export const boxWidth = b => Math.round(Math.min(FULL, Math.max(MIN_W, b.w ?? FULL)));
const padFor = w => (w >= 300 ? 12 : w >= 120 ? 8 : 4);

function makeCanvas(h, w) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  return [c, ctx];
}

export function isRTL(text) {
  const m = /[֐-׿؀-ۿ]|[A-Za-z]/.exec(text || '');
  return !!m && /[֐-ۿ]/.test(m[0]);
}

function resolveAlign(align, rtl) {
  if (align === 'auto' || !align) return rtl ? 'right' : 'left';
  return align;
}

function alignX(align, W, contentW, pad) {
  if (align === 'right') return W - pad - contentW;
  if (align === 'center') return Math.round((W - contentW) / 2);
  return pad;
}

function anchorX(align, W, pad) {
  return align === 'right' ? W - pad : align === 'center' ? W / 2 : pad;
}

function fontString(family, size, bold) {
  return `${nearestWeight(family, bold)} ${size}px "${family}", ${FALLBACK}`;
}

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line) out.push(line);
      // A single word wider than the box gets broken by characters.
      if (ctx.measureText(word).width > maxW) {
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxW && chunk) { out.push(chunk); chunk = ch; }
          else chunk += ch;
        }
        line = chunk;
      } else line = word;
    }
    out.push(line);
  }
  return out;
}

function vMetrics(ctx, size) {
  const m = ctx.measureText('Agאק');
  return { asc: m.fontBoundingBoxAscent ?? size * 0.8, desc: m.fontBoundingBoxDescent ?? size * 0.2 };
}

const imageCache = new Map();
export function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

/* ---------- dithering ---------- */

function toGray(data, { brightness = 0, contrast = 0, invert = false, ink = 1 } = {}) {
  const n = data.length / 4;
  const g = new Float32Array(n);
  const c = contrast * 2.55;
  const cf = (259 * (c + 255)) / (255 * (259 - c));
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255;
    // Transparent pixels read as white paper.
    // `ink` < 1 darkens everything that isn't paper (pale colours would otherwise vanish).
    let v = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) * ink * a + 255 * (1 - a);
    v = (v - 128) * cf + 128 + brightness * 1.28;
    if (invert) v = 255 - v;
    g[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return g;
}

// Error-diffusion kernels: [dx, dy, weight], normalised by the divisor.
const KERNELS = {
  floyd: [16, [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]]],
  // Atkinson only passes on 6/8 of the error — lighter, crisper, great on thermal paper.
  atkinson: [8, [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]]],
  stucki: [42, [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
    [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]]],
  jarvis: [48, [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
    [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]]],
  sierra: [32, [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2],
    [-1, 2, 2], [0, 2, 3], [1, 2, 2]]],
};

// Bayer threshold matrices of size 2^k, values spread over 0..255.
function bayerMatrix(n) {
  let m = [[0]];
  while (m.length < n) {
    const s = m.length, next = [];
    for (let y = 0; y < s * 2; y++) {
      next.push([]);
      for (let x = 0; x < s * 2; x++) {
        next[y].push(4 * m[y % s][x % s] + [[0, 2], [3, 1]][(y / s) | 0][(x / s) | 0]);
      }
    }
    m = next;
  }
  return m.flat().map(v => (v + 0.5) * 256 / (n * n));
}
const BAYERS = { 2: bayerMatrix(2), 4: bayerMatrix(4), 8: bayerMatrix(8) };

function ordered(g, w, h, n) {
  const m = BAYERS[n];
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    out[y * w + x] = g[y * w + x] < m[(y % n) * n + (x % n)] ? 1 : 0;
  }
  return out;
}

// Threshold against noise: "noise" uses interleaved-gradient noise (even, blue-noise-like
// grain with no visible grid); "random" is plain white noise for a gritty film look.
function noiseDither(g, w, h, kind) {
  const out = new Uint8Array(w * h);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = kind === 'random' ? rnd() : (52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1)) % 1;
    out[y * w + x] = g[y * w + x] < t * 255 ? 1 : 0;
  }
  return out;
}

function diffuse(g, w, h, [div, kernel]) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const old = g[i];
    const nv = old < 128 ? 0 : 255;
    out[i] = nv ? 0 : 1;
    const e = (old - nv) / div;
    for (const [dx, dy, k] of kernel) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < w && ny < h) g[ny * w + nx] += e * k;
    }
  }
  return out;
}

// Darkness 0..1 at a point, clamped to the image.
const dark = (g, w, h, x, y) => 1 - g[Math.min(h - 1, Math.max(0, y | 0)) * w + Math.min(w - 1, Math.max(0, x | 0))] / 255;

function boxBlur(g, w, h, r) {
  if (r < 1) return g;
  const tmp = new Float32Array(g.length), out = new Float32Array(g.length);
  for (let y = 0; y < h; y++) {
    let acc = 0, n = 0;
    for (let x = -r; x < w; x++) {
      if (x + r < w) { acc += g[y * w + x + r]; n++; }
      if (x - r - 1 >= 0) { acc -= g[y * w + x - r - 1]; n--; }
      if (x >= 0) tmp[y * w + x] = acc / n;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0, n = 0;
    for (let y = -r; y < h; y++) {
      if (y + r < h) { acc += tmp[(y + r) * w + x]; n++; }
      if (y - r - 1 >= 0) { acc -= tmp[(y - r - 1) * w + x]; n--; }
      if (y >= 0) out[y * w + x] = acc / n;
    }
  }
  return out;
}

// Round dots on a 45° screen; dot area tracks darkness.
function halftone(g, w, h, cell) {
  const out = new Uint8Array(w * h);
  const s = cell, c = Math.SQRT1_2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + y) * c, v = (x - y) * c;
    const cu = (Math.floor(u / s) + 0.5) * s, cv = (Math.floor(v / s) + 0.5) * s;
    // Back to image space for the cell centre's tone.
    const d = dark(g, w, h, (cu + cv) * c, (cu - cv) * c);
    const r = Math.sqrt(d / Math.PI) * s * 1.05;
    out[y * w + x] = Math.hypot(u - cu, v - cv) < r ? 1 : 0;
  }
  return out;
}

// Engraving-style horizontal lines whose thickness follows the tone.
function lines(g, w, h, cell) {
  const out = new Uint8Array(w * h);
  const s = Math.max(3, cell);
  for (let y = 0; y < h; y++) {
    const cy = (Math.floor(y / s) + 0.5) * s;
    const off = Math.abs(y + 0.5 - cy);
    for (let x = 0; x < w; x++) out[y * w + x] = off < dark(g, w, h, x, cy) * s * 0.55 ? 1 : 0;
  }
  return out;
}

// Pen-and-ink hatching: more stroke directions as the tone darkens.
function crosshatch(g, w, h, cell) {
  const out = new Uint8Array(w * h);
  const s = Math.max(4, cell);
  const t = s >= 9 ? 2 : 1;
  const soft = boxBlur(g, w, h, 2);
  const on = (v, m) => ((v % m) + m) % m < t;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = 1 - soft[y * w + x] / 255;
    let ink = d > 0.15 && on(x + y, s);
    if (d > 0.4) ink ||= on(x - y, s);
    if (d > 0.62) ink ||= on(y, s);
    if (d > 0.82) ink ||= on(x + (s >> 1), s);
    if (d > 0.94) ink = true;
    out[y * w + x] = ink ? 1 : 0;
  }
  return out;
}

// Chunky pixel art: average into big cells, dither at that scale, scale back up.
function pixelate(g, w, h, cell) {
  const s = Math.max(2, cell);
  const bw = Math.ceil(w / s), bh = Math.ceil(h / s);
  const small = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let acc = 0, n = 0;
    for (let y = by * s; y < Math.min(h, (by + 1) * s); y++)
      for (let x = bx * s; x < Math.min(w, (bx + 1) * s); x++) { acc += g[y * w + x]; n++; }
    small[by * bw + bx] = acc / n;
  }
  const bits = diffuse(small, bw, bh, KERNELS.atkinson);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = bits[((y / s) | 0) * bw + ((x / s) | 0)];
  return out;
}

// Hand-stippled look: one jittered dot per cell (two in dark areas), sized by tone.
function stipple(g, w, h, cell) {
  const out = new Uint8Array(w * h);
  const s = Math.max(3, cell);
  const hash = (a, b) => { let n = (a * 374761393 + b * 668265263) ^ 0x5bd1e995; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const dot = (cx, cy, r) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) out[y * w + x] = 1;
  };
  for (let cy = 0; cy < h; cy += s) for (let cx = 0; cx < w; cx += s) {
    const d = dark(g, w, h, cx + s / 2, cy + s / 2);
    if (d < 0.08) continue;
    const jx = (hash(cx, cy) - 0.5) * s * 0.6, jy = (hash(cy, cx) - 0.5) * s * 0.6;
    dot(cx + s / 2 + jx, cy + s / 2 + jy, Math.sqrt(d) * s * 0.42);
    if (d > 0.55) dot(cx + s * hash(cx + 7, cy), cy + s * hash(cx, cy + 7), Math.sqrt(d - 0.4) * s * 0.35);
  }
  return out;
}

// Line drawing from edges (Sobel); grain = how much detail survives.
function sketch(g, w, h, cell) {
  const out = new Uint8Array(w * h);
  const soft = boxBlur(g, w, h, 1);
  const cut = 30 + cell * 9;
  const at = (x, y) => soft[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
    const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
    out[y * w + x] = Math.hypot(gx, gy) > cut ? 1 : 0;
  }
  return out;
}

function dither(g, w, h, mode, cell = 6) {
  switch (mode) {
    case 'threshold': {
      const out = new Uint8Array(w * h);
      for (let i = 0; i < g.length; i++) out[i] = g[i] < 128 ? 1 : 0;
      return out;
    }
    case 'bayer2': return ordered(g, w, h, 2);
    case 'ordered': return ordered(g, w, h, 4);
    case 'bayer8': return ordered(g, w, h, 8);
    case 'noise':
    case 'random': return noiseDither(g, w, h, mode);
    case 'halftone': return halftone(g, w, h, cell);
    case 'lines': return lines(g, w, h, cell);
    case 'crosshatch': return crosshatch(g, w, h, cell);
    case 'pixel': return pixelate(g, w, h, cell);
    case 'stipple': return stipple(g, w, h, cell);
    case 'sketch': return sketch(g, w, h, cell);
    default: return diffuse(g, w, h, KERNELS[mode] || KERNELS.floyd);
  }
}

/** Effects that use the grain (cell size) setting. */
export const GRAIN_EFFECTS = new Set(['halftone', 'lines', 'crosshatch', 'pixel', 'stipple', 'sketch']);
/** Classic dithers — these can be scaled up with a dot size. */
export const DITHER_EFFECTS = new Set(['atkinson', 'floyd', 'stucki', 'jarvis', 'sierra', 'bayer2', 'ordered', 'bayer8', 'noise', 'random']);

// Dither at 1/dot resolution and scale back up with hard edges: bigger, chunkier dots.
function scaledDither(g, w, h, mode, dot) {
  const sw = Math.ceil(w / dot), sh = Math.ceil(h / dot);
  const small = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    let acc = 0, n = 0;
    for (let yy = y * dot; yy < Math.min(h, (y + 1) * dot); yy++)
      for (let xx = x * dot; xx < Math.min(w, (x + 1) * dot); xx++) { acc += g[yy * w + xx]; n++; }
    small[y * sw + x] = acc / n;
  }
  const bits = dither(small, sw, sh, mode);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = bits[((y / dot) | 0) * sw + ((x / dot) | 0)];
  return out;
}

function writeBits(ctx, bits, w, h) {
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < bits.length; i++) {
    const v = bits[i] ? 0 : 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function binarize(canvas, mode = 'threshold', opts = {}) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = canvas;
  const g = toGray(ctx.getImageData(0, 0, w, h).data, opts);
  if (mode === 'threshold' && opts.cut) for (let i = 0; i < g.length; i++) g[i] = g[i] < opts.cut ? 0 : 255;
  const dot = Math.max(1, Math.round(opts.dot || 1));
  const bits = dot > 1 && DITHER_EFFECTS.has(mode) ? scaledDither(g, w, h, mode, dot) : dither(g, w, h, mode, opts.cell);
  writeBits(ctx, bits, w, h);
  return canvas;
}

/** Apply a print effect to a canvas in place (used by the live camera preview). */
export function applyEffect(canvas, mode, opts = {}) {
  return binarize(canvas, mode, opts);
}

/* ---------- block renderers ---------- */

function placeholder(label, W, h = 140) {
  const pad = padFor(W);
  const [c, ctx] = makeCanvas(h, W);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(pad, 8, W - pad * 2, h - 16);
  ctx.setLineDash([]);
  ctx.fillStyle = '#000';
  ctx.font = `600 ${W < 200 ? 16 : 22}px ${FALLBACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, W / 2, h / 2, W - pad * 4);
  return binarize(c);
}

async function renderText(b) {
  const W = boxWidth(b), pad = padFor(W);
  const text = b.text || ' ';
  const rtl = isRTL(text);
  await ensureFont(b.font, nearestWeight(b.font, b.bold), text);
  const size = b.size;
  const font = fontString(b.font, size, b.bold);
  const [, probe] = makeCanvas(1, 1);
  probe.font = font;
  probe.letterSpacing = `${b.tracking || 0}px`;
  const lines = wrap(probe, text, W - pad * 2);
  const { asc, desc } = vMetrics(probe, size);
  const lh = Math.max(asc + desc, size * (b.lineHeight || 1.2));
  const padY = b.padY ?? 8;
  const [c, ctx] = makeCanvas(lines.length * lh + padY * 2, W);
  if (b.invert) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.fillStyle = b.invert ? '#fff' : '#000';
  ctx.font = font;
  ctx.letterSpacing = `${b.tracking || 0}px`;
  ctx.direction = rtl ? 'rtl' : 'ltr';
  const align = resolveAlign(b.align, rtl);
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const x = anchorX(align, W, pad);
  lines.forEach((line, i) => ctx.fillText(line, x, padY + i * lh + (lh - asc - desc) / 2 + asc));
  return binarize(c, 'threshold', { cut: 150 });
}

async function renderList(b) {
  const W = boxWidth(b), pad = padFor(W);
  const items = (b.items || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (!items.length) items.push(' ');
  await ensureFont(b.font, nearestWeight(b.font, b.bold), items.join(' '));
  const size = b.size;
  const font = fontString(b.font, size, b.bold);
  const [, probe] = makeCanvas(1, 1);
  probe.font = font;
  probe.letterSpacing = `${b.tracking || 0}px`;
  const { asc, desc } = vMetrics(probe, size);
  const lh = Math.max(asc + desc, size * 1.25);
  const gap = Math.round(size * 0.45);
  const markerW = b.style === 'none' ? 0
    : b.style === 'number' ? probe.measureText(items.length + '.').width
    : Math.round(size * 0.62);
  const textW = Math.max(20, W - pad * 2 - markerW - (markerW ? gap : 0));
  const laid = items.map((t, idx) => ({ rtl: isRTL(t), lines: wrap(probe, t, textW), idx }));
  const itemGap = b.gap ?? 6;
  const total = laid.reduce((s, it) => s + it.lines.length * lh + itemGap, 0) + 8;
  const [c, ctx] = makeCanvas(total + 8, W);
  ctx.fillStyle = ctx.strokeStyle = '#000';
  ctx.font = font;
  ctx.letterSpacing = `${b.tracking || 0}px`;
  ctx.textBaseline = 'alphabetic';
  let y = 8;
  for (const it of laid) {
    const base = y + (lh - asc - desc) / 2 + asc;
    const markerX = it.rtl ? W - pad - markerW : pad;
    const textX = it.rtl ? markerX - (markerW ? gap : 0) : markerX + markerW + (markerW ? gap : 0);
    // Marker sits centred on the first line's x-height.
    const midY = base - size * 0.34;
    if (b.style === 'check') {
      const s = markerW, lw = Math.max(2, Math.round(size / 13));
      ctx.lineWidth = lw;
      ctx.strokeRect(markerX + lw / 2, midY - s / 2, s - lw, s - lw);
    } else if (b.style === 'bullet') {
      ctx.beginPath();
      ctx.arc(markerX + markerW / 2, midY, markerW * 0.22, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.style === 'number') {
      ctx.direction = 'ltr';
      ctx.textAlign = it.rtl ? 'right' : 'left';
      ctx.fillText((it.idx + 1) + '.', it.rtl ? markerX + markerW : markerX, base);
    }
    ctx.direction = it.rtl ? 'rtl' : 'ltr';
    ctx.textAlign = it.rtl ? 'right' : 'left';
    it.lines.forEach((ln, i) => ctx.fillText(ln, textX, base + i * lh));
    y += it.lines.length * lh + itemGap;
  }
  return binarize(c, 'threshold', { cut: 150 });
}

async function renderImage(b, preview) {
  const W = boxWidth(b);
  if (!b.src) return preview ? placeholder('Tap to choose a photo', W, Math.min(200, W * 0.75)) : null;
  const img = await loadImage(b.src);
  const rot = ((b.rotate || 0) % 360 + 360) % 360;
  const sideways = rot === 90 || rot === 270;
  const srcW = sideways ? img.naturalHeight : img.naturalWidth;
  const srcH = sideways ? img.naturalWidth : img.naturalHeight;
  const th = Math.min(2400, Math.round(W * srcH / srcW));
  const [c, ctx] = makeCanvas(th, W);
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(W / 2, th / 2);
  ctx.rotate(rot * Math.PI / 180);
  const dw = sideways ? th : W, dh = sideways ? W : th;
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return binarize(c, b.dither || 'floyd', { brightness: b.brightness, contrast: b.contrast, invert: b.invert, cell: b.grain ?? 6, dot: b.dot ?? 1 });
}

/** Small live preview of a photo block in a given effect (for the effect picker). */
export async function effectThumb(b, mode, W = 132) {
  const img = await loadImage(b.src);
  const rot = ((b.rotate || 0) % 360 + 360) % 360;
  const sideways = rot === 90 || rot === 270;
  const srcW = sideways ? img.naturalHeight : img.naturalWidth;
  const srcH = sideways ? img.naturalWidth : img.naturalHeight;
  const th = Math.min(W * 1.4, Math.round(W * srcH / srcW));
  const [c, ctx] = makeCanvas(th, W);
  ctx.translate(W / 2, th / 2);
  ctx.rotate(rot * Math.PI / 180);
  const dw = sideways ? th : W, dh = sideways ? W : th;
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Grain is in printer dots; the thumb is the same scale as the real print width ratio.
  const k = W / boxWidth(b);
  const cell = Math.max(2, Math.round((b.grain ?? 6) * Math.max(k, 0.5)));
  const dot = Math.max(1, Math.round((b.dot ?? 1) * k));
  return binarize(c, mode, { brightness: b.brightness, contrast: b.contrast, invert: b.invert, cell, dot });
}

async function renderDrawing(b, preview) {
  const W = boxWidth(b);
  if (!b.src) return preview ? placeholder('Tap to draw', W, Math.round((b.height || 240) * W / FULL)) : null;
  const img = await loadImage(b.src);
  const h = Math.round(W * img.naturalHeight / img.naturalWidth);
  const [c, ctx] = makeCanvas(h, W);
  ctx.drawImage(img, 0, 0, W, h);
  return binarize(c);
}

function renderQR(b) {
  const W = boxWidth(b), pad = padFor(W);
  const qr = qrcode(0, 'M');
  qr.addData((b.text || '').trim() || ' ', 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const target = Math.round(W * (b.scale ?? 100) / 100);
  const cell = Math.max(2, Math.floor(Math.min(target, W) / n));
  const size = cell * n;
  const padY = 8;
  const [c, ctx] = makeCanvas(size + padY * 2, W);
  const x = Math.max(0, alignX(b.align || 'center', W, size, Math.min(pad, (W - size) / 2)));
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
    if (qr.isDark(r, col)) ctx.fillRect(x + col * cell, padY + r * cell, cell, cell);
  }
  return c;
}

function renderEmoji(b) {
  const W = boxWidth(b), pad = padFor(W);
  // Never let the glyph spill out of its box.
  const size = Math.min(b.size || 120, W - pad * 2);
  const [c, ctx] = makeCanvas(size * 1.2 + 16, W);
  ctx.clearRect(0, 0, c.width, c.height); // transparent, so only the glyph gets darkened
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textBaseline = 'middle';
  const align = b.align || 'center';
  ctx.textAlign = align;
  ctx.fillText(b.emoji || '⭐', anchorX(align, W, pad), c.height / 2);
  return binarize(c, b.dither || 'atkinson', { contrast: 15, ink: 0.55, cell: 5 });
}

function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function renderDivider(b) {
  const W = boxWidth(b), pad = padFor(W);
  const t = b.thickness || 3;
  const padY = b.padY ?? 12;
  const style = b.style || 'solid';
  const extra = style === 'wave' ? 12 : style === 'stars' ? 14 : style === 'double' ? t * 2 : 0;
  const [c, ctx] = makeCanvas(t + extra + padY * 2, W);
  const mid = c.height / 2;
  const x0 = pad, x1 = W - pad;
  ctx.fillStyle = ctx.strokeStyle = '#000';
  ctx.lineWidth = t;
  ctx.lineCap = 'round';
  if (style === 'solid') ctx.fillRect(x0, mid - t / 2, x1 - x0, t);
  else if (style === 'double') {
    ctx.fillRect(x0, mid - t * 1.5, x1 - x0, t);
    ctx.fillRect(x0, mid + t * 0.5, x1 - x0, t);
  } else if (style === 'dashed') {
    ctx.setLineDash([t * 5, t * 3]);
    ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x1, mid); ctx.stroke();
  } else if (style === 'dotted') {
    for (let x = x0 + t; x <= x1; x += t * 3) { ctx.beginPath(); ctx.arc(x, mid, t * 0.7, 0, Math.PI * 2); ctx.fill(); }
  } else if (style === 'wave') {
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 2) ctx.lineTo(x, mid + Math.sin((x - x0) / 9) * 6);
    ctx.stroke();
  } else if (style === 'stars') {
    const r = 6 + t;
    const count = Math.max(1, Math.floor((x1 - x0) / (r * 3.2)));
    const step = (x1 - x0) / count;
    for (let i = 0; i < count; i++) star(ctx, x0 + step * (i + 0.5), mid, r);
  }
  return binarize(c);
}

function renderSpacer(b) {
  return makeCanvas(b.height || 40, boxWidth(b))[0];
}

/* ---------- receipt ---------- */

// Code 39 (digits, dash): 9 elements per char, bar/space alternating, w = wide.
const CODE39 = {
  0: 'nnnwwnwnn', 1: 'wnnwnnnnw', 2: 'nnwwnnnnw', 3: 'wnwwnnnnn', 4: 'nnnwwnnnw',
  5: 'wnnwwnnnn', 6: 'nnwwwnnnn', 7: 'nnnwnnwnw', 8: 'wnnwnnwnn', 9: 'nnwwnnwnn',
  '-': 'nwnnnnwnw', '*': 'nwnnwnwnn',
};

function drawBarcode(ctx, text, cx, y, h, maxW) {
  const code = '*' + (String(text).replace(/[^0-9-]/g, '') || '0') + '*';
  const units = code.length * 16 - 1; // 3 wide (3u) + 6 narrow (1u) + 1u gap
  const n = Math.max(1, Math.min(3, Math.floor(maxW / units)));
  let x = Math.round(cx - (units * n) / 2);
  for (const ch of code) {
    [...CODE39[ch]].forEach((e, i) => {
      const w = (e === 'w' ? 3 : 1) * n;
      if (i % 2 === 0) ctx.fillRect(x, y, w, h);
      x += w;
    });
    x += n;
  }
}

/** "Name | qty | price", "Name | price" or "Name 12.50" → { name, qty, price }. */
export function parseItems(text) {
  const num = v => parseFloat(String(v).replace(',', '.')) || 0;
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 3) return { name: parts[0], qty: num(parts[1]) || 1, price: num(parts[2]) };
    if (parts.length === 2) return { name: parts[0], qty: 1, price: num(parts[1]) };
    const m = /^(.*?)[\s,]+(\d+(?:[.,]\d+)?)$/.exec(line);
    return m ? { name: m[1], qty: 1, price: num(m[2]) } : { name: line, qty: 1, price: 0 };
  });
}

const RECEIPT_LABELS = {
  en: { subtotal: 'Subtotal', tax: 'Tax', total: 'TOTAL', no: 'No.' },
  he: { subtotal: 'סכום ביניים', tax: 'מע״מ', total: 'סה״כ לתשלום', no: 'מס׳' },
};

export function receiptDate(b) {
  if (!b.liveDate) return b.date || '';
  return new Date().toLocaleString(b.lang === 'he' ? 'he-IL' : 'en-GB',
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function renderReceipt(b) {
  const W = boxWidth(b), pad = padFor(W);
  const L = RECEIPT_LABELS[b.lang] || RECEIPT_LABELS.en;
  const rtl = b.lang === 'he';
  const size = b.size || 22;
  const items = parseItems(b.items);
  const money = v => `${b.currency || ''}${v.toFixed(2)}`;
  const allText = [b.business, b.subtitle, b.footer, ...items.map(i => i.name)].join(' ');
  await Promise.all([ensureFont(b.font, nearestWeight(b.font, false), allText), ensureFont(b.font, nearestWeight(b.font, true), allText)]);

  const [c, ctx] = makeCanvas(4000, W);
  ctx.fillStyle = ctx.strokeStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  const inner = W - pad * 2;
  let y = 8;

  const font = (sz, bold) => { ctx.font = fontString(b.font, sz, bold); };
  const lineH = sz => Math.round(sz * 1.3);
  const centered = (text, sz, bold) => {
    font(sz, bold);
    for (const ln of wrap(ctx, text, inner)) {
      y += lineH(sz);
      ctx.direction = isRTL(ln) ? 'rtl' : 'ltr';
      ctx.textAlign = 'center';
      ctx.fillText(ln, W / 2, y - sz * 0.28);
    }
  };
  // Label on the reading-start side, value on the other — mirrors in Hebrew.
  const row = (label, value, sz, bold) => {
    font(sz, bold);
    const vw = ctx.measureText(value).width;
    const lines = wrap(ctx, label, Math.max(40, inner - vw - 12));
    lines.forEach((ln, i) => {
      y += lineH(sz);
      const base = y - sz * 0.28;
      // Direction follows each string's own script; only the sides mirror in Hebrew mode.
      ctx.direction = isRTL(ln) ? 'rtl' : 'ltr';
      ctx.textAlign = rtl ? 'right' : 'left';
      ctx.fillText(ln, rtl ? W - pad : pad, base);
      if (i === 0) { ctx.direction = isRTL(value) ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'left' : 'right'; ctx.fillText(value, rtl ? pad : W - pad, base); }
    });
  };
  const rule = (style = 'dashed', gap = 10) => {
    y += gap;
    ctx.lineWidth = 2;
    ctx.setLineDash(style === 'dashed' ? [6, 5] : []);
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    if (style === 'double') { ctx.beginPath(); ctx.moveTo(pad, y + 4); ctx.lineTo(W - pad, y + 4); ctx.stroke(); y += 4; }
    ctx.setLineDash([]);
    y += gap - 4;
  };

  if (b.business) centered(b.business, Math.round(size * 1.45), true);
  if (b.subtitle) centered(b.subtitle, Math.round(size * 0.8), false);
  rule();
  const date = receiptDate(b);
  if (date || b.number) row(date, b.number ? `${L.no} ${b.number}` : '', Math.round(size * 0.8), false);
  rule();
  let subtotal = 0;
  for (const it of items) {
    const sum = it.qty * it.price;
    subtotal += sum;
    row(it.qty !== 1 ? `${it.name} ×${it.qty}` : it.name, money(sum), size, false);
  }
  rule();
  const tax = b.tax ? subtotal * b.tax / 100 : 0;
  if (tax) {
    row(L.subtotal, money(subtotal), Math.round(size * 0.85), false);
    row(`${L.tax} ${b.tax}%`, money(tax), Math.round(size * 0.85), false);
  }
  row(L.total, money(subtotal + tax), Math.round(size * 1.3), true);
  rule('double');
  if (b.footer) { y += 4; centered(b.footer, Math.round(size * 0.85), false); }
  if (b.barcode) {
    y += 14;
    drawBarcode(ctx, b.number, W / 2, y, 56, inner);
    y += 56;
    font(Math.round(size * 0.7), false);
    ctx.direction = 'ltr'; ctx.textAlign = 'center';
    y += lineH(Math.round(size * 0.7));
    ctx.fillText(String(b.number || '0').replace(/[^0-9-]/g, '') || '0', W / 2, y - 4);
  }
  y += 12;

  const [out, octx] = makeCanvas(Math.min(y, 4000), W);
  octx.drawImage(c, 0, 0);
  return binarize(out, 'threshold', { cut: 150 });
}

const RENDERERS = {
  receipt: renderReceipt,
  text: renderText,
  list: renderList,
  image: renderImage,
  drawing: renderDrawing,
  qr: renderQR,
  emoji: renderEmoji,
  divider: renderDivider,
  spacer: renderSpacer,
};

export async function renderBlock(block, { preview = true } = {}) {
  const fn = RENDERERS[block.type];
  return fn ? fn(block, preview) : null;
}

/* ---------- layout & output ---------- */

/**
 * Positions for every block. Blocks without a y (fresh templates, old drafts)
 * stack under everything before them. Returns [{x, y, w, h}] in dots.
 */
export function layout(blocks, heights) {
  let bottom = 0;
  return blocks.map((b, i) => {
    const h = heights[i] ?? 0;
    const w = boxWidth(b);
    const x = Math.max(0, Math.min(FULL - w, Math.round(b.x ?? 0)));
    const y = b.y ?? bottom;
    bottom = Math.max(bottom, y + h);
    return { x, y, w, h };
  });
}

/** Overlay all block canvases onto one paper-width canvas; ink wins where they overlap. */
export function compose(canvases, boxes) {
  const H = Math.max(1, ...boxes.map((p, i) => (canvases[i] ? p.y + canvases[i].height : 0)));
  const [out, ctx] = makeCanvas(H, FULL);
  ctx.globalCompositeOperation = 'darken';
  canvases.forEach((c, i) => c && ctx.drawImage(c, boxes[i].x, boxes[i].y));
  return out;
}

export function canvasToRows(c) {
  const rows = [];
  const bytes = FULL / 8;
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, FULL, c.height).data;
  for (let y = 0; y < c.height; y++) {
    const row = new Uint8Array(bytes);
    for (let x = 0; x < FULL; x++) {
      if (d[(y * FULL + x) * 4] < 128) row[x >> 3] |= 1 << (x & 7);
    }
    rows.push(row);
  }
  // Trailing blank rows waste paper — the feed command covers the tear-off margin.
  while (rows.length && rows[rows.length - 1].every(v => v === 0)) rows.pop();
  return rows;
}
