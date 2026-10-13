-- PvP web-push subscriptions and durable notification outbox.
create table if not exists public.pvp_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pvp_push_subscriptions_user_idx
  on public.pvp_push_subscriptions (user_id, updated_at desc);

alter table public.pvp_push_subscriptions enable row level security;
drop policy if exists "users manage own pvp push subscriptions" on public.pvp_push_subscriptions;
create policy "users manage own pvp push subscriptions"
on public.pvp_push_subscriptions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.pvp_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.pvp_push_subscriptions to authenticated;

create table if not exists public.pvp_push_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid references public.pvp_rooms(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  title text not null,
  body text not null,
  target_url text not null default '/pvp.html?tab=joined',
  badge_count integer not null default 1 check (badge_count >= 0),
  status text not null default 'pending' check (status in ('pending', 'sending', 'delivered', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (user_id, event_key)
);

create index if not exists pvp_push_events_pending_idx
  on public.pvp_push_events (status, created_at)
  where status in ('pending', 'sending');

alter table public.pvp_push_events enable row level security;
drop policy if exists "users read own pvp push events" on public.pvp_push_events;
create policy "users read own pvp push events"
on public.pvp_push_events for select
using (auth.uid() = user_id);

revoke all on public.pvp_push_events from anon, authenticated;
grant select on public.pvp_push_events to authenticated;

create or replace function public.pvp_enqueue_room_push_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'running' and old.status is distinct from new.status then
    insert into public.pvp_push_events (user_id, room_id, event_key, event_type, title, body, target_url)
    select player.user_id,
           new.id,
           'room:' || new.id || ':matched',
           'match_ready',
           '비동기 PvP 매칭 완료',
           coalesce(new.name, 'PvP 게임') || '의 참가자가 모두 모였습니다.',
           '/index.html?pvpRoom=' || new.id
    from public.pvp_room_players player
    where player.room_id = new.id
      and player.status = 'active'
      and not player.is_bot
      and player.user_id is not null
    on conflict (user_id, event_key) do nothing;
  end if;

  if new.status = 'finished' and old.status is distinct from new.status then
    insert into public.pvp_push_events (user_id, room_id, event_key, event_type, title, body, target_url)
    select player.user_id,
           new.id,
           'room:' || new.id || ':finished',
           'game_finished',
           'PvP 게임 종료',
           coalesce(new.name, 'PvP 게임') || '의 최종 결과가 도착했습니다.',
           '/pvp.html?tab=joined'
    from public.pvp_room_players player
    where player.room_id = new.id
      and not player.is_bot
      and player.user_id is not null
    on conflict (user_id, event_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists pvp_room_push_events_trigger on public.pvp_rooms;
create trigger pvp_room_push_events_trigger
after update of status on public.pvp_rooms
for each row execute function public.pvp_enqueue_room_push_events();

create or replace function public.pvp_enqueue_player_action_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_room public.pvp_rooms%rowtype;
begin
  if new.is_bot or new.user_id is null or new.status <> 'active' then return new; end if;
  if not (old.ready = true and new.ready = false) then return new; end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = new.room_id and room.status = 'running';
  if not found or target_room.phase <> 'planning' then return new; end if;

  insert into public.pvp_push_events (user_id, room_id, event_key, event_type, title, body, target_url)
  values (
    new.user_id,
    new.room_id,
    'room:' || new.room_id || ':planning:' || target_room.current_round,
    'action_required',
    'PvP 진행 필요',
    coalesce(target_room.name, 'PvP 게임') || ' ' || target_room.current_round || '라운드 덱을 제출해 주세요.',
    '/index.html?pvpRoom=' || new.room_id
  )
  on conflict (user_id, event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists pvp_player_action_push_trigger on public.pvp_room_players;
create trigger pvp_player_action_push_trigger
after update of ready, status on public.pvp_room_players
for each row execute function public.pvp_enqueue_player_action_push();

revoke all on function public.pvp_enqueue_room_push_events() from public;
revoke all on function public.pvp_enqueue_player_action_push() from public;
notify pgrst, 'reload schema';
