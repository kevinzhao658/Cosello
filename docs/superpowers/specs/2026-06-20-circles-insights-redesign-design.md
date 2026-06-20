# Circles "Insights" Redesign — Design Spec

**Date:** 2026-06-20
**Status:** Approved design, pending implementation plan
**Supersedes:** the display grammar of `2026-06-15-circles-design.md` — specifically §4 (faded slots), §5b (feed byline), §5c (Settings rows). The data model, consent philosophy, and registration flow from that spec remain in force except where noted here.

---

## 1. Why

The Phase-5 byline is three **binary** slots (neighborhood · school · mutual-friends): each is either lit (you share it) or faded (you don't). With a small early user base almost every card shows three faded icons, which (a) looks broken and (b) frames "not a perfect match" as *untrustworthy*. 

This redesign reframes circles as **insights, not pass/fail lights**:

- **Neutral is the default and carries no judgment.** A 2nd-degree link, a different school, or a far listing are just facts shown plainly.
- **A genuine connection is a *bonus* you earn**, not a bar everyone else fails. The one element that stands out is a real connection.
- It also surfaces *gradient* information (connection degree, distance) that a binary slot can't.

## 2. The three signals

| Signal | Where it renders | What it shows |
|---|---|---|
| **Connection** | Medal ribbon, **left edge** of the byline | Degree to the seller: **1st / 2nd / 3rd**. Blank when there's no path within 3 degrees. |
| **School** | **Right edge** of the byline, with graduation-cap icon | The seller's school **short name**, shown to everyone. Bold when it's the viewer's own school. |
| **Proximity** | **Location line** (under the title), right of the neighborhood | Distance in **miles**; becomes **"Your building"** (bold) on an exact building match. |

There is no separate "neighborhood" circle anymore — neighborhood is conveyed by the location-line name (it already is), and proximity is the distance/building tag beside it.

## 3. Display grammar

### 3a. Connection — the medal ribbon
- A small **pastel medal ribbon** anchored flush to the card's left edge with a right-pointing pennant tip (no underside fold, no medal glyph).
- **Gold = 1st** (direct friend), **Silver = 2nd** (shares ≥1 mutual friend), **Bronze = 3rd** (friend-of-a-friend-of-a-friend).
- Lowercase label: `1st` / `2nd` / `3rd`.
- **Blank** (ribbon not rendered) when there is no path within 3 degrees, or when the seller has turned connection sharing off. The school stays anchored at the right edge regardless.
- Pastel tokens (light theme): gold `#FBEEC2`/text `#8A6A12`, silver `#E9ECF1`/text `#6B717A`, bronze `#F2DCC7`/text `#8E5A31`.

### 3b. School — always on, bold-when-mine
- Graduation-cap (lucide) + the school **short name** (§4), plain `--ink` text.
- Shown for **any** seller who has a school and hasn't hidden it — including schools the viewer does **not** attend (student-to-student trust cue). This is the deliberate change from the old "faded unless shared" model.
- **Bold** when the school matches one of the viewer's own schools; normal weight otherwise. Weight is the only emphasis — no color.
- Width-capped with ellipsis as the ultimate overflow guard; full name available on hover (and on the profile).
- Blank when the seller has no school or has hidden school sharing in Settings.

### 3c. Proximity — location line
- Location line reads `Neighborhood · <proximity>`.
- `<proximity>` = `N.N mi` (one decimal, miles only — **no walk-time**). 
- On an exact building match it becomes **`Your building`** in the **same color**, just **bold**. (Not a separate colored tag.)
- When the viewer's location is unknown (signed-out, or no address on file), the proximity segment is omitted and the line shows the neighborhood alone.

### 3d. Color discipline
The **medal ribbon is the only color** on the card. School, distance, and "Your building" are monochrome; their only emphasis is **bold**. This keeps the connection (the strongest trust signal) as the single eye-catch.

## 4. School short names

The school sits in a narrow right cell; full legal names ("Massachusetts Institute of Technology") overflow. We already store a computed `acronym` per `school_seed`, but a blanket acronym is wrong where it isn't the recognizable form (Columbia → "CU", Parsons → "PSD"). The earlier naming decision (`project_school_naming_decision`) explicitly favored the recognizable common name over acronyms.

**Resolution — a `short_name` per school:**
- Add `school_seed.short_name` (nullable string).
- **Default** `short_name` = the school's `acronym` when present, else the full `name`.
- **Curated overrides** for the schools the marketplace actually surfaces where the acronym isn't recognizable (e.g. Columbia → "Columbia", Parsons → "Parsons"). Because school communities are created **on demand** (only when a user claims one), this curated set is small — the in-use schools, not all ~6k seeds.
- The byline renders `short_name`; the **full name** stays on the profile and in the card's hover title. A hard CSS width cap + ellipsis remains as a last-resort safety net so nothing can ever overflow.

## 5. Backend computation & data shape

### 5a. Per-viewer enrichment (`circles` field on each listing)
Replace the current `circles` shape with:

```jsonc
circles: {
  "connection": { "degree": 1 | 2 | 3 | null },     // null = none within 3, or seller opted out
  "school":     { "shortName": "MIT",
                  "fullName": "Massachusetts Institute of Technology",
                  "isMine": false } | null,          // null = no school or hidden
  "proximity":  { "sameBuilding": false,
                  "distanceMiles": 0.4 | null }       // null = viewer location unknown
}
```

This shape is produced by `seller_circles_for_viewer` and `seller_circles_for_viewer_batch` (keep the batch path — it already kills the feed N+1).

### 5b. Connection degree
- **1st** = an accepted `Friendship` directly links viewer↔seller (reuse `are_direct_friends`).
- **2nd** = they share ≥1 mutual friend (reuse `count_mutual_friends > 0`).
- **3rd** = a path of length 3 exists: someone in the viewer's friends-of-friends set is a friend of the seller (2-hop expansion from the viewer's friend set, intersected with the seller's friends).
- Lowest degree wins (direct friend is gold even if also 2nd/3rd).
- **Consent:** gated by the seller's existing `users.share_mutual_friends` (default-on, opt-out in Settings). If off → `degree: null`.
- **Scaling:** 3rd degree is a 2-hop neighborhood expansion per seller — trivial at current graph size. Implement behind **one helper** (`connection_degree(db, viewer_id, seller_id, viewer_friends, ...)`) that the batch path feeds pre-loaded friend sets into, and **document the ceiling** in a comment: at scale this needs a cap on fan-out and/or a cached degree table. No artificial degree cap now (3rd is the natural limit of what we display).

### 5c. School (always-on)
- For each seller, load their school circle(s). Show the (first / primary) school's `short_name` + `full name`.
- `isMine` = the viewer is a member of that same school community.
- **Important display change:** the school name shows even when the seller's school membership has `share_with_mutuals=False`. School visibility is governed by a dedicated **school-visibility** signal, not the mutual-overlap consent — there is no same-school requirement to display the name (that's the point). See §5e for how this flag is stored.

### 5d. Proximity
- `distanceMiles`: **already computed** today (`main.py` uses `haversine_miles` + the buyer's ZIP centroid → `distance_miles`). Surface it into the `circles.proximity` shape per listing; round to 1 decimal. Null when the viewer has no resolvable location.
- `sameBuilding`: viewer and seller are members of the **same building community** (building memberships already derived at registration via `set_user_building`). Gated by a **building-visibility** flag (default **on**); only ever visible to a same-building viewer, so there's no broad address leak.

### 5e. Consent / visibility flags — storage decision
All three opt-outs reuse the existing per-membership `community_members.share_with_mutuals` column on the relevant circle membership (consistent with how consent already works today), **except** connection, which reuses the existing user-level `users.share_mutual_friends`. Concretely:

| Signal | Stored on | Default | Leak risk |
|---|---|---|---|
| Connection | `users.share_mutual_friends` (user-level) | on | none (only degree, no names) |
| School | `share_with_mutuals` on the **school** membership | on (shown) | reveals school broadly — **intended** |
| Building | `share_with_mutuals` on the **building** membership | on | none (only same-building viewer sees it) |
| Distance | none (logistics) | always | none (coarser than the neighborhood already shown) |

Note the semantic shift: for school/building, `share_with_mutuals` now means "show this on my listings" (a visibility toggle), not "reveal only to people who share it." Registration must set it **True** for both school and building memberships (Phase 5 set it for school but **not** building), and we backfill existing memberships to True (§7.2).

## 6. Surfaces affected

- **Marketplace feed cards** (`CircleByline.tsx`, `ListingCard.tsx`) — the new ribbon + school byline; distance/building moves to the location line.
- **Listing detail** — same grammar.
- **Sell-wizard preview card** — renders all-neutral (no viewer to compare against): no ribbon, school shown plain, neighborhood + (own) distance suppressed or "—".
- **My Account → Settings → Circles** (`CircleSettings.tsx`) — rows become **Connections (mutual friends)**, **School(s)** (+ manage, cap 2), **Building**. The **neighborhood row is removed** (no longer a displayed circle). Update the section copy and the live preview to the new byline.
- **Profile** — schools shown by full name (unchanged); profile is where the full name always lives.

## 7. Data model & migration

1. **`school_seed.short_name`** — new nullable column; backfill `= acronym ?? name`; curated overrides for in-use schools.
2. **Per-user visibility flags** — reuse the existing per-membership `community_members.share_with_mutuals` for school and building circles (already exists), OR add `users.show_school` / `users.show_building` booleans if a per-user flag is cleaner for the Settings UX. **Decision for the plan:** use the existing per-membership `share_with_mutuals` on the school/building memberships (consistent with how consent already works), set **default-on at registration** for both. This means:
   - Registration must set `share_with_mutuals=True` on the **building** membership (Phase 5 stopped doing this — re-enable it).
   - Backfill existing **building** and **school** memberships to `share_with_mutuals=True` so current users light up.
3. **Neighborhood circle** — no longer a *displayed* circle. Leave the membership rows and the ranking overlap signal intact (ranking still uses neighborhood+school overlap, §8); just stop rendering a neighborhood slot. The earlier `update_profile`-doesn't-set-neighborhood-consent bug becomes **moot for display** and can be dropped from scope (note it in the PR so it isn't re-investigated).

## 8. Ranking

`services/ranking.py::_community_overlap` uses `DISPLAYED_CIRCLE_KINDS` (neighborhood, school) for its proximity/community boost. Keep that **as-is** — ranking's overlap signal is independent of the card's display grammar. Do **not** repoint `DISPLAYED_CIRCLE_KINDS` to the new display logic; if needed, rename the ranking constant to make the decoupling explicit. (Optional future: fold connection-degree into ranking — out of scope here.)

## 9. Edge cases

- **No connection within 3 degrees** → no ribbon; school stays right-aligned (empty left slot).
- **Seller has no school** → no school token; ribbon (if any) stays left, location line unchanged.
- **Viewer signed out / no location** → no ribbon (no viewer graph), school still shown (it's seller-public), proximity omitted (neighborhood only).
- **Multiple schools** (cap 2) → byline shows one (the matching one if `isMine`, else the primary/first); both appear on the profile.
- **Long short_name** → width cap + ellipsis; full name on hover.
- **Self-view** (viewer is the seller) → neutral, no ribbon, own school plain.

## 10. Out of scope / backlog

- Connection degree beyond 3rd; degree caching/fan-out caps (documented ceiling only).
- Walk-time on the card (miles only now; the existing Mapbox walk estimate stays on the detail/geotag surfaces it already serves).
- Curating `short_name` for all ~6k seeds (only in-use schools).
- Folding connection degree into ranking.
- Any Stripe/Twilio/Photoroom/Google dependency.

## 11. QA handoff criteria

- A direct friend's listing shows a **gold** ribbon; a 2-mutual seller **silver**; a friend-of-a-friend **bronze**; a stranger (no path ≤3) shows **no ribbon**.
- Connection respects `share_mutual_friends`: seller opts out → no ribbon for anyone.
- School name shows on **every** listing whose seller has a (visible) school, regardless of viewer overlap; it is **bold** only when it's the viewer's school.
- Long school names render as the curated `short_name` and never overflow the byline; full name appears on hover and on the profile.
- Location line shows `Neighborhood · N.N mi`, switching to `Neighborhood · Your building` (bold) when viewer and seller share a building.
- Signed-out feed: schools still render, ribbons and distance do not; no crash.
- Settings → Circles shows Connections / Schools / Building rows (no Neighborhood row); toggles round-trip and the live preview matches the card.
- No regression in feed/listing endpoints for users with no circles; batch enrichment still issues a small constant number of queries.

## 12. References

- Locked visual mockups (light mode, illustrative): `.superpowers/brainstorm/<session>/content/circles-ribbon-fold.html` (final ribbon) and `circles-school-names.html` (short-name comparison). `.superpowers/` is gitignored — copy a snapshot into the plan if a durable reference is needed.
- Prior spec: `docs/superpowers/specs/2026-06-15-circles-design.md`.
- Related memory: `project_communities_as_tags_reversion`, `project_school_naming_decision`, `project_geotag_phase2_mapbox`.
