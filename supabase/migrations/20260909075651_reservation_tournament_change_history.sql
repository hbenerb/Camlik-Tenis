-- Forward-only history. Never infer old events from created_at/updated_at.
create table public.change_audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  transaction_id bigint not null,
  entity_table text not null,
  record_key jsonb not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  actor_user_id uuid,
  actor_name text,
  actor_app_role text,
  actor_is_trainer boolean,
  actor_source text not null check (actor_source in ('user', 'service_role', 'database')),
  database_session_user text not null,
  request_role text not null,
  trigger_depth integer not null,
  changed_fields text[] not null,
  changes jsonb not null,
  old_data jsonb,
  new_data jsonb,
  constraint change_audit_row_shape check (
    (operation = 'INSERT' and old_data is null and new_data is not null)
    or (operation = 'UPDATE' and old_data is not null and new_data is not null)
    or (operation = 'DELETE' and old_data is not null and new_data is null)
  )
);

-- No foreign keys: deleting a user, reservation or tournament must not erase history.
create index change_audit_record_time_idx
  on public.change_audit_log (entity_table, record_key, occurred_at desc, id desc);
create index change_audit_time_idx on public.change_audit_log (occurred_at desc, id desc);
create index change_audit_actor_time_idx
  on public.change_audit_log (actor_user_id, occurred_at desc) where actor_user_id is not null;
create index change_audit_transaction_idx on public.change_audit_log (transaction_id, id);

alter table public.change_audit_log enable row level security;
revoke all on public.change_audit_log from public, anon, authenticated, service_role;
revoke all on sequence public.change_audit_log_id_seq from public, anon, authenticated, service_role;
grant select on public.change_audit_log to authenticated, service_role;
create policy change_audit_read_admin on public.change_audit_log
  for select to authenticated using ((select public.is_admin()));

create schema if not exists private;

-- A narrowly scoped SECURITY DEFINER trigger is necessary for append-only writes:
-- application roles must never have INSERT access to forge actor/time/old values.
-- It does not authorize source writes: their existing RLS and validation still run.
create function private.capture_change_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_row jsonb;
  current_row jsonb;
  key_row jsonb;
  row_key jsonb;
  field_diff jsonb;
  field_names text[];
  caller_id uuid := auth.uid();
  caller_name text;
  caller_app_role text;
  caller_is_trainer boolean;
  caller_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(nullif(current_setting('role', true), ''), 'none'),
    session_user::text
  );
begin
  if tg_table_schema <> 'public' or tg_when <> 'AFTER' or tg_level <> 'ROW'
     or tg_table_name not in (
       'reservations', 'tournaments', 'tournament_courts', 'tournament_categories',
       'tournament_groups', 'tournament_participants', 'tournament_players',
       'tournament_entries', 'tournament_entry_players', 'tournament_matches'
     ) or tg_nargs = 0 then
    raise exception 'Invalid change audit trigger binding.';
  end if;

  -- A real application request must have a verified user identity. Database and
  -- service-role maintenance remain explicitly labeled, never attributed to an admin.
  if caller_role in ('anon', 'authenticated') and caller_id is null then
    raise exception 'Değişiklik geçmişi için kullanıcı kimliği gerekli.' using errcode = '42501';
  end if;

  if tg_op <> 'INSERT' then previous_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then current_row := to_jsonb(new); end if;

  -- Automatic updated_at touches/no-op saves are not substantive changes.
  if tg_op = 'UPDATE' and previous_row - 'updated_at' = current_row - 'updated_at' then
    return new;
  end if;

  key_row := coalesce(current_row, previous_row);
  select jsonb_object_agg(key_name, key_row -> key_name)
    into row_key from unnest(tg_argv) as keys(key_name);

  select coalesce(jsonb_object_agg(field, jsonb_build_object(
      'old', previous_row -> field, 'new', current_row -> field)), '{}'::jsonb),
    coalesce(array_agg(field order by field), array[]::text[])
  into field_diff, field_names
  from (
    select jsonb_object_keys(coalesce(previous_row, '{}'::jsonb)) as field
    union
    select jsonb_object_keys(coalesce(current_row, '{}'::jsonb)) as field
  ) fields
  where field <> 'updated_at'
    and (previous_row -> field) is distinct from (current_row -> field);

  if caller_id is not null then
    select p.full_name, p.app_role::text, p.is_trainer
      into caller_name, caller_app_role, caller_is_trainer
    from public.profiles p where p.id = caller_id;
  end if;

  insert into public.change_audit_log (
    transaction_id, entity_table, record_key, operation,
    actor_user_id, actor_name, actor_app_role, actor_is_trainer, actor_source,
    database_session_user, request_role, trigger_depth,
    changed_fields, changes, old_data, new_data
  ) values (
    txid_current(), tg_table_name, row_key, tg_op,
    caller_id, caller_name, caller_app_role, caller_is_trainer,
    case when caller_id is not null then 'user'
      when caller_role = 'service_role' then 'service_role' else 'database' end,
    session_user::text, caller_role, pg_trigger_depth(),
    field_names, field_diff, previous_row, current_row
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.capture_change_audit() from public, anon, authenticated, service_role;

create function private.protect_change_audit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Değişiklik geçmişi değiştirilemez veya silinemez.' using errcode = '42501';
end;
$$;
revoke all on function private.protect_change_audit() from public, anon, authenticated, service_role;
create trigger change_audit_immutable before update or delete on public.change_audit_log
  for each row execute function private.protect_change_audit();
create trigger change_audit_no_truncate before truncate on public.change_audit_log
  for each statement execute function private.protect_change_audit();

-- TRUNCATE has no row triggers. Require ordinary DELETE so every removed row is audited.
create function private.prevent_unaudited_truncate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Geçmiş kaydını korumak için TRUNCATE yerine DELETE kullanılmalı.' using errcode = '42501';
end;
$$;
revoke all on function private.prevent_unaudited_truncate() from public, anon, authenticated, service_role;

do $$
declare
  tracked_table text;
  key_arguments text;
begin
  foreach tracked_table in array array[
    'reservations', 'tournaments', 'tournament_courts', 'tournament_categories',
    'tournament_groups', 'tournament_participants', 'tournament_players',
    'tournament_entries', 'tournament_entry_players', 'tournament_matches'
  ] loop
    key_arguments := case tracked_table
      when 'tournament_courts' then '''tournament_id'', ''court_id'''
      when 'tournament_entry_players' then '''entry_id'', ''position'''
      else '''id''' end;
    execute format(
      'create trigger capture_change_history after insert or update or delete on public.%I
       for each row execute function private.capture_change_audit(%s)', tracked_table, key_arguments);
    execute format(
      'create trigger require_audited_delete before truncate on public.%I
       for each statement execute function private.prevent_unaudited_truncate()', tracked_table);
  end loop;
end;
$$;

comment on table public.change_audit_log is
  'Forward-only reservation/tournament history. Admin read-only; trigger-only writes. Actor snapshots and old/new rows survive source deletion. Times are timestamptz; display in Europe/Istanbul.';
notify pgrst, 'reload schema';
