-- ============================================================
-- User Journey Round 2 Fixes
-- ============================================================

-- ── BUG-1: revive 沉默 customers when a new contact log lands ──
-- Extend the existing update_last_contact_date trigger logic.
create or replace function public.update_last_contact_date()
returns trigger as $$
begin
  update public.customers
  set last_contact_date = new.log_date,
      -- If customer is silent, revive them to 新接触 (still active pipeline)
      stage = case when stage = '沉默' then '新接触' else stage end,
      updated_at = now()
  where id = new.customer_id
    and (last_contact_date is null or last_contact_date < new.log_date);
  return new;
end;
$$ language plpgsql security definer;

-- One-time backfill: any customer marked 沉默 but contacted in last 30 days → 新接触
update public.customers
set stage = '新接触'
where stage = '沉默'
  and last_contact_date is not null
  and (current_date - last_contact_date) < 30;
