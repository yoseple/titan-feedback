// Generates Titan PWA icons (a blue "T" on the dark theme bg) as real PNGs.
// Run: node scripts/gen-icons.mjs   (writes into public/)
import zlib from 'node:zlib';
import fs from 'node:fs';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
};
const png = (size, rgba) => {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) { raw[y * stride] = 0; rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
};
const icon = (size) => {
  const bg = [17, 24, 39, 255];   // #111827
  const fg = [59, 130, 246, 255]; // #3b82f6
  const rgba = Buffer.alloc(size * size * 4);
  const barTop = Math.round(size * 0.26), barH = Math.round(size * 0.14);
  const barL = Math.round(size * 0.22), barR = Math.round(size * 0.78);
  const vW = Math.round(size * 0.15), vL = Math.round(size / 2 - vW / 2), vR = vL + vW;
  const vBottom = Math.round(size * 0.74);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let col = bg;
    if (y >= barTop && y < barTop + barH && x >= barL && x < barR) col = fg;         // top bar
    else if (y >= barTop && y < vBottom && x >= vL && x < vR) col = fg;               // stem
    const i = (y * size + x) * 4;
    rgba[i] = col[0]; rgba[i + 1] = col[1]; rgba[i + 2] = col[2]; rgba[i + 3] = col[3];
  }
  return png(size, rgba);
};

fs.writeFileSync('public/pwa-192x192.png', icon(192));
fs.writeFileSync('public/pwa-512x512.png', icon(512));
fs.writeFileSync('public/apple-touch-icon.png', icon(180));
fs.writeFileSync('public/favicon-32.png', icon(32));
fs.writeFileSync(
  'public/masked-icon.svg',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#111827"/><path d="M113 133 H399 V205 H294 V379 H218 V205 H113 Z" fill="#3b82f6"/></svg>\n',
);
console.log('Generated: pwa-192x192, pwa-512x512, apple-touch-icon, favicon-32, masked-icon.svg');
