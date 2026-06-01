# Minimal Listing Card — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax. This is a **presentational** change — there is no React component test harness in this repo, so verification per task is `npm run typecheck` + `npm run build` (clean) plus a visual check. No `any`.

**Goal:** Restyle the marketplace listing card to a minimal, borderless frame with the community trust signal as a byline above a clean photo and a quiet black price, and extract it into a reusable `<ListingCard>` component.

**Architecture:** Extract the inline card JSX (`App.tsx`) into `frontend/src/components/ListingCard.tsx` as a pure refactor first (zero visual change, proves parity), then apply the redesign inside the isolated component. Skeleton and the sell-flow preview card are updated to match. MyAccount is out of scope (it renders listings as a table, not photo cards).

**Tech Stack:** React 18, TypeScript, Tailwind v4. Existing helpers: `ListingImage` (`src/components/ui/ListingImage.tsx`, `size="card"`, `priority`), `PLACEHOLDER_COMMUNITY`/`formatTitle` (`src/lib/listings`), `Listing`/`ListingCommunity` types (`src/lib/types.ts`).

---

## File Structure

- **Create:** `frontend/src/components/ListingCard.tsx` — one card; renders community byline + photo + title/location/price; emits open/save intents. No data fetching, no global state.
- **Modify:** `frontend/src/App.tsx` — marketplace grid (~1894–1978) consumes `<ListingCard>`; sell-flow preview card (~943–995) restyled to match.
- **Modify:** `frontend/src/components/ListingCardSkeleton.tsx` — match the borderless frame.
- **Out of scope:** `MyAccountPage.tsx` (table rows, not cards); listing detail modal; any backend.

## Component contract (`ListingCard`)

```tsx
import type { Listing, ListingCommunity } from "../lib/types";

interface ListingCardProps {
  listing: Listing;
  heroCommunity: ListingCommunity | typeof PLACEHOLDER_COMMUNITY;
  isOwn: boolean;
  isAuthenticated: boolean;
  isWishlisted: boolean;
  isPulsing: boolean;
  priority: boolean;
  animationDelayMs: number;
  onOpen: () => void;
  onToggleWishlist: () => void;
  onPulseEnd: () => void;
}
```

Save button visibility rule stays `!isOwn && isAuthenticated && listing.status !== "sold"`.

---

### Task 1: Extract `<ListingCard>` as a pure refactor (no visual change)

**Files:**
- Create: `frontend/src/components/ListingCard.tsx`
- Modify: `frontend/src/App.tsx` (marketplace grid map, ~1894–1978)

- [ ] **Step 1: Create `ListingCard.tsx` reproducing the CURRENT card exactly**

Copy the existing JSX verbatim (trust band → photo → `p-3 space-y-1` body with `text-2xl font-extrabold text-primary` price), parameterized by the props above. Keep every current class string identical for now. Heart button keeps `e.stopPropagation()` + `onToggleWishlist`, the `Heart` pulse `onAnimationEnd` calls `onPulseEnd`. Use `formatTitle(listing.brand, listing.name)`, `ListingImage size="card" priority={priority}`.

```tsx
export function ListingCard({ listing, heroCommunity, isOwn, isAuthenticated, isWishlisted, isPulsing, priority, animationDelayMs, onOpen, onToggleWishlist, onPulseEnd }: ListingCardProps) {
  // …current JSX, exact classes, using props instead of closures…
}
```

- [ ] **Step 2: Replace the inline card in the marketplace grid with `<ListingCard>`**

In `App.tsx`, keep the `heroCommunity` derivation (line ~1894) at the call site and pass it in; replace the `<article>…</article>` block with:

```tsx
<ListingCard
  key={listing.id}
  listing={listing}
  heroCommunity={heroCommunity}
  isOwn={isAuthenticated && listing.userId === user?.id}
  isAuthenticated={isAuthenticated}
  isWishlisted={wishlist.has(listing.id)}
  isPulsing={pulseSavedIds.has(listing.id)}
  priority={idx < 4}
  animationDelayMs={Math.min(idx, 11) * 30}
  onOpen={() => openListingDetail(listing, marketSearch ? "search" : "direct")}
  onToggleWishlist={() => toggleWishlist(listing.id)}
  onPulseEnd={() => setPulseSavedIds((prev) => { const next = new Set(prev); next.delete(listing.id); return next; })}
/>
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: clean, no errors.

- [ ] **Step 4: Visual parity check** — marketplace grid looks IDENTICAL to before (this task is refactor-only).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ListingCard.tsx frontend/src/App.tsx
git commit -m "refactor(card): extract ListingCard component (no visual change)"
```

---

### Task 2: Apply the minimal redesign inside `<ListingCard>`

**Files:** Modify `frontend/src/components/ListingCard.tsx`

- [ ] **Step 1: Card root → borderless**

`<article>` className from:
`group bg-canvas border border-hairline rounded-md overflow-hidden cursor-pointer hover:shadow-hover transition-shadow motion-safe:animate-mkt-card-in`
to:
`group cursor-pointer motion-safe:animate-mkt-card-in`
Keep `onClick={onOpen}` and `style={{ animationDelay: \`${animationDelayMs}ms\` }}`.

- [ ] **Step 2: Replace the trust band with a community byline ABOVE the photo**

Remove the full tinted-bar `<div className="flex items-center gap-2 px-3 py-2 bg-primary-soft/60 border-b border-hairline text-xs">…</div>`. Add, as the first child of the article (before the photo):

```tsx
<div className="flex items-center gap-1.5 mb-1.5">
  {heroCommunity.image ? (
    <img src={heroCommunity.image} alt="" aria-hidden="true" className="size-5 rounded-full object-cover shrink-0" />
  ) : (
    <span aria-hidden="true" className="size-5 rounded-full bg-primary shrink-0 inline-flex items-center justify-center text-on-primary text-[9px] font-bold">
      {heroCommunity.name.charAt(0).toUpperCase()}
    </span>
  )}
  <span className="text-xs font-medium text-body line-clamp-1">{heroCommunity.name}</span>
</div>
```

- [ ] **Step 3: Photo → its own rounded block, clean**

Photo wrapper className from `relative aspect-square bg-surface-soft` to `relative aspect-square bg-surface-soft rounded-lg overflow-hidden`. Leave `ListingImage` and the heart button unchanged (heart still `absolute top-2 right-2`).

- [ ] **Step 4: Body → reorder + quiet price**

Body wrapper className `p-3 space-y-1` → `pt-2 space-y-0.5`. Order becomes title → location → price:

```tsx
<div className="pt-2 space-y-0.5">
  <p className="text-sm font-medium text-ink line-clamp-1">{formatTitle(listing.brand, listing.name)}</p>
  <p className="text-xs text-muted line-clamp-1">{listing.location}</p>
  <p className="text-base font-semibold text-ink leading-none pt-0.5">${listing.price}</p>
</div>
```

(Price changed from `text-2xl font-extrabold text-primary tracking-display` → `text-base font-semibold text-ink`.)

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build` — Expected: clean.

- [ ] **Step 6: Visual check** — borderless cards, community byline above a clean rounded photo, black 16px price under location, airier grid.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ListingCard.tsx
git commit -m "feat(card): minimal borderless frame, community byline, quiet price"
```

---

### Task 3: Sold state

**Files:** Modify `frontend/src/components/ListingCard.tsx`

- [ ] **Step 1: Add the 75% scrim + frosted SOLD pill, replace the old Sold badge**

Inside the photo wrapper, replace the existing sold badge (`<span className="absolute top-2 left-2 …bg-ink…">Sold</span>`) with, gated on `listing.status === "sold"`:

```tsx
{listing.status === "sold" && (
  <>
    <span className="absolute inset-0 bg-canvas/75" aria-hidden="true" />
    <span className="absolute top-2 left-2 text-[10px] uppercase tracking-widest font-bold text-ink bg-canvas/95 border border-hairline px-2 py-1 rounded-full">
      Sold
    </span>
  </>
)}
```

- [ ] **Step 2: Suppress the heart when sold** — change the heart's visibility guard to `!isOwn && isAuthenticated && listing.status !== "sold"`.

- [ ] **Step 3: Mute title + price when sold**

Title: `text-ink` → `${listing.status === "sold" ? "text-muted" : "text-ink"}`.
Price: `text-ink` → `${listing.status === "sold" ? "text-muted" : "text-ink"}`.

- [ ] **Step 4: Typecheck + build** — `npm run typecheck && npm run build` — clean.

- [ ] **Step 5: Visual check** — a sold listing shows a 75%-faded photo, frosted SOLD pill top-left, muted text, no heart.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ListingCard.tsx
git commit -m "feat(card): sold state — 75% fade + frosted SOLD pill"
```

---

### Task 4: Match the skeleton to the new frame

**Files:** Modify `frontend/src/components/ListingCardSkeleton.tsx`

- [ ] **Step 1: Rewrite to mirror the borderless card**

```tsx
import { Skeleton } from "./ui/Skeleton";

// Mirrors ListingCard: community byline → rounded photo → title/location/price.
export function ListingCardSkeleton() {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Skeleton className="size-5 rounded-full shrink-0" />
        <Skeleton className="h-3 flex-1 max-w-[50%]" />
      </div>
      <Skeleton className="aspect-square w-full rounded-lg" />
      <div className="pt-2 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build** — clean.

- [ ] **Step 3: Visual check** — loading grid matches the new card; no visible jump when real cards replace skeletons.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ListingCardSkeleton.tsx
git commit -m "feat(card): skeleton matches borderless frame"
```

---

### Task 5: Restyle the sell-flow preview card to match (consistency)

**Files:** Modify `frontend/src/App.tsx` (~943–995, `newListingPreviewContent`)

This card previews the seller's in-progress listing and uses manual form fields (not a `Listing`), so it does NOT consume `<ListingCard>`; restyle it inline to match. Apply the same transforms: drop the outer border + tinted trust bar, community byline above the photo, `rounded-lg` photo, body order title → location → price, price `text-base font-semibold text-ink`.

- [ ] **Step 1: Apply the class changes** (mirror Tasks 1–2's frame/byline/body, using the preview's existing manual data sources and `PLACEHOLDER_COMMUNITY`).
- [ ] **Step 2: Typecheck + build** — clean.
- [ ] **Step 3: Visual check** — the New Listing preview matches a real marketplace card.
- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(card): sell-flow preview matches new card style"
```

---

## Self-review notes

- **Spec coverage:** frame ✓ (T1/T2), byline above clean photo ✓ (T2), quiet black left-aligned price ✓ (T2), sold 75% + frosted pill + muted + no heart ✓ (T3), skeleton ✓ (T4), extract `<ListingCard>` ✓ (T1). MyAccount = N/A (confirmed table, not cards) — spec's verify-first resolved. Sell-preview consistency added as T5 (discovered during planning; not in original spec — flag to user).
- **Verification:** presentational; no component test harness exists, so each task gates on `npm run typecheck && npm run build` + visual check rather than unit tests.
- **No `any`; all props explicitly typed.**
- **QA handoff:** marketplace grid borderless/airier; byline above clean photo; 16px black price; sold fade + frosted pill + no heart; skeleton no-jump; preview matches; existing behaviors intact (open-on-click, save toggle + pulse, entrance animation, community fallback, image-vs-letter avatar).
