alter table public.tournaments
add column best_of_sets smallint not null default 3,
add column set_games_to_win smallint not null default 6,
add column set_tiebreak_points smallint not null default 7,
add column deciding_set_type text not null default 'match_tiebreak',
add column deciding_match_tiebreak_points smallint not null default 10;

alter table public.tournaments
add constraint tournaments_best_of_sets_valid
check (best_of_sets in (1, 3, 5)),
add constraint tournaments_set_games_to_win_valid
check (set_games_to_win between 1 and 12),
add constraint tournaments_set_tiebreak_points_valid
check (set_tiebreak_points between 1 and 30),
add constraint tournaments_deciding_set_type_valid
check (deciding_set_type in ('regular', 'match_tiebreak')),
add constraint tournaments_deciding_match_tiebreak_points_valid
check (deciding_match_tiebreak_points between 1 and 30);

alter table public.tournament_matches
add column score_entered boolean not null default false,
add column score_sets jsonb not null default '[]'::jsonb,
add column is_walkover boolean not null default false,
add column winner_entry_id uuid references public.tournament_entries(id) on delete restrict;

alter table public.tournament_matches
add constraint tournament_matches_score_sets_array
check (jsonb_typeof(score_sets) = 'array'),
add constraint tournament_matches_score_state_valid
check (
  (
    not score_entered
    and not is_walkover
    and winner_entry_id is null
    and score_sets = '[]'::jsonb
  )
  or (
    score_entered
    and status = 'completed'
    and winner_entry_id is not null
    and winner_entry_id in (player1_entry_id, player2_entry_id)
    and (
      (is_walkover and score_sets = '[]'::jsonb)
      or (not is_walkover and jsonb_array_length(score_sets) > 0)
    )
  )
);

create index tournament_matches_winner_entry_id_idx
on public.tournament_matches (winner_entry_id)
where winner_entry_id is not null;

update public.tournaments
set
  best_of_sets = 3,
  set_games_to_win = 6,
  set_tiebreak_points = 7,
  deciding_set_type = 'match_tiebreak',
  deciding_match_tiebreak_points = 10
where lower(trim(name)) like '29 ekim%';

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
    if new.starts_at < now()
      and not (tg_op = 'UPDATE' and public.is_admin()) then
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

notify pgrst, 'reload schema';
