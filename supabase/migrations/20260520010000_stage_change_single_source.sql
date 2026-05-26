-- ============================================================
-- Stage-change audit: single source of truth
-- ============================================================
-- Problem:
--   stage_changes was written from 6 separate places —
--   advance_stage_on_quotation / _sample / _deal (auto-advance on a
--   child-row INSERT), cleanup_after_deal_delete (stage rollback on a
--   deal DELETE), and the UI (customer-form.tsx wrote it directly for
--   both manual stage edits and new customers).
--
--   Any path that changed customers.stage WITHOUT going through one of
--   those 6 — raw SQL, batch import, seed scripts — silently skipped
--   the audit row, breaking the stage_changes chain. The 2026-05-20
--   consistency audit found 27 such customers, all produced by the
--   seed script's direct-SQL stage writes.
--
-- Fix:
--   Make ONE trigger on customers the sole writer of stage_changes.
--   trg_record_stage_change fires AFTER INSERT OR UPDATE OF stage and
--   records every real transition, no matter who or what changed the
--   row — UI, trigger, raw SQL or script. The 6 previous writers stop
--   writing stage_changes:
--     * the 3 auto-advance functions keep advancing customers.stage but
--       no longer INSERT stage_changes — their UPDATE now fires the new
--       trigger;
--     * cleanup_after_deal_delete keeps rolling stage back, same deal;
--     * customer-form.tsx drops both of its stage_changes inserts
--       (separate code change, not part of this migration).
--
-- changed_by:
--   stage_changes.changed_by becomes NULLABLE. auth.uid() is the actor
--   for every UI-initiated path — SECURITY DEFINER does NOT reset
--   auth.uid(), so auto-advance triggered by a user's deal/quotation
--   INSERT still attributes to that user. For raw SQL / seed / cron
--   there is no actor: changed_by is NULL ("unattributed"), but the row
--   is still recorded so the audit chain never breaks again.
--
-- Scope note:
--   This migration only governs FUTURE writes. It does not backfill or
--   repair the 27 historical seed-created inconsistencies.
-- ============================================================

-- ── 1. Allow unattributed (non-UI) stage changes to be logged ──────
alter table public.stage_changes
  alter column changed_by drop not null;

-- ── 2. The single recorder ─────────────────────────────────────────
create or replace function public.record_stage_change()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    -- New customer: log only a non-default initial stage.
    -- '待定' is the customers.stage default, not a real transition.
    if new.stage is not null and new.stage <> '待定' then
      insert into public.stage_changes (customer_id, changed_by, from_stage, to_stage)
      values (new.id, auth.uid(), null, new.stage);
    end if;
  else
    -- UPDATE: log only a genuine change of value.
    if new.stage is distinct from old.stage then
      insert into public.stage_changes (customer_id, changed_by, from_stage, to_stage)
      values (new.id, auth.uid(), old.stage, new.stage);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

comment on function public.record_stage_change() is
  'Sole writer of stage_changes: fires on every customers stage INSERT/UPDATE so UI, triggers and raw SQL are all audited. changed_by is auth.uid(), or NULL when there is no actor.';

drop trigger if exists trg_record_stage_change on public.customers;
create trigger trg_record_stage_change
  after insert or update of stage on public.customers
  for each row execute function public.record_stage_change();

-- ── 3. Auto-advance functions: stop writing stage_changes ──────────
-- Guard conditions are preserved verbatim from
-- 20260517010000_record_stage_changes_in_triggers.sql. Only the
-- stage_changes INSERT (and its now-unused v_changed_by variable) is
-- removed — the customers UPDATE below fires trg_record_stage_change.

create or replace function public.advance_stage_on_quotation()
returns trigger as $$
declare
  v_old_stage text;
  v_new_stage constant text := '报价中';
begin
  select stage into v_old_stage
  from public.customers
  where id = new.customer_id;

  -- Guard: only advance from 待定 / 新接触. Otherwise no-op.
  if v_old_stage is null or v_old_stage not in ('待定', '新接触') then
    return new;
  end if;

  update public.customers
  set stage = v_new_stage
  where id = new.customer_id;

  return new;
end;
$$ language plpgsql security definer;

create or replace function public.advance_stage_on_sample()
returns trigger as $$
declare
  v_old_stage text;
  v_new_stage constant text := '已寄样';
begin
  select stage into v_old_stage
  from public.customers
  where id = new.customer_id;

  -- Guard: only advance from 待定 / 新接触 / 报价中.
  if v_old_stage is null or v_old_stage not in ('待定', '新接触', '报价中') then
    return new;
  end if;

  update public.customers
  set stage = v_new_stage
  where id = new.customer_id;

  return new;
end;
$$ language plpgsql security definer;

create or replace function public.advance_stage_on_deal()
returns trigger as $$
declare
  v_old_stage text;
  v_new_stage constant text := '已成交';
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

  return new;
end;
$$ language plpgsql security definer;

-- ── 4. cleanup_after_deal_delete: stop writing stage_changes ───────
-- Verbatim from 20260519030000_main_currency_and_deal_cleanup.sql
-- except the explicit stage_changes INSERT is removed: the stage
-- rollback UPDATE now fires trg_record_stage_change.

create or replace function public.cleanup_after_deal_delete()
returns trigger as $$
declare
  remaining_count int;
  previous_stage text;
  v_payment_date date;
  v_follow_up_date date;
begin
  -- 检查该客户是否还有其它成交单
  select count(*) into remaining_count
  from public.deals where customer_id = old.customer_id;

  if remaining_count = 0 then
    -- 修 #9: 客户已无成交且当前 stage='已成交' → 回退到 stage_changes 表里上一阶段
    select from_stage into previous_stage
    from public.stage_changes
    where customer_id = old.customer_id
      and to_stage = '已成交'
      and from_stage is not null
      and from_stage <> '已成交'
    order by changed_at desc
    limit 1;

    -- 如果找不到 stage_change（数据迁移之前的成交），默认回到"报价中"
    if previous_stage is null then
      previous_stage := '报价中';
    end if;

    -- 仅当客户当前确实是"已成交"才回滚（避免覆盖业务员手工改过的 stage）
    if exists (select 1 from public.customers where id = old.customer_id and stage = '已成交') then
      update public.customers
      set stage = previous_stage
      where id = old.customer_id
        and stage = '已成交';
      -- 这次 stage 回滚由 trg_record_stage_change 自动写入 stage_changes。
    end if;
  end if;

  -- 修 #10: 清理 auto_reminder_after_deal 生成的孤儿提醒
  -- 仅删除 status='pending' 且 note 是 auto_reminder 自动生成的（避免误删手工提醒）
  v_payment_date := (coalesce(old.deal_date, current_date) + interval '7 days')::date;
  v_follow_up_date := (coalesce(old.deal_date, current_date) + interval '30 days')::date;

  delete from public.reminders
  where customer_id = old.customer_id
    and status = 'pending'
    and (
      (type = 'payment' and note = '成交后 7 天催款（未收定金）' and due_date = v_payment_date)
      or
      (type = 'follow_up' and note = '成交后 30 天回访' and due_date = v_follow_up_date)
    );

  return old;
end;
$$ language plpgsql security definer;
