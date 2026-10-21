import { useEffect, useMemo } from "react";
import { Polyline, Tooltip, useMap } from "react-leaflet";
import { LatLngBounds } from "leaflet";
import { formatKm, pxToLatLng, tuple } from "../lib/geo";
import type { Route } from "../lib/routing";
import type { Location, MapConfig } from "../lib/types";

interface Props {
  cfg: MapConfig;
  from?: Location;
  to?: Location;
  route: Route | null;
  straightKm: number;
  showStraight: boolean;
}

const KIND_STYLE = {
  road: { color: "#000", weight: 5, opacity: 0.95 },
  trail: { color: "#000", weight: 4, opacity: 0.9, dashArray: "8 6" },
  sea: { color: "#000", weight: 5, opacity: 0.95, dashArray: "2 10" },
} as const;

/** Draws the straight-line and road route between the two chosen locations. */
export function RouteLayer({ cfg, from, to, route, straightKm, showStraight }: Props) {
  const map = useMap();
  const straight = useMemo(
    () => (from && to ? [tuple(pxToLatLng(cfg, from.x, from.y)), tuple(pxToLatLng(cfg, to.x, to.y))] : null),
    [cfg, from, to],
  );

  useEffect(() => {
    if (!straight) return;
    const b = new LatLngBounds(straight);
    route?.points.forEach(([x, y]) => b.extend(pxToLatLng(cfg, x, y)));
    map.flyToBounds(b, { padding: [80, 80], maxZoom: cfg.maxZoom, duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.id, to?.id]);

  if (!straight) return null;
  return (
    <>
      {showStraight && (
        <Polyline positions={straight} pathOptions={{ color: "#000", weight: 3, opacity: 0.6, dashArray: "6 10" }}>
          <Tooltip className="measure-tip" sticky>Straight line · {formatKm(cfg, straightKm)}</Tooltip>
        </Polyline>
      )}
      {route?.legs.map((leg, i) => (
        <Polyline key={i} positions={leg.waypoints.map(([x, y]) => tuple(pxToLatLng(cfg, x, y)))} pathOptions={KIND_STYLE[leg.kind]}>
          <Tooltip className="measure-tip" sticky>{leg.kind === "sea" ? "Sea lane" : "Road"} · {formatKm(cfg, leg.km)}</Tooltip>
        </Polyline>
      ))}
    </>
  );
}
