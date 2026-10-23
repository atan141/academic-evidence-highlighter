import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const sizes = [16, 32, 48, 128];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function inRoundedRect(x, y, size, radius) {
  const r = radius;
  const left = x < r;
  const right = x > size - r;
  const top = y < r;
  const bottom = y > size - r;
  if ((left || right) && (top || bottom)) {
    const cx = left ? r : size - r;
    const cy = top ? r : size - r;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
  }
  return true;
}

function inPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function colorAt(x, y, size) {
  const t = (x + y) / (size * 2);
  const stops = [
    [0, [21, 94, 117]],
    [0.55, [37, 99, 235]],
    [1, [124, 58, 237]]
  ];
  const next = stops.findIndex(([stop]) => t <= stop);
  const [t0, c0] = stops[Math.max(0, next - 1)];
  const [t1, c1] = stops[next < 0 ? stops.length - 1 : next];
  const local = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
  return c0.map((channel, index) => Math.round(channel + (c1[index] - channel) * local));
}

function sampleIcon(x, y, size) {
  if (!inRoundedRect(x, y, size, size * 0.2)) return [0, 0, 0, 0];

  let [r, g, b] = colorAt(x, y, size);
  let a = 255;

  const sx = x / size;
  const sy = y / size;
  const outerA = [
    [0.22, 0.82],
    [0.44, 0.18],
    [0.56, 0.18],
    [0.79, 0.82],
    [0.65, 0.82],
    [0.59, 0.66],
    [0.41, 0.66],
    [0.35, 0.82]
  ];
  const innerA = [
    [0.46, 0.55],
    [0.5, 0.33],
    [0.55, 0.55]
  ];

  if (inPolygon(sx, sy, outerA) && !inPolygon(sx, sy, innerA)) {
    [r, g, b] = [248, 250, 252];
  }

  if (sx >= 0.37 && sx <= 0.63 && sy >= 0.66 && sy <= 0.73) {
    [r, g, b] = [250, 204, 21];
  }

  const dx = sx - 0.73;
  const dy = sy - 0.28;
  if (dx * dx + dy * dy <= 0.012) {
    [r, g, b] = [250, 204, 21];
  }
  if (dx * dx + dy * dy <= 0.006) {
    [r, g, b] = [248, 250, 252];
  }
  const tick =
    sx > 0.69 &&
    sx < 0.78 &&
    sy > 0.26 &&
    sy < 0.33 &&
    Math.abs(sy - (0.335 - (sx - 0.69) * 0.78)) < 0.018;
  if (tick) {
    [r, g, b] = [30, 41, 59];
  }

  return [r, g, b, a];
}

function render(size) {
  const scale = 3;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const acc = [0, 0, 0, 0];
      for (let yy = 0; yy < scale; yy += 1) {
        for (let xx = 0; xx < scale; xx += 1) {
          const color = sampleIcon(x + (xx + 0.5) / scale, y + (yy + 0.5) / scale, size);
          for (let i = 0; i < 4; i += 1) acc[i] += color[i];
        }
      }
      const offset = (y * size + x) * 4;
      for (let i = 0; i < 4; i += 1) rgba[offset + i] = Math.round(acc[i] / (scale * scale));
    }
  }
  return rgba;
}

function png(size) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rgba = render(size);
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const scanlineStart = y * (size * 4 + 1);
    scanlines[scanlineStart] = 0;
    rgba.copy(scanlines, scanlineStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    header,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

for (const size of sizes) {
  writeFileSync(new URL(`./icon${size}.png`, import.meta.url), png(size));
}
