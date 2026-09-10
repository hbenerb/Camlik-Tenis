create or replace function public.is_within_club_hours(
  start_time timestamptz,
  end_time timestamptz
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with local_values as (
    select
      start_time at time zone settings.timezone as local_start,
      end_time at time zone settings.timezone as local_end,
      settings.opening_time,
      settings.closing_time
    from public.club_settings as settings
    where settings.id = 1
  ),
  club_hours as (
    select
      local_start,
      local_end,
      local_start::date + opening_time as opens_at,
      case
        when closing_time <= opening_time then
          local_start::date + interval '1 day' + closing_time
        else
          local_start::date + closing_time
      end as closes_at
    from local_values
  )
  select coalesce(
    (
      select
        local_end > local_start
        and local_start >= opens_at
        and local_end <= closes_at
      from club_hours
    ),
    false
  );
$$;
