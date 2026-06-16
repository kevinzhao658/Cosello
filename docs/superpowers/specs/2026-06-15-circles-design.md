# Circles — Design Spec

**Date:** 2026-06-15
**Status:** Approved design, pending implementation plan
**Supersedes:** the legacy "communities" seller-picks model and the backlogged "communities-as-tags reversion"

---

## 1. Overview

Replace **communities** (which had drifted into seller-selected posting targets) with **Circles**: passive identity and trust signals attached to *people*, surfaced on listings only as **mutual, opted-in** tags. This restores the core product thesis: community identity is a trust layer overlaid on listings, never a market container.

Sellers no longer choose where to "post." A listing inherits the seller's circles automatically; each circle surfaces to a viewer only when (a) the viewer shares that circle and (b) the seller has opted in to revealing it.

## 2. Circle types (exactly three)

| Circle | Source | Captured | Tag label |
|---|---|---|---|
| **Building** | Normalized street address (same address = same building) | Registration, from the address (no separate field) | "Same building" |
| **School** | User-claimed from a US higher-ed seed list; **up to 2** | Registration (optional) + My Account | School name (e.g. "NYU") |
| **Mutual friends** | Existing friend graph; count of shared friends viewer↔seller | Derived live (no capture) | "N mutual friends" |

**Neighborhood is not a circle.** It is conveyed by the listing's location line (neighborhood + distance in **miles**, e.g. "Chelsea · 0.6 mi"), so a fourth circle would be redundant.

**School details:**
- Claim-only. **No `.edu` email verification** (removed as too heavy; introduced an email-provider dependency and excluded alumni whose `.edu` addresses are deactivated).
- The 2-school cap is the only anti-gaming guard.
- Backed by a Cosello-owned seed table of US accredited higher-ed institutions (~6k rows), one-time bootstrap from a public dataset (College Scorecard / IPEDS). No runtime external API. Aligns with the "core data lives in our own tables" rule.

## 3. Consent model

- **Per-circle opt-in.** Each circle has its own visibility toggle (`share_with_mutuals`).
- **Default: nothing shared.** Forced active choice at registration (no skippable default on the consent step) so the launch opt-in metric measures genuine intent.
- **Opt in →** the circle *activates* (lights up) when a mutual views the seller's listings.
- **Opt out →** the circle stays *permanently faded*, even when a mutual views the listing.
- **Launch metric:** track per-circle opt-in rate (% of users enabling building / school / mutual friends).

## 4. Display grammar — fixed faded slots

The listing-card byline (above the photo, replacing the old hero-community byline) is **three fixed positions, always in the same order**: building · school · mutual friends, evenly distributed (`justify-content: space-evenly`).

- **Lit (violet `--primary`)** = a revealed, mutual circle. Carries a hover tooltip; mutual friends also shows an inline count.
- **Faded (`--muted-soft`, ~30% opacity)** = not a shared/revealed circle. **No tooltip.**
- A faded slot is **uniform on every card**, so it never reveals whether a seller is affiliated. Faded is indistinguishable among: not affiliated, opted out, or viewer doesn't share it. **Absence/faded never leaks affiliation.**
- Icons are **lucide** (Building, GraduationCap, Users). No emojis.
- Trust ladder: feed icon = "you share this circle" → tap into profile = the school details.

## 5. Surfaces

### 5a. Registration — 4-step wizard + welcome

Today registration is a single form (`SignUpPage.tsx`) collecting name, street address, neighborhood, ZIP via `POST /api/auth/register`. There is no auth credential step (real auth is the Twilio backlog, out of scope). Segment it into:

1. **Name** — first + last.
2. **Location** — street address autocomplete; **neighborhood + ZIP auto-derived** from the address via Mapbox reverse-geocoding (Manhattan gate enforced here); derives the **building** circle. Disclosure copy: *"Your address always stays private, unless you choose to share it with mutuals or confirmed buyers."*
3. **School** — search and select from the seed list; up to 2; **optional with Skip**. Copy: *"We use this to connect you with other students or alumni from your university."*
4. **Circles consent** — the Yes/No clicker, **only for circles the user actually has** (skip school → building + mutual friends only). Per-circle question "Show to {people} from your {circle}", Yes/No answers, live preview byline that lights the slot on Yes, Back navigation between steps, forced choice (Continue locked until answered).

→ **Welcome** screen: primary CTA **"Start selling"** (into the sell wizard), secondary "Browse for now." Deliberately biases new users toward listing.

Consent clicker copy: prompt *"Would you like mutuals to view your circles?"*; blurb *"Sharing a circle reveals it only when others in the same circle are viewing your listings."*

### 5b. Marketplace feed

- Listing card byline = the fixed three-slot grammar (§4). Lit on revealed-mutual, faded otherwise, no faded tooltips, mutual-friends count when lit.
- Location line carries neighborhood + distance in miles.
- Behind the scenes: keep circle-overlap as a feed-ranking boost (already exists in `ranking.py` as the community-overlap signal; repoint to circles).

### 5c. My Account → Settings → Circles

- Three rows: **Building**, **Schools**, **Mutual friends**, each with the app's toggle switch (visibility on/off).
- Schools row: chips with remove (×) + autocomplete to add, capped at 2 ("Maximum of 2 schools. Remove one to add another.").
- Live preview ("How mutuals will see your listings") reflecting toggles.
- Section copy: *"Opting in will activate your circle when mutuals view your listings. Opting out will leave your circle permanently faded, even if a mutual views your listings."*

### 5d. Profile

- Schools shown plainly in the identity line near name/neighborhood (e.g. `Chelsea, Manhattan · NYU · Columbia`). **No verification check** (verification removed).
- Listing cards keep the icon-only byline.

## 6. Backend impact (high level)

- **Models:** `Circle` (type: building | school, identifier), `CircleMembership` (user_id, circle_id, `share_with_mutuals`). Building = normalized address entity; School = seed-table row. Mutual friends reuses the friend graph (no membership rows).
- **Seed:** US higher-ed institutions table (one-time bootstrap).
- **Endpoints:**
  - `register` extended: derive building from address, accept up to 2 school claims, capture per-circle consent flags.
  - Circles management (My Account): toggle visibility, add/remove schools.
  - Feed/listing enrichment: for each listing + viewer, compute revealed-mutual circles — building match, school match, mutual-friend count — gated by the seller's `share_with_mutuals` per circle.
- **Retire:** seller-picks path (`CommunityPicker`, `selectedCommunityIds`, the `communities` form field on create-listing). `Listing.communities` column becomes legacy.
- **Geocoding:** neighborhood auto-derive uses existing Mapbox (geotag Phase 2), not a new dependency.

## 7. Out of scope / backlog

- `.edu` email verification and any email-sending provider (removed).
- Twilio / real auth credentials (existing backlog).
- High schools as a school sub-type (higher-ed only for v1).
- Migration of existing `Listing.communities` data (handle in implementation plan).

## 8. Open items / risks

- **Mutual-friends consent at registration** is forward-looking — a new user has no friends yet. The toggle is still set then; acceptable.
- **Legacy data migration:** existing seller-picked communities → decide whether to map to circles or drop. Resolve in the plan.
- **Mobile tooltips:** lit-slot tooltips don't exist on touch; the school detail still lives on the profile, so the feed remains usable without hover.

## 9. QA handoff criteria

- Registration completes through all 4 steps; Skip on school yields a 2-card consent step.
- Consent default is off; a circle only lights for a viewer who shares it AND when the seller opted in.
- Faded slots never show tooltips; lit slots do; mutual-friends count renders only when lit.
- My Account toggles and school add/remove (cap 2) round-trip to the backend and reflect in the preview.
- Profile shows schools without verification marks.
- No regression in the existing feed/listing endpoints for users with no circles.
