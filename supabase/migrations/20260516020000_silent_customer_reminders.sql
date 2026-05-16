-- Migration: Silent Customer Auto-Reminder System
-- Purpose: Automatically create reminders for customers with no contact for >= 30 days
-- Scheduled to run daily at 02:00 AM

-- Enable pg_cron extension if not already enabled
create extension if not exists pg_cron with schema extensions;

-- Add new reminder types to the CHECK constraint
alter table public.reminders
drop constraint if exists reminders_type_check;

alter table public.reminders
add constraint reminders_type_check
check (type = any (array[
  'follow_up'::text,
  'payment'::text,
  'quotation'::text,
  'sample_feedback'::text,
  'birthday'::text,
  'festival'::text,
  'shipping'::text,
  'custom'::text,
  'silent_customer'::text,    -- New: for customers with no contact >= 30 days
  'reorder_cycle'::text        -- New: for customers past their typical reorder cycle
]));

-- Function: Scan and create reminders for silent customers
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
  -- Scan customers who meet silent criteria:
  -- 1. last_contact_date >= 30 days ago
  -- 2. stage != '已成交'
  -- 3. owner_id is not null (has an assigned owner)
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

    -- Check if there's already an uncompleted silent reminder for this customer
    select count(*) into v_existing_reminder_count
    from public.reminders
    where customer_id = v_customer.customer_id
      and type = 'silent_customer'
      and status = 'pending';

    -- Only create if no existing pending silent reminder
    if v_existing_reminder_count = 0 then
      insert into public.reminders (
        customer_id,
        assigned_to,
        type,
        due_date,
        status,
        note,
        created_by
      ) values (
        v_customer.customer_id,
        v_customer.owner_id,
        'silent_customer',
        current_date + interval '1 day',  -- Due tomorrow
        'pending',
        format('客户已沉默 %s 天，建议主动联系', v_customer.days_silent),
        null  -- System-created, no created_by
      );

      v_created := v_created + 1;
      v_names := array_append(v_names, v_customer.contact_name);
    end if;
  end loop;

  return query select v_scanned, v_created, v_names;
end;
$$;

-- Grant execute permission to authenticated users (for manual testing)
grant execute on function public.scan_silent_customers() to authenticated;

-- Schedule the job to run daily at 02:00 AM
-- Note: pg_cron jobs persist across database restarts
select cron.schedule(
  'scan-silent-customers-daily',  -- job name
  '0 2 * * *',                     -- cron expression: every day at 02:00
  $$select public.scan_silent_customers();$$
);

-- Comment for documentation
comment on function public.scan_silent_customers is
  'Scans for customers with no contact >= 30 days and creates reminders. Returns (scanned_count, created_count, customer_names). Can be called manually for testing.';
