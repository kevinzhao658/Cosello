# Supabase Migration History Fix

**Date:** 2026-06-16
**Branch:** `fix/migration-idempotency`
**Trigger:** `supabase db push` fails with `relation "purchase_orders" is already member of publication "supabase_realtime" (SQLSTATE 42710)` at `0004_realtime_purchase_orders.sql`.

---

## Root cause

The remote project's **migration history table** (`supabase_migrations.schema_migrations`) does not record migrations `0001`–`0012` as applied — they were applied out-of-band (SQL editor / manual), not through `supabase db push`. So the CLI believes none are applied and replays the entire folder from `0001`. The replay dies at `0004` because `ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders` is not idempotent — the table is already a member on the live DB.

This blocks `db push` for *all* future migrations (e.g. `0013_circles.sql`), not just `0004`.

## Fix — two parts

### Part 1 (required): reconcile the migration history

Mark the already-applied migrations as applied on the remote so `db push` stops replaying them. Run from the repo root with the project linked:

```bash
# 0013 was applied manually via the SQL editor, so it is included here too.
supabase migration repair --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0012 0013
```

Then verify local vs remote agree:

```bash
supabase migration list
```

Every `0001`–`0012` row should now show as applied on both sides. After that, `supabase db push` will apply only genuinely-pending migrations (`0013` onward).

> If `migration repair` reports a version-format mismatch (these files use `000N_` prefixes rather than Supabase's default timestamp format), pass the version exactly as shown in `supabase migration list`'s "Local" column.

### Part 2 (defensive, in this PR): make `0004` idempotent

`supabase/migrations/0004_realtime_purchase_orders.sql` is updated so a replay (fresh environment, or a future full push) cannot error:

- `ALTER PUBLICATION … ADD TABLE` is wrapped in a `DO $$ … EXCEPTION WHEN duplicate_object THEN NULL; END $$;` block.
- `CREATE POLICY` is preceded by `DROP POLICY IF EXISTS …`.

This changes nothing on a fresh database; it only removes the replay failure. (`0013_circles.sql` was already made idempotent the same way.)

## Not done here (and why)

- **`0001`/`0002` `CREATE TABLE` / `CREATE TRIGGER` are left un-guarded.** A fresh database needs those statements to run unconditionally, and Part 1 (`migration repair`) resolves the already-applied case. Rewriting the initial-schema history to add guards is unnecessary risk.
- **Applying `0013` right now** does not require any of this — paste `supabase/migrations/0013_circles.sql` into the Supabase SQL editor (it is fully idempotent). Part 1 is about restoring `db push` as the long-term path.

## Verification

- `supabase migration list` shows `0001`–`0012` applied on both local and remote.
- `supabase db push` runs clean (applies only pending migrations) with no `42710`.
- A hypothetical replay of `0004` against a DB where the table is already published succeeds (the `DO` block swallows `duplicate_object`).
