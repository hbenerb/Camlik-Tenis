create or replace function public.is_lesson_reservation_note(note_value text)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  parsed_note jsonb;
begin
  if note_value is null then
    return false;
  end if;

  begin
    parsed_note := note_value::jsonb;
  exception
    when others then
      return false;
  end;

  return parsed_note ->> 'kind' = 'lesson';
end;
$$;

revoke all on function public.is_lesson_reservation_note(text) from public;
grant execute on function public.is_lesson_reservation_note(text) to authenticated;

drop policy if exists reservations_update_own_lesson_trainer
on public.reservations;

create policy reservations_update_own_lesson_trainer
on public.reservations
for update
to authenticated
using (
  user_id = (select auth.uid())
  and status = 'confirmed'
  and starts_at >= now()
  and exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_trainer = true
  )
  and public.is_lesson_reservation_note(note)
)
with check (
  user_id = (select auth.uid())
  and status in ('confirmed', 'canceled')
  and public.is_lesson_reservation_note(note)
);

notify pgrst, 'reload schema';
