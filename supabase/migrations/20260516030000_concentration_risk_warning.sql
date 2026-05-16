-- Migration: Concentration Risk Warning for Boss Dashboard
-- Purpose: Alert admin about customers contributing > X% of total revenue

-- Create system_settings table for configuration
create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.system_settings enable row level security;

-- Only admins can read/write system settings
create policy "Admins can read system settings"
  on public.system_settings for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can update system settings"
  on public.system_settings for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can insert system settings"
  on public.system_settings for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Insert default concentration risk threshold (30%)
insert into public.system_settings (key, value, description)
values (
  'concentration_risk_threshold',
  '0.30'::jsonb,
  '大客户集中度风险阈值（单客户占总营收比例超过此值时预警），范围 0.10-0.80'
)
on conflict (key) do nothing;

-- Function: Get concentration risk customers
-- Returns customers whose revenue share exceeds the threshold in the last 12 months
create or replace function public.get_concentration_risk_customers()
returns table(
  customer_id uuid,
  customer_name text,
  customer_company text,
  total_amount numeric,
  revenue_share numeric,
  deal_count bigint
)
language plpgsql
security definer
stable
as $$
declare
  v_threshold numeric;
  v_total_revenue numeric;
begin
  -- Get threshold from settings (default to 0.30 if not found)
  select coalesce((value)::numeric, 0.30) into v_threshold
  from public.system_settings
  where key = 'concentration_risk_threshold';

  -- Calculate total company revenue in last 12 months
  select coalesce(sum(deal_amount), 0) into v_total_revenue
  from public.deals
  where deal_date >= current_date - interval '12 months'
    or (deal_date is null and created_at >= current_date - interval '12 months');

  -- Return empty if no revenue
  if v_total_revenue = 0 then
    return;
  end if;

  -- Find customers exceeding threshold
  return query
  select
    c.id as customer_id,
    c.contact_name as customer_name,
    c.company_name as customer_company,
    sum(d.deal_amount) as total_amount,
    round((sum(d.deal_amount) / v_total_revenue)::numeric, 4) as revenue_share,
    count(d.id) as deal_count
  from public.customers c
  join public.deals d on d.customer_id = c.id
  where d.deal_date >= current_date - interval '12 months'
    or (d.deal_date is null and d.created_at >= current_date - interval '12 months')
  group by c.id, c.contact_name, c.company_name
  having (sum(d.deal_amount) / v_total_revenue) > v_threshold
  order by revenue_share desc;
end;
$$;

-- Grant execute to authenticated users (RLS will handle admin-only access in frontend)
grant execute on function public.get_concentration_risk_customers() to authenticated;

-- Comment for documentation
comment on function public.get_concentration_risk_customers is
  'Returns customers whose revenue share exceeds concentration_risk_threshold in last 12 months. Admin-only feature.';

comment on table public.system_settings is
  'System-wide configuration settings. Admin-only access.';
