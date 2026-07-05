create or replace function public.validate_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  club_settings_row public.club_settings%rowtype;
  active_count integer;
  latest_booking_date date;
  can_book_allowed boolean;
begin
  select * into club_settings_row from public.club_settings where id = 1;

  if new.status = 'confirmed' then
    if new.starts_at < now() then
      raise exception 'Gecmis tarihli rezervasyon yapilamaz.';
    end if;

    if new.ends_at <> new.starts_at + make_interval(mins => club_settings_row.reservation_slot_minutes) then
      raise exception 'Rezervasyon suresi % dakika olmalidir.', club_settings_row.reservation_slot_minutes;
    end if;

    if not public.is_within_club_hours(new.starts_at, new.ends_at) then
      raise exception 'Rezervasyon kulup acilis saatleri disinda.';
    end if;

    if not public.is_admin() then
      select coalesce(p.can_book, false)
        into can_book_allowed
      from public.profiles p
      where p.id = new.user_id;

      if not coalesce(can_book_allowed, false) then
        raise exception 'Rezervasyon yetkiniz admin tarafindan acilmali.';
      end if;

      latest_booking_date :=
        (now() at time zone club_settings_row.timezone)::date
        + public.booking_window_days(new.user_id);

      if (new.starts_at at time zone club_settings_row.timezone)::date > latest_booking_date then
        raise exception 'Bu tarih icin rezervasyon yetkiniz yok.';
      end if;

      select count(*)
        into active_count
      from public.reservations r
      where r.user_id = new.user_id
        and r.status = 'confirmed'
        and r.ends_at > now()
        and (tg_op = 'INSERT' or r.id <> new.id);

      if active_count >= club_settings_row.max_active_reservations then
        raise exception 'Aktif rezervasyon limitiniz dolu.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

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
    or (
      starts_at at time zone (
        select timezone from public.club_settings where id = 1
      )
    )::date <= (
      (now() at time zone (
        select timezone from public.club_settings where id = 1
      ))::date + public.booking_window_days(auth.uid())
    )
  )
  and exists (
    select 1
    from public.courts
    where courts.id = court_id
      and courts.is_active = true
  )
);

notify pgrst, 'reload schema';
