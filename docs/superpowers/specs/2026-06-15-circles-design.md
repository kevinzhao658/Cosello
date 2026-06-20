# Circles — Design Spec

**Date:** 2026-06-15
**Status:** Approved design, pending implementation plan
**Supersedes:** the legacy "communities" seller-picks model and the backlogged "communities-as-tags reversion"

> **Revision 2026-06-19 (Phase 5):** The displayed circle set is now **neighborhood · school · mutual friends** — the **building** tag is retired from display (exact-building overlap is too rare in Manhattan to ever light up; neighborhood is the useful local-trust signal). Neighborhood becomes a first-class, opt-out circle (reuses the existing per-user neighborhood community + `community_members.share_with_mutuals`, default-on, hideable in Settings → Circles). This reverses §2's "Neighborhood is not a circle." The legacy seller-picked **Communities tiles** in My Account are removed. Building circle data may remain dormant but appears in no display path.

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

**Revised 2026-06-17 (post-design-iteration): sharing is default-on, disclosed inline, opt-out in Settings** — not a per-circle opt-in. A separate opt-in checkbox at signup tested as too much friction/confusion; the chosen model minimizes friction while staying transparent.

- **Default-on, disclosed at capture.** Circle sharing (building, school, mutual friends) is ON by default for a new account, disclosed via an inline notice on the Location and School steps (not a checkbox). Users adjust or disable any circle anytime in My Account → Circles (Phase 5). The granular per-circle control lives there.
- **Registration sets consent true.** When `register` creates the building/school memberships it sets `share_with_mutuals = true`, and sets `users.share_mutual_friends = true`. The `community_members.share_with_mutuals` column default stays `false` (safe for rows created elsewhere); registration sets it explicitly.
- **Terms acceptance required.** The review step requires an explicit "I agree to the Terms & Conditions and Privacy Policy" checkbox before the account is created.
- **Display:** a shared circle activates (lights up) when a mutual views the seller's listings; otherwise it stays faded (uniform, no leak — §4).
- **Launch metric:** since everyone starts shared, track the **opt-out** rate per circle (% who disable each in Settings), not opt-in.

Disclosure copy:
- Building (Location step): *"Your exact address stays private. We'll let others in your building know you're neighbors, so it's easier to sell to people you trust. You can change this in Settings."*
- School (School step): *"We'll let others from your school know you attended too, so it's easier to sell to people you trust. You can change this in Settings."*

## 4. Display grammar — fixed faded slots

The listing-card byline (above the photo, replacing the old hero-community byline) is **three fixed positions, always in the same order**: building · school · mutual friends, evenly distributed (`justify-content: space-evenly`).

- **Lit (violet `--primary`)** = a revealed, mutual circle. Carries a hover tooltip; mutual friends also shows an inline count.
- **Faded (`--muted-soft`, ~30% opacity)** = not a shared/revealed circle. **No tooltip.**
- A faded slot is **uniform on every card**, so it never reveals whether a seller is affiliated. Faded is indistinguishable among: not affiliated, opted out, or viewer doesn't share it. **Absence/faded never leaks affiliation.**
- Icons are **lucide** (Building, GraduationCap, Users). No emojis.
- Trust ladder: feed icon = "you share this circle" → tap into profile = the school details.

## 5. Surfaces

### 5a. Registration — wizard embedded in the sell-wizard chrome

**Revised 2026-06-17.** Registration is rebuilt to match the existing sell wizard so it drops into that flow for signed-out users. Today registration is a single form (`SignUpPage.tsx`); real auth credentials are the Twilio backlog (out of scope). Chrome (mirrors `TypedInstruction.tsx` + the sell-wizard layout):

- **Typed headline** per step — `text-4xl sm:text-5xl`, `font-extrabold`, `tracking-display`; types char-by-char (28ms after a 320ms delay); pulsing primary caret that stops when typing completes; wrapped in the global `wizardStepIn` animation. A reusable `TypedHeadline` component (generalized from `TypedInstruction`).
- **Back button** above the headline (the sell-wizard ringed chevron), shown on every step after the first.
- **No progress bar.** A centered `max-w-md` column on the app shell, no modal card.
- Each step opens with a primary-soft **icon chip** (user / building / graduation-cap) above the headline. No body commentary.
- **State persists** across Back/Edit navigation — nothing resets.

Steps:
1. **Name** — labeled First + Last; **Continue gated** until both are filled. An optional **Pronouns** dropdown (she/her, he/him, they/them, she/they, he/they, Prefer not to say) **reveals once both names are entered**.
2. **Location** — labeled Street-address autocomplete. Selecting a valid address **reveals and auto-populates City / State / Neighborhood / ZIP** (read-only, from the Mapbox geocode of the selection); derives the **building** circle; Manhattan gate enforced. **Continue gated** until a valid address is selected. The building disclosure (§3) shows at all times.
3. **School** — labeled search; selecting saves the school as a **pill below the search** (up to 2; at 2 the search bar disappears). No graduation year / status. Optional (not gated). The school disclosure (§3) shows.
4. **Review — "Does everything look good?"** — a summary card with three rows (Name + pronouns if set, Location, Schools), each with an **Edit** button jumping to that step. A single **Terms & Conditions** checkbox (required) gates **"Create profile"**. No share-circle checkbox, no preview byline (consent is default-on, disclosed on steps 2–3). The checkbox toggles in place (no re-render).

→ **Welcome** screen: primary CTA **"Start selling"** (into the sell wizard), secondary "Browse for now." Biases new users toward listing.

**Auth lifecycle (added 2026-06-17):** the user is **not** treated as signed in during the wizard — registration only completes (and `login()` fires) on "Create profile". **Any navigation away or disruption mid-wizard abandons registration and signs the Supabase OTP session out** — no completed profile is created and the header shows signed-out throughout. (No more force-trapping incomplete-profile users on the signup page; `App.tsx` abandon-on-leave effect, commit `357dfd6`.)

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
  - `register` extended: capture `pronouns`; derive building from address; accept up to 2 school claims; **set consent flags to true** (default-on model, §3) — no per-circle consent input from the client.
  - Circles management (My Account): toggle visibility, add/remove schools.
  - Feed/listing enrichment: for each listing + viewer, compute revealed-mutual circles — building match, school match, mutual-friend count — gated by the seller's `share_with_mutuals` per circle.
- **New user column:** `pronouns` (nullable string) on `users`; surfaced on the profile.
- **Retire:** seller-picks path (`CommunityPicker`, `selectedCommunityIds`, the `communities` form field on create-listing). `Listing.communities` column becomes legacy.
- **Geocoding:** the Location step's City/State/Neighborhood/ZIP come from the Mapbox geocode of the selected address — `mapboxSearch.ts` `AddressSuggestion` / `onSelect` is extended to carry `city`, `state`, `neighborhood` (it already carries `zip`). Uses existing Mapbox (geotag Phase 2), not a new dependency. (City/State are effectively fixed to New York/NY for the Manhattan MVP but are captured + displayed.)

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
