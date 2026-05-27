-- ============================================================
-- SECURITY FIX: SELECT RLS hardening + Bug 8 inactive-user gate
-- ============================================================
-- Background:
--   All listed tables' SELECT policies were `using (true)`, so any
--   authenticated user could read every row across all owners, and
--   deactivated accounts could keep reading. This migration replaces
--   those policies with owner-or-admin isolation, gated by a strict
--   is_active check (database-layer defense for Bug 8).
--
-- Tables fixed (11):
--   customers, contact_logs, customer_attachments, stage_changes,
--   quotations, quotation_items, deals, deal_items, samples,
--   reminders, customer_tags
--
-- NOT touched:
--   profiles — team-wide read is needed (owner names on dashboards,
--              user selector in admin pages, etc.)
-- ============================================================

-- ── Helper functions ────────────────────────────────────────
-- SECURITY DEFINER + STABLE so RLS policies can call them without
-- recursing through profiles' own policies and so the planner caches
-- the result per statement.

create or replace function public.current_user_is_active()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_active from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ============================================================
-- Replace SELECT policies on the 11 tables
-- ============================================================
-- Unified shape:
--   using (
--     current_user_is_active()
--     and ( current_user_is_admin() or <ownership condition> )
--   )
-- Inactive users → blocked entirely. Admins → see everything.
-- Members → see only rows tied to customers they own (or, for
-- reminders, rows assigned to them).










-- ── reminders ──────────────────────────────────────────────
-- NOTE: rows with assigned_to IS NULL are visible only to admins under
-- this policy. Confirmed acceptable for current data model.





-- ----------------------------------------------------------
-- Phase 3a Neon port: Supabase-specific SQL stripped above
-- (RLS policies / grants / storage / pg_cron). See top of
-- 20260514091040_initial_schema.sql for the auth.uid() stub.
-- ----------------------------------------------------------
