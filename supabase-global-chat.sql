-- Short-lived global chat backed by Postgres Realtime for reliable cross-device delivery.
create table if not exists public.global_chat_messages (
  id uuid primary key,
  environment text not null check (environment in ('local', 'production')),
  sender_id uuid not null,
  nickname text not null check (char_length(nickname) between 1 and 12),
  body text not null check (char_length(body) between 1 and 120),
  created_at timestamptz not null default now()
);

create index if not exists global_chat_messages_environment_created_idx
  on public.global_chat_messages (environment, created_at desc);

alter table public.global_chat_messages enable row level security;

drop policy if exists global_chat_messages_read_recent on public.global_chat_messages;
create policy global_chat_messages_read_recent
on public.global_chat_messages
for select to anon, authenticated
using (created_at >= now() - interval '10 minutes');

drop policy if exists global_chat_messages_insert on public.global_chat_messages;
create policy global_chat_messages_insert
on public.global_chat_messages
for insert to anon, authenticated
with check (
  environment in ('local', 'production')
  and char_length(nickname) between 1 and 12
  and char_length(body) between 1 and 120
);

revoke all on table public.global_chat_messages from public;
grant select, insert on table public.global_chat_messages to anon, authenticated;

create or replace function public.prune_global_chat_messages()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.global_chat_messages
  where created_at < now() - interval '10 minutes';
  return null;
end;
$$;

drop trigger if exists global_chat_messages_prune_trigger on public.global_chat_messages;
create trigger global_chat_messages_prune_trigger
after insert on public.global_chat_messages
for each statement execute function public.prune_global_chat_messages();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'global_chat_messages'
  ) then
    alter publication supabase_realtime add table public.global_chat_messages;
  end if;
end;
$$;

notify pgrst, 'reload schema';
