import { supabase } from "./supabase";

// Shared fetch wrapper. Reads the bearer token from Supabase directly on each
// call, which avoids a race where a module-level token registry lags React's
// render cycle. supabase.auth.getSession() is memoized internally, so the cost
// is negligible after the first call.

function hasAuthHeader(init?: RequestInit): boolean {
  const headers = init?.headers;
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has("Authorization");
  if (Array.isArray(headers)) return headers.some(([k]) => k.toLowerCase() === "authorization");
  return Object.keys(headers).some((k) => k.toLowerCase() === "authorization");
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!hasAuthHeader(init)) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  return fetch(input, { ...init, headers });
}
