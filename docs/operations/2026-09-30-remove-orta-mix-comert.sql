-- User-authorized one-off removal from 29 Ekim / Orta Mix / A.
-- Cancel and remove only this team's four unscored fixtures, then its entry.
-- The immutable audit log retains all prior rows and cancellation events.
-- Shared player records and other-category participation are preserved.
-- No schema, trigger, permission or reservation changes. Repeat runs abort.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';
lock table public.tournament_categories, public.tournament_entries,
  public.tournament_entry_players, public.tournament_matches,
  public.tournament_players in share row exclusive mode;

do $operation$
declare
  target_tournament constant uuid := '13350264-a44c-4c44-8213-4aef62e3fbb6';
  target_category constant uuid := '05258045-f117-4b65-aa5b-dd5db6845944';
  target_group constant uuid := '95b0f665-7185-4fea-8736-9b16a80d0f77';
  target_entry constant uuid := '1b0cd41a-c9eb-4aeb-bb71-8af743d13d8f';
  cenk constant uuid := '6a8225bc-606b-45ba-8ae1-f1fb7b2e694b';
  ayse constant uuid := '15c9943e-bef1-47e9-a91f-19f5870c5a48';
  target_matches constant uuid[] := array[
    '6eb68c87-e884-4d6f-8749-b6fcb1351dba'::uuid,
    '1e4bc9c3-f3d2-4ac8-89bf-809806cc95ff'::uuid,
    '06c644c3-98c2-424c-a59c-0860fa902fab'::uuid,
    '3c6c09a1-597f-481b-a2b0-496e51ed5412'::uuid
  ];
  before_untouched jsonb;
  after_untouched jsonb;
  affected integer;
begin
  if not exists(select 1 from public.tournaments
    where id=target_tournament and name='29 Ekim Etkinliği') then
    raise exception 'Tournament identity changed; aborting.';
  end if;
  if not exists(select 1 from public.tournament_categories
    where id=target_category and tournament_id=target_tournament
      and name='Orta Mix' and group_count=1 and group_size=5) then
    raise exception 'Category configuration changed; aborting.';
  end if;
  if not exists(select 1 from public.tournament_entries e
    join public.tournament_groups g on g.id=e.group_id
    where e.id=target_entry and e.category_id=target_category
      and e.group_id=target_group and g.name='A' and g.category_id=target_category)
    or (select count(*) from public.tournament_entries where category_id=target_category)<>5
    or (select count(*) from public.tournament_entries where group_id=target_group)<>5 then
    raise exception 'Group membership changed; aborting.';
  end if;
  if (select count(*) from public.tournament_entry_players where entry_id=target_entry)<>2
    or (select count(*) from public.tournament_entry_players ep
      join public.tournament_players p on p.id=ep.player_id
      where ep.entry_id=target_entry and p.tournament_id=target_tournament
        and ((ep.position=1 and p.id=cenk and p.display_name='Cenk Cömert')
          or (ep.position=2 and p.id=ayse and p.display_name='Ayşe Cömert')))<>2 then
    raise exception 'Target player identities changed; aborting.';
  end if;
  if (select count(*) from public.tournament_matches
      where id=any(target_matches) and tournament_id=target_tournament
        and category_id=target_category and group_id=target_group
        and player1_entry_id=target_entry and player1_name='Cenk Cömert-Ayşe Cömert'
        and status='scheduled' and not score_entered and score_sets='[]'::jsonb
        and not is_walkover and not is_retired and winner_entry_id is null)<>4
    or (select count(*) from public.tournament_matches
      where player1_entry_id=target_entry or player2_entry_id=target_entry
        or winner_entry_id=target_entry)<>4 then
    raise exception 'Fixture set or results changed; inspect before retrying.';
  end if;

  select jsonb_build_object(
    'matches',(select jsonb_agg(to_jsonb(m) order by m.id)
      from public.tournament_matches m where not(m.id=any(target_matches))),
    'entries',(select jsonb_agg(to_jsonb(e) order by e.id)
      from public.tournament_entries e where e.id<>target_entry),
    'memberships',(select jsonb_agg(to_jsonb(ep) order by ep.entry_id,ep.position)
      from public.tournament_entry_players ep where ep.entry_id<>target_entry),
    'players',(select jsonb_agg(to_jsonb(p) order by p.id) from public.tournament_players p)
  ) into before_untouched;

  update public.tournament_matches set status='canceled'
    where id=any(target_matches) and status='scheduled';
  get diagnostics affected = row_count;
  if affected<>4 then raise exception 'Expected four cancellations.'; end if;

  -- Entry foreign keys are RESTRICT; never disable their validation triggers.
  -- Both cancellation and removal are audited, with full recoverable row data.
  delete from public.tournament_matches
    where id=any(target_matches) and status='canceled';
  get diagnostics affected = row_count;
  if affected<>4 then raise exception 'Expected four fixture removals.'; end if;
  delete from public.tournament_entries
    where id=target_entry and category_id=target_category and group_id=target_group;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'Expected one team removal.'; end if;
  update public.tournament_categories set group_size=4
    where id=target_category and group_size=5;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'Expected one capacity update.'; end if;

  select jsonb_build_object(
    'matches',(select jsonb_agg(to_jsonb(m) order by m.id)
      from public.tournament_matches m where not(m.id=any(target_matches))),
    'entries',(select jsonb_agg(to_jsonb(e) order by e.id)
      from public.tournament_entries e where e.id<>target_entry),
    'memberships',(select jsonb_agg(to_jsonb(ep) order by ep.entry_id,ep.position)
      from public.tournament_entry_players ep where ep.entry_id<>target_entry),
    'players',(select jsonb_agg(to_jsonb(p) order by p.id) from public.tournament_players p)
  ) into after_untouched;
  if before_untouched is distinct from after_untouched then
    raise exception 'An unrelated fixture, entry, membership or player changed.';
  end if;
  if (select count(*) from public.tournament_entries where group_id=target_group)<>4
    or (select count(*) from public.tournament_matches
      where group_id=target_group and status<>'canceled')<>6
    or exists(select 1 from public.tournament_matches where id=any(target_matches))
    or exists(select 1 from public.tournament_entry_players where entry_id=target_entry) then
    raise exception 'Removal postconditions failed.';
  end if;
  if (select count(*) from public.change_audit_log where transaction_id=txid_current())<>12 then
    raise exception 'Expected twelve audit records for this operation.';
  end if;
end;
$operation$;
commit;
