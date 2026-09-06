alter table public.reservations
  -- Auth IDs are also profile IDs. Referencing auth.users avoids making the
  -- existing reservations -> profiles Data API relationship ambiguous for
  -- clients that are still open during deployment. The trigger validates the
  -- required registered-trainer profile on every lesson write.
  add column trainer_id uuid references auth.users(id);

create index reservations_trainer_id_starts_at_idx
  on public.reservations (trainer_id, starts_at) where trainer_id is not null;

-- Link legacy lessons only when the name identifies one registered trainer.
-- First-name / "hoca" variants are accepted only for this one-time backfill.
-- For duplicate names, the existing owner may disambiguate an exact match.
with lessons as (
  select id, user_id,
    lower(regexp_replace(trim((case when public.is_lesson_reservation_note(note)
      then note::jsonb end) ->> 'trainer_name'), '\s+hoca$', '', 'i')) as trainer_name
  from public.reservations
  where public.is_lesson_reservation_note(note)
), candidates as (
  select l.id, p.id as trainer_id,
    row_number() over (partition by l.id order by (p.id = l.user_id) desc, p.id) as rank,
    count(*) over (partition by l.id) as matches,
    bool_or(p.id = l.user_id) over (partition by l.id) as owner_matches
  from lessons l
  join public.profiles p on p.is_trainer and (
    lower(trim(p.full_name)) = l.trainer_name or
    lower(split_part(trim(p.full_name), ' ', 1)) = l.trainer_name
  )
)
update public.reservations r
set trainer_id = c.trainer_id
from candidates c
where r.id = c.id and c.rank = 1 and (c.matches = 1 or c.owner_matches);

create schema if not exists private;

create function private.validate_lesson_trainer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  earliest_lesson timestamptz :=
    (((now() at time zone 'Europe/Istanbul')::date - interval '1 month') at time zone 'Europe/Istanbul');
  trainer_name text;
  is_lesson boolean := coalesce(public.is_lesson_reservation_note(new.note), false);
begin
  if tg_op = 'UPDATE' and current_user_id is not null and not public.is_admin() then
    -- Owners may cancel, but cancellation must not be used to change ownership,
    -- instructor or other fields on a lesson they are not allowed to manage.
    if new.status = 'canceled' and old.status = 'confirmed'
       and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then
      return new; -- RLS still verifies owner / assigned instructor authority.
    end if;

    if old.trainer_id = current_user_id and old.status = 'confirmed'
       and old.starts_at >= earliest_lesson
       and exists (select 1 from public.profiles where id = current_user_id and is_trainer) then
      if new.id is distinct from old.id or new.user_id is distinct from old.user_id
         or new.trainer_id is distinct from old.trainer_id
         or new.created_at is distinct from old.created_at
         or not is_lesson or new.starts_at < earliest_lesson
         or not public.is_within_club_hours(new.starts_at, new.ends_at)
         or not exists (select 1 from public.courts where id = new.court_id and is_active) then
        raise exception 'Eğitmen yalnızca kendisine atanmış son bir aylık dersleri düzenleyebilir; bağlı üye ve eğitmen değiştirilemez.' using errcode = '42501';
      end if;
    else
      raise exception 'Bu rezervasyonu düzenleme yetkiniz yok.' using errcode = '42501';
    end if;
  end if;

  -- Preserve old canceled records, including unresolved legacy trainer names.
  if tg_op = 'UPDATE' and new.status = 'canceled'
     and new.trainer_id is not distinct from old.trainer_id
     and new.note is not distinct from old.note then
    return new;
  end if;

  if is_lesson then
    select coalesce(nullif(trim(full_name), ''), email) into trainer_name
    from public.profiles where id = new.trainer_id and is_trainer;
    if trainer_name is null then
      raise exception 'Ders için kayıtlı eğitmen listesinden bir eğitmen seçilmeli.' using errcode = '23514';
    end if;
    new.note := jsonb_set(new.note::jsonb, '{trainer_name}', to_jsonb(trainer_name))::text;
  elsif new.trainer_id is not null then
    raise exception 'Eğitmen yalnızca ders rezervasyonuna atanabilir.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_lesson_trainer() from public, anon, authenticated;

create trigger validate_lesson_trainer
before insert or update on public.reservations
for each row execute function private.validate_lesson_trainer();

drop policy if exists reservations_update_own_lesson_trainer on public.reservations;
create policy reservations_update_assigned_lesson_trainer
on public.reservations for update to authenticated
using (
  trainer_id = (select auth.uid())
  and status = 'confirmed'
  and starts_at >= (((now() at time zone 'Europe/Istanbul')::date - interval '1 month') at time zone 'Europe/Istanbul')
  and exists (select 1 from public.profiles where id = (select auth.uid()) and is_trainer)
  and public.is_lesson_reservation_note(note)
)
with check (
  trainer_id = (select auth.uid())
  and status in ('confirmed', 'canceled')
  and starts_at >= (((now() at time zone 'Europe/Istanbul')::date - interval '1 month') at time zone 'Europe/Istanbul')
  and exists (select 1 from public.profiles where id = (select auth.uid()) and is_trainer)
  and public.is_lesson_reservation_note(note)
);

notify pgrst, 'reload schema';
