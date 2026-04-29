"""Manual eval harness for the hybrid vision listing pipeline.

Runs a fixed canary set of local images against POST /api/generate-listing
and prints a side-by-side comparison of expected vs returned brand / model /
category, plus a tally of identification hits.

Manual only — NOT wired into CI. Requires:
  - The backend running locally (default http://127.0.0.1:8000).
  - Real image files placed under backend/tests/eval/fixtures/ matching the
    relative paths declared in CANARIES below.
  - A live GOOGLE_APPLICATION_CREDENTIALS for the Vision side; without it the
    pipeline will retrieval_fallback=True and identification hits will mostly
    miss — that mode is still useful for sanity-checking the fallback path.

Usage:
    cd backend
    python tests/eval/listing_eval.py
    python tests/eval/listing_eval.py --base-url http://127.0.0.1:8000
    python tests/eval/listing_eval.py --only clothing electronics
    python tests/eval/listing_eval.py --mode bulk
    python tests/eval/listing_eval.py --mode all
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import mimetypes

import requests


FIXTURES_DIR = Path(__file__).parent / "fixtures"
DEFAULT_BASE_URL = "http://127.0.0.1:8000"


@dataclass
class Canary:
    canary_id: str
    category: str
    images: list[str]
    expected_brand: str | None
    expected_model: str | None
    expected_category: str
    notes: str = ""

    def image_paths(self) -> list[Path]:
        return [FIXTURES_DIR / rel for rel in self.images]


CANARIES: list[Canary] = [
    # ---------- Clothing (3) ----------
    Canary(
        canary_id="clothing_01_polo_flannel",
        category="clothing",
        images=["Clothing/polo_flannel.JPG"],
        expected_brand="Polo Ralph Lauren",
        expected_model=None,
        expected_category="clothing",
        notes="Flannel shirt — brand identification from logo/tag.",
    ),
    Canary(
        canary_id="clothing_02_polo_jacket",
        category="clothing",
        images=["Clothing/polo_jacket.jpeg"],
        expected_brand="Polo Ralph Lauren",
        expected_model=None,
        expected_category="clothing",
        notes="Jacket — second Polo item, brand consistency check.",
    ),
    Canary(
        canary_id="clothing_03_urbanoutfitters_buttondown",
        category="clothing",
        images=["Clothing/urbanoutfitters_shortsleevebuttondown.JPG"],
        expected_brand="Urban Outfitters",
        expected_model=None,
        expected_category="clothing",
        notes="Short sleeve button-down — mid-tier brand identification.",
    ),

    # ---------- Furniture (1) ----------
    Canary(
        canary_id="furniture_01_ikea_alvdalen_couch",
        category="furniture",
        images=["Furniture/Ikea_ÄLVDALEN_Couch.jpg"],
        expected_brand="IKEA",
        expected_model="ÄLVDALEN",
        expected_category="furniture",
        notes="Couch — exercises carry_difficulty (should be 'two_person' or 'truck').",
    ),

    # ---------- Electronics (1) ----------
    Canary(
        canary_id="electronics_01_toshiba_tv",
        category="electronics",
        images=["Electronics/Toshiba_TV.jpeg"],
        expected_brand="Toshiba",
        expected_model=None,
        expected_category="electronics",
        notes="TV — mainstream brand identification from logo.",
    ),

    # ---------- Sports (1) ----------
    Canary(
        canary_id="sports_01_wellfit_walking_pad",
        category="sports",
        images=["Sports/Wellfit_WalkingPad.PNG"],
        expected_brand="Wellfit",
        expected_model="Walking Pad Under Desk Treadmill",
        expected_category="sports",
        notes="Niche brand — primary motivation for the Vision retrieval layer. Brand is Wellfit (NOT WalkingPad / KingSmith).",
    ),

    # ---------- Collectibles (1) ----------
    Canary(
        canary_id="collectibles_01_reagan_coin",
        category="collectibles",
        images=["Collectibles/Reagan_Coin.jpeg"],
        expected_brand=None,
        expected_model=None,
        expected_category="collectibles",
        notes="Commemorative coin — no brand expected. Tests collectibles category assignment.",
    ),
]


@dataclass
class BulkItem:
    """One item inside a bulk canary, recycled from individual canaries / fixtures."""
    image: str  # path relative to FIXTURES_DIR
    expected_brand: str | None
    expected_model: str | None
    expected_category: str

    def image_path(self) -> Path:
        return FIXTURES_DIR / self.image


@dataclass
class BulkCanary:
    """A multi-item upload that exercises the bulk path of /api/generate-listing.

    The harness posts every item's image in one request and verifies that:
      1. Each expected item is identified correctly (brand / category).
      2. Brands do NOT bleed across listings — i.e., a returned listing's
         brand never matches a *different* item's expected brand.
      3. Two distinct items are not collapsed into a single listing.
    """
    canary_id: str
    items: list[BulkItem]
    notes: str = ""


# Bulk canaries — recycle individual canary fixtures to exercise the bulk path.
# The first one is the direct reproducer for the brand-bleed bug
# (Samsonite contaminating the Coach Duffel listing).
BULK_CANARIES: list[BulkCanary] = [
    BulkCanary(
        canary_id="bulk_01_coach_vs_samsonite",
        items=[
            BulkItem(
                image="accessories/Coach_Duffle.jpeg",
                expected_brand="Coach",
                expected_model="Duffle",
                expected_category="accessories",
            ),
            BulkItem(
                image="other/Samsonite_Armage2.jpeg",
                expected_brand="Samsonite",
                expected_model="Armage",
                expected_category="other",
            ),
        ],
        notes="Direct reproducer of the brand-bleed bug. Coach Duffel must NOT be titled 'Samsonite' and vice versa.",
    ),
    BulkCanary(
        canary_id="bulk_02_mixed_categories",
        items=[
            BulkItem(
                image="accessories/Coach_Duffle.jpeg",
                expected_brand="Coach",
                expected_model="Duffle",
                expected_category="accessories",
            ),
            BulkItem(
                image="other/Samsonite_Armage2.jpeg",
                expected_brand="Samsonite",
                expected_model="Armage",
                expected_category="other",
            ),
            BulkItem(
                image="electronics/Apple_MacbookPro.jpeg",
                expected_brand="Apple",
                expected_model="MacBook Pro",
                expected_category="electronics",
            ),
            BulkItem(
                image="shoes/Nike_AirForce1.jpg",
                expected_brand="Nike",
                expected_model="Air Force 1",
                expected_category="shoes",
            ),
        ],
        notes="Cross-category stress test — 4 items, 4 distinct brands, 4 distinct categories. Verifies per-image evidence scoping holds at scale.",
    ),
]


@dataclass
class BulkItemResult:
    """Score for one expected item inside a bulk canary."""
    item: BulkItem
    matched_listing: dict[str, Any] | None
    returned_brand: str | None
    returned_category: str | None
    bled_from_brand: str | None  # the OTHER item's expected brand that the returned brand matches, if any
    collapsed_with: list[str] = field(default_factory=list)  # other expected brands sharing this returned listing

    @property
    def brand_hit(self) -> bool:
        if self.item.expected_brand is None:
            return self.returned_brand in (None, "", "Unknown", "unknown")
        if not self.returned_brand:
            return False
        return self.item.expected_brand.lower() in self.returned_brand.lower()

    @property
    def category_hit(self) -> bool:
        if not self.returned_category:
            return False
        return self.item.expected_category.lower() == self.returned_category.lower()


@dataclass
class BulkCanaryResult:
    canary: BulkCanary
    skipped_reason: str | None = None
    error: str | None = None
    item_results: list[BulkItemResult] = field(default_factory=list)
    retrieval_fallback: bool | None = None
    raw: list[dict[str, Any]] = field(default_factory=list)

    @property
    def has_bleed(self) -> bool:
        return any(r.bled_from_brand for r in self.item_results)

    @property
    def has_collapse(self) -> bool:
        return any(r.collapsed_with for r in self.item_results)


@dataclass
class CanaryResult:
    canary: Canary
    skipped_reason: str | None = None
    error: str | None = None
    returned_brand: str | None = None
    returned_model: str | None = None
    returned_category: str | None = None
    retrieval_fallback: bool | None = None
    raw: list[dict[str, Any]] = field(default_factory=list)

    @property
    def brand_hit(self) -> bool:
        if self.canary.expected_brand is None:
            return self.returned_brand in (None, "", "Unknown", "unknown")
        if not self.returned_brand:
            return False
        return self.canary.expected_brand.lower() in self.returned_brand.lower()

    @property
    def model_hit(self) -> bool:
        if self.canary.expected_model is None:
            return True
        if not self.returned_model:
            return False
        return self.canary.expected_model.lower() in self.returned_model.lower()

    @property
    def category_hit(self) -> bool:
        if not self.returned_category:
            return False
        return self.canary.expected_category.lower() == self.returned_category.lower()


def _post_canary(base_url: str, canary: Canary) -> CanaryResult:
    paths = canary.image_paths()
    missing = [str(p) for p in paths if not p.exists()]
    if missing:
        return CanaryResult(canary=canary, skipped_reason=f"missing fixtures: {missing}")

    files = []
    open_handles = []
    try:
        for p in paths:
            fh = open(p, "rb")
            open_handles.append(fh)
            mime = mimetypes.guess_type(str(p))[0] or "image/jpeg"
            files.append(("images", (p.name, fh, mime)))

        try:
            resp = requests.post(f"{base_url}/api/generate-listing", files=files, timeout=120)
        except requests.RequestException as exc:
            return CanaryResult(canary=canary, error=f"request failed: {exc}")

        if resp.status_code != 200:
            return CanaryResult(
                canary=canary,
                error=f"HTTP {resp.status_code}: {resp.text[:200]}",
            )

        try:
            payload = resp.json()
        except json.JSONDecodeError as exc:
            return CanaryResult(canary=canary, error=f"non-JSON response: {exc}")

        items = payload if isinstance(payload, list) else [payload]
        first = items[0] if items else {}
        return CanaryResult(
            canary=canary,
            returned_brand=first.get("categoryAttributes", {}).get("brand", first.get("brand")),
            returned_model=first.get("categoryAttributes", {}).get("model", first.get("model")),
            returned_category=first.get("category"),
            retrieval_fallback=bool(first.get("retrieval_fallback")),
            raw=items,
        )
    finally:
        for fh in open_handles:
            try:
                fh.close()
            except Exception:
                pass


def _extract_brand(listing: dict[str, Any]) -> str | None:
    return listing.get("categoryAttributes", {}).get("brand", listing.get("brand"))


def _extract_category(listing: dict[str, Any]) -> str | None:
    return listing.get("category")


def _extract_image_indices(listing: dict[str, Any]) -> list[int]:
    raw = listing.get("imageIndices") or listing.get("image_indices") or []
    out: list[int] = []
    for v in raw:
        try:
            out.append(int(v))
        except (TypeError, ValueError):
            continue
    return out


def _post_bulk_canary(base_url: str, canary: BulkCanary) -> BulkCanaryResult:
    paths = [item.image_path() for item in canary.items]
    missing = [str(p) for p in paths if not p.exists()]
    if missing:
        return BulkCanaryResult(canary=canary, skipped_reason=f"missing fixtures: {missing}")

    files = []
    open_handles = []
    try:
        for p in paths:
            fh = open(p, "rb")
            open_handles.append(fh)
            mime = mimetypes.guess_type(str(p))[0] or "image/jpeg"
            files.append(("images", (p.name, fh, mime)))

        try:
            resp = requests.post(f"{base_url}/api/generate-listing", files=files, timeout=180)
        except requests.RequestException as exc:
            return BulkCanaryResult(canary=canary, error=f"request failed: {exc}")

        if resp.status_code != 200:
            return BulkCanaryResult(
                canary=canary,
                error=f"HTTP {resp.status_code}: {resp.text[:200]}",
            )

        try:
            payload = resp.json()
        except json.JSONDecodeError as exc:
            return BulkCanaryResult(canary=canary, error=f"non-JSON response: {exc}")

        listings = payload if isinstance(payload, list) else [payload]
        retrieval_fallback = bool(listings[0].get("retrieval_fallback")) if listings else None

        # Map each request image index → the returned listing that claims it.
        # If a listing omits imageIndices we fall back to positional alignment when possible.
        index_to_listing: dict[int, dict[str, Any]] = {}
        used_listings_by_index: list[dict[str, Any]] = []
        for listing in listings:
            indices = _extract_image_indices(listing)
            for i in indices:
                if i not in index_to_listing:
                    index_to_listing[i] = listing

        # Positional fallback: if a listing has no indices, assume one per request slot.
        if not index_to_listing and len(listings) == len(canary.items):
            for i, listing in enumerate(listings):
                index_to_listing[i] = listing

        # Score each expected item.
        item_results: list[BulkItemResult] = []
        listing_id_to_item_brands: dict[int, list[str]] = {}
        for req_idx, item in enumerate(canary.items):
            matched = index_to_listing.get(req_idx)
            returned_brand = _extract_brand(matched) if matched else None
            returned_category = _extract_category(matched) if matched else None

            # Bleed check: did this listing pick up another expected item's brand?
            bled_from = None
            if returned_brand:
                rb = returned_brand.lower()
                for other_idx, other in enumerate(canary.items):
                    if other_idx == req_idx:
                        continue
                    if other.expected_brand and other.expected_brand.lower() in rb:
                        # Don't flag bleed if the correct brand also appears (some listings
                        # legitimately mention multiple brands in description, but for the
                        # title/brand attr we expect a single dominant brand).
                        own = item.expected_brand.lower() if item.expected_brand else ""
                        if not own or own not in rb:
                            bled_from = other.expected_brand
                            break

            # Collapse check: is this listing also claimed by a different expected item?
            collapsed_with: list[str] = []
            if matched is not None:
                lid = id(matched)
                for other_idx, other in enumerate(canary.items):
                    if other_idx == req_idx:
                        continue
                    if index_to_listing.get(other_idx) is matched:
                        if other.expected_brand:
                            collapsed_with.append(other.expected_brand)

            item_results.append(BulkItemResult(
                item=item,
                matched_listing=matched,
                returned_brand=returned_brand,
                returned_category=returned_category,
                bled_from_brand=bled_from,
                collapsed_with=collapsed_with,
            ))

        return BulkCanaryResult(
            canary=canary,
            item_results=item_results,
            retrieval_fallback=retrieval_fallback,
            raw=listings,
        )
    finally:
        for fh in open_handles:
            try:
                fh.close()
            except Exception:
                pass


def _print_bulk_result(result: BulkCanaryResult) -> None:
    print(f"\n>> {result.canary.canary_id}  (bulk, {len(result.canary.items)} items)")
    if result.canary.notes:
        print(f"   notes: {result.canary.notes}")

    if result.skipped_reason:
        print(f"    [SKIP] {result.skipped_reason}")
        return
    if result.error:
        print(f"    [ERR ] {result.error}")
        return

    for i, ir in enumerate(result.item_results):
        print(f"   item {i}: {ir.item.image}")
        _print_row("brand",    ir.item.expected_brand,    ir.returned_brand,    ir.brand_hit)
        _print_row("category", ir.item.expected_category, ir.returned_category, ir.category_hit)
        if ir.bled_from_brand:
            print(f"    [BLEED] returned brand {ir.returned_brand!r} matches OTHER item's expected brand {ir.bled_from_brand!r}")
        if ir.collapsed_with:
            print(f"    [COLLAPSE] this listing was also matched to expected brands: {ir.collapsed_with}")
    print(f"    retrieval_fallback={result.retrieval_fallback}")


def _print_row(label: str, expected: str | None, returned: str | None, hit: bool) -> None:
    mark = "OK " if hit else "MISS"
    exp = expected if expected is not None else "<none>"
    ret = returned if returned is not None else "<none>"
    print(f"    [{mark}] {label:9s} expected={exp!r:30s} returned={ret!r}")


def _run_single(base_url: str, canaries: list[Canary]) -> list[CanaryResult]:
    print(f"Running {len(canaries)} single-item canaries against {base_url}/api/generate-listing")
    print("-" * 80)

    results: list[CanaryResult] = []
    for canary in canaries:
        print(f"\n>> {canary.canary_id}  ({canary.category})")
        if canary.notes:
            print(f"   notes: {canary.notes}")
        result = _post_canary(base_url, canary)
        results.append(result)

        if result.skipped_reason:
            print(f"    [SKIP] {result.skipped_reason}")
            continue
        if result.error:
            print(f"    [ERR ] {result.error}")
            continue

        _print_row("brand",    canary.expected_brand,    result.returned_brand,    result.brand_hit)
        _print_row("model",    canary.expected_model,    result.returned_model,    result.model_hit)
        _print_row("category", canary.expected_category, result.returned_category, result.category_hit)
        print(f"    retrieval_fallback={result.retrieval_fallback}")

    return results


def _print_single_tally(results: list[CanaryResult]) -> None:
    print("\n" + "=" * 80)
    print("SINGLE-ITEM TALLY")
    print("=" * 80)

    scored = [r for r in results if r.skipped_reason is None and r.error is None]
    skipped = [r for r in results if r.skipped_reason is not None]
    errored = [r for r in results if r.error is not None]

    total = len(scored)
    brand_hits = sum(1 for r in scored if r.brand_hit)
    model_hits = sum(1 for r in scored if r.model_hit)
    cat_hits = sum(1 for r in scored if r.category_hit)
    fallbacks = sum(1 for r in scored if r.retrieval_fallback)

    def pct(n: int) -> str:
        return f"{(100.0 * n / total):.0f}%" if total else "n/a"

    print(f"  scored:               {total} / {len(results)}")
    print(f"  brand hits:           {brand_hits} ({pct(brand_hits)})")
    print(f"  model hits:           {model_hits} ({pct(model_hits)})")
    print(f"  category hits:        {cat_hits} ({pct(cat_hits)})")
    print(f"  retrieval_fallback:   {fallbacks} ({pct(fallbacks)})")
    print(f"  skipped (no fixture): {len(skipped)}")
    print(f"  errored:              {len(errored)}")

    if skipped:
        print("\n  skipped canaries:")
        for r in skipped:
            print(f"    - {r.canary.canary_id}: {r.skipped_reason}")
    if errored:
        print("\n  errored canaries:")
        for r in errored:
            print(f"    - {r.canary.canary_id}: {r.error}")


def _run_bulk(base_url: str) -> list[BulkCanaryResult]:
    print(f"\nRunning {len(BULK_CANARIES)} bulk canaries against {base_url}/api/generate-listing")
    print("-" * 80)

    results: list[BulkCanaryResult] = []
    for canary in BULK_CANARIES:
        result = _post_bulk_canary(base_url, canary)
        results.append(result)
        _print_bulk_result(result)
    return results


def _print_bulk_tally(results: list[BulkCanaryResult]) -> None:
    print("\n" + "=" * 80)
    print("BULK TALLY")
    print("=" * 80)

    scored = [r for r in results if r.skipped_reason is None and r.error is None]
    skipped = [r for r in results if r.skipped_reason is not None]
    errored = [r for r in results if r.error is not None]

    total_items = sum(len(r.item_results) for r in scored)
    brand_hits = sum(1 for r in scored for ir in r.item_results if ir.brand_hit)
    cat_hits = sum(1 for r in scored for ir in r.item_results if ir.category_hit)
    bleeds = sum(1 for r in scored for ir in r.item_results if ir.bled_from_brand)
    collapses = sum(1 for r in scored if r.has_collapse)

    def pct(n: int) -> str:
        return f"{(100.0 * n / total_items):.0f}%" if total_items else "n/a"

    print(f"  bulk canaries scored: {len(scored)} / {len(results)}")
    print(f"  total items scored:   {total_items}")
    print(f"  brand hits:           {brand_hits} ({pct(brand_hits)})")
    print(f"  category hits:        {cat_hits} ({pct(cat_hits)})")
    print(f"  brand BLEEDS:         {bleeds}  <-- regression signal for cross-listing contamination")
    print(f"  collapsed canaries:   {collapses}  <-- two distinct items merged into one listing")
    print(f"  skipped (no fixture): {len(skipped)}")
    print(f"  errored:              {len(errored)}")

    if skipped:
        print("\n  skipped canaries:")
        for r in skipped:
            print(f"    - {r.canary.canary_id}: {r.skipped_reason}")
    if errored:
        print("\n  errored canaries:")
        for r in errored:
            print(f"    - {r.canary.canary_id}: {r.error}")


def run(base_url: str, only: list[str] | None, mode: str) -> int:
    print(f"Fixtures dir: {FIXTURES_DIR}")

    bleed_failure = False

    if mode in ("single", "all"):
        canaries = CANARIES
        if only:
            wanted = {c.lower() for c in only}
            canaries = [c for c in canaries if c.category in wanted]
            if not canaries:
                print(f"No canaries matched --only filter: {only}")
                return 1
        single_results = _run_single(base_url, canaries)
        _print_single_tally(single_results)

    if mode in ("bulk", "all"):
        if only:
            print("\n(--only is ignored for bulk mode)")
        bulk_results = _run_bulk(base_url)
        _print_bulk_tally(bulk_results)
        bleed_failure = any(r.has_bleed for r in bulk_results if r.skipped_reason is None and r.error is None)

    return 2 if bleed_failure else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Manual eval harness for hybrid vision listing pipeline.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Base URL of the running backend.")
    parser.add_argument(
        "--only",
        nargs="*",
        help="Optional category filter for single canaries (ignored in bulk mode).",
    )
    parser.add_argument(
        "--mode",
        choices=("single", "bulk", "all"),
        default="single",
        help="Which canary set to run. Default: single. Use 'bulk' to exercise multi-item uploads, 'all' for both.",
    )
    args = parser.parse_args()
    return run(args.base_url, args.only, args.mode)


if __name__ == "__main__":
    sys.exit(main())
