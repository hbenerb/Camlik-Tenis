alter table public.tournaments
add column match_duration_minutes integer not null default 60;

alter table public.tournaments
add constraint tournaments_match_duration_minutes_check
check (match_duration_minutes between 15 and 360);

comment on column public.tournaments.match_duration_minutes is
'Turnuvanın tüm maçları için dakika cinsinden varsayılan ve zorunlu süre.';

update public.tournaments
set match_duration_minutes = 90
where lower(trim(name)) = lower('29 Ekim');

update public.tournament_matches tournament_match
set ends_at = tournament_match.starts_at + make_interval(mins => tournament.match_duration_minutes)
from public.tournaments tournament
where tournament.id = tournament_match.tournament_id
  and tournament_match.ends_at is distinct from
    tournament_match.starts_at + make_interval(mins => tournament.match_duration_minutes);

create or replace function public.enforce_tournament_match_duration()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  configured_duration integer;
begin
  select tournament.match_duration_minutes
  into configured_duration
  from public.tournaments tournament
  where tournament.id = new.tournament_id;

  if configured_duration is null then
    raise exception 'Turnuva maç süresi bulunamadı.';
  end if;

  new.ends_at := new.starts_at + make_interval(mins => configured_duration);
  return new;
end;
$$;

drop trigger if exists tournament_matches_enforce_duration
on public.tournament_matches;

create trigger tournament_matches_enforce_duration
before insert or update of tournament_id, starts_at, ends_at
on public.tournament_matches
for each row
execute function public.enforce_tournament_match_duration();

create or replace function public.sync_tournament_match_duration()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.match_duration_minutes is distinct from old.match_duration_minutes then
    update public.tournament_matches
    set ends_at = starts_at + make_interval(mins => new.match_duration_minutes)
    where tournament_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists tournaments_sync_match_duration
on public.tournaments;

create trigger tournaments_sync_match_duration
after update of match_duration_minutes
on public.tournaments
for each row
execute function public.sync_tournament_match_duration();
