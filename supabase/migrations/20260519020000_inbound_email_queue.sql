-- Migration: Inbound email queue + profile mail alias
-- F1: webhook 收到外部邮件后按 from 邮箱匹配 customers.email
-- 匹配到 → 直接进 communication_logs (channel=email, direction=incoming)
-- 匹配不到 → 进 inbound_email_queue 等业务员手工归并

-- 1) profiles 加 mail_alias：每个业务员的转发用户名（zhangsan → zhangsan@mail.arabgold-crm.com）
alter table public.profiles
  add column if not exists mail_alias text unique;

comment on column public.profiles.mail_alias is
  'Per-member email forwarding alias. Used as the local part of the inbound webhook recipient (e.g. zhangsan@mail.arabgold-crm.com).';

-- 2) 待归档邮件队列
create table if not exists public.inbound_email_queue (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  -- 收件信息
  to_alias text,                                    -- 解析自 To 字段 local part（识别哪个业务员）
  to_email text,                                    -- 完整 to 邮箱
  recipient_member uuid references public.profiles(id), -- 通过 to_alias 匹配到的业务员
  -- 发件人
  from_email text not null,
  from_name text,
  -- 内容
  subject text,
  content text,                                     -- 纯文本正文
  raw_meta jsonb,                                   -- {message_id, headers, html, ...}
  attachments jsonb,                                -- [{name, url, size, type}]
  -- 状态
  status text not null default 'pending' check (status in ('pending', 'matched', 'discarded')),
  matched_customer_id uuid references public.customers(id) on delete set null,
  matched_by uuid references public.profiles(id),
  matched_at timestamptz,
  -- 系统
  created_at timestamptz not null default now()
);

create index if not exists idx_inbound_queue_status on public.inbound_email_queue(status, received_at desc);
create index if not exists idx_inbound_queue_member on public.inbound_email_queue(recipient_member);
create index if not exists idx_inbound_queue_from on public.inbound_email_queue(from_email);

alter table public.inbound_email_queue enable row level security;

-- SELECT：admin 看全部；业务员只看分给自己的（recipient_member = uid）
drop policy if exists "inbound_queue_select" on public.inbound_email_queue;
create policy "inbound_queue_select" on public.inbound_email_queue
  for select to authenticated
  using (
    public.current_user_is_active()
    and (public.current_user_is_admin() or recipient_member = auth.uid())
  );

-- INSERT：只有 service role（webhook）写，业务员不直接写
drop policy if exists "inbound_queue_insert" on public.inbound_email_queue;
create policy "inbound_queue_insert" on public.inbound_email_queue
  for insert to authenticated
  with check (false);

-- UPDATE：admin 或 recipient_member 可以归并/丢弃
drop policy if exists "inbound_queue_update" on public.inbound_email_queue;
create policy "inbound_queue_update" on public.inbound_email_queue
  for update to authenticated
  using (
    public.current_user_is_active()
    and (public.current_user_is_admin() or recipient_member = auth.uid())
  );

-- DELETE：admin only
drop policy if exists "inbound_queue_delete" on public.inbound_email_queue;
create policy "inbound_queue_delete" on public.inbound_email_queue
  for delete to authenticated
  using (public.current_user_is_admin());

comment on table public.inbound_email_queue is
  'Inbound emails that could not be auto-matched to a customer by from-email. Members handle them at /inbound-queue: merge to existing customer, create new customer, or discard.';
