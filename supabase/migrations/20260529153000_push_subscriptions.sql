create table if not exists public.app_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

drop trigger if exists app_push_subscriptions_touch_updated_at on public.app_push_subscriptions;
create trigger app_push_subscriptions_touch_updated_at
before update on public.app_push_subscriptions
for each row execute function public.touch_updated_at();

alter table public.app_push_subscriptions enable row level security;

drop policy if exists app_push_subscriptions_select_own_or_admin on public.app_push_subscriptions;
create policy app_push_subscriptions_select_own_or_admin
on public.app_push_subscriptions
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists app_push_subscriptions_insert_own on public.app_push_subscriptions;
create policy app_push_subscriptions_insert_own
on public.app_push_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists app_push_subscriptions_update_own on public.app_push_subscriptions;
create policy app_push_subscriptions_update_own
on public.app_push_subscriptions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists app_push_subscriptions_delete_own on public.app_push_subscriptions;
create policy app_push_subscriptions_delete_own
on public.app_push_subscriptions
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.app_push_subscriptions to authenticated;

notify pgrst, 'reload schema';
