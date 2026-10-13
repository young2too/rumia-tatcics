-- Aligns PvP bot squad size and star growth with the human economy curve.
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
  initial_count := greatest(1, least(plan_count,
    coalesce((latest_economy ->> 'botInitialBoardCount')::integer, jsonb_array_length(latest_board))));
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

notify pgrst, 'reload schema';
