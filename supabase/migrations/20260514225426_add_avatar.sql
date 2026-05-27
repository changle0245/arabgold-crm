-- ============================================================
-- Migration: 添加客户头像 + 配置 Storage bucket
-- ============================================================

-- 1. customers 加 avatar_url 字段
alter table public.customers
  add column if not exists avatar_url text;

-- 2. 创建 storage bucket（用于客户头像 + 客户附件）
-- [Phase 3a Neon port — Supabase Storage — Phase 4 R2 replacement] insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values (
--   'customer-attachments',
--   'customer-attachments',
--   true,  -- public read（业务员都能看到所有客户头像）
--   10485760,  -- 10MB
--   array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf']
-- )
-- on conflict (id) do nothing;

-- 3. Storage RLS 策略
-- 已登录成员都可以读



-- 已登录成员都可以上传



-- 只能删除自己上传的（或 admin 删任意）



-- 可以更新自己的文件（覆盖头像时用得到）



-- ----------------------------------------------------------
-- Phase 3a Neon port: Supabase-specific SQL stripped above
-- (RLS policies / grants / storage / pg_cron). See top of
-- 20260514091040_initial_schema.sql for the auth.uid() stub.
-- ----------------------------------------------------------
