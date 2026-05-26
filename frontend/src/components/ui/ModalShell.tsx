import type { ReactNode, CSSProperties } from "react";

// Centered modal shell — owns the backdrop + outer wrapper but NOT the inner
// frame. Children supply their own panel element (bg color, padding,
// max-width, etc.) so per-modal styling stays exactly as the call site
// wrote it. The backdrop click closes via onClose unless dismissOnBackdrop
// is set to false.
//
// Z-index convention used across the app (avoid drifting from these):
//   z=50  — most form/confirm modals
//   z=200 — listing detail
//   z=250 — buy confirmation
//   z=260 — edit listing
//   z=299 — notifications side-panel backdrop (in App.tsx)
//   z=300 — UserProfile overlay
// Default below is z=50 to match the dominant case in MyAccountPage.
type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  z?: number;
  dismissOnBackdrop?: boolean;
  // When `align="start"`, the modal pins to the top of the viewport with
  // overflow-y-auto on the outer container — used for very tall content
  // (e.g. UserProfile overlay) that needs to scroll past the viewport.
  align?: "center" | "start" | "right";
  // CSS top offset in px. When set, the outer container (incl. the backdrop)
  // starts below the viewport top. Useful for letting a sticky nav stay
  // visible above the modal/drawer — e.g. MobileNavMenu passes 64 so the
  // backdrop doesn't cover the app's nav bar.
  topOffset?: number;
};

export function ModalShell({
  open,
  onClose,
  children,
  z = 50,
  dismissOnBackdrop = true,
  align = "center",
  topOffset,
}: ModalShellProps) {
  if (!open) return null;
  const alignment =
    align === "center"
      ? "flex items-center justify-center"
      : align === "start"
        ? "flex items-start justify-center overflow-y-auto"
        : "flex items-stretch justify-end";
  // Default: full viewport. When topOffset is set, leave the area above it
  // (the sticky nav) untouched.
  const positioning = topOffset != null ? "fixed inset-x-0 bottom-0" : "fixed inset-0";
  const style: CSSProperties = { zIndex: z };
  if (topOffset != null) style.top = topOffset;
  return (
    <div className={`${positioning} ${alignment}`} style={style}>
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={dismissOnBackdrop ? onClose : undefined}
      />
      {/* `relative isolate` forces the panel into its own stacking context +
          compositing layer so iOS Safari doesn't rasterize it through the
          sibling backdrop's backdrop-filter blur. */}
      <div className="relative isolate">{children}</div>
    </div>
  );
}
