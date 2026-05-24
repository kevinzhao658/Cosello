# MyAccount Tweaks v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land two refinements on `chore/myaccount-misc-tweaks` after smoke-testing v3: wrap punchlist titles to 2 lines and restore the Status column min-width lock on Listings tables.

**Architecture:** One new commit on top of branch tip `6d1abbf`. Both changes are in `MyAccountPage.tsx`. Tiny diff (~10 lines total). No amends, no reset, no force-push.

**Tech Stack:** React 18, TypeScript, Tailwind v4. No new dependencies. No backend changes.

**Spec:** `docs/superpowers/specs/2026-05-23-myaccount-tweaks-v4-design.md` (committed `6d1abbf`).

**Branch state at plan start:** `chore/myaccount-misc-tweaks` is 15 commits ahead of dev:

```
6d1abbf docs(myaccount): v4 polish spec (punchlist title wrap + restore status lock)
5fa9222 docs(myaccount): v3 implementation plan for refinement tweaks
c706863 refactor(myaccount): punchlist full symmetry + real-time tick + clickable rows + seller bug fix
ec7f2b6 style(myaccount): drop status column min-widths + standardize Communities subheader
a8fa71d docs(myaccount): v3 refinement spec for 6 in-scope items
884dd00 feat(notifications): rebuild row anatomy with listing thumb + jade price + pickup line + stronger read fade
1ca0d67 feat(myaccount): broaden punchlist to buyer-side pickups within 1h window
9fa74d8 fix(myaccount): right-anchor listings table + lock status column edge
2d6243d docs(myaccount): implementation plan for tweaks realignment
8559516 docs(myaccount): realignment spec for tweaks 1, 3, 4
c95311e style(notifications): fade read notification text to muted
fecd640 fix(myaccount): derive punchlist client-side from loaded data
8d1dad2 feat(myaccount): rank Selling listings by action urgency
66503ac style(myaccount): left-align price/status with tight pairing
```

After this plan: 16 commits ahead of dev.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `frontend/src/pages/MyAccount/MyAccountPage.tsx` | Modify | Punchlist title classes + 6 grid-template strings on Listings tables |

No other files touched.

---

## Task 1: Wrap punchlist titles + restore Status column lock

**Files:**
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx`

### Steps

- [ ] **Step 1: Locate the punchlist item title element**

Run: `grep -n "listing_title\|formatTitle.*item.brand\|line-clamp\|truncate" frontend/src/pages/MyAccount/MyAccountPage.tsx | head -30`

Look for the `<p>` or `<span>` inside `PunchlistPanel`'s item-row rendering (~line 2860+) that renders the pickup title / offer-listing title / draft-listing title. It currently has classes like `text-sm font-semibold text-ink truncate` or similar.

Note: there may be one shared title element (a single `<p>` shared across pickup/offer/draft branches) OR three separate ones (one per branch). Inspect carefully.

- [ ] **Step 2: Update the title element(s) to wrap to 2 lines**

For each title element inside `PunchlistPanel`, change:

```tsx
<p className="text-sm font-semibold text-ink truncate">
  {/* title expression */}
</p>
```

To:

```tsx
<p className="text-sm font-semibold text-ink leading-snug line-clamp-2">
  {/* title expression UNCHANGED */}
</p>
```

Changes:
- `truncate` → `line-clamp-2` (allow up to 2 lines, ellipsis past line 2).
- Add `leading-snug` (line-height: 1.375) so 2-line titles don't crash the row vertical rhythm with default tighter leading.

Preserve all other classes (`text-sm`, `font-semibold`, `text-ink`) and the title expression itself.

**If the file's existing title styling differs slightly** (e.g., uses `text-ink/90` or `font-medium` instead of `font-semibold`), keep those existing variants — only swap `truncate` for `line-clamp-2` and add `leading-snug`.

- [ ] **Step 3: Find all 6 grid-template occurrences**

Run: `grep -n "grid-cols-\[minmax(0,1fr)_max-content_max-content\]" frontend/src/pages/MyAccount/MyAccountPage.tsx`

Expected: 6 matches across the file (Selling header + skeleton-header + row, Buying header + skeleton-header + row).

- [ ] **Step 4: Replace all 6 grid templates**

For each of the 6 matches, change:

```
grid-cols-[minmax(0,1fr)_max-content_max-content]
```

To:

```
grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)]
```

This is a clean find-and-replace — every instance is the same string, no per-site variation. Confirm the count: after the replacement, grep the OLD string should return 0; grep the NEW string should return 6.

- [ ] **Step 5: Verify the replacement counts**

Run: `grep -c "grid-cols-\[minmax(0,1fr)_max-content_max-content\]" frontend/src/pages/MyAccount/MyAccountPage.tsx`
Expected: `0`

Run: `grep -c "grid-cols-\[minmax(0,1fr)_max-content_minmax(108px,max-content)\]" frontend/src/pages/MyAccount/MyAccountPage.tsx`
Expected: `6`

- [ ] **Step 6: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0.

- [ ] **Step 7: Run build**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/MyAccount/MyAccountPage.tsx
git commit -m "$(cat <<'EOF'
style(myaccount): wrap punchlist titles + restore status column lock

Two small refinements after smoke-testing v3:

Punchlist titles change from `truncate` (single-line clip) to
`line-clamp-2 leading-snug` (wrap to 2 lines, ellipsis past line 2).
Long product names now break to a second line instead of getting
hard-clipped. Applies to pickup/offer/draft items inside
PunchlistPanel.

Listings table grid templates restore the Status column min-width
lock: from [1fr / max-content / max-content] to
[1fr / max-content / minmax(108px,max-content)]. Status pill left
edges now align at the same x-position across all rows. Price stays
content-width (v3's Price change is preserved).

Six grid-template sites updated (Selling/Buying × header/skeleton-
header/row).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Verify the commit landed**

Run: `git log -1 --oneline`

Expected: `<hash> style(myaccount): wrap punchlist titles + restore status column lock`

Run: `git log dev..HEAD --oneline | wc -l`

Expected: `16`

---

## Final verification

- [ ] **Final A: Build + typecheck**

```bash
cd frontend && npm run typecheck
cd frontend && npm run build
```

Both exit 0.

- [ ] **Final B: Manual smoke (handled by user, not implementer)**

Document in PR description so user verifies:
- **Punchlist title wrap:** a pickup or offer or draft with a long product name wraps to 2 lines. A name longer than ~80 characters truncates with "…" after the second line. Row height grows by one line for long titles but doesn't keep growing.
- **Status column lock:** open Selling and Buying tabs. Status pill's LEFT edge is at the same x-position across every row regardless of pill content length. Short pills ("Live") sit flush-left inside their 108px cell. Long pills ("Pickup in 2h 14m") fill the cell naturally.
- **Price column unchanged:** prices continue to be content-width — "$48" and "$1,250" occupy different cell widths per row. (This was v3's behavior, preserved.)

---

## Self-Review

**Spec coverage:**
- Section 1 (punchlist title wrap) → Task 1 Step 2 ✓
- Section 2 (restore Status column lock) → Task 1 Steps 3-4 ✓

**Placeholder scan:** No TBD/TODO. Each step is concrete with code blocks or commands.

**Type consistency:** No types defined or referenced in this plan. Pure CSS class swaps.

**Known fragility:** Task 1 Step 1 says "inspect carefully — title may be shared OR per-branch." Mitigated by the grep command in Step 1 returning all candidate sites for review. Step 2's instruction handles either case: apply the swap to every title element found.

**No spec gaps found.**
