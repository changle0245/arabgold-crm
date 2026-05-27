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



-- customer_attachments



-- customer_tags



-- quotations



-- quotation_items: must belong to a quotation whose customer is owned



-- deals



-- samples



-- reminders: customer-scoped if customer_id is set; admins can always insert



-- stage_changes: triggered by stage updates; owner or admin only



-- customers: anyone authenticated can create a new customer (assigned to self by default)
-- but the owner_id at creation must be self or admin



-- Tighten customers_update so non-admin owners cannot transfer ownership
-- (i.e. cannot change owner_id from themselves to someone else)



-- ----------------------------------------------------------
-- Phase 3a Neon port: Supabase-specific SQL stripped above
-- (RLS policies / grants / storage / pg_cron). See top of
-- 20260514091040_initial_schema.sql for the auth.uid() stub.
-- ----------------------------------------------------------
