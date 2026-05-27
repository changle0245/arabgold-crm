-- Migration: Communication logs (Phase 2 阶段 2 沟通归档基础)
-- 统一存储 WhatsApp / 微信 / 邮件三个渠道的沟通记录
-- 含翻译字段（content 原文 + translated_content 中文译文 + 修订追踪）

create extension if not exists "uuid-ossp";

create table if not exists public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'wechat', 'email')),
  direction text not null check (direction in ('outgoing', 'incoming')),
  sender_name text,
  -- 内容
  content text,                                            -- 原文（不可变，业务员只能改 translated_content）
  translated_content text,                                 -- 中文译文（AI 自动 + 业务员可修订）
  translation_edited_by uuid references public.profiles(id), -- 谁人工修订了译文（null=AI 自动 / 未翻译）
  translation_edited_at timestamptz,
  -- 时间
  sent_at timestamptz not null,                            -- 消息原始发送时间（whatsapp .txt 解析得 / 邮件 header / 微信 .txt 时间）
  -- 元数据
  raw_meta jsonb,                                          -- 原始 metadata（WhatsApp 群名、邮件 message-id/headers、微信群名等）
  original_file_url text,                                  -- 原始 .txt / .eml / 附件 URL（Storage path）
  -- 系统字段
  created_by uuid references public.profiles(id),          -- 导入操作人
  created_at timestamptz not null default now()
);

create index if not exists idx_comm_logs_customer on public.communication_logs(customer_id);
create index if not exists idx_comm_logs_sent_at on public.communication_logs(sent_at desc);
create index if not exists idx_comm_logs_channel on public.communication_logs(channel);
create index if not exists idx_comm_logs_customer_sent on public.communication_logs(customer_id, sent_at desc);

-- RLS


-- SELECT: admin 或客户 owner 可见



-- INSERT: 同上



-- UPDATE: 同上（用于业务员修订译文）



-- DELETE: admin only（业务员不能删历史沟通记录）



comment on table public.communication_logs is
  'Unified communication log: WhatsApp/WeChat chat imports + manually-entered emails + (later) inbound emails. Supports automatic AI translation with optional human revision.';

-- ── Storage bucket ──
-- 存原始 .txt / .eml / 邮件附件等
-- [Phase 3a Neon port — Supabase Storage — Phase 4 R2 replacement] insert into storage.buckets (id, name, public)
-- values ('communication-files', 'communication-files', true)
-- on conflict (id) do nothing;

-- ----------------------------------------------------------
-- Phase 3a Neon port: Supabase-specific SQL stripped above
-- (RLS policies / grants / storage / pg_cron). See top of
-- 20260514091040_initial_schema.sql for the auth.uid() stub.
-- ----------------------------------------------------------
