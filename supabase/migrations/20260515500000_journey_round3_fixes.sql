-- ============================================================
-- User Journey Round 3 Fixes
-- ============================================================

-- ── BUG-1: Auto-mark customer as 沉默 if 30+ days without contact ──
-- Strategy: derived view + one-time backfill.
-- We won't add a daily cron; instead the boss dashboard's "silent count"
-- already derives this. The fix is to also auto-update stage when a contact
-- LOG comes in (already done), AND a one-time backfill for existing data.
update public.customers
set stage = '沉默'
where stage in ('新接触', '报价中', '已寄样')
  and last_contact_date is not null
  and (current_date - last_contact_date) >= 30;

-- ── BUG-2: Tighten INSERT RLS so users can only write to customers they own ──
-- A helper to check ownership (admin always allowed).
create or replace function public.owns_customer(target_customer_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.customers
    where id = target_customer_id
      and (owner_id = auth.uid() or public.get_my_role() = 'admin')
  );
$$ language sql security definer stable;

-- contact_logs
drop policy if exists contact_logs_insert on public.contact_logs;
create policy contact_logs_insert on public.contact_logs
  for insert to authenticated
  with check (public.owns_customer(customer_id) and logged_by = auth.uid());

-- customer_attachments
drop policy if exists attachments_insert on public.customer_attachments;
create policy attachments_insert on public.customer_attachments
  for insert to authenticated
  with check (public.owns_customer(customer_id) and uploaded_by = auth.uid());

-- customer_tags
drop policy if exists customer_tags_insert on public.customer_tags;
create policy customer_tags_insert on public.customer_tags
  for insert to authenticated
  with check (public.owns_customer(customer_id));

-- quotations
drop policy if exists quotations_insert on public.quotations;
create policy quotations_insert on public.quotations
  for insert to authenticated
  with check (public.owns_customer(customer_id));

-- quotation_items: must belong to a quotation whose customer is owned
drop policy if exists quotation_items_insert on public.quotation_items;
create policy quotation_items_insert on public.quotation_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_id and public.owns_customer(q.customer_id)
    )
  );

-- deals
drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals
  for insert to authenticated
  with check (public.owns_customer(customer_id));

-- samples
drop policy if exists samples_insert on public.samples;
create policy samples_insert on public.samples
  for insert to authenticated
  with check (public.owns_customer(customer_id));

-- reminders: customer-scoped if customer_id is set; admins can always insert
drop policy if exists reminders_insert on public.reminders;
create policy reminders_insert on public.reminders
  for insert to authenticated
  with check (
    customer_id is null
    or public.owns_customer(customer_id)
  );

-- stage_changes: triggered by stage updates; owner or admin only
drop policy if exists stage_changes_insert on public.stage_changes;
create policy stage_changes_insert on public.stage_changes
  for insert to authenticated
  with check (public.owns_customer(customer_id));

-- customers: anyone authenticated can create a new customer (assigned to self by default)
-- but the owner_id at creation must be self or admin
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert to authenticated
  with check (
    owner_id = auth.uid() or public.get_my_role() = 'admin'
  );

-- Tighten customers_update so non-admin owners cannot transfer ownership
-- (i.e. cannot change owner_id from themselves to someone else)
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to authenticated
  using (owner_id = auth.uid() or public.get_my_role() = 'admin')
  with check (owner_id = auth.uid() or public.get_my_role() = 'admin');
