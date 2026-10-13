-- Repairs browser PvP RPC calls that incorrectly treated a missing scheduler flag as NULL.
do $$
declare
  function_signature text;
  previous_definition text;
  patched_definition text;
begin
  foreach function_signature in array array[
    'public.pvp_tick_room(uuid)',
    'public.pvp_prepare_round(uuid)'
  ]
  loop
    select pg_get_functiondef(function_signature::regprocedure)
    into previous_definition;

    patched_definition := replace(
      previous_definition,
      'current_setting(''app.pvp_scheduler'', true) = ''on''',
      'coalesce(current_setting(''app.pvp_scheduler'', true), '''') = ''on'''
    );

    if patched_definition = previous_definition then
      raise notice '% is already patched or has an unexpected definition.', function_signature;
    else
      execute patched_definition;
      raise notice '% patched.', function_signature;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
