-- Migration: Reorder Cycle Auto-Reminder System
-- Purpose: Automatically create reminders for customers past their typical reorder cycle
-- Runs together with silent customer scan daily at 02:00 AM

-- Function: Scan and create reminders for customers past reorder cycle
create or replace function public.scan_reorder_cycle_reminders()
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
  v_deal_dates date[];
  v_avg_cycle_days numeric;
  v_days_since_last_deal integer;
begin
  -- Scan customers who have >= 2 deals
  for v_customer in
    select
      c.id as customer_id,
      c.contact_name,
      c.owner_id,
      array_agg(d.deal_date order by d.deal_date desc) as deal_dates,
      count(d.id) as deal_count,
      max(d.deal_date) as last_deal_date
    from public.customers c
    join public.deals d on d.customer_id = c.id
    where c.owner_id is not null
      and d.deal_date is not null
    group by c.id, c.contact_name, c.owner_id
    having count(d.id) >= 2
  loop
    v_scanned := v_scanned + 1;

    -- Calculate average cycle from most recent 3 deals (or all if < 3)
    v_deal_dates := v_customer.deal_dates[1:least(3, array_length(v_customer.deal_dates, 1))];

    -- Calculate average interval between consecutive deals
    if array_length(v_deal_dates, 1) >= 2 then
      declare
        v_total_days integer := 0;
        v_intervals integer := 0;
        i integer;
      begin
        for i in 1..(array_length(v_deal_dates, 1) - 1) loop
          v_total_days := v_total_days + (v_deal_dates[i] - v_deal_dates[i + 1]);
          v_intervals := v_intervals + 1;
        end loop;

        if v_intervals > 0 then
          v_avg_cycle_days := v_total_days::numeric / v_intervals;
        else
          continue; -- Skip if can't calculate
        end if;
      end;
    else
      continue; -- Skip if not enough data
    end if;

    -- Calculate days since last deal
    v_days_since_last_deal := current_date - v_customer.last_deal_date;

    -- Check if past the typical reorder cycle
    if v_days_since_last_deal > v_avg_cycle_days then
      -- Check for existing pending reorder_cycle reminder
      select count(*) into v_existing_reminder_count
      from public.reminders
      where customer_id = v_customer.customer_id
        and type = 'reorder_cycle'
        and status = 'pending';

      -- Only create if no existing pending reorder reminder
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
          'reorder_cycle',
          current_date + interval '1 day',  -- Due tomorrow
          'pending',
          format('该客户通常每 %s 天返单，距上次成交已 %s 天', round(v_avg_cycle_days), v_days_since_last_deal),
          null  -- System-created, no created_by
        );

        v_created := v_created + 1;
        v_names := array_append(v_names, v_customer.contact_name);
      end if;
    end if;
  end loop;

  return query select v_scanned, v_created, v_names;
end;
$$;

-- Grant execute permission to authenticated users (for manual testing)
grant execute on function public.scan_reorder_cycle_reminders() to authenticated;

-- Update the combined daily reminder scan job
-- This will run both silent customer and reorder cycle scans together
create or replace function public.scan_all_auto_reminders()
returns table(
  silent_scanned integer,
  silent_created integer,
  silent_names text[],
  reorder_scanned integer,
  reorder_created integer,
  reorder_names text[]
)
language plpgsql
security definer
as $$
declare
  v_silent_scanned integer;
  v_silent_created integer;
  v_silent_names text[];
  v_reorder_scanned integer;
  v_reorder_created integer;
  v_reorder_names text[];
begin
  -- Run silent customer scan
  select * into v_silent_scanned, v_silent_created, v_silent_names
  from public.scan_silent_customers();

  -- Run reorder cycle scan
  select * into v_reorder_scanned, v_reorder_created, v_reorder_names
  from public.scan_reorder_cycle_reminders();

  return query select
    v_silent_scanned, v_silent_created, v_silent_names,
    v_reorder_scanned, v_reorder_created, v_reorder_names;
end;
$$;

grant execute on function public.scan_all_auto_reminders() to authenticated;

-- Update the cron job to use the combined function
select cron.unschedule('scan-silent-customers-daily');

select cron.schedule(
  'scan-all-auto-reminders-daily',  -- job name
  '0 2 * * *',                       -- cron expression: every day at 02:00
  $$select public.scan_all_auto_reminders();$$
);

-- Comment for documentation
comment on function public.scan_reorder_cycle_reminders is
  'Scans for customers with >= 2 deals who are past their typical reorder cycle and creates reminders. Returns (scanned_count, created_count, customer_names). Can be called manually for testing.';

comment on function public.scan_all_auto_reminders is
  'Combined function that runs both silent customer and reorder cycle reminder scans. Scheduled to run daily at 02:00 AM.';
