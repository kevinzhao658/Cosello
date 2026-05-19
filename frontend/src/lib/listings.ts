export const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"] as const;
export type Condition = typeof CONDITIONS[number];

// Placeholder community shown in the trust band when a listing has no
// associated community. The sell flow doesn't yet have a community selector
// (tracked in backlog.md). Remove this once the selector ships and existing
// listings have been backfilled.
export const PLACEHOLDER_COMMUNITY = {
  id: "__placeholder__",
  name: "Cosello",
} as const;
