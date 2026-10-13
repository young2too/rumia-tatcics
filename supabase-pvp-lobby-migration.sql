-- Adds lobby start and leave operations after supabase-pvp-schema.sql.
-- Run this file once in the Supabase SQL editor.

alter table public.pvp_rooms
  drop constraint if exists pvp_rooms_phase_check;

alter table public.pvp_rooms
  add constraint pvp_rooms_phase_check check (
    phase in ('lobby', 'pve', 'planning', 'locked', 'combat', 'result', 'finished')
  );

alter table public.pvp_room_players
  add column if not exists is_bot boolean not null default false;

alter table public.pvp_room_players
  add column if not exists bot_difficulty text;

alter table public.pvp_room_players
  drop constraint if exists pvp_room_players_bot_difficulty_check;

alter table public.pvp_room_players
  add constraint pvp_room_players_bot_difficulty_check check (
    (not is_bot and bot_difficulty is null)
    or (is_bot and bot_difficulty in ('normal', 'hard'))
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

alter table public.pvp_unit_holdings enable row level security;
revoke all on public.pvp_unit_holdings from anon, authenticated;

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

alter table public.pvp_match_reports enable row level security;
revoke all on public.pvp_match_reports from anon, authenticated;
create index if not exists pvp_match_reports_match_idx
  on public.pvp_match_reports (match_id, player_id);

create or replace function public.pvp_release_player_holdings(target_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.pvp_unit_pool pool
  set remaining_count = least(pool.initial_count, pool.remaining_count + holding.held_count),
      updated_at = now()
  from public.pvp_unit_holdings holding
  where holding.player_id = target_player_id
    and pool.room_id = holding.room_id
    and pool.unit_name = holding.unit_name;

  delete from public.pvp_unit_holdings holding
  where holding.player_id = target_player_id;
end;
$$;

create or replace function public.pvp_set_player_holdings(
  target_player_id uuid,
  desired_counts jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_player public.pvp_room_players%rowtype;
  holding record;
  desired record;
  desired_count integer;
  current_count integer;
  delta integer;
begin
  if jsonb_typeof(desired_counts) <> 'object' then
    raise exception 'Invalid unit holdings payload';
  end if;

  select player.* into target_player
  from public.pvp_room_players player
  where player.id = target_player_id
    and player.status = 'active'
  for update;

  if not found then
    raise exception 'Active PvP player not found';
  end if;

  for holding in
    select owned.unit_name, owned.held_count
    from public.pvp_unit_holdings owned
    where owned.player_id = target_player_id
    for update
  loop
    desired_count := greatest(0, coalesce((desired_counts ->> holding.unit_name)::integer, 0));
    if holding.held_count > desired_count then
      delta := holding.held_count - desired_count;
      update public.pvp_unit_pool pool
      set remaining_count = least(pool.initial_count, pool.remaining_count + delta),
          updated_at = now()
      where pool.room_id = target_player.room_id
        and pool.unit_name = holding.unit_name;

      update public.pvp_unit_holdings owned
      set held_count = desired_count,
          updated_at = now()
      where owned.player_id = target_player_id
        and owned.unit_name = holding.unit_name;
    end if;
  end loop;

  for desired in select key as unit_name, value from jsonb_each_text(desired_counts)
  loop
    desired_count := greatest(0, desired.value::integer);
    if desired_count > 99 then
      raise exception 'Invalid held unit count';
    end if;

    select coalesce(max(owned.held_count), 0) into current_count
    from public.pvp_unit_holdings owned
    where owned.player_id = target_player_id
      and owned.unit_name = desired.unit_name;
    if desired_count > current_count then
      delta := desired_count - current_count;
      update public.pvp_unit_pool pool
      set remaining_count = pool.remaining_count - delta,
          updated_at = now()
      where pool.room_id = target_player.room_id
        and pool.unit_name = desired.unit_name
        and pool.remaining_count >= delta;

      if not found then
        raise exception 'Unit is out of stock: %', desired.unit_name;
      end if;
    end if;

    insert into public.pvp_unit_holdings (room_id, player_id, unit_name, held_count)
    values (target_player.room_id, target_player_id, desired.unit_name, desired_count)
    on conflict (player_id, unit_name) do update
    set held_count = excluded.held_count,
        updated_at = now();
  end loop;

  delete from public.pvp_unit_holdings owned
  where owned.player_id = target_player_id
    and owned.held_count = 0;
end;
$$;

revoke all on function public.pvp_release_player_holdings(uuid) from public;
revoke all on function public.pvp_set_player_holdings(uuid, jsonb) from public;

-- Reject malformed or obviously forged squad payloads before storage.
create or replace function public.pvp_validate_snapshot_payload(
  board_data jsonb,
  bench_data jsonb,
  augments_data jsonb,
  traits_data jsonb,
  economy_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  unit_data jsonb;
  occupied_indices integer[] := array[]::integer[];
  unit_index integer;
  unit_tier integer;
  unit_cost integer;
  exempt_copies integer;
  numeric_value numeric;
  numeric_key text;
begin
  if jsonb_typeof(board_data) <> 'array'
    or jsonb_typeof(bench_data) <> 'array'
    or jsonb_typeof(augments_data) <> 'array'
    or jsonb_typeof(traits_data) <> 'object'
    or jsonb_typeof(economy_data) <> 'object' then
    raise exception 'Invalid PvP snapshot payload';
  end if;
  if jsonb_array_length(board_data) > 16 then
    raise exception 'PvP board unit limit exceeded';
  end if;
  if jsonb_array_length(bench_data) > 12 then
    raise exception 'PvP bench unit limit exceeded';
  end if;
  if jsonb_array_length(augments_data) > 12 then
    raise exception 'PvP augment limit exceeded';
  end if;

  for unit_data in select value from jsonb_array_elements(board_data)
  loop
    if jsonb_typeof(unit_data) <> 'object'
      or nullif(btrim(unit_data ->> 'name'), '') is null
      or char_length(unit_data ->> 'name') > 40 then
      raise exception 'Invalid PvP board unit';
    end if;
    unit_tier := coalesce((unit_data ->> 'tier')::integer, 1);
    unit_cost := coalesce((unit_data ->> 'cost')::integer, 0);
    exempt_copies := coalesce((unit_data ->> 'poolExemptCopies')::integer, 0);
    unit_index := coalesce((unit_data ->> 'index')::integer, -1);
    if unit_tier not between 1 and 3
      or unit_cost not between 1 and 5
      or exempt_copies < 0
      or exempt_copies > case unit_tier when 3 then 9 when 2 then 3 else 1 end
      or unit_index not between 0 and 31 then
      raise exception 'Invalid PvP board unit tier or position';
    end if;
    if coalesce((unit_data ->> 'fourStarAscended')::boolean, false)
      and not exists (
        select 1 from jsonb_array_elements(augments_data) augment
        where augment ->> 'id' = 'common_prismatic_world_breakthrough'
      ) then
      raise exception 'Four-star unit requires World Breakthrough';
    end if;
    if unit_index = any(occupied_indices) then
      raise exception 'Duplicate PvP board position';
    end if;
    occupied_indices := array_append(occupied_indices, unit_index);
  end loop;

  occupied_indices := array[]::integer[];
  for unit_data in select value from jsonb_array_elements(bench_data)
  loop
    if jsonb_typeof(unit_data) <> 'object'
      or nullif(btrim(unit_data ->> 'name'), '') is null
      or char_length(unit_data ->> 'name') > 40 then
      raise exception 'Invalid PvP bench unit';
    end if;
    unit_tier := coalesce((unit_data ->> 'tier')::integer, 1);
    unit_cost := coalesce((unit_data ->> 'cost')::integer, 0);
    exempt_copies := coalesce((unit_data ->> 'poolExemptCopies')::integer, 0);
    unit_index := coalesce((unit_data ->> 'index')::integer, -1);
    if unit_tier not between 1 and 3
      or unit_cost not between 1 and 5
      or exempt_copies < 0
      or exempt_copies > case unit_tier when 3 then 9 when 2 then 3 else 1 end
      or unit_index not between 0 and 11 then
      raise exception 'Invalid PvP bench unit tier or position';
    end if;
    if unit_index = any(occupied_indices) then
      raise exception 'Duplicate PvP bench position';
    end if;
    occupied_indices := array_append(occupied_indices, unit_index);
  end loop;

  foreach numeric_key in array array['gold', 'level', 'xp', 'hp']
  loop
    if economy_data ? numeric_key then
      numeric_value := (economy_data ->> numeric_key)::numeric;
      if numeric_value < 0 or numeric_value > 1000000 then
        raise exception 'Invalid PvP economy value: %', numeric_key;
      end if;
    end if;
  end loop;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid numeric value in PvP snapshot';
end;
$$;

revoke all on function public.pvp_validate_snapshot_payload(jsonb, jsonb, jsonb, jsonb, jsonb) from public;

create or replace function public.pvp_take_unit(
  target_room_id uuid,
  target_unit_name text,
  requested_count integer default 1
)
returns table (pool_remaining integer, player_held integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_player public.pvp_room_players%rowtype;
  normalized_count integer := greatest(1, least(9, coalesce(requested_count, 1)));
  next_remaining integer;
  next_held integer;
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;

  select player.* into target_player
  from public.pvp_room_players player
  join public.pvp_rooms room on room.id = player.room_id
  where player.room_id = target_room_id
    and player.user_id = current_user_id
    and player.status = 'active'
    and not player.is_bot
    and room.status = 'running'
  for update of player;

  if not found then raise exception 'Active PvP player membership not found'; end if;

  update public.pvp_unit_pool pool
  set remaining_count = pool.remaining_count - normalized_count,
      updated_at = now()
  where pool.room_id = target_room_id
    and pool.unit_name = target_unit_name
    and pool.remaining_count >= normalized_count
  returning pool.remaining_count into next_remaining;

  if next_remaining is null then
    raise exception 'Unit is out of stock: %', target_unit_name;
  end if;

  insert into public.pvp_unit_holdings (room_id, player_id, unit_name, held_count)
  values (target_room_id, target_player.id, target_unit_name, normalized_count)
  on conflict (player_id, unit_name) do update
  set held_count = public.pvp_unit_holdings.held_count + excluded.held_count,
      updated_at = now()
  returning held_count into next_held;

  return query select next_remaining, next_held;
end;
$$;

create or replace function public.pvp_return_unit(
  target_room_id uuid,
  target_unit_name text,
  returned_count integer
)
returns table (pool_remaining integer, player_held integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_player public.pvp_room_players%rowtype;
  normalized_count integer := greatest(1, least(9, coalesce(returned_count, 1)));
  current_held integer;
  next_remaining integer;
  next_held integer;
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;

  select player.* into target_player
  from public.pvp_room_players player
  join public.pvp_rooms room on room.id = player.room_id
  where player.room_id = target_room_id
    and player.user_id = current_user_id
    and player.status = 'active'
    and not player.is_bot
    and room.status = 'running'
  for update of player;

  if not found then raise exception 'Active PvP player membership not found'; end if;

  select holding.held_count into current_held
  from public.pvp_unit_holdings holding
  where holding.player_id = target_player.id
    and holding.unit_name = target_unit_name
  for update;

  if coalesce(current_held, 0) < normalized_count then
    raise exception 'Cannot return more units than the player holds';
  end if;

  next_held := current_held - normalized_count;
  update public.pvp_unit_holdings holding
  set held_count = next_held,
      updated_at = now()
  where holding.player_id = target_player.id
    and holding.unit_name = target_unit_name;

  update public.pvp_unit_pool pool
  set remaining_count = least(pool.initial_count, pool.remaining_count + normalized_count),
      updated_at = now()
  where pool.room_id = target_room_id
    and pool.unit_name = target_unit_name
  returning pool.remaining_count into next_remaining;

  if next_held = 0 then
    delete from public.pvp_unit_holdings holding
    where holding.player_id = target_player.id
      and holding.unit_name = target_unit_name;
  end if;

  return query select next_remaining, next_held;
end;
$$;

create or replace function public.pvp_sync_unit_holdings(
  target_room_id uuid,
  desired_counts jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_player_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;

  select player.id into target_player_id
  from public.pvp_room_players player
  join public.pvp_rooms room on room.id = player.room_id
  where player.room_id = target_room_id
    and player.user_id = current_user_id
    and player.status = 'active'
    and not player.is_bot
    and room.status = 'running';

  if target_player_id is null then raise exception 'Active PvP player membership not found'; end if;
  perform public.pvp_set_player_holdings(target_player_id, desired_counts);
end;
$$;

revoke all on function public.pvp_take_unit(uuid, text, integer) from public;
revoke all on function public.pvp_return_unit(uuid, text, integer) from public;
revoke all on function public.pvp_sync_unit_holdings(uuid, jsonb) from public;
grant execute on function public.pvp_take_unit(uuid, text, integer) to authenticated;
grant execute on function public.pvp_return_unit(uuid, text, integer) to authenticated;
grant execute on function public.pvp_sync_unit_holdings(uuid, jsonb) to authenticated;

create table if not exists public.pvp_chat_messages (
  id bigint generated by default as identity primary key,
  room_id uuid not null references public.pvp_rooms(id) on delete cascade,
  player_id uuid not null references public.pvp_room_players(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 200),
  created_at timestamptz not null default now()
);

-- One shared Lumi Shop product can be claimed by only one room participant.
create table if not exists public.pvp_lumi_shop_claims (
  room_id uuid not null references public.pvp_rooms(id) on delete cascade,
  round integer not null check (round >= 1),
  product_id text not null check (char_length(product_id) between 1 and 60),
  player_id uuid not null references public.pvp_room_players(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (room_id, round, product_id),
  unique (room_id, round, player_id)
);

create index if not exists pvp_lumi_shop_claims_room_round_idx
  on public.pvp_lumi_shop_claims (room_id, round, claimed_at);

alter table public.pvp_lumi_shop_claims enable row level security;

drop policy if exists "pvp members read lumi claims" on public.pvp_lumi_shop_claims;
create policy "pvp members read lumi claims"
  on public.pvp_lumi_shop_claims for select
  using (public.pvp_is_room_member(room_id));

revoke all on public.pvp_lumi_shop_claims from anon, authenticated;
grant select on public.pvp_lumi_shop_claims to authenticated;

create or replace function public.pvp_claim_lumi_product(
  target_room_id uuid,
  target_round integer,
  target_product_id text
)
returns table (room_id uuid, round integer, product_id text, player_id uuid, claimed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_player public.pvp_room_players%rowtype;
  allowed_products constant text[] := array[
    'attack-module', 'amplification-module', 'survival-module', 'team-calibration',
    'emergency-repair', 'ice-shield', 'joker-unit', 'five-cost-ticket', 'prismatic-ticket'
  ];
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;
  if target_round < 5 or (target_round - 5) % 10 <> 0 then raise exception 'Invalid Lumi Shop round'; end if;
  if not (target_product_id = any(allowed_products)) then raise exception 'Invalid Lumi Shop product'; end if;

  select player.* into target_player
  from public.pvp_room_players player
  join public.pvp_rooms room on room.id = player.room_id
  where player.room_id = target_room_id
    and player.user_id = current_user_id
    and player.status = 'active'
    and not player.is_bot
    and room.status = 'running'
  for update of player;
  if not found then raise exception 'Active PvP membership not found'; end if;

  if exists (
    select 1 from public.pvp_lumi_shop_claims claim
    where claim.room_id = target_room_id and claim.round = target_round
      and claim.player_id = target_player.id
  ) then
    raise exception 'Player already selected a Lumi Shop product';
  end if;

  begin
    insert into public.pvp_lumi_shop_claims (room_id, round, product_id, player_id)
    values (target_room_id, target_round, target_product_id, target_player.id);
  exception when unique_violation then
    raise exception 'Lumi Shop product already claimed';
  end;

  return query
  select claim.room_id, claim.round, claim.product_id, claim.player_id, claim.claimed_at
  from public.pvp_lumi_shop_claims claim
  where claim.room_id = target_room_id and claim.round = target_round
    and claim.product_id = target_product_id;
end;
$$;

create or replace function public.pvp_prepare_lumi_shop(
  target_room_id uuid,
  target_round integer,
  offered_product_ids text[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_bot public.pvp_room_players%rowtype;
  selected_product text;
  latest_snapshot_id uuid;
  prepared_count integer := 0;
  bot_products constant text[] := array[
    'attack-module', 'amplification-module', 'survival-module',
    'team-calibration', 'emergency-repair'
  ];
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;
  if not public.pvp_is_room_member(target_room_id) then raise exception 'PvP room membership not found'; end if;
  if target_round < 5 or (target_round - 5) % 10 <> 0 then raise exception 'Invalid Lumi Shop round'; end if;
  if coalesce(array_length(offered_product_ids, 1), 0) < 2 then raise exception 'Invalid Lumi Shop offers'; end if;

  for target_bot in
    select player.* from public.pvp_room_players player
    where player.room_id = target_room_id and player.status = 'active' and player.is_bot
    order by player.health, player.seat
    for update
  loop
    if exists (
      select 1 from public.pvp_lumi_shop_claims claim
      where claim.room_id = target_room_id and claim.round = target_round
        and claim.player_id = target_bot.id
    ) then continue; end if;

    select offered.product_id into selected_product
    from unnest(offered_product_ids) offered(product_id)
    where offered.product_id = any(bot_products)
      and not exists (
        select 1 from public.pvp_lumi_shop_claims claim
        where claim.room_id = target_room_id and claim.round = target_round
          and claim.product_id = offered.product_id
      )
    order by md5(target_room_id::text || ':' || target_round || ':' || target_bot.id::text || ':' || offered.product_id)
    limit 1;

    if selected_product is null then continue; end if;
    insert into public.pvp_lumi_shop_claims (room_id, round, product_id, player_id)
    values (target_room_id, target_round, selected_product, target_bot.id)
    on conflict do nothing;
    if not found then continue; end if;

    select snapshot.id into latest_snapshot_id
    from public.pvp_squad_snapshots snapshot
    where snapshot.room_id = target_room_id and snapshot.player_id = target_bot.id
    order by snapshot.round desc, snapshot.submitted_at desc
    limit 1;

    if latest_snapshot_id is not null then
      update public.pvp_squad_snapshots snapshot
      set economy = jsonb_set(
        coalesce(snapshot.economy, '{}'::jsonb),
        '{botLumiProducts}',
        coalesce(snapshot.economy -> 'botLumiProducts', '[]'::jsonb) || to_jsonb(selected_product),
        true
      )
      where snapshot.id = latest_snapshot_id;
    end if;

    if selected_product = 'emergency-repair' then
      update public.pvp_room_players player
      set health = least(100, player.health + 20), updated_at = now()
      where player.id = target_bot.id;
    end if;
    prepared_count := prepared_count + 1;
  end loop;
  return prepared_count;
end;
$$;

revoke all on function public.pvp_claim_lumi_product(uuid, integer, text) from public;
revoke all on function public.pvp_prepare_lumi_shop(uuid, integer, text[]) from public;
grant execute on function public.pvp_claim_lumi_product(uuid, integer, text) to authenticated;
grant execute on function public.pvp_prepare_lumi_shop(uuid, integer, text[]) to authenticated;

create index if not exists pvp_chat_messages_room_created_idx
  on public.pvp_chat_messages (room_id, created_at desc);

alter table public.pvp_chat_messages enable row level security;

drop policy if exists "pvp members read chat" on public.pvp_chat_messages;
create policy "pvp members read chat"
  on public.pvp_chat_messages for select
  to authenticated
  using (public.pvp_is_room_member(room_id));

revoke all on public.pvp_chat_messages from anon, authenticated;
grant select on public.pvp_chat_messages to authenticated;

create or replace function public.pvp_send_chat_message(
  target_room_id uuid,
  chat_message text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_player_id uuid;
  normalized_message text := btrim(coalesce(chat_message, ''));
  created_message_id bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if char_length(normalized_message) < 1 or char_length(normalized_message) > 200 then
    raise exception 'Chat message must contain 1 to 200 characters';
  end if;

  select player.id into target_player_id
  from public.pvp_room_players player
  where player.room_id = target_room_id
    and player.user_id = current_user_id
    and player.status <> 'left'
    and not player.is_bot;

  if target_player_id is null then
    raise exception 'Active human room membership not found';
  end if;
  if exists (
    select 1
    from public.pvp_chat_messages message
    where message.player_id = target_player_id
      and message.created_at > now() - interval '1 second'
  ) then
    raise exception 'Please wait before sending another message';
  end if;

  insert into public.pvp_chat_messages (room_id, player_id, message)
  values (target_room_id, target_player_id, normalized_message)
  returning id into created_message_id;

  return created_message_id;
end;
$$;

drop function if exists public.pvp_start_room(uuid);
drop function if exists public.pvp_start_room(uuid, jsonb);

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
    room_id, user_id, seat, nickname
  ) values (
    target_room.id, current_user_id, assigned_seat, trim(player_nickname)
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

create or replace function public.pvp_start_room(
  target_room_id uuid,
  pool_data jsonb
)
returns table (room_status text, room_phase text, phase_deadline timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_room public.pvp_rooms%rowtype;
  active_players integer;
  ready_players integer;
  next_deadline timestamptz;
  pool_entry record;
  stock_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;
  if target_room.host_user_id <> current_user_id then
    raise exception 'Only the room host can start the game';
  end if;
  if target_room.status <> 'waiting' or target_room.phase <> 'lobby' then
    raise exception 'Room has already started';
  end if;

  select
    count(*),
    count(*) filter (where player.ready)
  into active_players, ready_players
  from public.pvp_room_players player
  where player.room_id = target_room_id
    and player.status = 'active';

  if active_players < 2 then
    raise exception 'At least 2 players are required';
  end if;
  if ready_players <> active_players then
    raise exception 'Every player must be ready';
  end if;
  if pool_data is null or jsonb_typeof(pool_data) <> 'object' or pool_data = '{}'::jsonb then
    raise exception 'Invalid shared unit pool';
  end if;

  delete from public.pvp_unit_pool pool where pool.room_id = target_room_id;
  for pool_entry in select key as unit_name, value from jsonb_each_text(pool_data)
  loop
    stock_count := pool_entry.value::integer;
    if char_length(pool_entry.unit_name) < 1
      or char_length(pool_entry.unit_name) > 40
      or stock_count < 1
      or stock_count > 99 then
      raise exception 'Invalid shared unit pool entry';
    end if;
    insert into public.pvp_unit_pool (room_id, unit_name, initial_count, remaining_count)
    values (target_room_id, pool_entry.unit_name, stock_count, stock_count);
  end loop;

  next_deadline := case
    when target_room.mode = 'async'
      then now() + make_interval(mins => target_room.async_turn_minutes)
    else now() + interval '30 seconds'
  end;

  update public.pvp_rooms room
  set status = 'running',
      phase = 'pve',
      current_round = case when target_room.mode = 'realtime' then 1 else 0 end,
      phase_deadline = next_deadline,
      revision = room.revision + 1,
      started_at = now()
  where room.id = target_room_id;

  update public.pvp_room_players player
  set ready = player.is_bot,
      last_seen = now()
  where player.room_id = target_room_id
    and player.status = 'active';

  return query select 'running'::text, 'pve'::text, next_deadline;
end;
$$;

-- Realtime rooms run their opening PvE on the shared server clock. Async rooms
-- deliberately keep the independent four-round preparation flow above.
create or replace function public.pvp_report_realtime_pve_round(
  target_room_id uuid,
  completed_round integer,
  battle_result jsonb default '{}'::jsonb
)
returns table (
  room_phase text,
  room_round integer,
  phase_deadline timestamptz,
  ready_count bigint,
  active_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_room public.pvp_rooms%rowtype;
  target_player public.pvp_room_players%rowtype;
  counted_ready bigint;
  counted_active bigint;
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;
  if completed_round < 1 or completed_round > 4 then raise exception 'Invalid realtime PvE round'; end if;
  if jsonb_typeof(battle_result) <> 'object' then raise exception 'Invalid PvE battle result'; end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;
  if target_room.mode <> 'realtime' or target_room.status <> 'running' then
    raise exception 'Realtime PvE round is not accepting this result';
  end if;

  if (target_room.phase = 'pve' and target_room.current_round > completed_round)
    or (target_room.phase = 'planning' and completed_round = 4) then
    select count(*) filter (where player.ready), count(*)
    into counted_ready, counted_active
    from public.pvp_room_players player
    where player.room_id = target_room_id
      and player.status = 'active';
    return query select target_room.phase, target_room.current_round,
      target_room.phase_deadline, counted_ready, counted_active;
    return;
  end if;

  if target_room.phase <> 'pve' or target_room.current_round <> completed_round then
    raise exception 'Realtime PvE round is not accepting this result';
  end if;

  select player.* into target_player
  from public.pvp_room_players player
  where player.room_id = target_room_id
    and player.user_id = current_user_id
    and player.status = 'active'
    and not player.is_bot
  for update;

  if not found then raise exception 'Active human player membership not found'; end if;

  update public.pvp_room_players player
  set ready = true,
      last_seen = now(),
      updated_at = now()
  where player.id = target_player.id;

  select count(*) filter (where player.ready), count(*)
  into counted_ready, counted_active
  from public.pvp_room_players player
  where player.room_id = target_room_id
    and player.status = 'active';

  if counted_active > 1 and counted_ready = counted_active then
    update public.pvp_rooms room
    set current_round = completed_round + 1,
        phase_deadline = case
          when completed_round < 4 then now() + interval '20 seconds'
          else now() + interval '45 seconds'
        end,
        revision = room.revision + 1
    where room.id = target_room_id;

    update public.pvp_room_players player
    set ready = player.is_bot,
        updated_at = now()
    where player.room_id = target_room_id
      and player.status = 'active';
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id;

  return query select
    target_room.phase,
    target_room.current_round,
    target_room.phase_deadline,
    counted_ready,
    counted_active;
end;
$$;

create or replace function public.pvp_add_bot(
  target_room_id uuid,
  requested_difficulty text default 'normal'
)
returns table (player_id uuid, seat smallint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_room public.pvp_rooms%rowtype;
  assigned_seat smallint;
  created_player_id uuid;
  normalized_difficulty text := lower(coalesce(requested_difficulty, 'normal'));
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if normalized_difficulty not in ('normal', 'hard') then
    raise exception 'Unsupported bot difficulty';
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;
  if target_room.host_user_id <> current_user_id then
    raise exception 'Only the room host can add bots';
  end if;
  if target_room.status <> 'waiting' or target_room.phase <> 'lobby' then
    raise exception 'Bots can only be added in the lobby';
  end if;

  select candidate.seat into assigned_seat
  from generate_series(1, target_room.max_players) as candidate(seat)
  where not exists (
    select 1
    from public.pvp_room_players player
    where player.room_id = target_room_id
      and player.status = 'active'
      and player.seat = candidate.seat
  )
  order by candidate.seat
  limit 1;

  if assigned_seat is null then
    raise exception 'Room is full';
  end if;

  insert into public.pvp_room_players (
    room_id, user_id, seat, nickname, status, ready, is_bot, bot_difficulty
  ) values (
    target_room_id,
    gen_random_uuid(),
    assigned_seat,
    (array[
      '현우 봇', '혜진 봇', '수아 봇', '재키 봇',
      '아야 봇', '쇼우 봇', '레니 봇', '리다이린 봇'
    ])[assigned_seat],
    'active',
    true,
    true,
    normalized_difficulty
  )
  returning id into created_player_id;

  update public.pvp_rooms room
  set revision = room.revision + 1
  where room.id = target_room_id;

  return query select created_player_id, assigned_seat;
end;
$$;

-- Rename bots already created by older versions of this migration.
update public.pvp_room_players player
set nickname = (array[
  '현우 봇', '혜진 봇', '수아 봇', '재키 봇',
  '아야 봇', '쇼우 봇', '레니 봇', '리다이린 봇'
])[player.seat],
    updated_at = now()
where player.is_bot
  and player.nickname ~ '^(연습|정예) 봇 [0-9]+$';

create or replace function public.pvp_remove_bot(target_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_player public.pvp_room_players%rowtype;
  target_room public.pvp_rooms%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select player.* into target_player
  from public.pvp_room_players player
  where player.id = target_player_id
  for update;

  if not found or not target_player.is_bot then
    raise exception 'Bot not found';
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_player.room_id
  for update;

  if target_room.host_user_id <> current_user_id then
    raise exception 'Only the room host can remove bots';
  end if;
  if target_room.status <> 'waiting' or target_room.phase <> 'lobby' then
    raise exception 'Bots can only be removed in the lobby';
  end if;

  delete from public.pvp_room_players player
  where player.id = target_player_id;

  update public.pvp_rooms room
  set revision = room.revision + 1
  where room.id = target_player.room_id;
end;
$$;

create or replace function public.pvp_submit_pve_snapshot(
  target_room_id uuid,
  board_data jsonb,
  bench_data jsonb,
  augments_data jsonb,
  traits_data jsonb,
  economy_data jsonb,
  snapshot_checksum text default null
)
returns table (ready_count bigint, active_count bigint, room_phase text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_room public.pvp_rooms%rowtype;
  target_player public.pvp_room_players%rowtype;
  counted_ready bigint;
  counted_active bigint;
  next_phase text;
  desired_counts jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  perform public.pvp_validate_snapshot_payload(
    board_data, bench_data, augments_data, traits_data, economy_data
  );
  if jsonb_typeof(board_data) <> 'array'
    or jsonb_typeof(bench_data) <> 'array'
    or jsonb_typeof(augments_data) <> 'array'
    or jsonb_typeof(traits_data) <> 'object'
    or jsonb_typeof(economy_data) <> 'object' then
    raise exception 'Invalid PvE snapshot payload';
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;
  if target_room.status <> 'running' or target_room.phase <> 'pve' then
    raise exception 'Room is not accepting PvE snapshots';
  end if;
  if target_room.mode = 'realtime' and target_room.current_round <> 5 then
    raise exception 'Realtime room has not finished its opening PvE rounds';
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

  select player.* into target_player
  from public.pvp_room_players player
  where player.room_id = target_room_id
    and player.user_id = current_user_id
    and player.status = 'active'
    and not player.is_bot
  for update;

  if not found then
    raise exception 'Active human player membership not found';
  end if;

  perform public.pvp_set_player_holdings(target_player.id, desired_counts);

  insert into public.pvp_squad_snapshots (
    room_id, player_id, round, revision, board, bench, augments, traits, economy, checksum
  ) values (
    target_room_id,
    target_player.id,
    0,
    0,
    board_data,
    bench_data,
    augments_data,
    traits_data,
    economy_data,
    snapshot_checksum
  )
  on conflict (room_id, player_id, round) do update
  set revision = public.pvp_squad_snapshots.revision + 1,
      board = excluded.board,
      bench = excluded.bench,
      augments = excluded.augments,
      traits = excluded.traits,
      economy = excluded.economy,
      checksum = excluded.checksum,
      submitted_at = now();

  update public.pvp_room_players player
  set ready = true,
      credits = greatest(0, coalesce((economy_data ->> 'gold')::integer, player.credits)),
      level = greatest(1, least(20, coalesce((economy_data ->> 'level')::integer, player.level))),
      xp = greatest(0, coalesce((economy_data ->> 'xp')::integer, player.xp)),
      last_seen = now()
  where player.id = target_player.id;

  select count(*) filter (where player.ready), count(*)
  into counted_ready, counted_active
  from public.pvp_room_players player
  where player.room_id = target_room_id
    and player.status = 'active';

  next_phase := target_room.phase;
  if counted_active > 1 and counted_ready = counted_active then
    update public.pvp_rooms room
    set phase = 'planning',
        current_round = 1,
        phase_deadline = case
          when room.mode = 'async' then now() + make_interval(mins => room.async_turn_minutes)
          else now() + make_interval(secs => room.planning_seconds)
        end,
        revision = room.revision + 1
    where room.id = target_room_id;
    update public.pvp_room_players player
    set ready = player.is_bot,
        updated_at = now()
    where player.room_id = target_room_id
      and player.status = 'active';
    next_phase := 'planning';
  end if;

  return query select counted_ready, counted_active, next_phase;
end;
$$;

create or replace function public.pvp_submit_bot_snapshot(
  target_player_id uuid,
  board_data jsonb,
  bench_data jsonb,
  augments_data jsonb,
  traits_data jsonb,
  economy_data jsonb,
  snapshot_checksum text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_player public.pvp_room_players%rowtype;
  target_room public.pvp_rooms%rowtype;
  desired_counts jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  perform public.pvp_validate_snapshot_payload(
    board_data, bench_data, augments_data, traits_data, economy_data
  );
  if jsonb_typeof(board_data) <> 'array'
    or jsonb_typeof(bench_data) <> 'array'
    or jsonb_typeof(augments_data) <> 'array'
    or jsonb_typeof(traits_data) <> 'object'
    or jsonb_typeof(economy_data) <> 'object' then
    raise exception 'Invalid bot snapshot payload';
  end if;

  select player.* into target_player
  from public.pvp_room_players player
  where player.id = target_player_id
    and player.status = 'active'
    and player.is_bot
  for update;

  if not found then
    raise exception 'Active bot not found';
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_player.room_id
  for update;

  if target_room.host_user_id <> current_user_id then
    raise exception 'Only the room host can submit bot snapshots';
  end if;
  if target_room.status <> 'running' or target_room.phase <> 'pve' then
    raise exception 'Room is not accepting bot snapshots';
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

  perform public.pvp_set_player_holdings(target_player.id, desired_counts);

  insert into public.pvp_squad_snapshots (
    room_id, player_id, round, revision, board, bench, augments, traits, economy, checksum
  ) values (
    target_room.id,
    target_player.id,
    0,
    0,
    board_data,
    bench_data,
    augments_data,
    traits_data,
    economy_data,
    snapshot_checksum
  )
  on conflict (room_id, player_id, round) do update
  set revision = public.pvp_squad_snapshots.revision + 1,
      board = excluded.board,
      bench = excluded.bench,
      augments = excluded.augments,
      traits = excluded.traits,
      economy = excluded.economy,
      checksum = excluded.checksum,
      submitted_at = now();

  update public.pvp_room_players player
  set credits = greatest(0, coalesce((economy_data ->> 'gold')::integer, player.credits)),
      level = greatest(1, least(20, coalesce((economy_data ->> 'level')::integer, player.level))),
      xp = greatest(0, coalesce((economy_data ->> 'xp')::integer, player.xp)),
      ready = true,
      last_seen = now()
  where player.id = target_player.id;
end;
$$;

-- Saves a player's grown squad for the current PvP planning round.
create or replace function public.pvp_submit_round_snapshot(
  target_room_id uuid,
  board_data jsonb,
  bench_data jsonb,
  augments_data jsonb,
  traits_data jsonb,
  economy_data jsonb,
  snapshot_checksum text default null
)
returns table (ready_count bigint, active_count bigint, room_phase text, room_round integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_room public.pvp_rooms%rowtype;
  target_player public.pvp_room_players%rowtype;
  desired_counts jsonb;
  counted_ready bigint;
  counted_active bigint;
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;
  perform public.pvp_validate_snapshot_payload(
    board_data, bench_data, augments_data, traits_data, economy_data
  );
  if jsonb_typeof(board_data) <> 'array'
    or jsonb_typeof(bench_data) <> 'array'
    or jsonb_typeof(augments_data) <> 'array'
    or jsonb_typeof(traits_data) <> 'object'
    or jsonb_typeof(economy_data) <> 'object' then
    raise exception 'Invalid round snapshot payload';
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;
  if target_room.status <> 'running' or target_room.phase <> 'planning' or target_room.current_round < 1 then
    raise exception 'Room is not accepting round snapshots';
  end if;
  if target_room.phase_deadline is not null and target_room.phase_deadline <= now() then
    raise exception 'Planning deadline has expired';
  end if;

  select player.* into target_player
  from public.pvp_room_players player
  where player.room_id = target_room_id
    and player.user_id = current_user_id
    and player.status = 'active'
    and not player.is_bot
  for update;

  if not found then raise exception 'Active human player membership not found'; end if;

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

  perform public.pvp_set_player_holdings(target_player.id, desired_counts);

  insert into public.pvp_squad_snapshots (
    room_id, player_id, round, revision, board, bench, augments, traits, economy, checksum
  ) values (
    target_room.id,
    target_player.id,
    target_room.current_round,
    0,
    board_data,
    bench_data,
    augments_data,
    traits_data,
    economy_data,
    snapshot_checksum
  )
  on conflict (room_id, player_id, round) do update
  set revision = public.pvp_squad_snapshots.revision + 1,
      board = excluded.board,
      bench = excluded.bench,
      augments = excluded.augments,
      traits = excluded.traits,
      economy = excluded.economy,
      checksum = excluded.checksum,
      submitted_at = now();

  update public.pvp_room_players player
  set ready = true,
      credits = greatest(0, coalesce((economy_data ->> 'gold')::integer, player.credits)),
      level = greatest(1, least(20, coalesce((economy_data ->> 'level')::integer, player.level))),
      xp = greatest(0, coalesce((economy_data ->> 'xp')::integer, player.xp)),
      last_seen = now()
  where player.id = target_player.id;

  select count(*) filter (where player.ready), count(*)
  into counted_ready, counted_active
  from public.pvp_room_players player
  where player.room_id = target_room_id
    and player.status = 'active';

  return query select counted_ready, counted_active, target_room.phase, target_room.current_round;
end;
$$;

-- Saves the latest realtime lineup without locking the player. The planning
-- deadline promotes this draft to the confirmed round snapshot automatically.
create or replace function public.pvp_sync_realtime_snapshot(
  target_room_id uuid,
  board_data jsonb,
  bench_data jsonb,
  augments_data jsonb,
  traits_data jsonb,
  economy_data jsonb,
  snapshot_checksum text default null
)
returns table (room_round integer, phase_deadline timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_room public.pvp_rooms%rowtype;
  target_player public.pvp_room_players%rowtype;
  snapshot_round integer;
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;
  perform public.pvp_validate_snapshot_payload(
    board_data, bench_data, augments_data, traits_data, economy_data
  );
  if jsonb_typeof(board_data) <> 'array'
    or jsonb_typeof(bench_data) <> 'array'
    or jsonb_typeof(augments_data) <> 'array'
    or jsonb_typeof(traits_data) <> 'object'
    or jsonb_typeof(economy_data) <> 'object' then
    raise exception 'Invalid realtime snapshot payload';
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;
  if target_room.status <> 'running'
    or target_room.mode <> 'realtime'
    or target_room.phase not in ('pve', 'planning')
    or target_room.current_round < 1 then
    raise exception 'Room is not accepting realtime snapshots';
  end if;
  if target_room.phase = 'planning'
    and target_room.phase_deadline is not null
    and target_room.phase_deadline <= now() then
    raise exception 'Planning deadline has expired';
  end if;
  snapshot_round := case when target_room.phase = 'pve' then 0 else target_room.current_round end;

  select player.* into target_player
  from public.pvp_room_players player
  where player.room_id = target_room_id
    and player.user_id = current_user_id
    and player.status = 'active'
    and not player.is_bot
  for update;

  if not found then raise exception 'Active human player membership not found'; end if;

  insert into public.pvp_squad_snapshots (
    room_id, player_id, round, revision, board, bench, augments, traits, economy, checksum
  ) values (
    target_room.id, target_player.id, snapshot_round, 0,
    board_data, bench_data, augments_data, traits_data, economy_data, snapshot_checksum
  )
  on conflict (room_id, player_id, round) do update
  set revision = public.pvp_squad_snapshots.revision + 1,
      board = excluded.board,
      bench = excluded.bench,
      augments = excluded.augments,
      traits = excluded.traits,
      economy = excluded.economy,
      checksum = excluded.checksum,
      submitted_at = now();

  update public.pvp_room_players player
  set credits = greatest(0, coalesce((economy_data ->> 'gold')::integer, player.credits)),
      level = greatest(1, least(20, coalesce((economy_data ->> 'level')::integer, player.level))),
      xp = greatest(0, coalesce((economy_data ->> 'xp')::integer, player.xp)),
      last_seen = now()
  where player.id = target_player.id;

  return query select target_room.current_round, target_room.phase_deadline;
end;
$$;

create or replace function public.pvp_leave_room(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_room public.pvp_rooms%rowtype;
  next_host uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;
  if target_room.status <> 'waiting' or target_room.phase <> 'lobby' then
    raise exception 'A running room cannot be left through the lobby';
  end if;

  update public.pvp_room_players player
  set status = 'left',
      ready = false,
      last_seen = now()
  where player.room_id = target_room_id
    and player.user_id = current_user_id
    and player.status = 'active';

  if not found then
    raise exception 'Active room membership not found';
  end if;

  if target_room.host_user_id = current_user_id then
    select player.user_id into next_host
    from public.pvp_room_players player
    where player.room_id = target_room_id
      and player.status = 'active'
    order by player.seat
    limit 1;

    if next_host is null then
      update public.pvp_rooms room
      set status = 'abandoned',
          finished_at = now(),
          revision = room.revision + 1
      where room.id = target_room_id;
    else
      update public.pvp_rooms room
      set host_user_id = next_host,
          revision = room.revision + 1
      where room.id = target_room_id;
    end if;
  end if;
end;
$$;

revoke all on function public.pvp_start_room(uuid, jsonb) from public;
revoke all on function public.pvp_join_room(text, text) from public;
revoke all on function public.pvp_leave_room(uuid) from public;
revoke all on function public.pvp_add_bot(uuid, text) from public;
revoke all on function public.pvp_remove_bot(uuid) from public;
revoke all on function public.pvp_submit_pve_snapshot(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text) from public;
revoke all on function public.pvp_submit_bot_snapshot(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text) from public;
revoke all on function public.pvp_submit_round_snapshot(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text) from public;
revoke all on function public.pvp_sync_realtime_snapshot(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text) from public;
revoke all on function public.pvp_send_chat_message(uuid, text) from public;

grant execute on function public.pvp_start_room(uuid, jsonb) to authenticated;
grant execute on function public.pvp_join_room(text, text) to authenticated;
grant execute on function public.pvp_leave_room(uuid) to authenticated;
grant execute on function public.pvp_add_bot(uuid, text) to authenticated;
grant execute on function public.pvp_remove_bot(uuid) to authenticated;
grant execute on function public.pvp_submit_pve_snapshot(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text) to authenticated;
revoke all on function public.pvp_report_realtime_pve_round(uuid, integer, jsonb) from public;
grant execute on function public.pvp_report_realtime_pve_round(uuid, integer, jsonb) to authenticated;
grant execute on function public.pvp_submit_bot_snapshot(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text) to authenticated;
grant execute on function public.pvp_submit_round_snapshot(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text) to authenticated;
grant execute on function public.pvp_sync_realtime_snapshot(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text) to authenticated;
grant execute on function public.pvp_send_chat_message(uuid, text) to authenticated;

-- Applies the same passive combat XP used by connected clients to a persisted
-- economy snapshot. This keeps asynchronous auto-submissions from losing XP.
create or replace function public.pvp_add_natural_xp(
  economy_data jsonb,
  xp_amount integer default 2
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  result jsonb := coalesce(economy_data, '{}'::jsonb);
  current_level integer := greatest(1, least(10, coalesce((result ->> 'level')::integer, 1)));
  current_xp integer := greatest(0, coalesce((result ->> 'xp')::integer, 0)) + greatest(0, xp_amount);
  required_xp integer;
begin
  while current_level < 10 loop
    required_xp := case current_level
      when 1 then 2
      when 2 then 6
      when 3 then 10
      when 4 then 20
      when 5 then 36
      when 6 then 48
      when 7 then 56
      when 8 then 68
      when 9 then 80
      else 0
    end;
    exit when required_xp <= 0 or current_xp < required_xp;
    current_xp := current_xp - required_xp;
    current_level := current_level + 1;
  end loop;
  result := jsonb_set(result, '{level}', to_jsonb(current_level), true);
  result := jsonb_set(result, '{xp}', to_jsonb(case when current_level >= 10 then 0 else current_xp end), true);
  return result;
end;
$$;

revoke all on function public.pvp_add_natural_xp(jsonb, integer) from public;

-- Carries forward the last confirmed squad when a planning deadline expires.
-- Any connected room member can wake the room, so asynchronous games do not
-- depend on the host remaining online.
create or replace function public.pvp_tick_room(target_room_id uuid)
returns table (
  room_status text,
  room_phase text,
  room_round integer,
  phase_deadline timestamptz,
  auto_ready_count integer,
  caller_ready boolean,
  caller_auto_readied boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  scheduler_call boolean := coalesce(current_setting('app.pvp_scheduler', true), '') = 'on';
  target_room public.pvp_rooms%rowtype;
  caller public.pvp_room_players%rowtype;
  target_player public.pvp_room_players%rowtype;
  latest_snapshot public.pvp_squad_snapshots%rowtype;
  carried_economy jsonb;
  auto_count integer := 0;
  did_auto_ready boolean := false;
  counted_ready bigint;
  counted_active bigint;
begin
  if current_user_id is null and not scheduler_call then
    raise exception 'Authentication is required';
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;

  if not scheduler_call then
    select player.* into caller
    from public.pvp_room_players player
    where player.room_id = target_room_id
      and player.user_id = current_user_id
      and player.status <> 'left'
      and not player.is_bot;

    if not found then raise exception 'PvP room membership not found'; end if;
  end if;

  -- A disconnected realtime client must not hold the opening PvE forever.
  -- Clients get twenty seconds after the shared start deadline to report.
  if target_room.status = 'running'
    and target_room.mode = 'realtime'
    and target_room.phase = 'pve'
    and target_room.current_round between 1 and 4
    and target_room.phase_deadline is not null
    and target_room.phase_deadline + interval '20 seconds' <= now() then
    if not scheduler_call and not caller.ready then did_auto_ready := true; end if;

    update public.pvp_room_players player
    set ready = true,
        updated_at = now()
    where player.room_id = target_room_id
      and player.status = 'active'
      and not player.is_bot
      and not player.ready;
    get diagnostics auto_count = row_count;

    select count(*) filter (where player.ready), count(*)
    into counted_ready, counted_active
    from public.pvp_room_players player
    where player.room_id = target_room_id
      and player.status = 'active';

    if counted_active > 1 and counted_ready = counted_active then
      update public.pvp_rooms room
      set current_round = target_room.current_round + 1,
          phase_deadline = case
            when target_room.current_round < 4 then now() + interval '20 seconds'
            else now() + interval '45 seconds'
          end,
          revision = room.revision + 1
      where room.id = target_room_id;

      update public.pvp_room_players player
      set ready = player.is_bot,
          updated_at = now()
      where player.room_id = target_room_id
        and player.status = 'active';
    end if;
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id;

  -- At the first augment deadline, promote each player's latest opening draft.
  -- Missing drafts become an empty squad instead of freezing the entire room.
  if target_room.status = 'running'
    and target_room.mode = 'realtime'
    and target_room.phase = 'pve'
    and target_room.current_round = 5
    and target_room.phase_deadline is not null
    and target_room.phase_deadline <= now() then
    for target_player in
      select player.*
      from public.pvp_room_players player
      where player.room_id = target_room_id
        and player.status = 'active'
        and not player.is_bot
        and not player.ready
      order by player.seat
      for update
    loop
      if not exists (
        select 1 from public.pvp_squad_snapshots snapshot
        where snapshot.room_id = target_room_id
          and snapshot.player_id = target_player.id
          and snapshot.round = 0
      ) then
        insert into public.pvp_squad_snapshots (
          room_id, player_id, round, revision, board, bench, augments, traits, economy
        ) values (
          target_room_id, target_player.id, 0, 0, '[]'::jsonb, '[]'::jsonb,
          '[]'::jsonb, '{}'::jsonb,
          jsonb_build_object('hp', target_player.health, 'gold', target_player.credits,
            'level', target_player.level, 'xp', target_player.xp, 'round', 0)
        );
      end if;

      update public.pvp_room_players player
      set ready = true,
          updated_at = now()
      where player.id = target_player.id;
      auto_count := auto_count + 1;
      if not scheduler_call and target_player.id = caller.id then did_auto_ready := true; end if;
    end loop;

    select count(*) filter (where player.ready), count(*)
    into counted_ready, counted_active
    from public.pvp_room_players player
    where player.room_id = target_room_id
      and player.status = 'active';

    if counted_active > 1 and counted_ready = counted_active then
      update public.pvp_rooms room
      set phase = 'planning',
          current_round = 1,
          phase_deadline = now() + make_interval(secs => room.planning_seconds),
          revision = room.revision + 1
      where room.id = target_room_id;

      update public.pvp_room_players player
      set ready = player.is_bot,
          updated_at = now()
      where player.room_id = target_room_id
        and player.status = 'active';
    end if;
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id;

  if target_room.status = 'running'
    and target_room.phase = 'planning'
    and target_room.current_round >= 1
    and target_room.phase_deadline is not null
    and target_room.phase_deadline <= now() then
    for target_player in
      select player.*
      from public.pvp_room_players player
      where player.room_id = target_room_id
        and player.status = 'active'
        and not player.is_bot
        and not player.ready
      order by player.seat
      for update
    loop
      select snapshot.* into latest_snapshot
      from public.pvp_squad_snapshots snapshot
      where snapshot.room_id = target_room_id
        and snapshot.player_id = target_player.id
        and snapshot.round <= target_room.current_round
      order by
        case when target_room.mode = 'realtime' and snapshot.round = target_room.current_round then 0 else 1 end,
        snapshot.round desc,
        snapshot.submitted_at desc
      limit 1;

      if found then
        carried_economy := jsonb_set(
          public.pvp_add_natural_xp(coalesce(latest_snapshot.economy, '{}'::jsonb), 2),
          '{round}',
          to_jsonb(target_room.current_round),
          true
        );

        insert into public.pvp_squad_snapshots (
          room_id, player_id, round, revision, board, bench, augments, traits,
          economy, shop, checksum
        ) values (
          target_room_id,
          target_player.id,
          target_room.current_round,
          0,
          latest_snapshot.board,
          latest_snapshot.bench,
          latest_snapshot.augments,
          latest_snapshot.traits,
          carried_economy,
          latest_snapshot.shop,
          null
        ) on conflict (room_id, player_id, round) do update
        set board = excluded.board,
            bench = excluded.bench,
            augments = excluded.augments,
            traits = excluded.traits,
            economy = excluded.economy,
            shop = excluded.shop,
            submitted_at = now();

        update public.pvp_room_players player
        set ready = true,
            updated_at = now()
        where player.id = target_player.id
          and not player.ready;

        if found then
          auto_count := auto_count + 1;
          if not scheduler_call and target_player.id = caller.id then did_auto_ready := true; end if;
        end if;
      end if;
    end loop;
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id;

  return query
  select
    target_room.status,
    target_room.phase,
    target_room.current_round,
    target_room.phase_deadline,
    auto_count,
    coalesce((
      select player.ready
      from public.pvp_room_players player
      where player.id = caller.id
    ), false),
    did_auto_ready;
end;
$$;

revoke all on function public.pvp_tick_room(uuid) from public;
grant execute on function public.pvp_tick_room(uuid) to authenticated;

-- Used only for bot-vs-bot matches. Human matches use the combat simulator.
create or replace function public.pvp_snapshot_power(
  board_data jsonb,
  augments_data jsonb,
  traits_data jsonb
)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  with unit_power as (
    select coalesce(sum(
      (8 + greatest(1, least(5, coalesce((unit ->> 'cost')::integer, 1))) * 5)
      * case greatest(1, least(3, coalesce((unit ->> 'tier')::integer, 1)))
          when 3 then 2.55 when 2 then 1.65 else 1 end
      * case when coalesce((unit ->> 'fourStarAscended')::boolean, false) then 1.6 else 1 end
    ), 0) as value
    from jsonb_array_elements(coalesce(board_data, '[]'::jsonb)) unit
  )
  select round(
    unit_power.value
    * (1 + least(0.30, jsonb_array_length(coalesce(augments_data, '[]'::jsonb)) * 0.08))
    * (1 + least(0.24, coalesce((select sum(value::numeric) from jsonb_each_text(coalesce(traits_data, '{}'::jsonb))), 0) * 0.01)),
    3
  )
  from unit_power;
$$;

revoke all on function public.pvp_snapshot_power(jsonb, jsonb, jsonb) from public;

-- Creates the current round pairings once and returns the caller's match.
create or replace function public.pvp_prepare_round(target_room_id uuid)
returns table (
  match_id uuid,
  match_round integer,
  match_seed text,
  match_status text,
  home_player_id uuid,
  away_player_id uuid,
  opponent_player_id uuid,
  opponent_nickname text,
  reporter_is_home boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  scheduler_call boolean := coalesce(current_setting('app.pvp_scheduler', true), '') = 'on';
  target_room public.pvp_rooms%rowtype;
  caller public.pvp_room_players%rowtype;
  player_ids uuid[];
  rotated_player_ids uuid[];
  home_id uuid;
  away_id uuid;
  pair_no integer;
  bot_home boolean;
  bot_away boolean;
  home_power numeric;
  away_power numeric;
  bot_winner uuid;
  bot_loser uuid;
  slot_position integer;
  active_count integer;
  ready_count integer;
  player_count integer;
  rotation_offset integer;
  source_position integer;
  rotation_index integer;
begin
  if current_user_id is null and not scheduler_call then
    raise exception 'Authentication is required';
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;
  if target_room.status <> 'running' or target_room.phase not in ('planning', 'combat', 'result') then
    raise exception 'PvP round is not ready';
  end if;

  if not scheduler_call then
    select player.* into caller
    from public.pvp_room_players player
    where player.room_id = target_room_id
      and player.user_id = current_user_id
      and player.status = 'active'
      and not player.is_bot;

    if not found then raise exception 'Active human player membership not found'; end if;
  end if;

  select count(*), count(*) filter (where player.ready)
  into active_count, ready_count
  from public.pvp_room_players player
  where player.room_id = target_room_id
    and player.status = 'active';

  if active_count < 2 or ready_count <> active_count then
    return;
  end if;

  if not exists (
    select 1 from public.pvp_matches match
    where match.room_id = target_room_id and match.round = target_room.current_round
  ) then
    select array_agg(player.id order by player.seat) into player_ids
    from public.pvp_room_players player
    where player.room_id = target_room_id and player.status = 'active';

    player_count := coalesce(array_length(player_ids, 1), 0);
    if player_count % 2 = 1 then
      player_ids := array_append(player_ids, null::uuid);
      player_count := player_count + 1;
    end if;
    if player_count > 2 then
      rotation_offset := (target_room.current_round - 1) % (player_count - 1);
      rotated_player_ids := array[player_ids[1]];
      for rotation_index in 0..player_count - 2 loop
        source_position := 2 + ((rotation_index + rotation_offset) % (player_count - 1));
        rotated_player_ids := array_append(rotated_player_ids, player_ids[source_position]);
      end loop;
      player_ids := rotated_player_ids;
    end if;

    for pair_no in 0..greatest(0, player_count / 2 - 1) loop
      home_id := player_ids[pair_no + 1];
      away_id := player_ids[player_count - pair_no];
      if home_id is null then
        home_id := away_id;
        away_id := null;
      end if;

      insert into public.pvp_matches (
        room_id, round, pair_index, home_player_id, away_player_id, seed,
        status, winner_player_id
      ) values (
        target_room_id,
        target_room.current_round,
        pair_no,
        home_id,
        away_id,
        target_room.seed || ':round:' || target_room.current_round || ':pair:' || pair_no,
        case when away_id is null then 'finished' else 'scheduled' end,
        case when away_id is null then home_id else null end
      ) on conflict (room_id, round, pair_index) do nothing;

      if away_id is not null then
        select player.is_bot into bot_home from public.pvp_room_players player where player.id = home_id;
        select player.is_bot into bot_away from public.pvp_room_players player where player.id = away_id;
        if bot_home and bot_away then
          select public.pvp_snapshot_power(
            latest_snapshot.board, latest_snapshot.augments, latest_snapshot.traits
          ) into home_power
          from (
            select snapshot.board, snapshot.augments, snapshot.traits
            from public.pvp_squad_snapshots snapshot
            where snapshot.room_id = target_room_id and snapshot.player_id = home_id
            order by snapshot.round desc, snapshot.submitted_at desc
            limit 1
          ) latest_snapshot;

          select public.pvp_snapshot_power(
            latest_snapshot.board, latest_snapshot.augments, latest_snapshot.traits
          ) into away_power
          from (
            select snapshot.board, snapshot.augments, snapshot.traits
            from public.pvp_squad_snapshots snapshot
            where snapshot.room_id = target_room_id and snapshot.player_id = away_id
            order by snapshot.round desc, snapshot.submitted_at desc
            limit 1
          ) latest_snapshot;

          if coalesce(home_power, 0) >= coalesce(away_power, 0) then
            bot_winner := home_id; bot_loser := away_id;
          else
            bot_winner := away_id; bot_loser := home_id;
          end if;

          update public.pvp_matches match
          set status = 'finished', winner_player_id = bot_winner,
              home_damage = case when bot_loser = home_id then
                greatest(2, least(15, 2 + target_room.current_round / 5
                  + ceil(abs(home_power - away_power) / greatest(20, least(home_power, away_power)))::integer)) else 0 end,
              away_damage = case when bot_loser = away_id then
                greatest(2, least(15, 2 + target_room.current_round / 5
                  + ceil(abs(home_power - away_power) / greatest(20, least(home_power, away_power)))::integer)) else 0 end,
              result = jsonb_build_object(
                'autoResolved', true,
                'homePower', home_power,
                'awayPower', away_power,
                'method', 'snapshot-power-v2'
              ), updated_at = now()
          where match.room_id = target_room_id
            and match.round = target_room.current_round
            and match.pair_index = pair_no;

          update public.pvp_room_players player
          set health = greatest(0, player.health - greatest(2, least(15,
                2 + target_room.current_round / 5
                + ceil(abs(home_power - away_power) / greatest(20, least(home_power, away_power)))::integer))),
              status = case when player.health - greatest(2, least(15,
                2 + target_room.current_round / 5
                + ceil(abs(home_power - away_power) / greatest(20, least(home_power, away_power)))::integer)) <= 0
                then 'eliminated' else player.status end
          where player.id = bot_loser;

          if exists (
            select 1 from public.pvp_room_players player
            where player.id = bot_loser and player.status = 'eliminated'
          ) then
            perform public.pvp_release_player_holdings(bot_loser);
          end if;
        end if;
      end if;
    end loop;

    update public.pvp_rooms room
    set phase = 'combat',
        phase_deadline = case
          when room.mode = 'async' then now() + make_interval(mins => room.async_turn_minutes)
          else now() + interval '45 seconds'
        end,
        revision = room.revision + 1
    where room.id = target_room_id;
  end if;

  return query
  select
    match.id,
    match.round,
    match.seed,
    match.status,
    match.home_player_id,
    match.away_player_id,
    case when match.home_player_id = caller.id then match.away_player_id else match.home_player_id end,
    opponent.nickname,
    match.home_player_id = caller.id
  from public.pvp_matches match
  left join public.pvp_room_players opponent
    on opponent.id = case when match.home_player_id = caller.id then match.away_player_id else match.home_player_id end
  where match.room_id = target_room_id
    and match.round = target_room.current_round
    and caller.id in (match.home_player_id, match.away_player_id)
  limit 1;
end;
$$;

-- Asynchronous rooms advance as soon as the final active player submits.
-- Realtime rooms continue to advance only when their planning timer expires.
create or replace function public.pvp_auto_prepare_async_round()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_room public.pvp_rooms%rowtype;
  active_count integer;
  ready_count integer;
begin
  if not new.ready or (tg_op = 'UPDATE' and old.ready) then
    return new;
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = new.room_id;

  if not found
    or target_room.mode <> 'async'
    or target_room.status <> 'running'
    or target_room.phase <> 'planning' then
    return new;
  end if;

  select count(*), count(*) filter (where player.ready)
  into active_count, ready_count
  from public.pvp_room_players player
  where player.room_id = new.room_id
    and player.status = 'active';

  if active_count > 1 and ready_count = active_count then
    perform public.pvp_prepare_round(new.room_id);
  end if;
  return new;
end;
$$;

revoke all on function public.pvp_auto_prepare_async_round() from public;

drop trigger if exists pvp_auto_prepare_async_round_trigger on public.pvp_room_players;
create trigger pvp_auto_prepare_async_round_trigger
after update of ready on public.pvp_room_players
for each row
execute function public.pvp_auto_prepare_async_round();

drop function if exists public.pvp_report_match(uuid, boolean, integer, jsonb);

-- Grows deterministic bot squads between PvP rounds without requiring a connected host.
create or replace function public.pvp_grow_bot_snapshot(
  latest_board jsonb,
  latest_augments jsonb,
  latest_traits jsonb,
  latest_economy jsonb,
  bot_difficulty text,
  target_round integer
)
returns table (
  board_data jsonb,
  augments_data jsonb,
  traits_data jsonb,
  economy_data jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  plan jsonb;
  augment_plan jsonb;
  plan_count integer;
  initial_count integer;
  progression_level integer;
  deployed_count integer;
  tier_two_count integer;
  tier_three_count integer;
  difficulty_bonus integer := case when bot_difficulty = 'hard' then 2 else 0 end;
  unit_data jsonb;
  initial_tier integer;
  grown_tier integer;
  initial_copies integer;
  grown_copies integer;
  exempt_copies integer;
  augment_count integer;
  unit_index integer;
begin
  plan := case
    when jsonb_typeof(latest_economy -> 'botPlan') = 'array'
      and jsonb_array_length(latest_economy -> 'botPlan') > 0
      then latest_economy -> 'botPlan'
    else coalesce(latest_board, '[]'::jsonb)
  end;
  plan_count := jsonb_array_length(plan);
  initial_count := greatest(1, least(plan_count, coalesce((latest_economy ->> 'botInitialBoardCount')::integer, jsonb_array_length(latest_board))));
  progression_level := case
    when target_round <= 7 then 3
    when target_round <= 13 then 4
    when target_round <= 21 then 5
    when target_round <= 29 then 6
    when target_round <= 37 then 7
    else 8
  end;
  deployed_count := least(plan_count, greatest(initial_count, progression_level));
  tier_two_count := least(deployed_count, greatest(0, target_round + difficulty_bonus) / 4);
  tier_three_count := case
    when target_round + difficulty_bonus >= 20
      then least(deployed_count, 1 + greatest(0, target_round + difficulty_bonus - 20) / 8)
    else 0
  end;

  board_data := '[]'::jsonb;
  if deployed_count > 0 then
    for unit_index in 0..deployed_count - 1 loop
      unit_data := plan -> unit_index;
      initial_tier := greatest(1, least(3, coalesce((unit_data ->> 'tier')::integer, 1)));
      grown_tier := case
        when unit_index < tier_three_count then 3
        when unit_index < tier_two_count then greatest(initial_tier, 2)
        else initial_tier
      end;
      initial_copies := case
        when unit_index >= initial_count then 0
        when initial_tier = 3 then 9
        when initial_tier = 2 then 3
        else 1
      end;
      grown_copies := case when grown_tier = 3 then 9 when grown_tier = 2 then 3 else 1 end;
      -- Preserve genuine grant exemptions, but bot growth itself must claim
      -- every additional copy from the shared room pool.
      exempt_copies := greatest(0, coalesce((unit_data ->> 'poolExemptCopies')::integer, 0));
      unit_data := jsonb_set(unit_data, '{source}', '"board"'::jsonb, true);
      unit_data := jsonb_set(unit_data, '{index}', to_jsonb(unit_index), true);
      unit_data := jsonb_set(unit_data, '{tier}', to_jsonb(grown_tier), true);
      unit_data := jsonb_set(unit_data, '{poolExemptCopies}', to_jsonb(exempt_copies), true);
      board_data := board_data || jsonb_build_array(unit_data);
    end loop;
  end if;

  select coalesce(jsonb_object_agg(counted.trait_name, counted.unit_count), '{}'::jsonb)
  into traits_data
  from (
    select trait_name, count(distinct unit ->> 'name')::integer as unit_count
    from jsonb_array_elements(board_data) unit
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(unit -> 'traits') = 'array' then unit -> 'traits'
        else jsonb_build_array(unit ->> 'trait')
      end
    ) as expanded(trait_name)
    where nullif(trait_name, '') is not null
    group by trait_name
  ) counted;

  augment_plan := case
    when jsonb_typeof(latest_economy -> 'botAugmentPlan') = 'array'
      and jsonb_array_length(latest_economy -> 'botAugmentPlan') > 0
      then latest_economy -> 'botAugmentPlan'
    else coalesce(latest_augments, '[]'::jsonb)
  end;
  augment_count := least(jsonb_array_length(augment_plan), 1
    + case when target_round > 10 then 1 else 0 end
    + case when target_round > 20 then 1 else 0 end);
  augments_data := case
    when augment_count <= 0 then '[]'::jsonb
    else (
      select coalesce(jsonb_agg(value order by ordinal), '[]'::jsonb)
      from jsonb_array_elements(augment_plan) with ordinality planned(value, ordinal)
      where ordinal <= augment_count
    )
  end;

  economy_data := jsonb_set(coalesce(latest_economy, '{}'::jsonb), '{round}', to_jsonb(target_round), true);
  economy_data := jsonb_set(economy_data, '{level}', to_jsonb(greatest(initial_count, progression_level)), true);
  return next;
end;
$$;

revoke all on function public.pvp_grow_bot_snapshot(jsonb, jsonb, jsonb, jsonb, text, integer) from public;

-- Claims copies for grown bot snapshots. When stock is unavailable, only that
-- bot keeps its previous squad; the whole round remains playable.
create or replace function public.pvp_reconcile_bot_growth(
  target_room_id uuid,
  target_round integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_bot public.pvp_room_players%rowtype;
  current_snapshot public.pvp_squad_snapshots%rowtype;
  previous_snapshot public.pvp_squad_snapshots%rowtype;
  desired_counts jsonb;
begin
  for target_bot in
    select player.*
    from public.pvp_room_players player
    where player.room_id = target_room_id
      and player.status = 'active'
      and player.is_bot
    order by player.seat
  loop
    select snapshot.* into current_snapshot
    from public.pvp_squad_snapshots snapshot
    where snapshot.room_id = target_room_id
      and snapshot.player_id = target_bot.id
      and snapshot.round = target_round
    order by snapshot.submitted_at desc
    limit 1;
    if not found then continue; end if;

    select coalesce(jsonb_object_agg(counted.unit_name, counted.copy_count), '{}'::jsonb)
    into desired_counts
    from (
      select unit ->> 'name' as unit_name,
        sum(greatest(0,
          case greatest(1, least(3, coalesce((unit ->> 'tier')::integer, 1)))
            when 3 then 9 when 2 then 3 else 1 end
          - greatest(0, coalesce((unit ->> 'poolExemptCopies')::integer, 0))
        ))::integer as copy_count
      from jsonb_array_elements(current_snapshot.board || current_snapshot.bench) unit
      where nullif(unit ->> 'name', '') is not null
      group by unit ->> 'name'
    ) counted;

    begin
      perform public.pvp_set_player_holdings(target_bot.id, desired_counts);
    exception when others then
      select snapshot.* into previous_snapshot
      from public.pvp_squad_snapshots snapshot
      where snapshot.room_id = target_room_id
        and snapshot.player_id = target_bot.id
        and snapshot.round < target_round
      order by snapshot.round desc, snapshot.submitted_at desc
      limit 1;

      if found then
        update public.pvp_squad_snapshots snapshot
        set board = previous_snapshot.board,
            bench = previous_snapshot.bench,
            augments = previous_snapshot.augments,
            traits = previous_snapshot.traits,
            economy = jsonb_set(previous_snapshot.economy, '{round}', to_jsonb(target_round), true),
            shop = previous_snapshot.shop,
            checksum = previous_snapshot.checksum,
            submitted_at = now()
        where snapshot.id = current_snapshot.id;
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.pvp_reconcile_bot_growth(uuid, integer) from public;

-- Performs the single round transition shared by client reports and scheduled
-- fallback resolution. The room lock makes repeated calls idempotent.
create or replace function public.pvp_advance_completed_round(
  target_room_id uuid,
  completed_round integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_room public.pvp_rooms%rowtype;
  active_players integer;
  next_round integer;
begin
  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id
  for update;

  if not found
    or target_room.status <> 'running'
    or target_room.phase <> 'combat'
    or target_room.current_round <> completed_round then
    return;
  end if;
  if exists (
    select 1 from public.pvp_matches match
    where match.room_id = target_room_id
      and match.round = completed_round
      and match.status <> 'finished'
  ) then
    return;
  end if;

  select count(*) into active_players
  from public.pvp_room_players player
  where player.room_id = target_room_id
    and player.status = 'active';

  if active_players <= 1 then
    update public.pvp_rooms room
    set status = 'finished',
        phase = 'finished',
        phase_deadline = null,
        finished_at = now(),
        revision = room.revision + 1
    where room.id = target_room_id;
    return;
  end if;

  update public.pvp_rooms room
  set phase = 'planning',
      current_round = room.current_round + 1,
      phase_deadline = case
        when room.mode = 'async' then now() + make_interval(mins => room.async_turn_minutes)
        else now() + make_interval(secs => room.planning_seconds)
      end,
      revision = room.revision + 1
  where room.id = target_room_id
  returning room.current_round into next_round;

  update public.pvp_room_players player
  set ready = player.is_bot,
      last_seen = now()
  where player.room_id = target_room_id
    and player.status = 'active';

  insert into public.pvp_squad_snapshots (
    room_id, player_id, round, revision, board, bench, augments, traits, economy, shop, checksum
  )
  select
    target_room_id,
    player.id,
    next_round,
    0,
    grown.board_data,
    '[]'::jsonb,
    grown.augments_data,
    grown.traits_data,
    grown.economy_data,
    latest.shop,
    null
  from public.pvp_room_players player
  join lateral (
    select snapshot.*
    from public.pvp_squad_snapshots snapshot
    where snapshot.room_id = target_room_id
      and snapshot.player_id = player.id
    order by snapshot.round desc, snapshot.submitted_at desc
    limit 1
  ) latest on true
  join lateral public.pvp_grow_bot_snapshot(
    latest.board,
    latest.augments,
    latest.traits,
    latest.economy,
    player.bot_difficulty,
    next_round
  ) grown on true
  where player.room_id = target_room_id
    and player.status = 'active'
    and player.is_bot
  on conflict (room_id, player_id, round) do nothing;

  perform public.pvp_reconcile_bot_growth(target_room_id, next_round);

  update public.pvp_room_players player
  set level = coalesce((snapshot.economy ->> 'level')::integer, player.level),
      last_seen = now(),
      updated_at = now()
  from public.pvp_squad_snapshots snapshot
  where snapshot.room_id = target_room_id
    and snapshot.player_id = player.id
    and snapshot.round = next_round
    and player.room_id = target_room_id
    and player.status = 'active'
    and player.is_bot;
end;
$$;

revoke all on function public.pvp_advance_completed_round(uuid, integer) from public;

-- Confirms human matches from both client reports. Bot matches need one report;
-- disagreements fall back to the deterministic snapshot-power resolver.
create or replace function public.pvp_report_match(
  target_match_id uuid,
  reporter_won boolean,
  reporter_damage integer,
  battle_result jsonb default '{}'::jsonb
)
returns table (
  match_status text,
  winner_player_id uuid,
  room_phase text,
  room_round integer,
  reporter_health integer,
  opponent_health integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_match public.pvp_matches%rowtype;
  reporter public.pvp_room_players%rowtype;
  opponent_report public.pvp_match_reports%rowtype;
  opponent_id uuid;
  opponent_is_bot boolean := false;
  resolved_winner uuid;
  resolved_loser uuid;
  applied_damage integer := greatest(1, least(30, coalesce(reporter_damage, 1)));
  current_phase text;
  current_round integer;
  active_players integer;
  home_power numeric;
  away_power numeric;
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;
  if jsonb_typeof(battle_result) <> 'object' then raise exception 'Invalid battle result'; end if;

  select match.* into target_match
  from public.pvp_matches match
  where match.id = target_match_id
  for update;

  if not found then raise exception 'Match not found'; end if;

  select player.* into reporter
  from public.pvp_room_players player
  where player.room_id = target_match.room_id
    and player.user_id = current_user_id
    and player.id in (target_match.home_player_id, target_match.away_player_id)
    and not player.is_bot;

  if not found then raise exception 'Match participant not found'; end if;
  opponent_id := case when reporter.id = target_match.home_player_id then target_match.away_player_id else target_match.home_player_id end;

  resolved_winner := case when reporter_won then reporter.id else opponent_id end;
  resolved_loser := case when reporter_won then opponent_id else reporter.id end;

  insert into public.pvp_match_reports (
    match_id, player_id, reported_winner_player_id, damage, result
  ) values (
    target_match.id, reporter.id, resolved_winner, applied_damage, battle_result
  )
  on conflict (match_id, player_id) do update
  set reported_winner_player_id = excluded.reported_winner_player_id,
      damage = excluded.damage,
      result = excluded.result,
      updated_at = now();

  select coalesce(player.is_bot, false) into opponent_is_bot
  from public.pvp_room_players player
  where player.id = opponent_id;

  if target_match.status <> 'finished' and not opponent_is_bot then
    select report.* into opponent_report
    from public.pvp_match_reports report
    where report.match_id = target_match.id
      and report.player_id = opponent_id;

    if not found then
      update public.pvp_matches match
      set status = 'resolving',
          result = jsonb_build_object('awaitingOpponentReport', true),
          updated_at = now()
      where match.id = target_match.id;

      select room.phase, room.current_round into current_phase, current_round
      from public.pvp_rooms room
      where room.id = target_match.room_id;

      return query
      select
        'resolving'::text,
        null::uuid,
        current_phase,
        current_round,
        reporter_player.health,
        opponent.health
      from public.pvp_room_players reporter_player
      left join public.pvp_room_players opponent on opponent.id = opponent_id
      where reporter_player.id = reporter.id;
      return;
    end if;

    if opponent_report.reported_winner_player_id = resolved_winner then
      applied_damage := greatest(1, least(30,
        round((applied_damage + opponent_report.damage)::numeric / 2)::integer));
    else
      select public.pvp_snapshot_power(snapshot.board, snapshot.augments, snapshot.traits)
      into home_power
      from public.pvp_squad_snapshots snapshot
      where snapshot.room_id = target_match.room_id
        and snapshot.player_id = target_match.home_player_id
        and snapshot.round <= target_match.round
      order by snapshot.round desc, snapshot.submitted_at desc
      limit 1;

      select public.pvp_snapshot_power(snapshot.board, snapshot.augments, snapshot.traits)
      into away_power
      from public.pvp_squad_snapshots snapshot
      where snapshot.room_id = target_match.room_id
        and snapshot.player_id = target_match.away_player_id
        and snapshot.round <= target_match.round
      order by snapshot.round desc, snapshot.submitted_at desc
      limit 1;

      home_power := coalesce(home_power, 0);
      away_power := coalesce(away_power, 0);
      if home_power > away_power
        or (home_power = away_power and get_byte(decode(md5(target_match.seed), 'hex'), 0) % 2 = 0) then
        resolved_winner := target_match.home_player_id;
        resolved_loser := target_match.away_player_id;
      else
        resolved_winner := target_match.away_player_id;
        resolved_loser := target_match.home_player_id;
      end if;
      applied_damage := greatest(2, least(15,
        2 + target_match.round / 5
        + ceil(abs(home_power - away_power) / greatest(20, least(home_power, away_power)))::integer));
      battle_result := jsonb_build_object(
        'reportMismatch', true,
        'autoResolved', true,
        'homePower', home_power,
        'awayPower', away_power,
        'method', 'snapshot-power-v2'
      );
    end if;
  end if;

  if target_match.status <> 'finished' then
    update public.pvp_matches match
    set status = 'finished',
        winner_player_id = resolved_winner,
        home_damage = case when resolved_loser = match.home_player_id then applied_damage else 0 end,
        away_damage = case when resolved_loser = match.away_player_id then applied_damage else 0 end,
        result = battle_result,
        updated_at = now()
    where match.id = target_match_id;

    update public.pvp_room_players player
    set health = greatest(0, player.health - applied_damage),
        status = case when player.health - applied_damage <= 0 then 'eliminated' else player.status end,
        updated_at = now()
    where player.id = resolved_loser;

    if exists (
      select 1 from public.pvp_room_players player
      where player.id = resolved_loser and player.status = 'eliminated'
    ) then
      perform public.pvp_release_player_holdings(resolved_loser);
    end if;
  end if;

  perform public.pvp_advance_completed_round(target_match.room_id, target_match.round);

  select room.phase, room.current_round into current_phase, current_round
  from public.pvp_rooms room
  where room.id = target_match.room_id;
  return query
  select
    match.status,
    match.winner_player_id,
    current_phase,
    current_round,
    reporter_player.health,
    opponent.health
  from public.pvp_matches match
  join public.pvp_room_players reporter_player on reporter_player.id = reporter.id
  left join public.pvp_room_players opponent on opponent.id = opponent_id
  where match.id = target_match_id;
end;
$$;

revoke all on function public.pvp_prepare_round(uuid) from public;
revoke all on function public.pvp_report_match(uuid, boolean, integer, jsonb) from public;
revoke all on function public.pvp_tick_room(uuid) from public;
grant execute on function public.pvp_prepare_round(uuid) to authenticated;
grant execute on function public.pvp_report_match(uuid, boolean, integer, jsonb) to authenticated;
grant execute on function public.pvp_tick_room(uuid) to authenticated;

-- Resolves abandoned combat phases from the submitted snapshots. This is a
-- timeout fallback; normal human battles still use the client simulation.
create or replace function public.pvp_resolve_expired_combat(target_room_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_room public.pvp_rooms%rowtype;
  target_match public.pvp_matches%rowtype;
  home_power numeric;
  away_power numeric;
  resolved_winner uuid;
  resolved_loser uuid;
  applied_damage integer;
  resolved_count integer := 0;
begin
  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id
  for update;

  if not found
    or target_room.status <> 'running'
    or target_room.phase <> 'combat'
    or target_room.phase_deadline is null
    or target_room.phase_deadline > now() then
    return 0;
  end if;

  for target_match in
    select match.*
    from public.pvp_matches match
    where match.room_id = target_room_id
      and match.round = target_room.current_round
      and match.status <> 'finished'
    order by match.pair_index
    for update
  loop
    select public.pvp_snapshot_power(snapshot.board, snapshot.augments, snapshot.traits)
    into home_power
    from public.pvp_squad_snapshots snapshot
    where snapshot.room_id = target_room_id
      and snapshot.player_id = target_match.home_player_id
      and snapshot.round <= target_room.current_round
    order by snapshot.round desc, snapshot.submitted_at desc
    limit 1;

    select public.pvp_snapshot_power(snapshot.board, snapshot.augments, snapshot.traits)
    into away_power
    from public.pvp_squad_snapshots snapshot
    where snapshot.room_id = target_room_id
      and snapshot.player_id = target_match.away_player_id
      and snapshot.round <= target_room.current_round
    order by snapshot.round desc, snapshot.submitted_at desc
    limit 1;

    home_power := coalesce(home_power, 0);
    away_power := coalesce(away_power, 0);
    if home_power > away_power
      or (home_power = away_power and get_byte(decode(md5(target_match.seed), 'hex'), 0) % 2 = 0) then
      resolved_winner := target_match.home_player_id;
      resolved_loser := target_match.away_player_id;
    else
      resolved_winner := target_match.away_player_id;
      resolved_loser := target_match.home_player_id;
    end if;
    applied_damage := greatest(2, least(15,
      2 + target_room.current_round / 5
      + ceil(abs(home_power - away_power) / greatest(20, least(home_power, away_power)))::integer));

    update public.pvp_matches match
    set status = 'finished',
        winner_player_id = resolved_winner,
        home_damage = case when resolved_loser = match.home_player_id then applied_damage else 0 end,
        away_damage = case when resolved_loser = match.away_player_id then applied_damage else 0 end,
        result = jsonb_build_object(
          'autoResolved', true,
          'timedOut', true,
          'homePower', home_power,
          'awayPower', away_power,
          'method', 'snapshot-power-v2'
        ),
        updated_at = now()
    where match.id = target_match.id;

    update public.pvp_room_players player
    set health = greatest(0, player.health - applied_damage),
        status = case when player.health - applied_damage <= 0 then 'eliminated' else player.status end,
        updated_at = now()
    where player.id = resolved_loser;

    if exists (
      select 1 from public.pvp_room_players player
      where player.id = resolved_loser and player.status = 'eliminated'
    ) then
      perform public.pvp_release_player_holdings(resolved_loser);
    end if;
    resolved_count := resolved_count + 1;
  end loop;

  perform public.pvp_advance_completed_round(target_room_id, target_room.current_round);
  return resolved_count;
end;
$$;

revoke all on function public.pvp_resolve_expired_combat(uuid) from public;

-- Advances expired rooms even when nobody currently has the page open.
-- Supabase pg_cron invokes this function once per minute.
-- Finalizes an abandoned asynchronous opening with an empty squad so the room
-- can advance without requiring the missing browser to reconnect.
create or replace function public.pvp_resolve_expired_async_opening(target_room_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_room public.pvp_rooms%rowtype;
  target_player public.pvp_room_players%rowtype;
  auto_ready_count integer := 0;
  counted_ready integer;
  counted_active integer;
begin
  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_room_id
  for update;

  if not found
    or target_room.status <> 'running'
    or target_room.mode <> 'async'
    or target_room.phase <> 'pve'
    or target_room.phase_deadline is null
    or target_room.phase_deadline > now() then
    return 0;
  end if;

  for target_player in
    select player.*
    from public.pvp_room_players player
    where player.room_id = target_room_id
      and player.status = 'active'
      and not player.is_bot
      and not player.ready
    order by player.seat
    for update
  loop
    insert into public.pvp_squad_snapshots (
      room_id, player_id, round, revision, board, bench, augments, traits,
      economy, shop, checksum
    ) values (
      target_room_id, target_player.id, 0, 0, '[]'::jsonb, '[]'::jsonb,
      '[]'::jsonb, '{}'::jsonb,
      jsonb_build_object('hp', target_player.health, 'gold', target_player.credits,
        'level', target_player.level, 'xp', target_player.xp, 'round', 0,
        'autoSubmitted', true),
      '[]'::jsonb, null
    ) on conflict (room_id, player_id, round) do nothing;

    update public.pvp_room_players player
    set ready = true, updated_at = now()
    where player.id = target_player.id;
    auto_ready_count := auto_ready_count + 1;
  end loop;

  select count(*) filter (where player.ready), count(*)
  into counted_ready, counted_active
  from public.pvp_room_players player
  where player.room_id = target_room_id and player.status = 'active';

  if counted_active > 1 and counted_ready = counted_active then
    update public.pvp_rooms room
    set phase = 'planning', current_round = 1,
        phase_deadline = now() + make_interval(mins => room.async_turn_minutes),
        revision = room.revision + 1
    where room.id = target_room_id;

    update public.pvp_room_players player
    set ready = player.is_bot, updated_at = now()
    where player.room_id = target_room_id and player.status = 'active';
  end if;

  return auto_ready_count;
end;
$$;

revoke all on function public.pvp_resolve_expired_async_opening(uuid) from public;

create or replace function public.pvp_tick_due_rooms()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_room record;
  processed_count integer := 0;
  active_count integer;
  ready_count integer;
begin
  perform set_config('app.pvp_scheduler', 'on', true);

  for target_room in
    select room.id, room.mode, room.phase
    from public.pvp_rooms room
    where room.status = 'running'
      and room.phase in ('pve', 'planning', 'combat')
      and room.phase_deadline is not null
      and room.phase_deadline <= now()
    order by room.phase_deadline
    limit 100
  loop
    if target_room.phase = 'combat' then
      perform public.pvp_resolve_expired_combat(target_room.id);
      processed_count := processed_count + 1;
      continue;
    end if;

    if target_room.mode = 'async' and target_room.phase = 'pve' then
      perform public.pvp_resolve_expired_async_opening(target_room.id);
    else
      perform public.pvp_tick_room(target_room.id);
    end if;

    select count(*), count(*) filter (where player.ready)
    into active_count, ready_count
    from public.pvp_room_players player
    where player.room_id = target_room.id
      and player.status = 'active';

    if active_count > 1
      and ready_count = active_count
      and exists (
        select 1 from public.pvp_rooms room
        where room.id = target_room.id
          and room.status = 'running'
          and room.phase = 'planning'
      ) then
      perform public.pvp_prepare_round(target_room.id);
    end if;
    processed_count := processed_count + 1;
  end loop;

  return processed_count;
end;
$$;

revoke all on function public.pvp_tick_due_rooms() from public;

do $$
begin
  create extension if not exists pg_cron with schema extensions;
  if not exists (select 1 from cron.job where jobname = 'lumia-pvp-room-tick') then
    perform cron.schedule(
      'lumia-pvp-room-tick',
      '* * * * *',
      'select public.pvp_tick_due_rooms();'
    );
  end if;
exception
  when others then
    raise notice 'pg_cron schedule was not installed; schedule public.pvp_tick_due_rooms() once per minute in Supabase. Cause: %', sqlerrm;
end;
$$;

notify pgrst, 'reload schema';
