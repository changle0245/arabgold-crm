-- ============================================================
-- Phase 2 (NextAuth Neon port) — profiles auth columns
-- ============================================================
-- 加 email + password_hash 两列,替代原 auth.users.email / encrypted_password
-- NextAuth Credentials provider 用 email login,bcrypt 比对 password_hash
--
-- 兼容旧 Supabase 模式:email 列允许 NULL(因为现有 row 可能还没填),
-- 但建唯一索引时把 lowercase 当作匹配键,且只 index non-null。
-- ============================================================

alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  add column if not exists password_hash text;

-- 唯一索引(case-insensitive, 非空才约束)
create unique index if not exists profiles_email_unique
  on public.profiles (lower(email))
  where email is not null;

comment on column public.profiles.email is
  'Login email (case-insensitive unique). Used by NextAuth Credentials provider.';

comment on column public.profiles.password_hash is
  'bcrypt hash of login password. Set via admin invite or seed script. Never stored in plaintext.';
