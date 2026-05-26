-- Migration: Deduplicate auto-generated deal follow-up reminders
-- Fix #18: Same customer + multiple deals same day → same "30 天回访" reminder duplicated
-- Solution: trigger checks for existing pending follow_up on the same due_date/note before inserting

create or replace function public.auto_reminder_after_deal()
returns trigger as $$
declare
  customer_owner uuid;
  v_due_date date;
begin
  select owner_id into customer_owner from public.customers where id = new.customer_id;
  if customer_owner is null then return new; end if;

  v_due_date := (coalesce(new.deal_date, (now() at time zone 'Asia/Shanghai')::date) + interval '30 days')::date;

  -- Skip if an identical pending reminder already exists for this customer/type/due_date
  if exists (
    select 1 from public.reminders
    where customer_id = new.customer_id
      and type = 'follow_up'
      and status = 'pending'
      and due_date = v_due_date
      and note = '成交后 30 天回访'
  ) then
    return new;
  end if;

  insert into public.reminders (customer_id, assigned_to, type, due_date, status, note, created_by)
  values (
    new.customer_id,
    customer_owner,
    'follow_up',
    v_due_date,
    'pending',
    '成交后 30 天回访',
    new.created_by
  );
  return new;
end;
$$ language plpgsql security definer;

comment on function public.auto_reminder_after_deal() is
  'Auto-create 30-day follow-up reminder after deal insert. Dedupes by (customer_id, type, status, due_date, note) to avoid duplicate reminders when multiple deals are recorded on the same day for the same customer.';
