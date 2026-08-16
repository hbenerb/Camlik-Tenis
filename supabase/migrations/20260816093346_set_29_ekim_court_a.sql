do $$
declare
  v_tournament_id uuid;
  v_court_a_id uuid;
begin
  select tournament.id
  into v_tournament_id
  from public.tournaments tournament
  where tournament.name = '29 Ekim';

  if v_tournament_id is null then
    raise exception '29 Ekim turnuvasi bulunamadi';
  end if;

  select court.id
  into v_court_a_id
  from public.courts court
  where lower(trim(court.name)) = lower('Kort A')
  limit 1;

  if v_court_a_id is null then
    raise exception 'Kort A bulunamadi';
  end if;

  delete from public.tournament_courts tournament_court
  where tournament_court.tournament_id = v_tournament_id;

  insert into public.tournament_courts (tournament_id, court_id)
  values (v_tournament_id, v_court_a_id);

  update public.tournament_matches tournament_match
  set court_id = v_court_a_id
  where tournament_match.tournament_id = v_tournament_id;
end
$$;
