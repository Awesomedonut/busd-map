import { CRS } from "leaflet";
import type { ReactNode } from "react";
import { MapContainer, TileLayer, ZoomControl } from "react-leaflet";
import { tileUrl } from "../lib/data";
import { mapBounds, pxToLatLng } from "../lib/geo";
import type { MapConfig } from "../lib/types";
import type { UrlState } from "../lib/urlState";

interface Props {
  cfg: MapConfig;
  initial: UrlState;
  children?: ReactNode;
}

/** Full-screen Leaflet map over the tile pyramid, using a flat pixel CRS. */
export function MapView({ cfg, initial, children }: Props) {
  const bounds = mapBounds(cfg);
  const hasView = initial.x !== undefined && initial.y !== undefined && initial.z !== undefined;
  const center = hasView ? pxToLatLng(cfg, initial.x!, initial.y!) : bounds.getCenter();
  const zoom = hasView ? initial.z! : 2;

  return (
    <MapContainer
      crs={CRS.Simple}
      center={center}
      zoom={zoom}
      minZoom={0}
      maxZoom={cfg.maxZoom + 1}
      zoomSnap={0}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={90}
      maxBounds={bounds.pad(0.08)}
      maxBoundsViscosity={0.85}
      attributionControl={false}
      zoomControl={false}
      preferCanvas
      className="h-full w-full"
    >
      <TileLayer
        url={tileUrl()}
        tileSize={cfg.tileSize}
        minNativeZoom={0}
        maxNativeZoom={cfg.maxZoom}
        noWrap
        bounds={bounds}
        keepBuffer={4}
        detectRetina
        updateWhenZooming={false}
        updateInterval={100}
      />
      <ZoomControl position="bottomright" />
      {children}
    </MapContainer>
  );
}
