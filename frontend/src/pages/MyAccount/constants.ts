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
