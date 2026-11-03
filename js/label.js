// Label block: a grid of rows and cells drawn as one 1-bit image.
// A portrait label is as wide as its box and as tall as its content. A landscape label is
// designed sideways (b.length wide, one paper-width tall) and rotated 90° for printing,
// with its content scaled down until everything fits the paper.
import { boxWidth, makeCanvas, wrap, binarize, drawBarcode, loadImage } from './render.js';
import { ensureFont } from './fonts.js';
import { catGrid } from './pixel.js';

const FALLBACK = '"Heebo", "Arial Hebrew", system-ui, sans-serif';

/* ---------- pictograms (24×24, solid) ---------- */

const ICONS = {
  glass: { fill: 'M7 2h10l-.8 7.5a4.2 4.2 0 0 1-3.2 3.7V20h4v2H7v-2h4v-6.800a4.200 4.200 0 0 1-3.200-3.700Z', paper: 'M13 2l-2 3 2 2-1.500 3 3-3.500-2-2 1.500-2.500Z' },
  heart: { fill: 'M12 21.500S3 15.800 3 9.500A5 5 0 0 1 12 6.500 5 5 0 0 1 21 9.500c0 6.300-9 12-9 12Z' },
  cup: { fill: 'M3 9h14v6.500A5.500 5.500 0 0 1 11.500 21h-3A5.500 5.500 0 0 1 3 15.500ZM17 10.500h1.500a3 3 0 0 1 0 6H17v-2h1.500a1 1 0 0 0 0-2H17Z', stroke: 'M8 2.500c-1 1.500 1 2 0 4M12 2.500c-1 1.500 1 2 0 4' },
  recycle: { fill: 'M20 17.3 19.850 11.900 15.350 14.500ZM3.500 19 8.200 16.400V21.600ZM11.500 4.700 11.350 10.100 6.850 7.500Z', stroke: 'M13.600 6.200 17.600 13.200M17.500 19H8.200M5.700 14.900 9.100 8.800', sw: 2.8 },
  flame: { fill: 'M12.500 2c.8 4 6 6.300 6 12.500a6.500 6.500 0 0 1-13 0c0-3 1.800-4.300 2.500-7 1.300 1 1.800 2 2 3.200C11.400 8.700 12.300 5.700 12.500 2Z' },
  umbrella: { fill: 'M12 2.500a10 10 0 0 0-10 10h9v6a1.500 1.500 0 0 1-3 0H6a3.500 3.500 0 0 0 7 0v-6h9a10 10 0 0 0-10-10Z' },
  arrows: { fill: 'M7 2l4.500 5.500H8.500V18h-3V7.500h-3ZM17 2l4.500 5.500h-3V18h-3V7.500h-3ZM2.500 19.500h19V22h-19Z' },
  box: { fill: 'M12 2l8.500 4.700v10L12 21.500l-8.500-4.800v-10ZM12 4.300 6.300 7.500 12 10.700l5.700-3.200Z' },
  leaf: { fill: 'M20.500 3C11 3 4.500 7 4.500 14.500c0 1.500.3 2.800.9 4L3 21l1.500 1.300 2.300-2.400A7.500 7.500 0 0 0 10 21c7.500 0 10.500-7.500 10.500-18Z' },
  star: { fill: 'M12 2l3 6.800 7.300.7-5.500 4.900 1.600 7.200L12 17l-6.400 3.700 1.600-7.200L1.700 9.500 9 8.800Z' },
  drop: { fill: 'M12 2c3.500 5 7 8.500 7 12.500a7 7 0 0 1-14 0C5 10.500 8.500 7 12 2Z' },
};
export const ICON_NAMES = [...Object.keys(ICONS), 'cat'];

function drawIcon(ctx, name, x, y, size) {
  if (name === 'cat') {
    const grid = catGrid('idle');
    const u = size / 15, oy = y + (size - u * 12) / 2;
    grid.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === '#') ctx.fillRect(x + c * u, oy + r * u, Math.ceil(u), Math.ceil(u));
    }));
    return;
  }
  const icon = ICONS[name] || ICONS.star;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = ctx.strokeStyle = '#000';
  ctx.fill(new Path2D(icon.fill), 'evenodd');
  if (icon.stroke) { ctx.lineWidth = icon.sw || 1.8; ctx.lineCap = 'round'; ctx.stroke(new Path2D(icon.stroke)); }
  if (icon.paper) { ctx.fillStyle = '#fff'; ctx.fill(new Path2D(icon.paper)); }
  ctx.restore();
}

/* ---------- cells ---------- */

const padX = c => c.padX ?? 10;
const padY = c => c.padY ?? 6;
const fontOf = (c, s, size = c.size || 20) => `${c.weight ?? (c.bold ? 700 : 400)} ${Math.max(6, size * s)}px "${c.font || 'Space Mono'}", ${FALLBACK}`;

function textLines(ctx, c, cw, s) {
  ctx.font = fontOf(c, s);
  ctx.letterSpacing = `${(c.tracking || 0) * s}px`;
  const lines = wrap(ctx, c.text ?? '', Math.max(10, cw - padX(c) * 2));
  return { lines, lh: (c.size || 20) * s * (c.lh || 1.18) };
}

function qrFor(c) {
  const qr = qrcode(0, 'M');
  qr.addData((c.text || '').trim() || ' ', 'Byte');
  qr.make();
  return qr;
}

function measure(ctx, c, cw, s, images) {
  switch (c.kind) {
    case 'pill': { const { lines, lh } = textLines(ctx, c, cw - 12 * s, s); return lines.length * lh + 14 * s + padY(c) * 2; }
    case 'qr': {
      const n = qrFor(c).getModuleCount();
      const u = Math.max(1, Math.floor(Math.min(cw - padX(c) * 2, (c.max || 400) * s) / n));
      return u * n + padY(c) * 2;
    }
    case 'barcode': return (c.h || 48) * s + (c.digits ? 16 * s : 0) + padY(c) * 2;
    case 'icon': {
      const box = Math.min(cw - padX(c) * 2, (c.box || 70) * s);
      if (!c.caption) return box + padY(c) * 2;
      ctx.font = `700 ${(c.capSize || 13) * s}px "Heebo", ${FALLBACK}`;
      ctx.letterSpacing = '0px';
      return box + padY(c) * 2 + 6 * s + wrap(ctx, c.caption, cw - 4).length * (c.capSize || 13) * s * 1.2;
    }
    case 'photo': {
      const w = cw - padX(c) * 2, img = images.get(c.src);
      return c.h ? c.h * s : img ? w * img.naturalHeight / img.naturalWidth : 120 * s;
    }
    case 'arc': {
      const d = Math.min(cw - padX(c) * 2, (c.d || 96) * s);
      if (c.circle) return d + padY(c) * 2;
      // Only the band the curved text actually occupies.
      const size = (c.size || 13) * s, R = d / 2 - size * 0.8;
      const span = Math.min(Math.PI * 0.8, [...(c.text || '')].length * size * 0.85 / R);
      return d / 2 - R * Math.cos(span / 2) + size * 0.6 + padY(c) * 2;
    }
    case 'orn': return 14 * s;
    case 'field': return (c.size || 18) * s * 1.5;
    case 'solid': return (c.h || 20) * s;
    default: { const { lines, lh } = textLines(ctx, c, cw, s); return lines.length * lh + padY(c) * 2; }
  }
}

function drawCell(ctx, c, r, s, images, photos, preview) {
  const inner = r.w - padX(c) * 2;
  ctx.fillStyle = ctx.strokeStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  ctx.setLineDash([]);
  if (c.invert || c.kind === 'solid') { ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = ctx.strokeStyle = '#fff'; }
  if (c.kind === 'solid') return;
  switch (c.kind) {
    case 'pill': {
      const { lines, lh } = textLines(ctx, c, r.w - 12 * s, s);
      const th = lines.length * lh, ph = th + 14 * s, pw = Math.min(inner, Math.max(...lines.map(l => ctx.measureText(l).width)) + 30 * s);
      const px = c.align === 'left' ? r.x + padX(c) : r.x + (r.w - pw) / 2, py = r.y + (r.h - ph) / 2;
      ctx.lineWidth = Math.max(2, 2.5 * s);
      ctx.beginPath(); ctx.roundRect(px, py, pw, ph, ph / 2);
      ctx.stroke();
      ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, px + pw / 2, py + 7 * s + i * lh + lh * 0.8));
      return;
    }
    case 'qr': {
      const qr = qrFor(c), n = qr.getModuleCount();
      const u = Math.max(1, Math.floor(Math.min(inner, (c.max || 400) * s, r.h - padY(c) * 2) / n));
      const x = Math.round(r.x + (r.w - u * n) / 2), y = Math.round(r.y + (r.h - u * n) / 2);
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (qr.isDark(a, b)) ctx.fillRect(x + b * u, y + a * u, u, u);
      return;
    }
    case 'barcode': {
      const h = (c.h || 48) * s, total = h + (c.digits ? 16 * s : 0), y = r.y + (r.h - total) / 2;
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x + 2, r.y, r.w - 4, r.h); ctx.clip();
      drawBarcode(ctx, c.text, r.x + r.w / 2, y, h, inner);
      if (c.digits) {
        ctx.font = `400 ${13 * s}px "Space Mono", ${FALLBACK}`;
        ctx.letterSpacing = `${2 * s}px`;
        ctx.textAlign = 'center';
        ctx.fillText(String(c.text || '').replace(/[^0-9-]/g, ''), r.x + r.w / 2, y + h + 14 * s);
      }
      ctx.restore();
      return;
    }
    case 'icon': {
      const box = Math.min(inner, (c.box || 70) * s);
      const capH = c.caption ? r.h - box : 0;
      const x = r.x + (r.w - box) / 2, y = c.caption ? r.y + padY(c) : r.y + (r.h - box) / 2;
      if (c.frame !== false) { ctx.lineWidth = Math.max(2, 2 * s); ctx.strokeRect(x + 1, y + 1, box - 2, box - 2); }
      const k = c.frame === false ? 1 : 0.68;
      drawIcon(ctx, c.icon, x + box * (1 - k) / 2, y + box * (1 - k) / 2, box * k);
      if (c.caption) {
        ctx.font = `700 ${(c.capSize || 13) * s}px "Heebo", ${FALLBACK}`;
        ctx.letterSpacing = '0px';
        ctx.textAlign = 'left';
        wrap(ctx, c.caption, r.w - 4).forEach((l, i) => ctx.fillText(l, r.x + 2, y + box + 4 * s + (i + 1) * (c.capSize || 13) * s * 1.1));
      }
      void capH;
      return;
    }
    case 'photo': {
      const box = { x: r.x + padX(c), y: r.y, w: inner, h: r.h };
      if (c.src && images.has(c.src)) photos.push({ cell: c, box });
      else if (preview) {
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(box.x + 2, box.y + 2, box.w - 4, box.h - 4);
        ctx.setLineDash([]);
        ctx.font = `600 ${Math.max(11, Math.min(18, box.w / 11))}px ${FALLBACK}`;
        ctx.letterSpacing = '0px';
        ctx.textAlign = 'center';
        ctx.fillText('Tap to add a photo', r.x + r.w / 2, r.y + r.h / 2 + 5, box.w - 12);
      }
      return;
    }
    case 'arc': {
      const d = Math.min(inner, (c.d || 96) * s), R = d / 2 - (c.size || 13) * s * 0.8;
      const cx = r.x + r.w / 2, cy = c.circle ? r.y + r.h / 2 : r.y + padY(c) + d / 2;
      ctx.font = fontOf(c, s, c.size || 13);
      ctx.letterSpacing = '0px';
      ctx.textAlign = 'center';
      const text = [...(c.text || '')];
      const span = c.circle ? Math.PI * 2 : Math.min(Math.PI * 0.8, text.length * ((c.size || 13) * s * 0.85) / R);
      const step = span / (c.circle ? text.length : Math.max(1, text.length - 1));
      text.forEach((ch, i) => {
        const a = -Math.PI / 2 - (c.circle ? 0 : span / 2) + i * step;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      });
      if (c.icon) { const k = d * 0.3; drawIcon(ctx, c.icon, cx - k / 2, cy - k / 2, k); }
      return;
    }
    case 'orn': {
      const mid = r.y + r.h / 2, w = Math.min(inner, 110 * s), cx = r.x + r.w / 2;
      ctx.lineWidth = Math.max(1, 1.5 * s);
      ctx.beginPath(); ctx.moveTo(cx - w / 2, mid); ctx.lineTo(cx - 8 * s, mid); ctx.moveTo(cx + 8 * s, mid); ctx.lineTo(cx + w / 2, mid); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, mid - 5 * s); ctx.lineTo(cx + 5 * s, mid); ctx.lineTo(cx, mid + 5 * s); ctx.lineTo(cx - 5 * s, mid); ctx.fill();
      return;
    }
    case 'field': {
      const size = c.size || 18;
      ctx.font = fontOf(c, s, size);
      ctx.letterSpacing = '0px';
      ctx.textAlign = 'left';
      const base = r.y + r.h / 2 + size * s * 0.34, x0 = r.x + padX(c);
      const label = c.text || '';
      ctx.fillText(label, x0, base);
      const box = c.check === false ? 0 : size * s * 0.8;
      const start = x0 + ctx.measureText(label).width + 6 * s, end = r.x + r.w - padX(c) - (box ? box + 6 * s : 0);
      for (let x = start; x < end; x += 6 * s) ctx.fillRect(Math.round(x), Math.round(base - 2), Math.max(2, 2 * s), Math.max(2, 2 * s));
      if (box) { ctx.lineWidth = Math.max(2, 1.6 * s); ctx.strokeRect(end + 6 * s, base - box, box, box); }
      return;
    }
    default: {
      const { lines, lh } = textLines(ctx, c, r.w, s);
      const h = lines.length * lh;
      const y = c.valign === 'top' ? r.y + padY(c) : c.valign === 'bottom' ? r.y + r.h - h - padY(c) : r.y + (r.h - h) / 2;
      const align = c.align || 'left';
      ctx.textAlign = align;
      const x = align === 'right' ? r.x + r.w - padX(c) : align === 'center' ? r.x + r.w / 2 : r.x + padX(c);
      lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh + lh * 0.8));
    }
  }
}

/* ---------- layout ---------- */

const widthsOf = (row, W) => {
  const total = row.cells.reduce((sum, c) => sum + (c.w ?? 1), 0);
  let used = 0;
  return row.cells.map((c, i) => {
    const w = i === row.cells.length - 1 ? W - used : Math.round(W * (c.w ?? 1) / total);
    used += w;
    return w;
  });
};

function layoutRows(ctx, b, W, s, images) {
  const out = [];
  for (const row of b.rows) {
    if (row.rule) { out.push({ row, h: (row.pad ?? 8) * s * 2 + 2, widths: [] }); continue; }
    const widths = widthsOf(row, W);
    const h = row.h ? row.h * s : Math.max(...row.cells.map((c, i) => measure(ctx, c, widths[i], s, images)));
    out.push({ row, h: Math.ceil(h), widths });
  }
  return out;
}

export async function renderLabel(b, preview) {
  const landscape = b.orientation === 'landscape';
  const cells = b.rows.flatMap(r => r.cells || []);
  await Promise.all(cells.filter(c => c.text || c.caption).map(c => ensureFont(c.font || 'Space Mono', c.weight ?? (c.bold ? 700 : 400), c.text)));
  await ensureFont('Heebo', 700, 'A');
  const images = new Map();
  await Promise.all(cells.filter(c => c.kind === 'photo' && c.src).map(async c => { images.set(c.src, await loadImage(c.src)); }));

  const paper = boxWidth(b);
  const W = landscape ? Math.max(paper, b.length || 640) : paper;
  const margin = b.margin ?? (b.frame ? 4 : 0), frame = b.frame || 0, grid = b.grid || 0;
  const inset = margin + frame, innerW = W - inset * 2;
  const [, probe] = makeCanvas(1, 1);

  // Landscape labels must fit one paper-width: shrink everything until they do.
  let s = 1, rows = layoutRows(probe, b, innerW, s, images);
  const sum = list => list.reduce((t, r) => t + r.h, 0) + grid * Math.max(0, list.length - 1);
  const room = paper - inset * 2;
  if (landscape) {
    // Scale the whole design to use the paper's full height: up if there is room, down if not.
    for (let i = 0; i < 14 && sum(rows) < room; i++) {
      const next = layoutRows(probe, b, innerW, s * 1.05, images);
      if (sum(next) > room) break;
      s *= 1.05; rows = next;
    }
    for (let i = 0; i < 14 && sum(rows) > room; i++) { s *= 0.94; rows = layoutRows(probe, b, innerW, s, images); }
    // What's left is shared between the rows, so the grid reaches the frame.
    const spare = room - sum(rows);
    if (spare > 0) {
      const each = Math.floor(spare / rows.length);
      rows.forEach(r => { r.h += each; });
      rows[rows.length - 1].h += spare - each * rows.length;
    }
  }
  const contentH = sum(rows);
  const H = landscape ? paper : contentH + inset * 2;
  const [design, ctx] = makeCanvas(H, W);

  let y = inset + (landscape ? Math.max(0, Math.floor((room - contentH) / 2)) : 0);
  const rects = [], photos = [];
  rows.forEach((lay, r) => {
    const { row, h, widths } = lay;
    if (row.rule) {
      ctx.fillStyle = ctx.strokeStyle = '#000';
      const mid = y + h / 2;
      ctx.lineWidth = 2;
      ctx.setLineDash(row.rule === 'dashed' ? [7, 6] : row.rule === 'dots' ? [2, 6] : []);
      ctx.beginPath(); ctx.moveTo(inset + 6, mid); ctx.lineTo(W - inset - 6, mid); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      let x = inset;
      row.cells.forEach((c, i) => {
        const rect = { x, y, w: widths[i], h };
        ctx.save();
        ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
        drawCell(ctx, c, rect, s, images, photos, preview);
        ctx.restore();
        rects.push({ r, c: i, ...rect });
        x += widths[i];
        if (grid && i < row.cells.length - 1 && row.div !== false) {
          ctx.fillStyle = '#000';
          ctx.fillRect(x - Math.floor(grid / 2), y, grid, h);
        }
      });
    }
    y += h;
    if (grid && r < rows.length - 1) {
      if (row.line !== false && !row.rule) { ctx.fillStyle = '#000'; ctx.fillRect(inset, y, innerW, grid); }
      y += grid;
    }
  });
  if (frame) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = frame;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.roundRect(margin + frame / 2, margin + frame / 2, W - margin * 2 - frame, H - margin * 2 - frame, b.radius || 0);
    ctx.stroke();
  }
  binarize(design, 'threshold', { cut: 150 });

  // Photos get their own dither, on top of the crisp line work.
  for (const { cell, box } of photos) {
    const img = images.get(cell.src), w = Math.round(box.w), h = Math.round(box.h);
    if (w < 1 || h < 1) continue;
    const [pc, pctx] = makeCanvas(h, w);
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    pctx.imageSmoothingQuality = 'high';
    pctx.drawImage(img, (w - img.naturalWidth * k) / 2, (h - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    binarize(pc, cell.dither || 'atkinson', { brightness: cell.brightness, contrast: cell.contrast ?? 10, cell: cell.grain ?? 6, dot: cell.dot ?? 1 });
    ctx.drawImage(pc, Math.round(box.x), Math.round(box.y));
  }

  let out = design;
  if (landscape) {
    const [rot, rctx] = makeCanvas(W, H);
    rctx.translate(H, 0);
    rctx.rotate(Math.PI / 2);
    rctx.drawImage(design, 0, 0);
    out = rot;
  }
  out._design = design;
  out._rects = rects;
  out._landscape = landscape;
  return out;
}

/** The cell at a point given as fractions of the displayed canvas. `straight` = point on the upright design. */
export function hitCell(canvas, fx, fy, straight = false) {
  const d = canvas._design;
  if (!d || !canvas._rects) return null;
  let x = fx * d.width, y = fy * d.height;
  if (canvas._landscape && !straight) { x = fy * d.width; y = (1 - fx) * d.height; }
  return canvas._rects.find(q => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h) || null;
}

/** A cell's rectangle as CSS percentages of the displayed canvas. */
export function cellBox(canvas, q, straight = false) {
  const d = canvas._design, W = d.width, H = d.height;
  if (canvas._landscape && !straight) {
    return { left: (H - q.y - q.h) / H * 100, top: q.x / W * 100, width: q.h / H * 100, height: q.w / W * 100 };
  }
  return { left: q.x / W * 100, top: q.y / H * 100, width: q.w / W * 100, height: q.h / H * 100 };
}
