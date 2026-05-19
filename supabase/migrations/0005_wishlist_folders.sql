-- Saved folders for the wishlist. Adds a per-user `wishlist_folders` table and
-- a nullable `folder_id` FK on `wishlist_items`. Deleting a folder cascades to
-- NULL on its items, so the items remain wishlisted but unfiled.
--
-- RLS is enabled; no policies (FastAPI uses service_role and bypasses RLS,
-- matching the rest of the schema).

CREATE TABLE IF NOT EXISTS public.wishlist_folders (
    id         SERIAL PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name       VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_wishlist_folders_user_id
    ON public.wishlist_folders (user_id);

ALTER TABLE public.wishlist_items
    ADD COLUMN IF NOT EXISTS folder_id INTEGER
    REFERENCES public.wishlist_folders(id) ON DELETE SET NULL;

ALTER TABLE public.wishlist_folders ENABLE ROW LEVEL SECURITY;
