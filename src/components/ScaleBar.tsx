import { kmPerScreenPx } from "../lib/geo";
import type { MapConfig } from "../lib/types";

const NICE = [1, 2, 5];
function nice(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  let best = p;
  for (const n of NICE) if (n * p <= v) best = n * p;
  return best;
}

export function ScaleBar({ cfg, zoom }: { cfg: MapConfig; zoom: number }) {
  const kpp = kmPerScreenPx(cfg, zoom);
  const target = 140; // css px
  const unitsPerPx = kpp / cfg.unit.kmPerUnit;
  const units = nice(target * unitsPerPx);
  const width = units / unitsPerPx;
  const km = nice(target * kpp);
  const widthKm = km / kpp;
  const nf = new Intl.NumberFormat("en-US");
  return (
    <div className="pointer-events-none select-none text-[11px] font-semibold text-[var(--ink)]">
      <div className="mb-0.5" style={{ width }}>
        <div className="border-2 border-b-0 border-[var(--ink)] h-2" />
        <div className="text-center leading-tight">{nf.format(units)} {cfg.unit.plural}</div>
      </div>
      <div style={{ width: widthKm }}>
        <div className="border-2 border-t-0 border-[var(--ink)] h-2" />
        <div className="text-center leading-tight opacity-70">{nf.format(km)} km</div>
      </div>
    </div>
  );
}
