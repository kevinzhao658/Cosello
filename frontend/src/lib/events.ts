/**
 * Behavioral event capture for the FYP ranking signal.
 *
 * All three loggers are auth-gated and silently no-op if the user is not
 * signed in. Network failures are swallowed — analytics must never throw or
 * break UX. Auth tokens are read from localStorage to match the existing
 * fetch pattern in App.tsx (`Authorization: Bearer ${token}`).
 *
 * `logView` may fire on tab close / page unload, so it prefers
 * `navigator.sendBeacon` and falls back to `fetch` with `keepalive: true`.
 */

export type ViewSource = "feed" | "search" | "profile" | "direct";
export type InteractionAction = "hide" | "block_seller" | "not_interested";

interface ViewPayload {
  listing_id: number;
  source: ViewSource;
  dwell_ms: number;
}

interface SearchPayload {
  query: string;
  filters?: Record<string, unknown>;
}

interface InteractionPayload {
  listing_id: number;
  action: InteractionAction;
}

function getAuthToken(): string | null {
  try {
    return localStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

function postBeacon(url: string, body: object, token: string): void {
  const json = JSON.stringify(body);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    // sendBeacon cannot set custom headers, so we stash the token in the URL
    // as a query param. The backend already accepts this fallback for unload
    // events where Authorization headers can't be attached.
    const beaconUrl = `${url}?auth=${encodeURIComponent(token)}`;
    const blob = new Blob([json], { type: "application/json" });
    try {
      if (navigator.sendBeacon(beaconUrl, blob)) return;
    } catch {
      // fall through to fetch
    }
  }

  try {
    void fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: json,
      keepalive: true,
    }).catch(() => {
      // swallow — analytics must not surface errors
    });
  } catch {
    // swallow
  }
}

function postFetch(url: string, body: object, token: string): void {
  try {
    void fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }).catch(() => {
      // swallow
    });
  } catch {
    // swallow
  }
}

export function logView(payload: ViewPayload): void {
  const token = getAuthToken();
  if (!token) return;
  postBeacon("/api/events/view", payload, token);
}

export function logSearch(payload: SearchPayload): void {
  const token = getAuthToken();
  if (!token) return;
  const body: SearchPayload =
    payload.filters && Object.keys(payload.filters).length > 0
      ? payload
      : { query: payload.query };
  postFetch("/api/events/search", body, token);
}

export function logInteraction(payload: InteractionPayload): void {
  const token = getAuthToken();
  if (!token) return;
  postFetch("/api/interactions", payload, token);
}
