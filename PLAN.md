# Fantasy Map — Plan

A Google Maps-style viewer for a custom fantasy world map. Limited scope:
pan, zoom, place markers, and measure the distance/path between two locations.

## Tech stack (recommended)

| Layer | Choice | Why |
|---|---|---|
| Framework | React 19 + Vite + TypeScript | Fast dev loop, matches your other projects |
| Map engine | **Leaflet** with `CRS.Simple` | Built for image-based (non-geographic) maps. Zoom/pan/markers/polylines out of the box. Tiny bundle. |
| React bindings | `react-leaflet` | Declarative markers, polylines, layers |
| Styling | TailwindCSS 4 | Search bar, sidebar, distance panel |
| Tiles | Pre-cut tile pyramid (`gdal2tiles.py` or a small Node/sharp script) | Lets a huge map image zoom smoothly instead of loading one 50MB PNG |
| Data | Static JSON (`locations.json`, `roads.json`) | No backend needed. Load via fetch, keep it in the repo |
| Pathfinding | Straight-line first, then Dijkstra over a hand-drawn road graph (optional phase) | "As the crow flies" is trivial; road routing is the stretch goal |
| Deploy | Vercel / GitHub Pages | Static site, zero cost |

**Why not MapLibre GL / OpenLayers / Pixi?** All heavier and aimed at real geo
data or custom rendering. Leaflet + CRS.Simple is the standard answer for
"my map is a big picture". Swap later if you need WebGL performance.

## Data model

```ts
// public/data/locations.json
type Location = {
  id: string;
  name: string;
  type: "city" | "town" | "landmark" | "dungeon" | "region";
  x: number;   // pixel coords on the full-res source image
  y: number;
  description?: string;
};

// public/data/roads.json (phase 3)
type RoadEdge = { from: string; to: string; waypoints: [number, number][]; kind: "road" | "sea" | "trail" };
```

Scale: one config value `PIXELS_PER_UNIT` (e.g. 1 px = 0.5 leagues) so
distances display in world units, not pixels.

## Phases

### Phase 1 — Viewer (MVP)
- [ ] Vite + React + TS scaffold, Tailwind, react-leaflet
- [ ] Load map image as `ImageOverlay` with `CRS.Simple`, bounds = image size
- [ ] Zoom (scroll / +- buttons / pinch), pan, min/max zoom, bounded to image
- [ ] Zoom-level-based UI (show towns only when zoomed in)

### Phase 2 — Locations + distance
- [ ] Markers from `locations.json`, custom icons per type
- [ ] Click marker → info popup
- [ ] Search bar with fuzzy match, fly-to on select
- [ ] "Measure" mode: click A, click B → draw polyline + label with distance
- [ ] Distance panel: pick two locations from dropdowns, show straight-line distance + estimated travel days (configurable speed per mode: foot / horse / ship)
- [ ] URL state (`?lat=&lng=&z=&from=&to=`) so views are shareable

### Phase 3 — Tiles + roads (nice to have)
- [ ] Script to slice the source image into `/tiles/{z}/{x}/{y}.png`; switch `ImageOverlay` → `TileLayer`
- [ ] Hand-drawn road graph, Dijkstra shortest path along roads, draw the route
- [ ] Toggle layers (political borders, regions, labels)
- [ ] Deploy to Vercel

## Repo layout

```
fantasy-map/
  public/
    map/         # source image + tiles
    data/        # locations.json, roads.json
  scripts/
    make-tiles.ts
  src/
    components/  # MapView, Search, DistancePanel, MarkerLayer
    lib/         # distance.ts, pathfinding.ts, coords.ts
    App.tsx
  PLAN.md
```

## Open questions
- Do you already have a map image? What resolution? (drives whether tiles are needed in phase 1 or 3)
- World units: leagues, km, miles, "days of travel"?
- Roads/sea routes on the map, or is straight-line enough?
