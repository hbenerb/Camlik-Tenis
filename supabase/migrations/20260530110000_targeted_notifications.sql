alter table public.app_notifications
add column if not exists target_user_id uuid references public.profiles(id) on delete set null;

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
    and (target_user_id is null or target_user_id = auth.uid())
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

notify pgrst, 'reload schema';
