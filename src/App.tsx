import { useCallback, useEffect, useMemo, useState } from "react";
import { DistancePanel } from "./components/DistancePanel";
import { LocationMarkers } from "./components/LocationMarkers";
import { MapView } from "./components/MapView";
import { MeasureTool } from "./components/MeasureTool";
import { RouteLayer } from "./components/RouteLayer";
import { ScaleBar } from "./components/ScaleBar";
import { SearchBox } from "./components/SearchBox";
import { ViewSync, type FlyTarget } from "./components/ViewSync";
import { loadWorld } from "./lib/data";
import { distPx, formatKm, pxToKm } from "./lib/geo";
import { buildGraph, locById, shortestRoute } from "./lib/routing";
import type { WorldData } from "./lib/types";
import { readUrl, writeUrl } from "./lib/urlState";

const initialUrl = readUrl();

export default function App() {
  const [world, setWorld] = useState<WorldData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 2 });
  const [fromId, setFromId] = useState<string | undefined>(initialUrl.from);
  const [toId, setToId] = useState<string | undefined>(initialUrl.to);
  const [modeId, setModeId] = useState(initialUrl.mode ?? "horse");
  const [allowSea, setAllowSea] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [fly, setFly] = useState<FlyTarget | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [measure, setMeasure] = useState({ km: 0, points: 0 });
  const [measureClear, setMeasureClear] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => { loadWorld().then(setWorld).catch((e) => setError(String(e))); }, []);

  useEffect(() => { writeUrl({ ...view, z: view.zoom, from: fromId, to: toId, mode: modeId }); }, [view, fromId, toId, modeId]);

  const byId = useMemo(() => (world ? locById(world.locations) : new Map()), [world]);
  const graph = useMemo(() => (world ? buildGraph(world.roads) : null), [world]);
  const from = fromId ? byId.get(fromId) : undefined;
  const to = toId ? byId.get(toId) : undefined;
  const straightKm = world && from && to ? pxToKm(world.config, distPx([from.x, from.y], [to.x, to.y])) : null;
  const route = useMemo(() => (graph && from && to ? shortestRoute(graph, from.id, to.id, allowSea) : null), [graph, from, to, allowSea]);

  const onView = useCallback((v: { x: number; y: number; zoom: number }) => setView(v), []);
  const flyTo = (t: { x: number; y: number; zoom?: number; locationId?: string }) => {
    setFly({ x: t.x, y: t.y, zoom: t.zoom, key: Date.now() });
    if (t.locationId) setTimeout(() => setSelectedId(t.locationId), 950);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMeasuring(false); setSelectedId(undefined); }
      if (e.key === "m" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) setMeasuring((m) => !m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (error) return <Center>Failed to load map data: {error}</Center>;
  if (!world) return <Center>Loading map…</Center>;
  const { config: cfg } = world;
  const hasView = initialUrl.x !== undefined && initialUrl.z !== undefined;

  return (
    <div className="relative h-full w-full">
      <MapView cfg={cfg} initial={initialUrl}>
        <ViewSync cfg={cfg} fitOnMount={!hasView} onView={onView} fly={fly} />
        <LocationMarkers
          cfg={cfg}
          locations={world.locations}
          fromId={fromId}
          toId={toId}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSetFrom={(id) => { setFromId(id); setSelectedId(undefined); setPanelOpen(true); }}
          onSetTo={(id) => { setToId(id); setSelectedId(undefined); setPanelOpen(true); }}
        />
        <RouteLayer cfg={cfg} from={from} to={to} route={route} straightKm={straightKm ?? 0} showStraight />
        <MeasureTool cfg={cfg} active={measuring} onTotal={(km, points) => setMeasure({ km, points })} clearKey={measureClear} />
      </MapView>

      {/* top-left: search */}
      <div className="absolute left-3 top-3 z-[1000] flex items-start gap-2">
        <SearchBox locations={world.locations} regions={world.regions} onPick={flyTo} />
        <button
          className={`btn panel ${measuring ? "active" : ""}`}
          title="Measure distance (m)"
          onClick={() => setMeasuring((m) => !m)}
        >
          📏 {measuring ? "Measuring…" : "Measure"}
        </button>
        {(measure.points > 0 || measuring) && (
          <div className="panel flex items-center gap-2 px-3 py-2 text-sm">
            <span>{measure.points < 2 ? "Click points on the map" : formatKm(cfg, measure.km)}</span>
            {measure.points > 0 && <button className="btn-sm" onClick={() => setMeasureClear((k) => k + 1)}>Clear</button>}
          </div>
        )}
      </div>

      {/* top-right: distance / travel panel */}
      <div className="absolute right-3 top-3 z-[1000] w-80">
        <div className="panel">
          <button className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold" onClick={() => setPanelOpen((o) => !o)}>
            <span>{cfg.name} · Travel</span>
            <span className="opacity-60">{panelOpen ? "▾" : "▸"}</span>
          </button>
          {panelOpen && (
            <div className="border-t border-[var(--ink)]/15 px-3 py-3">
              <DistancePanel
                cfg={cfg}
                locations={world.locations}
                fromId={fromId}
                toId={toId}
                modeId={modeId}
                straightKm={straightKm}
                route={route}
                allowSea={allowSea}
                onFrom={setFromId}
                onTo={setToId}
                onMode={setModeId}
                onSwap={() => { setFromId(toId); setToId(fromId); }}
                onAllowSea={setAllowSea}
                onClear={() => { setFromId(undefined); setToId(undefined); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* bottom-left: scale + coords */}
      <div className="absolute bottom-3 left-3 z-[1000] flex items-end gap-3">
        <div className="panel px-3 py-2"><ScaleBar cfg={cfg} zoom={view.zoom} /></div>
        <div className="panel px-2 py-1 text-[11px] opacity-80">
          x {Math.round(view.x)} · y {Math.round(view.y)} · z {view.zoom.toFixed(2)}
        </div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-sm opacity-70">{children}</div>;
}
