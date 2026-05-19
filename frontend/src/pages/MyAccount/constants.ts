// Shared UI atoms for MyAccount surfaces. Single source of truth for
// the focus-visible ring and the segmented-button base classes so the
// pages/MyAccount/MyAccountPage shell and the 9 extracted modals all
// share the same focus + segmented styling.

export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export const TAB_BTN_BASE =
  "relative inline-flex items-center gap-2 h-9 px-4 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export const SEG_BTN_BASE =
  "inline-flex items-center justify-center h-8 px-3 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Sub-display heading tiers. Inter 800 + tracking-display's -1.5px letter
// spacing crowds glyphs at body sizes, so `tracking-display` is reserved
// for the genuinely display-tier (text-3xl and up) headings only.
//
// PANEL_TITLE: `text-base`/`text-lg` panel + section titles inside cards.
// MODAL_TITLE: `text-xl` modal h3 titles.
export const PANEL_TITLE = "font-semibold text-ink tracking-tight";
export const MODAL_TITLE = "font-bold text-ink tracking-tight";
