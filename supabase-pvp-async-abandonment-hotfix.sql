-- Keeps asynchronous rooms moving when players abandon the opening PvE phase.
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
      target_room_id,
      target_player.id,
      0,
      0,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '{}'::jsonb,
      jsonb_build_object(
        'hp', target_player.health,
        'gold', target_player.credits,
        'level', target_player.level,
        'xp', target_player.xp,
        'round', 0,
        'autoSubmitted', true
      ),
      '[]'::jsonb,
      null
    )
    on conflict (room_id, player_id, round) do nothing;

    update public.pvp_room_players player
    set ready = true,
        updated_at = now()
    where player.id = target_player.id;
    auto_ready_count := auto_ready_count + 1;
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
        phase_deadline = now() + make_interval(mins => room.async_turn_minutes),
        revision = room.revision + 1
    where room.id = target_room_id;

    update public.pvp_room_players player
    set ready = player.is_bot,
        updated_at = now()
    where player.room_id = target_room_id
      and player.status = 'active';
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

notify pgrst, 'reload schema';
