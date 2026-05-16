grant usage on schema public to anon, authenticated;
grant select on public.courts to anon, authenticated;
grant insert, update, delete on public.courts to authenticated;

create or replace function public.is_bootstrap_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(auth.jwt()->>'email', '')) = 'hbenerb@gmail.com'
    or exists (
      select 1
      from auth.users
      where users.id = auth.uid()
        and lower(coalesce(users.email, '')) = 'hbenerb@gmail.com'
    );
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_bootstrap_super_admin() then 'super_admin'::public.app_role
    else (
      select profiles.app_role
      from public.profiles
      where profiles.id = auth.uid()
    )
  end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('admin', 'super_admin'), false);
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'super_admin', false);
$$;

create or replace function public.admin_delete_court(target_court_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Sadece bas admin kort silebilir.';
  end if;

  if exists (
    select 1
    from public.reservations
    where reservations.court_id = target_court_id
  ) then
    raise exception 'Bu kortta rezervasyon kaydi oldugu icin silinemez. Kortu pasif yapabilirsiniz.';
  end if;

  delete from public.courts
  where courts.id = target_court_id;

  if not found then
    raise exception 'Kort bulunamadi.';
  end if;
end;
$$;

grant execute on function public.admin_delete_court(uuid) to authenticated;

alter table public.courts enable row level security;

drop policy if exists courts_update_admin on public.courts;
drop policy if exists "courts_update_admin" on public.courts;

create policy courts_update_admin
on public.courts
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists courts_delete_super_admin on public.courts;
drop policy if exists "courts_delete_super_admin" on public.courts;

create policy courts_delete_super_admin
on public.courts
for delete
to authenticated
using (public.is_super_admin());

notify pgrst, 'reload schema';
