create or replace function public.debug_tennis_setup()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'courts_count', (select count(*) from public.courts),
    'active_courts_count', (select count(*) from public.courts where is_active = true),
    'club_settings_count', (select count(*) from public.club_settings),
    'profiles_count', (select count(*) from public.profiles),
    'hbenerb_profile', (
      select jsonb_build_object(
        'email', profiles.email,
        'app_role', profiles.app_role,
        'is_club_member', profiles.is_club_member
      )
      from public.profiles
      where lower(profiles.email) = 'hbenerb@gmail.com'
      limit 1
    ),
    'courts', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'name', courts.name,
            'display_order', courts.display_order,
            'is_active', courts.is_active
          )
          order by courts.display_order
        ),
        '[]'::jsonb
      )
      from public.courts
    ),
    'court_policies', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'policyname', policies.policyname,
            'roles', policies.roles,
            'cmd', policies.cmd,
            'qual', policies.qual,
            'with_check', policies.with_check
          )
          order by policies.policyname
        ),
        '[]'::jsonb
      )
      from pg_policies as policies
      where policies.schemaname = 'public'
        and policies.tablename = 'courts'
    ),
    'anon_can_select_courts', has_table_privilege('anon', 'public.courts', 'select'),
    'authenticated_can_select_courts', has_table_privilege('authenticated', 'public.courts', 'select')
  );
$$;

grant execute on function public.debug_tennis_setup() to anon, authenticated;

notify pgrst, 'reload schema';

