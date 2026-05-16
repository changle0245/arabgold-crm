-- ============================================================
-- User Journey Fixes (post Phase 3)
-- Fixes discovered during salesperson walkthrough
-- ============================================================

-- ── BUG-1: last_contact_date should default to NULL ──
alter table public.customers
  alter column last_contact_date drop default;

-- Reset existing customers that never had a contact log to NULL
update public.customers c
set last_contact_date = null
where last_contact_date is not null
  and not exists (select 1 from public.contact_logs cl where cl.customer_id = c.id);

-- ── BUG-2: auto-advance customer stage on quotation / sample / deal events ──

create or replace function public.advance_stage_on_quotation()
returns trigger as $$
begin
  -- Only advance if stage is earlier in pipeline (待定/新接触)
  update public.customers
  set stage = '报价中'
  where id = new.customer_id
    and stage in ('待定', '新接触');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_advance_stage_quotation on public.quotations;
create trigger trg_advance_stage_quotation
  after insert on public.quotations
  for each row execute function public.advance_stage_on_quotation();

create or replace function public.advance_stage_on_sample()
returns trigger as $$
begin
  -- Don't downgrade from 已成交; advance from 待定/新接触/报价中
  update public.customers
  set stage = '已寄样'
  where id = new.customer_id
    and stage in ('待定', '新接触', '报价中');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_advance_stage_sample on public.samples;
create trigger trg_advance_stage_sample
  after insert on public.samples
  for each row execute function public.advance_stage_on_sample();

create or replace function public.advance_stage_on_deal()
returns trigger as $$
begin
  -- Deal always means closed (highest stage); revives 沉默 customers too
  update public.customers
  set stage = '已成交'
  where id = new.customer_id
    and stage != '已成交';
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_advance_stage_deal on public.deals;
create trigger trg_advance_stage_deal
  after insert on public.deals
  for each row execute function public.advance_stage_on_deal();

-- ── BUG-3 & BUG-4: auto-reminder triggers should fire on insert,
--    not only when status flips to 'sent'.
--    Replace old triggers with insert-only versions.
-- ============================================================

-- Replace quotation auto-reminder: fire on every insert
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
    (current_date + interval '3 days')::date,
    'pending',
    '报价 ' || coalesce(new.quote_no, '') || ' 3 天后跟进',
    new.created_by
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_auto_reminder_quotation on public.quotations;
create trigger trg_auto_reminder_quotation
  after insert on public.quotations
  for each row execute function public.auto_reminder_after_quotation();

-- Replace sample auto-reminder: fire on insert when sent_date is set
create or replace function public.auto_reminder_after_sample()
returns trigger as $$
declare
  customer_owner uuid;
begin
  -- Only build reminder if sample was actually sent (has sent_date)
  if new.sent_date is null then return new; end if;

  select owner_id into customer_owner from public.customers where id = new.customer_id;
  if customer_owner is null then return new; end if;

  insert into public.reminders (customer_id, assigned_to, type, due_date, status, note, created_by)
  values (
    new.customer_id,
    customer_owner,
    'sample_feedback',
    (new.sent_date + interval '7 days')::date,
    'pending',
    '样品「' || coalesce(new.sample_desc, '') || '」寄出 7 天，询问反馈',
    new.created_by
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_auto_reminder_sample on public.samples;
create trigger trg_auto_reminder_sample
  after insert on public.samples
  for each row execute function public.auto_reminder_after_sample();
