create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_stage_start_date date not null,
  group_stage_end_date date not null,
  finals_start_date date not null,
  finals_end_date date not null,
  is_active boolean not null default false,
  source_url text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournaments_name_not_blank check (length(trim(name)) > 0),
  constraint tournaments_name_unique unique (name),
  constraint tournaments_group_dates_valid check (
    group_stage_end_date >= group_stage_start_date
  ),
  constraint tournaments_final_dates_valid check (
    finals_end_date >= finals_start_date
    and finals_start_date > group_stage_end_date
  )
);

create table public.tournament_courts (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete restrict,
  primary key (tournament_id, court_id)
);

create table public.tournament_categories (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  group_count integer not null,
  group_size integer not null,
  display_order integer not null default 1,
  created_at timestamptz not null default now(),
  constraint tournament_categories_name_not_blank check (length(trim(name)) > 0),
  constraint tournament_categories_group_count_positive check (group_count > 0),
  constraint tournament_categories_group_size_positive check (group_size > 1),
  constraint tournament_categories_unique unique (tournament_id, name)
);

create table public.tournament_groups (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.tournament_categories(id) on delete cascade,
  name text not null,
  display_order integer not null default 1,
  created_at timestamptz not null default now(),
  constraint tournament_groups_name_not_blank check (length(trim(name)) > 0),
  constraint tournament_groups_unique unique (category_id, name)
);

create table public.tournament_participants (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.tournament_categories(id) on delete cascade,
  group_id uuid references public.tournament_groups(id) on delete set null,
  display_name text not null,
  display_order integer not null default 1,
  created_at timestamptz not null default now(),
  constraint tournament_participants_name_not_blank check (length(trim(display_name)) > 0),
  constraint tournament_participants_unique unique (category_id, display_name)
);

create table public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  category_id uuid not null references public.tournament_categories(id) on delete cascade,
  group_id uuid references public.tournament_groups(id) on delete set null,
  court_id uuid references public.courts(id) on delete set null,
  phase text not null default 'group',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  player1_name text not null,
  player2_name text not null,
  round_label text,
  status text not null default 'scheduled',
  source_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_matches_phase_valid check (phase in ('group', 'final')),
  constraint tournament_matches_status_valid check (status in ('scheduled', 'completed', 'canceled')),
  constraint tournament_matches_time_valid check (ends_at > starts_at),
  constraint tournament_matches_player1_not_blank check (length(trim(player1_name)) > 0),
  constraint tournament_matches_player2_not_blank check (length(trim(player2_name)) > 0),
  constraint tournament_matches_source_unique unique (tournament_id, source_key)
);

create index tournament_categories_tournament_id_idx
on public.tournament_categories (tournament_id);

create index tournament_groups_category_id_idx
on public.tournament_groups (category_id);

create index tournament_participants_category_id_idx
on public.tournament_participants (category_id);

create index tournament_participants_group_id_idx
on public.tournament_participants (group_id);

create index tournament_matches_tournament_starts_at_idx
on public.tournament_matches (tournament_id, starts_at);

create index tournament_matches_category_id_idx
on public.tournament_matches (category_id);

create index tournament_matches_group_id_idx
on public.tournament_matches (group_id);

create trigger tournaments_touch_updated_at
before update on public.tournaments
for each row execute function public.touch_updated_at();

create trigger tournament_matches_touch_updated_at
before update on public.tournament_matches
for each row execute function public.touch_updated_at();

grant select, insert, update, delete on table public.tournaments to authenticated;
grant select, insert, update, delete on table public.tournament_courts to authenticated;
grant select, insert, update, delete on table public.tournament_categories to authenticated;
grant select, insert, update, delete on table public.tournament_groups to authenticated;
grant select, insert, update, delete on table public.tournament_participants to authenticated;
grant select, insert, update, delete on table public.tournament_matches to authenticated;

alter table public.tournaments enable row level security;
alter table public.tournament_courts enable row level security;
alter table public.tournament_categories enable row level security;
alter table public.tournament_groups enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.tournament_matches enable row level security;

create policy "tournaments_select_active_or_admin"
on public.tournaments for select
to authenticated
using (is_active or (select public.is_admin()));

create policy "tournaments_manage_admin"
on public.tournaments for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "tournament_courts_select_visible"
on public.tournament_courts for select
to authenticated
using (
  exists (
    select 1
    from public.tournaments tournament
    where tournament.id = tournament_id
      and (tournament.is_active or (select public.is_admin()))
  )
);

create policy "tournament_courts_manage_admin"
on public.tournament_courts for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "tournament_categories_select_visible"
on public.tournament_categories for select
to authenticated
using (
  exists (
    select 1
    from public.tournaments tournament
    where tournament.id = tournament_id
      and (tournament.is_active or (select public.is_admin()))
  )
);

create policy "tournament_categories_manage_admin"
on public.tournament_categories for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "tournament_groups_select_visible"
on public.tournament_groups for select
to authenticated
using (
  exists (
    select 1
    from public.tournament_categories category
    join public.tournaments tournament on tournament.id = category.tournament_id
    where category.id = category_id
      and (tournament.is_active or (select public.is_admin()))
  )
);

create policy "tournament_groups_manage_admin"
on public.tournament_groups for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "tournament_participants_select_visible"
on public.tournament_participants for select
to authenticated
using (
  exists (
    select 1
    from public.tournament_categories category
    join public.tournaments tournament on tournament.id = category.tournament_id
    where category.id = category_id
      and (tournament.is_active or (select public.is_admin()))
  )
);

create policy "tournament_participants_manage_admin"
on public.tournament_participants for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "tournament_matches_select_visible"
on public.tournament_matches for select
to authenticated
using (
  exists (
    select 1
    from public.tournaments tournament
    where tournament.id = tournament_id
      and (tournament.is_active or (select public.is_admin()))
  )
);

create policy "tournament_matches_manage_admin"
on public.tournament_matches for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

with tournament_seed as (
  insert into public.tournaments (
    name,
    group_stage_start_date,
    group_stage_end_date,
    finals_start_date,
    finals_end_date,
    is_active,
    source_url,
    created_by
  )
  values (
    '29 Ekim',
    date '2026-08-17',
    date '2026-10-11',
    date '2026-10-12',
    date '2026-10-29',
    true,
    'https://docs.google.com/spreadsheets/d/1YhMzj1eUB1QVBZweP8yViOrnnLqnciSK1WEyVR_HAAI/edit?gid=38859326#gid=38859326',
    null
  )
  on conflict (name) do update
  set
    group_stage_start_date = excluded.group_stage_start_date,
    group_stage_end_date = excluded.group_stage_end_date,
    finals_start_date = excluded.finals_start_date,
    finals_end_date = excluded.finals_end_date,
    is_active = excluded.is_active,
    source_url = excluded.source_url
  returning id
)
insert into public.tournament_courts (tournament_id, court_id)
select tournament_seed.id, court.id
from tournament_seed
cross join public.courts court
where court.is_active
on conflict do nothing;

with category_seed as (
  select *
  from jsonb_to_recordset(
    $$[
      {"name":"Erkek Master","group_count":2,"group_size":5,"display_order":1},
      {"name":"Erkek İleri","group_count":2,"group_size":5,"display_order":2},
      {"name":"Kadın İleri","group_count":2,"group_size":4,"display_order":3},
      {"name":"Kadın Orta","group_count":1,"group_size":6,"display_order":4},
      {"name":"Erkek Orta","group_count":3,"group_size":4,"display_order":5},
      {"name":"YB Kadın","group_count":2,"group_size":4,"display_order":6},
      {"name":"Double Erkek","group_count":3,"group_size":4,"display_order":7},
      {"name":"OS - Mix","group_count":1,"group_size":4,"display_order":8},
      {"name":"İleri Mix","group_count":1,"group_size":6,"display_order":9},
      {"name":"Double Kadın","group_count":1,"group_size":4,"display_order":10}
    ]$$::jsonb
  ) as seed(name text, group_count integer, group_size integer, display_order integer)
), tournament_seed as (
  select id from public.tournaments where name = '29 Ekim'
)
insert into public.tournament_categories (
  tournament_id,
  name,
  group_count,
  group_size,
  display_order
)
select
  tournament_seed.id,
  category_seed.name,
  category_seed.group_count,
  category_seed.group_size,
  category_seed.display_order
from category_seed
cross join tournament_seed
on conflict (tournament_id, name) do update
set
  group_count = excluded.group_count,
  group_size = excluded.group_size,
  display_order = excluded.display_order;

with group_seed as (
  select *
  from jsonb_to_recordset(
    $$[
      {"category":"Erkek Master","name":"A","display_order":1},
      {"category":"Erkek Master","name":"B","display_order":2},
      {"category":"Erkek İleri","name":"A","display_order":1},
      {"category":"Erkek İleri","name":"B","display_order":2},
      {"category":"Kadın İleri","name":"A","display_order":1},
      {"category":"Kadın İleri","name":"B","display_order":2},
      {"category":"Kadın Orta","name":"A","display_order":1},
      {"category":"Erkek Orta","name":"A","display_order":1},
      {"category":"Erkek Orta","name":"B","display_order":2},
      {"category":"Erkek Orta","name":"C","display_order":3},
      {"category":"YB Kadın","name":"A","display_order":1},
      {"category":"YB Kadın","name":"B","display_order":2},
      {"category":"Double Erkek","name":"MSTR-A","display_order":1},
      {"category":"Double Erkek","name":"MSTR-B","display_order":2},
      {"category":"Double Erkek","name":"İS-A","display_order":3},
      {"category":"OS - Mix","name":"A","display_order":1},
      {"category":"İleri Mix","name":"A","display_order":1},
      {"category":"Double Kadın","name":"A","display_order":1}
    ]$$::jsonb
  ) as seed(category text, name text, display_order integer)
)
insert into public.tournament_groups (category_id, name, display_order)
select category.id, group_seed.name, group_seed.display_order
from group_seed
join public.tournaments tournament on tournament.name = '29 Ekim'
join public.tournament_categories category
  on category.tournament_id = tournament.id
  and category.name = group_seed.category
on conflict (category_id, name) do update
set display_order = excluded.display_order;

with participant_seed as (
  select *
  from jsonb_to_recordset(
    $$[
      {"c":"Erkek Master","g":"A","n":"Stefan De Jong"},{"c":"Erkek Master","g":"A","n":"Kemal Yardımcı"},{"c":"Erkek Master","g":"A","n":"Tuncer Afrodit"},{"c":"Erkek Master","g":"A","n":"Ali Koray Güzel"},{"c":"Erkek Master","g":"A","n":"Nail Çakırdere"},
      {"c":"Erkek Master","g":"B","n":"Gençay Üstünel"},{"c":"Erkek Master","g":"B","n":"Ahmet Ok"},{"c":"Erkek Master","g":"B","n":"Tayfun Bulut"},{"c":"Erkek Master","g":"B","n":"Turgay Afrodit"},{"c":"Erkek Master","g":"B","n":"Tuncer Akgün"},
      {"c":"Erkek İleri","g":"A","n":"Baru Harsa"},{"c":"Erkek İleri","g":"A","n":"Mete Albeyoğlu"},{"c":"Erkek İleri","g":"A","n":"Cenk Cömert"},{"c":"Erkek İleri","g":"A","n":"Ümit Ünal"},{"c":"Erkek İleri","g":"A","n":"Uğur Ataman"},
      {"c":"Erkek İleri","g":"B","n":"Haluk Sağun"},{"c":"Erkek İleri","g":"B","n":"İnan Özbakır"},{"c":"Erkek İleri","g":"B","n":"Ersin Başaran"},{"c":"Erkek İleri","g":"B","n":"Burçin Dere"},{"c":"Erkek İleri","g":"B","n":"Ümit İlyas"},
      {"c":"Kadın İleri","g":"A","n":"Esen Atay"},{"c":"Kadın İleri","g":"A","n":"Evrim Özcan"},{"c":"Kadın İleri","g":"A","n":"Zeynep Kürşat"},{"c":"Kadın İleri","g":"A","n":"Ekin Akgün"},
      {"c":"Kadın İleri","g":"B","n":"Naz Lale"},{"c":"Kadın İleri","g":"B","n":"Elif Bora"},{"c":"Kadın İleri","g":"B","n":"Zeliha Aysan"},{"c":"Kadın İleri","g":"B","n":"Günnur Algın"},
      {"c":"Kadın Orta","g":"A","n":"Çağla Bozkurt"},{"c":"Kadın Orta","g":"A","n":"Ecem Güzelhisar"},{"c":"Kadın Orta","g":"A","n":"Elif Ay"},{"c":"Kadın Orta","g":"A","n":"Gizem Topuz"},{"c":"Kadın Orta","g":"A","n":"Merve Timuçin"},{"c":"Kadın Orta","g":"A","n":"Semra Yumlu"},
      {"c":"Erkek Orta","g":"A","n":"Hüseyin Kahraman"},{"c":"Erkek Orta","g":"A","n":"Özcan Günay"},{"c":"Erkek Orta","g":"A","n":"Yunus Emre Yerekapan"},{"c":"Erkek Orta","g":"A","n":"Serhat Gürsan"},
      {"c":"Erkek Orta","g":"B","n":"Mehmet Yiğit"},{"c":"Erkek Orta","g":"B","n":"Bener Bozkurt"},{"c":"Erkek Orta","g":"B","n":"İlker Doğaç"},{"c":"Erkek Orta","g":"B","n":"Emre Karaaslan"},
      {"c":"Erkek Orta","g":"C","n":"Serdar Gürge"},{"c":"Erkek Orta","g":"C","n":"Cengiz Gültekin"},{"c":"Erkek Orta","g":"C","n":"Utku Ataman"},{"c":"Erkek Orta","g":"C","n":"Tuğberk Sepetçi"},
      {"c":"YB Kadın","g":"A","n":"Burcu Yalabık"},{"c":"YB Kadın","g":"A","n":"Özge Dönmez"},{"c":"YB Kadın","g":"A","n":"Esin Gülpınar"},{"c":"YB Kadın","g":"A","n":"Büşra Kaveloğlu"},
      {"c":"YB Kadın","g":"B","n":"Habibe Yağcı"},{"c":"YB Kadın","g":"B","n":"Münevver Oktay"},{"c":"YB Kadın","g":"B","n":"Evrim Gümüşsoy"},{"c":"YB Kadın","g":"B","n":"Gülfem Yavuz"},
      {"c":"Double Erkek","g":"MSTR-A","n":"Serkan-Ahmet Ok"},{"c":"Double Erkek","g":"MSTR-A","n":"Nail-Aydoğan"},{"c":"Double Erkek","g":"MSTR-A","n":"Kemal Yardımcı-Tayfun"},{"c":"Double Erkek","g":"MSTR-A","n":"Turgay-Tuncer Afrodit"},
      {"c":"Double Erkek","g":"MSTR-B","n":"Gençay-İbrahim"},{"c":"Double Erkek","g":"MSTR-B","n":"Kemal Hür-???"},{"c":"Double Erkek","g":"MSTR-B","n":"Özcan Günay-Tuncer Akgün"},{"c":"Double Erkek","g":"MSTR-B","n":"İnan-Ümit"},
      {"c":"Double Erkek","g":"İS-A","n":"Cenk-Haluk"},{"c":"Double Erkek","g":"İS-A","n":"Bener-Baru"},{"c":"Double Erkek","g":"İS-A","n":"Mete-Ersin"},{"c":"Double Erkek","g":"İS-A","n":"Yavuz Özden-Cengiz Gültekin"},
      {"c":"OS - Mix","g":"A","n":"Çağla-Bener"},{"c":"OS - Mix","g":"A","n":"Haluk-Gizem"},{"c":"OS - Mix","g":"A","n":"Cenk Cömert-Ayşe Cömert"},{"c":"OS - Mix","g":"A","n":"Ecem-Tuncer Akgün"},
      {"c":"İleri Mix","g":"A","n":"Zeliha-Aydoğan"},{"c":"İleri Mix","g":"A","n":"İnan-Zeynep"},{"c":"İleri Mix","g":"A","n":"Ahmet Ok-Naz"},{"c":"İleri Mix","g":"A","n":"Günnur Algın-Gençay"},{"c":"İleri Mix","g":"A","n":"Esen-Kemal Yardımcı"},{"c":"İleri Mix","g":"A","n":"Ekin-Serkan"},
      {"c":"Double Kadın","g":"A","n":"Zeliha-Zeynep"},{"c":"Double Kadın","g":"A","n":"Evrim Özcan-Fatma"},{"c":"Double Kadın","g":"A","n":"Günnur Algın-Ekin"},{"c":"Double Kadın","g":"A","n":"Mehtap-Nuray"}
    ]$$::jsonb
  ) as seed(c text, g text, n text)
), ordered_seed as (
  select *, row_number() over (partition by c order by g, n) as display_order
  from participant_seed
)
insert into public.tournament_participants (
  category_id,
  group_id,
  display_name,
  display_order
)
select category.id, tournament_group.id, seed.n, seed.display_order
from ordered_seed seed
join public.tournaments tournament on tournament.name = '29 Ekim'
join public.tournament_categories category
  on category.tournament_id = tournament.id
  and category.name = seed.c
join public.tournament_groups tournament_group
  on tournament_group.category_id = category.id
  and tournament_group.name = seed.g
on conflict (category_id, display_name) do update
set
  group_id = excluded.group_id,
  display_order = excluded.display_order;

with match_seed as (
  select *
  from jsonb_to_recordset(
    $$[{"d":"2026-08-17","s":"18:00","e":"19:30","c":"Erkek Orta","g":"C","a":"Serdar Gürge","b":"Cengiz Gültekin"},{"d":"2026-08-17","s":"19:30","e":"21:00","c":"Erkek İleri","g":"B","a":"Haluk Sağun","b":"Ersin Başaran"},{"d":"2026-08-17","s":"21:00","e":"22:30","c":"Kadın Orta","g":"A","a":"Ecem Güzelhisar","b":"Semra Yumlu"},{"d":"2026-08-18","s":"18:00","e":"19:30","c":"Erkek Orta","g":"B","a":"Mehmet Yiğit","b":"Bener Bozkurt"},{"d":"2026-08-18","s":"19:30","e":"21:00","c":"Double Erkek","g":"İS-A","a":"Cenk-Haluk","b":"Yavuz Özden-Cengiz Gültekin"},{"d":"2026-08-18","s":"21:00","e":"22:30","c":"Erkek Orta","g":"A","a":"Özcan Günay","b":"Yunus Emre Yerekapan"},{"d":"2026-08-19","s":"18:00","e":"19:30","c":"Erkek Master","g":"A","a":"Stefan De Jong","b":"Nail Çakırdere"},{"d":"2026-08-19","s":"19:30","e":"21:00","c":"Erkek İleri","g":"A","a":"Mete Albeyoğlu","b":"Uğur Ataman"},{"d":"2026-08-19","s":"21:00","e":"22:30","c":"Erkek Orta","g":"C","a":"Serdar Gürge","b":"Utku Ataman"},{"d":"2026-08-21","s":"18:00","e":"19:30","c":"Erkek Master","g":"B","a":"Gençay Üstünel","b":"Ahmet Ok"},{"d":"2026-08-21","s":"19:30","e":"21:00","c":"Erkek Orta","g":"A","a":"Hüseyin Kahraman","b":"Serhat Gürsan"},{"d":"2026-08-21","s":"21:00","e":"22:30","c":"Erkek İleri","g":"B","a":"Ersin Başaran","b":"Ümit İlyas"},{"d":"2026-08-22","s":"18:00","e":"19:30","c":"Double Erkek","g":"MSTR-B","a":"Gençay-İbrahim","b":"Kemal Hür-???"},{"d":"2026-08-22","s":"19:30","e":"21:00","c":"İleri Mix","g":"A","a":"Zeliha-Aydoğan","b":"İnan-Zeynep"},{"d":"2026-08-22","s":"21:00","e":"22:30","c":"Double Erkek","g":"İS-A","a":"Bener-Baru","b":"Mete-Ersin"},{"d":"2026-08-22","s":"22:30","e":"00:00","c":"Erkek Orta","g":"C","a":"Tuğberk Sepetçi","b":"Cengiz Gültekin"},{"d":"2026-08-23","s":"18:00","e":"19:30","c":"Kadın İleri","g":"A","a":"Esen Atay","b":"Evrim Özcan"},{"d":"2026-08-23","s":"19:30","e":"21:00","c":"Erkek Master","g":"B","a":"Ahmet Ok","b":"Turgay Afrodit"},{"d":"2026-08-23","s":"21:00","e":"22:30","c":"Kadın İleri","g":"A","a":"Esen Atay","b":"Zeynep Kürşat"},{"d":"2026-08-24","s":"18:00","e":"19:30","c":"Kadın Orta","g":"A","a":"Elif Ay","b":"Semra Yumlu"},{"d":"2026-08-24","s":"19:30","e":"21:00","c":"Kadın Orta","g":"A","a":"Çağla Bozkurt","b":"Merve Timuçin"},{"d":"2026-08-24","s":"21:00","e":"22:30","c":"Erkek Orta","g":"A","a":"Yunus Emre Yerekapan","b":"Serhat Gürsan"},{"d":"2026-08-25","s":"18:00","e":"19:30","c":"Erkek İleri","g":"A","a":"Baru Harsa","b":"Ümit Ünal"},{"d":"2026-08-26","s":"18:00","e":"19:30","c":"YB Kadın","g":"B","a":"Evrim Gümüşsoy","b":"Gülfem Yavuz"},{"d":"2026-08-26","s":"19:30","e":"21:00","c":"YB Kadın","g":"A","a":"Özge Dönmez","b":"Büşra Kaveloğlu"},{"d":"2026-08-26","s":"21:00","e":"22:30","c":"YB Kadın","g":"B","a":"Habibe Yağcı","b":"Münevver Oktay"},{"d":"2026-08-28","s":"18:00","e":"19:30","c":"Kadın Orta","g":"A","a":"Ecem Güzelhisar","b":"Elif Ay"},{"d":"2026-08-28","s":"19:30","e":"21:00","c":"Erkek Orta","g":"A","a":"Hüseyin Kahraman","b":"Özcan Günay"},{"d":"2026-08-28","s":"21:00","e":"22:30","c":"İleri Mix","g":"A","a":"İnan-Zeynep","b":"Ahmet Ok-Naz"},{"d":"2026-08-29","s":"18:00","e":"19:30","c":"Double Erkek","g":"MSTR-A","a":"Nail-Aydoğan","b":"Turgay-Tuncer Afrodit"},{"d":"2026-08-29","s":"19:30","e":"21:00","c":"Erkek Master","g":"B","a":"Tayfun Bulut","b":"Tuncer Akgün"},{"d":"2026-08-29","s":"21:00","e":"22:30","c":"Erkek Master","g":"A","a":"Tuncer Afrodit","b":"Ali Koray Güzel"},{"d":"2026-08-29","s":"22:30","e":"00:00","c":"OS - Mix","g":"A","a":"Çağla-Bener","b":"Ecem-Tuncer Akgün"},{"d":"2026-08-30","s":"18:00","e":"19:30","c":"İleri Mix","g":"A","a":"Ahmet Ok-Naz","b":"Esen-Kemal Yardımcı"},{"d":"2026-08-30","s":"19:30","e":"21:00","c":"Double Kadın","g":"A","a":"Zeliha-Zeynep","b":"Mehtap-Nuray"},{"d":"2026-08-30","s":"21:00","e":"22:30","c":"Kadın İleri","g":"A","a":"Esen Atay","b":"Ekin Akgün"},{"d":"2026-08-30","s":"22:30","e":"00:00","c":"OS - Mix","g":"A","a":"Haluk-Gizem","b":"Ecem-Tuncer Akgün"},{"d":"2026-08-31","s":"18:00","e":"19:30","c":"Kadın İleri","g":"A","a":"Evrim Özcan","b":"Ekin Akgün"},{"d":"2026-08-31","s":"19:30","e":"21:00","c":"YB Kadın","g":"B","a":"Münevver Oktay","b":"Evrim Gümüşsoy"},{"d":"2026-08-31","s":"21:00","e":"22:30","c":"YB Kadın","g":"A","a":"Burcu Yalabık","b":"Büşra Kaveloğlu"},{"d":"2026-09-01","s":"18:00","e":"19:30","c":"Erkek İleri","g":"B","a":"İnan Özbakır","b":"Ümit İlyas"},{"d":"2026-09-01","s":"19:30","e":"21:00","c":"Double Erkek","g":"İS-A","a":"Cenk-Haluk","b":"Bener-Baru"},{"d":"2026-09-02","s":"18:00","e":"19:30","c":"Kadın İleri","g":"B","a":"Naz Lale","b":"Zeliha Aysan"},{"d":"2026-09-02","s":"19:30","e":"21:00","c":"Kadın Orta","g":"A","a":"Gizem Topuz","b":"Merve Timuçin"},{"d":"2026-09-02","s":"21:00","e":"22:30","c":"Erkek Master","g":"A","a":"Kemal Yardımcı","b":"Ali Koray Güzel"},{"d":"2026-09-04","s":"18:00","e":"19:30","c":"Erkek İleri","g":"B","a":"Burçin Dere","b":"Ümit İlyas"},{"d":"2026-09-04","s":"19:30","e":"21:00","c":"Erkek Master","g":"A","a":"Stefan De Jong","b":"Ali Koray Güzel"},{"d":"2026-09-05","s":"18:00","e":"19:30","c":"İleri Mix","g":"A","a":"Zeliha-Aydoğan","b":"Ahmet Ok-Naz"},{"d":"2026-09-05","s":"19:30","e":"21:00","c":"İleri Mix","g":"A","a":"İnan-Zeynep","b":"Ekin-Serkan"},{"d":"2026-09-05","s":"21:00","e":"22:30","c":"Erkek Master","g":"A","a":"Tuncer Afrodit","b":"Nail Çakırdere"},{"d":"2026-09-05","s":"22:30","e":"00:00","c":"İleri Mix","g":"A","a":"Günnur Algın-Gençay","b":"Ekin-Serkan"},{"d":"2026-09-06","s":"18:00","e":"19:30","c":"İleri Mix","g":"A","a":"İnan-Zeynep","b":"Esen-Kemal Yardımcı"},{"d":"2026-09-06","s":"19:30","e":"21:00","c":"Double Kadın","g":"A","a":"Evrim Özcan-Fatma","b":"Günnur Algın-Ekin"},{"d":"2026-09-06","s":"21:00","e":"22:30","c":"Erkek Master","g":"A","a":"Kemal Yardımcı","b":"Nail Çakırdere"},{"d":"2026-09-06","s":"22:30","e":"00:00","c":"Erkek Master","g":"B","a":"Ahmet Ok","b":"Tuncer Akgün"},{"d":"2026-09-07","s":"18:00","e":"19:30","c":"Erkek Orta","g":"B","a":"Mehmet Yiğit","b":"İlker Doğaç"},{"d":"2026-09-07","s":"19:30","e":"21:00","c":"Erkek İleri","g":"A","a":"Cenk Cömert","b":"Uğur Ataman"},{"d":"2026-09-07","s":"21:00","e":"22:30","c":"Erkek Orta","g":"C","a":"Cengiz Gültekin","b":"Utku Ataman"},{"d":"2026-09-08","s":"18:00","e":"19:30","c":"Erkek Master","g":"B","a":"Gençay Üstünel","b":"Tayfun Bulut"},{"d":"2026-09-08","s":"19:30","e":"21:00","c":"Erkek İleri","g":"A","a":"Mete Albeyoğlu","b":"Ümit Ünal"},{"d":"2026-09-09","s":"18:00","e":"19:30","c":"Kadın Orta","g":"A","a":"Ecem Güzelhisar","b":"Gizem Topuz"},{"d":"2026-09-09","s":"19:30","e":"21:00","c":"YB Kadın","g":"A","a":"Burcu Yalabık","b":"Esin Gülpınar"},{"d":"2026-09-09","s":"21:00","e":"22:30","c":"Double Erkek","g":"MSTR-A","a":"Serkan-Ahmet Ok","b":"Kemal Yardımcı-Tayfun"},{"d":"2026-09-11","s":"18:00","e":"19:30","c":"Double Erkek","g":"İS-A","a":"Cenk-Haluk","b":"Mete-Ersin"},{"d":"2026-09-11","s":"19:30","e":"21:00","c":"Kadın İleri","g":"B","a":"Naz Lale","b":"Günnur Algın"},{"d":"2026-09-11","s":"21:00","e":"22:30","c":"Erkek İleri","g":"B","a":"İnan Özbakır","b":"Burçin Dere"},{"d":"2026-09-12","s":"18:00","e":"19:30","c":"Double Erkek","g":"MSTR-A","a":"Kemal Yardımcı-Tayfun","b":"Turgay-Tuncer Afrodit"},{"d":"2026-09-12","s":"19:30","e":"21:00","c":"Erkek Orta","g":"B","a":"Bener Bozkurt","b":"Emre Karaaslan"},{"d":"2026-09-12","s":"21:00","e":"22:30","c":"İleri Mix","g":"A","a":"Esen-Kemal Yardımcı","b":"Ekin-Serkan"},{"d":"2026-09-12","s":"22:30","e":"00:00","c":"Erkek Master","g":"B","a":"Turgay Afrodit","b":"Tuncer Akgün"},{"d":"2026-09-13","s":"18:00","e":"19:30","c":"Double Erkek","g":"MSTR-B","a":"Gençay-İbrahim","b":"Özcan Günay-Tuncer Akgün"},{"d":"2026-09-13","s":"19:30","e":"21:00","c":"Double Kadın","g":"A","a":"Günnur Algın-Ekin","b":"Mehtap-Nuray"},{"d":"2026-09-13","s":"21:00","e":"22:30","c":"Erkek İleri","g":"A","a":"Ümit Ünal","b":"Uğur Ataman"},{"d":"2026-09-13","s":"22:30","e":"00:00","c":"Erkek Master","g":"B","a":"Ahmet Ok","b":"Tayfun Bulut"},{"d":"2026-09-14","s":"18:00","e":"19:30","c":"YB Kadın","g":"A","a":"Burcu Yalabık","b":"Özge Dönmez"},{"d":"2026-09-14","s":"19:30","e":"21:00","c":"YB Kadın","g":"B","a":"Habibe Yağcı","b":"Gülfem Yavuz"},{"d":"2026-09-15","s":"19:30","e":"21:00","c":"Kadın Orta","g":"A","a":"Çağla Bozkurt","b":"Gizem Topuz"},{"d":"2026-09-15","s":"21:00","e":"22:30","c":"Double Kadın","g":"A","a":"Zeliha-Zeynep","b":"Evrim Özcan-Fatma"},{"d":"2026-09-16","s":"18:00","e":"19:30","c":"Kadın Orta","g":"A","a":"Elif Ay","b":"Gizem Topuz"},{"d":"2026-09-16","s":"19:30","e":"21:00","c":"Erkek Master","g":"A","a":"Stefan De Jong","b":"Kemal Yardımcı"},{"d":"2026-09-16","s":"21:00","e":"22:30","c":"Kadın Orta","g":"A","a":"Merve Timuçin","b":"Semra Yumlu"},{"d":"2026-09-18","s":"18:00","e":"19:30","c":"İleri Mix","g":"A","a":"Zeliha-Aydoğan","b":"Günnur Algın-Gençay"},{"d":"2026-09-18","s":"19:30","e":"21:00","c":"Erkek İleri","g":"B","a":"İnan Özbakır","b":"Ersin Başaran"},{"d":"2026-09-18","s":"21:00","e":"22:30","c":"Erkek Orta","g":"C","a":"Tuğberk Sepetçi","b":"Serdar Gürge"},{"d":"2026-09-19","s":"18:00","e":"19:30","c":"İleri Mix","g":"A","a":"Günnur Algın-Gençay","b":"Esen-Kemal Yardımcı"},{"d":"2026-09-19","s":"19:30","e":"21:00","c":"Double Erkek","g":"MSTR-A","a":"Serkan-Ahmet Ok","b":"Turgay-Tuncer Afrodit"},{"d":"2026-09-19","s":"21:00","e":"22:30","c":"Double Erkek","g":"MSTR-B","a":"Kemal Hür-???","b":"Özcan Günay-Tuncer Akgün"},{"d":"2026-09-19","s":"22:30","e":"00:00","c":"Erkek Master","g":"A","a":"Kemal Yardımcı","b":"Tuncer Afrodit"},{"d":"2026-09-20","s":"18:00","e":"19:30","c":"Double Erkek","g":"MSTR-B","a":"Gençay-İbrahim","b":"İnan-Ümit"},{"d":"2026-09-20","s":"19:30","e":"21:00","c":"Kadın İleri","g":"A","a":"Evrim Özcan","b":"Zeynep Kürşat"},{"d":"2026-09-20","s":"21:00","e":"22:30","c":"OS - Mix","g":"A","a":"Cenk Cömert-Ayşe Cömert","b":"Ecem-Tuncer Akgün"},{"d":"2026-09-21","s":"18:00","e":"19:30","c":"YB Kadın","g":"B","a":"Habibe Yağcı","b":"Evrim Gümüşsoy"},{"d":"2026-09-21","s":"19:30","e":"21:00","c":"Kadın Orta","g":"A","a":"Çağla Bozkurt","b":"Ecem Güzelhisar"},{"d":"2026-09-21","s":"21:00","e":"22:30","c":"Erkek Master","g":"B","a":"Gençay Üstünel","b":"Turgay Afrodit"},{"d":"2026-09-22","s":"18:00","e":"19:30","c":"Erkek Orta","g":"B","a":"Emre Karaaslan","b":"İlker Doğaç"},{"d":"2026-09-22","s":"19:30","e":"21:00","c":"Erkek İleri","g":"B","a":"Haluk Sağun","b":"Ümit İlyas"},{"d":"2026-09-22","s":"21:00","e":"22:30","c":"OS - Mix","g":"A","a":"Çağla-Bener","b":"Cenk Cömert-Ayşe Cömert"},{"d":"2026-09-23","s":"18:00","e":"19:30","c":"Erkek İleri","g":"A","a":"Cenk Cömert","b":"Ümit Ünal"},{"d":"2026-09-23","s":"19:30","e":"21:00","c":"YB Kadın","g":"B","a":"Münevver Oktay","b":"Gülfem Yavuz"},{"d":"2026-09-23","s":"21:00","e":"22:30","c":"YB Kadın","g":"A","a":"Esin Gülpınar","b":"Büşra Kaveloğlu"},{"d":"2026-09-25","s":"18:00","e":"19:30","c":"Erkek İleri","g":"A","a":"Baru Harsa","b":"Cenk Cömert"},{"d":"2026-09-25","s":"19:30","e":"21:00","c":"YB Kadın","g":"A","a":"Özge Dönmez","b":"Esin Gülpınar"},{"d":"2026-09-25","s":"21:00","e":"22:30","c":"Double Erkek","g":"MSTR-A","a":"Nail-Aydoğan","b":"Kemal Yardımcı-Tayfun"},{"d":"2026-09-26","s":"18:00","e":"19:30","c":"Erkek İleri","g":"B","a":"Haluk Sağun","b":"Burçin Dere"},{"d":"2026-09-26","s":"19:30","e":"21:00","c":"Kadın İleri","g":"B","a":"Naz Lale","b":"Elif Bora"},{"d":"2026-09-26","s":"21:00","e":"22:30","c":"Double Erkek","g":"MSTR-A","a":"Serkan-Ahmet Ok","b":"Nail-Aydoğan"},{"d":"2026-09-27","s":"18:00","e":"19:30","c":"Double Erkek","g":"MSTR-B","a":"Kemal Hür-???","b":"İnan-Ümit"},{"d":"2026-09-27","s":"19:30","e":"21:00","c":"Erkek Orta","g":"C","a":"Tuğberk Sepetçi","b":"Utku Ataman"},{"d":"2026-09-27","s":"21:00","e":"22:30","c":"Erkek İleri","g":"A","a":"Baru Harsa","b":"Uğur Ataman"},{"d":"2026-09-28","s":"18:00","e":"19:30","c":"İleri Mix","g":"A","a":"Ahmet Ok-Naz","b":"Günnur Algın-Gençay"},{"d":"2026-09-28","s":"19:30","e":"21:00","c":"Kadın Orta","g":"A","a":"Gizem Topuz","b":"Semra Yumlu"},{"d":"2026-09-28","s":"21:00","e":"22:30","c":"Kadın Orta","g":"A","a":"Çağla Bozkurt","b":"Semra Yumlu"},{"d":"2026-09-29","s":"18:00","e":"19:30","c":"Kadın Orta","g":"A","a":"Elif Ay","b":"Merve Timuçin"},{"d":"2026-09-29","s":"19:30","e":"21:00","c":"Double Erkek","g":"İS-A","a":"Mete-Ersin","b":"Yavuz Özden-Cengiz Gültekin"},{"d":"2026-09-29","s":"21:00","e":"22:30","c":"Erkek İleri","g":"A","a":"Mete Albeyoğlu","b":"Cenk Cömert"},{"d":"2026-09-30","s":"18:00","e":"19:30","c":"Kadın İleri","g":"B","a":"Elif Bora","b":"Zeliha Aysan"},{"d":"2026-09-30","s":"19:30","e":"21:00","c":"OS - Mix","g":"A","a":"Çağla-Bener","b":"Haluk-Gizem"},{"d":"2026-10-02","s":"18:00","e":"19:30","c":"Double Erkek","g":"İS-A","a":"Bener-Baru","b":"Yavuz Özden-Cengiz Gültekin"},{"d":"2026-10-02","s":"19:30","e":"21:00","c":"Double Kadın","g":"A","a":"Evrim Özcan-Fatma","b":"Mehtap-Nuray"},{"d":"2026-10-02","s":"21:00","e":"22:30","c":"Erkek Orta","g":"A","a":"Özcan Günay","b":"Serhat Gürsan"},{"d":"2026-10-03","s":"18:00","e":"19:30","c":"Kadın İleri","g":"B","a":"Zeliha Aysan","b":"Günnur Algın"},{"d":"2026-10-03","s":"19:30","e":"21:00","c":"Erkek Master","g":"B","a":"Gençay Üstünel","b":"Tuncer Akgün"},{"d":"2026-10-03","s":"21:00","e":"22:30","c":"İleri Mix","g":"A","a":"Zeliha-Aydoğan","b":"Ekin-Serkan"},{"d":"2026-10-04","s":"18:00","e":"19:30","c":"İleri Mix","g":"A","a":"Ahmet Ok-Naz","b":"Ekin-Serkan"},{"d":"2026-10-04","s":"19:30","e":"21:00","c":"Erkek Master","g":"A","a":"Ali Koray Güzel","b":"Nail Çakırdere"},{"d":"2026-10-04","s":"21:00","e":"22:30","c":"Kadın İleri","g":"A","a":"Zeynep Kürşat","b":"Ekin Akgün"},{"d":"2026-10-05","s":"18:00","e":"19:30","c":"Kadın Orta","g":"A","a":"Ecem Güzelhisar","b":"Merve Timuçin"},{"d":"2026-10-05","s":"19:30","e":"21:00","c":"Erkek İleri","g":"A","a":"Baru Harsa","b":"Mete Albeyoğlu"},{"d":"2026-10-05","s":"21:00","e":"22:30","c":"Erkek Orta","g":"B","a":"Bener Bozkurt","b":"İlker Doğaç"},{"d":"2026-10-06","s":"18:00","e":"19:30","c":"Kadın İleri","g":"B","a":"Elif Bora","b":"Günnur Algın"},{"d":"2026-10-06","s":"19:30","e":"21:00","c":"Erkek Orta","g":"B","a":"Mehmet Yiğit","b":"Emre Karaaslan"},{"d":"2026-10-07","s":"18:00","e":"19:30","c":"OS - Mix","g":"A","a":"Haluk-Gizem","b":"Cenk Cömert-Ayşe Cömert"},{"d":"2026-10-07","s":"19:30","e":"21:00","c":"Erkek Orta","g":"A","a":"Hüseyin Kahraman","b":"Yunus Emre Yerekapan"},{"d":"2026-10-09","s":"18:00","e":"19:30","c":"Erkek Master","g":"A","a":"Stefan De Jong","b":"Tuncer Afrodit"},{"d":"2026-10-09","s":"19:30","e":"21:00","c":"Erkek İleri","g":"B","a":"Ersin Başaran","b":"Burçin Dere"},{"d":"2026-10-09","s":"21:00","e":"22:30","c":"Kadın Orta","g":"A","a":"Çağla Bozkurt","b":"Elif Ay"},{"d":"2026-10-10","s":"18:00","e":"19:30","c":"İleri Mix","g":"A","a":"İnan-Zeynep","b":"Günnur Algın-Gençay"},{"d":"2026-10-10","s":"19:30","e":"21:00","c":"İleri Mix","g":"A","a":"Zeliha-Aydoğan","b":"Esen-Kemal Yardımcı"},{"d":"2026-10-10","s":"21:00","e":"22:30","c":"Erkek Master","g":"B","a":"Tayfun Bulut","b":"Turgay Afrodit"},{"d":"2026-10-11","s":"18:00","e":"19:30","c":"Double Kadın","g":"A","a":"Zeliha-Zeynep","b":"Günnur Algın-Ekin"},{"d":"2026-10-11","s":"19:30","e":"21:00","c":"Erkek İleri","g":"B","a":"Haluk Sağun","b":"İnan Özbakır"},{"d":"2026-10-11","s":"21:00","e":"22:30","c":"Double Erkek","g":"MSTR-B","a":"Özcan Günay-Tuncer Akgün","b":"İnan-Ümit"}]$$::jsonb
  ) as seed(d date, s time, e time, c text, g text, a text, b text)
), resolved_seed as (
  select
    tournament.id as tournament_id,
    category.id as category_id,
    tournament_group.id as group_id,
    (
      select tournament_court.court_id
      from public.tournament_courts tournament_court
      join public.courts court on court.id = tournament_court.court_id
      where tournament_court.tournament_id = tournament.id
      order by court.display_order, court.name
      limit 1
    ) as court_id,
    (match_seed.d + match_seed.s) at time zone 'Europe/Istanbul' as starts_at,
    (
      match_seed.d
      + case when match_seed.e <= match_seed.s then 1 else 0 end
      + match_seed.e
    ) at time zone 'Europe/Istanbul' as ends_at,
    match_seed.a as player1_name,
    match_seed.b as player2_name,
    match_seed.d::text || '-' || to_char(match_seed.s, 'HH24MI') as source_key
  from match_seed
  join public.tournaments tournament on tournament.name = '29 Ekim'
  join public.tournament_categories category
    on category.tournament_id = tournament.id
    and category.name = match_seed.c
  join public.tournament_groups tournament_group
    on tournament_group.category_id = category.id
    and tournament_group.name = match_seed.g
)
insert into public.tournament_matches (
  tournament_id,
  category_id,
  group_id,
  court_id,
  phase,
  starts_at,
  ends_at,
  player1_name,
  player2_name,
  status,
  source_key
)
select
  tournament_id,
  category_id,
  group_id,
  court_id,
  'group',
  starts_at,
  ends_at,
  player1_name,
  player2_name,
  'scheduled',
  source_key
from resolved_seed
on conflict (tournament_id, source_key) do update
set
  category_id = excluded.category_id,
  group_id = excluded.group_id,
  court_id = excluded.court_id,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  player1_name = excluded.player1_name,
  player2_name = excluded.player2_name,
  status = excluded.status;
