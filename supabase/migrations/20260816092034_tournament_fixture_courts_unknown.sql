update public.tournament_matches match
set court_id = null
from public.tournaments tournament
where tournament.id = match.tournament_id
  and tournament.name = '29 Ekim'
  and match.source_key is not null;
