-- ============================================================
-- Phase 3: Reminders / Tasks System
-- Indexes, fields, and auto-generation triggers on reminders
-- ============================================================

-- ── Indexes ──
create index if not exists idx_reminders_assigned on public.reminders(assigned_to);
create index if not exists idx_reminders_customer on public.reminders(customer_id);
create index if not exists idx_reminders_due_date on public.reminders(due_date);
create index if not exists idx_reminders_status on public.reminders(status);

-- ── Add columns ──
alter table public.reminders
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists completed_at timestamptz;

-- Ensure status check matches our app constants
alter table public.reminders
  drop constraint if exists reminders_status_check;
alter table public.reminders
  add constraint reminders_status_check
  check (status in ('pending', 'completed', 'cancelled'));

-- Ensure type check matches our app constants
alter table public.reminders
  drop constraint if exists reminders_type_check;
alter table public.reminders
  add constraint reminders_type_check
  check (type in (
    'follow_up',       -- 回访
    'payment',         -- 催款
    'quotation',       -- 跟进报价
    'sample_feedback', -- 样品反馈
    'birthday',        -- 客户生日
    'festival',        -- 节日问候
    'shipping',        -- 发货跟进
    'custom'           -- 自定义
  ));

-- ============================================================
-- Auto-create reminders on key business events
-- ============================================================

-- After a deal is created → 30-day follow-up reminder
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
    (coalesce(new.deal_date, current_date) + interval '30 days')::date,
    'pending',
    '成交后 30 天回访',
    new.created_by
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_auto_reminder_deal on public.deals;
create trigger trg_auto_reminder_deal
  after insert on public.deals
  for each row execute function public.auto_reminder_after_deal();

-- After a sample is sent → 7-day feedback reminder
create or replace function public.auto_reminder_after_sample()
returns trigger as $$
declare
  customer_owner uuid;
begin
  -- Only fire when status transitions to 'sent' (or inserted as 'sent')
  if new.status != 'sent' then return new; end if;
  if TG_OP = 'UPDATE' and old.status = 'sent' then return new; end if;

  select owner_id into customer_owner from public.customers where id = new.customer_id;
  if customer_owner is null then return new; end if;

  insert into public.reminders (customer_id, assigned_to, type, due_date, status, note, created_by)
  values (
    new.customer_id,
    customer_owner,
    'sample_feedback',
    (coalesce(new.sent_date, current_date) + interval '7 days')::date,
    'pending',
    '样品寄出 7 天，询问反馈',
    new.created_by
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_auto_reminder_sample on public.samples;
create trigger trg_auto_reminder_sample
  after insert or update on public.samples
  for each row execute function public.auto_reminder_after_sample();

-- After a quotation is sent → 3-day follow-up reminder
create or replace function public.auto_reminder_after_quotation()
returns trigger as $$
declare
  customer_owner uuid;
begin
  if new.status != 'sent' then return new; end if;
  if TG_OP = 'UPDATE' and old.status = 'sent' then return new; end if;

  select owner_id into customer_owner from public.customers where id = new.customer_id;
  if customer_owner is null then return new; end if;

  insert into public.reminders (customer_id, assigned_to, type, due_date, status, note, created_by)
  values (
    new.customer_id,
    customer_owner,
    'quotation',
    (current_date + interval '3 days')::date,
    'pending',
    '报价 3 天后跟进',
    new.created_by
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_auto_reminder_quotation on public.quotations;
create trigger trg_auto_reminder_quotation
  after insert or update on public.quotations
  for each row execute function public.auto_reminder_after_quotation();

-- ============================================================
-- Trigger: set completed_at automatically when status flips
-- ============================================================
create or replace function public.set_reminder_completed_at()
returns trigger as $$
begin
  if new.status = 'completed' and (old.status is null or old.status != 'completed') then
    new.completed_at := now();
  elsif new.status != 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_reminder_completed_at on public.reminders;
create trigger trg_reminder_completed_at
  before update on public.reminders
  for each row execute function public.set_reminder_completed_at();
