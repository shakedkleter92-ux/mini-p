// Bluetooth LE driver for "Cat Printer" family thermal printers (X6h, GB0x, MX0x…).
// Protocol: 51 78 <cmd> 00 <len lo> <len hi> <data…> <crc8(data)> FF

export const PRINT_WIDTH = 384;

const SERVICE = 0xae30;
const ADV_SERVICE = 0xaf30;
const TX_CHAR = 0xae01;
const RX_CHAR = 0xae02;

const CMD = {
  feed: 0xa1,
  line: 0xa2,
  status: 0xa3,
  quality: 0xa4,
  lattice: 0xa6,
  update: 0xa9,
  flow: 0xae,
  energy: 0xaf,
  speed: 0xbd,
  mode: 0xbe,
};

const LATTICE_START = [0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c];
const LATTICE_END = [0xaa, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17];

export const DARKNESS = {
  light: 0x1800,
  normal: 0x3000,
  dark: 0x4800,
  max: 0x6400,
};

const ROW_MS = {
  light: 12,
  normal: 15,
  dark: 19,
  max: 24,
};

const CRC_TABLE =(() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    t[i] = c;
  }
  return t;
})();

function crc8(data) {
  let c = 0;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff];
  return c;
}

function packet(cmd, data) {
  const p = new Uint8Array(8 + data.length);
  p.set([0x51, 0x78, cmd, 0x00, data.length & 0xff, data.length >> 8]);
  p.set(data, 6);
  p[6 + data.length] = crc8(data);
  p[7 + data.length] = 0xff;
  return p;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function isBluetoothSupported() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export class CatPrinter extends EventTarget {
  constructor() {
    super();
    this.device = null;
    this.tx = null;
    this.paused = false;
    this.cancelled = false;
    this.status = null;
    this.busy = false;
    this.userClosed = false;
    this.keepAlive = 0;
  }

  get connected() {
    return !!(this.device && this.device.gatt.connected && this.tx);
  }

  get name() {
    return this.device?.name || 'מדפסת';
  }

  async connect() {
    this.device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [ADV_SERVICE] },
        { services: [SERVICE] },
        { namePrefix: 'X6' },
        { namePrefix: 'GB0' },
        { namePrefix: 'MX0' },
        { namePrefix: 'GT0' },
        { namePrefix: 'YT0' },
      ],
      optionalServices: [SERVICE, ADV_SERVICE],
    });
    this.device.addEventListener('gattserverdisconnected', () => this.#onDrop());
    await this.#attach();
  }

  // The link can drop on its own (printer idle timeout, radio hiccup). Unless the
  // user asked to disconnect, quietly reconnect — no device picker needed.
  async #onDrop() {
    this.tx = null;
    clearInterval(this.keepAlive);
    if (this.userClosed) { this.emit('disconnect'); return; }
    this.emit('reconnecting');
    for (const wait of [400, 1200, 2500, 5000]) {
      await sleep(wait);
      if (this.userClosed) break;
      try { await this.#attach(); return; } catch { /* try again */ }
    }
    this.emit('disconnect');
  }

  async reconnect() {
    if (!this.device) throw new Error('no device');
    await this.#attach();
  }

  async #attach() {
    this.userClosed = false;
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE);
    this.tx = await service.getCharacteristic(TX_CHAR);
    const rx = await service.getCharacteristic(RX_CHAR);
    await rx.startNotifications();
    rx.addEventListener('characteristicvaluechanged', e => this.#onNotify(new Uint8Array(e.target.value.buffer)));
    this.emit('connect');
    await this.#send(CMD.status, [0]);
    // A light status ping keeps printers with an idle timeout from dropping the link.
    clearInterval(this.keepAlive);
    this.keepAlive = setInterval(() => {
      if (this.connected && !this.busy) this.#send(CMD.status, [0]).catch(() => {});
    }, 15000);
  }

  disconnect() {
    this.userClosed = true;
    clearInterval(this.keepAlive);
    this.device?.gatt.disconnect();
  }

  #onNotify(b) {
    if (b[0] !== 0x51 || b[1] !== 0x78) return;
    const cmd = b[2];
    const data = b.slice(6, 6 + (b[4] | (b[5] << 8)));
    if (cmd === CMD.flow) {
      // 0x10 = buffer full, 0x00 = ready again
      this.paused = data[0] === 0x10;
    } else if (cmd === CMD.status) {
      const s = data[0] || 0;
      this.status = {
        noPaper: !!(s & 0x01),
        coverOpen: !!(s & 0x02),
        overheat: !!(s & 0x04),
        lowBattery: !!(s & 0x08),
      };
      this.emit('status', this.status);
    }
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async #write(bytes) {
    while (this.paused && !this.cancelled) await sleep(20);
    if (this.tx.writeValueWithoutResponse) await this.tx.writeValueWithoutResponse(bytes);
    else await this.tx.writeValue(bytes);
  }

  #send(cmd, data) {
    return this.#write(packet(cmd, data));
  }

  /** Push blank paper out (dots; 8 dots = 1 mm) so the print clears the tear bar. */
  async feed(dots = 96) {
    if (!this.connected) throw new Error('not connected');
    await this.#send(CMD.speed, [8]);
    await this.#send(CMD.feed, [dots & 0xff, dots >> 8]);
  }

  cancel() {
    this.cancelled = true;
  }

  /**
   * rows: array of Uint8Array(48) — one bit per dot, LSB = leftmost dot.
   */
  async print(rows, { darkness = 'normal', feed = 80, slow = false, onProgress } = {}) {
    if (!this.connected) throw new Error('not connected');
    this.cancelled = false;
    this.busy = true;
    try {
      return await this.#printRows(rows, { darkness, feed, slow, onProgress });
    } finally {
      this.busy = false;
    }
  }

  async #printRows(rows, { darkness, feed, slow, onProgress }) {
    const energy = DARKNESS[darkness] ?? DARKNESS.normal;

    await this.#send(CMD.status, [0]);
    await this.#send(CMD.quality, [0x32]);
    await this.#send(CMD.speed, [32]);
    await this.#send(CMD.energy, [energy & 0xff, energy >> 8]);
    await this.#send(CMD.mode, [1]);
    await this.#send(CMD.update, [0]);
    await this.#send(CMD.lattice, LATTICE_START);

    // The printer silently drops lines once its buffer is full, so pace the
    // data to its actual print speed (darker = more heat time per line).
    const msPerRow = (ROW_MS[darkness] ?? ROW_MS.normal) * (slow ? 1.8 : 1);
    const start = performance.now();
    for (let i = 0; i < rows.length; i++) {
      if (this.cancelled) break;
      await this.#send(CMD.line, rows[i]);
      const wait = start + (i + 1) * msPerRow - performance.now();
      if (wait > 1) await sleep(wait);
      if (onProgress && (i % 8 === 0 || i === rows.length - 1)) onProgress((i + 1) / rows.length);
    }

    await this.#send(CMD.lattice, LATTICE_END);
    await this.#send(CMD.speed, [8]);
    if (feed > 0) await this.#send(CMD.feed, [feed & 0xff, feed >> 8]);
    await this.#send(CMD.status, [0]);
    return !this.cancelled;
  }
}
