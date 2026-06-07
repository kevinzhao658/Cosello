# Status Pill Workflow Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the MyAccount status pill system across all four surfaces (Selling compact + card grid, Buying compact + card grid) with consistent green/amber/muted color treatments, universal dot rendering, label fixes, and the missing Draft/Sold branches.

**Architecture:** Single commit on top of branch tip `b414cdd`. All changes live in `MyAccountPage.tsx`. Each pill's color predicate becomes driven by `statusLabel` string compare so the source of truth is the label chain.

**Tech Stack:** React 18, TypeScript, Tailwind v4. No new dependencies. No backend changes.

**Spec:** `docs/superpowers/specs/2026-05-23-status-pill-workflow-audit-design.md` (committed `b414cdd`).

**Branch state at plan start:** `chore/status-pill-audit` is 1 commit ahead of dev (just the spec). After this plan: 2 commits ahead.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `frontend/src/pages/MyAccount/MyAccountPage.tsx` | Modify | 4 pill rendering sites (Selling compact + card, Buying compact + card) + 4 statusLabel chains (same surfaces). All in this one file. |

No other files touched. No new dependencies.

---

## Commit Strategy

Single new commit:

```
refactor(myaccount): unify status pill colors, labels, and dot rendering
```

All four surfaces should land together so the UI is internally consistent the moment the commit lands.

---

## Task 1: Selling compact table — statusLabel chain + pill className

**Files:**
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx` — ~lines 2570–2627 (inside `OverviewListingsPanel`'s Selling branch row map).

### Background

The Selling compact table at ~line 2572 has the old 8-state `statusLabel` chain (with the dead "Confirmed" branch, missing Draft + Sold). The pill render at ~line 2618 uses `cta`-driven color and conditionally suppresses the dot when `isConfirmedTicking` is true.

### Steps

- [ ] **Step 1: Locate the Selling row block**

Run: `grep -n "isConfirmedTicking = sellerOrder" frontend/src/pages/MyAccount/MyAccountPage.tsx`

Expected: two matches — one inside `OverviewListingsPanel` (~line 2570, the Selling COMPACT TABLE) and one inside `ListingsTabContent` (used by the Selling card grid). Task 1 targets the first occurrence.

- [ ] **Step 2: Replace the Selling compact `statusLabel` chain**

Find this exact block (~line 2572):

```tsx
                const statusLabel = isCompleted
                  ? "Completed"
                  : isSellerPickupReady
                    ? "Pickup ready"
                    : isSellerWaitingForBuyer
                      ? "Awaiting buyer"
                      : isConfirmedTicking
                        ? sellerCountdown.label
                        : sellerOrder?.status === "confirmed"
                          ? "Confirmed"
                          : hasPendingOrders
                            ? `${listing.pendingOrderCount} pending`
                            : timeInfo.expired
                              ? "Expired"
                              : "Live";
```

Replace with:

```tsx
                const statusLabel = listing.status === "draft"
                  ? "Draft"
                  : listing.status === "sold"
                    ? "Sold"
                    : isCompleted
                      ? "Completed"
                      : isSellerPickupReady
                        ? "Pickup ready"
                        : isSellerWaitingForBuyer
                          ? "Awaiting buyer"
                          : isConfirmedTicking
                            ? `Pickup in ${sellerCountdown.label}`
                            : hasPendingOrders
                              ? `${listing.pendingOrderCount} offers`
                              : timeInfo.expired
                                ? "Expired"
                                : "Live";
```

Changes:
- Add `listing.status === "draft" ? "Draft" :` at the top.
- Add `listing.status === "sold" ? "Sold" :` second.
- Remove the dead `sellerOrder?.status === "confirmed" ? "Confirmed" :` branch.
- Bake `Pickup in ${sellerCountdown.label}` into the chain (was just the raw label).
- Rename `${listing.pendingOrderCount} pending` → `${listing.pendingOrderCount} offers`.

- [ ] **Step 3: Replace the Selling compact pill render**

Find this exact block (~line 2618):

```tsx
                    <span className={`justify-self-start text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
                      cta === "expired" || isCompleted
                        ? "bg-surface-strong text-muted"
                        : cta === "default"
                          ? "bg-primary-soft text-primary"
                          : "bg-primary text-on-primary"
                    }`}>
                      {isConfirmedTicking ? null : <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
                      {isConfirmedTicking ? `Pickup in ${sellerCountdown.label}` : statusLabel}
                    </span>
```

Replace with:

```tsx
                    <span className={`justify-self-start text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
                      statusLabel === "Draft" || statusLabel === "Sold" || statusLabel === "Completed" || statusLabel === "Expired"
                        ? "bg-surface-strong text-muted"
                        : statusLabel === "Awaiting buyer"
                          ? "bg-warning/10 text-warning"
                          : "bg-primary-soft text-primary"
                    }`}>
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {statusLabel}
                    </span>
```

Changes:
- className predicate now driven by `statusLabel` (string compare) instead of `cta` enum.
- Solid `bg-primary text-on-primary` gone — replaced by `bg-primary-soft text-primary` for the green default.
- Awaiting buyer gets explicit `bg-warning/10 text-warning` amber branch.
- Universal dot — drop the `isConfirmedTicking ? null :` conditional.
- Pill body simplified to `{statusLabel}` (no more conditional `Pickup in ${label}` since baked into chain).

---

## Task 2: Selling Listings tab card grid — statusLabel chain + pill className + add `isConfirmedTicking`

**Files:**
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx` — ~lines 3137–3200 (inside `ListingsTabContent`'s Selling branch card map).

### Background

The Selling card grid uses a simpler 5-state statusLabel (Live / Draft / Sold / Expired / Completed) and a separate `statusClass` constant for color. Doesn't have `isConfirmedTicking` defined in scope. Card grid pill at ~line 3197 already has the dot but currently uses solid jade.

### Steps

- [ ] **Step 1: Add `isConfirmedTicking` to the card grid scope**

Find this block (~line 3144):

```tsx
              const isSellerPickupReady = !!(sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && !sellerHasReviewed);
              const isSellerWaitingForBuyer = !!(sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && sellerHasReviewed && !buyerHasReviewed);
              const isCompleted = sellerOrder?.status === "completed";
```

Add an `isConfirmedTicking` line immediately after:

```tsx
              const isSellerPickupReady = !!(sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && !sellerHasReviewed);
              const isSellerWaitingForBuyer = !!(sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && sellerHasReviewed && !buyerHasReviewed);
              const isCompleted = sellerOrder?.status === "completed";
              const isConfirmedTicking = !!(sellerOrder?.status === "confirmed" && sellerCountdown && !sellerCountdown.expired);
```

- [ ] **Step 2: Replace the Selling card grid `statusLabel` chain**

Find this block (~line 3148):

```tsx
              const statusLabel = isCompleted
                ? "Completed"
                : timeInfo.expired
                  ? "Expired"
                  : listing.status === "draft"
                    ? "Draft"
                    : listing.status === "sold"
                      ? "Sold"
                      : "Live";
```

Replace with the same full chain as Task 1 Step 2:

```tsx
              const statusLabel = listing.status === "draft"
                ? "Draft"
                : listing.status === "sold"
                  ? "Sold"
                  : isCompleted
                    ? "Completed"
                    : isSellerPickupReady
                      ? "Pickup ready"
                      : isSellerWaitingForBuyer
                        ? "Awaiting buyer"
                        : isConfirmedTicking
                          ? `Pickup in ${sellerCountdown.label}`
                          : hasPendingOrders
                            ? `${listing.pendingOrderCount} offers`
                            : timeInfo.expired
                              ? "Expired"
                              : "Live";
```

Same listing now shows the same pill text in the compact table and the card grid.

- [ ] **Step 3: Replace the Selling card grid `statusClass`**

Find this block (~line 3158):

```tsx
              const statusClass = isCompleted || timeInfo.expired || listing.status === "sold"
                ? "bg-surface-strong text-muted"
                : listing.status === "draft"
                  ? "bg-warning/10 text-warning"
                  : "bg-primary text-on-primary";
```

Replace with the statusLabel-driven predicate (same shape as Task 1 Step 3):

```tsx
              const statusClass = statusLabel === "Draft" || statusLabel === "Sold" || statusLabel === "Completed" || statusLabel === "Expired"
                ? "bg-surface-strong text-muted"
                : statusLabel === "Awaiting buyer"
                  ? "bg-warning/10 text-warning"
                  : "bg-primary-soft text-primary";
```

Changes:
- Predicate now driven by `statusLabel`.
- Draft moves from amber → muted (was the visible amber pill in the card grid; now matches the compact table).
- Default branch goes from solid jade → light-green + jade text.
- Awaiting buyer gets explicit amber branch.

- [ ] **Step 4: Pill render — no changes needed**

The Selling card grid pill at ~line 3197 already has the dot and consumes `statusClass` + `statusLabel`. No edit needed — the change in `statusClass` (Step 3) propagates automatically.

```tsx
                    <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${statusClass}`}>
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {statusLabel}
                    </span>
```

Confirm this line is present in the file (no edit). The render site stays untouched.

---

## Task 3: Buying compact table — statusLabel bake-in + pill className

**Files:**
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx` — ~lines 2673–2714 (inside `OverviewListingsPanel`'s Buying branch row map).

### Steps

- [ ] **Step 1: Replace the Buying compact `statusLabel` chain**

Find this block (~line 2673):

```tsx
                const statusLabel = viewState === "declined" ? "Declined"
                  : viewState === "withdrawn" ? "Withdrawn"
                  : viewState === "expired" ? "Expired"
                  : viewState === "cancelledBySeller" ? "Cancelled by seller"
                  : viewState === "waitingForOther" ? "Awaiting seller"
                  : viewState === "pickupReady" ? "Pickup ready"
                  : isConfirmedTicking ? countdown.label
                  : order.status === "completed" ? "Completed"
                  : "Pending";
```

Replace with (only `isConfirmedTicking` branch changes — bake in "Pickup in" prefix):

```tsx
                const statusLabel = viewState === "declined" ? "Declined"
                  : viewState === "withdrawn" ? "Withdrawn"
                  : viewState === "expired" ? "Expired"
                  : viewState === "cancelledBySeller" ? "Cancelled by seller"
                  : viewState === "waitingForOther" ? "Awaiting seller"
                  : viewState === "pickupReady" ? "Pickup ready"
                  : isConfirmedTicking ? `Pickup in ${countdown.label}`
                  : order.status === "completed" ? "Completed"
                  : "Pending";
```

- [ ] **Step 2: Replace the Buying compact pill render**

Find this block (~line 2705):

```tsx
                    <span className={`justify-self-start text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
                      viewState === "declined" || viewState === "withdrawn" || viewState === "expired"
                        ? "bg-surface-strong text-muted"
                        : viewState === "cancelledBySeller" || viewState === "waitingForOther"
                          ? "bg-warning/10 text-warning"
                          : "bg-primary text-on-primary"
                    }`}>
                      {isConfirmedTicking ? null : <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
                      {isConfirmedTicking ? `Pickup in ${countdown.label}` : statusLabel}
                    </span>
```

Replace with:

```tsx
                    <span className={`justify-self-start text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
                      viewState === "declined" || viewState === "withdrawn" || viewState === "expired" || order.status === "completed"
                        ? "bg-surface-strong text-muted"
                        : viewState === "cancelledBySeller" || viewState === "waitingForOther"
                          ? "bg-warning/10 text-warning"
                          : "bg-primary-soft text-primary"
                    }`}>
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {statusLabel}
                    </span>
```

Changes:
- `order.status === "completed"` added to muted bucket (was falling to solid jade — fixes the bug).
- Default branch goes from solid jade → light-green + jade text.
- Universal dot — drop the `isConfirmedTicking ? null :` conditional.
- Pill body simplified to `{statusLabel}`.

---

## Task 4: Buying card grid — statusLabel bake-in + pill className

**Files:**
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx` — ~lines 3293–3340 (inside `ListingsTabContent`'s Buying branch card map).

### Steps

- [ ] **Step 1: Replace the Buying card grid `statusLabel` chain**

Find this block (~line 3293):

```tsx
              const statusLabel = viewState === "declined" ? "Declined"
                : viewState === "withdrawn" ? "Withdrawn"
                : viewState === "expired" ? "Expired"
                : viewState === "cancelledBySeller" ? "Cancelled by seller"
                : viewState === "waitingForOther" ? "Awaiting seller"
                : viewState === "pickupReady" ? "Pickup ready"
                : isConfirmedTicking ? countdown.label
                : order.status === "completed" ? "Completed"
                : "Pending";
```

Replace with the same bake-in change as Task 3 Step 1:

```tsx
              const statusLabel = viewState === "declined" ? "Declined"
                : viewState === "withdrawn" ? "Withdrawn"
                : viewState === "expired" ? "Expired"
                : viewState === "cancelledBySeller" ? "Cancelled by seller"
                : viewState === "waitingForOther" ? "Awaiting seller"
                : viewState === "pickupReady" ? "Pickup ready"
                : isConfirmedTicking ? `Pickup in ${countdown.label}`
                : order.status === "completed" ? "Completed"
                : "Pending";
```

- [ ] **Step 2: Replace the Buying card grid `statusClass`**

Find this block (~line 3302):

```tsx
              const statusClass = ["declined", "withdrawn", "expired"].includes(viewState) || order.status === "completed"
                ? "bg-surface-strong text-muted"
                : viewState === "cancelledBySeller" || viewState === "waitingForOther"
                  ? "bg-warning/10 text-warning"
                  : "bg-primary text-on-primary";
```

Replace with (only the default branch changes):

```tsx
              const statusClass = ["declined", "withdrawn", "expired"].includes(viewState) || order.status === "completed"
                ? "bg-surface-strong text-muted"
                : viewState === "cancelledBySeller" || viewState === "waitingForOther"
                  ? "bg-warning/10 text-warning"
                  : "bg-primary-soft text-primary";
```

- [ ] **Step 3: Pill render — minor edit for universal dot + statusLabel simplification**

Find this block (~line 3337):

```tsx
                      <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${statusClass}`}>
                        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                        {statusLabel}
                      </span>
```

This block ALREADY uses the dot universally and renders `{statusLabel}` directly. **No change required.** The fix to the statusLabel chain (Step 1) and statusClass (Step 2) propagate here automatically.

Confirm the block is present and matches; if it has any `isConfirmedTicking` conditional wrapping (which it shouldn't based on prior reading), drop the wrapping.

---

## Task 5: Final verification + commit

- [ ] **Step 1: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0.

- [ ] **Step 2: Run build**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0.

- [ ] **Step 3: Verify the unified green pill landed everywhere**

Run: `grep -n "bg-primary text-on-primary" frontend/src/pages/MyAccount/MyAccountPage.tsx`

Expected output should contain NO matches in the status-pill rendering contexts (Selling compact pill, Selling card grid pill, Buying compact pill, Buying card grid pill).

Note: `bg-primary text-on-primary` may still appear elsewhere in the file (e.g., on CTA buttons like "Review N offers" or "Confirm pickup"). Those are NOT status pills — leave them alone. Visually inspect the matches; flag if any are status-pill-adjacent.

- [ ] **Step 4: Verify the dead "Confirmed" branch is gone**

Run: `grep -n "\"Confirmed\"" frontend/src/pages/MyAccount/MyAccountPage.tsx`

Expected: zero matches in the Selling status logic. (If "Confirmed" still appears as a string literal anywhere in the file outside the Selling chain, that's fine — but the dead branch removal target was the Selling chain specifically.)

- [ ] **Step 5: Verify "{N} pending" → "{N} offers" rename**

Run: `grep -n "pendingOrderCount} pending" frontend/src/pages/MyAccount/MyAccountPage.tsx`

Expected: zero matches in the Selling status chains.

Run: `grep -n "pendingOrderCount} offers" frontend/src/pages/MyAccount/MyAccountPage.tsx`

Expected: 2 matches (Selling compact + Selling card grid).

Note: "Review {N} offers" CTA buttons (e.g., line 3210 area) use different copy — `\`Review ${listing.pendingOrderCount} ${listing.pendingOrderCount === 1 ? "offer" : "offers"}\``. Those stay unchanged.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/MyAccount/MyAccountPage.tsx
git commit -m "$(cat <<'EOF'
refactor(myaccount): unify status pill colors, labels, and dot rendering

Six coordinated changes across the four status pill rendering sites
(Selling compact + card grid, Buying compact + card grid):

- All "in-motion" green pills unified to bg-primary-soft text-primary
  (light green + jade font). No more solid bg-primary text-on-primary
  on any status pill.
- Universal colored dot: drop the conditional null on Pickup-in pills
  so every pill carries the leading dot.
- "Awaiting buyer" (Selling) recolored from green → amber to match
  the Buying-side "Awaiting seller" / "Cancelled by seller" amber.
- Add Draft and Sold branches to the Selling statusLabel chain
  (compact + card grid). Both render muted gray. Draft was previously
  amber in the card grid only; now muted everywhere.
- Rename "{N} pending" → "{N} offers" on Selling for clarity.
- Remove dead "Confirmed" fallback branch (unreachable post-PR #12).
- Selling card grid now uses the full 9-state statusLabel chain so
  it matches the Selling compact table exactly. Same listing, same
  pill on both surfaces.
- Buying compact table now treats order.status === "completed" as
  muted (previously fell to default solid jade). Card grid already
  had this correct; aligning the compact table fixes the bug.

Pill color predicates are now driven by statusLabel string compare
across all four sites — single source of truth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Verify the commit landed**

Run: `git log -1 --oneline`

Expected: `<hash> refactor(myaccount): unify status pill colors, labels, and dot rendering`

Run: `git log dev..HEAD --oneline | wc -l`

Expected: `2` (the spec commit + this implementation commit).

---

## Final verification

- [ ] **Final A: Both checks green**

```bash
cd frontend && npm run typecheck
cd frontend && npm run build
```

Both exit 0.

- [ ] **Final B: Manual smoke (user, not implementer)**

Document in PR description so user verifies:
- **Selling compact table:** All previously-jade pills (Live, Pickup in {label}, Pickup ready, "N offers") now render light-green background + jade text. "Awaiting buyer" is amber. Draft listings show "Draft" muted. Sold listings show "Sold" muted. Every pill has a leading colored dot, including "Pickup in 2h 14m".
- **Selling card grid (Listings tab):** Same labels and colors as the compact table for the same listing. Draft listings show "Draft" muted (was amber). All green pills unified.
- **Buying compact table:** All previously-jade pills (Pending, Pickup in {label}, Pickup ready) now light-green + jade text. "Awaiting seller" + "Cancelled by seller" stay amber. Completed orders now muted (were solid jade — bug fixed).
- **Buying card grid:** Same labels and colors as the Buying compact table.
- **No solid `bg-primary text-on-primary` pills on any status surface.** Other UI (CTA buttons, etc.) keeps its existing treatments.

---

## Self-Review

**Spec coverage:**
- Spec Section 1 (color system) → enforced via Task 1 Step 3, Task 2 Step 3, Task 3 Step 2, Task 4 Step 2 predicates ✓
- Spec Section 2 (universal dot) → Task 1 Step 3 + Task 3 Step 2 (drop the `isConfirmedTicking ? null :` lines); card grids already had unconditional dots ✓
- Spec Section 3 (Selling compact) → Task 1 ✓
- Spec Section 4 (Selling card grid) → Task 2 ✓
- Spec Section 5 (Buying both surfaces) → Task 3 + Task 4 ✓
- Spec Section 6 (verification) → Task 5 ✓

**Placeholder scan:** No TBD/TODO. Every code edit has both find and replace blocks. Every grep command has expected output.

**Type consistency:** `isConfirmedTicking` defined once per scope (Task 2 Step 1 adds it to the card grid where it was missing). `statusLabel` string compare predicates use exact same strings across Tasks 1 + 2. Color class strings (`bg-primary-soft text-primary`, `bg-warning/10 text-warning`, `bg-surface-strong text-muted`) used identically in all 4 sites.

**Known fragility:** Approximate line numbers (e.g., "~line 2572") may shift slightly. Each step's find block is exact-string-match so the engineer can rely on the content, not the line number.

**No spec gaps found.**
