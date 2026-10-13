-- Updates PvP room rejoin behavior so the submitted nickname replaces the existing one.
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
  if player_nickname is null
    or char_length(trim(player_nickname)) not between 1 and 12 then
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

revoke all on function public.pvp_join_room(text, text) from public;
grant execute on function public.pvp_join_room(text, text) to authenticated;

notify pgrst, 'reload schema';
