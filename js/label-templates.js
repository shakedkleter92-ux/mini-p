// Ready-made label designs. All names and details are placeholders, meant to be edited.
const MONO = 'Space Mono', HEAVY = 'Heebo', HELV = 'Arimo', COND = 'Bebas Neue', SERIF = 'Playfair Display', SCRIPT = 'Dancing Script', TYPE = 'Special Elite';

const text = (t, size, o = {}) => ({ kind: 'text', text: t, size, font: MONO, ...o });
const mono = (t, size = 20, o = {}) => text(t, size, { font: MONO, ...o });
const helv = (t, size = 20, o = {}) => text(t, size, { font: HELV, ...o });
const heavy = (t, size, o = {}) => text(t, size, { font: HEAVY, weight: 900, lh: 1, ...o });
const row = (...cells) => ({ cells });
const rule = (kind = 'dashed', pad = 8) => ({ rule: kind, pad });
const icon = (name, caption) => ({ kind: 'icon', icon: name, caption, padX: 4, padY: 4 });
const blank = h => ({ kind: 'text', text: '', size: 10, h, padY: h / 2 });

export const LABEL_TEMPLATES = [
  { name: 'Product label', orientation: 'portrait', margin: 8, rows: [
    row(heavy('100%', 44, { w: 1.1, padX: 4 }), heavy('VINTAGE', 26, { w: 1.2, padX: 4 }), text('one of a kind', 19, { font: HEAVY, weight: 700, lh: 1, w: 1, padX: 4 })),
    row({ kind: 'pill', text: 'ORGANIC', font: HEAVY, weight: 800, size: 22, w: 1.1, padX: 2, padY: 2 }, { kind: 'pill', text: 'RARE', font: HEAVY, weight: 800, size: 22, w: 1.2, padX: 2, padY: 2 }, blank(2)),
    rule('solid', 6),
    row(heavy('Your\nProduct', 86, { padX: 2, lh: 0.98, padY: 4 })),
    rule('solid', 6),
    row(text('INGREDIENTS:\nA little of this, a little of that, and plenty of care.', 15, { font: HEAVY, weight: 500, w: 1.3, padX: 2, valign: 'top' }), { kind: 'barcode', text: '1234567', h: 56, w: 1, padX: 2 }),
    row(icon('glass', 'FRAGILE'), icon('box', 'HANDLE WITH CARE'), icon('heart', 'MADE WITH LOVE'), icon('recycle', 'RECYCLE'), icon('cup', 'NEEDS COFFEE')),
  ] },
  { name: 'Event ticket', orientation: 'landscape', length: 640, frame: 8, margin: 2, grid: 6, rows: [
    row(text('AUTUMN 2026\nOPENING SHOW', 30, { font: HELV, bold: true, lh: 1.05 })),
    row(text('LIVE STREAMING', 40, { font: HELV, bold: true, padY: 2 })),
    row({ kind: 'qr', text: 'https://example.com', w: 1, max: 130 }, { kind: 'barcode', text: '20261102', h: 76, digits: true, w: 2.6 }),
    { div: false, cells: [text('12 PAPER STREET, TEL AVIV\nFRIDAY, 8:00 PM', 18, { font: HELV, w: 3 }), { kind: 'solid', w: 1 }] },
  ] },
  { name: 'Food label', orientation: 'landscape', length: 620, margin: 10, grid: 2, rows: [
    { cells: [text('ALMOND SEA SALT', 26, { font: MONO, tracking: 2, w: 4.6, padX: 4 }), text('BATCH\nNO.', 11, { w: 0.85, padX: 4, align: 'right' }), text('007', 34, { w: 0.9, padX: 2, align: 'right' })], div: false },
    row(mono('60 GRAMS', 14, { tracking: 2, padX: 4 })),
    { cells: [text('89%', 40, { w: 1, padX: 4 }), mono('SINGLE ORIGIN\nCACAO', 16, { tracking: 2, w: 2.6 }), mono('VEGAN AND\nGLUTEN FREE', 13, { tracking: 1, w: 1.4 })] },
    { div: false, cells: [mono('INGREDIENTS\nDARK CHOCOLATE, CANE SUGAR, COCOA BUTTER, ALMONDS, SEA SALT', 14, { tracking: 1, w: 3.6, padX: 4, valign: 'top' }), { kind: 'arc', circle: true, text: 'MADE WITH CARE - ', icon: 'leaf', d: 104, size: 12, w: 1.1, font: MONO }] },
  ] },
  { name: 'Perfume label', orientation: 'landscape', length: 620, frame: 3, margin: 6, grid: 3, rows: [
    row(text('YOUR\nBRAND', 26, { font: MONO, bold: true, invert: true, tracking: 3, align: 'center', lh: 1, w: 1 }), text('Extrait de Parfum', 24, { font: MONO, w: 2, align: 'center' })),
    row(text('VANILLA SECRET', 56, { font: MONO, bold: true, padY: 4 })),
    row(mono('Know the Notes\nVanilla, Cotton, Coffee,\nCognac, Chocolate.', 17, { w: 2.2 }), mono('Used to\nAll Occasions', 17, { w: 1 })),
    row(mono('Sweet Gourmand', 22, { bold: true, w: 2.2 }), mono('Netto\n50 ml', 17, { w: 1 })),
  ] },
  { name: 'Spec label', orientation: 'portrait', margin: 6, grid: 2, rows: [
    { div: false, cells: [text('YOUR BRAND', 20, { font: HEAVY, weight: 800, invert: true, w: 1.3, align: 'center' }), mono('SMALL BATCH\nMADE FOR REAL USE', 11, { w: 1.7 }), { kind: 'icon', icon: 'cat', frame: true, box: 40, w: 0.6, padX: 2 }] },
    row(text('ESPRESSO\nMARTINI', 68, { font: COND, lh: 0.95, padX: 4 })),
    rule('dots', 4),
    row(text('CODE\nCB-011', 24, { font: COND, w: 1, lh: 1.05, padX: 4 }), mono('DESCRIPTION\nVODKA, COFFEE\nAND LIQUEUR', 12, { w: 1.5 })),
    row(text('BATCH\n24.031', 24, { font: COND, w: 1, lh: 1.05, padX: 4 }), text('20', 44, { font: COND, w: 0.6, align: 'center' }), mono('SERVES\nSHAKE WITH\nICE, 3 BEANS', 12, { w: 0.9 })),
    row(mono('KEEP COLD\nUSE WITHIN 15 DAYS', 11, { w: 1.2, padX: 4 }), { kind: 'pill', text: 'READY TO SERVE', font: MONO, bold: true, size: 12, w: 1, padX: 2 }),
    row({ kind: 'barcode', text: '898920', h: 42, digits: true, w: 1.3, padX: 4 }, text('MADE WITH\nLOVE', 13, { font: MONO, invert: true, bold: true, w: 1, align: 'center' })),
  ] },
  { name: 'Shipping label', orientation: 'landscape', length: 640, frame: 3, radius: 18, margin: 6, grid: 2, rows: [
    row(text('LOGO', 28, { font: HEAVY, weight: 900, align: 'center' }), text('Product Name', 26, { font: HEAVY, weight: 800, align: 'center', w: 1.2 })),
    row(helv('From:\nCompany Name\nAddress, City', 15, { w: 1 }), helv('To:\nCompany Name\nAddress, City', 15, { w: 1 }), { kind: 'qr', text: 'https://example.com', w: 0.85, max: 96 }),
    { div: false, cells: [{ kind: 'barcode', text: '123456', h: 50, digits: true, w: 1.5 }, icon('glass'), icon('box'), icon('arrows')] },
    row(helv('Item No.\n0004321', 15, { w: 0.8 }), helv('Delivery Instruction\nImportant information', 15, { w: 2 })),
  ] },
  { name: 'Parcel slip', orientation: 'portrait', frame: 4, margin: 6, rows: [
    { cells: [text('LO\nGO', 26, { font: HEAVY, weight: 900, invert: true, align: 'center', lh: 0.95, w: 0.7 }), helv('ORIGIN ID: 000-000-000\nFROM: Company Name\nCompany Address', 15, { w: 2.3 })] },
    rule('solid', 4),
    row(helv('TO: Customer’s Name\nCustomer’s Address\nREF: 000-000-000', 16)),
    rule('solid', 4),
    row(helv('ORDER NO.: 000-000-000\nITEM NO.: 000-000-000\nSHIP DATE: 27 JAN 2026\nWEIGHT: 4 KG', 16)),
    rule('solid', 4),
    row(helv('REMARKS:\nNO REMARKS', 15, { w: 0.9, valign: 'top' }), { kind: 'barcode', text: '123456', h: 56, w: 1.4, padX: 4 }),
    row(icon('glass'), icon('flame'), icon('recycle'), icon('umbrella')),
  ] },
  { name: 'Contact card', orientation: 'portrait', margin: 6, frame: 2, grid: 2, rows: [
    row(helv('NEW YORK', 22, { align: 'center' })),
    row(helv('YOUR NAME\nEST. 2026', 26, { align: 'center', padY: 26 })),
    row(helv('TEL.', 20, { w: 1, align: 'center' }), helv('(555) 123-4567', 20, { w: 2.1, align: 'center' })),
    row(helv('ADDR.', 20, { w: 1, align: 'center' }), helv('12 Paper St', 20, { w: 2.1, align: 'center' })),
    row(text('Your signature', 42, { font: SCRIPT, bold: true, align: 'center', padY: 14 })),
  ] },
  { name: 'Tag', orientation: 'portrait', rows: [
    row(mono('YOUR NAME', 30, { align: 'center', tracking: 1, padY: 10 })),
    row(mono('Est. 2026', 20, { align: 'center', padY: 2 })),
    rule(),
    row(mono('Spring / Summer 20-02-2026\nAutumn / Winter 23-09-2026', 17, { align: 'center' })),
    rule(),
    row({ kind: 'photo', h: 300, padX: 40, dither: 'atkinson' }),
    row(mono('made\nby hand', 20, { w: 1, valign: 'bottom' }), blank(2)),
    row(mono('top', 20), mono('bottom', 20, { align: 'right' })),
    row(mono('####', 22, { align: 'center', padY: 12 })),
  ] },
  { name: 'Photo slip', orientation: 'portrait', rows: [
    row(text('YOUR MARKET', 28, { font: TYPE, align: 'center', tracking: 2, padY: 10 })),
    row({ kind: 'barcode', text: '358400', h: 22, padY: 2 }),
    rule(),
    row({ kind: 'photo', h: 330, padX: 26, dither: 'floyd' }),
    rule(),
    row(mono('Total', 18, { padY: 1, padX: 24 }), mono('$358.00', 18, { padY: 1, padX: 24, align: 'right' })),
    row(mono('Cash', 18, { padY: 1, padX: 24 }), mono('$400.00', 18, { padY: 1, padX: 24, align: 'right' })),
    row(mono('Change', 18, { padY: 1, padX: 24 }), mono('$42.00', 18, { padY: 1, padX: 24, align: 'right' })),
    row(mono('********', 18, { align: 'center', padY: 16 })),
    row(mono('THANKS FOR DOING\nBUSINESS WITH US!', 17, { align: 'center', padY: 4 })),
  ] },
  { name: 'Blank slip', orientation: 'portrait', rows: [
    row(text('YOUR MARKET', 28, { font: TYPE, align: 'center', tracking: 2, padY: 10 })),
    row({ kind: 'barcode', text: '358400', h: 22, padY: 2 }),
    rule(),
    { h: 300, cells: [mono('', 18)] },
    rule(),
    row(mono('Total', 18, { padY: 1, padX: 24 }), mono('$0.00', 18, { padY: 1, padX: 24, align: 'right' })),
    row(mono('********', 18, { align: 'center', padY: 16 })),
    row(mono('THANKS FOR DOING\nBUSINESS WITH US!', 17, { align: 'center', padY: 4 })),
  ] },
  { name: 'Apothecary', orientation: 'portrait', frame: 2, margin: 12, rows: [
    row({ kind: 'arc', text: 'HANDPOURED', d: 250, size: 16, font: SERIF, padY: 8 }),
    row(text('HAND\nSOAP', 50, { font: SERIF, tracking: 5, align: 'center', lh: 1.05, padY: 2 })),
    row({ kind: 'orn' }),
    rule('solid', 8),
    row(text('PREMIUM   |   QUALITY', 14, { font: SERIF, tracking: 3, align: 'center', padY: 10 })),
  ] },
  { name: 'Room card', orientation: 'portrait', margin: 14, rows: [
    row(text('25', 58, { font: 'Tinos', align: 'center', padY: 2, lh: 1 })),
    row(text('Room', 16, { font: 'Tinos', align: 'center', padY: 2 })),
    row({ kind: 'photo', h: 270, padX: 44, padY: 0, dither: 'atkinson' }),
    row(text('ROSEMARY', 22, { font: 'Tinos', align: 'center', tracking: 3, padY: 10 })),
    row(text('A few quiet words about this room and the plant it is named after, set small and centered.', 14, { font: 'Tinos', align: 'center', padX: 30 })),
    row({ kind: 'icon', icon: 'cat', frame: false, box: 40, padY: 12 }),
  ] },
  { name: 'Home label', orientation: 'portrait', frame: 2, margin: 12, rows: [
    row(text('D A Y', 24, { font: MONO, align: 'center', padY: 22 })),
    rule('solid', 3),
    row(mono('NEW STYLE', 18, { align: 'center', tracking: 6, padY: 4 })),
    rule('solid', 3),
    row(mono('KITCHEN CLEANER', 24, { align: 'center', bold: true, padY: 22 })),
    row({ kind: 'icon', icon: 'drop', frame: false, box: 30, padY: 2 }),
    row(mono('DAILY NECESSITIES', 14, { align: 'center', padY: 18 })),
  ] },
  { name: 'No. 18', orientation: 'portrait', frame: 10, margin: 4, rows: [
    row(mono('NO.18', 34, { align: 'center', padY: 24 })),
    row(text('FACE\nWASH', 60, { font: HELV, align: 'center', lh: 1, padY: 0 })),
    row(mono('ESSENTIALS', 26, { align: 'center', tracking: 2, padY: 4 })),
    rule('solid', 4),
    row(helv('BATHROOM', 26, { align: 'center', padY: 4 })),
    row(blank(22)),
  ] },
  { name: 'Tall label', orientation: 'portrait', frame: 2, margin: 12, rows: [
    row(blank(30)),
    row({ kind: 'arc', text: '~HAND POURED~', d: 260, size: 14, font: 'Tinos', bold: true }),
    row(text('SHAMPOO', 56, { font: SERIF, align: 'center', padY: 26 })),
    row(text('premium quality', 32, { font: SCRIPT, align: 'center', padY: 22 })),
    row(text('SELECTED', 14, { font: 'Tinos', align: 'center', tracking: 3, padY: 34 })),
  ] },
];
