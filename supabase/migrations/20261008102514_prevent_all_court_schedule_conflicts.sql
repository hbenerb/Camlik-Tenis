-- Existing conflicting fixtures are deliberately preserved for an admin to resolve.
-- Unlike a new exclusion constraint, these guards can be installed without moving
-- or deleting them. Any new/changed occupied interval must be conflict-free.
create table private.court_schedule_write_guard (
  id boolean primary key default true check (id),
  revision bigint not null default 0
);
insert into private.court_schedule_write_guard (id) values (true);
alter table private.court_schedule_write_guard enable row level security;
revoke all on private.court_schedule_write_guard from public, anon, authenticated, service_role;

-- All three tables share a short, transaction-scoped write barrier. Acquire it
-- BEFORE STATEMENT, before individual booking rows, in the same lock order.
-- A real UPDATE (not just an advisory lock) also forces stale REPEATABLE READ /
-- SERIALIZABLE writers to abort rather than validating against an old snapshot.
-- At READ COMMITTED, the VOLATILE validators below obtain a fresh snapshot after
-- the previous writer commits. This also covers reservation-vs-tournament races.
create function private.serialize_court_schedule_writes()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  caller_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(nullif(current_setting('role', true), ''), 'none'), session_user::text
  );
begin
  if tg_table_schema <> 'public' or tg_level <> 'STATEMENT' or tg_when <> 'BEFORE'
    or tg_table_name not in ('reservations', 'tournament_matches', 'tournaments') then
    raise exception 'Invalid court schedule guard binding.';
  end if;
  if caller_role in ('anon', 'authenticated') and auth.uid() is null then
    raise exception 'Takvim değişikliği için kullanıcı kimliği gerekli.' using errcode = '42501';
  end if;
  update private.court_schedule_write_guard set revision = revision + 1 where id;
  if not found then raise exception 'Court schedule write guard missing.'; end if;
  return null;
end;
$$;
revoke all on function private.serialize_court_schedule_writes() from public, anon, authenticated, service_role;

create trigger court_schedule_serialize before insert or update or delete on public.reservations
  for each statement execute function private.serialize_court_schedule_writes();
create trigger court_schedule_serialize before insert or update or delete on public.tournament_matches
  for each statement execute function private.serialize_court_schedule_writes();
create trigger court_schedule_serialize before insert or update or delete on public.tournaments
  for each statement execute function private.serialize_court_schedule_writes();

-- SECURITY DEFINER is limited to trigger-only conflict reads: an ordinary member
-- must also be protected from bookings hidden by RLS. Source write permissions
-- remain governed by the existing policies. No names are disclosed in errors.
create function private.validate_court_schedule()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  is_match boolean := tg_table_name = 'tournament_matches';
  tournament_active boolean;
begin
  if tg_table_schema <> 'public' or tg_level <> 'ROW' or tg_when <> 'AFTER'
    or tg_table_name not in ('reservations', 'tournament_matches') then
    raise exception 'Invalid court schedule validation binding.';
  end if;
  if new.court_id is null or (is_match and new.status = 'canceled')
    or (not is_match and new.status <> 'confirmed') then return new; end if;

  -- Names, scores and scheduled -> completed do not change court occupancy.
  -- Keep these edits possible for the pre-existing conflicts; never grandfather
  -- a move, duration change, court change or canceled -> occupied transition.
  if tg_op = 'UPDATE' and new.court_id is not distinct from old.court_id
    and new.starts_at = old.starts_at and new.ends_at = old.ends_at then
    if is_match then
      if old.status <> 'canceled' and new.tournament_id = old.tournament_id then return new; end if;
    elsif old.status = 'confirmed' then return new;
    end if;
  end if;

  if is_match then
    if exists (
      select 1 from public.tournament_matches m
      where m.id <> new.id and m.status <> 'canceled' and m.court_id = new.court_id
        and m.starts_at < new.ends_at and new.starts_at < m.ends_at
    ) then
      raise exception 'Bu kort ve saat aralığı başka bir turnuva maçıyla çakışıyor.' using errcode = '23P01';
    end if;
    select t.is_active into tournament_active from public.tournaments t where t.id = new.tournament_id;
    -- Inactive tournaments are still drafts with respect to normal reservations.
    -- Activation below revalidates every match before making them book the courts.
    if not coalesce(tournament_active, false) then return new; end if;
  else
    if exists (
      select 1 from public.tournament_matches m join public.tournaments t on t.id = m.tournament_id
      where t.is_active and m.status <> 'canceled' and m.court_id = new.court_id
        and m.starts_at < new.ends_at and new.starts_at < m.ends_at
    ) then
      raise exception 'Bu kort ve saat aralığı bir turnuva maçıyla çakışıyor.' using errcode = '23P01';
    end if;
  end if;

  if exists (
    select 1 from public.reservations r
    where (is_match or r.id <> new.id) and r.status = 'confirmed' and r.court_id = new.court_id
      and r.starts_at < new.ends_at and new.starts_at < r.ends_at
  ) then
    raise exception 'Bu kort ve saat aralığı mevcut bir rezervasyonla çakışıyor.' using errcode = '23P01';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_court_schedule() from public, anon, authenticated, service_role;

-- AFTER sees the final duration and all rows in bulk edits, so shortening/moving
-- a whole fixture does not spuriously collide with another row's old interval.
drop trigger if exists tournament_matches_validate_reservation_conflict on public.tournament_matches;
create trigger validate_court_schedule after insert or update on public.tournament_matches
  for each row execute function private.validate_court_schedule();
create trigger validate_court_schedule after insert or update on public.reservations
  for each row execute function private.validate_court_schedule();

create function private.validate_tournament_schedule_activation()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'tournaments'
    or tg_level <> 'ROW' or tg_when <> 'AFTER' then
    raise exception 'Invalid tournament activation validation binding.';
  end if;
  if not new.is_active or new.is_active is not distinct from old.is_active then return new; end if;
  if exists (
    select 1 from public.tournament_matches m
    join public.reservations r on r.court_id = m.court_id and r.status = 'confirmed'
      and r.starts_at < m.ends_at and m.starts_at < r.ends_at
    where m.tournament_id = new.id and m.status <> 'canceled'
  ) or exists (
    select 1 from public.tournament_matches m
    join public.tournament_matches other on other.id <> m.id and other.court_id = m.court_id
      and other.status <> 'canceled' and other.starts_at < m.ends_at and m.starts_at < other.ends_at
    where m.tournament_id = new.id and m.status <> 'canceled'
  ) then
    raise exception 'Turnuva aktif edilemedi: maç programında kort/saat çakışması var.' using errcode = '23P01';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_tournament_schedule_activation() from public, anon, authenticated, service_role;
drop trigger if exists tournaments_validate_activation_conflicts on public.tournaments;
-- Runs after tournaments_sync_match_duration when both settings change together.
create trigger tournaments_validate_schedule_activation after update of is_active on public.tournaments
  for each row execute function private.validate_tournament_schedule_activation();

comment on table private.court_schedule_write_guard is
  'Trigger-only serialization barrier for court occupancy; never exposed to API roles. Existing bookings are not rewritten.';
