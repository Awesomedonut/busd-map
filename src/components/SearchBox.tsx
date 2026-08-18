import { useMemo, useState } from "react";
import type { Location, Region } from "../lib/types";

interface Props {
  locations: Location[];
  regions: Region[];
  onPick: (target: { x: number; y: number; zoom?: number; locationId?: string }) => void;
}

type Hit = { key: string; label: string; sub: string; x: number; y: number; zoom?: number; locationId?: string };

export function SearchBox({ locations, regions, onPick }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const starts: Hit[] = [], contains: Hit[] = [];
    for (const l of locations) {
      const n = l.name.toLowerCase();
      const hit: Hit = { key: `l:${l.id}`, label: l.name, sub: [l.type, l.region].filter(Boolean).join(" · "), x: l.x, y: l.y, locationId: l.id };
      if (n.startsWith(s)) starts.push(hit); else if (n.includes(s)) contains.push(hit);
    }
    for (const r of regions) {
      const n = r.name.toLowerCase();
      const [x1, y1, x2, y2] = r.bbox;
      const hit: Hit = { key: `r:${r.id}`, label: r.name, sub: "region", x: (x1 + x2) / 2, y: (y1 + y2) / 2, zoom: 3 };
      if (n.startsWith(s)) starts.push(hit); else if (n.includes(s)) contains.push(hit);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [q, locations, regions]);

  const pick = (h: Hit) => { onPick(h); setQ(h.label); setOpen(false); };

  return (
    <div className="relative w-72">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && hits[idx]) pick(hits[idx]);
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search places…"
        className="panel w-full px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
      />
      {open && hits.length > 0 && (
        <ul className="panel absolute mt-1 w-full overflow-hidden py-1 text-sm">
          {hits.map((h, i) => (
            <li
              key={h.key}
              onMouseDown={() => pick(h)}
              onMouseEnter={() => setIdx(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === idx ? "bg-[var(--ink)]/10" : ""}`}
            >
              <div className="font-medium">{h.label}</div>
              <div className="text-xs capitalize opacity-60">{h.sub}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
