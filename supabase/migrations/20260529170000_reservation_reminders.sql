create table if not exists public.app_reservation_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reminder_minutes integer not null,
  delivered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint app_reservation_reminder_minutes_check check (
    reminder_minutes in (30, 60)
  ),
  unique (reservation_id, user_id, reminder_minutes)
);

alter table public.app_reservation_reminder_deliveries enable row level security;

drop policy if exists app_reservation_reminders_select_own_or_admin on public.app_reservation_reminder_deliveries;
create policy app_reservation_reminders_select_own_or_admin
on public.app_reservation_reminder_deliveries
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

grant select on public.app_reservation_reminder_deliveries to authenticated;

notify pgrst, 'reload schema';
