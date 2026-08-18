export interface UrlState {
  x?: number;
  y?: number;
  z?: number;
  from?: string;
  to?: string;
  mode?: string;
}

export function readUrl(): UrlState {
  const p = new URLSearchParams(location.search);
  const num = (k: string) => (p.has(k) ? Number(p.get(k)) : undefined);
  return {
    x: num("x"), y: num("y"), z: num("z"),
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    mode: p.get("mode") ?? undefined,
  };
}

let timer: number | undefined;
export function writeUrl(s: UrlState) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const p = new URLSearchParams();
    if (s.x !== undefined) p.set("x", String(Math.round(s.x)));
    if (s.y !== undefined) p.set("y", String(Math.round(s.y)));
    if (s.z !== undefined) p.set("z", s.z.toFixed(2));
    if (s.from) p.set("from", s.from);
    if (s.to) p.set("to", s.to);
    if (s.mode) p.set("mode", s.mode);
    history.replaceState(null, "", `?${p.toString()}`);
  }, 150);
}
