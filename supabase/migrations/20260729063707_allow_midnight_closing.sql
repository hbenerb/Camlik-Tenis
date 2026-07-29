create or replace function public.is_within_club_hours(
  start_time timestamptz,
  end_time timestamptz
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  with local_values as (
    select
      start_time at time zone settings.timezone as local_start,
      end_time at time zone settings.timezone as local_end,
      settings.opening_time,
      settings.closing_time
    from public.club_settings as settings
    where settings.id = 1
  )
  select
    local_start::time >= opening_time
    and (
      (
        local_start::date = local_end::date
        and local_end::time <= closing_time
      )
      or (
        closing_time = time '24:00'
        and local_end = date_trunc('day', local_start) + interval '1 day'
      )
    )
  from local_values;
$$;
