grant select, insert, update, delete on public.reservations to authenticated;

drop policy if exists reservations_insert_own on public.reservations;
drop policy if exists "reservations_insert_own" on public.reservations;
drop policy if exists reservations_insert_own_or_admin on public.reservations;
drop policy if exists "reservations_insert_own_or_admin" on public.reservations;

create policy reservations_insert_own_or_admin
on public.reservations
for insert
to authenticated
with check (
  (user_id = auth.uid() or public.is_admin())
  and status = 'confirmed'
  and ends_at > starts_at
  and starts_at >= now()
  and public.is_within_club_hours(starts_at, ends_at)
  and (
    public.is_admin()
    or starts_at <= now() + make_interval(days => public.booking_window_days(auth.uid()))
  )
  and exists (
    select 1
    from public.courts
    where courts.id = court_id
      and courts.is_active = true
  )
);

notify pgrst, 'reload schema';
