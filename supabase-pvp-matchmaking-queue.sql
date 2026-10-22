-- Matchmaking queue for asynchronous PvP. Players prepare independently, then
-- eight compatible snapshots are moved into an internal running room atomically.

create table if not exists public.pvp_matchmaking_queue (
  id uuid primary key,
  user_id uuid not null,
  nickname text not null check (char_length(nickname) between 1 and 12),
  game_version text not null check (char_length(game_version) between 1 and 40),
  augment_rarity text not null check (augment_rarity in ('silver', 'gold', 'prismatic')),
  is_bot boolean not null default false,
  status text not null default 'queued' check (status in ('queued', 'matched', 'cancelled')),
  board jsonb not null check (jsonb_typeof(board) = 'array'),
  bench jsonb not null check (jsonb_typeof(bench) = 'array'),
  augments jsonb not null check (jsonb_typeof(augments) = 'array'),
  traits jsonb not null check (jsonb_typeof(traits) = 'object'),
  economy jsonb not null check (jsonb_typeof(economy) = 'object'),
  holdings jsonb not null default '{}'::jsonb check (jsonb_typeof(holdings) = 'object'),
  initial_pool jsonb not null check (jsonb_typeof(initial_pool) = 'object'),
  checksum text,
  matched_room_id uuid references public.pvp_rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  matched_at timestamptz
);

alter table public.pvp_matchmaking_queue
  add column if not exists batch_id uuid;

alter table public.pvp_matchmaking_queue
  drop constraint if exists pvp_matchmaking_queue_status_check;
alter table public.pvp_matchmaking_queue
  add constraint pvp_matchmaking_queue_status_check
  check (status in ('preparing', 'queued', 'matched', 'cancelled'));

create index if not exists pvp_matchmaking_queue_match_idx
  on public.pvp_matchmaking_queue (game_version, augment_rarity, created_at)
  where status = 'queued';

create index if not exists pvp_matchmaking_queue_batch_idx
  on public.pvp_matchmaking_queue (game_version, batch_id, created_at)
  where status in ('preparing', 'queued');

create index if not exists pvp_matchmaking_queue_user_idx
  on public.pvp_matchmaking_queue (user_id, created_at desc);

create or replace function public.pvp_reject_manual_async_room()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.mode = 'async' and new.status = 'waiting' and new.phase = 'lobby' then
    raise exception 'Asynchronous PvP uses the matchmaking queue';
  end if;
  return new;
end;
$$;

drop trigger if exists pvp_reject_manual_async_room_trigger on public.pvp_rooms;
create trigger pvp_reject_manual_async_room_trigger
before insert on public.pvp_rooms
for each row execute function public.pvp_reject_manual_async_room();

drop trigger if exists pvp_matchmaking_queue_set_updated_at on public.pvp_matchmaking_queue;
create trigger pvp_matchmaking_queue_set_updated_at
before update on public.pvp_matchmaking_queue
for each row execute function public.pvp_set_updated_at();

alter table public.pvp_matchmaking_queue enable row level security;

drop policy if exists pvp_matchmaking_queue_select_own on public.pvp_matchmaking_queue;
create policy pvp_matchmaking_queue_select_own
on public.pvp_matchmaking_queue
for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.pvp_reserve_async_match(
  queue_ticket_id uuid,
  player_nickname text,
  room_game_version text
)
returns table (
  queue_id uuid,
  batch_id uuid,
  augment_rarity text,
  reserved_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  assigned_batch_id uuid;
  assigned_rarity text;
  batch_number bigint;
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;
  if queue_ticket_id is null then raise exception 'Queue ticket is required'; end if;
  if char_length(trim(player_nickname)) not between 1 and 12 then
    raise exception 'Nickname must be between 1 and 12 characters';
  end if;
  if char_length(trim(room_game_version)) not between 1 and 40 then
    raise exception 'Invalid game version';
  end if;

  perform pg_advisory_xact_lock(hashtext('pvp-async-batch:' || trim(room_game_version)));

  select queued.batch_id, queued.augment_rarity
  into assigned_batch_id, assigned_rarity
  from public.pvp_matchmaking_queue queued
  where queued.id = queue_ticket_id
    and queued.user_id = current_user_id
    and queued.status = 'preparing';

  if assigned_batch_id is not null then
    return query
    select queue_ticket_id, assigned_batch_id, assigned_rarity,
      (select count(*)
       from public.pvp_matchmaking_queue waiting
       where waiting.batch_id = assigned_batch_id
         and waiting.status in ('preparing', 'queued'));
    return;
  end if;

  update public.pvp_matchmaking_queue
  set status = 'cancelled'
  where status = 'preparing'
    and updated_at < now() - interval '45 minutes';

  select candidate.batch_id, candidate.augment_rarity
  into assigned_batch_id, assigned_rarity
  from (
    select queued.batch_id, min(queued.augment_rarity) as augment_rarity, min(queued.created_at) as created_at
    from public.pvp_matchmaking_queue queued
    where queued.game_version = trim(room_game_version)
      and queued.status in ('preparing', 'queued')
      and queued.batch_id is not null
      and not exists (
        select 1
        from public.pvp_matchmaking_queue mine
        where mine.batch_id = queued.batch_id
          and mine.user_id = current_user_id
          and mine.status in ('preparing', 'queued')
      )
    group by queued.batch_id
    having count(*) < 8
    order by min(queued.created_at)
    limit 1
  ) candidate;

  if assigned_batch_id is null then
    assigned_batch_id := gen_random_uuid();
    select count(distinct queued.batch_id)
    into batch_number
    from public.pvp_matchmaking_queue queued
    where queued.game_version = trim(room_game_version)
      and queued.batch_id is not null;
    assigned_rarity := case mod(coalesce(batch_number, 0), 3)
      when 0 then 'prismatic'
      when 1 then 'gold'
      else 'silver'
    end;
  end if;

  insert into public.pvp_matchmaking_queue (
    id, user_id, nickname, game_version, batch_id, augment_rarity, status,
    board, bench, augments, traits, economy, holdings, initial_pool
  ) values (
    queue_ticket_id, current_user_id, trim(player_nickname), trim(room_game_version),
    assigned_batch_id, assigned_rarity, 'preparing',
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
  );

  return query
  select queue_ticket_id, assigned_batch_id, assigned_rarity,
    (select count(*)
     from public.pvp_matchmaking_queue waiting
     where waiting.batch_id = assigned_batch_id
       and waiting.status in ('preparing', 'queued'));
end;
$$;

create or replace function public.pvp_enqueue_async_match(
  queue_ticket_id uuid,
  player_nickname text,
  room_game_version text,
  board_data jsonb,
  bench_data jsonb,
  augments_data jsonb,
  traits_data jsonb,
  economy_data jsonb,
  pool_data jsonb,
  snapshot_checksum text default null
)
returns table (
  queue_id uuid,
  queue_status text,
  matched_room_id uuid,
  queued_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  selected_rarity text;
  reserved_rarity text;
  reserved_batch_id uuid;
  desired_counts jsonb;
  candidate_ids uuid[];
  candidate_count integer;
  created_room_id uuid;
  created_room_code text;
  first_user_id uuid;
  queue_entry public.pvp_matchmaking_queue%rowtype;
  created_player_id uuid;
  assigned_seat integer := 0;
  pool_entry record;
  holding_entry record;
  base_count integer;
  held_count integer;
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;
  if queue_ticket_id is null then raise exception 'Queue ticket is required'; end if;
  if char_length(trim(player_nickname)) not between 1 and 12 then
    raise exception 'Nickname must be between 1 and 12 characters';
  end if;
  if char_length(trim(room_game_version)) not between 1 and 40 then
    raise exception 'Invalid game version';
  end if;
  if pool_data is null or jsonb_typeof(pool_data) <> 'object' or pool_data = '{}'::jsonb then
    raise exception 'Invalid initial unit pool';
  end if;

  perform public.pvp_validate_snapshot_payload(
    board_data, bench_data, augments_data, traits_data, economy_data
  );

  select lower(augment ->> 'rarity')
  into selected_rarity
  from jsonb_array_elements(augments_data) augment
  where coalesce((augment ->> 'stage')::integer, 0) = 1
  limit 1;

  if selected_rarity not in ('silver', 'gold', 'prismatic') then
    raise exception 'The first augment must be selected before matchmaking';
  end if;

  select queued.augment_rarity, queued.batch_id
  into reserved_rarity, reserved_batch_id
  from public.pvp_matchmaking_queue queued
  where queued.id = queue_ticket_id
    and queued.user_id = current_user_id
    and queued.status in ('preparing', 'queued')
  for update;

  if reserved_batch_id is not null and reserved_rarity <> selected_rarity then
    raise exception 'The selected augment rarity does not match the reserved matchmaking batch';
  end if;

  select coalesce(jsonb_object_agg(counted.unit_name, counted.copy_count), '{}'::jsonb)
  into desired_counts
  from (
    select unit ->> 'name' as unit_name,
      sum(greatest(0,
        case greatest(1, least(3, coalesce((unit ->> 'tier')::integer, 1)))
          when 3 then 9 when 2 then 3 else 1 end
        - greatest(0, coalesce((unit ->> 'poolExemptCopies')::integer, 0))
      ))::integer as copy_count
    from jsonb_array_elements(board_data || bench_data) unit
    where nullif(unit ->> 'name', '') is not null
    group by unit ->> 'name'
  ) counted;

  insert into public.pvp_matchmaking_queue (
    id, user_id, nickname, game_version, batch_id, augment_rarity, status,
    board, bench, augments, traits, economy, holdings, initial_pool, checksum
  ) values (
    queue_ticket_id, current_user_id, trim(player_nickname), trim(room_game_version), reserved_batch_id, selected_rarity, 'queued',
    board_data, bench_data, augments_data, traits_data, economy_data, desired_counts, pool_data, snapshot_checksum
  )
  on conflict (id) do update
  set nickname = excluded.nickname,
      status = 'queued',
      board = excluded.board,
      bench = excluded.bench,
      augments = excluded.augments,
      traits = excluded.traits,
      economy = excluded.economy,
      holdings = excluded.holdings,
      initial_pool = excluded.initial_pool,
      checksum = excluded.checksum,
      updated_at = now()
  where public.pvp_matchmaking_queue.user_id = current_user_id
    and public.pvp_matchmaking_queue.status in ('preparing', 'queued');

  if not found then raise exception 'Queue ticket cannot be changed'; end if;

  -- Serialize match creation for the reserved eight-player batch. Legacy rows
  -- without a batch id still use the old version-and-rarity lane.
  perform pg_advisory_xact_lock(hashtext(trim(room_game_version) || ':' || coalesce(reserved_batch_id::text, selected_rarity)));

  select array_agg(candidate.id order by candidate.created_at)
  into candidate_ids
  from (
    select queued.id, queued.created_at
    from public.pvp_matchmaking_queue queued
    where queued.status = 'queued'
      and queued.game_version = trim(room_game_version)
      and (
        (reserved_batch_id is not null and queued.batch_id = reserved_batch_id)
        or (reserved_batch_id is null and queued.batch_id is null and queued.augment_rarity = selected_rarity)
      )
      and not exists (
        select 1
        from public.pvp_matchmaking_queue earlier
        where earlier.status = 'queued'
          and earlier.game_version = queued.game_version
          and coalesce(earlier.batch_id::text, earlier.augment_rarity) = coalesce(queued.batch_id::text, queued.augment_rarity)
          and earlier.user_id = queued.user_id
          and (earlier.created_at, earlier.id) < (queued.created_at, queued.id)
      )
    order by queued.created_at
    for update skip locked
    limit 8
  ) candidate;

  candidate_count := coalesce(array_length(candidate_ids, 1), 0);
  if candidate_count = 8 then
    select queued.user_id into first_user_id
    from public.pvp_matchmaking_queue queued
    where queued.id = candidate_ids[1];

    created_room_code := public.pvp_generate_room_code();
    insert into public.pvp_rooms (
      code, host_user_id, name, mode, visibility, status, phase, max_players,
      current_round, async_turn_minutes, planning_seconds, phase_deadline,
      game_version, started_at
    ) values (
      created_room_code, first_user_id, '비실시간 자동 매칭', 'async', 'invite',
      'running', 'planning', 8, 1, 720, null, now() + interval '12 hours',
      trim(room_game_version), now()
    ) returning id into created_room_id;

    for pool_entry in select key as unit_name, value from jsonb_each_text(pool_data)
    loop
      base_count := greatest(0, pool_entry.value::integer);
      select coalesce(sum(coalesce((queued.holdings ->> pool_entry.unit_name)::integer, 0)), 0)::integer
      into held_count
      from public.pvp_matchmaking_queue queued
      where queued.id = any(candidate_ids);

      insert into public.pvp_unit_pool (room_id, unit_name, initial_count, remaining_count)
      values (created_room_id, pool_entry.unit_name, greatest(base_count, held_count), greatest(0, base_count - held_count));
    end loop;

    for queue_entry in
      select queued.*
      from public.pvp_matchmaking_queue queued
      where queued.id = any(candidate_ids)
      order by queued.created_at
    loop
      assigned_seat := assigned_seat + 1;
      insert into public.pvp_room_players (
        room_id, user_id, seat, nickname, ready, health, credits, level, xp, is_bot, bot_difficulty
      ) values (
        created_room_id, queue_entry.user_id, assigned_seat, queue_entry.nickname, queue_entry.is_bot,
        greatest(1, least(9999, coalesce((queue_entry.economy ->> 'hp')::integer, 100))),
        greatest(0, coalesce((queue_entry.economy ->> 'gold')::integer, 0)),
        greatest(1, least(20, coalesce((queue_entry.economy ->> 'level')::integer, 1))),
        greatest(0, coalesce((queue_entry.economy ->> 'xp')::integer, 0)),
        queue_entry.is_bot,
        case when queue_entry.is_bot then 'normal' else null end
      ) returning id into created_player_id;

      insert into public.pvp_squad_snapshots (
        room_id, player_id, round, board, bench, augments, traits, economy, checksum
      ) values (
        created_room_id, created_player_id, 0, queue_entry.board, queue_entry.bench,
        queue_entry.augments, queue_entry.traits, queue_entry.economy, queue_entry.checksum
      );

      for holding_entry in select key as unit_name, value from jsonb_each_text(queue_entry.holdings)
      loop
        if holding_entry.value::integer > 0 then
          insert into public.pvp_unit_holdings (room_id, player_id, unit_name, held_count)
          values (created_room_id, created_player_id, holding_entry.unit_name, holding_entry.value::integer);
        end if;
      end loop;
    end loop;

    update public.pvp_matchmaking_queue queued
    set status = 'matched', matched_room_id = created_room_id, matched_at = now()
    where queued.id = any(candidate_ids);

    -- The push schema is installed before this migration in the current deployment.
    insert into public.pvp_push_events (user_id, event_key, event_type, title, body, target_url)
    select queued.user_id,
      'async-match:' || created_room_id::text || ':' || queued.user_id::text,
      'async_match_ready',
      '비실시간 PvP 매칭 완료',
      '8명의 덱이 모였습니다. 첫 PvP 라운드를 준비해주세요.',
      '/index.html?pvpRoom=' || created_room_id::text
    from public.pvp_matchmaking_queue queued
    where queued.id = any(candidate_ids)
      and not queued.is_bot
    on conflict (user_id, event_key) do nothing;
  end if;

  return query
  select queued.id, queued.status, queued.matched_room_id,
    (select count(*)
     from public.pvp_matchmaking_queue waiting
     where waiting.status = 'queued'
       and waiting.game_version = queued.game_version
       and coalesce(waiting.batch_id::text, waiting.augment_rarity) = coalesce(queued.batch_id::text, queued.augment_rarity))
  from public.pvp_matchmaking_queue queued
  where queued.id = queue_ticket_id
    and queued.user_id = current_user_id;
end;
$$;

create or replace function public.pvp_debug_fill_async_queue(queue_ticket_id uuid)
returns table (
  queue_id uuid,
  queue_status text,
  matched_room_id uuid,
  queued_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  source_entry public.pvp_matchmaking_queue%rowtype;
  compatible_count integer;
  missing_count integer;
  bot_index integer;
  bot_names text[] := array['현우 봇', '혜진 봇', '수아 봇', '쇼우 봇', '엠마 봇', '리오 봇', '얀 봇'];
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;

  select queued.* into source_entry
  from public.pvp_matchmaking_queue queued
  where queued.id = queue_ticket_id
    and queued.user_id = current_user_id
    and queued.status = 'queued'
  for update;

  if not found then raise exception 'Queued test deck not found'; end if;
  if source_entry.game_version not like '%-local-test' then
    raise exception 'Test bots are available only for local-test queues';
  end if;

  select count(distinct queued.user_id)::integer
  into compatible_count
  from public.pvp_matchmaking_queue queued
  where queued.status = 'queued'
    and queued.game_version = source_entry.game_version
    and coalesce(queued.batch_id::text, queued.augment_rarity) = coalesce(source_entry.batch_id::text, source_entry.augment_rarity);

  missing_count := greatest(0, 8 - compatible_count);
  if missing_count > 0 then
    for bot_index in 1..missing_count
    loop
      insert into public.pvp_matchmaking_queue (
        id, user_id, nickname, game_version, batch_id, augment_rarity, is_bot, status,
        board, bench, augments, traits, economy, holdings, initial_pool, checksum
      ) values (
        gen_random_uuid(), gen_random_uuid(), bot_names[1 + ((bot_index - 1) % array_length(bot_names, 1))],
        source_entry.game_version, source_entry.batch_id, source_entry.augment_rarity, true, 'queued',
        source_entry.board, source_entry.bench, source_entry.augments, source_entry.traits,
        source_entry.economy, source_entry.holdings, source_entry.initial_pool,
        'local-test-bot:' || bot_index::text || ':' || coalesce(source_entry.checksum, '')
      );
    end loop;
  end if;

  return query
  select * from public.pvp_enqueue_async_match(
    source_entry.id,
    source_entry.nickname,
    source_entry.game_version,
    source_entry.board,
    source_entry.bench,
    source_entry.augments,
    source_entry.traits,
    source_entry.economy,
    source_entry.initial_pool,
    source_entry.checksum
  );
end;
$$;

create or replace function public.pvp_cancel_async_match(queue_ticket_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.pvp_matchmaking_queue queued
  set status = 'cancelled'
  where queued.id = queue_ticket_id
    and queued.user_id = auth.uid()
    and queued.status in ('preparing', 'queued');
  return found;
end;
$$;

create or replace function public.pvp_list_own_async_queue()
returns table (
  id uuid,
  nickname text,
  game_version text,
  augment_rarity text,
  status text,
  matched_room_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  matched_at timestamptz,
  queued_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select queued.id,
    queued.nickname,
    queued.game_version,
    queued.augment_rarity,
    queued.status,
    queued.matched_room_id,
    queued.created_at,
    queued.updated_at,
    queued.matched_at,
    (
      select count(distinct waiting.user_id)
      from public.pvp_matchmaking_queue waiting
      where waiting.status = 'queued'
        and waiting.game_version = queued.game_version
        and coalesce(waiting.batch_id::text, waiting.augment_rarity) = coalesce(queued.batch_id::text, queued.augment_rarity)
    ) as queued_count
  from public.pvp_matchmaking_queue queued
  where queued.user_id = auth.uid()
    and queued.status = 'queued'
  order by queued.created_at desc;
$$;

revoke all on table public.pvp_matchmaking_queue from public;
grant select on table public.pvp_matchmaking_queue to authenticated;
revoke all on function public.pvp_reject_manual_async_room() from public;
revoke all on function public.pvp_reserve_async_match(uuid, text, text) from public;
revoke all on function public.pvp_enqueue_async_match(uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text) from public;
revoke all on function public.pvp_cancel_async_match(uuid) from public;
revoke all on function public.pvp_debug_fill_async_queue(uuid) from public;
revoke all on function public.pvp_list_own_async_queue() from public;
grant execute on function public.pvp_enqueue_async_match(uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text) to authenticated;
grant execute on function public.pvp_reserve_async_match(uuid, text, text) to authenticated;
grant execute on function public.pvp_cancel_async_match(uuid) to authenticated;
grant execute on function public.pvp_debug_fill_async_queue(uuid) to authenticated;
grant execute on function public.pvp_list_own_async_queue() to authenticated;

comment on table public.pvp_matchmaking_queue is 'Prepared asynchronous PvP decks waiting for automatic eight-player matching.';
notify pgrst, 'reload schema';
