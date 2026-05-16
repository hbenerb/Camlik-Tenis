insert into public.club_settings (id)
values (1)
on conflict (id) do nothing;

insert into public.courts (name, display_order, is_active)
select 'Kort 1', 1, true
where not exists (
  select 1 from public.courts where lower(name) = lower('Kort 1')
);

insert into public.courts (name, display_order, is_active)
select 'Kort 2', 2, true
where not exists (
  select 1 from public.courts where lower(name) = lower('Kort 2')
);

update public.courts
set is_active = true
where lower(name) in (lower('Kort 1'), lower('Kort 2'));

