/**
 * Shared save path for all "set user location" flows.
 *
 * This is the single source of truth for the derive-neighborhood → PUT
 * /api/auth/profile sequence. Both the Change-location modal
 * (useChangeLocation hook) and the hero-search location-suggestion row
 * (App.tsx setUserLocation) delegate here so the logic cannot drift.
 */
import { apiFetch } from "./api";
import { ZIP_NEIGHBORHOOD } from "./nycZips";
import type { AuthUser } from "../contexts/AuthContext";

/**
 * Derives the canonical Manhattan neighborhood from `zip`, then PUTs
 * `{ neighborhood, zip_code }` to `/api/auth/profile`.
 *
 * Throws with a human-readable message on:
 * - unknown ZIP (no neighborhood mapping)
 * - non-2xx response from the server
 *
 * @returns The updated `AuthUser` returned by the server.
 */
export async function setLocationOnProfile(zip: string): Promise<AuthUser> {
  const z = zip.trim();
  const neighborhood = ZIP_NEIGHBORHOOD[z];
  if (!neighborhood) {
    throw new Error("Select a ZIP code");
  }

  const res = await apiFetch("/api/auth/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ neighborhood, zip_code: z }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Update failed" }));
    throw new Error((data as { detail?: string }).detail ?? "Update failed");
  }

  return res.json() as Promise<AuthUser>;
}
