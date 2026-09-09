import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const uid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = uid(1), member = uid(2), trainer = uid(3), superAdmin = uid(4), court = uid(5);
const tournament = uid(10), category = uid(11), group = uid(12), player = uid(13), otherPlayer = uid(14);
const entry = uid(15), otherEntry = uid(16), match = uid(17);
const migration = (name) => readFile(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const tracked = ["reservations", "tournaments", "tournament_courts", "tournament_categories",
  "tournament_groups", "tournament_participants", "tournament_players", "tournament_entries",
  "tournament_entry_players", "tournament_matches"];

test("append-only reservation and tournament change history", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    set timezone = 'UTC';
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
    grant usage on schema auth to authenticated, anon, service_role;
    create table public.profiles (id uuid primary key, full_name text, app_role text, is_trainer boolean);
    create table public.courts (id uuid primary key, name text, is_active boolean default true);
    create table public.club_settings (id smallint primary key, reservation_slot_minutes integer);
    insert into public.club_settings values (1,60);
    create table public.reservations (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles on delete cascade,
      court_id uuid references public.courts, trainer_id uuid references public.profiles on delete set null,
      starts_at timestamptz not null, ends_at timestamptz not null,
      status text default 'confirmed', note text, created_at timestamptz default now(),
      updated_at timestamptz default now(), check (ends_at > starts_at)
    );
    create function public.is_admin() returns boolean language sql stable as $$
      select exists(select 1 from public.profiles where id=auth.uid() and app_role in ('admin','super_admin')) $$;
    create function public.touch_updated_at() returns trigger language plpgsql as $$
      begin new.updated_at=clock_timestamp(); return new; end $$;
    insert into public.profiles values
      ('${admin}','Admin Name','admin',false), ('${member}','Member Name','user',false),
      ('${trainer}','Trainer Name','user',true), ('${superAdmin}','Super Admin Name','super_admin',false);
    insert into public.courts (id,name) values ('${court}','Kort A');
  `);
  // Reuse the real tournament table definitions and propagation triggers, without importing the live fixture.
  const base = await migration("20260816091158_tournaments");
  await db.exec(base.slice(0, base.indexOf("create index tournament_categories_tournament_id_idx")));
  const normalized = await migration("20260816112937_normalize_tournament_players_and_entries");
  await db.exec(normalized.slice(0, normalized.indexOf("alter table public.tournament_matches")));
  await db.exec(`alter table public.tournament_matches
    add column player1_entry_id uuid references public.tournament_entries on delete restrict,
    add column player2_entry_id uuid references public.tournament_entries on delete restrict,
    add column score_entered boolean default false,
    add column score_sets jsonb default '[]', add column is_walkover boolean default false,
    add column winner_entry_id uuid, add column is_retired boolean default false;
  `);
  await db.exec(normalized.slice(normalized.indexOf("create trigger tournament_players_touch_updated_at"), normalized.indexOf("grant select, insert, update, delete")));
  await db.exec(`
    insert into public.tournaments (id,name,group_stage_start_date,group_stage_end_date,finals_start_date,finals_end_date)
      values ('${tournament}','Test Tournament','2026-09-01','2026-10-01','2026-10-02','2026-10-05');
    insert into public.tournament_courts values ('${tournament}','${court}');
    insert into public.tournament_categories (id,tournament_id,name,group_count,group_size)
      values ('${category}','${tournament}','Mix',1,2);
    insert into public.tournament_groups (id,category_id,name) values ('${group}','${category}','A');
    insert into public.tournament_participants (id,category_id,group_id,display_name)
      values ('${uid(18)}','${category}','${group}','Legacy Player');
    insert into public.tournament_players (id,tournament_id,display_name) values
      ('${player}','${tournament}','Original Player'), ('${otherPlayer}','${tournament}','Opponent');
    insert into public.tournament_entries (id,category_id,group_id) values
      ('${entry}','${category}','${group}'), ('${otherEntry}','${category}','${group}');
    insert into public.tournament_entry_players (entry_id,player_id,position) values
      ('${entry}','${player}',1), ('${otherEntry}','${otherPlayer}',1);
    insert into public.tournament_matches
      (id,tournament_id,category_id,group_id,court_id,starts_at,ends_at,player1_entry_id,player2_entry_id)
      values ('${match}','${tournament}','${category}','${group}','${court}',
      '2026-09-09 18:00+03','2026-09-09 19:30+03','${entry}','${otherEntry}');
    grant select on public.profiles, public.courts to authenticated, service_role;
    grant delete on public.profiles to service_role;
  `);
  for (const table of tracked) {
    await db.exec(`alter table public.${table} enable row level security;
      grant select, insert, update, delete on public.${table} to authenticated, service_role;
      create policy read_rows on public.${table} for select to authenticated using (true);
      create policy admin_writes on public.${table} for all to authenticated
        using (public.is_admin()) with check (public.is_admin());`);
  }
  await db.exec(`create policy own_reservation on public.reservations for all to authenticated
    using (user_id=auth.uid() or trainer_id=auth.uid()) with check (user_id=auth.uid() or trainer_id=auth.uid());
    create trigger reservations_touch_updated_at before update on public.reservations
      for each row execute function public.touch_updated_at();
    create trigger tournament_matches_touch_updated_at before update on public.tournament_matches
      for each row execute function public.touch_updated_at();`);
  await db.exec(await migration("20260909075651_reservation_tournament_change_history"));

  const asUser = async (id, action, role = "authenticated") => {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({sub:id, role,
      user_metadata:{full_name:"Forged Admin",app_role:"super_admin"}})]);
    try { return await action(); }
    finally { await db.exec("reset role; reset request.jwt.claims"); }
  };
  const logs = async (table, key) => (await db.query(`select * from public.change_audit_log
    where entity_table=$1 and record_key=$2::jsonb order by id`, [table, JSON.stringify(key)])).rows;
  const count = async () => (await db.query("select count(*)::int as count from public.change_audit_log")).rows[0].count;
  const insertReservation = (id, owner, note = null, instructor = null) => db.query(`insert into public.reservations
    (id,user_id,court_id,starts_at,ends_at,note,trainer_id) values
    ($1,$2,$3,'2026-09-09 18:00+03','2026-09-09 19:00+03',$4,$5)`, [id,owner,court,note,instructor]);

  await t.test("history starts now and all ten source tables are covered", async () => {
    assert.equal(await count(), 0);
    const rows = (await db.query("select tgrelid::regclass::text as name from pg_trigger where tgname='capture_change_history' order by name")).rows;
    assert.deepEqual(rows.map(r=>r.name), [...tracked].sort());
  });
  await t.test("member creation captures verified actor, actual timestamp and complete row", async () => {
    await asUser(member, () => insertReservation(uid(20), member, '{"kind":"match","match_type":"singles"}'));
    const [log] = await logs("reservations", {id:uid(20)});
    assert.equal(log.operation, "INSERT");
    assert.equal(log.actor_user_id, member);
    assert.equal(log.actor_name, "Member Name");
    assert.equal(log.actor_app_role, "user");
    assert.equal(log.actor_source, "user");
    assert.equal(log.old_data, null);
    assert.equal(log.new_data.user_id, member);
    assert.equal(new Date(log.new_data.starts_at).toISOString(), "2026-09-09T15:00:00.000Z");
    assert.ok(Math.abs(Date.now() - new Date(log.occurred_at).getTime()) < 60000);
  });
  await t.test("date/time changes retain exact old and new values, separate from score edits", async () => {
    await asUser(admin, () => db.query(`update public.tournament_matches
      set starts_at='2026-09-10 19:30+03',ends_at='2026-09-10 21:00+03' where id=$1`,[match]));
    const [log] = await logs("tournament_matches", {id:match});
    assert.deepEqual(log.changed_fields, ["ends_at", "starts_at"]);
    assert.equal(new Date(log.changes.starts_at.old).toISOString(), "2026-09-09T15:00:00.000Z");
    assert.equal(new Date(log.changes.starts_at.new).toISOString(), "2026-09-10T16:30:00.000Z");
    await asUser(superAdmin, () => db.query(`update public.tournament_matches
      set score_entered=true, score_sets='[{"player1":6,"player2":4}]', is_retired=true, winner_entry_id=$2 where id=$1`,[match,entry]));
    const latest = (await logs("tournament_matches", {id:match})).at(-1);
    assert.equal(latest.actor_app_role, "super_admin");
    assert.ok(latest.changed_fields.includes("score_sets"));
    assert.ok(!latest.changed_fields.includes("starts_at"));
    assert.deepEqual(latest.changes.score_sets.old, []);
    assert.deepEqual(latest.changes.score_sets.new, [{player1:6,player2:4}]);
  });
  await t.test("no-op and timestamp-only saves do not invent changes", async () => {
    const before = await count();
    await asUser(admin, () => db.query("update public.tournament_matches set starts_at=starts_at where id=$1",[match]));
    assert.equal(await count(), before);
  });
  await t.test("normal, doubles, lesson and custom reservations all record edits and cancellation", async () => {
    const notes = ['{"kind":"match","match_type":"singles"}', '{"kind":"match","match_type":"doubles"}',
      '{"kind":"lesson","trainer_name":"Trainer Name","student_name":"Student"}', 'Custom reservation'];
    for (const [index,note] of notes.entries()) {
      const id=uid(30+index);
      await asUser(admin, () => insertReservation(id,member,note,index===2?trainer:null));
      await asUser(admin, () => db.query("update public.reservations set starts_at=starts_at+interval '1 day', ends_at=ends_at+interval '1 day' where id=$1",[id]));
      await asUser(member, () => db.query("update public.reservations set status='canceled' where id=$1",[id]));
      const events=await logs("reservations",{id});
      assert.deepEqual(events.map(e=>e.operation), ["INSERT","UPDATE","UPDATE"]);
      assert.deepEqual(events.at(-1).changes.status,{old:"confirmed",new:"canceled"});
      assert.equal(events.at(-1).actor_user_id,member);
    }
  });
  await t.test("assigned trainer is the actor, not the admin who owns the lesson", async () => {
    await asUser(admin, () => insertReservation(uid(40),admin,'{"kind":"lesson","student_name":"Before"}',trainer));
    await asUser(trainer, () => db.query(`update public.reservations
      set note='{"kind":"lesson","student_name":"After"}' where id=$1`,[uid(40)]));
    const log=(await logs("reservations",{id:uid(40)})).at(-1);
    assert.equal(log.actor_user_id,trainer);
    assert.equal(log.actor_is_trainer,true);
    assert.equal(log.new_data.user_id,admin);
    assert.equal(JSON.parse(log.changes.note.old).student_name,"Before");
    assert.equal(JSON.parse(log.changes.note.new).student_name,"After");
  });
  await t.test("player renames log both the player and propagated match names under one actor/transaction", async () => {
    await asUser(admin, () => db.query("update public.tournament_players set display_name='Renamed Player' where id=$1",[player]));
    const playerLog=(await logs("tournament_players",{id:player})).at(-1);
    const matchLog=(await logs("tournament_matches",{id:match})).at(-1);
    assert.equal(matchLog.changes.player1_name.old,"Original Player");
    assert.equal(matchLog.changes.player1_name.new,"Renamed Player");
    assert.equal(matchLog.actor_user_id,admin);
    assert.equal(matchLog.transaction_id,playerLog.transaction_id);
    assert.ok(matchLog.trigger_depth>playerLog.trigger_depth);
  });
  await t.test("category, group, entry, membership, court assignment and tournament settings are tracked", async () => {
    const assignments = [
      ["tournament_categories",category,"name='Advanced Mix'"], ["tournament_groups",group,"name='B'"],
      ["tournament_entries",entry,"display_order=3"], ["tournament_participants",uid(18),"display_name='New Legacy Name'"],
      ["tournaments",tournament,"name='Renamed Tournament',is_active=true"]
    ];
    for (const [table,id,assignment] of assignments) {
      await asUser(admin, () => db.query(`update public.${table} set ${assignment} where id=$1`,[id]));
      assert.equal((await logs(table,{id})).at(-1).actor_user_id,admin);
    }
    await asUser(admin, () => db.query("update public.tournament_entry_players set player_id=$1 where entry_id=$2 and position=1",[otherPlayer,entry]));
    const membership=(await logs("tournament_entry_players",{entry_id:entry,position:1})).at(-1);
    assert.deepEqual(membership.changes.player_id,{old:player,new:otherPlayer});
    await asUser(admin, () => db.query("delete from public.tournament_courts where tournament_id=$1",[tournament]));
    const courtLog=(await logs("tournament_courts",{tournament_id:tournament,court_id:court})).at(-1);
    assert.equal(courtLog.operation,"DELETE");
    assert.equal(courtLog.new_data,null);
  });
  await t.test("denied, failed and rolled-back mutations leave neither changes nor audit events", async () => {
    const before=await count();
    assert.equal((await asUser(member, () => db.query("update public.tournaments set name='Unauthorized' where id=$1 returning id",[tournament]))).rows.length,0);
    await assert.rejects(asUser(member, () => insertReservation(uid(50),admin)));
    await assert.rejects(asUser(admin, () => db.query("update public.reservations set ends_at=starts_at where id=$1",[uid(20)])));
    await asUser(admin, async () => {
      await db.exec("begin");
      await db.query("update public.tournaments set name='Rolled back' where id=$1",[tournament]);
      await db.exec("rollback");
    });
    assert.equal(await count(),before);
  });
  await t.test("anonymous/member/trainer cannot read history, admins can, no application role can forge or erase it", async () => {
    await assert.rejects(asUser(null,()=>db.query("select * from public.change_audit_log"),"anon"),/permission denied/);
    for (const id of [member,trainer]) assert.equal((await asUser(id,()=>db.query("select * from public.change_audit_log"))).rows.length,0);
    for (const id of [admin,superAdmin]) assert.ok((await asUser(id,()=>db.query("select * from public.change_audit_log"))).rows.length>0);
    for (const [id,role] of [[admin,"authenticated"],[superAdmin,"authenticated"],[member,"authenticated"],[null,"service_role"]]) {
      for (const sql of ["insert into public.change_audit_log default values", "update public.change_audit_log set actor_name='Fake'",
        "delete from public.change_audit_log", "truncate public.change_audit_log"]) {
        await assert.rejects(asUser(id,()=>db.exec(sql),role),/permission denied/);
      }
      await assert.rejects(asUser(id,()=>db.exec("select private.capture_change_audit()"),role),/permission denied/);
    }
  });
  await t.test("database maintenance and service requests are labeled honestly, anonymous identities fail closed", async () => {
    await db.query("update public.tournaments set name='Maintenance' where id=$1",[tournament]);
    let log=(await logs("tournaments",{id:tournament})).at(-1);
    assert.equal(log.actor_source,"database"); assert.equal(log.actor_user_id,null);
    await asUser(null,()=>db.query("update public.tournaments set name='Service operation' where id=$1",[tournament]),"service_role");
    log=(await logs("tournaments",{id:tournament})).at(-1);
    assert.equal(log.actor_source,"service_role"); assert.equal(log.actor_name,null);
    await db.query("select set_config('request.jwt.claims', $1, false)",[JSON.stringify({role:"authenticated"})]);
    try { await assert.rejects(db.query("update public.tournaments set name='Missing identity' where id=$1",[tournament]),/kimliği gerekli/); }
    finally { await db.exec("reset request.jwt.claims"); }
  });
  await t.test("deletion/cascades preserve full rows and actor snapshots even if source profiles disappear", async () => {
    await asUser(admin,()=>db.query("delete from public.reservations where id=$1",[uid(20)]));
    const deletion=(await logs("reservations",{id:uid(20)})).at(-1);
    assert.equal(deletion.operation,"DELETE"); assert.equal(deletion.old_data.user_id,member);
    await db.query("update public.profiles set full_name='Different Name' where id=$1",[admin]);
    assert.equal((await logs("reservations",{id:uid(20)})).at(-1).actor_name,"Admin Name");
    await asUser(superAdmin,()=>db.query("delete from public.tournament_groups where id=$1",[group]));
    const groupDeletion=(await logs("tournament_groups",{id:group})).at(-1);
    const ungroupedMatch=(await logs("tournament_matches",{id:match})).at(-1);
    assert.equal(ungroupedMatch.operation,"UPDATE");
    assert.deepEqual(ungroupedMatch.changes.group_id,{old:group,new:null});
    assert.equal(groupDeletion.transaction_id,ungroupedMatch.transaction_id);
    assert.equal(ungroupedMatch.actor_user_id,superAdmin);
    // Respect existing RESTRICT relations; no change to production deletion rules.
    await asUser(superAdmin,()=>db.query("delete from public.tournament_matches where id=$1",[match]));
    assert.equal((await logs("tournament_matches",{id:match})).at(-1).operation,"DELETE");
    await asUser(superAdmin,()=>db.query("delete from public.tournament_entry_players where entry_id in ($1,$2)",[entry,otherEntry]));
    await asUser(superAdmin,()=>db.query("delete from public.tournaments where id=$1",[tournament]));
    const parent=(await logs("tournaments",{id:tournament})).at(-1);
    const child=(await logs("tournament_categories",{id:category})).at(-1);
    assert.equal(parent.operation,"DELETE"); assert.equal(child.operation,"DELETE");
    assert.equal(parent.transaction_id,child.transaction_id);
    await asUser(superAdmin,()=>db.query("delete from public.profiles where id=$1",[member]),"service_role");
    assert.equal((await logs("reservations",{id:uid(20)}))[0].actor_name,"Member Name");
    const cascade=(await logs("reservations",{id:uid(30)})).at(-1);
    assert.equal(cascade.operation,"DELETE"); assert.equal(cascade.actor_user_id,superAdmin);
  });
  await t.test("even accidental privileged mutation/truncation is blocked; trigger has no public RPC access", async () => {
    await assert.rejects(db.exec("update public.change_audit_log set actor_name='Fake'"),/değiştirilemez/);
    await assert.rejects(db.exec("delete from public.change_audit_log"),/değiştirilemez/);
    await assert.rejects(db.exec("truncate public.change_audit_log"),/değiştirilemez/);
    for (const table of tracked) await assert.rejects(db.exec(`truncate public.${table} cascade`),/TRUNCATE yerine DELETE/);
    const rows=(await db.query(`select n.nspname,p.proname,p.prosecdef,p.proconfig,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as user_execute,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname in ('capture_change_audit','protect_change_audit','prevent_unaudited_truncate')`)).rows;
    assert.equal(rows.length,3);
    for (const row of rows) {
      assert.equal(row.nspname,"private"); assert.equal(row.user_execute,false); assert.equal(row.anon_execute,false);
      assert.ok(row.proconfig.some(c=>c.startsWith("search_path=")));
      assert.equal(row.prosecdef,row.proname==="capture_change_audit");
    }
  });
  await t.test("rollback smoke script validates six events without retaining test data or history", async () => {
    const before=await count();
    const smoke=await readFile(new URL("../../../supabase/tests/change_history_smoke.sql",import.meta.url),"utf8");
    const results=await db.exec(smoke);
    const result=results.at(-1).rows[0];
    assert.equal(result.no_test_court,true);
    assert.equal(result.no_test_tournament,true);
    assert.equal(await count(),before);
  });
});
