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
scripts/build-map.mjs   geodata -> map.png + data JSON (placeholder is China-shaped)
scripts/make-tiles.mjs  map.png -> tile pyramid
scripts/data/           source geodata (Natural Earth + DataV)
public/data/            map.json, locations.json, roads.json, regions.json
src/lib/                geo math, routing (Dijkstra), URL state
src/components/         MapView, markers, route layer, measure tool, search, panel
```

## Editing the world

- Locations: `public/data/locations.json` (pixel coords on map.png)
- Roads / sea lanes: `public/data/roads.json`
- Scale + travel speeds: `public/data/map.json`
- Shareable URLs: `?x=&y=&z=&from=&to=&mode=`
