// Renders the world map as a high-res PNG plus the JSON the viewer consumes.
// Source of truth is world/*.json (locations, roads, config) + the terrain
// geodata in scripts/data. Re-run whenever the world changes:
//
//   npm run build:map        (this + tiles)
//
// Outputs:
//   public/map/map.png         full-res base image (then sliced by make-tiles)
//   public/data/map.json       size, scale, zoom, units, travel modes
//   public/data/locations.json cities (pixel coords)
//   public/data/roads.json     road / sea-lane graph with lengths
//   public/data/regions.json   region labels

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  ROOT, read, readWorld, OUT_W, OUT_H, KM_PER_PX, fmt, proj, outline, provinces,
  PROVINCE_EN, NO_REGION_LABEL, pathFromPolys, pathFromLines, bboxOf,
} from "./lib/world-geo.mjs";

console.log(`canvas ${OUT_W}x${OUT_H}, ${KM_PER_PX.toFixed(3)} km/px`);

const rivers = read("rivers.json").features;
const lakes = read("lakes.json").features;

// ---------------------------------------------------------------- world (editable source)
const worldCfg = readWorld("config.json");
const cities = readWorld("locations.json");
const roads = readWorld("roads.json").map((r) => {
  let px = 0;
  for (let i = 1; i < r.waypoints.length; i++) px += Math.hypot(r.waypoints[i][0] - r.waypoints[i - 1][0], r.waypoints[i][1] - r.waypoints[i - 1][1]);
  return { ...r, km: Math.round(px * KM_PER_PX) };
});
const ids = new Set(cities.map((c) => c.id));
for (const r of roads) if (!ids.has(r.from) || !ids.has(r.to)) throw new Error(`road references unknown location: ${r.from} -> ${r.to}`);
console.log(`cities: ${cities.length}, roads: ${roads.length} (${roads.filter((r) => r.kind === "sea").length} sea lanes)`);

// ---------------------------------------------------------------- regions
const regions = provinces.map((p) => {
  const en = PROVINCE_EN[p.properties.name] || p.properties.name;
  const [a, b, c, d] = bboxOf(p.geometry);
  const [x1, y1] = proj([a, d]), [x2, y2] = proj([c, b]);
  const [cx, cy] = proj(p.properties.centroid || p.properties.center);
  return { id: en.toLowerCase().replace(/\s+/g, "-"), name: en, x: fmt(cx), y: fmt(cy), bbox: [fmt(x1), fmt(y1), fmt(x2), fmt(y2)], label: !NO_REGION_LABEL.has(en) };
});

// ---------------------------------------------------------------- label placement (greedy, avoid overlaps)
const placed = [];
const overlaps = (r) => placed.some((p) => !(r.x2 < p.x1 || r.x1 > p.x2 || r.y2 < p.y1 || r.y1 > p.y2));
const FONT = { capital: 54, metropolis: 44, city: 34, town: 26 };
const DOT = { capital: 14, metropolis: 11, city: 8, town: 6 };
const cityLabels = [];
for (const c of cities) {
  const fs_ = FONT[c.type], w = c.name.length * fs_ * 0.55, h = fs_;
  const r = DOT[c.type];
  const candidates = [
    { x: c.x + r + 8, y: c.y + fs_ * 0.35, anchor: "start" },
    { x: c.x - r - 8, y: c.y + fs_ * 0.35, anchor: "end" },
    { x: c.x, y: c.y - r - 8, anchor: "middle" },
    { x: c.x, y: c.y + r + fs_, anchor: "middle" },
  ];
  for (const cand of candidates) {
    const x1 = cand.anchor === "start" ? cand.x : cand.anchor === "end" ? cand.x - w : cand.x - w / 2;
    const rect = { x1, y1: cand.y - h, x2: x1 + w, y2: cand.y };
    if (!overlaps(rect)) { placed.push(rect); cityLabels.push({ c, ...cand, fs: fs_ }); break; }
  }
}
console.log(`labels placed: ${cityLabels.length}/${cities.length}`);

// ---------------------------------------------------------------- SVG
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'/g, "&#39;");
const SERIF = "'Palatino', 'Palatino Linotype', 'Book Antiqua', 'Georgia', serif";
const landPath = pathFromPolys(outline.geometry);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}" viewBox="0 0 ${OUT_W} ${OUT_H}">
<defs>
  <clipPath id="land"><path d="${landPath}"/></clipPath>
  <filter id="noise" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.10"/></feComponentTransfer>
  </filter>
  <pattern id="grain" width="512" height="512" patternUnits="userSpaceOnUse">
    <rect width="512" height="512" filter="url(#noise)" fill="#000"/>
  </pattern>
  <pattern id="waves" width="120" height="60" patternUnits="userSpaceOnUse">
    <path d="M0 30 Q30 18 60 30 T120 30" fill="none" stroke="#7d9bb3" stroke-opacity="0.18" stroke-width="2"/>
  </pattern>
</defs>
<!-- sea -->
<rect width="100%" height="100%" fill="#d8dfd6"/>
<rect width="100%" height="100%" fill="url(#waves)"/>
<!-- coastal glow -->
<path d="${landPath}" fill="none" stroke="#8fa9bf" stroke-opacity="0.35" stroke-width="70" stroke-linejoin="round"/>
<path d="${landPath}" fill="none" stroke="#7592ab" stroke-opacity="0.35" stroke-width="28" stroke-linejoin="round"/>
<!-- land -->
<path d="${landPath}" fill="#efe4c6"/>
<g clip-path="url(#land)">
  <!-- province borders -->
  ${provinces.map((p) => `<path d="${pathFromPolys(p.geometry)}" fill="none" stroke="#8a6b47" stroke-opacity="0.55" stroke-width="2.5" stroke-dasharray="14 10"/>`).join("\n  ")}
  <!-- rivers -->
  ${rivers.map((r) => `<path d="${pathFromLines(r.geometry)}" fill="none" stroke="#5f86b0" stroke-opacity="0.9" stroke-width="${Math.max(2, (r.properties.strokeweig || 1) * 2.2)}" stroke-linecap="round" stroke-linejoin="round"/>`).join("\n  ")}
  <!-- lakes -->
  ${lakes.map((l) => `<path d="${pathFromPolys(l.geometry)}" fill="#a9c2d9" stroke="#5f86b0" stroke-width="2"/>`).join("\n  ")}
</g>
<!-- coastline -->
<path d="${landPath}" fill="none" stroke="#5a4630" stroke-width="4" stroke-linejoin="round"/>
<!-- roads -->
<g>
  ${roads.map((r) => r.kind === "sea"
    ? `<line x1="${r.waypoints[0][0]}" y1="${r.waypoints[0][1]}" x2="${r.waypoints[1][0]}" y2="${r.waypoints[1][1]}" stroke="#4d6f92" stroke-opacity="0.7" stroke-width="3" stroke-dasharray="4 14" stroke-linecap="round"/>`
    : `<line x1="${r.waypoints[0][0]}" y1="${r.waypoints[0][1]}" x2="${r.waypoints[1][0]}" y2="${r.waypoints[1][1]}" stroke="#a0522d" stroke-opacity="0.75" stroke-width="3" stroke-dasharray="18 8"/>`).join("\n  ")}
</g>
<!-- region labels -->
<g font-family="${SERIF}" fill="#6b533a" fill-opacity="0.85" text-anchor="middle" letter-spacing="14" font-weight="600">
  ${regions.filter((r) => r.label).map((r) => {
    const w = r.bbox[2] - r.bbox[0], h = r.bbox[3] - r.bbox[1];
    const fs_ = Math.max(48, Math.min(150, Math.sqrt(w * h) * 0.075));
    return `<text x="${r.x}" y="${r.y}" font-size="${fs_.toFixed(0)}">${esc(r.name.toUpperCase())}</text>`;
  }).join("\n  ")}
</g>
<!-- cities -->
<g stroke="#2b1d12" stroke-width="3">
  ${cities.map((c) => {
    const r = DOT[c.type];
    if (c.type === "capital") return `<circle cx="${c.x}" cy="${c.y}" r="${r + 8}" fill="none" stroke-width="4"/><circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#8b1a1a"/>`;
    if (c.type === "metropolis") return `<circle cx="${c.x}" cy="${c.y}" r="${r + 5}" fill="none"/><circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#2b1d12"/>`;
    if (c.type === "city") return `<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#2b1d12"/>`;
    return `<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#efe4c6"/>`;
  }).join("\n  ")}
</g>
<g font-family="${SERIF}" fill="#2b1d12" stroke="#efe4c6" stroke-width="6" paint-order="stroke" stroke-linejoin="round">
  ${cityLabels.map((l) => `<text x="${l.x}" y="${l.y}" font-size="${l.fs}" text-anchor="${l.anchor}" font-weight="${l.c.type === "town" ? 400 : 700}">${esc(l.c.name)}</text>`).join("\n  ")}
</g>
<!-- frame + cartouche -->
<rect x="24" y="24" width="${OUT_W - 48}" height="${OUT_H - 48}" fill="none" stroke="#5a4630" stroke-width="10"/>
<rect x="44" y="44" width="${OUT_W - 88}" height="${OUT_H - 88}" fill="none" stroke="#5a4630" stroke-width="3"/>
<g transform="translate(${OUT_W - 1500}, ${OUT_H - 700})">
  <rect x="0" y="0" width="1300" height="440" fill="#efe4c6" stroke="#5a4630" stroke-width="6" rx="12"/>
  <rect x="18" y="18" width="1264" height="404" fill="none" stroke="#5a4630" stroke-width="2" rx="8"/>
  <text x="650" y="150" font-family="${SERIF}" font-size="110" text-anchor="middle" fill="#2b1d12" font-weight="700">${esc(worldCfg.name.toUpperCase())}</text>
  <text x="650" y="230" font-family="${SERIF}" font-size="44" text-anchor="middle" fill="#6b533a" letter-spacing="6">${esc(worldCfg.subtitle || "")}</text>
  <text x="650" y="330" font-family="${SERIF}" font-size="40" text-anchor="middle" fill="#6b533a">1 px = ${KM_PER_PX.toFixed(2)} km = ${(KM_PER_PX / worldCfg.unit.kmPerUnit).toFixed(2)} ${worldCfg.unit.plural}</text>
  <line x1="200" y1="380" x2="${200 + 500 / KM_PER_PX}" y2="380" stroke="#2b1d12" stroke-width="8"/>
  <text x="${200 + 250 / KM_PER_PX}" y="415" font-family="${SERIF}" font-size="34" text-anchor="middle" fill="#2b1d12">500 km</text>
</g>
<!-- grain overlay -->
<rect width="100%" height="100%" fill="url(#grain)"/>
</svg>`;

// ---------------------------------------------------------------- write
fs.mkdirSync(path.join(ROOT, "public/map"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "public/data"), { recursive: true });

const t0 = Date.now();
await sharp(Buffer.from(svg), { limitInputPixels: false, density: 72 })
  .png({ compressionLevel: 6 })
  .toFile(path.join(ROOT, "public/map/map.png"));
console.log(`map.png rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const TILE = 256;
const maxZoom = Math.ceil(Math.log2(Math.max(OUT_W, OUT_H) / TILE));
const w = (f, o) => fs.writeFileSync(path.join(ROOT, "public/data", f), JSON.stringify(o, null, 0));
w("map.json", { ...worldCfg, width: OUT_W, height: OUT_H, tileSize: TILE, maxZoom, kmPerPixel: +KM_PER_PX.toFixed(4) });
w("locations.json", cities);
w("roads.json", roads);
w("regions.json", regions);
console.log("wrote public/data/*.json");
