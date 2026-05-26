-- Migration: Force first-login password change for new members
-- Fix #10: admin sets initial password, member must change it on first login
-- profiles 加一列 must_change_password，AuthProvider 检测到 true 时强制跳转改密页

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'When true, the member must change their password before accessing the app. Set by admin when creating member; cleared when member completes password change.';
