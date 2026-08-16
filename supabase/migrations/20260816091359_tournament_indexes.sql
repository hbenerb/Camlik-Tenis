create index tournament_courts_court_id_idx
on public.tournament_courts (court_id);

create index tournament_matches_court_id_idx
on public.tournament_matches (court_id);

create index tournaments_created_by_idx
on public.tournaments (created_by);
