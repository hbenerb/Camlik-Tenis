-- Run through a trusted database connection. All synthetic rows and log events
-- are rolled back; no existing reservation, tournament or user is edited.
begin;
do $$
declare
  test_tournament uuid := gen_random_uuid();
  test_court uuid := gen_random_uuid();
  test_reservation uuid := gen_random_uuid();
  actor_id uuid;
  actor_label text;
  test_start timestamptz := (
    date_trunc('day', now() at time zone 'Europe/Istanbul') + interval '1 day 10 hours'
  ) at time zone 'Europe/Istanbul';
  slot_minutes integer;
  events_count integer;
begin
  select id, full_name into actor_id, actor_label
    from public.profiles where app_role in ('admin', 'super_admin') order by id limit 1;
  if actor_id is null then raise exception 'Smoke test needs an existing admin identity.'; end if;
  select reservation_slot_minutes into slot_minutes from public.club_settings where id=1;
  insert into public.courts (id, name, is_active) values (test_court, '__audit_smoke_court__', true);

  perform set_config('request.jwt.claim.sub', actor_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',actor_id,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.tournaments (id,name,group_stage_start_date,group_stage_end_date,finals_start_date,finals_end_date)
    values (test_tournament, '__audit_smoke_' || test_tournament::text, current_date, current_date+1, current_date+2, current_date+3);
  update public.tournaments set name=name || '_updated' where id=test_tournament;
  insert into public.reservations (id,court_id,user_id,starts_at,ends_at,note)
    values (test_reservation,test_court,actor_id,test_start,test_start+make_interval(mins=>slot_minutes),
      '{"kind":"match","match_type":"singles","team1_player1_name":"Audit Test","team2_player1_name":"Test Opponent"}');
  update public.reservations set starts_at=starts_at+interval '1 hour',ends_at=ends_at+interval '1 hour'
    where id=test_reservation;
  update public.reservations set status='canceled' where id=test_reservation;
  delete from public.tournaments where id=test_tournament;

  select count(*) into events_count from public.change_audit_log
    where record_key in (jsonb_build_object('id',test_tournament),jsonb_build_object('id',test_reservation))
      and actor_user_id=actor_id and actor_name is not distinct from actor_label and actor_source='user';
  if events_count <> 6 then raise exception 'Expected six correctly attributed events, got %.', events_count; end if;
  if not exists (select 1 from public.change_audit_log
    where record_key=jsonb_build_object('id',test_reservation) and operation='UPDATE'
      and (changes->'starts_at'->>'old')::timestamptz=test_start
      and (changes->'starts_at'->>'new')::timestamptz=test_start+interval '1 hour') then
    raise exception 'Reservation time diff was not captured.';
  end if;
  if has_table_privilege('authenticated','public.change_audit_log','INSERT')
     or has_table_privilege('authenticated','public.change_audit_log','UPDATE')
     or has_table_privilege('authenticated','public.change_audit_log','DELETE') then
    raise exception 'Application roles can tamper with history.';
  end if;
end;
$$;
rollback;
select 'passed: six events, actor and time diff verified; all synthetic data rolled back' as verification,
  not exists(select 1 from public.courts where name='__audit_smoke_court__') as no_test_court,
  not exists(select 1 from public.tournaments where name like '__audit_smoke_%') as no_test_tournament;
