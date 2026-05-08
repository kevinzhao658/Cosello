# Jonas Notes — Infrastructure & Demo Strategy

---

## 1. Switching from SQLite to Supabase

### Current priority: schema only, no Python changes

The immediate goal is to get the schema defined in Supabase as SQL migration files. Connecting the Python backend to Supabase is a separate step and not a current priority.

**What to do now:**  
Write a Supabase SQL migration (e.g. `supabase/migrations/0001_initial_schema.sql`) that recreates all tables from `backend/models.py`. Supabase migrations are plain SQL files run via the Supabase CLI (`supabase db push`) or applied through the dashboard. No Alembic, no Python changes.

The tables to define: `users`, `communities`, `community_members`, `listings`, `purchase_orders`, `wishlist_items`, `notifications`. Source of truth for columns is `backend/models.py`.

The ad-hoc `ALTER TABLE` blocks in `main.py` (lines 43–97) represent columns that were added after initial schema — include all of them in the migration as part of the full current schema (not as separate patches). The migration should reflect the current state of the models, not their history.

**Image storage**  
Images currently live on local disk at `backend/uploads/`. Supabase Storage (or S3) is the eventual target, but this is a separate task — don't conflate with the schema migration.

**Supabase Auth (optional)**  
Supabase ships its own auth (phone OTP, JWTs). It could eventually replace the PyJWT + Twilio stub, but that's a much larger migration — ignore for now.

### Order of operations

1. Provision Supabase project
2. Write `supabase/migrations/0001_initial_schema.sql` from `models.py`
3. Push schema via Supabase CLI (`supabase db push`) — done, no backend changes
4. *(Later)* Swap connection string in `database.py`, redeploy backend
5. *(Later, separate)* Migrate image storage away from local disk

---

## 2. Switching from FastAPI to Serverless Node Functions

### Options: Supabase Edge Functions vs Vercel Functions


|                        | Supabase Edge Functions | Vercel Functions            |
| ---------------------- | ----------------------- | --------------------------- |
| Runtime                | Deno (TypeScript)       | Node.js 20+ (TypeScript/JS) |
| Cold start             | ~50ms (global edge)     | ~100–300ms (regional)       |
| Bundle size limit      | 2MB compressed          | 250MB unzipped              |
| File system            | None                    | Read-only `/tmp` (512MB)    |
| Persistent connections | No                      | No                          |
| Max execution time     | 150s                    | 60s (Hobby), 300s (Pro)     |


### The problem with this codebase

The backend is heavily Python-dependent in ways that aren't easy to port:

- **Pillow** (`_preprocess_image_bytes`) — image resize/compression on upload. The JS ecosystem has `sharp` as an equivalent but it's a native binary (works on Vercel, not Supabase Edge).
- **Anthropic SDK** — the Python SDK is used for Claude Vision calls. The JS/TS SDK is a full equivalent and this is the easiest part to port.
- **Google Vision** — `services/google/vision.py`. Google has a Node client library, so portable.
- **SQLAlchemy** — no equivalent in Node; you'd use something like Prisma or Drizzle ORM, which means rewriting all DB queries.

### Recommendation: Vercel Functions over Supabase Edge

Vercel Functions (Node.js) is the better fit:

- `sharp` works for image processing
- Anthropic JS SDK is production-ready
- 250MB bundle limit accommodates Google Vision client
- TypeScript throughout means shared types with the frontend

Supabase Edge Functions have the 2MB limit, no native binaries, and Deno instead of Node — too constrained for the AI and image processing workload.

### Migration strategy (phased)

**Phase 1 — don't rewrite everything at once.**  
Keep the FastAPI backend running on a cheap host (Railway, Render, Fly.io). Only migrate individual routes to Vercel Functions as needed. Vercel rewrites can route `/api/listings` to a Vercel Function while `/api/segment-photos` still hits the FastAPI instance.

**Phase 2 — migrate CRUD routes first** (auth, listings GET/POST/PUT, communities, orders). These are straightforward to rewrite in TypeScript and don't require Pillow or heavy AI calls.

**Phase 3 — migrate AI routes last** (`/api/segment-photos`, `/api/generate-listings`). These require image processing and Claude calls. Do this after you've validated the simpler routes work.

### What to use for the DB in a Node context

If you move to Vercel Functions + Supabase DB, use **Drizzle ORM** — it's lightweight, TypeScript-native, and has strong Supabase/Postgres support. Schema migration from SQLAlchemy models to Drizzle is manual but mechanical.

---

## 3. Monorepo Structure — Frontend + Vercel Functions + Supabase

### The answer to "does the API live in the frontend project?"

Yes — Vercel treats any `api/` directory at the project root as serverless functions. The frontend static build and the API functions are deployed as a single Vercel project. No separate deployment, no CORS issues, same origin.

### Proposed repo structure

```
cosello/
  api/                        # Vercel Functions (TypeScript/Node.js)
    _lib/                     # Shared helpers — underscore = NOT a route
      db.ts                   # Drizzle/Supabase client
      auth.ts                 # JWT verification (mirrors backend/auth.py)
      types.ts                # Shared response types
    listings/
      index.ts                # GET /api/listings, POST /api/listings
      [id].ts                 # GET/PUT /api/listings/:id
      mine.ts                 # GET /api/listings/mine
      public.ts               # GET /api/listings/public
    auth/
      me.ts                   # GET /api/auth/me
      otp/
        request.ts            # POST /api/auth/otp/request
        verify.ts             # POST /api/auth/otp/verify
    communities/
      index.ts                # GET/POST /api/communities
    orders/
      index.ts                # GET/POST /api/orders
    notifications/
      index.ts
    segment-photos.ts         # POST — migrate last (needs image processing)
    generate-listings.ts      # POST — migrate last (needs Claude + Vision)
    package.json              # api-specific deps: @vercel/node, drizzle-orm, etc.
    tsconfig.json
  frontend/                   # Vite React app — unchanged structure
    src/
    public/
    package.json
    vite.config.ts
  supabase/                   # Supabase CLI convention
    migrations/
      0001_initial_schema.sql
    config.toml
  pnpm-workspace.yaml         # declares frontend/ and api/ as workspaces
  package.json                # workspace root — minimal, just scripts
  vercel.json                 # build config + transition-era rewrites
  CLAUDE.md
  docs/
```

### What a Vercel Function looks like

Each file exports a default handler. Methods are handled by branching on `req.method`:

```typescript
// api/listings/index.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../_lib/db';
import { listings } from '../_lib/schema';
import { requireAuth } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const rows = await db.select().from(listings);
    return res.json(rows);
  }
  if (req.method === 'POST') {
    const user = await requireAuth(req, res);
    if (!user) return; // requireAuth sends 401
    // ...
  }
  res.status(405).json({ error: 'Method not allowed' });
}
```

Dynamic routes use bracket syntax — `api/listings/[id].ts` → `/api/listings/:id`.  
The `_lib/` prefix tells Vercel to skip those files as route handlers.

### `vercel.json` — build config + transition-era rewrites

During the FastAPI → Vercel migration, some routes will still live on the FastAPI host (Railway/Render). Vercel rewrites let you forward selectively:

```json
{
  "buildCommand": "pnpm --filter frontend build",
  "outputDirectory": "frontend/dist",
  "rewrites": [
    {
      "source": "/api/segment-photos",
      "destination": "https://cosello-api.railway.app/api/segment-photos"
    },
    {
      "source": "/api/generate-listings",
      "destination": "https://cosello-api.railway.app/api/generate-listings"
    }
  ]
}
```

Routes not in the rewrite list are handled by the local `api/` functions. Remove a rewrite when a route is migrated.

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'frontend'
  - 'api'
```

The `api/package.json` holds its own deps (`@vercel/node`, `drizzle-orm`, `@supabase/supabase-js`, `@anthropic-ai/sdk`). The frontend's deps stay in `frontend/package.json`. No hoisting conflicts.

### Local dev

```bash
vercel dev    # runs frontend + api/ functions together, respects vercel.json rewrites
```

`vercel dev` replaces both `uvicorn` and `vite dev` for migrated routes. The frontend's `vite.config.ts` proxy can be removed once all routes are migrated (or kept for routes still on FastAPI that aren't in the rewrites).

### What stays the same

The frontend source code doesn't change. It already uses relative `/api/*` paths throughout — those resolve to the Vercel Functions in production and to `vercel dev` locally with zero changes.

---

## 5. Deploying Frontend on Vercel

### Why this is straightforward

The frontend is Vite + React with no server-side rendering. Vercel handles static Vite builds natively.

### What needs to happen

**Build**  
`vite build` outputs to `dist/`. Vercel auto-detects Vite and sets this up.

**API proxy**  
In dev, Vite proxies `/api` and `/uploads` to `localhost:8000` (`vite.config.ts` lines 13–16). In production on Vercel, you need `vercel.json` rewrites instead:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://your-backend.com/api/:path*" },
    { "source": "/uploads/:path*", "destination": "https://your-backend.com/uploads/:path*" }
  ]
}
```

No frontend code changes needed — the frontend already uses relative `/api/*` paths throughout, so swapping the proxy destination is transparent.

**Environment variable**  
Set `VITE_API_BASE_URL` (or just rely on rewrites). Rewrites are cleaner because they avoid CORS issues and keep the same-origin assumption the frontend already has.

**Image serving**  
Once the backend is on a persistent host (not local), `/uploads/...` URLs in listing data will resolve through the Vercel rewrite. Once you migrate to Supabase Storage or S3, update the rewrite target or switch to absolute CDN URLs in listing responses.

### Steps

1. `cd frontend && npm run build` — verify the build is clean
2. Create `vercel.json` at repo root (or `frontend/`) with rewrites pointing at your backend host
3. Connect the repo to Vercel, set build directory to `frontend`, output to `dist`
4. Deploy — the frontend goes live independently of the backend

---

## 6. Running a Demo

The frontend can be deployed and demoed with baked-in fixture data — no backend required.

### What to build

**Fixture data:** Extract the 12 seed items already in `main.py` into `frontend/src/fixtures/demoListings.ts` as a typed static array. Pair with committed static images or Unsplash URLs.

**Demo mode flag:** A `?demo=true` URL param is the simplest approach — no localStorage, shareable link:
```ts
const isDemoMode = new URLSearchParams(window.location.search).get('demo') === 'true'
```

**Toggle in the UI:** A visible "Demo" / "Real listings" toggle lets feedback participants switch between fixture data and live listings from real users. Real listings hit `GET /api/listings/public` (no auth required). Demo listings return the fixture.

**Listing creation flow:** Stub the AI endpoints (`/api/segment-photos`, `/api/generate-listings`) to return pre-baked responses. This lets a user walk the full upload → AI → review → post flow without a backend. The final post step is a no-op that shows a success state.

**Auth in demo mode:** Mock a fake user so the UI doesn't redirect to sign-in. No OTP, no token.

### User flow

| Step | Real mode | Demo mode |
|---|---|---|
| Browse listings | `GET /api/listings/public` | Returns fixture |
| Upload photos → AI listing | Live Claude + Vision | Stub returns pre-baked listing |
| Post a listing | Writes to DB | No-op, success toast |
| Auth | Real OTP | Mocked user |

### What this unblocks

The frontend ships to Vercel independently. Vercel Functions for real listings (`/api/listings/public`) can be the first route migrated — it's a simple DB read with no auth, and it makes the "real listings" toggle functional without needing the full Python backend running anywhere.

---

## 7. Various Notes

### `category_schemas.py` — code or DB tables?

**Current state:** A hardcoded Python dict (`CATEGORY_SCHEMAS`) served verbatim at `GET /api/categories`. The frontend fetches it on load and uses it to render category selectors and attribute fields. The same slugs (`clothing`, `furniture`, etc.) are baked into the Claude prompts in `main.py`.

**Arguments for keeping it as code:**
- Categories and their fields change rarely. Adding a new category requires a deploy regardless — there's no operational difference between editing a Python file and editing a DB row.
- The field definitions are tightly coupled to the Claude prompts (`_build_listing_prompt_for_group` references category slugs and attribute rules by name). A DB-driven approach doesn't decouple that — you'd still need a code deploy to update the prompt logic when a category changes.
- Zero infra overhead. No join, no migration, no admin UI needed.
- Already works. The `/api/categories` endpoint is clean and the frontend consumes it correctly.

**Arguments for DB tables:**
- If you eventually want non-engineers to add/edit categories (e.g. a product admin), a DB is the right home.
- If categories proliferate significantly (10+), a DB makes querying and filtering listings by category more natural.
- Supabase gives you a free table editor UI, so the "admin panel" is essentially free.

**Recommendation: keep as code for now.**  
The coupling to the Claude prompt logic is the deciding factor — a DB table buys you nothing until that coupling is broken, which is a much larger design change. When/if you need a non-engineer to manage categories, the right move is a thin admin UI backed by DB tables, not a premature migration now.

If categories do move to DB, the schema would be something like:
```sql
CREATE TABLE categories (slug TEXT PRIMARY KEY, label TEXT NOT NULL);
CREATE TABLE category_fields (
  id SERIAL PRIMARY KEY,
  category_slug TEXT REFERENCES categories(slug),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,         -- 'text' | 'select'
  required BOOLEAN NOT NULL DEFAULT false,
  options JSONB,              -- null for text fields
  tooltip TEXT,
  sort_order INT NOT NULL DEFAULT 0
);
```