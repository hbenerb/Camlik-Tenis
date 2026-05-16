create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

create type public.app_role as enum ('user', 'admin', 'super_admin');
create type public.reservation_status as enum ('confirmed', 'canceled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  app_role public.app_role not null default 'user',
  is_club_member boolean not null default false,
  reservation_days_ahead integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_days_ahead_non_negative check (
    reservation_days_ahead is null or reservation_days_ahead >= 0
  )
);

create table public.club_settings (
  id smallint primary key default 1,
  timezone text not null default 'Europe/Istanbul',
  opening_time time not null default '08:00',
  closing_time time not null default '22:00',
  reservation_slot_minutes integer not null default 60,
  max_active_reservations integer not null default 2,
  default_booking_days_ahead integer not null default 3,
  club_member_booking_days_ahead integer not null default 7,
  cancellation_deadline_hours integer not null default 6,
  updated_at timestamptz not null default now(),
  constraint singleton_settings check (id = 1),
  constraint valid_opening_hours check (opening_time < closing_time),
  constraint valid_slot_minutes check (reservation_slot_minutes in (30, 45, 60, 90, 120)),
  constraint valid_active_limit check (max_active_reservations >= 1),
  constraint valid_default_booking_window check (default_booking_days_ahead >= 0),
  constraint valid_member_booking_window check (club_member_booking_days_ahead >= 0),
  constraint valid_cancellation_deadline check (cancellation_deadline_hours >= 0)
);

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_order integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courts_name_not_blank check (length(trim(name)) > 0)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.reservation_status not null default 'confirmed',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_time_order check (ends_at > starts_at),
  constraint no_overlapping_confirmed_reservations exclude using gist (
    court_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status = 'confirmed')
);

insert into public.club_settings (id)
values (1)
on conflict (id) do nothing;

insert into public.courts (name, display_order)
values
  ('Kort 1', 1),
  ('Kort 2', 2)
on conflict do nothing;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger club_settings_touch_updated_at
before update on public.club_settings
for each row execute function public.touch_updated_at();

create trigger courts_touch_updated_at
before update on public.courts
for each row execute function public.touch_updated_at();

create trigger reservations_touch_updated_at
before update on public.reservations
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    app_role,
    is_club_member,
    reservation_days_ahead
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    case
      when lower(coalesce(new.email, '')) = 'hbenerb@gmail.com' then 'super_admin'::public.app_role
      else 'user'::public.app_role
    end,
    lower(coalesce(new.email, '')) = 'hbenerb@gmail.com',
    case
      when lower(coalesce(new.email, '')) = 'hbenerb@gmail.com' then 14
      else null
    end
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select app_role from public.profiles where id = auth.uid();
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

create or replace function public.validate_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.club_settings%rowtype;
  active_count integer;
begin
  select * into settings from public.club_settings where id = 1;

  if new.status = 'confirmed' then
    if new.starts_at < now() then
      raise exception 'Gecmis tarihli rezervasyon yapilamaz.';
    end if;

    if new.ends_at <> new.starts_at + make_interval(mins => settings.reservation_slot_minutes) then
      raise exception 'Rezervasyon suresi % dakika olmalidir.', settings.reservation_slot_minutes;
    end if;

    if not public.is_within_club_hours(new.starts_at, new.ends_at) then
      raise exception 'Rezervasyon kulup acilis saatleri disinda.';
    end if;

    if new.starts_at > now() + make_interval(days => public.booking_window_days(new.user_id)) then
      raise exception 'Bu tarih icin rezervasyon yetkiniz yok.';
    end if;

    select count(*)
      into active_count
    from public.reservations r
    where r.user_id = new.user_id
      and r.status = 'confirmed'
      and r.ends_at > now()
      and (tg_op = 'INSERT' or r.id <> new.id);

    if active_count >= settings.max_active_reservations then
      raise exception 'Aktif rezervasyon limitiniz dolu.';
    end if;
  end if;

  return new;
end;
$$;

create trigger reservations_validate
before insert or update on public.reservations
for each row execute function public.validate_reservation();

create or replace function public.guard_profile_role_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.app_role is distinct from new.app_role and not public.is_super_admin() then
    raise exception 'Sadece bas admin kullanici rolleri degistirebilir.';
  end if;

  if old.app_role = 'super_admin' and not public.is_super_admin() then
    raise exception 'Bas admin hesabi sadece bas admin tarafindan degistirilebilir.';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_role_changes
before update on public.profiles
for each row execute function public.guard_profile_role_changes();

alter table public.profiles enable row level security;
alter table public.club_settings enable row level security;
alter table public.courts enable row level security;
alter table public.reservations enable row level security;

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

create policy "settings_select_authenticated"
on public.club_settings for select
to authenticated
using (true);

create policy "settings_update_admin"
on public.club_settings for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "courts_select_authenticated"
on public.courts for select
to authenticated
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
