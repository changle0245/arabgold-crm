-- ============================================================
-- Phase 2: Allow customer owner (in addition to admin) to delete
-- quotations / quotation_items / deals / samples.
-- Edit symmetry: if owner can edit, owner can delete.
-- Uses the existing public.owns_customer() helper.
-- ============================================================

-- quotations



-- quotation_items: keyed via parent quotation's customer



-- quotation_items UPDATE was previously open to any authenticated user;
-- tighten it the same way so only the owning customer's owner (or admin) can modify items



-- deals



-- samples



-- ----------------------------------------------------------
-- Phase 3a Neon port: Supabase-specific SQL stripped above
-- (RLS policies / grants / storage / pg_cron). See top of
-- 20260514091040_initial_schema.sql for the auth.uid() stub.
-- ----------------------------------------------------------
