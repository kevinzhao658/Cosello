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

const CHIP_BASE =
  "h-8 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export function getChipClass(active: boolean): string {
  return active
    ? `${CHIP_BASE} bg-primary text-on-primary`
    : `${CHIP_BASE} bg-surface-soft text-body border border-hairline hover:border-border-strong hover:text-ink`;
}
