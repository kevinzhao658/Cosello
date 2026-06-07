# Sell-Flow Manual Editing & Mode Lock — Design

**Status:** Approved (brainstorm) · **Date:** 2026-06-04

## Goal

Three sell-flow refinements on the New Listing page:
1. Move the manual-mode "Publish listing" button to the bottom of the page so it's easy to find after filling the form.
2. Let sellers fill bulk-item fields by hand after segmentation, without requiring AI generation.
3. Once the AI flow has segmented (step 2), hide the AI/Manual mode toggle so the user can't switch to Manual mode and discard the bulk work.

These are three cohesive changes to the same surface; one spec, one plan.

---

## Part 1 — Manual "Publish listing" button → bottom

**Today:** the manual publish button lives in the top toolbar (`App.tsx:1363-1372`), rendered only when `newListingMode === "manual"`, beside the "Drafts" button.

**Change:**
- Remove the publish button from the top toolbar. "Drafts" stays.
- Add a prominent, full-width primary "Publish listing" button at the **bottom of the manual form** — after the last manual form section inside the `{newListingMode === "manual" && (…)}` block.
- Reuse the existing handler and state verbatim: `onClick={handlePublishNewListing}`, `disabled={isPublishingManual || wizardImageCount === 0}`, label `isPublishingManual ? "Publishing…" : "Publish listing"`.
- Full-width styling (`w-full`) so it reads as the page's final CTA. No behavior change.

---

## Part 2 — Manual fill for bulk items (before AI)

**Today:** at step 2 (Groups), the only way forward is "Generate with AI", which calls the AI pipeline and populates `bulkItems`. The per-item editor (`AIReviewStep`, `cards` phase) only appears after generation.

**Change — add a manual path that reuses the existing editor:**

- **Two buttons at step 2** (`GroupsStep.tsx`, the Groups/`review` phase): keep "Generate with AI" (primary, existing `onGenerate`), add "Fill in manually" (secondary, new `onFillManually`).
- The manual path **skips the AI rationale (`reason`) sub-phase** entirely — it goes straight from Groups to the `cards` editor (the rationale only exists to steer AI generation, which the manual path doesn't run).
- **New reducer action** in `useSellWizard.ts` (e.g. `INIT_BULK_MANUAL`) that materializes blank items from the current segmentation **without any AI call**:
  - one `BulkItemDetails` per `segmentation.groupings[i]`, with `imageIndices` = that group
  - `brand` / `name` seeded from the hints the user already typed (`brandHints[i]` / `names[i]`)
  - `price: ""`, `description: ""`, `tags: []`, `condition: "Good"` (matches the manual single-listing default), `category` left at its default
  - sets `bulkReviewPhase: "cards"`, `currentCardIndex: 0`, `isGenerating: false`
- **Lands in the existing `AIReviewStep` editor** — the user types each item's fields and navigates with the existing arrows / thumbnail strip / swipe. No new editor surface.
- **AI stays optional:** the existing per-item "regenerate" action remains in the editor, so a seller on the manual path can still pull AI for any single item. Generation is no longer required.

Out of scope: changing the AI generation pipeline itself; bulk-level "generate all from manual."

---

## Part 3 — Lock to AI Drafted after segmentation

**Today:** the green AI/Manual toggle (`App.tsx:1427-1462`) is always visible, so a user mid-bulk-flow could click "Manual" and blow away their segmentation.

**Change:**
- Hide the entire toggle block once the AI flow has segmented. App already has the signal: `wizardPhase` (set from the wizard's `bulkReviewPhase` via `onPhaseChange`) is non-null once segmentation produces the Groups step.
- Render condition: show the toggle only when `wizardPhase === null`; once `wizardPhase !== null` (review / reason / cards / pickup), the toggle is gone and the flow stays in AI Drafted.
- **Re-appears on reset:** clearing/restarting the flow returns `bulkReviewPhase` → `null` → `wizardPhase` → `null` → toggle visible again. No new reset wiring needed.

Naming note: Part 2's "Fill in manually" (a path *inside* the AI Drafted flow) is distinct from Part 3's "Manual" (the global single-listing mode). This spec keeps them separate; only the global toggle is hidden.

---

## Files touched

- `frontend/src/App.tsx` — Part 1 (move publish button), Part 3 (gate toggle on `wizardPhase === null`).
- `frontend/src/features/sell-wizard/steps/GroupsStep.tsx` — Part 2 (second button + `onFillManually` prop).
- `frontend/src/features/sell-wizard/SellWizard.tsx` — Part 2 (wire `onFillManually` → dispatch `INIT_BULK_MANUAL`; pass to `GroupsStep`).
- `frontend/src/features/sell-wizard/useSellWizard.ts` — Part 2 (`INIT_BULK_MANUAL` action + reducer case + action creator).

No backend changes.

## Testing

Frontend is presentational/stateful (no component test harness): `npm run typecheck && npm run build` clean (no `any`), plus a visual pass:
- Manual mode: publish button now at the bottom, full-width; top toolbar shows only "Drafts"; publish still works and respects the disabled rule.
- AI mode: upload → segment (step 2) shows two buttons; "Fill in manually" → blank per-item cards seeded with brand/name hints; fields editable per item; per-item AI regenerate still works; publish from the bulk flow unaffected.
- Mode toggle visible during upload (pre-segment); disappears after segmentation; reappears after clearing/restarting the flow.

## Differentiation note

Bulk photo separation is a patent-track feature; this spec covers UI/flow only — keep implementation specifics out of public-facing docs/comments.
