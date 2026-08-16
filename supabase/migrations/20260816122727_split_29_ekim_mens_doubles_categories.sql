do $$
declare
  target_tournament_id uuid;
  original_category_id uuid;
  master_category_id uuid := gen_random_uuid();
  original_display_order integer;
  master_group_ids uuid[];
  advanced_group_id uuid;
begin
  select tournament.id
  into target_tournament_id
  from public.tournaments tournament
  where lower(trim(tournament.name)) = lower('29 Ekim')
  order by tournament.created_at
  limit 1;

  if target_tournament_id is null then
    raise exception '29 Ekim turnuvası bulunamadı.';
  end if;

  select category.id, category.display_order
  into original_category_id, original_display_order
  from public.tournament_categories category
  where category.tournament_id = target_tournament_id
    and trim(category.name) = 'Double Erkek'
  limit 1;

  if original_category_id is null then
    raise exception '29 Ekim Double Erkek kategorisi bulunamadı.';
  end if;

  if exists (
    select 1
    from public.tournament_categories category
    where category.tournament_id = target_tournament_id
      and trim(category.name) in (
        'Double Master Erkek',
        'Double İleri Erkek'
      )
  ) then
    raise exception '29 Ekim erkek çiftler kategorileri zaten ayrılmış.';
  end if;

  select array_agg(group_row.id order by group_row.display_order)
  into master_group_ids
  from public.tournament_groups group_row
  where group_row.category_id = original_category_id
    and trim(group_row.name) in ('MSTR-A', 'MSTR-B');

  select group_row.id
  into advanced_group_id
  from public.tournament_groups group_row
  where group_row.category_id = original_category_id
    and trim(group_row.name) = 'İS-A'
  limit 1;

  if coalesce(cardinality(master_group_ids), 0) <> 2 then
    raise exception 'Double Master Erkek için iki grup bulunmalı.';
  end if;

  if advanced_group_id is null then
    raise exception 'Double İleri Erkek grubu bulunamadı.';
  end if;

  update public.tournament_categories category
  set display_order = category.display_order + 1
  where category.tournament_id = target_tournament_id
    and category.display_order >= original_display_order;

  insert into public.tournament_categories (
    id,
    tournament_id,
    name,
    group_count,
    group_size,
    display_order
  )
  values (
    master_category_id,
    target_tournament_id,
    'Double Master Erkek',
    2,
    4,
    original_display_order
  );

  update public.tournament_categories
  set
    name = 'Double İleri Erkek',
    group_count = 1,
    group_size = 4,
    display_order = original_display_order + 1
  where id = original_category_id;

  update public.tournament_entries
  set category_id = master_category_id
  where group_id = any(master_group_ids);

  update public.tournament_participants
  set category_id = master_category_id
  where group_id = any(master_group_ids);

  update public.tournament_matches
  set category_id = master_category_id
  where tournament_id = target_tournament_id
    and group_id = any(master_group_ids);

  update public.tournament_groups
  set
    category_id = master_category_id,
    name = case trim(name)
      when 'MSTR-A' then 'A'
      when 'MSTR-B' then 'B'
      else name
    end,
    display_order = case trim(name)
      when 'MSTR-A' then 1
      when 'MSTR-B' then 2
      else display_order
    end
  where id = any(master_group_ids);

  update public.tournament_groups
  set
    name = 'A',
    display_order = 1
  where id = advanced_group_id;
end;
$$;

notify pgrst, 'reload schema';
