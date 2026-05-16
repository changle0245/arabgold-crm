-- Phase 4 Task 1: Communication Logs Table
-- 用于存储从 WhatsApp、Email 等渠道手动导入的沟通记录

-- Create communication_logs table
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

-- Create index for efficient queries
create index if not exists idx_communication_logs_customer_id on public.communication_logs(customer_id);
create index if not exists idx_communication_logs_sent_at on public.communication_logs(sent_at desc);
create index if not exists idx_communication_logs_channel on public.communication_logs(channel);

-- Enable RLS
alter table public.communication_logs enable row level security;

-- RLS Policy: Users can view communication logs for customers they own or are assigned to
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

-- RLS Policy: Users can insert communication logs for customers they own or are assigned to
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

-- RLS Policy: Users can delete communication logs they created
create policy "Users can delete their own communication logs"
  on public.communication_logs
  for delete
  using (created_by = auth.uid());

-- Comment
comment on table public.communication_logs is 'Stores communication records imported from WhatsApp, email, etc.';
comment on column public.communication_logs.channel is 'Communication channel: whatsapp, email';
comment on column public.communication_logs.direction is 'Message direction: outgoing (sent by us), incoming (from customer)';
comment on column public.communication_logs.sender_name is 'Sender name parsed from original file';
comment on column public.communication_logs.sent_at is 'When the message was sent (parsed from original file)';
comment on column public.communication_logs.original_file_url is 'URL of the original imported file in Supabase Storage';
