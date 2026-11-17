// QR codes for "scan to sign in" (signin-link.js): the sign-in page and the TV apps show one, a signed-in phone
// scans it. A small encoder (byte mode, versions 1-10) so Lilin keeps having no dependencies.
//
// matrix(text, { ecc }) → rows of booleans (true = dark), without the quiet zone.
// svg(text) → an <svg> string; png(text, { scale }) → a PNG Buffer (for the Rust TV app, which draws pictures).
import zlib from 'node:zlib';

// Error correction: Q survives a quarter of the code being covered (room for the wordmark in the middle).
const LEVELS = {
  M: { bits: 0, ecc: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26], blocks: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5] },
  Q: { bits: 3, ecc: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24], blocks: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8] },
};
const MAX_VERSION = 10;

function rawModules(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}
const dataCodewords = (ver, lv) => Math.floor(rawModules(ver) / 8) - lv.ecc[ver] * lv.blocks[ver];

// Reed-Solomon over GF(256), polynomial 0x11D.
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(degree) {
  const out = new Array(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < degree) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 2);
  }
  return out;
}
function rsRemainder(data, divisor) {
  const out = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ out.shift();
    out.push(0);
    divisor.forEach((c, i) => { out[i] ^= gfMul(c, factor); });
  }
  return out;
}

// The data codewords (mode, length, bytes, padding) for the smallest version that fits.
function encodeData(bytes, lv) {
  for (let ver = 1; ver <= MAX_VERSION; ver++) {
    const capacity = dataCodewords(ver, lv) * 8;
    const countBits = ver <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 > capacity) continue;
    const bits = [];
    const put = (value, n) => { for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
    put(0b0100, 4);
    put(bytes.length, countBits);
    for (const b of bytes) put(b, 8);
    put(0, Math.min(4, capacity - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
    const words = [];
    for (let i = 0; i < bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    return { ver, words };
  }
  throw new Error('Too long for a QR code.');
}

// Splits into blocks, adds error correction and interleaves.
function withEcc(words, ver, lv) {
  const numBlocks = lv.blocks[ver];
  const eccLen = lv.ecc[ver];
  const raw = Math.floor(rawModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = words.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= numShort) out.push(b[i]); });
  }
  return out;
}

function alignmentPositions(ver, size) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function build(ver, lv, codewords, mask) {
  const size = ver * 4 + 17;
  const dark = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, on) => { if (x >= 0 && y >= 0 && x < size && y < size) { dark[y][x] = on; fixed[y][x] = true; } };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(cx + dx, cy + dy, d !== 2 && d !== 4);
    }
  }
  const al = alignmentPositions(ver, size);
  al.forEach((ax, i) => al.forEach((ay, j) => {
    const last = al.length - 1;
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));

  // Format bits (error level + mask), both copies, and the dark module.
  const data = (lv.bits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const fmt = ((data << 10) | rem) ^ 0x5412;
  const bit = (v, i) => ((v >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(fmt, i));
  set(8, 7, bit(fmt, 6));
  set(8, 8, bit(fmt, 7));
  set(7, 8, bit(fmt, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(fmt, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(fmt, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(fmt, i));
  set(8, size - 8, true);

  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const vb = (ver << 12) | r;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit(vb, i));
      set(b, a, bit(vb, i));
    }
  }

  // Data in the zigzag, then the mask over everything that isn't a fixed pattern.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fixed[y][x] && i < codewords.length * 8) {
          dark[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
  const m = MASKS[mask];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && m(x, y)) dark[y][x] = !dark[y][x];
  return dark;
}

// The standard's penalty score: long runs, 2x2 blocks, finder look-alikes, dark/light balance.
function penalty(dark) {
  const size = dark.length;
  let score = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(dark[y]);
  for (let x = 0; x < size; x++) lines.push(dark.map((row) => row[x]));
  const finder = [true, false, true, true, true, false, true];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    for (let i = 0; i + 7 <= size; i++) {
      if (!finder.every((v, k) => line[i + k] === v)) continue;
      const lightBefore = i >= 4 && [1, 2, 3, 4].every((k) => !line[i - k]);
      const lightAfter = i + 11 <= size && [7, 8, 9, 10].every((k) => !line[i + k]);
      if (lightBefore || lightAfter) score += 40;
    }
  }
  for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
    const c = dark[y][x];
    if (dark[y][x + 1] === c && dark[y + 1][x] === c && dark[y + 1][x + 1] === c) score += 3;
  }
  const total = size * size;
  const on = dark.reduce((a, row) => a + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs(on * 20 - total * 10) / total) * 10;
  return score;
}

export function matrix(text, { ecc = 'Q' } = {}) {
  const lv = LEVELS[ecc] || LEVELS.Q;
  const { ver, words } = encodeData([...Buffer.from(String(text), 'utf8')], lv);
  const codewords = withEcc(words, ver, lv);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(ver, lv, codewords, mask);
    const s = penalty(m);
    if (!best || s < best.s) best = { m, s };
  }
  return best.m;
}

// Rows as strings of 0/1: what the TV apps get in JSON.
export const rows = (text, opts) => matrix(text, opts).map((row) => row.map((d) => (d ? '1' : '0')).join(''));

// Dark modules as one path, with a quiet zone of `border` modules. Colours are left to CSS (fill on the path).
export function svg(text, { border = 2, ecc = 'Q', label = 'QR code' } = {}) {
  const m = matrix(text, { ecc });
  const n = m.length + border * 2;
  let d = '';
  m.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (x + w < row.length && row[x + w]) w++;
      d += `M${x + border} ${y + border}h${w}v1h-${w}z`;
      x += w - 1;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${label.replace(/[<>&"]/g, '')}"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// Black on white, `scale` pixels per module, greyscale PNG.
export function png(text, { scale = 8, border = 2, ecc = 'Q' } = {}) {
  const m = matrix(text, { ecc });
  const n = (m.length + border * 2) * scale;
  const raw = Buffer.alloc((n + 1) * n, 255);
  for (let py = 0; py < n; py++) {
    raw[py * (n + 1)] = 0; // filter: none
    const my = Math.floor(py / scale) - border;
    for (let px = 0; px < n; px++) {
      const mx = Math.floor(px / scale) - border;
      if (my >= 0 && mx >= 0 && my < m.length && mx < m.length && m[my][mx]) raw[py * (n + 1) + 1 + px] = 0;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; ihdr[9] = 0; // 8-bit greyscale
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
