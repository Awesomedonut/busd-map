import { useEffect } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import { latLngToPx, mapBounds, pxToLatLng } from "../lib/geo";
import type { MapConfig } from "../lib/types";

export interface FlyTarget {
  x: number;
  y: number;
  zoom?: number;
  key: number; // bump to re-trigger the same target
}

interface Props {
  cfg: MapConfig;
  fitOnMount: boolean;
  onView: (v: { x: number; y: number; zoom: number }) => void;
  fly?: FlyTarget | null;
}

/** Keeps App state and the URL in sync with the map view; handles fly-to and min zoom. */
export function ViewSync({ cfg, fitOnMount, onView, fly }: Props) {
  const map = useMap();

  const report = () => {
    const [x, y] = latLngToPx(cfg, map.getCenter());
    onView({ x, y, zoom: map.getZoom() });
  };

  useMapEvents({ moveend: report, zoomend: report });

  useEffect(() => {
    const bounds = mapBounds(cfg);
    const applyMin = () => {
      const fit = map.getBoundsZoom(bounds, false);
      map.setMinZoom(Math.max(0, fit - 0.25));
    };
    applyMin();
    if (fitOnMount) map.fitBounds(bounds, { animate: false });
    report();
    map.on("resize", applyMin);
    return () => { map.off("resize", applyMin); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    if (!fly) return;
    map.flyTo(pxToLatLng(cfg, fly.x, fly.y), fly.zoom ?? Math.max(map.getZoom(), cfg.maxZoom - 1), { duration: 0.9 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly?.key]);

  return null;
}
