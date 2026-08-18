import type { WorldData } from "./types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function get<T>(name: string): Promise<T> {
  const res = await fetch(`${BASE}/data/${name}.json`);
  if (!res.ok) throw new Error(`failed to load ${name}.json (${res.status})`);
  return res.json() as Promise<T>;
}

export async function loadWorld(): Promise<WorldData> {
  const [config, locations, roads, regions] = await Promise.all([
    get<WorldData["config"]>("map"),
    get<WorldData["locations"]>("locations"),
    get<WorldData["roads"]>("roads"),
    get<WorldData["regions"]>("regions"),
  ]);
  return { config, locations, roads, regions };
}

export const tileUrl = () => `${BASE}/map/tiles/{z}/{x}/{y}.webp`;
