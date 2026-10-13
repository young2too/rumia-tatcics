-- Fixes opening PvE readiness leaking into the first PvP planning round.
create or replace function public.pvp_reset_ready_on_first_planning()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.phase = 'pve'
    and new.phase = 'planning'
    and new.current_round = 1 then
    update public.pvp_room_players player
    set ready = player.is_bot,
        updated_at = now()
    where player.room_id = new.id
      and player.status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists pvp_reset_ready_on_first_planning_trigger on public.pvp_rooms;
create trigger pvp_reset_ready_on_first_planning_trigger
after update of phase, current_round on public.pvp_rooms
for each row
execute function public.pvp_reset_ready_on_first_planning();

-- Repair rooms that already entered 1-1 before this trigger was installed.
update public.pvp_room_players player
set ready = case
      when player.is_bot then true
      else exists (
        select 1
        from public.pvp_squad_snapshots snapshot
        where snapshot.room_id = player.room_id
          and snapshot.player_id = player.id
          and snapshot.round = 1
      )
    end,
    updated_at = now()
from public.pvp_rooms room
where room.id = player.room_id
  and room.status = 'running'
  and room.phase = 'planning'
  and room.current_round = 1
  and player.status = 'active';
