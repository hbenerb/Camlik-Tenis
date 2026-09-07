-- A non-admin may only choose their own registered trainer identity when
-- inserting a lesson or changing a lesson assignment. Existing assignments
-- remain intact when an authorized owner/instructor only edits other fields.
create function private.enforce_self_lesson_assignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or public.is_admin()
     or not coalesce(public.is_lesson_reservation_note(new.note), false) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(public.is_lesson_reservation_note(old.note), false)
       and new.trainer_id is not distinct from old.trainer_id then
      return new; -- Authorization and registered-trainer validation still run.
    end if;
  end if;

  if new.trainer_id is distinct from current_user_id
     or not exists (select 1 from public.profiles where id = current_user_id and is_trainer) then
    raise exception 'Eğitmenler ders için yalnızca kendi hesaplarını seçebilir.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_self_lesson_assignment() from public, anon, authenticated;

create trigger enforce_self_lesson_assignment
before insert or update on public.reservations
for each row execute function private.enforce_self_lesson_assignment();

notify pgrst, 'reload schema';
