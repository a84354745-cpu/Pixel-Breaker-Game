import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createPNG(width, height, renderPixel) {
  // 1 filter byte (0) + 4 bytes per pixel (RGBA)
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = renderPixel(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  }
  return (~c) >>> 0;
}

const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  table[n] = c;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function renderIcon(isMaskable) {
  return (x, y, w, h) => {
    const nx = x / w;
    const ny = y / h;

    // Background: deep dark navy
    let r = 10;
    let g = 9;
    let b = 24;
    let a = 255;

    // Outer border safe margin for maskable
    const margin = isMaskable ? 0.15 : 0.05;
    if (nx < margin || nx > 1 - margin || ny < margin || ny > 1 - margin) {
      return isMaskable ? [10, 9, 24, 255] : [10, 9, 24, 255];
    }

    // Grid coordinates: 16x16 pixel picture
    const gx = Math.floor(((nx - margin) / (1 - 2 * margin)) * 16);
    const gy = Math.floor(((ny - margin) / (1 - 2 * margin)) * 16);

    // Arrow pixel map (16x16)
    const arrowMap = [
      '....########....',
      '...##########...',
      '..############..',
      '.##############.',
      '################',
      '......####......',
      '......####......',
      '......####......',
      '......####......',
      '......####......',
      '......####......',
      '................',
      '......(O).......', // Ball
      '................',
      '...[========]...', // Paddle
      '................',
    ];

    if (gy >= 0 && gy < 16 && gx >= 0 && gx < 16) {
      const char = arrowMap[gy][gx];
      if (char === '#') {
        // Yellow arrow
        r = 234;
        g = 179;
        b = 8;
      } else if (char === '(' || char === 'O' || char === ')') {
        // White ball
        r = 255;
        g = 255;
        b = 255;
      } else if (char === '[' || char === '=' || char === ']') {
        // Orange paddle
        r = 255;
        g = 77;
        b = 0;
      } else {
        // Blue pixel mosaic background
        if ((gx + gy) % 2 === 0) {
          r = 29;
          g = 78;
          b = 216;
        } else {
          r = 30;
          g = 64;
          b = 175;
        }
      }
    }

    return [r, g, b, a];
  };
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Generate PNGs
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPNG(192, 192, renderIcon(false)));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPNG(512, 512, renderIcon(false)));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPNG(512, 512, renderIcon(true)));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPNG(180, 180, renderIcon(false)));

// 2. Generate Brand SVG
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="100" fill="#0a0918"/>
  <rect x="40" y="40" width="432" height="320" rx="16" fill="#1d4ed8"/>
  <!-- Yellow Arrow -->
  <polygon points="256,70 120,200 200,200 200,320 312,320 312,200 392,200" fill="#eab308"/>
  <!-- Paddle -->
  <rect x="156" y="420" width="200" height="28" rx="8" fill="#ff4d00" stroke="#ffedd5" stroke-width="4"/>
  <!-- Ball -->
  <circle cx="256" cy="380" r="14" fill="#ffffff"/>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf-8');
console.log('Icons generated successfully!');
