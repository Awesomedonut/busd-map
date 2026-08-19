// Slices public/map/map.png into a Google-Maps-style tile pyramid:
//   public/map/tiles/{z}/{x}/{y}.webp  (256px, z=0 is whole map in one tile,
//   z=maxZoom is native resolution). Only on-screen tiles are ever fetched.
//
//   node scripts/make-tiles.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "public/map/map.png");
const OUT = path.join(ROOT, "public/map/tiles");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/map.json"), "utf8"));
const { width: W, height: H, tileSize: T, maxZoom } = cfg;

fs.rmSync(OUT, { recursive: true, force: true });
const t0 = Date.now();
let count = 0;
const tileUrls = [];

for (let z = 0; z <= maxZoom; z++) {
  const scale = 1 / 2 ** (maxZoom - z);
  const w = Math.ceil(W * scale), h = Math.ceil(H * scale);
  const cols = Math.ceil(w / T), rows = Math.ceil(h / T);
  // one decode + resize per zoom level, then cut tiles from the raw buffer
  const raw = await sharp(SRC, { limitInputPixels: false })
    .resize(w, h, { kernel: "lanczos3" })
    .extend({ right: cols * T - w, bottom: rows * T - h, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const jobs = [];
  for (let x = 0; x < cols; x++) {
    fs.mkdirSync(path.join(OUT, String(z), String(x)), { recursive: true });
    for (let y = 0; y < rows; y++) {
      tileUrls.push(`/map/tiles/${z}/${x}/${y}.webp`);
      jobs.push(
        sharp(raw, { raw: { width: cols * T, height: rows * T, channels: 4 } })
          .extract({ left: x * T, top: y * T, width: T, height: T })
          .webp({ quality: 85 })
          .toFile(path.join(OUT, String(z), String(x), `${y}.webp`)),
      );
    }
  }
  await Promise.all(jobs);
  count += jobs.length;
  console.log(`z${z}: ${cols}x${rows} = ${jobs.length} tiles`);
}
// manifest + versioned service worker (version = hash of source image + config)
const version = crypto.createHash("sha1")
  .update(fs.readFileSync(SRC)).update(JSON.stringify(cfg)).update(fs.readFileSync(path.join(ROOT, "scripts/sw.template.js")))
  .digest("hex").slice(0, 10);
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ version, tiles: tileUrls }));
const tpl = fs.readFileSync(path.join(ROOT, "scripts/sw.template.js"), "utf8");
fs.writeFileSync(path.join(ROOT, "public/sw.js"), tpl.replace("__VERSION__", version));
console.log(`sw.js version ${version}, manifest ${tileUrls.length} tiles`);
console.log(`${count} tiles in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${path.relative(ROOT, OUT)}`);
