-- Migration: Monthly Revenue Target Setting
-- Purpose: Add monthly_revenue_target configuration for P1-1.3 业绩目标对比

-- Insert default monthly_revenue_target setting (if not exists)
insert into public.system_settings (key, value, description)
values (
  'monthly_revenue_target',
  'null'::jsonb,
  'Monthly revenue target for performance tracking. Set by admin. null means not set.'
)
on conflict (key) do nothing;

-- Comment for documentation
comment on column public.system_settings.value is
  'JSON value. For monthly_revenue_target: number (e.g. 100000) or null (not set)';
