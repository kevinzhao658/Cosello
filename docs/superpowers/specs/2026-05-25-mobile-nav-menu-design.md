# Mobile Nav Menu Fix — Design

**Date:** 2026-05-25
**Bug context:** The mobile hamburger nav (`App.tsx:1155`, `md:hidden` trigger) doesn't open on iOS Safari. Tapping the hamburger button produces no visible response — Radix `DropdownMenu`'s internal state doesn't transition `closed → open`. Pre-existing bug, not introduced by any recent PR. Mobile users have **no way** to reach Marketplace, Communities, Sell, My Account, Profile, Settings, Help, or Log Out — high-impact.

## Goal

Replace the broken Radix `DropdownMenu` mobile hamburger with a controlled-state custom drawer that slides in from the right edge of the screen. Preserves all current menu items + handlers; bypasses the iOS Safari Radix bug entirely; gives the menu a native iOS sheet/drawer feel instead of an awkward 224px-wide dropdown.

## Motivation

A dropdown is the wrong pattern for a hamburger on mobile. Native iOS apps and modern mobile-first sites use sheets or slide-in drawers. Switching pattern + going controlled-state solves the bug AND improves the UX in one move. Desktop nav is unaffected (it uses inline buttons; the dropdown was `md:hidden` only).

## Scope

**In scope:**
- New `MobileNavMenu` component (controlled `open`/`onClose`, slide-in drawer from right).
- Extend `ModalShell` with an `align="right"` mode that stretches content full-height pinned to the right edge.
- Replace the `<DropdownMenu>` block in `App.tsx:1155-1254` with a hamburger button + `<MobileNavMenu>`. State (`mobileMenuOpen`) lives in `App.tsx`.
- Same menu items + handlers as today (Home, Marketplace, Communities-coming-soon, My account, [separator], Sell, [separator], conditional auth section).

**Out of scope:**
- Removing the Radix `ui/dropdown-menu.tsx` wrapper file. Keeping it for future use; no live consumers after this PR but no harm leaving it.
- Reworking the desktop nav. Unaffected.
- Sheet/Drawer primitive abstraction. The drawer pattern lives inside `MobileNavMenu` for now; if a second consumer needs it later, extract then.

## Architecture

The menu is a controlled React component with state in the parent (`App.tsx`):

```ts
const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
```

The hamburger button toggles `mobileMenuOpen`. `<MobileNavMenu>` receives `open`, `onClose`, `isAuthenticated`, and the same navigation/logout handlers the dropdown items used. Internally it renders `<ModalShell align="right" open={open} onClose={onClose}>` with a flex-column body of menu items.

Why ModalShell:
- Already exists, owns the backdrop + dismissal-on-backdrop-click logic.
- Already battle-tested (used by EditProfileModal, NeighborhoodChangeConfirm modal, all MyAccount modals).
- The iOS `backdrop-filter` blur fix (`relative isolate` wrapper) we just added in PR #15 applies here too — the drawer content won't bleed through the backdrop's blur.

The new `align="right"` mode extends ModalShell to support right-edge-pinned full-height content. ~3 lines of code (one new switch arm).

## ModalShell extension

**File:** `frontend/src/components/ui/ModalShell.tsx`

Update the `align` prop type and the `alignment` derivation:

```tsx
align?: "center" | "start" | "right";
// ...
const alignment =
  align === "center" ? "flex items-center justify-center"
  : align === "start" ? "flex items-start justify-center overflow-y-auto"
  : align === "right" ? "flex items-stretch justify-end"  // NEW
  : "flex items-center justify-center";
```

That's it. Children supply their own width + height (e.g. `h-full w-[min(85vw,360px)] bg-canvas`).

## MobileNavMenu component

**File:** `frontend/src/components/MobileNavMenu.tsx` (new)

Props:

```ts
interface MobileNavMenuProps {
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  onNavigate: (page: Page) => void;
  onGoToAccountTab: (tab: "overview" | "listings" | "saved" | "settings") => void;
  onLogout: () => void | Promise<void>;
}
```

Layout:
- Drawer body: `h-full w-[min(85vw,360px)] bg-canvas border-l border-hairline flex flex-col`.
- Top: a small header strip with a close button (X icon, top-right). ~48px tall.
- Body: vertical stack of menu items. Each item is a full-width `<button>` with `min-h-[56px]` for comfortable thumb-tap. Subtle `border-b border-hairline-soft` between items. Bottom-aligned auth section (separator above).

Item visual:
- Inactive: `text-ink bg-canvas hover:bg-surface-soft`.
- Sell (highlighted primary): `text-primary font-semibold`.
- Disabled (Communities-coming-soon): `text-muted opacity-50 cursor-not-allowed`, with "Coming soon" pill on the right (replace the desktop Radix Tooltip — tooltips don't make sense on touch).
- Log Out: `text-error`.

Item interaction: each handler closes the drawer (`onClose()`) immediately AND triggers its navigation/action. Use the existing `Page` type from App.tsx.

Animation: drawer slides in from right via Tailwind's `transition-transform` + a small mount effect. When `open === true`, the drawer is at `translate-x-0`; on initial mount we delay one frame then transition from `translate-x-full`. Close is instant (the user got what they wanted; no animation tax).

## Replacement in App.tsx

**File:** `frontend/src/App.tsx`

Delete the `<DropdownMenu>...</DropdownMenu>` block (lines 1155-1254 — ~100 lines). Replace with a much smaller hamburger button + `<MobileNavMenu>`:

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

<MobileNavMenu
  open={mobileMenuOpen}
  onClose={() => setMobileMenuOpen(false)}
  isAuthenticated={isAuthenticated}
  onNavigate={(p) => setPage(p)}
  onGoToAccountTab={goToAccountTab}
  onLogout={handleLogout}
/>
```

Also add `const [mobileMenuOpen, setMobileMenuOpen] = useState(false);` near the other navigation state at `App.tsx:97`.

Imports to remove from App.tsx: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`. (Keep `Menu` icon — still used by the hamburger. Keep `Tooltip` — still used at `App.tsx:998` for the desktop "Communities — Coming soon" indicator.)

## Visual design (Brutalist Trade)

Drawer body: stark white `bg-canvas` with a 1px black border on the left edge (`border-l border-ink`) — matches the brutalist aesthetic. Backdrop: existing `bg-ink/40 backdrop-blur-sm` from ModalShell.

Menu items: bold sans-serif, left-aligned, generous padding (`px-5 py-4`). Active state via `active:bg-surface-soft` for tactile feedback. The "Sell" item gets a subtle visual lift: `text-primary font-bold` + a small primary chevron on the right (Lucide `ArrowRight` size-4).

Close button: top-right X icon button, `size-9 rounded-md hover:bg-surface-soft`.

Eyebrow above the menu items: `text-[10px] font-bold tracking-[0.18em] uppercase text-muted` saying "MENU" — anchors the visual hierarchy. ~8px below the close button.

## Interaction

- **Open:** tap hamburger → `setMobileMenuOpen(true)` → drawer slides in from right (250ms ease-out).
- **Close paths:**
  1. Tap the close X button.
  2. Tap the backdrop (left ~15% of screen).
  3. Tap any menu item (action fires AND drawer closes).
  4. Hardware back gesture? Out of scope — browser back navigation will work normally; the menu isn't part of history.
- **Body scroll lock when open:** ModalShell doesn't lock body scroll today. For a full-height drawer this matters less (the drawer covers most of the viewport), but worth adding `overflow-hidden` on body when open. **Skip this for now** — keep PR small; revisit only if QA flags it.

## Testing strategy

**Manual smoke (phone):**
1. Sign in. Tap hamburger → drawer slides in. Items visible.
2. Tap "Marketplace" → marketplace loads AND drawer closes.
3. Tap "My account" → MyAccount loads AND drawer closes.
4. Tap "Sell" → Sell wizard loads (verify the picker work from PR 3 still functions in the wizard).
5. Tap hamburger again → drawer opens. Tap the backdrop → drawer closes.
6. Tap hamburger → drawer opens. Tap X → drawer closes.
7. Log out via drawer → logged out state. Reopen drawer → "Sign in" item visible instead of Profile/Settings/Help/Logout.

**Manual smoke (desktop / md+):**
- Confirm the hamburger button is hidden (`md:hidden`).
- Confirm the desktop nav still works.

**Typecheck + build:** `npx tsc --noEmit && npm run build` clean.

**No FE unit tests.** This is a UI primitive; existing FE has no test infra. Smoke covers it.

## Order of operations

Single PR, sequenced as commits for reviewability:

1. **Extend ModalShell with `align="right"`** — 3-line change. Standalone.
2. **Create `MobileNavMenu` component** — new file with the drawer body + menu items + handlers.
3. **Replace the hamburger DropdownMenu in App.tsx** — delete the ~100-line Radix block, add the new button + `<MobileNavMenu>`, remove now-unused imports.

Each commit type-checks and builds independently.

## References

- Existing primitive: `frontend/src/components/ui/ModalShell.tsx` (z-index conventions, backdrop, isolation wrapper)
- iOS Safari Radix bug context: `project_queued_brainstorms.md` entry #3
- CLAUDE.md: "Push for differentiation" — native mobile patterns over web-default dropdowns
