-- ============================================================
-- Bug 11 fix: record stage transitions inside auto-advance triggers
-- ============================================================
-- Background:
--   3 AFTER INSERT triggers (on quotations/samples/deals) auto-advance
--   customers.stage but never write to stage_changes. Result: most
--   stage transitions are invisible in the audit table. This migration
--   replaces the 3 trigger functions to also INSERT a stage_changes row
--   whenever they actually change customers.stage.
--
-- Strategy:
--   - CREATE OR REPLACE the 3 plpgsql functions only — triggers stay
--     bound to the same function names, no DROP TRIGGER / CREATE TRIGGER.
--   - Guard conditions preserved verbatim from the original
--     20260515300000_user_journey_fixes.sql ("stage only advances,
--     never goes backward"):
--       quotation guard: old_stage in ('待定','新接触')
--       sample    guard: old_stage in ('待定','新接触','报价中')
--       deal      guard: old_stage <> '已成交'   (also revives '沉默')
--   - changed_by = coalesce(new.created_by, auth.uid()); if both NULL
--     the stage_changes INSERT is skipped (avoids blocking the outer
--     INSERT business flow). stage_changes.changed_by is NOT NULL so
--     we can't insert without a value.
--   - SECURITY DEFINER bypasses RLS on stage_changes INSERT, so the
--     existing owns_customer(customer_id) WITH CHECK policy does not
--     need to be touched. This is asserted to be the case but MUST be
--     verified empirically after applying this migration.
-- ============================================================

-- ── 1. quotation → 报价中 ──────────────────────────────────
create or replace function public.advance_stage_on_quotation()
returns trigger as $$
declare
  v_old_stage text;
  v_new_stage constant text := '报价中';
  v_changed_by uuid := coalesce(new.created_by, auth.uid());
begin
  -- Snapshot stage BEFORE the update.
  select stage into v_old_stage
  from public.customers
  where id = new.customer_id;

  -- Guard: only advance from 待定 / 新接触. Otherwise no-op.
  if v_old_stage is null or v_old_stage not in ('待定', '新接触') then
    return new;
  end if;

  -- Advance the customer's stage.
  update public.customers
  set stage = v_new_stage
  where id = new.customer_id;

  -- Log the transition. Skip if we cannot attribute (would block INSERT
  -- because stage_changes.changed_by is NOT NULL).
  if v_changed_by is not null then
    insert into public.stage_changes (customer_id, changed_by, from_stage, to_stage)
    values (new.customer_id, v_changed_by, v_old_stage, v_new_stage);
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- ── 2. sample → 已寄样 ─────────────────────────────────────
create or replace function public.advance_stage_on_sample()
returns trigger as $$
declare
  v_old_stage text;
  v_new_stage constant text := '已寄样';
  v_changed_by uuid := coalesce(new.created_by, auth.uid());
begin
  select stage into v_old_stage
  from public.customers
  where id = new.customer_id;

  -- Guard: only advance from 待定 / 新接触 / 报价中. Don't downgrade
  -- 已成交; don't revive 沉默 via sample (that's a deal-only path).
  if v_old_stage is null or v_old_stage not in ('待定', '新接触', '报价中') then
    return new;
  end if;

  update public.customers
  set stage = v_new_stage
  where id = new.customer_id;

  if v_changed_by is not null then
    insert into public.stage_changes (customer_id, changed_by, from_stage, to_stage)
    values (new.customer_id, v_changed_by, v_old_stage, v_new_stage);
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- ── 3. deal → 已成交 ──────────────────────────────────────
create or replace function public.advance_stage_on_deal()
returns trigger as $$
declare
  v_old_stage text;
  v_new_stage constant text := '已成交';
  v_changed_by uuid := coalesce(new.created_by, auth.uid());
begin
  select stage into v_old_stage
  from public.customers
  where id = new.customer_id;

  -- Guard: deal closes from any non-已成交 stage (including 沉默 revival).
  if v_old_stage is null or v_old_stage = v_new_stage then
    return new;
  end if;

  update public.customers
  set stage = v_new_stage
  where id = new.customer_id;

  if v_changed_by is not null then
    insert into public.stage_changes (customer_id, changed_by, from_stage, to_stage)
    values (new.customer_id, v_changed_by, v_old_stage, v_new_stage);
  end if;

  return new;
end;
$$ language plpgsql security definer;
