# Sell-Flow Manual Editing & Mode Lock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Frontend is presentational/stateful (no component test harness) → verify each task with `npm run typecheck && npm run build` + a visual check. No `any`; explicit types.

**Goal:** Add a manual fill-in path for segmented bulk items (no AI required), move the manual-mode publish button to the bottom of the page, and hide the AI/Manual toggle once the bulk flow has segmented.

**Architecture:** A new reducer action `INIT_BULK_MANUAL` materializes blank `bulkItems` from `segmentation.groupings` (seeded with the user's brand/name hints) and jumps to the existing `cards` editor — reusing `AIReviewStep` with zero new editor UI. `GroupsStep` gains a second button. `App.tsx` moves the publish button and gates the toggle on `wizardPhase === null`.

**Tech Stack:** React 18 + TypeScript (Vite). Touch points: `useSellWizard.ts`, `GroupsStep.tsx`, `SellWizard.tsx`, `App.tsx`.

**Spec:** `docs/superpowers/specs/2026-06-04-sell-flow-manual-editing-design.md`

---

## File structure

- **Modify** `frontend/src/features/sell-wizard/useSellWizard.ts` — `INIT_BULK_MANUAL` action type + reducer case + `initBulkManual` action creator + interface entry.
- **Modify** `frontend/src/features/sell-wizard/steps/GroupsStep.tsx` — `onFillManually` prop; two-button row in the `review` phase.
- **Modify** `frontend/src/features/sell-wizard/SellWizard.tsx` — pass `onFillManually` to `GroupsStep`.
- **Modify** `frontend/src/App.tsx` — move manual publish button to bottom (Part 1); gate AI/Manual toggle on `wizardPhase === null` (Part 3).

Tasks are independent except Task 2 depends on Task 1's action creator. Recommended order 1→2→3→4.

---

### Task 1: `INIT_BULK_MANUAL` reducer action (Part 2 data)

**Files:** Modify `frontend/src/features/sell-wizard/useSellWizard.ts`

- [ ] **Step 1: Add the action to the action-type union** — next to `| { type: "GENERATE_BULK"; items: BulkItemDetails[] }` (~line 106), add:
```ts
  | { type: "INIT_BULK_MANUAL" }
```

- [ ] **Step 2: Add the reducer case** — directly after the `case "GENERATE_BULK":` block (which ends ~line 212), add a case that builds blank items from the current segmentation, seeding brand/name from the hints and defaulting condition to "Good":
```ts
    case "INIT_BULK_MANUAL": {
      if (!state.segmentation) return state;
      const items: BulkItemDetails[] = state.segmentation.groupings.map((group, i) => ({
        brand: state.brandHints[i] ?? "",
        name: state.names[i] ?? "",
        description: "",
        price: "",
        condition: "Good",
        location: "",
        tags: [],
        imageIndices: group,
      }));
      return {
        ...state,
        isGenerating: false,
        bulkItems: items,
        currentCardIndex: 0,
        bulkReviewPhase: "cards",
        groupingsModified: false,
        modifiedGroupIndices: new Set<number>(),
      };
    }
```

- [ ] **Step 3: Declare the action on the `SellWizardActions` interface** — next to `generateBulk: (items: BulkItemDetails[]) => void;` (~line 590), add:
```ts
  initBulkManual: () => void;
```

- [ ] **Step 4: Add the action creator** — next to `generateBulk: (items) => dispatch({ type: "GENERATE_BULK", items }),` (~line 781), add:
```ts
    initBulkManual: () => dispatch({ type: "INIT_BULK_MANUAL" }),
```

- [ ] **Step 5: Typecheck** — `cd frontend && npm run typecheck` → clean (`BulkItemDetails` required fields are brand, name, description, price, condition, location, tags, imageIndices — all set above; `category`/`pickupLocation` are optional and intentionally omitted).

- [ ] **Step 6: Commit**
```bash
git add frontend/src/features/sell-wizard/useSellWizard.ts
git commit -m "feat(sell): INIT_BULK_MANUAL — blank bulk items from groupings"
```

---

### Task 2: "Fill in manually" button at step 2 (Part 2 UI)

**Files:** Modify `frontend/src/features/sell-wizard/steps/GroupsStep.tsx`, `frontend/src/features/sell-wizard/SellWizard.tsx`

- [ ] **Step 1: Add the prop to `GroupsStepProps`** — next to `onGenerate: () => void;` (~line 34), add:
```ts
  onFillManually: () => void;
```
and destructure `onFillManually` in the component signature alongside `onGenerate` (~line 58).

- [ ] **Step 2: Replace the single review-phase button with a two-button row** — in `GroupsStep.tsx`, the `bulkReviewPhase === "review"` branch currently renders one `<Button onClick={onAdvanceToReason}>` ("Continue …", lines ~150-159). Replace that single `<Button>…</Button>` with:
```tsx
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={onAdvanceToReason}
                disabled={
                  segmentation.groupings.length === 0 ||
                  segmentation.groupings.some((g) => g.length === 0)
                }
                className="flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                {`Generate with AI (${segmentation.groupings.length})`}
              </Button>
              <Button
                variant="outline"
                onClick={onFillManually}
                disabled={
                  segmentation.groupings.length === 0 ||
                  segmentation.groupings.some((g) => g.length === 0)
                }
                className="flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                Fill in manually
              </Button>
            </div>
```
Leave the `reason`-phase block (rationale radios + "Generate Listings" button) unchanged — that's the AI path's second step, reached via "Generate with AI".

- [ ] **Step 3: Wire the prop in `SellWizard.tsx`** — at the `<GroupsStep` render site (~line 1111), next to `onGenerate={handleGenerateListings}` (~line 1129), add:
```tsx
              onFillManually={() => actions.initBulkManual()}
```
(`actions` is the `useSellWizard` actions object already in scope here; `handleGenerateListings`/`onAdvanceToReason` are passed nearby, confirming `actions` is reachable.)

- [ ] **Step 4: Typecheck + build** — `cd frontend && npm run typecheck && npm run build` → both clean.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/features/sell-wizard/steps/GroupsStep.tsx frontend/src/features/sell-wizard/SellWizard.tsx
git commit -m "feat(sell): Fill in manually button — skip AI, edit bulk items by hand"
```

---

### Task 3: Move manual publish button to the bottom (Part 1)

**Files:** Modify `frontend/src/App.tsx`

- [ ] **Step 1: Remove the top-toolbar publish button** — delete the manual publish `<button>` in the toolbar (`App.tsx:1363-1372`), i.e. the whole block:
```tsx
                {newListingMode === "manual" && (
                  <button
                    type="button"
                    disabled={isPublishingManual || wizardImageCount === 0}
                    onClick={handlePublishNewListing}
                    className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    {isPublishingManual ? "Publishing…" : "Publish listing"}
                  </button>
                )}
```
Leave the "Drafts" button in the toolbar untouched.

- [ ] **Step 2: Add a full-width publish button at the bottom of the manual form** — the manual form block is `{newListingMode === "manual" && ( … )}` and its last section is "Pricing & pickup", whose `</section>` is at `App.tsx:~1649`. Immediately after that closing `</section>` (still inside the manual block, before its closing `</>`/`)}` at ~1651), insert:
```tsx
                    <button
                      type="button"
                      disabled={isPublishingManual || wizardImageCount === 0}
                      onClick={handlePublishNewListing}
                      className="w-full inline-flex items-center justify-center h-11 px-4 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      {isPublishingManual ? "Publishing…" : "Publish listing"}
                    </button>
```
(Same handler and disabled rule; `w-full` + `h-11` makes it the page's final CTA.)

- [ ] **Step 3: Typecheck + build** — `cd frontend && npm run typecheck && npm run build` → both clean. Visual: in manual mode the publish button is now the full-width button at the bottom of the form; the toolbar shows only "Drafts"; publish still works and is disabled with no photos.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/App.tsx
git commit -m "feat(sell): move manual publish button to bottom of form"
```

---

### Task 4: Hide AI/Manual toggle after segmentation (Part 3)

**Files:** Modify `frontend/src/App.tsx`

- [ ] **Step 1: Gate the toggle block on `wizardPhase === null`** — the AI/Manual toggle is the `<div className="bg-primary-soft border border-primary/20 rounded-md p-5">…</div>` block at `App.tsx:1428-1462`. Wrap that entire block in a `wizardPhase === null` guard so it disappears once the bulk flow has segmented:
```tsx
                {wizardPhase === null && (
                  <div className="bg-primary-soft border border-primary/20 rounded-md p-5">
                    {/* …existing toggle contents unchanged… */}
                  </div>
                )}
```
`wizardPhase` is the existing `useState<"review" | "reason" | "cards" | "pickup" | null>` (App.tsx:61), updated via `onPhaseChange={setWizardPhase}` on `<SellWizard>`. It is `null` during upload (pre-segmentation) and non-null from the Groups step onward; clearing/restarting the flow returns it to `null`, so the toggle reappears automatically.

- [ ] **Step 2: Typecheck + build** — `cd frontend && npm run typecheck && npm run build` → both clean. Visual: toggle visible during upload (AI or manual); after segmenting (step 2) it's gone and the flow stays in AI Drafted; clearing the flow brings it back.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/App.tsx
git commit -m "feat(sell): hide AI/Manual toggle once bulk flow has segmented"
```

---

## Self-review

- **Spec coverage:** Part 1 → Task 3 (remove top button + add bottom full-width button); Part 2 → Task 1 (blank items from groupings, brand/name seeded, condition "Good", phase `cards`) + Task 2 (two buttons in review phase, manual skips the `reason` rationale by going straight to `cards`, per-item AI regenerate untouched in `AIReviewStep`); Part 3 → Task 4 (gate toggle on `wizardPhase === null`, auto-reappears on reset). ✓
- **Placeholder scan:** none — every step has concrete code and exact anchors. ✓
- **Type consistency:** `INIT_BULK_MANUAL` defined in the union (Task 1 S1), handled in reducer (S2), declared on `SellWizardActions` (S3), created as `initBulkManual` (S4), consumed via `actions.initBulkManual()` (Task 2 S3); `onFillManually` declared on `GroupsStepProps` (Task 2 S1) and passed from `SellWizard` (S3). `BulkItemDetails` required fields all set; optional `category`/`pickupLocation` omitted by design. `Button` `variant="outline"` exists in `components/ui/button.tsx`. ✓
- **No backend changes; no `any`.** ✓
