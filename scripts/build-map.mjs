// Renders the world map as a high-res PNG plus the JSON the viewer consumes.
// Source of truth is world/*.json. Re-run whenever the world changes:
//
//   npm run build:map        (this + tiles, ~20s)
//
// Inputs (world/):
//   terrain.json   land polygons + elevation bands (+ optional rivers/lakes), map px
//   locations.json places
//   roads.json     road / sea-lane graph
//   regions.json   optional region labels
//   config.json    name, units, scale, travel modes
// Outputs:
//   public/map/map.png         full-res base image (then sliced by make-tiles)
//   public/data/*.json         map, locations, roads, regions

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORLD = path.join(ROOT, "world");
const readWorld = (f, fallback) => {
  const p = path.join(WORLD, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback;
};

// ---------------------------------------------------------------- inputs
const cfg = readWorld("config.json");
const terrain = readWorld("terrain.json");
const cities = readWorld("locations.json", []);
const regions = readWorld("regions.json", []);
const OUT_W = terrain.width, OUT_H = terrain.height;
const KM_PER_PX = cfg.kmPerPixel ?? cfg.mapWidthKm / OUT_W;
if (!KM_PER_PX) throw new Error("world/config.json needs kmPerPixel or mapWidthKm");

const roads = readWorld("roads.json", []).map((r) => {
  let px = 0;
  for (let i = 1; i < r.waypoints.length; i++) px += Math.hypot(r.waypoints[i][0] - r.waypoints[i - 1][0], r.waypoints[i][1] - r.waypoints[i - 1][1]);
  return { ...r, km: Math.round(px * KM_PER_PX) };
});
const ids = new Set(cities.map((c) => c.id));
for (const r of roads) if (!ids.has(r.from) || !ids.has(r.to)) throw new Error(`road references unknown location: ${r.from} -> ${r.to}`);
console.log(`canvas ${OUT_W}x${OUT_H}, ${KM_PER_PX.toFixed(3)} km/px; cities ${cities.length}, roads ${roads.length}, regions ${regions.length}`);

// ---------------------------------------------------------------- geometry -> svg paths
const polysPath = (polys) => polys.map((rings) => rings.map((r) => "M" + r.map((p) => p.join(",")).join("L") + "Z").join("")).join("");
const linesPath = (lines) => lines.map((l) => "M" + l.map((p) => p.join(",")).join("L")).join("");
const landPath = polysPath(terrain.land);
const bandStyle = {
  upland: { fill: "#e6dcb0", hatch: null },
  hills: { fill: "#d6c091", hatch: null },
  mountains: { fill: "#b99a72", hatch: "hatch" },
  peaks: { fill: "#e4e0d6", hatch: "hatch-dark" },
};

// ---------------------------------------------------------------- label placement (greedy, avoid overlaps)
const placed = [];
const overlaps = (r) => placed.some((p) => !(r.x2 < p.x1 || r.x1 > p.x2 || r.y2 < p.y1 || r.y1 > p.y2));
const FONT = { capital: 54, metropolis: 44, city: 34, town: 26, landmark: 26 };
const DOT = { capital: 14, metropolis: 11, city: 8, town: 6, landmark: 7 };
const cityLabels = [];
const importance = { capital: 4, metropolis: 3, city: 2, town: 1, landmark: 1 };
for (const c of [...cities].sort((a, b) => importance[b.type] - importance[a.type] || (b.population ?? 0) - (a.population ?? 0))) {
  const fs_ = FONT[c.type] ?? 26, w = c.name.length * fs_ * 0.55, h = fs_, r = DOT[c.type] ?? 6;
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
if (cities.length) console.log(`labels placed: ${cityLabels.length}/${cities.length}`);

// ---------------------------------------------------------------- SVG
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'/g, "&#39;");
const SERIF = "'Palatino', 'Palatino Linotype', 'Book Antiqua', 'Georgia', serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}" viewBox="0 0 ${OUT_W} ${OUT_H}">
<defs>
  <clipPath id="land"><path d="${landPath}" fill-rule="evenodd"/></clipPath>
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
  <pattern id="hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="14" stroke="#5a4630" stroke-opacity="0.22" stroke-width="2"/>
  </pattern>
  <pattern id="hatch-dark" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="10" stroke="#5a4630" stroke-opacity="0.35" stroke-width="2"/>
  </pattern>
</defs>
<!-- sea -->
<rect width="100%" height="100%" fill="#d8dfd6"/>
<rect width="100%" height="100%" fill="url(#waves)"/>
<!-- coastal glow -->
<path d="${landPath}" fill="none" stroke="#8fa9bf" stroke-opacity="0.35" stroke-width="70" stroke-linejoin="round"/>
<path d="${landPath}" fill="none" stroke="#7592ab" stroke-opacity="0.35" stroke-width="28" stroke-linejoin="round"/>
<!-- land -->
<path d="${landPath}" fill="#efe4c6" fill-rule="evenodd"/>
<g clip-path="url(#land)">
  ${(terrain.bands ?? []).map((b) => {
    const st = bandStyle[b.id] ?? { fill: "#ccc" };
    const d = polysPath(b.polygons);
    return `<path d="${d}" fill="${st.fill}" fill-rule="evenodd" stroke="#8a6b47" stroke-opacity="0.35" stroke-width="2"/>` +
      (st.hatch ? `<path d="${d}" fill="url(#${st.hatch})" fill-rule="evenodd"/>` : "");
  }).join("\n  ")}
  ${(terrain.rivers ?? []).map((r) => `<path d="${linesPath([r.points])}" fill="none" stroke="#5f86b0" stroke-opacity="0.9" stroke-width="${r.width ?? 3}" stroke-linecap="round" stroke-linejoin="round"/>`).join("\n  ")}
  ${terrain.lakes ? `<path d="${polysPath(terrain.lakes)}" fill="#a9c2d9" stroke="#5f86b0" stroke-width="2" fill-rule="evenodd"/>` : ""}
</g>
<!-- coastline -->
<path d="${landPath}" fill="none" stroke="#5a4630" stroke-width="4" stroke-linejoin="round"/>
<!-- roads -->
<g>
  ${roads.map((r) => `<path d="${linesPath([r.waypoints])}" fill="none" ${r.kind === "sea"
    ? 'stroke="#4d6f92" stroke-opacity="0.7" stroke-width="3" stroke-dasharray="4 14" stroke-linecap="round"'
    : 'stroke="#a0522d" stroke-opacity="0.75" stroke-width="3" stroke-dasharray="18 8"'}/>`).join("\n  ")}
</g>
<!-- region labels -->
<g font-family="${SERIF}" fill="#6b533a" fill-opacity="0.85" text-anchor="middle" letter-spacing="14" font-weight="600">
  ${regions.filter((r) => r.label !== false).map((r) => `<text x="${r.x}" y="${r.y}" font-size="${r.fontSize ?? 90}">${esc(r.name.toUpperCase())}</text>`).join("\n  ")}
</g>
<!-- cities -->
<g stroke="#2b1d12" stroke-width="3">
  ${cities.map((c) => {
    const r = DOT[c.type] ?? 6;
    if (c.type === "capital") return `<circle cx="${c.x}" cy="${c.y}" r="${r + 8}" fill="none" stroke-width="4"/><circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#8b1a1a"/>`;
    if (c.type === "metropolis") return `<circle cx="${c.x}" cy="${c.y}" r="${r + 5}" fill="none"/><circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#2b1d12"/>`;
    if (c.type === "city") return `<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#2b1d12"/>`;
    if (c.type === "landmark") return `<path d="M${c.x} ${c.y - r - 2} L${c.x + r} ${c.y + r} L${c.x - r} ${c.y + r} Z" fill="#8b1a1a"/>`;
    return `<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#efe4c6"/>`;
  }).join("\n  ")}
</g>
<g font-family="${SERIF}" fill="#2b1d12" stroke="#efe4c6" stroke-width="6" paint-order="stroke" stroke-linejoin="round">
  ${cityLabels.map((l) => `<text x="${l.x}" y="${l.y}" font-size="${l.fs}" text-anchor="${l.anchor}" font-weight="${l.c.type === "town" || l.c.type === "landmark" ? 400 : 700}">${esc(l.c.name)}</text>`).join("\n  ")}
</g>
<!-- frame + cartouche -->
<rect x="24" y="24" width="${OUT_W - 48}" height="${OUT_H - 48}" fill="none" stroke="#5a4630" stroke-width="10"/>
<rect x="44" y="44" width="${OUT_W - 88}" height="${OUT_H - 88}" fill="none" stroke="#5a4630" stroke-width="3"/>
<g transform="translate(${OUT_W - 1500}, ${OUT_H - 700})">
  <rect x="0" y="0" width="1300" height="440" fill="#efe4c6" stroke="#5a4630" stroke-width="6" rx="12"/>
  <rect x="18" y="18" width="1264" height="404" fill="none" stroke="#5a4630" stroke-width="2" rx="8"/>
  <text x="650" y="150" font-family="${SERIF}" font-size="110" text-anchor="middle" fill="#2b1d12" font-weight="700">${esc(cfg.name.toUpperCase())}</text>
  <text x="650" y="230" font-family="${SERIF}" font-size="44" text-anchor="middle" fill="#6b533a" letter-spacing="6">${esc(cfg.subtitle || "")}</text>
  <text x="650" y="330" font-family="${SERIF}" font-size="40" text-anchor="middle" fill="#6b533a">1 px = ${KM_PER_PX.toFixed(2)} km = ${(KM_PER_PX / cfg.unit.kmPerUnit).toFixed(2)} ${esc(cfg.unit.plural)}</text>
  <line x1="200" y1="380" x2="${200 + 500 / KM_PER_PX}" y2="380" stroke="#2b1d12" stroke-width="8"/>
  <text x="${200 + 250 / KM_PER_PX}" y="415" font-family="${SERIF}" font-size="34" text-anchor="middle" fill="#2b1d12">500 km</text>
</g>
<rect width="100%" height="100%" fill="url(#grain)"/>
</svg>`;

// ---------------------------------------------------------------- write
fs.mkdirSync(path.join(ROOT, "public/map"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "public/data"), { recursive: true });
const t0 = Date.now();
await sharp(Buffer.from(svg), { limitInputPixels: false, density: 72 }).png({ compressionLevel: 6 }).toFile(path.join(ROOT, "public/map/map.png"));
console.log(`map.png rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const TILE = 256;
const maxZoom = Math.ceil(Math.log2(Math.max(OUT_W, OUT_H) / TILE));
const w = (f, o) => fs.writeFileSync(path.join(ROOT, "public/data", f), JSON.stringify(o));
const { mapWidthKm: _unused, ...pubCfg } = cfg;
w("map.json", { ...pubCfg, width: OUT_W, height: OUT_H, tileSize: TILE, maxZoom, kmPerPixel: +KM_PER_PX.toFixed(4) });
w("locations.json", cities);
w("roads.json", roads);
w("regions.json", regions.map((r) => ({ id: r.id, name: r.name, x: r.x, y: r.y, bbox: r.bbox ?? [r.x - 400, r.y - 300, r.x + 400, r.y + 300], label: r.label !== false })));
console.log("wrote public/data/*.json");
