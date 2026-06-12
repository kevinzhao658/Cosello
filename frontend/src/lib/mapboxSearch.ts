import { NYC_ZIP_SET } from "./nycZips";

export interface AddressSuggestion {
  label: string; // full_address from v6 properties
  lat: number;
  lng: number;
  zip: string; // always one of the 42 seeded ZIPs
}

// --- Mapbox Geocoding v6 response types ---

interface MapboxV6Context {
  postcode?: { name: string };
  place?: { name: string };
  [key: string]: { name: string } | undefined;
}

interface MapboxV6Properties {
  full_address: string;
  name: string;
  context?: MapboxV6Context;
}

interface MapboxV6Feature {
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  properties: MapboxV6Properties;
}

interface MapboxV6Response {
  features: MapboxV6Feature[];
}

// -----------------------------------------

const NYC_BBOX = "-74.03,40.68,-73.90,40.88"; // Manhattan-ish bounds
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export function hasMapboxToken(): boolean {
  return typeof TOKEN === "string" && TOKEN.length > 0;
}

/** Forward-geocode partial input. Only suggestions whose postcode is in our 42
 *  seeded Manhattan ZIPs are returned — selecting one is inherently valid. */
export async function searchAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (!TOKEN || q.length < 3) return [];
  const url =
    `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}` +
    `&access_token=${TOKEN}&autocomplete=true&bbox=${NYC_BBOX}&types=address,postcode&limit=5`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  const data: MapboxV6Response = await res.json();
  const out: AddressSuggestion[] = [];
  for (const f of data.features ?? []) {
    const zip = f.properties.context?.postcode?.name;
    if (zip && NYC_ZIP_SET.has(zip)) {
      out.push({
        label: f.properties.full_address,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        zip,
      });
    }
  }
  return out;
}

/** Reverse-geocode a point to its nearest street address. Returns null when
 *  no token is configured, nothing resolves, or the request fails. The zip
 *  may be outside the 42 seeded ZIPs (the server enforces Manhattan-only at
 *  post time); callers display the label as-is. */
export async function reverseGeocodeAddress(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<AddressSuggestion | null> {
  if (!TOKEN) return null;
  const url =
    `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}` +
    `&access_token=${TOKEN}&types=address&limit=1`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data: MapboxV6Response = await res.json();
  const f = data.features?.[0];
  if (!f) return null;
  const zip = f.properties.context?.postcode?.name ?? "";
  return {
    label: f.properties.full_address,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    zip,
  };
}
