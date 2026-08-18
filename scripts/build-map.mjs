// Generates the placeholder world map (based on real China geodata) as a
// high-res PNG plus the JSON data the viewer consumes.
//
//   node scripts/build-map.mjs
//
// Outputs:
//   public/map/map.png        full-res source image
//   public/data/map.json      size, scale, zoom config
//   public/data/locations.json cities (pixel coords)
//   public/data/roads.json    road / sea-lane graph
//   public/data/regions.json  province labels + polygons (pixel coords)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(__dirname, "data");
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));

// ---------------------------------------------------------------- projection
const OUT_W = 8192;
const BBOX = { minLon: 72.5, maxLon: 136.5, minLat: 16.5, maxLat: 54.5 };
const MID_LAT = 36;
const K = Math.cos((MID_LAT * Math.PI) / 180);
const PX_PER_DEG = OUT_W / ((BBOX.maxLon - BBOX.minLon) * K);
const OUT_H = Math.round((BBOX.maxLat - BBOX.minLat) * PX_PER_DEG);
const KM_PER_PX = 111.32 / PX_PER_DEG;
const proj = ([lon, lat]) => [
  (lon - BBOX.minLon) * K * PX_PER_DEG,
  (BBOX.maxLat - lat) * PX_PER_DEG,
];
const fmt = (n) => Math.round(n * 10) / 10;

console.log(`canvas ${OUT_W}x${OUT_H}, ${KM_PER_PX.toFixed(3)} km/px`);

// ---------------------------------------------------------------- data
const outline = read("outline.json").features[0];
const provinces = read("provinces.json").features.filter((f) => f.properties.name);
const rivers = read("rivers.json").features;
const lakes = read("lakes.json").features;
const places = read("places.json").features;

const PROVINCE_EN = {
  北京市: "Beijing", 天津市: "Tianjin", 河北省: "Hebei", 山西省: "Shanxi",
  内蒙古自治区: "Inner Mongolia", 辽宁省: "Liaoning", 吉林省: "Jilin",
  黑龙江省: "Heilongjiang", 上海市: "Shanghai", 江苏省: "Jiangsu",
  浙江省: "Zhejiang", 安徽省: "Anhui", 福建省: "Fujian", 江西省: "Jiangxi",
  山东省: "Shandong", 河南省: "Henan", 湖北省: "Hubei", 湖南省: "Hunan",
  广东省: "Guangdong", 广西壮族自治区: "Guangxi", 海南省: "Hainan",
  重庆市: "Chongqing", 四川省: "Sichuan", 贵州省: "Guizhou", 云南省: "Yunnan",
  西藏自治区: "Tibet", 陕西省: "Shaanxi", 甘肃省: "Gansu", 青海省: "Qinghai",
  宁夏回族自治区: "Ningxia", 新疆维吾尔自治区: "Xinjiang", 台湾省: "Taiwan",
  香港特别行政区: "Hong Kong", 澳门特别行政区: "Macau",
};
// municipalities / SARs are labelled as cities, not regions
const NO_REGION_LABEL = new Set(["Beijing", "Tianjin", "Shanghai", "Hong Kong", "Macau", "Chongqing"]);

const NAME_FIX = { Shenyeng: "Shenyang", Shijianzhuang: "Shijiazhuang", Xian: "Xi'an", Huaiyin: "Huai'an" };

// ---------------------------------------------------------------- geometry helpers
const rings = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates); // -> array of polygons (each: [outer, ...holes])
const pathFromPolys = (g, close = true) =>
  rings(g)
    .flatMap((poly) => poly)
    .map((ring) => "M" + ring.map((c) => proj(c).map(fmt).join(",")).join("L") + (close ? "Z" : ""))
    .join("");
const pathFromLines = (g) => {
  const lines = g.type === "LineString" ? [g.coordinates] : g.coordinates;
  return lines.map((l) => "M" + l.map((c) => proj(c).map(fmt).join(",")).join("L")).join("");
};

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInGeom(pt, g) {
  for (const poly of rings(g)) {
    if (pointInRing(pt, poly[0]) && !poly.slice(1).some((h) => pointInRing(pt, h))) return true;
  }
  return false;
}
const bboxOf = (g) => {
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const poly of rings(g)) for (const [x, y] of poly[0]) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  return [minx, miny, maxx, maxy];
};
const provinceBboxes = provinces.map((p) => bboxOf(p.geometry));
function provinceAt(lonlat) {
  for (let i = 0; i < provinces.length; i++) {
    const [a, b, c, d] = provinceBboxes[i];
    if (lonlat[0] < a || lonlat[0] > c || lonlat[1] < b || lonlat[1] > d) continue;
    if (pointInGeom(lonlat, provinces[i].geometry)) return provinces[i];
  }
  return null;
}
const isLand = (lonlat) => pointInGeom(lonlat, outline.geometry);

// ---------------------------------------------------------------- cities
const seen = new Map();
const cities = places
  .map((f) => {
    const p = f.properties;
    const lonlat = f.geometry.coordinates;
    const region = provinceAt(lonlat);
    if (!region) return null;
    const pop = p.pop_max || 0;
    const isCap = /capital/.test(p.featurecla);
    if (pop < 900_000 && !isCap) return null;
    let name = NAME_FIX[p.name] || p.name;
    let id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (seen.has(id)) { const n = seen.get(id) + 1; seen.set(id, n); id = `${id}-${n}`; } else seen.set(id, 1);
    const type = p.adm0cap === 1 && name === "Beijing" ? "capital" : pop >= 5_000_000 ? "metropolis" : pop >= 2_000_000 ? "city" : "town";
    const [x, y] = proj(lonlat);
    return { id, name, type, x: fmt(x), y: fmt(y), population: pop, region: PROVINCE_EN[region.properties.name], lon: lonlat[0], lat: lonlat[1] };
  })
  .filter(Boolean)
  .sort((a, b) => b.population - a.population);
console.log(`cities: ${cities.length}`);

// ---------------------------------------------------------------- roads (k-nearest + MST, sea if it leaves land)
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const edges = new Map();
const addEdge = (a, b) => {
  const k = edgeKey(a.id, b.id);
  if (edges.has(k)) return;
  const dpx = dist(a, b);
  if (dpx * KM_PER_PX > 1100) return;
  // sample along the segment; if any point is off-land it's a sea lane
  let sea = false;
  for (let t = 0.1; t < 0.95; t += 0.1) {
    const lon = a.lon + (b.lon - a.lon) * t, lat = a.lat + (b.lat - a.lat) * t;
    if (!isLand([lon, lat])) { sea = true; break; }
  }
  edges.set(k, { from: a.id, to: b.id, kind: sea ? "sea" : "road", km: Math.round(dpx * KM_PER_PX), waypoints: [[a.x, a.y], [b.x, b.y]] });
};
// k nearest
for (const c of cities) {
  const near = cities.filter((o) => o !== c).sort((p, q) => dist(c, p) - dist(c, q)).slice(0, 3);
  for (const n of near) addEdge(c, n);
}
// MST (Prim) to guarantee connectivity
{
  const inTree = new Set([cities[0].id]);
  while (inTree.size < cities.length) {
    let best = null;
    for (const a of cities) if (inTree.has(a.id)) for (const b of cities) if (!inTree.has(b.id)) { const d = dist(a, b); if (!best || d < best.d) best = { a, b, d }; }
    if (!best) break;
    inTree.add(best.b.id);
    const k = edgeKey(best.a.id, best.b.id);
    if (!edges.has(k)) { const save = KM_PER_PX; addEdge(best.a, best.b); if (!edges.has(k)) { const dpx = best.d; edges.set(k, { from: best.a.id, to: best.b.id, kind: "road", km: Math.round(dpx * save), waypoints: [[best.a.x, best.a.y], [best.b.x, best.b.y]] }); } }
  }
}
const roads = [...edges.values()];
console.log(`roads: ${roads.length} (${roads.filter((r) => r.kind === "sea").length} sea lanes)`);

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
  <text x="650" y="150" font-family="${SERIF}" font-size="110" text-anchor="middle" fill="#2b1d12" font-weight="700">PLACEHOLDER REALM</text>
  <text x="650" y="230" font-family="${SERIF}" font-size="44" text-anchor="middle" fill="#6b533a" letter-spacing="6">A WORLD SHAPED LIKE THE MIDDLE KINGDOM</text>
  <text x="650" y="330" font-family="${SERIF}" font-size="40" text-anchor="middle" fill="#6b533a">1 px = ${KM_PER_PX.toFixed(2)} km = ${(KM_PER_PX * 2).toFixed(2)} li</text>
  <line x1="200" y1="380" x2="${200 + 500 / KM_PER_PX}" y2="380" stroke="#2b1d12" stroke-width="8"/>
  <text x="${200 + 250 / KM_PER_PX}" y="415" font-family="${SERIF}" font-size="34" text-anchor="middle" fill="#2b1d12">500 km</text>
</g>
<!-- grain overlay -->
<rect width="100%" height="100%" fill="url(#grain)"/>
</svg>`;

// ---------------------------------------------------------------- write
fs.mkdirSync(path.join(ROOT, "public/map"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "public/data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "scratch/map.svg"), svg);

const t0 = Date.now();
await sharp(Buffer.from(svg), { limitInputPixels: false, density: 72 })
  .png({ compressionLevel: 6 })
  .toFile(path.join(ROOT, "public/map/map.png"));
console.log(`map.png rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const TILE = 256;
const maxZoom = Math.ceil(Math.log2(Math.max(OUT_W, OUT_H) / TILE));
const w = (f, o) => fs.writeFileSync(path.join(ROOT, "public/data", f), JSON.stringify(o, null, 0));
w("map.json", {
  name: "Placeholder Realm",
  width: OUT_W, height: OUT_H, tileSize: TILE, maxZoom,
  kmPerPixel: +KM_PER_PX.toFixed(4),
  unit: { name: "li", plural: "li", kmPerUnit: 0.5 },
  travelModes: [
    { id: "foot", label: "On foot", kmPerDay: 30 },
    { id: "horse", label: "Horseback", kmPerDay: 60 },
    { id: "caravan", label: "Caravan", kmPerDay: 25 },
    { id: "ship", label: "Ship", kmPerDay: 150 },
    { id: "courier", label: "Relay courier", kmPerDay: 200 },
  ],
});
w("locations.json", cities.map(({ lon, lat, ...c }) => c));
w("roads.json", roads);
w("regions.json", regions);
console.log("wrote public/data/*.json");
