create table public.tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  display_name text not null,
  display_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_players_name_not_blank check (length(trim(display_name)) > 0)
);

create unique index tournament_players_tournament_name_unique_idx
on public.tournament_players (tournament_id, lower(trim(display_name)));

create index tournament_players_tournament_order_idx
on public.tournament_players (tournament_id, display_order, id);

create table public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.tournament_categories(id) on delete cascade,
  group_id uuid references public.tournament_groups(id) on delete set null,
  display_order integer not null default 1,
  created_at timestamptz not null default now()
);

create index tournament_entries_category_order_idx
on public.tournament_entries (category_id, display_order, id);

create index tournament_entries_group_order_idx
on public.tournament_entries (group_id, display_order, id);

create table public.tournament_entry_players (
  entry_id uuid not null references public.tournament_entries(id) on delete cascade,
  player_id uuid not null references public.tournament_players(id) on delete restrict,
  position smallint not null,
  created_at timestamptz not null default now(),
  primary key (entry_id, position),
  constraint tournament_entry_players_position_valid check (position in (1, 2)),
  constraint tournament_entry_players_player_unique unique (entry_id, player_id)
);

create index tournament_entry_players_player_id_idx
on public.tournament_entry_players (player_id, entry_id);

alter table public.tournament_matches
add column player1_entry_id uuid references public.tournament_entries(id) on delete restrict,
add column player2_entry_id uuid references public.tournament_entries(id) on delete restrict;

insert into public.tournament_entries (
  id,
  category_id,
  group_id,
  display_order,
  created_at
)
select
  participant.id,
  participant.category_id,
  participant.group_id,
  participant.display_order,
  participant.created_at
from public.tournament_participants participant;

create temporary table tournament_entry_token_map (
  entry_id uuid not null,
  tournament_id uuid not null,
  position smallint not null,
  raw_name text not null,
  canonical_name text not null
) on commit drop;

insert into tournament_entry_token_map (
  entry_id,
  tournament_id,
  position,
  raw_name,
  canonical_name
)
select
  participant.id,
  category.tournament_id,
  token.position::smallint,
  trim(token.player_name),
  trim(token.player_name)
from public.tournament_participants participant
join public.tournament_categories category
  on category.id = participant.category_id
cross join lateral (
  select split.player_name, split.position
  from regexp_split_to_table(
    participant.display_name,
    '\s*-\s*'
  ) with ordinality as split(player_name, position)
  where (
    lower(category.name) like '%double%'
    or lower(category.name) like '%mix%'
  )
  union all
  select participant.display_name, 1::bigint
  where not (
    lower(category.name) like '%double%'
    or lower(category.name) like '%mix%'
  )
) token
where token.position <= 2
  and length(trim(token.player_name)) > 0;

create temporary table tournament_player_aliases (
  tournament_name text not null,
  alias_name text not null,
  canonical_name text not null,
  primary key (tournament_name, alias_name)
) on commit drop;

insert into tournament_player_aliases (
  tournament_name,
  alias_name,
  canonical_name
)
values
  ('29 Ekim', 'Ahmet', 'Ahmet Ok'),
  ('29 Ekim', 'Baru', 'Baru Harsa'),
  ('29 Ekim', 'Bener', 'Bener Bozkurt'),
  ('29 Ekim', 'Burçin', 'Burçin Dere'),
  ('29 Ekim', 'Cenk', 'Cenk Cömert'),
  ('29 Ekim', 'Cengiz', 'Cengiz Gültekin'),
  ('29 Ekim', 'Çağla', 'Çağla Bozkurt'),
  ('29 Ekim', 'Ecem', 'Ecem Güzelhisar'),
  ('29 Ekim', 'Ekin', 'Ekin Akgün'),
  ('29 Ekim', 'Ersin', 'Ersin Başaran'),
  ('29 Ekim', 'Esen', 'Esen Atay'),
  ('29 Ekim', 'Gençay', 'Gençay Üstünel'),
  ('29 Ekim', 'Gizem', 'Gizem Topuz'),
  ('29 Ekim', 'Günnur', 'Günnur Algın'),
  ('29 Ekim', 'Haluk', 'Haluk Sağun'),
  ('29 Ekim', 'İnan', 'İnan Özbakır'),
  ('29 Ekim', 'Kemal Yardımcı', 'Kemal Yardımcı'),
  ('29 Ekim', 'Mete', 'Mete Albeyoğlu'),
  ('29 Ekim', 'Nail', 'Nail Çakırdere'),
  ('29 Ekim', 'Naz', 'Naz Lale'),
  ('29 Ekim', 'Özcan', 'Özcan Günay'),
  ('29 Ekim', 'Tayfun', 'Tayfun Bulut'),
  ('29 Ekim', 'Turgay', 'Turgay Afrodit'),
  ('29 Ekim', 'Ümit', 'Ümit İlyas'),
  ('29 Ekim', 'Zeliha', 'Zeliha Aysan'),
  ('29 Ekim', 'Zeynep', 'Zeynep Kürşat');

update tournament_entry_token_map token
set canonical_name = player_alias.canonical_name
from public.tournaments tournament
join tournament_player_aliases player_alias
  on lower(trim(player_alias.tournament_name)) = lower(trim(tournament.name))
where tournament.id = token.tournament_id
  and lower(trim(player_alias.alias_name)) = lower(trim(token.raw_name));

with single_player_names as (
  select
    category.tournament_id,
    participant.display_name,
    lower(split_part(trim(participant.display_name), ' ', 1)) as first_name,
    count(*) over (
      partition by
        category.tournament_id,
        lower(split_part(trim(participant.display_name), ' ', 1))
    ) as first_name_count
  from public.tournament_participants participant
  join public.tournament_categories category
    on category.id = participant.category_id
  where lower(category.name) not like '%double%'
    and lower(category.name) not like '%mix%'
)
update tournament_entry_token_map token
set canonical_name = single_player.display_name
from single_player_names single_player
where token.tournament_id = single_player.tournament_id
  and token.canonical_name = token.raw_name
  and position(' ' in trim(token.raw_name)) = 0
  and lower(trim(token.raw_name)) = single_player.first_name
  and single_player.first_name_count = 1;

insert into public.tournament_players (
  tournament_id,
  display_name,
  display_order,
  created_at,
  updated_at
)
select
  unique_token.tournament_id,
  unique_token.canonical_name,
  row_number() over (
    partition by unique_token.tournament_id
    order by unique_token.canonical_name
  ),
  now(),
  now()
from (
  select distinct on (token.tournament_id, lower(trim(token.canonical_name)))
    token.tournament_id,
    token.canonical_name
  from tournament_entry_token_map token
  order by
    token.tournament_id,
    lower(trim(token.canonical_name)),
    token.canonical_name
) unique_token;

insert into public.tournament_entry_players (
  entry_id,
  player_id,
  position
)
select
  token.entry_id,
  player.id,
  token.position
from tournament_entry_token_map token
join public.tournament_players player
  on player.tournament_id = token.tournament_id
  and lower(trim(player.display_name)) = lower(trim(token.canonical_name));

update public.tournament_matches tournament_match
set
  player1_entry_id = (
    select participant.id
    from public.tournament_participants participant
    where participant.category_id = tournament_match.category_id
      and lower(trim(participant.display_name)) =
        lower(trim(tournament_match.player1_name))
    order by participant.display_order, participant.id
    limit 1
  ),
  player2_entry_id = (
    select participant.id
    from public.tournament_participants participant
    where participant.category_id = tournament_match.category_id
      and lower(trim(participant.display_name)) =
        lower(trim(tournament_match.player2_name))
    order by participant.display_order, participant.id
    limit 1
  );

do $$
begin
  if exists (
    select 1
    from public.tournament_matches tournament_match
    where tournament_match.player1_entry_id is null
      or tournament_match.player2_entry_id is null
  ) then
    raise exception 'Bazı turnuva maçları katılımcı kayıtlarına bağlanamadı.';
  end if;
end;
$$;

alter table public.tournament_matches
alter column player1_entry_id set not null,
alter column player2_entry_id set not null;

update public.tournament_matches tournament_match
set
  player1_name = (
    select string_agg(player.display_name, '-' order by entry_player.position)
    from public.tournament_entry_players entry_player
    join public.tournament_players player on player.id = entry_player.player_id
    where entry_player.entry_id = tournament_match.player1_entry_id
  ),
  player2_name = (
    select string_agg(player.display_name, '-' order by entry_player.position)
    from public.tournament_entry_players entry_player
    join public.tournament_players player on player.id = entry_player.player_id
    where entry_player.entry_id = tournament_match.player2_entry_id
  );

create index tournament_matches_player1_entry_id_idx
on public.tournament_matches (player1_entry_id);

create index tournament_matches_player2_entry_id_idx
on public.tournament_matches (player2_entry_id);

create trigger tournament_players_touch_updated_at
before update on public.tournament_players
for each row execute function public.touch_updated_at();

create or replace function public.sync_tournament_match_entry_names()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select string_agg(player.display_name, '-' order by entry_player.position)
  into new.player1_name
  from public.tournament_entry_players entry_player
  join public.tournament_players player on player.id = entry_player.player_id
  where entry_player.entry_id = new.player1_entry_id;

  select string_agg(player.display_name, '-' order by entry_player.position)
  into new.player2_name
  from public.tournament_entry_players entry_player
  join public.tournament_players player on player.id = entry_player.player_id
  where entry_player.entry_id = new.player2_entry_id;

  if new.player1_name is null or new.player2_name is null then
    raise exception 'Maç taraflarında en az bir oyuncu bulunmalı.';
  end if;

  return new;
end;
$$;

create trigger tournament_matches_sync_entry_names
before insert or update of player1_entry_id, player2_entry_id
on public.tournament_matches
for each row execute function public.sync_tournament_match_entry_names();

create or replace function public.refresh_tournament_match_names_for_entry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_entry_id uuid;
  entry_name text;
begin
  if tg_op = 'DELETE' then
    affected_entry_id := old.entry_id;
  else
    affected_entry_id := new.entry_id;
  end if;

  select string_agg(player.display_name, '-' order by entry_player.position)
  into entry_name
  from public.tournament_entry_players entry_player
  join public.tournament_players player on player.id = entry_player.player_id
  where entry_player.entry_id = affected_entry_id;

  if entry_name is not null then
    update public.tournament_matches
    set
      player1_name = case
        when player1_entry_id = affected_entry_id then entry_name
        else player1_name
      end,
      player2_name = case
        when player2_entry_id = affected_entry_id then entry_name
        else player2_name
      end
    where player1_entry_id = affected_entry_id
      or player2_entry_id = affected_entry_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger tournament_entry_players_refresh_match_names
after insert or update or delete
on public.tournament_entry_players
for each row execute function public.refresh_tournament_match_names_for_entry();

create or replace function public.refresh_tournament_match_names_for_player()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.tournament_matches tournament_match
  set
    player1_name = (
      select string_agg(player.display_name, '-' order by entry_player.position)
      from public.tournament_entry_players entry_player
      join public.tournament_players player on player.id = entry_player.player_id
      where entry_player.entry_id = tournament_match.player1_entry_id
    ),
    player2_name = (
      select string_agg(player.display_name, '-' order by entry_player.position)
      from public.tournament_entry_players entry_player
      join public.tournament_players player on player.id = entry_player.player_id
      where entry_player.entry_id = tournament_match.player2_entry_id
    )
  where exists (
    select 1
    from public.tournament_entry_players entry_player
    where entry_player.player_id = new.id
      and entry_player.entry_id in (
        tournament_match.player1_entry_id,
        tournament_match.player2_entry_id
      )
  );

  return new;
end;
$$;

create trigger tournament_players_refresh_match_names
after update of display_name
on public.tournament_players
for each row execute function public.refresh_tournament_match_names_for_player();

create or replace function public.sync_tournament_entry_group_matches()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.group_id is distinct from old.group_id then
    update public.tournament_matches
    set group_id = new.group_id
    where player1_entry_id = new.id
      or player2_entry_id = new.id;
  end if;

  return new;
end;
$$;

create trigger tournament_entries_sync_group_matches
after update of group_id
on public.tournament_entries
for each row execute function public.sync_tournament_entry_group_matches();

grant select, insert, update, delete on table public.tournament_players to authenticated;
grant select, insert, update, delete on table public.tournament_entries to authenticated;
grant select, insert, update, delete on table public.tournament_entry_players to authenticated;
grant select on table public.tournament_players to anon;
grant select on table public.tournament_entries to anon;
grant select on table public.tournament_entry_players to anon;

alter table public.tournament_players enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_entry_players enable row level security;

create policy tournament_players_select_visible
on public.tournament_players for select
to authenticated
using (
  exists (
    select 1
    from public.tournaments tournament
    where tournament.id = tournament_players.tournament_id
      and (tournament.is_active or (select public.is_admin()))
  )
);

create policy tournament_players_select_active_anon
on public.tournament_players for select
to anon
using (
  exists (
    select 1
    from public.tournaments tournament
    where tournament.id = tournament_players.tournament_id
      and tournament.is_active
  )
);

create policy tournament_players_insert_admin
on public.tournament_players for insert
to authenticated
with check ((select public.is_admin()));

create policy tournament_players_update_admin
on public.tournament_players for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy tournament_players_delete_admin
on public.tournament_players for delete
to authenticated
using ((select public.is_admin()));

create policy tournament_entries_select_visible
on public.tournament_entries for select
to authenticated
using (
  exists (
    select 1
    from public.tournament_categories category
    join public.tournaments tournament on tournament.id = category.tournament_id
    where category.id = tournament_entries.category_id
      and (tournament.is_active or (select public.is_admin()))
  )
);

create policy tournament_entries_select_active_anon
on public.tournament_entries for select
to anon
using (
  exists (
    select 1
    from public.tournament_categories category
    join public.tournaments tournament on tournament.id = category.tournament_id
    where category.id = tournament_entries.category_id
      and tournament.is_active
  )
);

create policy tournament_entries_insert_admin
on public.tournament_entries for insert
to authenticated
with check ((select public.is_admin()));

create policy tournament_entries_update_admin
on public.tournament_entries for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy tournament_entries_delete_admin
on public.tournament_entries for delete
to authenticated
using ((select public.is_admin()));

create policy tournament_entry_players_select_visible
on public.tournament_entry_players for select
to authenticated
using (
  exists (
    select 1
    from public.tournament_entries entry
    join public.tournament_categories category on category.id = entry.category_id
    join public.tournaments tournament on tournament.id = category.tournament_id
    where entry.id = tournament_entry_players.entry_id
      and (tournament.is_active or (select public.is_admin()))
  )
);

create policy tournament_entry_players_select_active_anon
on public.tournament_entry_players for select
to anon
using (
  exists (
    select 1
    from public.tournament_entries entry
    join public.tournament_categories category on category.id = entry.category_id
    join public.tournaments tournament on tournament.id = category.tournament_id
    where entry.id = tournament_entry_players.entry_id
      and tournament.is_active
  )
);

create policy tournament_entry_players_insert_admin
on public.tournament_entry_players for insert
to authenticated
with check ((select public.is_admin()));

create policy tournament_entry_players_update_admin
on public.tournament_entry_players for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy tournament_entry_players_delete_admin
on public.tournament_entry_players for delete
to authenticated
using ((select public.is_admin()));

revoke all on function public.sync_tournament_match_entry_names() from public;
revoke all on function public.refresh_tournament_match_names_for_entry() from public;
revoke all on function public.refresh_tournament_match_names_for_player() from public;
revoke all on function public.sync_tournament_entry_group_matches() from public;
grant execute on function public.sync_tournament_match_entry_names() to authenticated;
grant execute on function public.refresh_tournament_match_names_for_entry() to authenticated;
grant execute on function public.refresh_tournament_match_names_for_player() to authenticated;
grant execute on function public.sync_tournament_entry_group_matches() to authenticated;

notify pgrst, 'reload schema';
