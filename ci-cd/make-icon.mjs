/**
 * Render the NeuraSync mark: the extension icon (PNG) and the activity-bar icon (SVG).
 *
 *   node ci-cd/make-icon.mjs
 *
 * Same family as the NeuraPass and NeuraCharger marks: white nodes joined by a
 * translucent line on a near-black rounded tile. Here the line is two arcs of a
 * ring with a node at each end, the usual "sync" loop drawn node-style.
 *
 * No dependencies: the shapes are circles and ring segments, so each pixel's
 * coverage comes straight from a signed-distance function, supersampled.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const INK = [250, 250, 250]; // #fafafa
const TILE = [10, 10, 10]; // #0a0a0a
const LINE_ALPHA = 0.55;

// Geometry in 512-space, centred on the tile.
const C = 256;
const RING = 136; // ring radius
const LINE_WIDTH = 16;
const NODE_RADIUS = 27;
const TILE_RADIUS = 512 * 0.215;
// Two arcs, degrees clockwise from 3 o'clock (screen space). The gaps between
// them sit on the diagonal, like the familiar sync glyph.
const ARCS = [
  [165, 285],
  [345, 465],
];

const rad = (deg) => (deg * Math.PI) / 180;
const onRing = (deg) => [C + RING * Math.cos(rad(deg)), C + RING * Math.sin(rad(deg))];
const NODES = ARCS.flatMap(([a, b]) => [onRing(a), onRing(b)]);

// ---- signed distances (negative = inside) ----
function sdRoundedSquare(x, y) {
  const qx = Math.abs(x - C) - (C - TILE_RADIUS);
  const qy = Math.abs(y - C) - (C - TILE_RADIUS);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - TILE_RADIUS;
}

function sdArc(x, y, [a, b]) {
  let deg = (Math.atan2(y - C, x - C) * 180) / Math.PI;
  while (deg < a) deg += 360;
  if (deg <= b) return Math.abs(Math.hypot(x - C, y - C) - RING) - LINE_WIDTH / 2;
  // Outside the sweep: the ends are covered by nodes anyway, so a round cap is fine.
  const [ax, ay] = onRing(a);
  const [bx, by] = onRing(b);
  return Math.min(Math.hypot(x - ax, y - ay), Math.hypot(x - bx, y - by)) - LINE_WIDTH / 2;
}

const sdNodes = (x, y) => Math.min(...NODES.map(([nx, ny]) => Math.hypot(x - nx, y - ny) - NODE_RADIUS));
const sdLine = (x, y) => Math.min(...ARCS.map((arc) => sdArc(x, y, arc)));

// ---- raster ----
function render(size, { tile = true } = {}) {
  const SS = 4;
  const k = 512 / (size * SS);
  const pixels = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (px * SS + sx + 0.5) * k;
          const y = (py * SS + sy + 0.5) * k;
          // Composite back to front: tile, line, nodes.
          let cr = 0;
          let cg = 0;
          let cb = 0;
          let ca = 0;
          const over = (colour, alpha) => {
            cr = colour[0] * alpha + cr * (1 - alpha);
            cg = colour[1] * alpha + cg * (1 - alpha);
            cb = colour[2] * alpha + cb * (1 - alpha);
            ca = alpha + ca * (1 - alpha);
          };
          if (tile && sdRoundedSquare(x, y) <= 0) over(TILE, 1);
          if (sdLine(x, y) <= 0) over(INK, LINE_ALPHA);
          if (sdNodes(x, y) <= 0) over(INK, 1);
          r += cr;
          g += cg;
          b += cb;
          a += ca;
        }
      }
      const n = SS * SS;
      const o = (py * size + px) * 4;
      // Colours were accumulated premultiplied; un-premultiply for PNG.
      pixels[o] = a ? Math.round(r / a) : 0;
      pixels[o + 1] = a ? Math.round(g / a) : 0;
      pixels[o + 2] = a ? Math.round(b / a) : 0;
      pixels[o + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePng(size, pixels);
}

// Monochrome SVG for the activity bar: VS Code tints it, so everything is currentColor.
function svg() {
  const f = (v) => +v.toFixed(2);
  const arcs = ARCS.map(([a, b]) => {
    const [ax, ay] = onRing(a);
    const [bx, by] = onRing(b);
    return `<path d="M${f(ax)} ${f(ay)}A${RING} ${RING} 0 0 1 ${f(bx)} ${f(by)}"/>`;
  }).join("");
  const nodes = NODES.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${NODE_RADIUS}"/>`).join("");
  // Crop to the mark so it fills the 24px activity-bar slot.
  const pad = RING + NODE_RADIUS + 4;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${C - pad} ${C - pad} ${pad * 2} ${pad * 2}" fill="currentColor">` +
    `<g fill="none" stroke="currentColor" stroke-width="${LINE_WIDTH * 1.5}" stroke-opacity="${LINE_ALPHA}">${arcs}</g>` +
    `${nodes}</svg>\n`
  );
}

// ---- PNG encoding ----
function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let i = 0; i < 8; i += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const resources = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "resources");
const out = process.argv[2] || resources;
writeFileSync(path.join(out, "icon.png"), render(256));
writeFileSync(path.join(out, "remote-explorer.svg"), svg());
console.log(`wrote ${out}/icon.png (256px) and ${out}/remote-explorer.svg`);
