alter table public.profiles
add column if not exists notification_enabled boolean not null default false;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  schedule_type text not null,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  interval_minutes integer,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_notifications_message_not_blank check (length(trim(message)) > 0),
  constraint app_notifications_schedule_type_check check (
    schedule_type in ('instant', 'scheduled', 'recurring')
  ),
  constraint app_notifications_status_check check (status in ('active', 'canceled')),
  constraint app_notifications_recurring_interval_check check (
    (schedule_type = 'recurring' and interval_minutes is not null and interval_minutes >= 1)
    or (schedule_type <> 'recurring' and interval_minutes is null)
  ),
  constraint app_notifications_expiry_check check (
    expires_at is null or expires_at >= starts_at
  )
);

create table if not exists public.app_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.app_notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  occurrence_at timestamptz not null,
  delivered_at timestamptz not null default now(),
  unique (notification_id, user_id, occurrence_at)
);

drop trigger if exists app_notifications_touch_updated_at on public.app_notifications;
create trigger app_notifications_touch_updated_at
before update on public.app_notifications
for each row execute function public.touch_updated_at();

alter table public.app_notifications enable row level security;
alter table public.app_notification_deliveries enable row level security;

drop policy if exists app_notifications_select_admin_or_due on public.app_notifications;
create policy app_notifications_select_admin_or_due
on public.app_notifications
for select
to authenticated
using (
  public.is_admin()
  or (
    status = 'active'
    and starts_at <= now()
    and (expires_at is null or expires_at >= now())
  )
);

drop policy if exists app_notifications_insert_admin on public.app_notifications;
create policy app_notifications_insert_admin
on public.app_notifications
for insert
to authenticated
with check (public.is_admin() and created_by = auth.uid());

drop policy if exists app_notifications_update_admin on public.app_notifications;
create policy app_notifications_update_admin
on public.app_notifications
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists app_notification_deliveries_select_own_or_admin on public.app_notification_deliveries;
create policy app_notification_deliveries_select_own_or_admin
on public.app_notification_deliveries
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists app_notification_deliveries_insert_own on public.app_notification_deliveries;
create policy app_notification_deliveries_insert_own
on public.app_notification_deliveries
for insert
to authenticated
with check (user_id = auth.uid());

create or replace function public.update_own_notification_preference(
  profile_notification_enabled boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Giris yapilmali.';
  end if;

  update public.profiles
  set notification_enabled = coalesce(profile_notification_enabled, false)
  where id = auth.uid()
  returning * into profile_row;

  if not found then
    raise exception 'Profil bulunamadi.';
  end if;

  return profile_row;
end;
$$;

grant select, insert, update on public.app_notifications to authenticated;
grant select, insert on public.app_notification_deliveries to authenticated;
grant execute on function public.update_own_notification_preference(boolean) to authenticated;

notify pgrst, 'reload schema';
