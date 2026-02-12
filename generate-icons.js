import { writeFileSync, mkdirSync, existsSync } from "fs";
import { deflateSync } from "zlib";

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const dir = "public/icons";

if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

// Generate SVG icon
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#7c3aed"/>
      <stop offset="100%" style="stop-color:#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <g transform="translate(256,256)" stroke="white" stroke-width="24" stroke-linecap="round" fill="none">
    <line x1="-100" y1="0" x2="100" y2="0"/>
    <rect x="-140" y="-50" width="40" height="100" rx="8" fill="white" stroke="none"/>
    <rect x="100" y="-50" width="40" height="100" rx="8" fill="white" stroke="none"/>
    <rect x="-160" y="-35" width="20" height="70" rx="6" fill="white" opacity="0.7" stroke="none"/>
    <rect x="140" y="-35" width="20" height="70" rx="6" fill="white" opacity="0.7" stroke="none"/>
  </g>
  <text x="256" y="400" text-anchor="middle" fill="white" font-family="system-ui, sans-serif" font-size="48" font-weight="bold" opacity="0.9">ADAPT</text>
</svg>`;

writeFileSync(`${dir}/icon.svg`, svgIcon);
console.log("Created icon.svg");

for (const size of sizes) {
  const png = createPNG(size);
  writeFileSync(`${dir}/icon-${size}x${size}.png`, png);
  console.log(`Created icon-${size}x${size}.png (${png.length} bytes)`);
}

function createPNG(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8);   // 8-bit
  ihdrData.writeUInt8(2, 9);   // RGB
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdrChunk = makeChunk("IHDR", ihdrData);

  // Image data - purple gradient with centered dumbbell shape
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3);
    raw[rowStart] = 0; // No filter

    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3;
      // Gradient purple background
      const t = (x + y) / (size * 2);
      const r = Math.round(124 + t * 44);  // #7c3aed to #a855f7
      const g = Math.round(58 + t * 27);
      const b = Math.round(237 - t * 10);

      // Normalize coords to 0-1
      const nx = x / size;
      const ny = y / size;

      // Draw dumbbell shape (white)
      const cx = 0.5, cy = 0.45;
      const barHalfW = 0.2, barH = 0.03;
      const weightW = 0.06, weightH = 0.16;
      const outerW = 0.03, outerH = 0.11;

      let isWhite = false;

      // Bar
      if (Math.abs(ny - cy) < barH && Math.abs(nx - cx) < barHalfW) isWhite = true;
      // Left weight
      if (nx > cx - barHalfW - weightW && nx < cx - barHalfW && Math.abs(ny - cy) < weightH) isWhite = true;
      // Right weight
      if (nx > cx + barHalfW && nx < cx + barHalfW + weightW && Math.abs(ny - cy) < weightH) isWhite = true;
      // Left outer
      if (nx > cx - barHalfW - weightW - outerW && nx < cx - barHalfW - weightW && Math.abs(ny - cy) < outerH) isWhite = true;
      // Right outer
      if (nx > cx + barHalfW + weightW && nx < cx + barHalfW + weightW + outerW && Math.abs(ny - cy) < outerH) isWhite = true;

      if (isWhite) {
        raw[px] = 255;
        raw[px + 1] = 255;
        raw[px + 2] = 255;
      } else {
        raw[px] = r;
        raw[px + 1] = g;
        raw[px + 2] = b;
      }
    }
  }

  const compressed = deflateSync(raw);
  const idatChunk = makeChunk("IDAT", compressed);

  // IEND
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
