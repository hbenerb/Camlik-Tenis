-- The tournament is copied once by an administrator after this schema is deployed.
-- Keeping its source snapshot separate prevents later scores changing league seeds.
create table public.league_drafts (
  id text primary key,
  name text not null,
  source_tournament_id uuid not null references public.tournaments(id),
  source_tournament_name text not null,
  source_captured_at timestamptz not null default now(),
  season_start date not null default '2026-11-01',
  month_count integer not null default 12 check (month_count = 12),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.league_draft_categories (
  league_id text not null references public.league_drafts(id) on delete cascade,
  category_key text not null check (category_key in ('men', 'women', 'women-doubles', 'men-doubles', 'mixed-doubles')),
  display_order integer not null check (display_order between 0 and 4),
  payload jsonb not null,
  primary key (league_id, category_key),
  unique (league_id, display_order),
  check (jsonb_typeof(payload) = 'object' and (payload ->> 'key') is not distinct from category_key)
);

alter table public.league_drafts enable row level security;
alter table public.league_draft_categories enable row level security;
revoke all on table public.league_drafts, public.league_draft_categories from public, anon, authenticated;
grant select, insert, update, delete on table public.league_drafts, public.league_draft_categories to authenticated;

create policy league_drafts_admin_only on public.league_drafts
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy league_draft_categories_admin_only on public.league_draft_categories
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Header revision and all category payloads must share one database snapshot;
-- separate HTTP reads could combine an old payload with a newer revision.
create function public.read_league_draft(p_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select to_jsonb(draft) || jsonb_build_object('categories', coalesce((
    select jsonb_agg(category.payload order by category.display_order)
    from public.league_draft_categories category where category.league_id = draft.id
  ), '[]'::jsonb))
  from public.league_drafts draft where draft.id = p_id;
$$;
revoke all on function public.read_league_draft(text) from public, anon, authenticated;
grant execute on function public.read_league_draft(text) to authenticated;

-- A single row lock and transaction protect every category together. The client
-- may reorder the frozen entrants and change capacities, never rewrite identities.
create function public.save_league_draft(
  p_id text,
  p_expected_revision integer,
  p_categories jsonb
) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_revision integer;
  v_category record;
  v_input jsonb;
  v_entries jsonb;
  v_groups jsonb;
  v_frozen_entries jsonb;
  v_submitted_entries jsonb;
  v_count integer;
  v_capacity integer;
  v_size_text text;
  v_size integer;
  v_offset integer;
  v_group_number integer;
  v_month integer;
  v_pair integer;
  v_ring text[];
  v_matches jsonb;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Lig taslağına yalnızca yöneticiler erişebilir.' using errcode = '42501';
  end if;

  select revision into v_revision from public.league_drafts where id = p_id for update;
  if not found then
    raise exception 'Lig taslağı bulunamadı.' using errcode = 'P0002';
  end if;
  if v_revision is distinct from p_expected_revision then
    raise exception 'Lig taslağı başka bir yönetici tarafından güncellendi. Yeniden yükleyin.' using errcode = '40001';
  end if;

  if jsonb_typeof(p_categories) is distinct from 'array' then
    raise exception 'Beş lig kategorisi birlikte kaydedilmeli.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_categories) <> 5 or
    (select count(distinct item ->> 'key') from jsonb_array_elements(p_categories) item
      where item ->> 'key' in ('men', 'women', 'women-doubles', 'men-doubles', 'mixed-doubles')) <> 5 or
    (select count(*) from public.league_draft_categories where league_id = p_id) <> 5 then
    raise exception 'Beş lig kategorisi birlikte kaydedilmeli.' using errcode = '22023';
  end if;

  for v_category in
    select category_key, payload from public.league_draft_categories
      where league_id = p_id order by display_order for update
  loop
    select item into v_input from jsonb_array_elements(p_categories) item
      where item ->> 'key' = v_category.category_key;
    v_entries := v_input -> 'entrants';
    v_groups := v_input -> 'group_sizes';
    if v_input -> 'name' is distinct from v_category.payload -> 'name' or
      v_input -> 'kind' is distinct from v_category.payload -> 'kind' or
      jsonb_typeof(v_entries) is distinct from 'array' or
      jsonb_typeof(v_groups) is distinct from 'array' then
      raise exception 'Kategori bilgileri ve kaynak katılımcılar değiştirilemez.' using errcode = '22023';
    end if;

    v_count := jsonb_array_length(v_entries);
    if v_count < 4 or jsonb_array_length(v_groups) = 0 or
      (select count(distinct item ->> 'id') from jsonb_array_elements(v_entries) item
        where jsonb_typeof(item) = 'object' and coalesce(item ->> 'id', '') <> '') <> v_count then
      raise exception 'Katılımcı listesi eksik veya yinelenen kayıt içeriyor.' using errcode = '22023';
    end if;
    select jsonb_agg(item order by item ->> 'id') into v_frozen_entries
      from jsonb_array_elements(v_category.payload -> 'entrants') item;
    select jsonb_agg(item order by item ->> 'id') into v_submitted_entries
      from jsonb_array_elements(v_entries) item;
    if v_frozen_entries is distinct from v_submitted_entries then
      raise exception 'Kaynak katılımcılar ve çiftlerin partnerleri değiştirilemez; yalnızca sıralama düzenlenebilir.' using errcode = '22023';
    end if;

    if exists (select 1 from jsonb_array_elements(v_groups) item where jsonb_typeof(item) <> 'number') then
      raise exception 'Grup büyüklükleri sayı olmalı.' using errcode = '22023';
    end if;
    v_capacity := 0;
    for v_size_text in select jsonb_array_elements_text(v_groups) loop
      if v_size_text not in ('4', '6', '8', '10') then
        raise exception 'Gruplar 4, 6, 8 veya 10 katılımcılı olmalı.' using errcode = '22023';
      end if;
      v_capacity := v_capacity + v_size_text::integer;
    end loop;
    if v_capacity <> v_count then
      raise exception 'Grup kapasitesi katılımcı sayısıyla eşleşmeli.' using errcode = '22023';
    end if;

    -- Circle rotation provides one same-group opponent each month. Repeating the
    -- rotation only after n-1 rounds gives a complete first leg before rematches.
    v_matches := '[]'::jsonb;
    v_offset := 0;
    v_group_number := 0;
    for v_size_text in select jsonb_array_elements_text(v_groups) loop
      v_size := v_size_text::integer;
      v_group_number := v_group_number + 1;
      select array_agg(item ->> 'id' order by position) into v_ring
        from jsonb_array_elements(v_entries) with ordinality as entry(item, position)
        where position > v_offset and position <= v_offset + v_size;
      for v_month in 0..11 loop
        for v_pair in 1..(v_size / 2) loop
          v_matches := v_matches || jsonb_build_array(jsonb_build_object(
            'id', v_category.category_key || '-g' || v_group_number || '-m' || (v_month + 1) || '-' || v_pair,
            'month_index', v_month,
            'group_number', v_group_number,
            'player1_entry_id', v_ring[v_pair],
            'player2_entry_id', v_ring[v_size + 1 - v_pair]
          ));
        end loop;
        v_ring := array[v_ring[1], v_ring[v_size]] || v_ring[2:(v_size - 1)];
      end loop;
      v_offset := v_offset + v_size;
    end loop;
    select jsonb_agg(item order by (item ->> 'month_index')::integer, (item ->> 'group_number')::integer, position)
      into v_matches from jsonb_array_elements(v_matches) with ordinality as fixture(item, position);

    update public.league_draft_categories set payload = v_category.payload || jsonb_build_object(
      'entrants', v_entries, 'group_sizes', v_groups, 'matches', v_matches
    ) where league_id = p_id and category_key = v_category.category_key;
  end loop;

  update public.league_drafts set revision = revision + 1, updated_at = now()
    where id = p_id returning revision into v_revision;
  return v_revision;
end;
$$;

revoke all on function public.save_league_draft(text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_league_draft(text, integer, jsonb) to authenticated;

notify pgrst, 'reload schema';
