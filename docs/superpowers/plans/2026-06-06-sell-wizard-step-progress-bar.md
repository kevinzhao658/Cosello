# Sell-Wizard Step Progress Bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`). Frontend presentational — verify each task with `npm run typecheck && npm run build` + a visual check. No `any`; explicit types.

**Goal:** Replace the textual "Step X of Y" eyebrow in the sell wizard with a continuous, static glossy-capsule violet fill bar that grows as the user advances (bulk = of 5, single = of 4, manual = no bar).

**Architecture:** A new presentational `StepProgressBar({ current, total })` renders a fill bar + "Step X of Y" caption. A pure `computeWizardStep(...)` helper maps the wizard's existing phase state to `{ current, total } | null`. `SellWizard` renders the bar once at the top of its column (across all AI phases incl. upload); the text step-label is removed from `TypedInstruction`.

**Tech Stack:** React 18 + TS (Vite), Tailwind v4 (violet theme tokens).

**Spec:** `docs/superpowers/specs/2026-06-06-sell-wizard-step-progress-bar-design.md`

---

## File structure

- **Create** `frontend/src/features/sell-wizard/StepProgressBar.tsx` — presentational bar + caption (glossy capsule).
- **Create** `frontend/src/features/sell-wizard/wizardStep.ts` — pure `computeWizardStep` mapping helper.
- **Modify** `frontend/src/features/sell-wizard/SellWizard.tsx` — render the bar at the top of the wizard column.
- **Modify** `frontend/src/features/sell-wizard/TypedInstruction.tsx` — remove the text step-label (keep the typed headline + back chevron).
- **Modify** `frontend/src/features/sell-wizard/SinglePickupStep.tsx` — drop the now-unused `stepLabel` prop.

Tasks are sequential (Task 3 consumes Task 1+2).

---

### Task 1: `StepProgressBar` component

**Files:** Create `frontend/src/features/sell-wizard/StepProgressBar.tsx`

- [ ] **Step 1: Write the component**

```tsx
interface StepProgressBarProps {
  current: number;
  total: number;
}

// Static glossy-capsule progress bar. The fill width is current/total; only the
// width animates (on step change) — no shimmer/motion, so no reduced-motion case.
export function StepProgressBar({ current, total }: StepProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (current / total) * 100));
  return (
    <div className="mt-3 max-w-[300px] mx-auto">
      <div className="h-2 rounded-full bg-hairline overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(#9a63f3, var(--primary) 55%, #6a28d9)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 1px rgba(0,0,0,0.12)",
          }}
        />
      </div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted text-center">
        Step {current} of {total}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** — `cd frontend && npm run typecheck` → clean.
- [ ] **Step 3: Commit**
```bash
git add frontend/src/features/sell-wizard/StepProgressBar.tsx
git commit -m "feat(sell): StepProgressBar — glossy-capsule fill + caption"
```

---

### Task 2: `computeWizardStep` mapping helper

**Files:** Create `frontend/src/features/sell-wizard/wizardStep.ts`

- [ ] **Step 1: Write the helper**

```ts
import type { ProductDetails } from "./useSellWizard";

export interface WizardStep {
  current: number;
  total: number;
}

/**
 * Map the wizard's current phase state to a step indicator, or null when no bar
 * should show. Bulk AI flow = of 5; single AI flow = of 4; manual = no bar.
 *
 * Single vs bulk isn't known until the AI produces productDetails (single) or
 * bulkReviewPhase (bulk). Before that (the upload step) we default to "1 of 5".
 * In the single case the denominator resolves to 4 once productDetails exists.
 */
export function computeWizardStep(args: {
  mode: "ai" | "manual";
  productDetails: ProductDetails | null;
  singlePostPhase: "review" | "pickup";
  bulkReviewPhase: "review" | "reason" | "cards" | "pickup" | null;
}): WizardStep | null {
  const { mode, productDetails, singlePostPhase, bulkReviewPhase } = args;
  // Manual mode is a single-page form — no stepped progress.
  if (mode === "manual") return null;
  // Single-listing AI flow (total 4): review = 3, pickup = 4 (matches the prior
  // "Step 4 of 4" label; step 2 is the generate/transition).
  if (productDetails) {
    return { current: singlePostPhase === "pickup" ? 4 : 3, total: 4 };
  }
  // Bulk AI flow (total 5).
  switch (bulkReviewPhase) {
    case "review":
      return { current: 2, total: 5 };
    case "reason":
      return { current: 3, total: 5 };
    case "cards":
      return { current: 4, total: 5 };
    case "pickup":
      return { current: 5, total: 5 };
    default:
      // Upload step / flow not yet determined.
      return { current: 1, total: 5 };
  }
}
```

- [ ] **Step 2: Typecheck** — clean (`ProductDetails` is exported from `useSellWizard.ts`).
- [ ] **Step 3: Commit**
```bash
git add frontend/src/features/sell-wizard/wizardStep.ts
git commit -m "feat(sell): computeWizardStep — phase → step mapping"
```

---

### Task 3: Render the bar in `SellWizard`; strip the text label

**Files:** Modify `frontend/src/features/sell-wizard/SellWizard.tsx`, `TypedInstruction.tsx`, `SinglePickupStep.tsx`

- [ ] **Step 1: Import in `SellWizard.tsx`** (near the other sell-wizard imports ~lines 23-28):
```tsx
import { StepProgressBar } from "./StepProgressBar";
import { computeWizardStep } from "./wizardStep";
```

- [ ] **Step 2: Compute the step** — inside the `SellWizard` component body (after `state`/`actions` are destructured, e.g. near the other derived values ~line 138), add:
```tsx
  const wizardStep = computeWizardStep({
    mode,
    productDetails,
    singlePostPhase,
    bulkReviewPhase,
  });
```
(`mode`, `productDetails`, `singlePostPhase`, `bulkReviewPhase` are all already in scope — `mode` is a prop, the rest come from `state`/local state.)

- [ ] **Step 3: Render the bar at the top of the wizard column** — in the returned JSX, the wizard column renders the pruned-community banner, then `<UploadStep>` (~line 770). Insert the bar as the FIRST visible element of that column, immediately before the pruned-community banner block (or before `<UploadStep>` if the banner isn't first), so it sits above the typed headline across all AI phases including upload:
```tsx
      {wizardStep && <StepProgressBar current={wizardStep.current} total={wizardStep.total} />}
```
Place this once. It must NOT render in manual mode — `computeWizardStep` returns `null` for `mode === "manual"`, so the guard handles it. (Verify it renders above the `GroupsStep`/`SingleListingForm`/etc. content visually; if the column wrapper makes it sit oddly, wrap it in a `mb-1` div — keep it minimal.)

- [ ] **Step 4: Remove the text step-label from `TypedInstruction.tsx`** — the component currently computes `defaultStepLabel` / `eyebrow` and renders it in a `<p className="text-[12px] font-semibold text-muted">{eyebrow}</p>` inside the centered row (~lines 54-86). Remove the `stepLabel` prop, the `defaultStepLabel` const, the `eyebrow` const, and that `<p>{eyebrow}</p>`. KEEP: the typed headline `<p className="text-4xl …">{typedInstruction}…</p>`, the `onBack` chevron button, and the wrapping `<div>`/animation. The `onBack` chevron currently sits on the same row as the eyebrow — after removing the eyebrow, keep the chevron row (it can be an empty-ish row with just the back button, or move the chevron to sit above the headline; preserve its existing behavior and position as closely as possible). Update the `TypedInstruction` props type to drop `stepLabel`.

- [ ] **Step 5: Drop the `stepLabel` prop in `SinglePickupStep.tsx`** (~line 29) — remove `stepLabel="Step 4 of 4"` from the `<TypedInstruction … />` usage (the prop no longer exists). Leave the rest of `SinglePickupStep` unchanged.

- [ ] **Step 6: Typecheck + build** — `cd frontend && npm run typecheck && npm run build` → both clean (removing `stepLabel` must not leave dangling references; grep `stepLabel` → only gone).

- [ ] **Step 7: Commit**
```bash
git add frontend/src/features/sell-wizard/SellWizard.tsx frontend/src/features/sell-wizard/TypedInstruction.tsx frontend/src/features/sell-wizard/SinglePickupStep.tsx
git commit -m "feat(sell): render step progress bar; drop text step-label"
```

---

### Task 4: Visual verification (manual)

**No code.** With the app running, in the New Listing page (AI mode):
- [ ] Upload step shows the bar at **Step 1 of 5** (glossy violet capsule, ~8px, caption below).
- [ ] Advancing the bulk flow fills it: **2/5 → 3/5 → 4/5 → 5/5** (What → Why → Confirm → Where); the fill animates between steps; the typed headline still types and the back chevron still works.
- [ ] Single-listing flow reads **Step 3 of 4** (review) → **4 of 4** (pickup).
- [ ] **Manual mode: no bar.**
- [ ] Mobile layout is clean; the bar is centered and the 3D gloss reads.

---

## Self-review

- **Spec coverage:** glossy-capsule static fill + caption "Step X of Y" (Task 1); per-flow mapping bulk-of-5 / single-of-4 / manual-none (Task 2); rendered from upload at the top of the wizard column (Task 3 S3); text eyebrow removed from `TypedInstruction` + `SinglePickupStep` (Task 3 S4-5); typed headline + back chevron preserved (Task 3 S4). ✓
- **Placeholder scan:** none — concrete code + anchors throughout. ✓
- **Type consistency:** `WizardStep { current, total }` defined Task 2, consumed by `StepProgressBar` props (Task 1) and `SellWizard` (Task 3); `computeWizardStep` arg shape matches the values passed in Task 3 S2; `ProductDetails` imported from `useSellWizard`. ✓
- **No backend; no `any`.** ✓
- **Known minor behavior:** the upload step defaults to "of 5"; in the rarer single-listing case the denominator resolves to "of 4" once `productDetails` exists (documented in the helper).
