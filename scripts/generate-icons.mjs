// Рисует иконки приложения (PNG) без сторонних библиотек: node scripts/generate-icons.mjs
// Знак тот же, что в шапке: восходящая линия и пунктирная «ветка» на тёмном фоне.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const BG = [9, 13, 24];
const TILE = [23, 31, 50];
const ACCENT = [45, 212, 191];
const VIOLET = [155, 117, 250];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x + 0.5, y + 0.5);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

function icon(size) {
  // Знак занимает 72% иконки (запас для «маскируемых» иконок Android).
  const scale = (size * 0.72) / 32;
  const off = (size - 32 * scale) / 2;
  const u = (v) => off + v * scale;
  const line = [
    [7, 22],
    [13, 16],
    [18, 19],
    [25, 10],
  ];
  const w = 1.35 * scale;
  return png(size, (x, y) => {
    let c = BG;
    // Скруглённый квадрат-подложка.
    const r = 9 * scale;
    const cx = Math.min(Math.max(x, u(0) + r), u(32) - r);
    const cy = Math.min(Math.max(y, u(0) + r), u(32) - r);
    const dTile = Math.hypot(x - cx, y - cy) - r;
    c = mix(c, TILE, Math.max(0, Math.min(1, 0.5 - dTile)));
    // Пунктирная ветка.
    const ax = u(18);
    const ay = u(19);
    const bx = u(25);
    const by = u(24);
    const along = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / Math.hypot(bx - ax, by - ay);
    const dash = ((along / scale) % 5) < 2.4;
    const dV = segDist(x, y, ax, ay, bx, by) - w;
    if (dash) c = mix(c, VIOLET, Math.max(0, Math.min(1, 0.5 - dV)));
    // Основная линия.
    let dA = Infinity;
    for (let i = 0; i < line.length - 1; i++) dA = Math.min(dA, segDist(x, y, u(line[i][0]), u(line[i][1]), u(line[i + 1][0]), u(line[i + 1][1])) - w);
    c = mix(c, ACCENT, Math.max(0, Math.min(1, 0.5 - dA)));
    // Точка.
    const dP = Math.hypot(x - u(13), y - u(16)) - 2.3 * scale;
    c = mix(c, ACCENT, Math.max(0, Math.min(1, 0.5 - dP)));
    return c;
  });
}

const out = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "public", "icons");
fs.mkdirSync(out, { recursive: true });
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  fs.writeFileSync(path.join(out, name), icon(size));
  console.log("written", name);
}
