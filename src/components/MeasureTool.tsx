import { useEffect, useState } from "react";
import { CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { formatKm, latLngToPx, polylineKm, pxToLatLng, tuple } from "../lib/geo";
import type { MapConfig } from "../lib/types";

interface Props {
  cfg: MapConfig;
  active: boolean;
  onTotal: (km: number, points: number) => void;
  clearKey: number;
}

/** Click-to-measure: freehand polyline anywhere on the map with a running total. */
export function MeasureTool({ cfg, active, onTotal, clearKey }: Props) {
  const map = useMap();
  const [pts, setPts] = useState<[number, number][]>([]);
  const [hover, setHover] = useState<[number, number] | null>(null);

  useEffect(() => { setPts([]); setHover(null); onTotal(0, 0); }, [clearKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = map.getContainer().parentElement;
    if (active) { map.doubleClickZoom.disable(); el?.classList.add("crosshair"); }
    else { map.doubleClickZoom.enable(); el?.classList.remove("crosshair"); setHover(null); }
  }, [active, map]);

  useMapEvents({
    click(e) {
      if (!active) return;
      const p = latLngToPx(cfg, e.latlng);
      setPts((prev) => { const next = [...prev, p]; onTotal(polylineKm(cfg, next), next.length); return next; });
    },
    mousemove(e) { if (active && pts.length) setHover(latLngToPx(cfg, e.latlng)); },
    dblclick() { if (active) setHover(null); },
  });

  if (!pts.length) return null;
  const line = pts.map(([x, y]) => tuple(pxToLatLng(cfg, x, y)));
  const total = polylineKm(cfg, pts);
  const preview = hover && active ? [line[line.length - 1], tuple(pxToLatLng(cfg, hover[0], hover[1]))] : null;
  const previewKm = hover ? polylineKm(cfg, [...pts, hover]) : total;

  return (
    <>
      <Polyline positions={line} pathOptions={{ color: "#000", weight: 3, opacity: 0.9 }} />
      {preview && (
        <Polyline positions={preview} pathOptions={{ color: "#000", weight: 2, opacity: 0.6, dashArray: "4 6" }}>
          <Tooltip className="measure-tip" sticky permanent direction="right" offset={[10, 0]}>{formatKm(cfg, previewKm)}</Tooltip>
        </Polyline>
      )}
      {pts.map(([x, y], i) => (
        <CircleMarker key={i} center={pxToLatLng(cfg, x, y)} radius={5} pathOptions={{ color: "#fff", weight: 2, fillColor: "#000", fillOpacity: 1 }}>
          {i === pts.length - 1 && !preview && (
            <Tooltip className="measure-tip" permanent direction="right" offset={[8, 0]}>{formatKm(cfg, total)}</Tooltip>
          )}
        </CircleMarker>
      ))}
    </>
  );
}
