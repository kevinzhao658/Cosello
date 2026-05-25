import { useEffect, useState } from "react";
import { Menu as MenuIcon, X, User, Settings, HelpCircle, LogOut, ArrowRight } from "lucide-react";
import { ModalShell } from "./ui/ModalShell";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Each menu row is a full-width button with comfortable thumb-tap height.
const ROW_BASE =
  "w-full flex items-center justify-between gap-3 px-5 min-h-[56px] text-left text-base font-semibold border-b border-hairline-soft active:bg-surface-soft transition-colors";

export type MobileNavTarget =
  | "home"
  | "market"
  | "account"
  | "signin"
  | "newlisting"
  | "help";

export interface MobileNavMenuProps {
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  onNavigate: (target: MobileNavTarget) => void;
  onGoToSettings: () => void;
  onLogout: () => void | Promise<void>;
}

export function MobileNavMenu({
  open,
  onClose,
  isAuthenticated,
  onNavigate,
  onGoToSettings,
  onLogout,
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
    // One rAF tick so the initial translate-x-full paints before transitioning.
    const id = requestAnimationFrame(() => setSlidIn(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Helper: every item closes the drawer immediately, then fires its action.
  const navAndClose = (target: MobileNavTarget) => {
    onClose();
    onNavigate(target);
  };

  return (
    <ModalShell open={open} onClose={onClose} align="right" z={70}>
      <div
        className={`h-full w-[min(85vw,360px)] bg-canvas border-l border-ink flex flex-col shadow-overlay transition-transform duration-[250ms] ease-out ${
          slidIn ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header strip with close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted">
            <MenuIcon className="size-3.5 inline mr-1.5 -mt-0.5" aria-hidden />
            Menu
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className={`size-9 rounded-md flex items-center justify-center text-ink hover:bg-surface-soft ${FOCUS_RING}`}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Primary items */}
        <nav className="flex-1 overflow-y-auto">
          <button
            type="button"
            onClick={() => navAndClose("home")}
            className={`${ROW_BASE} text-ink ${FOCUS_RING}`}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => navAndClose("market")}
            className={`${ROW_BASE} text-ink ${FOCUS_RING}`}
          >
            Marketplace
          </button>
          {/* Communities — coming soon (disabled visual; no-op click) */}
          <div
            aria-disabled="true"
            className={`${ROW_BASE} text-muted opacity-60 cursor-not-allowed`}
          >
            <span>Communities</span>
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
            My account
          </button>

          {/* Sell — primary accent */}
          <button
            type="button"
            onClick={() => navAndClose("newlisting")}
            className={`${ROW_BASE} text-primary ${FOCUS_RING}`}
          >
            <span>Sell</span>
            <ArrowRight className="size-4 text-primary" aria-hidden />
          </button>

          {/* Auth section — bottom-aligned via flex-1 spacer above */}
          {isAuthenticated ? (
            <>
              <div className="h-3" />
              <button
                type="button"
                onClick={() => navAndClose("account")}
                className={`${ROW_BASE} text-ink ${FOCUS_RING}`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <User className="size-4" aria-hidden />
                  Profile
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoToSettings();
                }}
                className={`${ROW_BASE} text-ink ${FOCUS_RING}`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <Settings className="size-4" aria-hidden />
                  Settings
                </span>
              </button>
              <button
                type="button"
                onClick={() => navAndClose("help")}
                className={`${ROW_BASE} text-ink ${FOCUS_RING}`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <HelpCircle className="size-4" aria-hidden />
                  Help & Support
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void onLogout();
                }}
                className={`${ROW_BASE} text-error ${FOCUS_RING}`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <LogOut className="size-4" aria-hidden />
                  Log Out
                </span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => navAndClose("signin")}
              className={`${ROW_BASE} text-ink ${FOCUS_RING}`}
            >
              Sign in
            </button>
          )}
        </nav>
      </div>
    </ModalShell>
  );
}
