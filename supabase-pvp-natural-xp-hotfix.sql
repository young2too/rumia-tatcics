-- Grants passive 2 XP per PvP combat, including asynchronous auto-submissions.
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

do $$
declare
  previous_definition text;
  patched_definition text;
  old_fragment text := $fragment$
        carried_economy := jsonb_set(
          coalesce(latest_snapshot.economy, '{}'::jsonb),
$fragment$;
  new_fragment text := $fragment$
        carried_economy := jsonb_set(
          public.pvp_add_natural_xp(coalesce(latest_snapshot.economy, '{}'::jsonb), 2),
$fragment$;
begin
  select pg_get_functiondef('public.pvp_tick_room(uuid)'::regprocedure)
  into previous_definition;

  if position('public.pvp_add_natural_xp' in previous_definition) = 0 then
    patched_definition := replace(previous_definition, old_fragment, new_fragment);
    if patched_definition = previous_definition then
      raise exception 'pvp_tick_room XP insertion point was not found';
    end if;
    execute patched_definition;
  end if;
end;
$$;

notify pgrst, 'reload schema';
