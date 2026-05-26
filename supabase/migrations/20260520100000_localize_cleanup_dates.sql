-- ============================================================
-- M8 fix: localize cleanup_after_deal_delete orphan-reminder dates
-- ============================================================
-- On deal DELETE, cleanup_after_deal_delete deletes the orphaned
-- payment / follow-up reminders by matching their due_date. When the
-- deleted deal had no deal_date it fell back to current_date (UTC),
-- while auto_reminder_after_deal generated those reminders with an
-- Asia/Shanghai date. During CN 00:00-08:00 the two dates differed and
-- the orphan reminder was never deleted.
--
-- Fix: use the Asia/Shanghai date for the fallback, matching the
-- generator. Body verbatim from the cleanup_after_deal_delete defined
-- in 20260520010000_stage_change_single_source.sql (which must be
-- applied first) except the two date fallbacks.
-- ============================================================

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

  -- 修 #10 + M8: 清理 auto_reminder_after_deal 生成的孤儿提醒。
  -- 日期回退用 Asia/Shanghai,与 auto_reminder_after_deal 的生成端一致,
  -- 否则 CN 凌晨时段日期差一天 → 孤儿提醒匹配不上、删不掉。
  v_payment_date := (coalesce(old.deal_date, (now() at time zone 'Asia/Shanghai')::date) + interval '7 days')::date;
  v_follow_up_date := (coalesce(old.deal_date, (now() at time zone 'Asia/Shanghai')::date) + interval '30 days')::date;

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
