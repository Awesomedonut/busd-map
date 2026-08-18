import { formatDays, formatKm } from "../lib/geo";
import type { Route } from "../lib/routing";
import type { Location, MapConfig } from "../lib/types";

interface Props {
  cfg: MapConfig;
  locations: Location[];
  fromId?: string;
  toId?: string;
  modeId: string;
  straightKm: number | null;
  route: Route | null;
  allowSea: boolean;
  onFrom: (id: string | undefined) => void;
  onTo: (id: string | undefined) => void;
  onMode: (id: string) => void;
  onSwap: () => void;
  onAllowSea: (v: boolean) => void;
  onClear: () => void;
}

export function DistancePanel(p: Props) {
  const sorted = [...p.locations].sort((a, b) => a.name.localeCompare(b.name));
  const mode = p.cfg.travelModes.find((m) => m.id === p.modeId) ?? p.cfg.travelModes[0];
  const routeKm = p.route?.km ?? null;
  const seaLegs = p.route?.legs.filter((l) => l.kind === "sea").length ?? 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="space-y-2">
          <Select label="From" value={p.fromId} onChange={p.onFrom} options={sorted} />
          <Select label="To" value={p.toId} onChange={p.onTo} options={sorted} />
        </div>
        <button className="btn self-center px-2" title="Swap" onClick={p.onSwap}>⇅</button>
      </div>

      <label className="block text-xs">
        <span className="opacity-70">Travel by</span>
        <select className="input mt-0.5" value={mode.id} onChange={(e) => p.onMode(e.target.value)}>
          {p.cfg.travelModes.map((m) => (
            <option key={m.id} value={m.id}>{m.label} · {m.kmPerDay} km/day</option>
          ))}
        </select>
      </label>

      {p.straightKm !== null && (
        <div className="space-y-2 rounded border border-[var(--ink)]/15 bg-white/30 p-2 text-sm">
          <Row label="Straight line" km={p.straightKm} days={p.straightKm / mode.kmPerDay} cfg={p.cfg} />
          {routeKm !== null ? (
            <Row
              label={`By road${seaLegs ? ` (+${seaLegs} sea leg${seaLegs > 1 ? "s" : ""})` : ""}`}
              km={routeKm}
              days={routeKm / mode.kmPerDay}
              cfg={p.cfg}
              strong
            />
          ) : (
            <div className="text-xs opacity-70">No road connection{p.allowSea ? "" : " without sea lanes"}.</div>
          )}
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={p.allowSea} onChange={(e) => p.onAllowSea(e.target.checked)} /> allow sea lanes
          </label>
          <table className="w-full text-xs">
            <tbody>
              {p.cfg.travelModes.map((m) => {
                const km = routeKm ?? p.straightKm!;
                return (
                  <tr key={m.id} className={m.id === mode.id ? "font-semibold" : "opacity-70"}>
                    <td className="py-0.5">{m.label}</td>
                    <td className="py-0.5 text-right">{formatDays(km / m.kmPerDay)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button className="btn-sm" onClick={p.onClear}>Clear route</button>
        </div>
      )}
      {p.straightKm === null && (
        <p className="text-xs opacity-60">Pick two places, or click a marker and use "Start here" / "Travel here".</p>
      )}
    </div>
  );
}

function Row({ label, km, days, cfg, strong }: { label: string; km: number; days: number; cfg: MapConfig; strong?: boolean }) {
  return (
    <div className={strong ? "font-semibold" : ""}>
      <div className="flex justify-between"><span>{label}</span><span>{formatDays(days)}</span></div>
      <div className="text-xs opacity-70">{formatKm(cfg, km)}</div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value?: string; onChange: (v: string | undefined) => void; options: Location[] }) {
  return (
    <label className="block text-xs">
      <span className="opacity-70">{label}</span>
      <select className="input mt-0.5" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">—</option>
        {options.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
    </label>
  );
}
