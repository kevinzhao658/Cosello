# Cosello Backlog

Deferred work surfaced during feature development. Each item has enough context to be picked up later without rediscovery.

Convention:
- **Product features** — new behavior that needs design + spec
- **Data gaps** — UI calls for data the backend doesn't produce yet
- **Tech debt** — refactors, cleanups, regressions
- **Placeholders** — temporary UI shipped to avoid visual gaps; should be removed when the real feature lands

---

## Current priorities (updated 2026-06-24)

**North star: ship `dev → main` — the first prod release of Circles + everything on `dev`.** Gated behind the queue below. Live working notes live in memory: `project_preprod_ux_bug_queue`, `project_chore_local_test_stack_punchlist`, `project_cosello_dev_test_target`.

**Queue (in order):**
1. **Prod test-data cleanup** — ✅ DONE (2026-06-24). Removed **447 orphaned `+15555` test users + their listings** (87 at the test coord (40.730,-74.000)) from PROD: 425 via `cleanup_test_users.py --apply`, the remaining 22 (which had orders/reviews/wishlist/notifications/friendships) via a full dynamic-FK sweep. Final verify: 0 orphans, 0 canary listings. *Follow-up:* extend `cleanup_test_users.py: _delete_public_deps` to also clear `purchase_orders`/`reviews`/`wishlist_*`/`notifications`/`friendships`/`join_requests` so a single `--apply` is complete next time.
2. **Pre-prod UX bugs** (details in `project_preprod_ux_bug_queue`):
   a. **Neighborhood registration** — ✅ DONE (2026-06-25). Reframed from bug-fix into a coverage expansion: added the **Queens/Brooklyn student-commuter belt** (27 ZIPs → 19 new neighborhood circles) and made registration neighborhood a **ZIP-suggested, user-editable, canonical-list-guarded** dropdown. Koreatown-type off-list labels no longer 400 (server derives canonical from ZIP). Built by Coworkers, QA-APPROVED, 8 commits on `dev` (`036f33e`..`6928a9e`), migration `0020` applied to **cosello-dev only**. Spec/plan: `docs/superpowers/specs/2026-06-25-commuter-belt-coverage-design.md`, `docs/superpowers/plans/2026-06-25-commuter-belt-coverage.md`. **Release obligation:** apply migration `0020` to PROD + run `seed_zip_centroids.py` against prod before/with the dev→main release. Manual browser E2E (Williamsburg/Astoria/Manhattan) still owed by user.
   b. **← NEXT: Marketplace still slow** — pagination (PR #70) didn't deliver perceived speed; offset pagination re-fetches the 300/500 candidate window AND re-runs FYP `score_listings` per page. Re-measure + likely move to keyset / stop per-page re-scoring.
   c. **Single-listing confirmation** — legacy formatting still surfaces; no post-submission success confirmation appears.
   d. (more pre-prod UX bugs expected.)
3. **`dev → main` release prep** — reconcile the **code↔DB skew**: prod DB already has the Circles schema + curated `school_seed`, but `main` branch has no Circles code. Confirm whether prod deploys from `dev` or migrations were applied ahead of code, so the release doesn't double-apply migrations. **Also apply migration `0020` to prod + run `seed_zip_centroids.py` against prod** (commuter belt — currently on cosello-dev only). Then ship.

**Recently shipped to `dev`** (awaiting the dev→main release):
- Circles-cleanup tech-debt pass + **server-side feed pagination** (PR #70)
- **School-search ranking** fix — exact name/short_name/acronym first (PR #71)
- **Registration session retention** + `/api/searches/top` made public (PR #72)
- **Test infra** — `ENV_FILE` hook + prod-DB safety guard in `main.py`, cosello-dev seeds (`seed_schools_fixture`, `seed_dev_storage`, `reset_dev_new_user`, portable `seed_geo_test_listings`), `data/school_seed.csv` fixture, dev-setup README section (committed directly to `dev`).

**Smaller tech-debt follow-ups:** FYP `score_listings` perf (overlaps 2b) · `communities.school_seed_id` index · schema-drift audit (models vs migrations) · `seed_fyp_fixture` refresh · README full stack refresh (partial done) · httpx2 test client · `#signin` deep-link session hygiene · NavigationContext / App.tsx render extraction.

---

## Product features

### Sell-flow community selector
- **What:** When a user creates a listing, they should pick which communities to post it to (currently no UI for this — listings have no `allCommunities` association at creation).
- **Why it matters:** Communities are the trust signal. The marketplace card trust band currently falls back to `PLACEHOLDER_COMMUNITY ("Cosello")` for every listing without a community — visually consistent but informationally empty.
- **Surfaces:** Sell wizard (single + bulk), New Listing page (R-4)
- **Backend:** `POST /api/listings` already accepts a `communities` form field; the sell wizard sends `""` today. Wire a multi-select to the existing community list.
- **Status:** Blocking the removal of `PLACEHOLDER_COMMUNITY` in `lib/listings.ts`.

### Make an offer (buyer ↔ seller price negotiation)
- **What:** Buyer enters an offer amount on a listing → seller accepts/rejects.
- **Why deferred:** Project rule (memory 2026-05-01): `Listing.price` IS the transaction price; no `PurchaseOrder.final_price` snapshot column. Negotiation is explicitly out of scope today.
- **Current state:** ListingDetailModal shows a disabled input + Send button with tooltip "Offers coming soon" (placeholder per user request 2026-05-18).
- **If/when revisited:** Need `POST /api/offers`, `offers` table, notification types for `offer_made` / `offer_accepted` / `offer_rejected`, decision on whether accepted offer becomes the final transaction price or stays separate.

### Geotagging / Google Maps integration
- **What:** Real map in the Listing Detail Location tab. Pin at the pickup neighborhood, distance computation from the buyer's saved address.
- **Why deferred:** Google Maps integration is in the backlog list in CLAUDE.md (one of the four future API integrations alongside Stripe Connect, Photoroom, Twilio). No SDK currently included.
- **Current state:** Location tab renders a static map placeholder (grid pattern + animated MapPin + radial tints). The "Distance from you" facts-line row shows "Not available yet."
- **Surfaces:** ListingDetailModal Location tab; marketplace listing card distance subtitle; sidebar distance slider (currently a visual-only control).
- **Dependencies:** Google Maps JS SDK + API key, backend lat/long columns on `users.pickup_address` and `listings.pickup_location`, distance computation either client-side (Haversine) or via Maps Distance Matrix API.

### Trending sort (marketplace)
- **What:** "Trending" segmented-control option on the marketplace.
- **Current state:** Routes to backend `sort=newest`. Same fallback for "Recommended" (which uses the FYP scoring path).
- **Backend need:** View-count window (last 24h / 7d) on listings, exposed as a sort mode.

### New Listing — Save draft
- **What:** Persist an in-progress listing so the user can come back and finish it.
- **Why:** R-4 New Listing page exposes a "Save draft" toolbar button per design, but no drafts table exists today.
- **Current state:** Button shows an alert ("Drafts are coming soon") on click.
- **Backend need:** `drafts` table (one row per in-progress listing per user), `POST /api/listings/drafts`, `GET /api/listings/drafts/:id`, `DELETE /api/listings/drafts/:id`. Drafts page in My account to resume.

### New Listing — price suggestion pill
- **What:** "Suggested $X – $Y" pill in the Pricing & pickup section of the New Listing page.
- **Current state:** Hardcoded `$60 – $120` placeholder.
- **Backend need:** Reuse the queued pricing seed DB / condition-to-discount model (see memory `project_pricing_model.md`, `project_pricing_seed_db_queued.md`). Endpoint shape TBD — likely `POST /api/pricing/suggest` taking `{ brand, name, category, condition }` → `{ low, high }`.

### Notifications UX overhaul
- **What:** Group notifications by order/community, inline actions, "needs action" vs "informational" vs "done" visual hierarchy.
- **Why:** Current panel treats every event as a flat-list timeline item; juggling multiple orders is hard.
- See `memory/project_notifications_rethink.md` for full context.

### Real seller signals
- **Mutual communities count** — design shows "2 mutual communities" with overlapping avatars on the seller banner; data doesn't exist yet. UI currently omits the row.
- **Online presence dot** — design shows a green dot on seller avatar; no realtime presence in the codebase. Currently omitted.
- **Verified seller badge** — checkmark next to seller name. Currently shows only if `seller_verified` field exists (unused today).
- **Seller response time** — "Responds within 1h" copy. Currently omitted.

### Communities forum
- **What:** Reddit-style feed replacing the current `#communities` page (4 post types: Spotlight, Grid, Text, Buy Request, optional Polls).
- **Why deferred:** Explicitly scoped out of the UI redesign feature per user decision (2026-05-18). The page picks up new design tokens from R-1 so it doesn't look broken, but behavior stays.
- **Backend need:** `posts`, `votes`, `comments` tables + endpoints.

### iOS app conversion
- **What:** Native iOS distribution.
- **Why deferred:** Explicitly out of scope for the mobile-friendly redesign (user decision 2026-05-18 — responsive web only for the third feature).
- **Decision needed when revisited:** Capacitor wrap vs React Native rewrite vs Swift native.

### OrderManagementModal full lift to App
- **What:** Extend the R-5.6 OrderModalsContext lift to also own OrderManagementModal (the seller-side pending-order picker — slot radio chips, time selector, confirm/decline) so `purchase` notifications open it in place on whatever page the seller is on, rather than routing to /account first.
- **Why deferred:** R-5.6 Task #22 Part B shipped the three already-standalone modals (OrderConfirmSummary, PickupAttestation, Rating). OrderManagementModal is defined inline in MyAccountPage (~190 LOC of JSX) with 7 pieces of local state (`selectedSlot`, `confirmTime`, `showDeclineConfirm`, `listingOrders`, `isLoadingOrders`, `confirmingOrderId`, `decliningOrderId`) and 3 handlers (`openOrderModal`, `handleConfirmSlot`, `handleDeclineOrder`) plus side effects (refetch wiring, history logging, post-confirm summary chain). Estimated ~400-500 LOC delta and high regression risk — out of scope for the polish PR.
- **Lift plan when revisited:** (1) extract the inline JSX into a new `frontend/src/features/orders/OrderManagementModal.tsx`. (2) Move the state + handlers into OrderModalsContext alongside the existing three modals. (3) Add `openOrderManagement(listingId: string)` to the context — fetches `/api/orders`, filters for `role === "seller" && status === "pending" && listing_id === X`, builds the partial MyListing payload from order denormalized fields. (4) Hook handleConfirmSlot's success path back into the `showOrderConfirmSummary` context opener (already wired). (5) Update App's `handleNotifClick` to route `purchase` notifications to `openOrderManagement` and drop the /account routing for that type. (6) Refactor MyAccountPage callsites (Punchlist row, Listings-tab "Review N offers" button, the `pendingListingId` auto-open watcher) to call into the context opener.
- **Side effects to coordinate:** `handleConfirmSlot` currently calls `onAddToHistory`, `fetchMyListings`, `fetchAllOrders`, `fetchPunchlist` — the lift needs to fire the existing `subscribeAfterAction` for the refetches and either route history through the same subscription or pass it as a prop.

### Edit pending order from buyer-side tile (hover affordance)
- **What:** R-5.6 Task #21 part 2 — a hover-revealed Edit icon next to the "Pending" overlay on a buyer's pending order tile (MyAccount → Listings → Buying segment). Clicking opens the BuyModal in edit mode pre-seeded with the existing `selected_pickup_slots`.
- **Why deferred:** BuyModal requires a full `Listing` object but the buyer-side OrderData payload only carries `listing_id`, `listing_title`, `listing_image`, `listing_price`. There's no `GET /api/listings/{id}` endpoint to hydrate a Listing from the order — the current Edit-pickup-slots flow only works from inside ListingDetailModal where the Listing object is already in memory.
- **Backend need:** Either (a) a `GET /api/listings/{id}` single-listing endpoint that returns the full Listing shape, or (b) extend `GET /api/orders/status/{listing_id}` to embed the full listing payload alongside the order. (a) is the cleaner shape and also unblocks any future deep-linking via listing id.
- **Frontend need:** Lift an `openEditOrder(orderId, listingId)` helper into App.tsx that fetches the listing, then calls the existing `openEditPickupSlots(listing, orderId, existingSlots)`. Plumb as a prop into MyAccountPage. On the buyer-side tile, render a jade circle (`size-6 rounded-full bg-canvas/95 backdrop-blur-sm border border-hairline inline-flex items-center justify-center text-ink hover:bg-surface-soft`) with a Pencil icon to the right of the Pending overlay, shown via `group-hover` on the article.
- **Status:** R-5.6 shipped the prominent "Pending" overlay (uppercase tracking-widest jade pill matching the marketplace "Sold" treatment) but deferred the hover-edit affordance per the brief's escape hatch — current workaround is to click into the listing detail modal from outside MyAccount and use the existing Edit pickup slots button there.

### Live chat (buyer ↔ seller messaging)
- **What:** Real-time messaging between buyer and seller, gated to active or completed transactions for trust.
- **Why deferred:** No messaging infrastructure today. The notifications panel and design both reference an `unread_messages` punchlist row that currently returns empty.
- **Backend need:** `messages` table (buyer_id, seller_id, listing_id, body, read_at, created_at), realtime channel for live delivery, `GET /api/messages?listing_id=X`, `POST /api/messages`, mark-read endpoint. Probably scoped to a PurchaseOrder context initially (no DMs outside a transaction).
- **Surfaces:** Message icon in global nav (currently a placeholder, no route). Per-listing chat thread accessible from BuyModal / Listing Detail / Order Management. Inline chat affordance in seller-side punchlist row "Respond to messages".
- **Frontend need:** Chat thread UI, optimistic message send + revert on failure, presence/typing indicator (optional), unread count integration into Bell unread dot.

### Footer menu
- **What:** Persistent site footer with utility links — About, Trust & Safety, Privacy, Terms, Help & Support, Communities Guidelines, Pickup Etiquette, social links.
- **Why deferred:** Current design has no footer; the focus has been the main-app surfaces. Without a footer, users can't easily reach legal/policy pages or discover supporting content.
- **Surfaces:** Bottom of every authenticated and unauthenticated page; collapsed link list on mobile, multi-column on desktop.
- **Decisions needed:** Which pages exist today (Help & Support exists but needs reskin — backlog item below), which need to be created (Trust & Safety, Privacy, Terms), what social handles to surface.

### Dark mode token set
- **What:** Parallel `[data-theme="dark"]` token block in `theme.css` mirroring every Brutalist Trade token (canvas → ink, ink → canvas, surface-* inverted, hairline/border-strong dark variants, primary-soft / primary-tint dark-friendly bg, etc.).
- **Current state:** Settings → Accessibility → "Dark mode" toggle is wired (R-5.13). `SettingsProvider` sets `data-theme="dark"` on `<html>` when enabled and persists to localStorage. Visually inert today — no dark token set exists.
- **Why deferred:** Brutalist Trade theme is intentionally light-only for MVP. Dark-mode tokens are a design decision that should follow the same brand audit as the light tokens (contrast, jade accent variant, surface hierarchy in dark) rather than a mechanical inversion.
- **Surfaces:** Every page that reads canvas / ink / surface-* / hairline / border-strong tokens (i.e. everything).
- **Effort:** Audit existing tokens → choose dark counterparts → add `[data-theme="dark"] :root { ... }` block to `theme.css`. No code changes needed in SettingsProvider; the attribute is already toggled.

### Color-blind accent palette
- **What:** `[data-cb="protanopia" | "deuteranopia" | "tritanopia"]` blocks in `theme.css` that remap the jade accent (`--primary`, `--primary-soft`, `--primary-tint`, `--on-primary`) and the warning hue (`--warning`) to palette-safe alternates for each form of color blindness.
- **Current state:** Settings → Accessibility → "Color-blind mode" segmented control wired (R-5.13). `SettingsProvider` sets `data-cb="<mode>"` on `<html>` when non-`off` and persists to localStorage. Visually inert today — Brutalist Trade's single jade accent is already sufficiently distinguishable in most cases, so the deferred work is the targeted hue remap, not a full re-theme.
- **Why deferred:** Single-accent design is mostly accessible by construction. The remap is a polish item to surface when accessibility audits land.
- **Surfaces:** Every accent-bearing surface (CTAs, jade pills, trust band dot, status pills, warning pills).
- **Effort:** Pick color-blind-safe alternates per mode, drop in CSS variable overrides under each `[data-cb=...]` selector. No code changes in SettingsProvider.

---

## Data gaps

### `AuthUser` missing `verified` and `created_at`
- **What:** The MyAccount header meta strip (R-5.11) calls for a "Member since Mar 2024" entry and conditionally hides the jade "Verified" badge based on a `verified` flag. Neither field exists on `AuthUser` in `frontend/src/contexts/AuthContext.tsx`.
- **Current state:** "Verified" is rendered unconditionally for any signed-in user (matches prior behavior — the old `ShieldCheck · Verified` chip was also unconditional). The Member-since line is omitted entirely; the previous implementation computed `new Date()` on render, which faked the data and would have read "Member since May 2026" on every visit.
- **Backend:** `users` table likely has a `created_at` already (SQLAlchemy default). Surface it in the `/api/auth/profile` response and the auth token payload. The `verified` flag is a new concept tied to phone/identity verification — out of scope until Twilio integration lands.
- **Surfaces:** MyAccount header meta strip (R-5.11), any future profile/trust surfaces.

---

## Tech debt

### Unused `TAB_BTN_BASE` export
- **What:** `frontend/src/pages/MyAccount/constants.ts` exports `TAB_BTN_BASE` (pill-segmented base class). After R-5.11 swapped the account tab strip to the editorial underlined style, no callsite references it. The selling/buying segmented toggles use `SEG_BTN_BASE`, not `TAB_BTN_BASE`.
- **Action:** Delete the export, or keep if a future segmented-pill control is anticipated. Single-line removal.
- **Surfaced by:** R-5.11 (2026-05-20).

### Extract listing handlers into `backend/routers/listings.py`
- **What:** Listings live in `backend/main.py` (~700 LOC of handlers in a single file) while every other domain (auth, orders, wishlist, communities, punchlist) lives in `backend/routers/*.py`. Inconsistent.
- **Why it matters:** Adding new listing endpoints (R-5.8 DELETE, future drafts/analytics) means touching the giant main.py instead of a focused router file. main.py grows hostile.
- **Effort:** Move existing handlers into `routers/listings.py`, register via `app.include_router(...)` in main.py. ~700 LOC migration, mechanical. Verify migration block + seed paths still work.
- **Surfaced by:** R-5.8 backend agent (2026-05-19) when adding DELETE endpoint.

### Three unextracted MyAccountPage modals
- `ListingsModal` (~305 lines)
- `CommunityDetailModal` (~390 lines)
- `OrderManagementModal` (~220 lines)
- 15+ callback/state props each. Agent's honest flag during PR-E: would need state lifting or prop bundles. Stayed in the MyAccount shell.

### Icon-import deduplication
- Each extracted modal imports its own lucide icons; +~3 kB gzip on the MyAccountPage chunk after PR-E. Centralize via a barrel or shared icons module.

### HomePage / MarketPage route extraction
- App.tsx is ~1880 lines after R-3 (was 5197 pre-simplify). Route-level components would split further but urgency is gone.

### BuyModal `text-white/30` leftover
- `BuyModal.tsx:204` on the "This listing has expired" empty state. Should be `text-muted-soft`. Single class swap, roll into next polish pass.

### `--accent-foreground` collides with `--ink`
- Both are `#000000`. Default Radix DropdownMenu `focus:bg-accent focus:text-accent-foreground` → black-on-black. R-2 polish PR worked around it by overriding per `DropdownMenuItem`. Permanent fix: change `--accent-foreground` to `--on-primary` (white) or pick a different focus token convention.

---

## Active placeholders (remove when their feature ships)

| Placeholder | Where | Remove when |
|---|---|---|
| `PLACEHOLDER_COMMUNITY` ("Cosello") | `lib/listings.ts`, used in marketplace card + ListingDetailModal trust band | Sell-flow community selector ships and existing listings are backfilled |
| Make Offer disabled input + Send button | `ListingDetailModal.tsx` (Details tab) | Offers feature ships |
| Map placeholder (grid + animated pin) | `ListingDetailModal.tsx` Location tab | Google Maps integration |
| Distance slider (visual only) | `MarketplaceSidebar.tsx` | Backend distance computation |
| "Distance from you" → "Not available yet" | `ListingDetailModal.tsx` Location tab facts row | Backend distance computation |
