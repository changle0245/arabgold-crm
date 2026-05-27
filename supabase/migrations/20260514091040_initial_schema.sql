-- ============================================================
-- ArabGold CRM - Complete Database Schema
-- Phase 1 builds ALL tables; 🟢 = Phase 1 active, 🟡 = Phase 2, 🔵 = Phase 3
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- Phase 3a Neon port: stub auth.uid() so helper functions parse.
-- Phase 2 (NextAuth) will replace this with a real implementation that
-- reads the logged-in user id (e.g. from a request-scoped GUC). For now
-- this returns NULL — every RLS-style branch falls through to "not
-- owner / not admin", which is the safe default while RLS is disabled.
-- ============================================================
create schema if not exists auth;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- ============================================================
-- 🟢 profiles — Team members
-- Phase 3a Neon port: dropped FK to auth.users (Supabase Auth table).
-- Phase 2 (NextAuth) will manage users in its own tables; profile.id
-- will reference whatever NextAuth uses.
-- ============================================================
create table public.profiles (
  id uuid primary key,  -- Phase 3a: was `references auth.users(id) on delete cascade`
  full_name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  job_title text default '业务员' check (job_title in ('业务员', '客服', '跟单')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 🟢 customers — Customer master records
-- ============================================================
create table public.customers (
  id uuid primary key default uuid_generate_v4(),
  contact_name text not null,
  company_name text,
  country text,
  whatsapp text not null,
  email text,
  owner_id uuid not null references public.profiles(id),
  level text not null default '待定' check (level in ('L1', 'L2', 'L3', '待定')),
  stage text not null default '待定' check (stage in ('待定', '新接触', '报价中', '已寄样', '已成交', '沉默')),
  last_contact_date date default current_date,
  source text,
  product_category text,
  payment_preference text,
  notes text,
  -- 🟡 Phase 2 reserved fields
  first_deal_date date,
  total_deal_count integer not null default 0,
  total_deal_amount numeric not null default 0,
  -- System fields
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customers_owner on public.customers(owner_id);
create index idx_customers_whatsapp on public.customers(whatsapp);
create index idx_customers_last_contact on public.customers(last_contact_date);
create index idx_customers_stage on public.customers(stage);

-- ============================================================
-- 🟢 contact_logs — Contact records (append-only timeline)
-- ============================================================
create table public.contact_logs (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  logged_by uuid not null references public.profiles(id),
  log_date date not null default current_date,
  tag text not null check (tag in ('已报价', '已寄样', '客户砍价', '暂无回应', '已成交', '其他')),
  note text,
  created_at timestamptz not null default now()
);

create index idx_contact_logs_customer on public.contact_logs(customer_id);
create index idx_contact_logs_logged_by on public.contact_logs(logged_by);

-- Trigger: auto-update customers.last_contact_date on new contact_log
create or replace function public.update_last_contact_date()
returns trigger as $$
begin
  update public.customers
  set last_contact_date = new.log_date,
      updated_at = now()
  where id = new.customer_id
    and (last_contact_date is null or last_contact_date < new.log_date);
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_update_last_contact
  after insert on public.contact_logs
  for each row execute function public.update_last_contact_date();

-- ============================================================
-- 🟢 customer_attachments — Files linked to customers
-- ============================================================
create table public.customer_attachments (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  file_name text not null,
  file_url text not null,
  file_type text,
  file_size integer,
  note text,
  created_at timestamptz not null default now()
);

create index idx_attachments_customer on public.customer_attachments(customer_id);

-- ============================================================
-- 🟢 stage_changes — Stage transition audit log
-- ============================================================
create table public.stage_changes (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  changed_by uuid not null references public.profiles(id),
  from_stage text,
  to_stage text not null,
  changed_at timestamptz not null default now()
);

create index idx_stage_changes_customer on public.stage_changes(customer_id);

-- Auto-update updated_at on customers
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.update_updated_at();

-- ============================================================
-- 🟡 quotations — Quotation headers (Phase 2)
-- ============================================================
create table public.quotations (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  quote_no text,
  version integer not null default 1,
  trade_terms text,
  currency text default 'USD',
  total_amount numeric,
  valid_until date,
  status text default 'draft',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 🟡 quotation_items — Quotation line items (Phase 2)
-- ============================================================
create table public.quotation_items (
  id uuid primary key default uuid_generate_v4(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  product_name text,
  spec text,
  quantity numeric,
  unit_price numeric,
  amount numeric,
  remark text
);

-- ============================================================
-- 🟡 deals — Deal/order records (Phase 2, core: one customer many deals)
-- ============================================================
create table public.deals (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  quotation_id uuid references public.quotations(id),
  deal_no text,
  deal_date date,
  deal_amount numeric,
  currency text default 'USD',
  payment_method text,
  deposit_received boolean default false,
  balance_received boolean default false,
  status text default 'pending',
  is_reorder boolean default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 🟡 samples — Sample records (Phase 2)
-- ============================================================
create table public.samples (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  sample_desc text,
  sent_date date,
  tracking_no text,
  carrier text,
  feedback text,
  feedback_date date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 🔵 reminders — Reminders/todos (Phase 3)
-- ============================================================
create table public.reminders (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete cascade,
  assigned_to uuid references public.profiles(id),
  type text,
  due_date date,
  status text default 'pending',
  note text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 🔵 customer_tags — Flexible tagging (Phase 3)
-- ============================================================
create table public.customer_tags (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  tag text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security (RLS) — ALL tables enabled, default deny
-- ============================================================

-- Helper function to get current user's role
create or replace function public.get_my_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql security definer stable;















-- ============================================================
-- Storage bucket for customer attachments
-- ============================================================
-- Run in Supabase dashboard > Storage:
-- Create bucket: "customer-attachments" (private)
-- Policy: authenticated users can upload/read; delete own or admin

-- ----------------------------------------------------------
-- Phase 3a Neon port: Supabase-specific SQL stripped above
-- (RLS policies / grants / storage / pg_cron). See top of
-- 20260514091040_initial_schema.sql for the auth.uid() stub.
-- ----------------------------------------------------------
