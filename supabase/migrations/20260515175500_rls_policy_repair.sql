grant usage on schema public to anon, authenticated;
grant select on public.club_settings to anon, authenticated;
grant select on public.courts to anon, authenticated;
grant select, insert, update on public.reservations to authenticated;
grant select, update on public.profiles to authenticated;

create or replace function public.is_bootstrap_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(auth.jwt()->>'email', '')) = 'hbenerb@gmail.com'
    or exists (
      select 1
      from auth.users
      where users.id = auth.uid()
        and lower(coalesce(users.email, '')) = 'hbenerb@gmail.com'
    );
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_bootstrap_super_admin() then 'super_admin'::public.app_role
    else (
      select profiles.app_role
      from public.profiles
      where profiles.id = auth.uid()
    )
  end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('admin', 'super_admin'), false);
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'super_admin', false);
$$;

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
    end
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
  select
    (start_time at time zone s.timezone)::date = (end_time at time zone s.timezone)::date
    and (start_time at time zone s.timezone)::time >= s.opening_time
    and (end_time at time zone s.timezone)::time <= s.closing_time
  from public.club_settings s
  where s.id = 1;
$$;

alter table public.profiles enable row level security;
alter table public.club_settings enable row level security;
alter table public.courts enable row level security;
alter table public.reservations enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_super_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "settings_select_authenticated" on public.club_settings;
drop policy if exists "settings_update_admin" on public.club_settings;
drop policy if exists "courts_select_authenticated" on public.courts;
drop policy if exists "courts_insert_admin" on public.courts;
drop policy if exists "courts_update_admin" on public.courts;
drop policy if exists "reservations_select_own_or_admin" on public.reservations;
drop policy if exists "reservations_insert_own" on public.reservations;
drop policy if exists "reservations_cancel_own" on public.reservations;
drop policy if exists "reservations_update_admin" on public.reservations;

create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_update_super_admin"
on public.profiles for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.is_admin() and app_role <> 'super_admin')
with check (public.is_admin() and app_role <> 'super_admin');

create policy "settings_select_public"
on public.club_settings for select
to anon, authenticated
using (true);

create policy "settings_update_admin"
on public.club_settings for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "courts_select_public"
on public.courts for select
to anon, authenticated
using (true);

create policy "courts_insert_admin"
on public.courts for insert
to authenticated
with check (public.is_admin());

create policy "courts_update_admin"
on public.courts for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "reservations_select_own_or_admin"
on public.reservations for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "reservations_insert_own"
on public.reservations for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_within_club_hours(starts_at, ends_at)
  and starts_at <= now() + make_interval(days => public.booking_window_days(auth.uid()))
);

create policy "reservations_cancel_own"
on public.reservations for update
to authenticated
using (
  user_id = auth.uid()
  and status = 'confirmed'
  and starts_at >= now() + (
    select make_interval(hours => cancellation_deadline_hours)
    from public.club_settings
    where id = 1
  )
)
with check (user_id = auth.uid() and status = 'canceled');

create policy "reservations_update_admin"
on public.reservations for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.club_settings (id)
values (1)
on conflict (id) do nothing;

insert into public.courts (name, display_order, is_active)
select 'Kort 1', 1, true
where not exists (
  select 1 from public.courts where lower(name) = lower('Kort 1')
);

insert into public.courts (name, display_order, is_active)
select 'Kort 2', 2, true
where not exists (
  select 1 from public.courts where lower(name) = lower('Kort 2')
);

update public.courts
set is_active = true
where lower(name) in (lower('Kort 1'), lower('Kort 2'));
