import { NYC_ZIP_SET } from "./nycZips";

export interface AddressSuggestion {
  label: string; // full place_name
  lat: number;
  lng: number;
  zip: string; // always one of the 42 seeded ZIPs
}

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
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?access_token=${TOKEN}&autocomplete=true&bbox=${NYC_BBOX}&types=address,postcode&limit=5`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  const data: {
    features: {
      place_name: string;
      center: [number, number];
      context?: { id: string; text: string }[];
      text?: string;
    }[];
  } = await res.json();
  const out: AddressSuggestion[] = [];
  for (const f of data.features ?? []) {
    const zip =
      f.context?.find((c) => c.id.startsWith("postcode"))?.text ??
      (/^\d{5}$/.test(f.text ?? "") ? (f.text as string) : undefined);
    if (zip && NYC_ZIP_SET.has(zip)) {
      out.push({ label: f.place_name, lat: f.center[1], lng: f.center[0], zip });
    }
  }
  return out;
}
