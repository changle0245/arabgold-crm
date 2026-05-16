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

alter table public.deal_items enable row level security;

create policy "deal_items_select" on public.deal_items
  for select to authenticated using (true);

create policy "deal_items_insert" on public.deal_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and public.owns_customer(d.customer_id)
    )
  );

create policy "deal_items_update" on public.deal_items
  for update to authenticated
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and public.owns_customer(d.customer_id)
    )
  );

create policy "deal_items_delete" on public.deal_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and public.owns_customer(d.customer_id)
    )
  );
