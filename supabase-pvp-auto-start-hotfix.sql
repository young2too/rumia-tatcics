-- Starts an asynchronous PvP round as soon as every active player has submitted.
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

notify pgrst, 'reload schema';
