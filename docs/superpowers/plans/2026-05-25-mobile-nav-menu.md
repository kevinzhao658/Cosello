# Mobile Nav Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken Radix DropdownMenu hamburger (iOS Safari doesn't fire its open event) with a controlled-state slide-in drawer from the right, built on the existing `ModalShell` primitive.

**Architecture:** Three small, sequential pieces. (1) Extend `ModalShell` with an `align="right"` mode that flex-stretches content full-height pinned to the right edge. (2) Create a new `MobileNavMenu` component owning the drawer body, items, animation, and close handlers. (3) Replace the ~100-line Radix block in `App.tsx` with a smaller hamburger button + `<MobileNavMenu>`, plus a `mobileMenuOpen` state in App.tsx and import cleanup.

**Tech Stack:** React 18 + TypeScript + Tailwind v4 (Brutalist Trade palette tokens — `--canvas`, `--ink`, `--primary`, `--muted`, `--hairline`, `--surface-soft`, `--error`); existing `ModalShell` primitive at `frontend/src/components/ui/ModalShell.tsx`. Vite dev server + `tsc --noEmit` for verification (no FE unit test infrastructure in this repo).

**Branch:** `fix/mobile-nav-menu` (already cut from `dev` at `4a9d8d2` — spec only).

---

## File map

- **Modify:** `frontend/src/components/ui/ModalShell.tsx` — add `"right"` to the `align` union + new switch arm in the `alignment` derivation.
- **Create:** `frontend/src/components/MobileNavMenu.tsx` — the drawer component (props, layout, slide-in animation, dismissal-on-item-tap, conditional auth section).
- **Modify:** `frontend/src/App.tsx` — add `mobileMenuOpen` state, swap the Radix block for the hamburger button + `<MobileNavMenu>`, prune imports.

---

## Task 1: Extend ModalShell with `align="right"`

**Files:**
- Modify: `frontend/src/components/ui/ModalShell.tsx:26` (type union) + `:38-41` (alignment derivation)

- [ ] **Step 1: Update the `align` type union**

In `frontend/src/components/ui/ModalShell.tsx`, find line 26:

```ts
  align?: "center" | "start";
```

Replace with:

```ts
  align?: "center" | "start" | "right";
```

- [ ] **Step 2: Add the `"right"` arm to the alignment switch**

Find the existing `const alignment =` block (lines 38-41 in the current file):

```ts
  const alignment =
    align === "center"
      ? "flex items-center justify-center"
      : "flex items-start justify-center overflow-y-auto";
```

Replace with:

```ts
  const alignment =
    align === "center"
      ? "flex items-center justify-center"
      : align === "start"
        ? "flex items-start justify-center overflow-y-auto"
        : "flex items-stretch justify-end";
```

(The default fall-through covers `"right"` — flex children stretch vertically and pin to the right edge.)

- [ ] **Step 3: Typecheck**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: clean (zero errors).

- [ ] **Step 4: Build**

Run from `frontend/`:

```bash
npm run build
```

Expected: PASS, no warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/ModalShell.tsx
git commit -m "$(cat <<'EOF'
feat(modal): ModalShell supports align="right" for slide-in drawers

Stretches content full-height and pins it to the right edge of the
viewport. Children supply their own width (e.g. w-[min(85vw,360px)])
and the existing backdrop / dismissOnBackdrop / isolation wrapper
behavior is preserved.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create the MobileNavMenu component

**Files:**
- Create: `frontend/src/components/MobileNavMenu.tsx`

This component owns the drawer body. It receives controlled `open`/`onClose` state from App.tsx and renders a right-pinned full-height drawer using `ModalShell align="right"`. The drawer animates in from off-screen-right on open. Close is instant (no exit animation — see spec).

- [ ] **Step 1: Create the file with the complete component**

Create `frontend/src/components/MobileNavMenu.tsx` with this exact content:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: clean. (The component is not yet imported anywhere — Task 3 wires it in — so unused-export warnings shouldn't occur from tsc; verify nothing else breaks.)

- [ ] **Step 3: Build**

Run from `frontend/`:

```bash
npm run build
```

Expected: PASS, no warnings.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/MobileNavMenu.tsx
git commit -m "$(cat <<'EOF'
feat(nav): MobileNavMenu drawer component

Controlled-state slide-in drawer from the right edge. Built on
ModalShell (align="right"). Owns the menu items, slide-in animation,
close handlers, and the conditional auth section. Each item closes
the drawer on tap then fires its navigation/action.

Not yet wired into App.tsx — Task 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Replace the Radix hamburger block in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx:6-12` (delete DropdownMenu imports)
- Modify: `frontend/src/App.tsx` (add `MobileNavMenu` import alongside other component imports)
- Modify: `frontend/src/App.tsx:97` area (add `mobileMenuOpen` state)
- Modify: `frontend/src/App.tsx:1155-1254` (delete Radix block, add new hamburger + `<MobileNavMenu>`)

- [ ] **Step 1: Remove the DropdownMenu import block**

In `frontend/src/App.tsx`, delete lines 6-12 entirely (the multi-line import block):

```tsx
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./components/ui/dropdown-menu";
```

- [ ] **Step 2: Add the MobileNavMenu import**

Find the existing `import { ListingCardSkeleton }` line (around `App.tsx:23`). Add a new import line directly after it:

```tsx
import { MobileNavMenu } from "./components/MobileNavMenu";
```

- [ ] **Step 3: Add `mobileMenuOpen` state next to `page` state**

In `frontend/src/App.tsx`, find the existing block (around line 97):

```tsx
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.replace("#", "");
    const validPages: Page[] = ["home", "market", "terms", "signin", "signup", "account", "help", "mission", "newlisting"];
    return validPages.includes(hash as Page) ? (hash as Page) : "home";
  });
```

Immediately after the closing `});` of that `useState`, add:

```tsx
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
```

- [ ] **Step 4: Replace the Radix DropdownMenu block**

In `frontend/src/App.tsx`, find the existing Radix block. It starts with:

```tsx
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
```

(around line 1155) and ends with:

```tsx
                </DropdownMenuContent>
              </DropdownMenu>
```

(around line 1254 — ~100 lines total).

Delete the entire block and replace it with this shorter version:

```tsx
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open menu"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu className="size-5" />
              </Button>
```

- [ ] **Step 5: Render `<MobileNavMenu>` at the same nav level**

The drawer needs to render OUTSIDE the sticky `<nav>` so its slide-in transform isn't constrained by the nav's stacking context — but it must be inside the top-level App return so it has access to `mobileMenuOpen` state.

Find the closing `</nav>` tag (search for `</nav>` in `App.tsx`). Immediately AFTER that `</nav>`, add:

```tsx
      <MobileNavMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        isAuthenticated={isAuthenticated}
        onNavigate={(target) => setPage(target)}
        onGoToSettings={() => goToAccountTab("settings")}
        onLogout={handleLogout}
      />
```

- [ ] **Step 6: Typecheck**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: clean. If you see errors like "Cannot find name 'DropdownMenu'" — you missed deleting a usage; grep for `DropdownMenu` in App.tsx to find it.

- [ ] **Step 7: Confirm no leftover DropdownMenu references**

Run from the repo root:

```bash
grep -n "DropdownMenu" frontend/src/App.tsx
```

Expected: no output (zero matches). The Radix wrapper file `frontend/src/components/ui/dropdown-menu.tsx` remains for future use — that's expected.

- [ ] **Step 8: Build**

Run from `frontend/`:

```bash
npm run build
```

Expected: PASS, no warnings.

- [ ] **Step 9: Smoke-test on phone**

Start the dev server with LAN binding (from `frontend/`):

```bash
npm run dev -- --host
```

On phone (same Wi-Fi as laptop), open the Network URL Vite prints (e.g. `http://192.168.x.x:5173/`). Walk through:

1. Tap the hamburger icon in the top-right of the nav. **Expected:** drawer slides in from the right (~250ms).
2. Tap "Marketplace". **Expected:** marketplace page loads, drawer closes.
3. Tap the hamburger again. Tap the backdrop (left ~15% of screen). **Expected:** drawer closes without navigating.
4. Tap the hamburger. Tap the X close button. **Expected:** drawer closes.
5. Sign in (if not already). Reopen drawer. **Expected:** auth section visible (Profile, Settings, Help & Support, Log Out).
6. Tap "Settings". **Expected:** MyAccount opens on the Settings tab, drawer closes.
7. Tap "Sell". **Expected:** Sell wizard opens, drawer closes.
8. Tap "Log Out". **Expected:** logged out, drawer closes, hamburger reopens to show "Sign in" item.

On desktop (browser width ≥ 768px), confirm the hamburger button is hidden (`md:hidden`) and the existing desktop nav buttons work as before.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
fix(nav): replace Radix DropdownMenu hamburger with MobileNavMenu drawer

The Radix DropdownMenu's open event never fires on iOS Safari taps,
leaving mobile users without nav access (no way to reach Marketplace,
Communities, Sell, My account, Profile, Settings, Help, Log Out).

Swaps in a controlled-state slide-in drawer. Same menu items + the
same handlers (setPage, goToAccountTab, handleLogout). State
(mobileMenuOpen) lives in App.tsx. Drawer renders outside <nav> so
its slide-in transform isn't trapped by the nav's stacking context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

After all three commits land:

- [ ] **Full typecheck + build**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Expected: both clean.

- [ ] **Grep audit — confirm no leftover DropdownMenu usage in App.tsx**

```bash
grep -n "DropdownMenu" frontend/src/App.tsx
```

Expected: zero matches.

- [ ] **Confirm the dropdown-menu wrapper file is unchanged**

```bash
git diff main..HEAD -- frontend/src/components/ui/dropdown-menu.tsx
```

Expected: empty diff. (The Radix wrapper file is kept for future use; only the App.tsx consumer is replaced.)

- [ ] **Push + open PR**

```bash
git push -u origin fix/mobile-nav-menu
gh pr create --base dev --head fix/mobile-nav-menu \
  --title "fix(nav): replace Radix DropdownMenu hamburger with MobileNavMenu drawer" \
  --body "$(cat <<'EOF'
## Summary

The mobile hamburger nav (Radix DropdownMenu, App.tsx:1155) doesn't open on iOS Safari — Radix's internal state never transitions \`closed → open\` on tap. Mobile users have **no way** to reach Marketplace, Communities, Sell, My account, Profile, Settings, Help, or Log Out. Pre-existing bug, surfaced during PR #15 smoke testing.

Replaces the broken Radix block with a controlled-state slide-in drawer from the right edge, built on the existing \`ModalShell\` primitive (extended with an \`align="right"\` mode).

Spec: \`docs/superpowers/specs/2026-05-25-mobile-nav-menu-design.md\`
Plan: \`docs/superpowers/plans/2026-05-25-mobile-nav-menu.md\`

## What's in this PR

- **\`ModalShell\` extension:** new \`align="right"\` mode that flex-stretches content full-height pinned to the right edge.
- **New \`MobileNavMenu\` component:** controlled drawer with slide-in animation, same menu items + handlers as the old dropdown, large \`min-h-[56px]\` thumb-tap targets, conditional auth section, Brutalist Trade palette.
- **\`App.tsx\` swap:** Radix DropdownMenu block (~100 lines) replaced with a smaller hamburger button + \`<MobileNavMenu>\`. Adds \`mobileMenuOpen\` state. Drops 5 \`DropdownMenu*\` imports.

## Behavior

- Tap hamburger → drawer slides in from right over 250ms.
- Tap any item → navigation/action fires AND drawer closes.
- Tap backdrop → drawer closes.
- Tap X close button → drawer closes.
- Close is instant (no exit animation).

## Out of scope

- Removing the unused \`frontend/src/components/ui/dropdown-menu.tsx\` wrapper file. Kept for future use.
- Body scroll lock when drawer is open. Drawer covers most of the viewport anyway; revisit if QA flags it.
- Desktop nav changes. Untouched (\`md:hidden\` keeps the hamburger phone-only).

## Test plan

- [x] Frontend \`npx tsc --noEmit\` clean
- [x] Frontend \`npm run build\` clean
- [ ] Manual smoke (phone): hamburger taps open the drawer (the original bug)
- [ ] Manual smoke (phone): each menu item navigates and closes the drawer
- [ ] Manual smoke (phone): backdrop tap closes the drawer
- [ ] Manual smoke (desktop ≥ md): hamburger is hidden; desktop nav unaffected
- [ ] Manual smoke (auth): logged-in state shows Profile/Settings/Help/Logout; logged-out shows Sign in

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

PR is ready for review.
