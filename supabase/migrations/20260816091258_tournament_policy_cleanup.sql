drop policy "tournaments_manage_admin" on public.tournaments;
drop policy "tournament_courts_manage_admin" on public.tournament_courts;
drop policy "tournament_categories_manage_admin" on public.tournament_categories;
drop policy "tournament_groups_manage_admin" on public.tournament_groups;
drop policy "tournament_participants_manage_admin" on public.tournament_participants;
drop policy "tournament_matches_manage_admin" on public.tournament_matches;

create policy "tournaments_insert_admin"
on public.tournaments for insert
to authenticated
with check ((select public.is_admin()));

create policy "tournaments_update_admin"
on public.tournaments for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "tournaments_delete_admin"
on public.tournaments for delete
to authenticated
using ((select public.is_admin()));

create policy "tournament_courts_insert_admin"
on public.tournament_courts for insert
to authenticated
with check ((select public.is_admin()));

create policy "tournament_courts_update_admin"
on public.tournament_courts for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "tournament_courts_delete_admin"
on public.tournament_courts for delete
to authenticated
using ((select public.is_admin()));

create policy "tournament_categories_insert_admin"
on public.tournament_categories for insert
to authenticated
with check ((select public.is_admin()));

create policy "tournament_categories_update_admin"
on public.tournament_categories for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "tournament_categories_delete_admin"
on public.tournament_categories for delete
to authenticated
using ((select public.is_admin()));

create policy "tournament_groups_insert_admin"
on public.tournament_groups for insert
to authenticated
with check ((select public.is_admin()));

create policy "tournament_groups_update_admin"
on public.tournament_groups for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "tournament_groups_delete_admin"
on public.tournament_groups for delete
to authenticated
using ((select public.is_admin()));

create policy "tournament_participants_insert_admin"
on public.tournament_participants for insert
to authenticated
with check ((select public.is_admin()));

create policy "tournament_participants_update_admin"
on public.tournament_participants for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "tournament_participants_delete_admin"
on public.tournament_participants for delete
to authenticated
using ((select public.is_admin()));

create policy "tournament_matches_insert_admin"
on public.tournament_matches for insert
to authenticated
with check ((select public.is_admin()));

create policy "tournament_matches_update_admin"
on public.tournament_matches for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "tournament_matches_delete_admin"
on public.tournament_matches for delete
to authenticated
using ((select public.is_admin()));
