create or replace function public.validate_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  club_settings_row public.club_settings%rowtype;
  active_count integer;
  latest_booking_date date;
  can_book_allowed boolean;
begin
  select *
  into club_settings_row
  from public.club_settings
  where id = 1;

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

    if exists (
      select 1
      from public.tournament_matches tournament_match
      join public.tournaments tournament
        on tournament.id = tournament_match.tournament_id
      where tournament.is_active
        and tournament_match.status <> 'canceled'
        and tournament_match.court_id = new.court_id
        and tstzrange(tournament_match.starts_at, tournament_match.ends_at, '[)')
          && tstzrange(new.starts_at, new.ends_at, '[)')
    ) then
      raise exception 'Bu saat aktif bir turnuva maciyla cakismaktadir.';
    end if;

    if not public.is_admin() then
      select coalesce(profile.can_book, false)
      into can_book_allowed
      from public.profiles profile
      where profile.id = new.user_id;

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
      from public.reservations reservation
      where reservation.user_id = new.user_id
        and reservation.status = 'confirmed'
        and reservation.ends_at > now()
        and (tg_op = 'INSERT' or reservation.id <> new.id);

      if active_count >= club_settings_row.max_active_reservations then
        raise exception 'Aktif rezervasyon limitiniz dolu.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_tournament_match_reservation_conflict()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tournament_is_active boolean;
begin
  select tournament.is_active
  into tournament_is_active
  from public.tournaments tournament
  where tournament.id = new.tournament_id;

  if coalesce(tournament_is_active, false)
    and new.status <> 'canceled'
    and new.court_id is not null
    and exists (
      select 1
      from public.reservations reservation
      where reservation.status = 'confirmed'
        and reservation.court_id = new.court_id
        and tstzrange(reservation.starts_at, reservation.ends_at, '[)')
          && tstzrange(new.starts_at, new.ends_at, '[)')
    ) then
    raise exception 'Turnuva maci mevcut bir rezervasyonla cakismaktadir.';
  end if;

  return new;
end;
$$;

drop trigger if exists tournament_matches_validate_reservation_conflict
on public.tournament_matches;

create trigger tournament_matches_validate_reservation_conflict
before insert or update of tournament_id, court_id, starts_at, ends_at, status
on public.tournament_matches
for each row
execute function public.validate_tournament_match_reservation_conflict();

create or replace function public.validate_tournament_activation_conflicts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_active
    and new.is_active is distinct from old.is_active
    and exists (
      select 1
      from public.tournament_matches tournament_match
      join public.reservations reservation
        on reservation.court_id = tournament_match.court_id
        and reservation.status = 'confirmed'
        and tstzrange(reservation.starts_at, reservation.ends_at, '[)')
          && tstzrange(tournament_match.starts_at, tournament_match.ends_at, '[)')
      where tournament_match.tournament_id = new.id
        and tournament_match.status <> 'canceled'
    ) then
    raise exception 'Turnuva aktif edilemedi: mac programi mevcut rezervasyonlarla cakismaktadir.';
  end if;

  return new;
end;
$$;

drop trigger if exists tournaments_validate_activation_conflicts
on public.tournaments;

create trigger tournaments_validate_activation_conflicts
before update of is_active
on public.tournaments
for each row
execute function public.validate_tournament_activation_conflicts();
