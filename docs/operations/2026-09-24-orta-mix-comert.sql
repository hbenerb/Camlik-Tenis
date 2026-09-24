-- User-authorized one-off data operation. No schema or permission changes.
-- Adds Cenk Comert / Ayse Comert to 29 Ekim / Orta Mix / A and four fixtures.
-- All timestamps have explicit Europe/Istanbul UTC+03 offsets.
-- Re-running intentionally aborts if the category no longer has the original four teams.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';
lock table public.reservations, public.tournament_entries,
  public.tournament_entry_players, public.tournament_matches
  in share row exclusive mode;

do $operation$
declare
  target_tournament constant uuid := '13350264-a44c-4c44-8213-4aef62e3fbb6';
  target_category constant uuid := '05258045-f117-4b65-aa5b-dd5db6845944';
  target_group constant uuid := '95b0f665-7185-4fea-8736-9b16a80d0f77';
  cenk constant uuid := '6a8225bc-606b-45ba-8ae1-f1fb7b2e694b';
  ayse constant uuid := '15c9943e-bef1-47e9-a91f-19f5870c5a48';
  original_teams constant uuid[] := array[
    'd19b45ec-5bd5-4d38-bcdb-14516c1f2ca6'::uuid,
    '8304b9b3-3067-45d1-ad54-b07ffd994084'::uuid,
    'a418b1da-d666-40a6-8d2b-b02402925a2f'::uuid,
    'f4f9cc0c-363a-4091-9da9-b4251595653b'::uuid
  ];
  new_entry uuid;
  new_match uuid;
  new_match_ids uuid[] := array[]::uuid[];
  prior_matches jsonb;
  remaining_matches jsonb;
  relevant_players uuid[];
  relevant_names text[];
  match_end timestamptz;
  slot record;
  affected integer;
begin
  perform 1 from public.tournaments
    where id = target_tournament and name = '29 Ekim Etkinliği'
      and is_active and match_duration_minutes = 90
      and group_stage_start_date <= '2026-09-28'::date
      and group_stage_end_date >= '2026-10-08'::date
    for update;
  if not found then raise exception 'Tournament configuration changed; aborting.'; end if;
  perform 1 from public.tournament_categories
    where id = target_category and tournament_id = target_tournament
      and name = 'Orta Mix' and group_size = 4 and group_count = 1
    for update;
  if not found then raise exception 'Category configuration changed; aborting.'; end if;
  perform 1 from public.tournament_groups
    where id = target_group and category_id = target_category and name = 'A'
    for update;
  if not found then raise exception 'Group changed; aborting.'; end if;

  if (select count(*) from public.tournament_entries where category_id=target_category) <> 4
     or (select count(*) from public.tournament_entries
         where id=any(original_teams) and category_id=target_category and group_id=target_group) <> 4 then
    raise exception 'Existing category teams changed; aborting.';
  end if;
  if (select count(*) from public.tournament_entry_players where entry_id=any(original_teams)) <> 8 then
    raise exception 'Existing doubles membership changed; aborting.';
  end if;
  perform 1 from public.tournament_players
    where id=cenk and tournament_id=target_tournament and display_name='Cenk Cömert' for update;
  if not found then raise exception 'Cenk identity changed; aborting.'; end if;
  perform 1 from public.tournament_players
    where id=ayse and tournament_id=target_tournament and display_name='Ayşe Cömert' for update;
  if not found then raise exception 'Ayse identity changed; aborting.'; end if;
  if exists (
    select 1 from public.tournament_entries e
    join public.tournament_entry_players ep on ep.entry_id=e.id
    where e.category_id=target_category and ep.player_id in(cenk,ayse)
  ) then raise exception 'One of the new players already belongs to Orta Mix; aborting.'; end if;

  select jsonb_agg(to_jsonb(m) order by m.id) into prior_matches
    from public.tournament_matches m where tournament_id=target_tournament;

  insert into public.tournament_entries(category_id,group_id,display_order)
    values(target_category,target_group,5) returning id into new_entry;
  insert into public.tournament_entry_players(entry_id,player_id,position)
    values(new_entry,cenk,1),(new_entry,ayse,2);
  update public.tournament_categories set group_size=5
    where id=target_category and group_size=4;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Expected one category update.'; end if;

  for slot in
    select * from (values
      ('8304b9b3-3067-45d1-ad54-b07ffd994084'::uuid, '27c9a41f-3edd-4ac0-934d-e82a69d9466c'::uuid, '2026-09-28T18:00:00+03:00'::timestamptz, 'admin-20260924-orta-mix-comert-1'),
      ('f4f9cc0c-363a-4091-9da9-b4251595653b'::uuid, '6f89b0dc-9aa1-4600-b26a-f185e3840f7b'::uuid, '2026-10-01T19:30:00+03:00'::timestamptz, 'admin-20260924-orta-mix-comert-2'),
      ('a418b1da-d666-40a6-8d2b-b02402925a2f'::uuid, '6f89b0dc-9aa1-4600-b26a-f185e3840f7b'::uuid, '2026-10-05T19:30:00+03:00'::timestamptz, 'admin-20260924-orta-mix-comert-3'),
      ('d19b45ec-5bd5-4d38-bcdb-14516c1f2ca6'::uuid, '6f89b0dc-9aa1-4600-b26a-f185e3840f7b'::uuid, '2026-10-08T18:00:00+03:00'::timestamptz, 'admin-20260924-orta-mix-comert-4')
    ) as v(opponent,court,starts,source)
  loop
    match_end := slot.starts + interval '90 minutes';
    if not public.is_within_club_hours(slot.starts,match_end) then
      raise exception 'Proposed match falls outside club opening hours.';
    end if;
    if not exists(select 1 from public.tournament_courts tc join public.courts c on c.id=tc.court_id
      where tc.tournament_id=target_tournament and tc.court_id=slot.court and c.is_active) then
      raise exception 'Proposed court is unavailable to this tournament.';
    end if;
    select array_agg(ep.player_id),array_agg(lower(trim(p.display_name)))
      into relevant_players,relevant_names
      from public.tournament_entry_players ep join public.tournament_players p on p.id=ep.player_id
      where ep.entry_id in(new_entry,slot.opponent);
    if cardinality(relevant_players) <> 4 then raise exception 'Expected four players per match.'; end if;

    if exists(select 1 from public.tournament_matches m
      where m.status <> 'canceled' and m.court_id=slot.court
        and m.starts_at<match_end and m.ends_at>slot.starts) then
      raise exception 'Proposed tournament court/time now conflicts.';
    end if;
    if exists(select 1 from public.reservations r
      where r.status='confirmed' and r.court_id=slot.court
        and r.starts_at<match_end and r.ends_at>slot.starts) then
      raise exception 'Proposed court/time now conflicts with a reservation.';
    end if;
    if exists(select 1 from public.tournament_matches m
      join public.tournament_entry_players ep on ep.entry_id in(m.player1_entry_id,m.player2_entry_id)
      join public.tournament_players p on p.id=ep.player_id
      where m.status <> 'canceled'
        and m.starts_at<match_end and m.ends_at>slot.starts
        and (ep.player_id=any(relevant_players) or lower(trim(p.display_name))=any(relevant_names))) then
      raise exception 'A player now has an overlapping tournament match.';
    end if;
    if exists(select 1 from public.reservations r
      left join public.profiles p on p.id=r.user_id
      left join public.profiles tr on tr.id=r.trainer_id
      where r.status='confirmed' and r.starts_at<match_end and r.ends_at>slot.starts
        and (lower(trim(p.full_name))=any(relevant_names)
          or lower(trim(tr.full_name))=any(relevant_names)
          or exists(select 1 from unnest(relevant_names) nm
             where position(nm in lower(coalesce(r.note,'')))>0))) then
      raise exception 'A player now has an overlapping reservation.';
    end if;

    insert into public.tournament_matches(
      tournament_id,category_id,group_id,court_id,phase,starts_at,ends_at,
      player1_entry_id,player2_entry_id,status,source_key
    ) values(
      target_tournament,target_category,target_group,slot.court,'group',slot.starts,match_end,
      new_entry,slot.opponent,'scheduled',slot.source
    ) returning id into new_match;
    new_match_ids := array_append(new_match_ids,new_match);
  end loop;

  if cardinality(new_match_ids) <> 4 then raise exception 'Expected exactly four new matches.'; end if;
  if (select count(*) from public.tournament_entries where group_id=target_group) <> 5 then
    raise exception 'Expected five doubles teams in group A.';
  end if;
  if (select count(*) from public.tournament_matches where group_id=target_group and status <> 'canceled') <> 10 then
    raise exception 'Expected ten active group matches.';
  end if;
  if exists(
    select 1 from public.tournament_entries a
    join public.tournament_entries b on a.id<b.id and a.group_id=b.group_id
    where a.group_id=target_group and not exists(
      select 1 from public.tournament_matches m where m.group_id=target_group and m.status <> 'canceled'
      and ((m.player1_entry_id=a.id and m.player2_entry_id=b.id)
        or (m.player1_entry_id=b.id and m.player2_entry_id=a.id))
    )
  ) then raise exception 'Round-robin pairing is incomplete.'; end if;
  if (select count(*) from public.tournament_matches where id=any(new_match_ids)
      and starts_at>='2026-09-28T00:00:00+03' and starts_at<'2026-10-05T00:00:00+03') <> 2
    or (select count(*) from public.tournament_matches where id=any(new_match_ids)
      and starts_at>='2026-10-05T00:00:00+03' and starts_at<'2026-10-12T00:00:00+03') <> 2 then
    raise exception 'Weekly distribution must be two plus two.';
  end if;
  select jsonb_agg(to_jsonb(m) order by m.id) into remaining_matches
    from public.tournament_matches m where tournament_id=target_tournament and not(id=any(new_match_ids));
  if prior_matches is distinct from remaining_matches then
    raise exception 'A pre-existing tournament match was modified; aborting.';
  end if;
  if (select count(*) from public.change_audit_log where transaction_id=txid_current()) <> 8 then
    raise exception 'Expected eight audit records for this operation.';
  end if;
end;
$operation$;
commit;

select m.id,m.source_key,m.player1_entry_id,m.player1_name,m.player2_name,
  m.starts_at at time zone 'Europe/Istanbul' as starts_at_istanbul,
  m.ends_at at time zone 'Europe/Istanbul' as ends_at_istanbul,
  c.name as court,m.status,m.score_entered
from public.tournament_matches m join public.courts c on c.id=m.court_id
where m.tournament_id='13350264-a44c-4c44-8213-4aef62e3fbb6'
  and m.source_key like 'admin-20260924-orta-mix-comert-%'
order by m.starts_at;
