-- Migration: Customer Ownership Change Tracking
-- Fix #13: When admin transfers a customer to another owner, record the event in the customer's timeline
-- Mirrors the structure of stage_changes

create extension if not exists "uuid-ossp";

create table if not exists public.customer_ownership_changes (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  changed_by uuid not null references public.profiles(id),
  from_owner uuid references public.profiles(id),
  to_owner uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);

create index if not exists idx_ownership_changes_customer
  on public.customer_ownership_changes(customer_id);

alter table public.customer_ownership_changes enable row level security;

-- SELECT: admins + the customer's current owner can see ownership history
drop policy if exists "ownership_changes_select" on public.customer_ownership_changes;
create policy "ownership_changes_select" on public.customer_ownership_changes
  for select to authenticated
  using (
    public.current_user_is_active()
    and (
      public.current_user_is_admin()
      or customer_id in (
        select id from public.customers where owner_id = auth.uid()
      )
    )
  );

-- INSERT: any active user (mirrors stage_changes; in practice only admin reaches the transfer UI)
drop policy if exists "ownership_changes_insert" on public.customer_ownership_changes;
create policy "ownership_changes_insert" on public.customer_ownership_changes
  for insert to authenticated
  with check (public.current_user_is_active());

-- UPDATE / DELETE: admin only
drop policy if exists "ownership_changes_update" on public.customer_ownership_changes;
create policy "ownership_changes_update" on public.customer_ownership_changes
  for update to authenticated
  using (public.current_user_is_admin());

drop policy if exists "ownership_changes_delete" on public.customer_ownership_changes;
create policy "ownership_changes_delete" on public.customer_ownership_changes
  for delete to authenticated
  using (public.current_user_is_admin());

comment on table public.customer_ownership_changes is
  'Audit log of customer ownership transfers. Inserted by app code when customers.owner_id changes.';
