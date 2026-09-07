-- Owners who are registered trainers may edit any reservation type. Assigned
-- instructors retain lesson-only rights when the reservation belongs to others.
-- Cancellation rights are unchanged: this policy only permits confirmed rows.
create policy reservations_update_own_trainer
on public.reservations for update to authenticated
using (
  user_id = (select auth.uid())
  and status = 'confirmed'
  and starts_at >= (((now() at time zone 'Europe/Istanbul')::date - interval '1 month') at time zone 'Europe/Istanbul')
  and exists (select 1 from public.profiles where id = (select auth.uid()) and is_trainer)
)
with check (
  user_id = (select auth.uid())
  and status = 'confirmed'
  and starts_at >= (((now() at time zone 'Europe/Istanbul')::date - interval '1 month') at time zone 'Europe/Istanbul')
  and exists (select 1 from public.profiles where id = (select auth.uid()) and is_trainer)
);

create or replace function private.validate_lesson_trainer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  earliest_reservation timestamptz :=
    (((now() at time zone 'Europe/Istanbul')::date - interval '1 month') at time zone 'Europe/Istanbul');
  trainer_name text;
  is_lesson boolean := coalesce(public.is_lesson_reservation_note(new.note), false);
begin
  if tg_op = 'UPDATE' and current_user_id is not null and not public.is_admin() then
    if new.status = 'canceled' and old.status = 'confirmed'
       and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then
      return new; -- Existing RLS and cancellation triggers still apply.
    end if;

    if old.user_id = current_user_id and old.status = 'confirmed'
       and old.starts_at >= earliest_reservation
       and exists (select 1 from public.profiles where id = current_user_id and is_trainer) then
      if new.id is distinct from old.id or new.user_id is distinct from old.user_id
         or new.created_at is distinct from old.created_at
         or new.status is distinct from old.status
         or new.starts_at < earliest_reservation
         or not public.is_within_club_hours(new.starts_at, new.ends_at)
         or not exists (select 1 from public.courts where id = new.court_id and is_active) then
        raise exception 'Eğitmen kendi rezervasyonunu son bir ay içinde düzenleyebilir; bağlı üye ve kayıt kimliği değiştirilemez.' using errcode = '42501';
      end if;
    elsif old.trainer_id = current_user_id and old.status = 'confirmed'
       and old.starts_at >= earliest_reservation
       and exists (select 1 from public.profiles where id = current_user_id and is_trainer) then
      if new.id is distinct from old.id or new.user_id is distinct from old.user_id
         or new.trainer_id is distinct from old.trainer_id
         or new.created_at is distinct from old.created_at
         or not is_lesson or new.starts_at < earliest_reservation
         or not public.is_within_club_hours(new.starts_at, new.ends_at)
         or not exists (select 1 from public.courts where id = new.court_id and is_active) then
        raise exception 'Eğitmen yalnızca kendisine atanmış son bir aylık dersleri düzenleyebilir; bağlı üye ve eğitmen değiştirilemez.' using errcode = '42501';
      end if;
    else
      raise exception 'Bu rezervasyonu düzenleme yetkiniz yok.' using errcode = '42501';
    end if;
  end if;

  -- Preserve canceled legacy lessons with unresolved trainer names.
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
notify pgrst, 'reload schema';
