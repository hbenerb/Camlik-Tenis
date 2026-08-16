alter table public.tournaments
  add column if not exists color text;

update public.tournaments
set color = '#237000'
where color is null
   or color !~ '^#[0-9A-Fa-f]{6}$';

alter table public.tournaments
  alter column color set default '#237000',
  alter column color set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tournaments_color_hex_check'
      and conrelid = 'public.tournaments'::regclass
  ) then
    alter table public.tournaments
      add constraint tournaments_color_hex_check
      check (color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end
$$;

notify pgrst, 'reload schema';
