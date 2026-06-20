-- Enable Supabase Realtime broadcast for the purchase_orders table so the
-- frontend can subscribe to inserts/updates and refresh the seller's "My
-- Listings" pending-order badges without a manual page refresh.
--
-- Realtime subscriptions run as the authenticated user (anon key + JWT), so we
-- also add an RLS SELECT policy gating which rows each user can receive.
-- Service-role queries (FastAPI backend) continue to bypass RLS unchanged.

-- Idempotent: re-running must not error if the table is already published
-- (ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Idempotent: drop-then-create so a replay doesn't error on the existing policy.
DROP POLICY IF EXISTS "Users can view their own purchase orders" ON public.purchase_orders;
CREATE POLICY "Users can view their own purchase orders"
ON public.purchase_orders
FOR SELECT
TO authenticated
USING (
  buyer_id = (SELECT auth.uid())
  OR seller_id = (SELECT auth.uid())
);
