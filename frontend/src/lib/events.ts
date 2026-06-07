/**
 * Behavioral event capture for the FYP ranking signal.
 *
 * Auth-gated: silently no-ops if the user isn't signed in. Network failures
 * are swallowed — analytics must never throw or break UX.
 *
 * `logView` may fire during tab-close / unmount, so it sets `keepalive: true`
 * which lets the request survive page teardown while still attaching the
 * standard Authorization header (sendBeacon can't set headers, so we don't
 * use it).
 */

export type ViewSource = "feed" | "search" | "profile" | "direct";

interface ViewPayload {
  listing_id: string;
  source: ViewSource;
  dwell_ms: number;
}

interface SearchPayload {
  query: string;
  filters?: Record<string, unknown>;
}

function getAuthToken(): string | null {
  try {
    return localStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

function post(url: string, body: object, token: string, keepalive = false): void {
  try {
    void fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      keepalive,
    }).catch(() => {
      // swallow — analytics must not surface errors
    });
  } catch {
    // swallow
  }
}

export function logView(payload: ViewPayload): void {
  const token = getAuthToken();
  if (!token) return;
  post("/api/events/view", payload, token, true);
}

export function logSearch(payload: SearchPayload): void {
  const token = getAuthToken();
  if (!token) return;
  const body: SearchPayload =
    payload.filters && Object.keys(payload.filters).length > 0
      ? payload
      : { query: payload.query };
  post("/api/events/search", body, token);
}

