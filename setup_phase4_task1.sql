-- Phase 4 Task 1 Manual Setup Script
-- Execute this in Supabase Dashboard → SQL Editor

-- 1. Create communication_logs table (from migration 20260516060000)
create table if not exists public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'email')),
  direction text not null check (direction in ('outgoing', 'incoming')),
  sender_name text,
  content text,
  sent_at timestamptz not null,
  original_file_url text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_communication_logs_customer_id on public.communication_logs(customer_id);
create index if not exists idx_communication_logs_sent_at on public.communication_logs(sent_at desc);
create index if not exists idx_communication_logs_channel on public.communication_logs(channel);

alter table public.communication_logs enable row level security;

create policy "Users can view their customers' communication logs"
  on public.communication_logs
  for select
  using (
    exists (
      select 1 from public.customers c
      where c.id = communication_logs.customer_id
        and (c.owner_id = auth.uid() or c.assigned_to = auth.uid())
    )
  );

create policy "Users can insert communication logs for their customers"
  on public.communication_logs
  for insert
  with check (
    exists (
      select 1 from public.customers c
      where c.id = customer_id
        and (c.owner_id = auth.uid() or c.assigned_to = auth.uid())
    )
  );

create policy "Users can delete their own communication logs"
  on public.communication_logs
  for delete
  using (created_by = auth.uid());

comment on table public.communication_logs is 'Stores communication records imported from WhatsApp, email, etc.';
comment on column public.communication_logs.channel is 'Communication channel: whatsapp, email';
comment on column public.communication_logs.direction is 'Message direction: outgoing (sent by us), incoming (from customer)';
comment on column public.communication_logs.sender_name is 'Sender name parsed from original file';
comment on column public.communication_logs.sent_at is 'When the message was sent (parsed from original file)';
comment on column public.communication_logs.original_file_url is 'URL of the original imported file in Supabase Storage';

-- 2. Create Storage bucket for communication files
insert into storage.buckets (id, name, public)
values ('communication-files', 'communication-files', true)
on conflict (id) do nothing;

-- 3. Storage bucket RLS policies
create policy "Users can upload communication files for their customers"
  on storage.objects
  for insert
  with check (
    bucket_id = 'communication-files'
    and auth.role() = 'authenticated'
  );

create policy "Anyone can view communication files"
  on storage.objects
  for select
  using (bucket_id = 'communication-files');

-- 4. Insert migration record
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260516060000',
  'communication_logs',
  ARRAY[
    'create table public.communication_logs',
    'create indexes on communication_logs',
    'enable RLS on communication_logs',
    'create RLS policies for communication_logs'
  ]
)
on conflict (version) do nothing;

-- Verification queries (optional)
-- Verify table created:
-- select * from public.communication_logs limit 1;

-- Verify bucket created:
-- select * from storage.buckets where id = 'communication-files';

-- Verify migration recorded:
-- select * from supabase_migrations.schema_migrations where version = '20260516060000';
