-- Lumia Tactics PvP schema.
-- Run this file in the Supabase SQL editor after enabling Anonymous Sign-Ins.
-- Realtime channels and scheduled round advancement are installed by
-- supabase-pvp-lobby-migration.sql after these base tables exist.

create table if not exists public.pvp_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user_id uuid not null,
  name text not null check (char_length(name) between 1 and 30),
  mode text not null check (mode in ('async', 'realtime')),
  visibility text not null default 'public' check (visibility in ('public', 'invite')),
  status text not null default 'waiting' check (status in ('waiting', 'running', 'finished', 'abandoned')),
  phase text not null default 'lobby' check (
    phase in ('lobby', 'pve', 'planning', 'locked', 'combat', 'result', 'finished')
  ),
  max_players smallint not null default 8 check (max_players between 2 and 8),
  current_round integer not null default 0 check (current_round >= 0),
  async_turn_minutes integer,
  planning_seconds integer,
  phase_deadline timestamptz,
  game_version text not null check (char_length(game_version) between 1 and 40),
  seed text not null default gen_random_uuid()::text check (char_length(seed) between 1 and 120),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  check (
    (
      mode = 'async'
      and async_turn_minutes between 60 and 10080
      and planning_seconds is null
    )
    or
    (
      mode = 'realtime'
      and planning_seconds between 15 and 300
      and async_turn_minutes is null
    )
  )
);

create table if not exists public.pvp_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.pvp_rooms(id) on delete cascade,
  user_id uuid not null,
  seat smallint not null check (seat between 1 and 8),
  nickname text not null check (char_length(nickname) between 1 and 12),
  status text not null default 'active' check (status in ('active', 'eliminated', 'left')),
  ready boolean not null default false,
  health integer not null default 100 check (health between 0 and 9999),
  credits integer not null default 0 check (credits between 0 and 999999),
  level smallint not null default 1 check (level between 1 and 20),
  xp integer not null default 0 check (xp between 0 and 999999),
  last_seen timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table if not exists public.pvp_squad_snapshots (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.pvp_rooms(id) on delete cascade,
  player_id uuid not null references public.pvp_room_players(id) on delete cascade,
  round integer not null check (round >= 0),
  revision bigint not null default 0 check (revision >= 0),
  board jsonb not null default '[]'::jsonb check (jsonb_typeof(board) = 'array'),
  bench jsonb not null default '[]'::jsonb check (jsonb_typeof(bench) = 'array'),
  augments jsonb not null default '[]'::jsonb check (jsonb_typeof(augments) = 'array'),
  traits jsonb not null default '{}'::jsonb check (jsonb_typeof(traits) = 'object'),
  economy jsonb not null default '{}'::jsonb check (jsonb_typeof(economy) = 'object'),
  shop jsonb not null default '{}'::jsonb check (jsonb_typeof(shop) = 'object'),
  checksum text check (checksum is null or char_length(checksum) between 1 and 160),
  submitted_at timestamptz not null default now(),
  unique (room_id, player_id, round)
);

create table if not exists public.pvp_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.pvp_rooms(id) on delete cascade,
  round integer not null check (round > 0),
  pair_index smallint not null check (pair_index >= 0),
  home_player_id uuid not null references public.pvp_room_players(id) on delete cascade,
  away_player_id uuid references public.pvp_room_players(id) on delete cascade,
  seed text not null check (char_length(seed) between 1 and 160),
  status text not null default 'scheduled' check (
    status in ('scheduled', 'resolving', 'finished', 'error')
  ),
  winner_player_id uuid references public.pvp_room_players(id) on delete set null,
  home_damage integer not null default 0 check (home_damage >= 0),
  away_damage integer not null default 0 check (away_damage >= 0),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  replay jsonb not null default '{}'::jsonb check (jsonb_typeof(replay) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, round, pair_index),
  check (away_player_id is null or away_player_id <> home_player_id)
);

create table if not exists public.pvp_match_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.pvp_matches(id) on delete cascade,
  player_id uuid not null references public.pvp_room_players(id) on delete cascade,
  reported_winner_player_id uuid not null references public.pvp_room_players(id) on delete cascade,
  damage integer not null check (damage between 1 and 30),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create table if not exists public.pvp_unit_pool (
  room_id uuid not null references public.pvp_rooms(id) on delete cascade,
  unit_name text not null check (char_length(unit_name) between 1 and 40),
  initial_count integer not null check (initial_count >= 0),
  remaining_count integer not null check (remaining_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (room_id, unit_name),
  check (remaining_count <= initial_count)
);

create table if not exists public.pvp_unit_holdings (
  room_id uuid not null references public.pvp_rooms(id) on delete cascade,
  player_id uuid not null references public.pvp_room_players(id) on delete cascade,
  unit_name text not null check (char_length(unit_name) between 1 and 40),
  held_count integer not null default 0 check (held_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, unit_name),
  foreign key (room_id, unit_name)
    references public.pvp_unit_pool(room_id, unit_name)
    on delete cascade
);

create index if not exists pvp_rooms_public_list_idx
  on public.pvp_rooms (visibility, status, mode, created_at desc);

create index if not exists pvp_rooms_phase_deadline_idx
  on public.pvp_rooms (status, phase_deadline)
  where status = 'running';

create index if not exists pvp_room_players_room_status_idx
  on public.pvp_room_players (room_id, status, seat);

create unique index if not exists pvp_room_players_active_seat_idx
  on public.pvp_room_players (room_id, seat)
  where status <> 'left';

create index if not exists pvp_room_players_user_idx
  on public.pvp_room_players (user_id, updated_at desc);

create index if not exists pvp_snapshots_room_round_idx
  on public.pvp_squad_snapshots (room_id, round, player_id);

create index if not exists pvp_matches_room_round_idx
  on public.pvp_matches (room_id, round, pair_index);

create index if not exists pvp_match_reports_match_idx
  on public.pvp_match_reports (match_id, player_id);

create or replace function public.pvp_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pvp_rooms_set_updated_at on public.pvp_rooms;
create trigger pvp_rooms_set_updated_at
before update on public.pvp_rooms
for each row execute function public.pvp_set_updated_at();

drop trigger if exists pvp_room_players_set_updated_at on public.pvp_room_players;
create trigger pvp_room_players_set_updated_at
before update on public.pvp_room_players
for each row execute function public.pvp_set_updated_at();

drop trigger if exists pvp_matches_set_updated_at on public.pvp_matches;
create trigger pvp_matches_set_updated_at
before update on public.pvp_matches
for each row execute function public.pvp_set_updated_at();

drop trigger if exists pvp_unit_pool_set_updated_at on public.pvp_unit_pool;
create trigger pvp_unit_pool_set_updated_at
before update on public.pvp_unit_pool
for each row execute function public.pvp_set_updated_at();

create or replace function public.pvp_is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.pvp_room_players player
    where player.room_id = target_room_id
      and player.user_id = (select auth.uid())
      and player.status <> 'left'
  );
$$;

create or replace function public.pvp_is_room_host(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.pvp_rooms room
    where room.id = target_room_id
      and room.host_user_id = (select auth.uid())
  );
$$;

alter table public.pvp_rooms enable row level security;
alter table public.pvp_room_players enable row level security;
alter table public.pvp_squad_snapshots enable row level security;
alter table public.pvp_matches enable row level security;
alter table public.pvp_match_reports enable row level security;
alter table public.pvp_unit_pool enable row level security;
alter table public.pvp_unit_holdings enable row level security;

drop policy if exists "pvp members read rooms" on public.pvp_rooms;
create policy "pvp members read rooms"
  on public.pvp_rooms for select
  to authenticated
  using (public.pvp_is_room_member(id));

drop policy if exists "pvp members read players" on public.pvp_room_players;
create policy "pvp members read players"
  on public.pvp_room_players for select
  to authenticated
  using (public.pvp_is_room_member(room_id));

drop policy if exists "pvp members read snapshots" on public.pvp_squad_snapshots;
create policy "pvp members read snapshots"
  on public.pvp_squad_snapshots for select
  to authenticated
  using (public.pvp_is_room_member(room_id));

drop policy if exists "pvp members read matches" on public.pvp_matches;
create policy "pvp members read matches"
  on public.pvp_matches for select
  to authenticated
  using (public.pvp_is_room_member(room_id));

drop policy if exists "pvp members read unit pool" on public.pvp_unit_pool;
create policy "pvp members read unit pool"
  on public.pvp_unit_pool for select
  to authenticated
  using (public.pvp_is_room_member(room_id));

revoke all on public.pvp_rooms from anon, authenticated;
revoke all on public.pvp_room_players from anon, authenticated;
revoke all on public.pvp_squad_snapshots from anon, authenticated;
revoke all on public.pvp_matches from anon, authenticated;
revoke all on public.pvp_match_reports from anon, authenticated;
revoke all on public.pvp_unit_pool from anon, authenticated;
revoke all on public.pvp_unit_holdings from anon, authenticated;

grant select on public.pvp_rooms to authenticated;
grant select on public.pvp_room_players to authenticated;
grant select on public.pvp_squad_snapshots to authenticated;
grant select on public.pvp_matches to authenticated;
grant select on public.pvp_unit_pool to authenticated;

create or replace function public.pvp_generate_room_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1 from public.pvp_rooms room where room.code = candidate
    );
  end loop;
  return candidate;
end;
$$;

create or replace function public.pvp_create_room(
  room_name text,
  player_nickname text,
  room_mode text default 'async',
  room_visibility text default 'public',
  room_max_players integer default 8,
  room_async_turn_minutes integer default 720,
  room_planning_seconds integer default 60,
  room_game_version text default 'dev'
)
returns table (room_id uuid, room_code text, player_id uuid, seat smallint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  created_room_id uuid;
  created_room_code text;
  created_player_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if room_mode not in ('async', 'realtime') then
    raise exception 'Invalid room mode';
  end if;
  if room_visibility not in ('public', 'invite') then
    raise exception 'Invalid room visibility';
  end if;
  if char_length(trim(room_name)) not between 1 and 30 then
    raise exception 'Room name must be between 1 and 30 characters';
  end if;
  if char_length(trim(player_nickname)) not between 1 and 12 then
    raise exception 'Nickname must be between 1 and 12 characters';
  end if;
  if room_max_players not between 2 and 8 then
    raise exception 'Room size must be between 2 and 8';
  end if;

  created_room_code := public.pvp_generate_room_code();

  insert into public.pvp_rooms (
    code,
    host_user_id,
    name,
    mode,
    visibility,
    max_players,
    async_turn_minutes,
    planning_seconds,
    game_version
  ) values (
    created_room_code,
    current_user_id,
    trim(room_name),
    room_mode,
    room_visibility,
    room_max_players,
    case when room_mode = 'async' then room_async_turn_minutes else null end,
    case when room_mode = 'realtime' then room_planning_seconds else null end,
    room_game_version
  )
  returning id into created_room_id;

  insert into public.pvp_room_players (
    room_id,
    user_id,
    seat,
    nickname
  ) values (
    created_room_id,
    current_user_id,
    1,
    trim(player_nickname)
  )
  returning id into created_player_id;

  return query select created_room_id, created_room_code, created_player_id, 1::smallint;
end;
$$;

create or replace function public.pvp_join_room(
  target_room_code text,
  player_nickname text
)
returns table (room_id uuid, player_id uuid, seat smallint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_room public.pvp_rooms%rowtype;
  joined_player_id uuid;
  assigned_seat smallint;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if char_length(trim(player_nickname)) not between 1 and 12 then
    raise exception 'Nickname must be between 1 and 12 characters';
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.code = upper(trim(target_room_code))
  for update;

  if not found then
    raise exception 'Room not found';
  end if;
  select player.id, player.seat
  into joined_player_id, assigned_seat
  from public.pvp_room_players player
    where player.room_id = target_room.id
      and player.user_id = current_user_id
      and player.status <> 'left';

  if joined_player_id is not null then
    update public.pvp_room_players player
    set nickname = trim(player_nickname),
        last_seen = now()
    where player.id = joined_player_id;

    return query select target_room.id, joined_player_id, assigned_seat;
    return;
  end if;

  if target_room.status <> 'waiting' or target_room.phase <> 'lobby' then
    raise exception 'Room is no longer accepting players';
  end if;

  select candidate::smallint into assigned_seat
  from generate_series(1, target_room.max_players) candidate
  where not exists (
    select 1 from public.pvp_room_players player
    where player.room_id = target_room.id
      and player.seat = candidate
      and player.status <> 'left'
  )
  order by candidate
  limit 1;

  if assigned_seat is null then
    raise exception 'Room is full';
  end if;

  insert into public.pvp_room_players (
    room_id,
    user_id,
    seat,
    nickname
  ) values (
    target_room.id,
    current_user_id,
    assigned_seat,
    trim(player_nickname)
  )
  on conflict on constraint pvp_room_players_room_id_user_id_key do update
    set seat = excluded.seat,
        nickname = excluded.nickname,
        status = 'active',
        ready = false,
        last_seen = now()
  returning id into joined_player_id;

  return query select target_room.id, joined_player_id, assigned_seat;
end;
$$;

create or replace function public.pvp_list_rooms(
  requested_mode text default null,
  result_limit integer default 30
)
returns table (
  room_id uuid,
  room_code text,
  room_name text,
  mode text,
  status text,
  player_count bigint,
  max_players smallint,
  current_round integer,
  async_turn_minutes integer,
  planning_seconds integer,
  game_version text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    room.id,
    room.code,
    room.name,
    room.mode,
    room.status,
    count(player.id) filter (where player.status <> 'left'),
    room.max_players,
    room.current_round,
    room.async_turn_minutes,
    room.planning_seconds,
    room.game_version,
    room.created_at
  from public.pvp_rooms room
  left join public.pvp_room_players player on player.room_id = room.id
  where room.visibility = 'public'
    and room.status = 'waiting'
    and room.phase = 'lobby'
    and (requested_mode is null or room.mode = requested_mode)
  group by room.id
  order by room.created_at desc
  limit least(greatest(result_limit, 1), 100);
$$;

create or replace function public.pvp_set_ready(
  target_room_id uuid,
  next_ready boolean
)
returns table (ready_count bigint, active_count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  update public.pvp_room_players player
  set ready = next_ready,
      last_seen = now()
  where player.room_id = target_room_id
    and player.user_id = current_user_id
    and player.status = 'active';

  if not found then
    raise exception 'Active room membership not found';
  end if;

  return query
    select
      count(*) filter (where player.ready),
      count(*)
    from public.pvp_room_players player
    where player.room_id = target_room_id
      and player.status = 'active';
end;
$$;

revoke all on function public.pvp_set_updated_at() from public;
revoke all on function public.pvp_is_room_member(uuid) from public;
revoke all on function public.pvp_is_room_host(uuid) from public;
revoke all on function public.pvp_generate_room_code() from public;
revoke all on function public.pvp_create_room(text, text, text, text, integer, integer, integer, text) from public;
revoke all on function public.pvp_join_room(text, text) from public;
revoke all on function public.pvp_list_rooms(text, integer) from public;
revoke all on function public.pvp_set_ready(uuid, boolean) from public;

grant execute on function public.pvp_is_room_member(uuid) to authenticated;
grant execute on function public.pvp_is_room_host(uuid) to authenticated;
grant execute on function public.pvp_create_room(text, text, text, text, integer, integer, integer, text) to authenticated;
grant execute on function public.pvp_join_room(text, text) to authenticated;
grant execute on function public.pvp_list_rooms(text, integer) to authenticated;
grant execute on function public.pvp_set_ready(uuid, boolean) to authenticated;

comment on table public.pvp_rooms is 'Shared room state for asynchronous and realtime PvP.';
comment on table public.pvp_room_players is 'Authenticated guest ownership and per-room player progression.';
comment on table public.pvp_squad_snapshots is 'Immutable round lineup snapshots used for combat and replay.';
comment on table public.pvp_matches is 'Seeded pairings, results, and replay payloads.';
comment on table public.pvp_match_reports is 'Per-participant combat reports used to confirm human match results.';
comment on table public.pvp_unit_pool is 'Room-scoped shared unit inventory. Mutate through RPC only.';
