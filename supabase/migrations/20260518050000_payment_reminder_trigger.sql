-- Migration: Auto-create payment reminder on deal insert when deposit not yet received
-- Fix P1-⑫: payment 类型提醒无任何自动生成路径，业务员只能手工建
-- 扩展 auto_reminder_after_deal 触发器：除了 follow_up 30 天回访，
-- 当 deposit_received = false 时再建一条 payment 7 天催款（含去重）

create or replace function public.auto_reminder_after_deal()
returns trigger as $$
declare
  customer_owner uuid;
  v_today date;
  v_follow_up_date date;
  v_payment_date date;
begin
  select owner_id into customer_owner from public.customers where id = new.customer_id;
  if customer_owner is null then return new; end if;

  v_today := coalesce(new.deal_date, (now() at time zone 'Asia/Shanghai')::date);
  v_follow_up_date := (v_today + interval '30 days')::date;
  v_payment_date := (v_today + interval '7 days')::date;

  -- 1) follow_up：成交后 30 天回访（去重 by customer_id+type+status+due_date+note）
  if not exists (
    select 1 from public.reminders
    where customer_id = new.customer_id
      and type = 'follow_up'
      and status = 'pending'
      and due_date = v_follow_up_date
      and note = '成交后 30 天回访'
  ) then
    insert into public.reminders (customer_id, assigned_to, type, due_date, status, note, created_by)
    values (
      new.customer_id, customer_owner, 'follow_up', v_follow_up_date, 'pending',
      '成交后 30 天回访', new.created_by
    );
  end if;

  -- 2) payment：仅在未收定金时建，7 天后催款（同样去重）
  if new.deposit_received = false then
    if not exists (
      select 1 from public.reminders
      where customer_id = new.customer_id
        and type = 'payment'
        and status = 'pending'
        and due_date = v_payment_date
        and note = '成交后 7 天催款（未收定金）'
    ) then
      insert into public.reminders (customer_id, assigned_to, type, due_date, status, note, created_by)
      values (
        new.customer_id, customer_owner, 'payment', v_payment_date, 'pending',
        '成交后 7 天催款（未收定金）', new.created_by
      );
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

comment on function public.auto_reminder_after_deal() is
  'Auto-create reminders after deal insert: (1) 30-day follow_up, (2) 7-day payment reminder if deposit_received=false. Both deduped by (customer_id, type, status, due_date, note).';
