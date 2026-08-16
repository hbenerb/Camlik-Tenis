grant usage on schema public to anon;

-- Guest calendar access intentionally excludes reservation ownership and notes.
revoke all privileges on table public.reservations from anon;
grant select (
  id,
  court_id,
  starts_at,
  ends_at,
  status,
  created_at,
  updated_at
) on table public.reservations to anon;

alter table public.reservations enable row level security;

drop policy if exists reservations_select_guest_calendar
on public.reservations;

create policy reservations_select_guest_calendar
on public.reservations
for select
to anon
using (status = 'confirmed');

-- Guests can inspect active tournaments, but cannot mutate tournament data.
revoke all privileges on table public.tournaments from anon;
revoke all privileges on table public.tournament_courts from anon;
revoke all privileges on table public.tournament_categories from anon;
revoke all privileges on table public.tournament_groups from anon;
revoke all privileges on table public.tournament_participants from anon;
revoke all privileges on table public.tournament_matches from anon;

grant select on table public.tournaments to anon;
grant select on table public.tournament_courts to anon;
grant select on table public.tournament_categories to anon;
grant select on table public.tournament_groups to anon;
grant select on table public.tournament_participants to anon;
grant select on table public.tournament_matches to anon;

alter table public.tournaments enable row level security;
alter table public.tournament_courts enable row level security;
alter table public.tournament_categories enable row level security;
alter table public.tournament_groups enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.tournament_matches enable row level security;

drop policy if exists tournaments_select_active_anon
on public.tournaments;
create policy tournaments_select_active_anon
on public.tournaments
for select
to anon
using (is_active);

drop policy if exists tournament_courts_select_active_anon
on public.tournament_courts;
create policy tournament_courts_select_active_anon
on public.tournament_courts
for select
to anon
using (
  exists (
    select 1
    from public.tournaments tournament
    where tournament.id = tournament_courts.tournament_id
      and tournament.is_active
  )
);

drop policy if exists tournament_categories_select_active_anon
on public.tournament_categories;
create policy tournament_categories_select_active_anon
on public.tournament_categories
for select
to anon
using (
  exists (
    select 1
    from public.tournaments tournament
    where tournament.id = tournament_categories.tournament_id
      and tournament.is_active
  )
);

drop policy if exists tournament_groups_select_active_anon
on public.tournament_groups;
create policy tournament_groups_select_active_anon
on public.tournament_groups
for select
to anon
using (
  exists (
    select 1
    from public.tournament_categories category
    join public.tournaments tournament
      on tournament.id = category.tournament_id
    where category.id = tournament_groups.category_id
      and tournament.is_active
  )
);

drop policy if exists tournament_participants_select_active_anon
on public.tournament_participants;
create policy tournament_participants_select_active_anon
on public.tournament_participants
for select
to anon
using (
  exists (
    select 1
    from public.tournament_categories category
    join public.tournaments tournament
      on tournament.id = category.tournament_id
    where category.id = tournament_participants.category_id
      and tournament.is_active
  )
);

drop policy if exists tournament_matches_select_active_anon
on public.tournament_matches;
create policy tournament_matches_select_active_anon
on public.tournament_matches
for select
to anon
using (
  exists (
    select 1
    from public.tournaments tournament
    where tournament.id = tournament_matches.tournament_id
      and tournament.is_active
  )
);

notify pgrst, 'reload schema';
