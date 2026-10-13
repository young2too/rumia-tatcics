-- Resets all PvP rooms and asynchronous matchmaking queue entries.
-- Room-scoped players, snapshots, matches, reports, holdings, chat messages,
-- Lumi shop claims, unit pools, and push events are removed by ON DELETE CASCADE.
-- Anonymous accounts, push subscriptions, online presence, and global chat are preserved.
begin;

with deleted_queue as (
  delete from public.pvp_matchmaking_queue
  returning id
),
deleted_rooms as (
  delete from public.pvp_rooms
  returning id
)
select
  (select count(*)::integer from deleted_queue) as deleted_queue_count,
  (select count(*)::integer from deleted_rooms) as deleted_room_count;

commit;

notify pgrst, 'reload schema';

select
  (select count(*)::integer from public.pvp_matchmaking_queue) as remaining_queue_count,
  (select count(*)::integer from public.pvp_rooms) as remaining_room_count;
