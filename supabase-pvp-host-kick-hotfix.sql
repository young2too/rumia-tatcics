-- Realtime PvP lobby host kick authority. Kicked players may rejoin later.

create or replace function public.pvp_kick_player(target_player_id uuid)
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

  if not found or target_player.status <> 'active' or target_player.is_bot then
    raise exception 'Active human player not found';
  end if;
  if target_player.user_id = current_user_id then
    raise exception 'The room host cannot kick themselves';
  end if;

  select room.* into target_room
  from public.pvp_rooms room
  where room.id = target_player.room_id
  for update;

  if not found
    or target_room.mode <> 'realtime'
    or target_room.host_user_id <> current_user_id then
    raise exception 'Only the realtime room host can kick players';
  end if;
  if target_room.status <> 'waiting' or target_room.phase <> 'lobby' then
    raise exception 'Players can only be kicked before the game starts';
  end if;

  update public.pvp_room_players player
  set status = 'left',
      ready = false,
      last_seen = now()
  where player.id = target_player_id;

  update public.pvp_rooms room
  set revision = room.revision + 1
  where room.id = target_player.room_id;
end;
$$;

revoke all on function public.pvp_kick_player(uuid) from public;
grant execute on function public.pvp_kick_player(uuid) to authenticated;

notify pgrst, 'reload schema';
