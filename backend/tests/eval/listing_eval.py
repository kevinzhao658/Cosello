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


def _print_row(label: str, expected: str | None, returned: str | None, hit: bool) -> None:
    mark = "OK " if hit else "MISS"
    exp = expected if expected is not None else "<none>"
    ret = returned if returned is not None else "<none>"
    print(f"    [{mark}] {label:9s} expected={exp!r:30s} returned={ret!r}")


def run(base_url: str, only: list[str] | None) -> int:
    canaries = CANARIES
    if only:
        wanted = {c.lower() for c in only}
        canaries = [c for c in canaries if c.category in wanted]
        if not canaries:
            print(f"No canaries matched --only filter: {only}")
            return 1

    print(f"Running {len(canaries)} canaries against {base_url}/api/generate-listing")
    print(f"Fixtures dir: {FIXTURES_DIR}")
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

    print("\n" + "=" * 80)
    print("TALLY")
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

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Manual eval harness for hybrid vision listing pipeline.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Base URL of the running backend.")
    parser.add_argument(
        "--only",
        nargs="*",
        help="Optional category filter (clothing furniture electronics sports collectibles other).",
    )
    args = parser.parse_args()
    return run(args.base_url, args.only)


if __name__ == "__main__":
    sys.exit(main())
