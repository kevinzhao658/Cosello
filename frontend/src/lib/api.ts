// Shared fetch wrapper. The token is registered from AuthContext via
// `setApiToken` whenever the auth state changes, so call sites do not have to
// thread `token` through every request manually.
//
// Behavior:
//   - Auto-injects `Authorization: Bearer <token>` when a token is registered
//     (and the caller did not already set one).
//   - Returns the raw Response so call sites can check `res.ok` themselves
//     and parse the body however they need (text, json, blob, etc.).

let currentToken: string | null = null;

export function setApiToken(token: string | null) {
  currentToken = token;
}

function hasAuthHeader(init?: RequestInit): boolean {
  const headers = init?.headers;
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has("Authorization");
  if (Array.isArray(headers)) return headers.some(([k]) => k.toLowerCase() === "authorization");
  return Object.keys(headers).some((k) => k.toLowerCase() === "authorization");
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (currentToken && !hasAuthHeader(init)) {
    headers.set("Authorization", `Bearer ${currentToken}`);
  }
  return fetch(input, { ...init, headers });
}
