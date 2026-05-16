-- ============================================================
-- Phase 2 Enhancements
-- Indexes, triggers, and minor column additions for
-- quotations, deals, samples tables created in initial schema
-- ============================================================

-- ── Indexes for Phase 2 tables ──
create index if not exists idx_quotations_customer on public.quotations(customer_id);
create index if not exists idx_quotation_items_quotation on public.quotation_items(quotation_id);
create index if not exists idx_deals_customer on public.deals(customer_id);
create index if not exists idx_samples_customer on public.samples(customer_id);
create index if not exists idx_deals_deal_date on public.deals(deal_date);

-- ── quotations: add notes, parent_id for version chain ──
alter table public.quotations
  add column if not exists notes text,
  add column if not exists parent_id uuid references public.quotations(id);

-- ── quotation_items: add unit column ──
alter table public.quotation_items
  add column if not exists unit text default '件';

-- ── deals: add notes, shipping_date ──
alter table public.deals
  add column if not exists notes text,
  add column if not exists shipping_date date;

-- ── samples: add status, quantity, cost columns ──
alter table public.samples
  add column if not exists status text default 'pending'
    check (status in ('pending', 'sent', 'received', 'feedback_received')),
  add column if not exists quantity integer default 1,
  add column if not exists cost numeric;

-- ============================================================
-- Trigger: auto-update customers.total_deal_count/amount on deal changes
-- ============================================================
create or replace function public.refresh_customer_deal_stats()
returns trigger as $$
declare
  target_customer_id uuid;
begin
  if TG_OP = 'DELETE' then
    target_customer_id := old.customer_id;
  else
    target_customer_id := new.customer_id;
  end if;

  update public.customers
  set total_deal_count = (
        select count(*) from public.deals
        where customer_id = target_customer_id
      ),
      total_deal_amount = (
        select coalesce(sum(deal_amount), 0) from public.deals
        where customer_id = target_customer_id
      ),
      first_deal_date = (
        select min(deal_date) from public.deals
        where customer_id = target_customer_id
      ),
      updated_at = now()
  where id = target_customer_id;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_refresh_deal_stats
  after insert or update or delete on public.deals
  for each row execute function public.refresh_customer_deal_stats();

-- ============================================================
-- Trigger: auto-generate quote_no as "Q-YYYYMMDD-XXXX"
-- ============================================================
create or replace function public.generate_quote_no()
returns trigger as $$
declare
  seq integer;
begin
  if new.quote_no is null or new.quote_no = '' then
    select count(*) + 1 into seq
    from public.quotations
    where created_at::date = current_date;
    new.quote_no := 'Q-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(seq::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_generate_quote_no
  before insert on public.quotations
  for each row execute function public.generate_quote_no();

-- ============================================================
-- Trigger: auto-generate deal_no as "D-YYYYMMDD-XXXX"
-- ============================================================
create or replace function public.generate_deal_no()
returns trigger as $$
declare
  seq integer;
begin
  if new.deal_no is null or new.deal_no = '' then
    select count(*) + 1 into seq
    from public.deals
    where created_at::date = current_date;
    new.deal_no := 'D-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(seq::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_generate_deal_no
  before insert on public.deals
  for each row execute function public.generate_deal_no();
