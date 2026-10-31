-- SupplyDesk order tenant isolation.
-- Run this in the Supabase SQL Editor for the existing schema.
-- Existing keys: dealer_profiles.user_id and distributors.owner_id.
-- orders.dealer_id references dealer_profiles.user_id.
-- No tables or columns are created or changed.

BEGIN;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Remove previous order policies and any policies using the requested names.
DROP POLICY IF EXISTS "dealer_read_own_orders" ON public.orders;
DROP POLICY IF EXISTS "distributor_read_orders" ON public.orders;
DROP POLICY IF EXISTS "dealers can insert" ON public.orders;
DROP POLICY IF EXISTS "dealers view own" ON public.orders;
DROP POLICY IF EXISTS "distributors view their dealers orders" ON public.orders;

-- Least-privilege table grants. Order items are inserted by the trusted
-- place_wholesale_order() database transaction, not directly by the browser.
REVOKE ALL ON TABLE public.orders FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.orders FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.orders TO authenticated;

-- Only authenticated users may read order items.
REVOKE ALL ON TABLE public.order_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.order_items FROM authenticated;
GRANT SELECT ON TABLE public.order_items TO authenticated;

-- A dealer can insert only for their own account and assigned distributor.
-- The approved status check preserves the existing order-eligibility rule.
CREATE POLICY "dealers can insert"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.dealer_profiles AS dp
    WHERE dp.user_id = (SELECT auth.uid())
      AND dp.user_id = orders.dealer_id
      AND dp.distributor_id = orders.distributor_id
  )
);

-- A dealer can see only orders whose dealer_id is their Auth user ID.
CREATE POLICY "dealers view own"
ON public.orders
FOR SELECT
TO authenticated
USING (
  orders.dealer_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.dealer_profiles AS dp
    WHERE dp.user_id = (SELECT auth.uid())
      AND dp.distributor_id = orders.distributor_id
  )
);

-- A distributor can see all orders for the distributor record they own.
CREATE POLICY "distributors view their dealers orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.distributors AS d
    WHERE d.id = orders.distributor_id
      AND d.owner_id = (SELECT auth.uid())
      AND d.is_active = true
  )
);

-- Order items inherit access from the parent order.
DROP POLICY IF EXISTS "dealer_read_items_own_orders" ON public.order_items;
DROP POLICY IF EXISTS "distributor_read_items" ON public.order_items;

CREATE POLICY "dealer_read_items_own_orders"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders AS o
    WHERE o.id = order_items.order_id
      AND o.dealer_id = (SELECT auth.uid())
  )
);

CREATE POLICY "distributor_read_items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders AS o
    JOIN public.distributors AS d ON d.id = o.distributor_id
    WHERE o.id = order_items.order_id
      AND d.owner_id = (SELECT auth.uid())
      AND d.is_active = true
  )
);

COMMIT;

-- Verify order policies.
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'orders'
ORDER BY policyname;

-- Verify order item policies.
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'order_items'
ORDER BY policyname;
