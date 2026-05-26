-- ============================================================
-- M2 fix: silent-customer scan also advances stage to '沉默'
-- ============================================================
-- scan_silent_customers created a reminder for a customer with no
-- contact for >= 30 days but never set customers.stage = '沉默'. Nothing
-- else set it automatically either, so '沉默' was effectively a
-- manual-only stage. The boss dashboard then showed two contradictory
-- "沉默" numbers: the StatCard counted by contact-recency, while the
-- funnel's 沉默 branch counted stage = '沉默' (≈ 0 in practice).
--
-- Fix: when the scan flags a customer as silent, also move its stage to
-- '沉默' (unless already 已成交 / 沉默). advance_stage_on_deal already
-- revives a customer out of '沉默' when a new deal is closed, so this
-- completes a coherent lifecycle. The stage UPDATE is audited by
-- trg_record_stage_change once 20260520010000 is applied (changed_by is
-- NULL for the cron actor — expected).
--
-- Body verbatim from 20260516020000_silent_customer_reminders.sql plus
-- the one stage UPDATE inside the loop.
-- ============================================================

create or replace function public.scan_silent_customers()
returns table(
  customers_scanned integer,
  reminders_created integer,
  customer_names text[]
)
language plpgsql
security definer
as $$
declare
  v_scanned integer := 0;
  v_created integer := 0;
  v_names text[] := array[]::text[];
  v_customer record;
  v_existing_reminder_count integer;
begin
  for v_customer in
    select
      c.id as customer_id,
      c.contact_name,
      c.owner_id,
      c.last_contact_date,
      current_date - c.last_contact_date::date as days_silent
    from public.customers c
    where c.last_contact_date is not null
      and c.last_contact_date::date <= current_date - interval '30 days'
      and c.stage != '已成交'
      and c.owner_id is not null
  loop
    v_scanned := v_scanned + 1;

    -- M2: move the customer into the '沉默' stage so the dashboard's
    -- stage funnel and the silent-customer count agree. Guard avoids a
    -- no-op UPDATE (which would otherwise log a spurious stage change).
    update public.customers
    set stage = '沉默'
    where id = v_customer.customer_id
      and stage not in ('已成交', '沉默');

    -- Check for an existing uncompleted silent reminder for this customer
    select count(*) into v_existing_reminder_count
    from public.reminders
    where customer_id = v_customer.customer_id
      and type = 'silent_customer'
      and status = 'pending';

    if v_existing_reminder_count = 0 then
      insert into public.reminders (
        customer_id, assigned_to, type, due_date, status, note, created_by
      ) values (
        v_customer.customer_id,
        v_customer.owner_id,
        'silent_customer',
        current_date + interval '1 day',
        'pending',
        format('客户已沉默 %s 天，建议主动联系', v_customer.days_silent),
        null
      );
      v_created := v_created + 1;
      v_names := array_append(v_names, v_customer.contact_name);
    end if;
  end loop;

  return query select v_scanned, v_created, v_names;
end;
$$;
