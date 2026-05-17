-- ============================================================
-- SECURITY FIX: SELECT RLS hardening + Bug 8 inactive-user gate
-- ============================================================
-- Background:
--   All listed tables' SELECT policies were `using (true)`, so any
--   authenticated user could read every row across all owners, and
--   deactivated accounts could keep reading. This migration replaces
--   those policies with owner-or-admin isolation, gated by a strict
--   is_active check (database-layer defense for Bug 8).
--
-- Tables fixed (11):
--   customers, contact_logs, customer_attachments, stage_changes,
--   quotations, quotation_items, deals, deal_items, samples,
--   reminders, customer_tags
--
-- NOT touched:
--   profiles — team-wide read is needed (owner names on dashboards,
--              user selector in admin pages, etc.)
-- ============================================================

-- ── Helper functions ────────────────────────────────────────
-- SECURITY DEFINER + STABLE so RLS policies can call them without
-- recursing through profiles' own policies and so the planner caches
-- the result per statement.

create or replace function public.current_user_is_active()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_active from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ============================================================
-- Replace SELECT policies on the 11 tables
-- ============================================================
-- Unified shape:
--   using (
--     current_user_is_active()
--     and ( current_user_is_admin() or <ownership condition> )
--   )
-- Inactive users → blocked entirely. Admins → see everything.
-- Members → see only rows tied to customers they own (or, for
-- reminders, rows assigned to them).

-- ── customers ──────────────────────────────────────────────
drop policy if exists "customers_select" on public.customers;
create policy "customers_select" on public.customers
  for select to authenticated
  using (
    public.current_user_is_active()
    and (
      public.current_user_is_admin()
      or owner_id = auth.uid()
    )
  );

-- ── contact_logs ───────────────────────────────────────────
drop policy if exists "contact_logs_select" on public.contact_logs;
create policy "contact_logs_select" on public.contact_logs
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

-- ── customer_attachments ───────────────────────────────────
drop policy if exists "attachments_select" on public.customer_attachments;
create policy "attachments_select" on public.customer_attachments
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

-- ── stage_changes ──────────────────────────────────────────
drop policy if exists "stage_changes_select" on public.stage_changes;
create policy "stage_changes_select" on public.stage_changes
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

-- ── quotations ─────────────────────────────────────────────
drop policy if exists "quotations_select" on public.quotations;
create policy "quotations_select" on public.quotations
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

-- ── quotation_items (two-hop: items → quotations → customers) ─
drop policy if exists "quotation_items_select" on public.quotation_items;
create policy "quotation_items_select" on public.quotation_items
  for select to authenticated
  using (
    public.current_user_is_active()
    and (
      public.current_user_is_admin()
      or quotation_id in (
        select q.id
        from public.quotations q
        join public.customers c on c.id = q.customer_id
        where c.owner_id = auth.uid()
      )
    )
  );

-- ── deals ──────────────────────────────────────────────────
drop policy if exists "deals_select" on public.deals;
create policy "deals_select" on public.deals
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

-- ── samples ────────────────────────────────────────────────
drop policy if exists "samples_select" on public.samples;
create policy "samples_select" on public.samples
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

-- ── reminders ──────────────────────────────────────────────
-- NOTE: rows with assigned_to IS NULL are visible only to admins under
-- this policy. Confirmed acceptable for current data model.
drop policy if exists "reminders_select" on public.reminders;
create policy "reminders_select" on public.reminders
  for select to authenticated
  using (
    public.current_user_is_active()
    and (
      public.current_user_is_admin()
      or assigned_to = auth.uid()
    )
  );

-- ── deal_items (two-hop: items → deals → customers) ────────
drop policy if exists "deal_items_select" on public.deal_items;
create policy "deal_items_select" on public.deal_items
  for select to authenticated
  using (
    public.current_user_is_active()
    and (
      public.current_user_is_admin()
      or deal_id in (
        select d.id
        from public.deals d
        join public.customers c on c.id = d.customer_id
        where c.owner_id = auth.uid()
      )
    )
  );

-- ── customer_tags (single hop to customers) ────────────────
drop policy if exists "customer_tags_select" on public.customer_tags;
create policy "customer_tags_select" on public.customer_tags
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
