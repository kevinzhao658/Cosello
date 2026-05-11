# Commercial Deployment PR — Pre-Launch Checklist

Items to bundle into the PR that flips Cosello from closed beta to public-facing commercial deployment. None of these are blocking the deploy itself (Phase 4) — they gate "taking real money from real users."

---

## Plan / Infra Upgrades

- [x] Vercel Hobby → Pro ($20/mo) — done 2026-05-11 (forced by Hobby's Co-Authored-By trailer block on deploys; commercial ToS compliance was the planned trigger anyway)
- [ ] Supabase free → Pro ($25/mo) — daily backups + 7-day PITR + no auto-pause + larger compute
- [ ] Twilio trial → paid account — trial only sends SMS to verified caller IDs; paid required for any real user

## Security Hardening

- [ ] CORS hardening — `CORS_ALLOWED_ORIGINS` currently permissive; restrict to production domain only
- [ ] RLS policies on every Postgres table — currently `service_role` bypass; write per-user policies before exposing direct frontend → Postgres access
- [ ] Storage bucket policies — `cosello-images` is public + no auth; add upload-only-by-authenticated-users policy
- [ ] Disable Vercel Password Protection (Settings → Deployment Protection) — added in Phase 4b for closed beta; turn off at public launch
- [ ] Audit AI-endpoint authentication boundaries — `/api/segment-photos`, `/api/generate-listings`, `/api/storage/signed-upload-url` are already auth'd (added in Phase 4a), but re-verify post-deploy

## Operational

- [ ] Per-user rate limiting on AI cost endpoints (`/api/segment-photos`, `/api/generate-listings`, `/api/storage/signed-upload-url`) — prevent runaway Anthropic/Twilio costs
- [ ] Sentry or equivalent error monitoring — surfaces tracebacks instead of users staring at 500 toasts
- [ ] Privacy policy + Terms of Service pages
- [ ] Janitor task to GC `listings/drafts/{user_id}/` Storage orphans (older than 24h) — accumulates with every abandoned bulk upload
- [ ] Architectural fix: switch SQLAlchemy user-id columns from `Column(String(36))` to `Column(UUID(as_uuid=False))` — eliminates the recurring "UUID-vs-str" serialization landmine that's bitten communities + friends + orders + notifications
- [ ] Refresh `backend/tests/` pytest fixtures — many seed integer user_ids that broke after the UUID migration; the suite was never re-validated post-Phase 1+2 and likely has multiple failing tests
- [ ] Re-run eval canaries post-migration — walking pad ("Wellfit" brand) and bulk brand-bleed (BLEEDS=0) were never reconfirmed after Tier 3 changed where Pillow preprocessing happens (now post-download from Storage rather than pre-upload)

## Performance / Cost Optimization

- [ ] Pre-generate thumbnail variants stored alongside originals — serve thumbnail on browse cards, original only on detail view; cuts CDN bandwidth significantly
- [ ] Code-split frontend bundle (currently 673KB gzip — Vite warning) — `manualChunks` config in `vite.config.ts`
- [ ] Consolidate `api/requirements.txt` + `backend/requirements.txt` to single source (Vercel pip rejects `-r ../...` includes; today they're duplicated with a sync comment)
- [ ] Re-introduce Vision API perceptual-hash dedup — dropped in Phase 4b along with `imagehash`+`scipy`+`numpy` (~135MB) to fit Vercel's 250MB cap. When Vision spend becomes material, write a numpy-only inline pHash (~30 LOC) in `services/cache.py` rather than re-adding the heavy dep stack.
- [ ] Dead-code sweep — legacy `_uploads_url_to_path` adapter and `/uploads/` `StaticFiles` mount remain after Phase 3+4 storage migration; production never reads from local disk, but the code paths are still there and add noise

---

# Defect Backlog

Bugs or rough edges shipped but deferred — to be resolved before commercial launch.

| # | Defect | Notes / Severity |
|---|---|---|
| 1 | Photo enlargement for listing modal | `max-w-4xl` (896px) bumped from `max-w-lg` (512px) in Phase 4a, but listing detail still feels small relative to phone-photo source resolution. Want true full-bleed or a click-to-zoom lightbox experience. Cosmetic, not blocking. |
