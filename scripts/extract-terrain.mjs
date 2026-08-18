// Extracts vector terrain from a raster fantasy map (land/water + elevation
// bands from colour) and writes world/terrain.json in map pixel coordinates.
//
//   node scripts/extract-terrain.mjs <image> [targetWidth=8192]
//
// Colour model (tweak CLASSIFY if your map uses a different palette):
//   blue hue            -> water
//   green -> yellow -> brown hue, then grey/white -> increasing elevation

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { contours } from "d3-contour";
import simplify from "simplify-js";
const WORLD = new URL("../world/", import.meta.url).pathname;

const [, , src, targetArg] = process.argv;
if (!src) { console.error("usage: node scripts/extract-terrain.mjs <image> [targetWidth]"); process.exit(1); }
const TARGET_W = Number(targetArg || 8192);

const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const SCALE = TARGET_W / W;
const TARGET_H = Math.round(H * SCALE);
console.log(`source ${W}x${H} -> map ${TARGET_W}x${TARGET_H} (x${SCALE.toFixed(2)})`);

const rgb2hsv = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m;
  let h = 0;
  if (d) { if (M === r) h = ((g - b) / d) % 6; else if (M === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, M ? d / M : 0, M];
};

// ---- per-pixel classification -> land mask + elevation score
const CLASSIFY = (h, s, v) => {
  if (s < 0.09) return { land: true, elev: 0.85 + (v - 0.7) * 0.5 };           // grey / white peaks
  if (h > 150 && h < 260) return { land: false, elev: 0 };                    // blue water
  const e = Math.min(1, Math.max(0, (115 - h) / 85));                          // green 115° -> 0, brown 30° -> 1
  return { land: true, elev: e * 0.8 };
};
const land = new Float32Array(W * H), elev = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) {
  const c = CLASSIFY(...rgb2hsv(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]));
  land[i] = c.land ? 1 : 0;
  elev[i] = c.land ? c.elev : 0;
}
console.log(`land ${(land.reduce((a, b) => a + b, 0) / (W * H) * 100).toFixed(1)}%`);

// ---- blur so contours come out smooth rather than pixel-stepped
async function blur(arr, sigma) {
  const buf = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) buf[i] = Math.round(arr[i] * 255);
  const out = await sharp(buf, { raw: { width: W, height: H, channels: 1 } }).blur(sigma).raw().toBuffer();
  const ch = out.length / (W * H); // sharp may widen to 3 channels
  return Float32Array.from({ length: W * H }, (_, i) => out[i * ch] / 255);
}
const landS = await blur(land, 1.2);
const elevS = await blur(elev, 2.5);

// ---- contour -> polygons in map px, simplified
const MIN_AREA = 12; // source px²; drops speckle islands / ponds
// Chaikin corner cutting: turns the faceted marching-squares rings into curves
function chaikin(ring, iterations = 2) {
  let pts = ring;
  for (let k = 0; k < iterations; k++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
      out.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    pts = out;
  }
  return pts;
}
const ringArea = (r) => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
function toPolys(multi) {
  const polys = [];
  for (const poly of multi.coordinates) {
    const rings = poly
      .filter((r) => ringArea(r) >= MIN_AREA)
      .map((r) => simplify(r.map(([x, y]) => ({ x, y })), 0.6, true).map((p) => [p.x, p.y]))
      .filter((r) => r.length >= 4)
      .map((r) => chaikin(r).map(([x, y]) => [+(x * SCALE).toFixed(1), +(y * SCALE).toFixed(1)]));
    if (rings.length) polys.push(rings);
  }
  return polys;
}
const gen = contours().size([W, H]).smooth(true);
const landPolys = toPolys(gen.thresholds([0.5])(landS)[0]);
const LEVELS = [
  { id: "upland", t: 0.22 },
  { id: "hills", t: 0.42 },
  { id: "mountains", t: 0.62 },
  { id: "peaks", t: 0.82 },
];
const bands = LEVELS.map((l) => ({ id: l.id, polygons: toPolys(gen.thresholds([l.t])(elevS)[0]) }));
console.log(`land polygons: ${landPolys.length}; bands: ${bands.map((b) => `${b.id}=${b.polygons.length}`).join(", ")}`);

fs.mkdirSync(WORLD, { recursive: true });
fs.writeFileSync(path.join(WORLD, "terrain.json"), JSON.stringify({
  source: path.relative(process.cwd(), src), sourceWidth: W, sourceHeight: H,
  width: TARGET_W, height: TARGET_H,
  land: landPolys, bands,
}));
console.log(`wrote world/terrain.json (${(fs.statSync(path.join(WORLD, "terrain.json")).size / 1024) | 0} KB)`);
