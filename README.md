# Cosello

A neighborhood marketplace web app with AI-powered product listing.

## Running the App

### 1. Backend (Python / FastAPI)

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL (Supavisor
# pooler), plus ANTHROPIC_API_KEY and GOOGLE_APPLICATION_CREDENTIALS
uvicorn main:app --reload
```

`python-dotenv` auto-loads `backend/.env` when `main.py` starts — no need to export vars manually.

The API runs at: http://localhost:8000

### 2. Frontend (React / Vite)

```bash
cd frontend
npm install
npm run dev
```

Access the site at: http://localhost:5173

> The frontend proxies `/api` requests to the backend automatically.

### 3. Local development against the `cosello-dev` test database

By default the backend reads `backend/.env` (production Supabase). For local development and smoke testing, point **both** processes at the `cosello-dev` project so you never read or write prod data.

**Backend** — set `ENV_FILE` so `main.py` overlays `backend/.env.test` (cosello-dev credentials) on top of the base env:

```bash
cd backend
ENV_FILE=.env.test uvicorn main:app --reload --port 8000
```

`backend/.env.test` (gitignored) holds the cosello-dev `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL`. Use the **transaction pooler** connection string (`postgres.<ref>@aws-1-<region>.pooler.supabase.com:6543`) — the direct `db.<ref>.supabase.co` host is IPv6-only and won't resolve locally.

**Frontend** — create `frontend/.env.local` (gitignored; overrides `.env`) with the cosello-dev values, then **restart Vite** (env files are read only at startup):

```
VITE_SUPABASE_URL=https://<cosello-dev-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<cosello-dev anon key>
```

> **Critical: the frontend and backend must point at the same Supabase project.** Sign-in mints a JWT from whichever project the *frontend* uses; the backend verifies it (JWKS + issuer) against whichever project *it* uses. A mismatch returns **`Invalid or expired token`** on every authenticated request. So if `frontend/.env.local` is on cosello-dev, you **must** start the backend with `ENV_FILE=.env.test`. (If a stale session lingers after switching projects, sign out / clear site data for `localhost:5173` and sign in again.)

**Signing in — phone Test OTPs (no real SMS, no credit burn).** In the cosello-dev dashboard → Authentication → Providers → Phone → Test OTPs, add the numbers below (and ensure "Allow phone signups" is on):

| Phone | Code | Lands in |
|---|---|---|
| `+15555550101` | `123456` | Feed as seeded seller Alice (zip 10011) — tests feed + distance slider |
| `+15555550102` | `123456` | Feed as Bob (10012) |
| `+15555550103` | `123456` | Feed as Carol (10013) |
| `+15555550199` | `123456` | Registration wizard (fresh user, no profile) |

**Seed the dev database** (from `backend/`, after `set -a && source .env.test && set +a`):

```bash
python -m scripts.seed_zip_centroids      # Manhattan ZIP centroids
python -m scripts.seed_test_users         # sellers Alice / Bob / Carol
python -m scripts.seed_geo_test_listings  # ~40 listings spread across ZIPs
python -m scripts.seed_schools_fixture    # university list — curated, prod-consistent (registration wizard search)
python -m scripts.seed_dev_storage        # create the public `cosello-images` Storage bucket (image uploads)
```

> Storage buckets aren't created by SQL migrations, so a fresh project has none — without `seed_dev_storage` the sell wizard's image upload fails with a 404/502 (`signed-upload-url` → "the related resource does not exist").

> **School list consistency:** `seed_schools_fixture` loads `data/school_seed.csv` — a committed snapshot of the **curated** school list (normalized display names + short names + acronyms, e.g. `Columbia University` / `Columbia` / `CU`). This is the canonical per-environment seed and keeps every env identical to prod. Do **not** seed from the raw College Scorecard CSV (`scripts/seed_schools data/...`) for normal setup — that loads uncurated legal-long names. The raw pipeline (`seed_schools` → `normalize_school_names` → `backfill_school_short_names`/`acronyms`) is only for **regenerating** the fixture when the source data changes.

Re-run the registration wizard for a number with `python -m scripts.reset_dev_new_user [+phone]` (defaults to `+15555550199`).

## Environment

Backend env vars live in `backend/.env` (gitignored). Copy `backend/.env.example` to get started:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL (Auth + JWKS for token verification) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — **server-side only**, bypasses RLS |
| `DATABASE_URL` | Postgres connection string — use the Supavisor **transaction pooler** host |
| `SUPABASE_JWT_SECRET` | Optional — only for projects still signing JWTs with HS256 |
| `ANTHROPIC_API_KEY` | Claude Sonnet 4.5 — listing scribe |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to a GCP service account JSON with Vision API access |

`python-dotenv` loads these on backend startup. If `GOOGLE_APPLICATION_CREDENTIALS` is missing, the backend degrades gracefully — listings are still generated by Claude alone and the response carries `retrieval_fallback: true`.

## Tech Stack

### Frontend
- **React 18** + **TypeScript**
- **Tailwind CSS v4** (via Vite plugin)
- **Radix UI** primitives (dropdown, select)
- **Lucide React** icons
- **Vite 6** dev server and bundler

### Backend
- **FastAPI** + **Uvicorn**
- **SQLAlchemy** + **Supabase Postgres** (accessed via the Supavisor connection pooler)
- **Supabase Auth** (phone OTP) + **PyJWT** (verifies Supabase-issued JWTs — HS256 shared secret or RS256/ES256 via JWKS)
- **supabase** (Python admin client — user management, seeds)
- **Anthropic SDK** (Claude Sonnet 4.5 — listing scribe)
- **google-cloud-vision** (image retrieval layer — brand, OCR, labels, web matches)
- **Pillow** (server-side image normalization / resize / JPEG conversion)
- **imagehash** (perceptual hash cache — dedupes repeat images across a batch)
- **python-dotenv** (loads env vars from `backend/.env`)

## File Structure

```
Cosello/
├── backend/
│   ├── main.py               # FastAPI app — /api/generate-listing endpoint
│   ├── requirements.txt      # Python dependencies
│   ├── .env.example          # Template for required env vars (copy to .env)
│   ├── services/
│   │   ├── __init__.py
│   │   ├── cache.py          # PHashCache — LRU perceptual hash cache (dedupes repeat images)
│   │   ├── evidence.py       # build_evidence_block — formats Vision output for Claude
│   │   └── google/
│   │       ├── __init__.py
│   │       ├── client.py     # Vision client singleton
│   │       └── vision.py     # analyze_images — Vision batch API wrapper
│   └── tests/
│       └── eval/
│           ├── listing_eval.py   # Manual canary set for identification accuracy
│           ├── README.md
│           └── fixtures/         # Local product photos (gitignored)
│
└── frontend/
    ├── index.html             # HTML entry point
    ├── package.json           # Dependencies and scripts
    ├── vite.config.ts         # Vite + Tailwind + API proxy config
    ├── postcss.config.mjs     # PostCSS config
    └── src/
        ├── main.tsx           # React entry — mounts <App />
        ├── App.tsx            # Main app component (home page + sell flow)
        ├── components/
        │   └── ui/
        │       ├── button.tsx         # Button component (shadcn/ui)
        │       ├── dropdown-menu.tsx  # Dropdown menu component
        │       ├── image-with-fallback.tsx # Image with error fallback
        │       ├── input.tsx          # Input component
        │       ├── select.tsx         # Select component
        │       └── utils.ts           # cn() class merge utility
        └── styles/
            ├── index.css      # Root stylesheet (imports others)
            ├── fonts.css      # Google Fonts (Courier Prime)
            ├── tailwind.css   # Tailwind directives + custom animations
            └── theme.css      # CSS variables for colors, radii, typography
```

## Authentication

Authentication is handled by **Supabase Auth** with phone-based OTP. Supabase mints the session JWT — the backend never issues tokens; it **verifies** the Supabase-issued JWT on every request (`backend/auth.py: verify_supabase_jwt`), supporting both HS256 (shared `SUPABASE_JWT_SECRET`) and RS256/ES256 (verified against the project's JWKS). User identity lives in `auth.users`; the matching profile row in `public.users` is created by a DB trigger and linked by UUID.

- **Production:** OTP codes are delivered by the SMS provider (Twilio) configured in Supabase.
- **Local dev:** use Supabase **Test OTPs** (static codes, no real SMS) — see [Local development against the cosello-dev test database](#3-local-development-against-the-cosello-dev-test-database).

## How Sell Mode Works

Cosello uses a **hybrid retrieval pipeline**: Google Cloud Vision identifies the product, Claude writes the listing.

1. Toggle to **Sell** and upload 1..N product photos
2. Hit submit — images POST to `/api/generate-listing`
3. **Normalize** — Pillow resizes each image to max 2048px and converts to JPEG
4. **Deduplicate** — a perceptual hash cache (LRU 500, 256×256 phash) skips repeat images within the batch
5. **Retrieve** — Google Cloud Vision runs `WEB_DETECTION` + `TEXT_DETECTION` + `LABEL_DETECTION` + `LOGO_DETECTION` in a single batch call (10s timeout) and returns evidence: brand hints, OCR-extracted text, visual labels, and matching page titles
6. **Scribe** — the evidence block plus the original images are sent to **Claude Sonnet 4.5**, which writes the listing (title, description, price, category, categoryAttributes, tags, condition)
7. The user can edit any field before posting

**Fallback behavior:** if Vision is unreachable (missing credentials, network error, 10s timeout), the response is stamped with `retrieval_fallback: true`. Claude still writes the listing from photos alone, and the frontend renders a yellow warning banner on the draft view prompting the seller to double-check brand, model, and price before posting.

## Testing & Fixtures

### FYP fixture seed

[backend/scripts/seed_fyp_fixture.py](backend/scripts/seed_fyp_fixture.py) inserts 16 deterministic listings across three existing test users (Bob, John, Test) so the For-You ranker has variety in brand, category, community, and freshness to rank against. Use this before any FYP browser-validation pass — without it, your feed only contains listings you've personally created.

```bash
cd backend
python3 scripts/seed_fyp_fixture.py
```

**Idempotent.** Every seeded row uses an `id` prefixed with `fypfix`, and any `fypfix-*` files in `backend/uploads/` are also wiped at the start of each run. Safe to re-run.

**Per-listing curated images.** Drop product photos into [backend/scripts/fixture_images/](backend/scripts/fixture_images/) using the filenames in each row's `image` field (e.g., `nike_air_max_90.jpg`). On seed, the script copies each fixture into `backend/uploads/` with a `fypfix-` prefix so the existing static mount serves it. Rows whose fixture file is missing fall back to a placeholder image — partial-image states are safe, and the script reports how many listings matched.

**Manual cleanup** (e.g., to reset state without re-seeding):

```sql
DELETE FROM listings WHERE id LIKE 'fypfix%';
```
```bash
rm backend/uploads/fypfix-*
```
