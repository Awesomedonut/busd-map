// Shared projection + geodata helpers for the map build scripts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");
export const DATA = path.resolve(__dirname, "data");
export const WORLD = path.join(ROOT, "world");
export const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
export const readWorld = (f) => JSON.parse(fs.readFileSync(path.join(WORLD, f), "utf8"));

// ---------------------------------------------------------------- projection
export const OUT_W = 8192;
export const BBOX = { minLon: 72.5, maxLon: 136.5, minLat: 16.5, maxLat: 54.5 };
export const MID_LAT = 36;
export const K = Math.cos((MID_LAT * Math.PI) / 180);
export const PX_PER_DEG = OUT_W / ((BBOX.maxLon - BBOX.minLon) * K);
export const OUT_H = Math.round((BBOX.maxLat - BBOX.minLat) * PX_PER_DEG);
export const KM_PER_PX = 111.32 / PX_PER_DEG;
export const proj = ([lon, lat]) => [
  (lon - BBOX.minLon) * K * PX_PER_DEG,
  (BBOX.maxLat - lat) * PX_PER_DEG,
];
export const fmt = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- data
export const outline = read("outline.json").features[0];
export const provinces = read("provinces.json").features.filter((f) => f.properties.name);

export const PROVINCE_EN = {
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
export const NO_REGION_LABEL = new Set(["Beijing", "Tianjin", "Shanghai", "Hong Kong", "Macau", "Chongqing"]);

export const NAME_FIX = { Shenyeng: "Shenyang", Shijianzhuang: "Shijiazhuang", Xian: "Xi'an", Huaiyin: "Huai'an" };

// ---------------------------------------------------------------- geometry helpers
export const rings = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates); // -> array of polygons (each: [outer, ...holes])
export const pathFromPolys = (g, close = true) =>
  rings(g)
    .flatMap((poly) => poly)
    .map((ring) => "M" + ring.map((c) => proj(c).map(fmt).join(",")).join("L") + (close ? "Z" : ""))
    .join("");
export const pathFromLines = (g) => {
  const lines = g.type === "LineString" ? [g.coordinates] : g.coordinates;
  return lines.map((l) => "M" + l.map((c) => proj(c).map(fmt).join(",")).join("L")).join("");
};

export function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function pointInGeom(pt, g) {
  for (const poly of rings(g)) {
    if (pointInRing(pt, poly[0]) && !poly.slice(1).some((h) => pointInRing(pt, h))) return true;
  }
  return false;
}
export const bboxOf = (g) => {
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const poly of rings(g)) for (const [x, y] of poly[0]) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  return [minx, miny, maxx, maxy];
};
export const provinceBboxes = provinces.map((p) => bboxOf(p.geometry));
export function provinceAt(lonlat) {
  for (let i = 0; i < provinces.length; i++) {
    const [a, b, c, d] = provinceBboxes[i];
    if (lonlat[0] < a || lonlat[0] > c || lonlat[1] < b || lonlat[1] > d) continue;
    if (pointInGeom(lonlat, provinces[i].geometry)) return provinces[i];
  }
  return null;
}
export const isLand = (lonlat) => pointInGeom(lonlat, outline.geometry);

