import type { ReactNode } from "react";

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
  align?: "center" | "start";
};

export function ModalShell({
  open,
  onClose,
  children,
  z = 50,
  dismissOnBackdrop = true,
  align = "center",
}: ModalShellProps) {
  if (!open) return null;
  const alignment =
    align === "center"
      ? "flex items-center justify-center"
      : "flex items-start justify-center overflow-y-auto";
  return (
    <div className={`fixed inset-0 ${alignment}`} style={{ zIndex: z }}>
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={dismissOnBackdrop ? onClose : undefined}
      />
      {children}
    </div>
  );
}
