import type { Location, Road, RoadKind } from "./types";

export interface RouteLeg {
  from: string;
  to: string;
  kind: RoadKind;
  km: number;
  waypoints: [number, number][];
}

export interface Route {
  km: number;
  legs: RouteLeg[];
  points: [number, number][];
}

interface Graph {
  adj: Map<string, { to: string; road: Road; reversed: boolean }[]>;
}

export function buildGraph(roads: Road[]): Graph {
  const adj: Graph["adj"] = new Map();
  const push = (a: string, b: string, road: Road, reversed: boolean) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push({ to: b, road, reversed });
  };
  for (const r of roads) {
    push(r.from, r.to, r, false);
    push(r.to, r.from, r, true);
  }
  return { adj };
}

/** Dijkstra over the road graph. Returns null when disconnected. */
export function shortestRoute(graph: Graph, from: string, to: string, allowSea = true): Route | null {
  if (from === to) return { km: 0, legs: [], points: [] };
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { node: string; road: Road; reversed: boolean }>();
  const done = new Set<string>();
  const queue: string[] = [from];
  while (queue.length) {
    queue.sort((a, b) => dist.get(a)! - dist.get(b)!);
    const u = queue.shift()!;
    if (u === to) break;
    if (done.has(u)) continue;
    done.add(u);
    for (const e of graph.adj.get(u) ?? []) {
      if (!allowSea && e.road.kind === "sea") continue;
      const nd = dist.get(u)! + e.road.km;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { node: u, road: e.road, reversed: e.reversed });
        queue.push(e.to);
      }
    }
  }
  if (!dist.has(to)) return null;
  const legs: RouteLeg[] = [];
  let cur = to;
  while (cur !== from) {
    const p = prev.get(cur)!;
    const wp = p.reversed ? [...p.road.waypoints].reverse() : p.road.waypoints;
    legs.unshift({ from: p.node, to: cur, kind: p.road.kind, km: p.road.km, waypoints: wp });
    cur = p.node;
  }
  const points = legs.flatMap((l, i) => (i === 0 ? l.waypoints : l.waypoints.slice(1)));
  return { km: dist.get(to)!, legs, points };
}

export const locById = (locs: Location[]) => new Map(locs.map((l) => [l.id, l]));
