grant usage on schema public to anon, authenticated;
grant select on public.courts to anon, authenticated;
grant select on public.club_settings to anon, authenticated;
grant select, insert, update, delete on public.reservations to authenticated;
grant select, update on public.profiles to authenticated;

create or replace function public.guard_profile_role_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if old.app_role is distinct from new.app_role and not public.is_super_admin() then
    raise exception 'Sadece bas admin kullanici rolleri degistirebilir.';
  end if;

  if old.app_role = 'super_admin' and not public.is_super_admin() then
    raise exception 'Bas admin hesabi sadece bas admin tarafindan degistirilebilir.';
  end if;

  return new;
end;
$$;

update public.club_settings
set
  default_booking_days_ahead = 1,
  club_member_booking_days_ahead = 2
where id = 1;

update public.profiles
set reservation_days_ahead = null
where lower(email) = 'hbenerb@gmail.com'
  and reservation_days_ahead = 14;

create or replace function public.validate_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.club_settings%rowtype;
  active_count integer;
  latest_booking_date date;
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

    if not public.is_admin() then
      latest_booking_date :=
        (now() at time zone settings.timezone)::date
        + public.booking_window_days(new.user_id);

      if (new.starts_at at time zone settings.timezone)::date > latest_booking_date then
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
  end if;

  return new;
end;
$$;

alter table public.reservations enable row level security;

drop policy if exists reservations_delete_admin on public.reservations;
drop policy if exists "reservations_delete_admin" on public.reservations;

create policy reservations_delete_admin
on public.reservations
for delete
to authenticated
using (public.is_admin());

drop policy if exists reservations_update_admin on public.reservations;
drop policy if exists "reservations_update_admin" on public.reservations;

create policy reservations_update_admin
on public.reservations
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

notify pgrst, 'reload schema';
