import { useEffect, useState } from "react";
import { Home, ShoppingBag, Users, User } from "lucide-react";
import { ModalShell } from "./ui/ModalShell";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Each menu row is a full-width button with comfortable thumb-tap height.
const ROW_BASE =
  "w-full flex items-center justify-between gap-3 px-5 min-h-[56px] text-left text-base font-semibold border-b border-hairline-soft active:bg-surface-soft transition-colors";

// Top offset matches the sticky nav's h-16 (64px). The drawer sits BELOW the
// nav so the hamburger ↔ X morph and the user avatar stay visible while the
// menu is open — visually the nav extends into the drawer.
const NAV_HEIGHT = 64;

export type MobileNavTarget = "home" | "market" | "account" | "signin";

export interface MobileNavMenuProps {
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  onNavigate: (target: MobileNavTarget) => void;
}

export function MobileNavMenu({
  open,
  onClose,
  isAuthenticated,
  onNavigate,
}: MobileNavMenuProps) {
  // Slide-in animation: mount drawer at translate-x-full (off-screen right),
  // then on the next frame transition to translate-x-0. Close is instant
  // (unmount via the parent's `open` flag).
  const [slidIn, setSlidIn] = useState(false);
  useEffect(() => {
    if (!open) {
      setSlidIn(false);
      return;
    }
    const id = requestAnimationFrame(() => setSlidIn(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Helper: every item closes the drawer immediately, then fires its action.
  const navAndClose = (target: MobileNavTarget) => {
    onClose();
    onNavigate(target);
  };

  return (
    <ModalShell open={open} onClose={onClose} align="right" z={60} topOffset={NAV_HEIGHT}>
      <div
        className={`h-full w-[min(85vw,360px)] bg-canvas flex flex-col shadow-overlay transition-transform duration-[250ms] ease-out ${
          slidIn ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <nav className="flex-1 overflow-y-auto">
          <button
            type="button"
            onClick={() => navAndClose("home")}
            className={`${ROW_BASE} text-ink ${FOCUS_RING}`}
          >
            <span className="inline-flex items-center gap-3">
              <Home className="size-[18px]" aria-hidden />
              Home
            </span>
          </button>
          <button
            type="button"
            onClick={() => navAndClose("market")}
            className={`${ROW_BASE} text-ink ${FOCUS_RING}`}
          >
            <span className="inline-flex items-center gap-3">
              <ShoppingBag className="size-[18px]" aria-hidden />
              Marketplace
            </span>
          </button>
          <div
            aria-disabled="true"
            className={`${ROW_BASE} text-muted opacity-60 cursor-not-allowed`}
          >
            <span className="inline-flex items-center gap-3">
              <Users className="size-[18px]" aria-hidden />
              Communities
            </span>
            <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted-soft border border-hairline rounded-full px-2 py-0.5">
              Coming soon
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              navAndClose(isAuthenticated ? "account" : "signin")
            }
            className={`${ROW_BASE} text-ink ${FOCUS_RING}`}
          >
            <span className="inline-flex items-center gap-3">
              <User className="size-[18px]" aria-hidden />
              My account
            </span>
          </button>
        </nav>
      </div>
    </ModalShell>
  );
}
