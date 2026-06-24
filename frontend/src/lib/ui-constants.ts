/**
 * Shared UI class constants used across the app.
 *
 * Single source of truth for focus ring, tab button base, segmented button
 * base, and heading tier classes. Import from here; never redeclare locally.
 */

/** Focus-visible ring applied to all interactive elements. */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

/**
 * Base classes for tab-style toggle buttons (h-9, rounded-md, semibold text).
 * Callers append active/inactive color classes.
 */
export const TAB_BTN_BASE =
  "relative inline-flex items-center gap-2 h-9 px-4 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

/**
 * Base classes for segmented-control buttons (h-8, xs text).
 * Callers append active/inactive color classes.
 */
export const SEG_BTN_BASE =
  "inline-flex items-center justify-center h-8 px-3 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

/**
 * Panel and section title heading (text-base / text-lg range).
 * Inter 800 + tracking-tight. Use for titles inside cards/panels.
 */
export const PANEL_TITLE = "font-semibold text-ink tracking-tight";

/**
 * Modal h3 title heading (text-xl range).
 * Bold + tracking-tight.
 */
export const MODAL_TITLE = "font-bold text-ink tracking-tight";
