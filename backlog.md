# Cosello Backlog

Deferred work surfaced during feature development. Each item has enough context to be picked up later without rediscovery.

Convention:
- **Product features** — new behavior that needs design + spec
- **Data gaps** — UI calls for data the backend doesn't produce yet
- **Tech debt** — refactors, cleanups, regressions
- **Placeholders** — temporary UI shipped to avoid visual gaps; should be removed when the real feature lands

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

---

## Tech debt

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
