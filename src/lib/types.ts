export type LocationType = "capital" | "metropolis" | "city" | "town" | "landmark";

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  x: number; // pixel coords on the full-res map image
  y: number;
  population?: number;
  region?: string;
  description?: string;
}

export type RoadKind = "road" | "sea" | "trail";

export interface Road {
  from: string;
  to: string;
  kind: RoadKind;
  km: number;
  waypoints: [number, number][];
}

export interface Region {
  id: string;
  name: string;
  x: number;
  y: number;
  bbox: [number, number, number, number];
  label: boolean;
}

export interface TravelMode {
  id: string;
  label: string;
  kmPerDay: number;
}

export interface MapConfig {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  maxZoom: number;
  kmPerPixel: number;
  unit: { name: string; plural: string; kmPerUnit: number };
  travelModes: TravelMode[];
}

export interface WorldData {
  config: MapConfig;
  locations: Location[];
  roads: Road[];
  regions: Region[];
}
