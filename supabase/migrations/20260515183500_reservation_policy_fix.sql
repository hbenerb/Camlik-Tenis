grant usage on schema public to anon, authenticated;
grant select on public.courts to anon, authenticated;
grant select on public.club_settings to anon, authenticated;
grant select, insert, update on public.reservations to authenticated;
grant select on public.profiles to authenticated;

alter table public.reservations enable row level security;

drop policy if exists reservations_select_own_or_admin on public.reservations;
drop policy if exists "reservations_select_own_or_admin" on public.reservations;
drop policy if exists reservations_insert_own on public.reservations;
drop policy if exists "reservations_insert_own" on public.reservations;
drop policy if exists reservations_cancel_own on public.reservations;
drop policy if exists "reservations_cancel_own" on public.reservations;
drop policy if exists reservations_update_admin on public.reservations;
drop policy if exists "reservations_update_admin" on public.reservations;

create or replace function public.booking_window_days(target_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p.reservation_days_ahead,
    case
      when p.is_club_member then s.club_member_booking_days_ahead
      else s.default_booking_days_ahead
    end,
    7
  )
  from public.profiles p
  cross join public.club_settings s
  where p.id = target_user_id and s.id = 1;
$$;

create or replace function public.is_within_club_hours(start_time timestamptz, end_time timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (start_time at time zone s.timezone)::date = (end_time at time zone s.timezone)::date
    and (start_time at time zone s.timezone)::time >= s.opening_time
    and (end_time at time zone s.timezone)::time <= s.closing_time,
    false
  )
  from public.club_settings s
  where s.id = 1;
$$;

create policy reservations_select_own_or_admin
on public.reservations
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy reservations_insert_own
on public.reservations
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'confirmed'
  and ends_at > starts_at
  and starts_at >= now()
  and public.is_within_club_hours(starts_at, ends_at)
  and starts_at <= now() + make_interval(days => public.booking_window_days(auth.uid()))
  and exists (
    select 1
    from public.courts
    where courts.id = court_id
      and courts.is_active = true
  )
);

create policy reservations_cancel_own
on public.reservations
for update
to authenticated
using (
  user_id = auth.uid()
  and status = 'confirmed'
)
with check (
  user_id = auth.uid()
  and status = 'canceled'
);

create policy reservations_update_admin
on public.reservations
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

notify pgrst, 'reload schema';

