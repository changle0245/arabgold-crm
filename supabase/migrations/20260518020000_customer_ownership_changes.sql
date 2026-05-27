-- Migration: Customer Ownership Change Tracking
-- Fix #13: When admin transfers a customer to another owner, record the event in the customer's timeline
-- Mirrors the structure of stage_changes

create extension if not exists "uuid-ossp";

create table if not exists public.customer_ownership_changes (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  changed_by uuid not null references public.profiles(id),
  from_owner uuid references public.profiles(id),
  to_owner uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);

create index if not exists idx_ownership_changes_customer
  on public.customer_ownership_changes(customer_id);


-- SELECT: admins + the customer's current owner can see ownership history



-- INSERT: any active user (mirrors stage_changes; in practice only admin reaches the transfer UI)



-- UPDATE / DELETE: admin only




comment on table public.customer_ownership_changes is
  'Audit log of customer ownership transfers. Inserted by app code when customers.owner_id changes.';

-- ----------------------------------------------------------
-- Phase 3a Neon port: Supabase-specific SQL stripped above
-- (RLS policies / grants / storage / pg_cron). See top of
-- 20260514091040_initial_schema.sql for the auth.uid() stub.
-- ----------------------------------------------------------
