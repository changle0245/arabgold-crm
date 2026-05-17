-- ============================================================
-- Bug 4 fix (DB layer): localize auto-reminder trigger dates to CN
-- ============================================================
-- Background:
--   2 of the 3 auto-reminder trigger functions compute due_date using
--   `current_date`, which the DB returns in its session timezone (UTC).
--   Combined with the now-CN-localized frontend writes (the batch-C
--   commits in this Bug 4 work), trigger-generated reminder due_dates
--   would otherwise sit 1 day off during CN 00:00–08:00 — precisely
--   the window in which Bug 4 manifests.
--
--   Replace `current_date` with `(now() at time zone 'Asia/Shanghai')::date`
--   so the trigger-side "today" matches what the team in 广州 sees.
--
-- Functions CHANGED (2 of 3):
--   1. auto_reminder_after_quotation
--        old:  (current_date + interval '3 days')::date
--        new:  ((now() at time zone 'Asia/Shanghai')::date + interval '3 days')::date
--   2. auto_reminder_after_deal
--        old fallback:  coalesce(new.deal_date, current_date)
--        new fallback:  coalesce(new.deal_date, (now() at time zone 'Asia/Shanghai')::date)
--
-- Function NOT changed:
--   auto_reminder_after_sample uses `new.sent_date + interval '7 days'`,
--   which is pure date arithmetic on a `date` column (no timezone in
--   play). The frontend now writes sent_date via todayLocalISO() so the
--   value is already CN-local, and adding 7 days to a date is timezone-
--   free. No change needed inside this function.
--
-- Bug 11 (20260517010000) intersection check:
--   That migration replaced: advance_stage_on_quotation / _sample / _deal.
--   This migration replaces : auto_reminder_after_quotation / _deal.
--   Different function names → zero overlap. CREATE OR REPLACE here
--   does not affect the stage_changes audit logic introduced by Bug 11.
--
-- Strategy:
--   CREATE OR REPLACE FUNCTION only. Triggers stay bound to the same
--   function names — no DROP TRIGGER / CREATE TRIGGER. The function
--   bodies are byte-identical to their latest prior version (auto_
--   reminder_after_quotation from 20260515300000, auto_reminder_after_
--   deal from 20260515200000) except for the one line called out above.
-- ============================================================

-- ── 1. quotation auto-reminder: due_date = CN-today + 3 days ──
create or replace function public.auto_reminder_after_quotation()
returns trigger as $$
declare
  customer_owner uuid;
begin
  select owner_id into customer_owner from public.customers where id = new.customer_id;
  if customer_owner is null then return new; end if;

  insert into public.reminders (customer_id, assigned_to, type, due_date, status, note, created_by)
  values (
    new.customer_id,
    customer_owner,
    'quotation',
    ((now() at time zone 'Asia/Shanghai')::date + interval '3 days')::date,
    'pending',
    '报价 ' || coalesce(new.quote_no, '') || ' 3 天后跟进',
    new.created_by
  );
  return new;
end;
$$ language plpgsql security definer;

-- ── 2. deal auto-reminder: due_date = (new.deal_date or CN-today) + 30 days ──
create or replace function public.auto_reminder_after_deal()
returns trigger as $$
declare
  customer_owner uuid;
begin
  select owner_id into customer_owner from public.customers where id = new.customer_id;
  if customer_owner is null then return new; end if;

  insert into public.reminders (customer_id, assigned_to, type, due_date, status, note, created_by)
  values (
    new.customer_id,
    customer_owner,
    'follow_up',
    (coalesce(new.deal_date, (now() at time zone 'Asia/Shanghai')::date) + interval '30 days')::date,
    'pending',
    '成交后 30 天回访',
    new.created_by
  );
  return new;
end;
$$ language plpgsql security definer;
