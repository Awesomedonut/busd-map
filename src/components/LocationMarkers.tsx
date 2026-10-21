import { useEffect, useRef } from "react";
import { CircleMarker, Popup, Tooltip } from "react-leaflet";
import type { CircleMarker as LCircleMarker } from "leaflet";
import { pxToLatLng } from "../lib/geo";
import type { Location, MapConfig } from "../lib/types";

const RADIUS: Record<Location["type"], number> = { capital: 14, metropolis: 12, city: 10, town: 8, landmark: 9 };

interface Props {
  cfg: MapConfig;
  locations: Location[];
  fromId?: string;
  toId?: string;
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  onSetFrom: (id: string) => void;
  onSetTo: (id: string) => void;
}

const nf = new Intl.NumberFormat("en-US");

export function LocationMarkers(props: Props) {
  return (
    <>
      {props.locations.map((loc) => (
        <LocMarker key={loc.id} loc={loc} {...props} />
      ))}
    </>
  );
}

function LocMarker({ cfg, loc, fromId, toId, selectedId, onSelect, onSetFrom, onSetTo }: Props & { loc: Location }) {
  const ref = useRef<LCircleMarker>(null);
  const isFrom = fromId === loc.id, isTo = toId === loc.id;
  const active = isFrom || isTo;

  useEffect(() => {
    if (selectedId === loc.id) ref.current?.openPopup();
  }, [selectedId, loc.id]);

  return (
    <CircleMarker
      ref={ref}
      center={pxToLatLng(cfg, loc.x, loc.y)}
      radius={RADIUS[loc.type] + (active ? 4 : 0)}
      pathOptions={{
        color: "#000",
        weight: active ? 3 : 0,
        opacity: 1,
        fillColor: "#000",
        fillOpacity: active ? 0.25 : 0,
      }}
      eventHandlers={{
        click: () => onSelect(loc.id),
        popupclose: () => onSelect(undefined),
        mouseover: (e) => e.target.setStyle({ fillOpacity: 0.2 }),
        mouseout: (e) => e.target.setStyle({ fillOpacity: active ? 0.25 : 0 }),
      }}
    >
      <Tooltip className="loc-tip" direction="top" offset={[0, -RADIUS[loc.type]]}>{loc.name}</Tooltip>
      <Popup autoPan={false} closeButton={false} minWidth={190}>
        <div className="space-y-1">
          <div className="text-base font-semibold leading-tight">{loc.name}</div>
          <div className="text-xs opacity-70 capitalize">
            {loc.type}{loc.region ? ` · ${loc.region}` : ""}{loc.population ? ` · pop. ${nf.format(loc.population)}` : ""}
          </div>
          {loc.description && <p className="text-xs">{loc.description}</p>}
          <div className="flex gap-1.5 pt-1">
            <button className="btn-sm" onClick={() => onSetFrom(loc.id)}>Start here</button>
            <button className="btn-sm" onClick={() => onSetTo(loc.id)}>Travel here</button>
          </div>
        </div>
      </Popup>
    </CircleMarker>
  );
}
