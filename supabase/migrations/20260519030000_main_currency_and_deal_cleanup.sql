-- Migration 20260519030000
-- 修复 bug #9 #10 #11
-- 1. system_settings 新增 main_currency 默认 USD（修 #11 大屏多币种）
-- 2. DELETE deal 时若客户已无任何成交：
--    a) stage 从"已成交"回退到 stage_changes 表里前一个阶段（修 #9）
--    b) 自动清理 auto_reminder_after_deal 生成的孤儿提醒（修 #10）
-- ------------------------------------------------------------

-- ① main_currency 默认值（修 #11）
insert into public.system_settings (key, value, description)
values (
  'main_currency',
  '"USD"'::jsonb,
  '老板大屏 / 个人大屏 / 业绩目标 全部以此货币为主货币展示。其他货币单独显示为"其他币种"小字。'
)
on conflict (key) do nothing;

-- ② DELETE deal 后回滚 stage + 清理孤儿提醒（修 #9 #10）
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
    -- 找到该客户最近一次进入"已成交"前的 stage（即 stage_changes 表里 to_stage='已成交' 的那条记录的 from_stage）
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

      -- 记录这次回滚到 stage_changes（审计）。
      -- 注意：stage_changes 表无 note 列，列为 (customer_id, changed_by, from_stage, to_stage)。
      -- changed_by NOT NULL：用 deal.created_by；若为空则回退到客户 owner_id。
      insert into public.stage_changes (customer_id, from_stage, to_stage, changed_by)
      values (
        old.customer_id, '已成交', previous_stage,
        coalesce(
          old.created_by,
          (select owner_id from public.customers where id = old.customer_id)
        )
      );
    end if;
  end if;

  -- 修 #10: 清理 auto_reminder_after_deal 生成的孤儿提醒
  -- 仅删除 status='pending' 且 note 是 auto_reminder 自动生成的（避免误删手工提醒）
  -- 用 deal_date 算回去匹配 due_date
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

drop trigger if exists trg_cleanup_after_deal_delete on public.deals;
create trigger trg_cleanup_after_deal_delete
after delete on public.deals
for each row execute function public.cleanup_after_deal_delete();

comment on function public.cleanup_after_deal_delete() is
  'DELETE deal 后：若客户无其它成交则 stage 回退到上一阶段；并清理 auto_reminder_after_deal 生成的孤儿 payment/follow_up 提醒。修 bug #9 #10。';
