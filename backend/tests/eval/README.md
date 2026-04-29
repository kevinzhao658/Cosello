# Hybrid Vision Listing — Manual Eval Harness

Manual canary set for `/api/generate-listing` (the hybrid Vision + Claude pipeline on
`feature/hybrid-vision-retrieval`). NOT wired into CI — run by hand when validating
prompt, retrieval, or model changes.

## What it does

`listing_eval.py` POSTs a fixed set of 20 local images to a running backend
(`http://127.0.0.1:8000` by default), one canary at a time, and prints a side-by-side
comparison of expected vs returned `brand` / `model` / `category` plus a tally of
identification hits and a count of how many requests fell back to retrieval-only mode
(`retrieval_fallback=True`).

## Canary set (20 entries)

| Category     | Count | Coverage notes                                                 |
|--------------|-------|----------------------------------------------------------------|
| clothing     | 4     | 2+ with care labels / inner-tag style codes (Nike, Levi's)     |
| furniture    | 4     | mix of sizes — exercises `carry_difficulty` (small / 2-person / truck) |
| electronics  | 4     | WalkingPad A1 Pro + DJI Osmo Pocket 3 (niche brands), plus AirPods Pro 2, Kindle Paperwhite |
| sports       | 3     | Wilson, YETI, Specialized                                      |
| collectibles | 3     | Pokémon TCG, Funko, LEGO                                       |
| other        | 2     | unbranded mug + handmade ceramic — exercises null-brand path   |

Each canary declares the local image path(s) under `fixtures/`, expected brand,
expected model, expected category, and short notes about why the entry is in the set.

## Running it

```bash
cd backend
# in another terminal: uvicorn main:app --reload
python tests/eval/listing_eval.py

# point at a non-default backend
python tests/eval/listing_eval.py --base-url http://127.0.0.1:8001

# run a subset (single mode only)
python tests/eval/listing_eval.py --only clothing electronics

# run bulk canaries (multi-item uploads — exercises the brand-bleed regression)
python tests/eval/listing_eval.py --mode bulk

# run both single and bulk
python tests/eval/listing_eval.py --mode all
```

### Bulk canaries

`BULK_CANARIES` exercises the multi-item path of `/api/generate-listing` by uploading
several fixtures in one request. Each canary recycles individual-canary fixtures and
adds two extra checks beyond brand / category matching:

- **bleed**: a returned listing's brand must not match a *different* item's expected
  brand. This is the regression signal for the cross-listing contamination bug
  (e.g., Samsonite ending up in the Coach Duffel listing).
- **collapse**: two distinct expected items must not map to the same returned listing.

`--mode bulk` exits with code `2` if any bleed is detected, so it's safe to gate
local checks on its exit status.

## Fixtures

`fixtures/` is intentionally empty in git. Drop real images locally at the relative
paths declared in `CANARIES` inside `listing_eval.py` (e.g.
`fixtures/clothing/nike_drifit_front.jpg`). Missing fixtures are skipped, not errored.

Use your own photos or stock photos you have rights to. Do not commit images.

## Interpreting results

- **brand hit**: returned brand string contains the expected brand (case-insensitive).
  For canaries with `expected_brand=None`, the return must be empty / "Unknown".
- **model hit**: same substring rule. `expected_model=None` always counts as a hit.
- **category hit**: exact (case-insensitive) match.
- **retrieval_fallback**: how many canaries the pipeline served from the
  retrieval-only path (no Vision evidence). Expected to be ~0 with valid GCP creds
  and high when `GOOGLE_APPLICATION_CREDENTIALS` is unset.

This is a smoke / regression eyeball — not a hard pass/fail gate. Use it before
prompt or retrieval-layer changes to anchor a baseline, then re-run after.
