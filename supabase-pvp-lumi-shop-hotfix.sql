-- Adds atomic shared Lumi Shop claims and deterministic bot purchases.
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
create policy "pvp members read lumi claims" on public.pvp_lumi_shop_claims for select
using (public.pvp_is_room_member(room_id));
revoke all on public.pvp_lumi_shop_claims from anon, authenticated;
grant select on public.pvp_lumi_shop_claims to authenticated;

create or replace function public.pvp_claim_lumi_product(target_room_id uuid, target_round integer, target_product_id text)
returns table (room_id uuid, round integer, product_id text, player_id uuid, claimed_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  current_user_id uuid := auth.uid();
  target_player public.pvp_room_players%rowtype;
  allowed_products constant text[] := array['attack-module','amplification-module','survival-module','team-calibration','emergency-repair','ice-shield','joker-unit','five-cost-ticket','augment-choice-expansion','augment-reroll-expansion'];
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;
  if target_round < 5 or (target_round - 5) % 10 <> 0 then raise exception 'Invalid Lumi Shop round'; end if;
  if not (target_product_id = any(allowed_products)) then raise exception 'Invalid Lumi Shop product'; end if;
  select player.* into target_player from public.pvp_room_players player
  join public.pvp_rooms room on room.id = player.room_id
  where player.room_id = target_room_id and player.user_id = current_user_id
    and player.status = 'active' and not player.is_bot and room.status = 'running'
  for update of player;
  if not found then raise exception 'Active PvP membership not found'; end if;
  if exists (select 1 from public.pvp_lumi_shop_claims claim where claim.room_id = target_room_id and claim.round = target_round and claim.player_id = target_player.id) then
    raise exception 'Player already selected a Lumi Shop product';
  end if;
  begin
    insert into public.pvp_lumi_shop_claims (room_id, round, product_id, player_id)
    values (target_room_id, target_round, target_product_id, target_player.id);
  exception when unique_violation then raise exception 'Lumi Shop product already claimed';
  end;
  return query select claim.room_id, claim.round, claim.product_id, claim.player_id, claim.claimed_at
  from public.pvp_lumi_shop_claims claim where claim.room_id = target_room_id and claim.round = target_round and claim.product_id = target_product_id;
end;
$$;

create or replace function public.pvp_prepare_lumi_shop(target_room_id uuid, target_round integer, offered_product_ids text[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  current_user_id uuid := auth.uid();
  target_bot public.pvp_room_players%rowtype;
  selected_product text;
  latest_snapshot_id uuid;
  prepared_count integer := 0;
  bot_products constant text[] := array['attack-module','amplification-module','survival-module','team-calibration','emergency-repair'];
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;
  if not public.pvp_is_room_member(target_room_id) then raise exception 'PvP room membership not found'; end if;
  if target_round < 5 or (target_round - 5) % 10 <> 0 then raise exception 'Invalid Lumi Shop round'; end if;
  if coalesce(array_length(offered_product_ids, 1), 0) < 2 then raise exception 'Invalid Lumi Shop offers'; end if;
  for target_bot in select player.* from public.pvp_room_players player
    where player.room_id = target_room_id and player.status = 'active' and player.is_bot
    order by player.health, player.seat for update
  loop
    if exists (select 1 from public.pvp_lumi_shop_claims claim where claim.room_id = target_room_id and claim.round = target_round and claim.player_id = target_bot.id) then continue; end if;
    select offered.product_id into selected_product from unnest(offered_product_ids) offered(product_id)
    where offered.product_id = any(bot_products)
      and not exists (select 1 from public.pvp_lumi_shop_claims claim where claim.room_id = target_room_id and claim.round = target_round and claim.product_id = offered.product_id)
    order by md5(target_room_id::text || ':' || target_round || ':' || target_bot.id::text || ':' || offered.product_id) limit 1;
    if selected_product is null then continue; end if;
    insert into public.pvp_lumi_shop_claims (room_id, round, product_id, player_id)
    values (target_room_id, target_round, selected_product, target_bot.id) on conflict do nothing;
    if not found then continue; end if;
    select snapshot.id into latest_snapshot_id from public.pvp_squad_snapshots snapshot
    where snapshot.room_id = target_room_id and snapshot.player_id = target_bot.id
    order by snapshot.round desc, snapshot.submitted_at desc limit 1;
    if latest_snapshot_id is not null then
      update public.pvp_squad_snapshots snapshot set economy = jsonb_set(coalesce(snapshot.economy, '{}'::jsonb), '{botLumiProducts}', coalesce(snapshot.economy -> 'botLumiProducts', '[]'::jsonb) || to_jsonb(selected_product), true)
      where snapshot.id = latest_snapshot_id;
    end if;
    if selected_product = 'emergency-repair' then
      update public.pvp_room_players player set health = least(100, player.health + 20), updated_at = now() where player.id = target_bot.id;
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
notify pgrst, 'reload schema';
