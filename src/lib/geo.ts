import { CRS, LatLng, LatLngBounds, type LatLngTuple } from "leaflet";
import type { MapConfig } from "./types";

// The map uses CRS.Simple: at zoom = maxZoom, 1 map unit == 1 source pixel.
// lat = -y / 2^maxZoom, lng = x / 2^maxZoom.

export const scaleAt = (cfg: MapConfig) => CRS.Simple.scale(cfg.maxZoom);

export function pxToLatLng(cfg: MapConfig, x: number, y: number): LatLng {
  const s = scaleAt(cfg);
  return new LatLng(-y / s, x / s);
}

export function latLngToPx(cfg: MapConfig, ll: LatLng): [number, number] {
  const s = scaleAt(cfg);
  return [ll.lng * s, -ll.lat * s];
}

export function mapBounds(cfg: MapConfig): LatLngBounds {
  return new LatLngBounds(pxToLatLng(cfg, 0, cfg.height), pxToLatLng(cfg, cfg.width, 0));
}

export const tuple = (ll: LatLng): LatLngTuple => [ll.lat, ll.lng];

export const distPx = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const pxToKm = (cfg: MapConfig, px: number) => px * cfg.kmPerPixel;

export const kmToUnits = (cfg: MapConfig, km: number) => km / cfg.unit.kmPerUnit;

export function polylineKm(cfg: MapConfig, pts: [number, number][]): number {
  let px = 0;
  for (let i = 1; i < pts.length; i++) px += distPx(pts[i - 1], pts[i]);
  return pxToKm(cfg, px);
}

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function formatKm(_cfg: MapConfig, km: number): string {
  return `${km < 10 ? nf1.format(km) : nf.format(km)} km`;
}

export function formatDays(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} h`;
  if (days < 10) return `${nf1.format(days)} days`;
  return `${nf.format(days)} days`;
}

/** metres-per-CSS-pixel isn't meaningful here; return km per screen pixel at a zoom */
export const kmPerScreenPx = (cfg: MapConfig, zoom: number) => cfg.kmPerPixel / 2 ** (zoom - cfg.maxZoom);
