-- ============================================================
-- Migration: 添加客户头像 + 配置 Storage bucket
-- ============================================================

-- 1. customers 加 avatar_url 字段
alter table public.customers
  add column if not exists avatar_url text;

-- 2. 创建 storage bucket（用于客户头像 + 客户附件）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-attachments',
  'customer-attachments',
  true,  -- public read（业务员都能看到所有客户头像）
  10485760,  -- 10MB
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do nothing;

-- 3. Storage RLS 策略
-- 已登录成员都可以读
drop policy if exists "auth_read" on storage.objects;
create policy "auth_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'customer-attachments');

-- 已登录成员都可以上传
drop policy if exists "auth_upload" on storage.objects;
create policy "auth_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'customer-attachments');

-- 只能删除自己上传的（或 admin 删任意）
drop policy if exists "auth_delete" on storage.objects;
create policy "auth_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'customer-attachments'
    and (owner = auth.uid() or public.get_my_role() = 'admin')
  );

-- 可以更新自己的文件（覆盖头像时用得到）
drop policy if exists "auth_update" on storage.objects;
create policy "auth_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'customer-attachments'
    and (owner = auth.uid() or public.get_my_role() = 'admin')
  );
