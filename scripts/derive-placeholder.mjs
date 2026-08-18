// ONE-OFF: derives the placeholder world (cities + road graph) from real
// China geodata and writes it to world/. After that, world/*.json is the
// source of truth — edit it by hand and run `npm run build:map`.
//
//   node scripts/derive-placeholder.mjs

import fs from "node:fs";
import path from "node:path";
import { WORLD, read, proj, fmt, KM_PER_PX, PROVINCE_EN, NAME_FIX, provinceAt, isLand } from "./lib/world-geo.mjs";

const places = read("places.json").features;

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


fs.mkdirSync(WORLD, { recursive: true });
fs.writeFileSync(path.join(WORLD, "locations.json"), JSON.stringify(cities.map(({ lon, lat, ...c }) => c), null, 1));
fs.writeFileSync(path.join(WORLD, "roads.json"), JSON.stringify(roads.map(({ km, ...r }) => r), null, 0));
console.log("wrote world/locations.json, world/roads.json");
