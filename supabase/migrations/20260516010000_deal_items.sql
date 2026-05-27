-- ============================================================
-- Phase 2: deal_items
-- Mirror of quotation_items, but linked to deals. Optional —
-- a deal can have zero items and just carry deal_amount.
-- When a quotation is converted to a deal, quotation_items
-- can be copied into deal_items by the application layer.
-- ============================================================

create table if not exists public.deal_items (
  id uuid primary key default uuid_generate_v4(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  product_name text,
  spec text,
  quantity numeric,
  unit text default '件',
  unit_price numeric,
  amount numeric,
  remark text
);

create index if not exists idx_deal_items_deal on public.deal_items(deal_id);






-- ----------------------------------------------------------
-- Phase 3a Neon port: Supabase-specific SQL stripped above
-- (RLS policies / grants / storage / pg_cron). See top of
-- 20260514091040_initial_schema.sql for the auth.uid() stub.
-- ----------------------------------------------------------
