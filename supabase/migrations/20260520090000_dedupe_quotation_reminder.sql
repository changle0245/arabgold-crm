-- ============================================================
-- M6 fix: deduplicate the quotation follow-up reminder
-- ============================================================
-- auto_reminder_after_quotation fired on every quotations INSERT with
-- no dedup guard. Quotations support a version chain, so a customer
-- quoted 4 times accrued 4 near-identical pending "3 天后跟进"
-- reminders. The deal follow-up reminder was given a dedup guard in
-- 20260518010000; the quotation one was missed.
--
-- Fix: skip creating the reminder if the customer already has a pending
-- 'quotation' reminder. (Dedup key cannot include `note` — the note
-- embeds the unique quote_no — so it keys on customer + type + pending.)
--
-- Body verbatim from 20260517020000_localize_reminder_trigger_dates.sql
-- except the added exists() guard.
-- ============================================================

create or replace function public.auto_reminder_after_quotation()
returns trigger as $$
declare
  customer_owner uuid;
begin
  select owner_id into customer_owner from public.customers where id = new.customer_id;
  if customer_owner is null then return new; end if;

  -- M6: 该客户已有待办的报价跟进提醒就不再重复创建(多版本报价场景)
  if exists (
    select 1 from public.reminders
    where customer_id = new.customer_id
      and type = 'quotation'
      and status = 'pending'
  ) then
    return new;
  end if;

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
