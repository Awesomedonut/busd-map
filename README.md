# busd-map

Google-Maps-style viewer for a fantasy world: zoom, pan, search, measure
distances, and compute travel time between locations (by road or straight
line). Built as a writing reference so travel in the story stays honest.

## Run

```bash
npm install
npm run build:map   # regenerate map.png + tiles + data from scripts/data
npm run dev
```

`npm run build` regenerates tiles automatically (`prebuild`).

## Stack

- React 19 + Vite + TypeScript + Tailwind 4
- Leaflet + react-leaflet with `CRS.Simple` (flat pixel coordinates)
- Tile pyramid (`public/map/tiles/{z}/{x}/{y}.webp`) generated with sharp
- Static JSON data in `public/data/` (map config, locations, roads, regions)

## Layout

```
world/                  editable source: locations, roads, config
scripts/build-map.mjs   world/ + terrain geodata -> map.png + public/data JSON
scripts/make-tiles.mjs  map.png -> tile pyramid
scripts/data/           terrain geodata (Natural Earth + DataV), placeholder only
public/data/            map.json, locations.json, roads.json, regions.json
src/lib/                geo math, routing (Dijkstra), URL state
src/components/         MapView, markers, route layer, measure tool, search, panel
```

## Editing the world

`world/` is the source of truth. Edit, then `npm run build:map` (~20s) to
re-render the base map, tiles and `public/data/`.

- `world/locations.json` — places (`id`, `name`, `type`, `x`, `y` in map pixels, optional `region`, `population`, `description`)
- `world/roads.json` — road / sea-lane graph (`from`, `to`, `kind`, `waypoints` in map pixels; lengths are computed)
- `world/config.json` — world name, distance unit, travel modes and speeds
- `scripts/derive-placeholder.mjs` — one-off that generated the current placeholder from China geodata; not needed again

Shareable URLs: `?x=&y=&z=&from=&to=&mode=`
