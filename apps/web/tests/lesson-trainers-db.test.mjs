import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = uid(1), trainer = uid(2), otherTrainer = uid(3), member = uid(4), court = uid(5);
const migration = (name) => readFile(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

test("lesson trainer migration and database authorization", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create table public.profiles (id uuid primary key, full_name text, email text,
      is_trainer boolean default false, app_role text default 'user');
    create table public.courts (id uuid primary key, is_active boolean default true);
    create table public.reservations (
      id uuid primary key default gen_random_uuid(), court_id uuid references public.courts(id),
      user_id uuid references public.profiles(id), starts_at timestamptz not null,
      ends_at timestamptz not null, status text default 'confirmed', note text,
      created_at timestamptz default now(), updated_at timestamptz default now(),
      check (ends_at > starts_at)
    );
    create function public.is_admin() returns boolean language sql stable as $$
      select exists (select 1 from public.profiles where id = auth.uid() and app_role in ('admin', 'super_admin')) $$;
    create function public.is_within_club_hours(s timestamptz, e timestamptz)
      returns boolean language sql stable as $$ select
        (s at time zone 'Europe/Istanbul')::time >= '06:00'::time and
        (e at time zone 'Europe/Istanbul')::time <= '23:00'::time and
        (s at time zone 'Europe/Istanbul')::date = (e at time zone 'Europe/Istanbul')::date $$;
    alter table public.reservations enable row level security;
    grant select on public.profiles, public.courts to authenticated;
    grant select, insert, update, delete on public.reservations to authenticated;
    create policy reservations_select_authenticated on public.reservations for select to authenticated using (true);
    create policy reservations_insert_own_or_admin on public.reservations for insert to authenticated
      with check ((user_id = auth.uid() or public.is_admin()) and status = 'confirmed');
    create policy reservations_update_admin on public.reservations for update to authenticated
      using (public.is_admin()) with check (public.is_admin());
    create policy reservations_cancel_own on public.reservations for update to authenticated
      using (user_id = auth.uid() and status = 'confirmed')
      with check (user_id = auth.uid() and status = 'canceled');
    insert into public.profiles values
      ('${admin}', 'Admin', 'admin@example.invalid', false, 'admin'),
      ('${trainer}', 'Serkan İrden', 'trainer@example.invalid', true, 'user'),
      ('${otherTrainer}', 'Osman Gülay', 'other@example.invalid', true, 'user'),
      ('${member}', 'Member', 'member@example.invalid', false, 'user');
    insert into auth.users select id from public.profiles;
    insert into public.courts values ('${court}', true);
    insert into public.reservations (id, court_id, user_id, starts_at, ends_at, note) values
      ('${uid(10)}', '${court}', '${admin}', date_trunc('day', now()) - interval '2 days' + interval '10 hours',
       date_trunc('day', now()) - interval '2 days' + interval '11 hours', '{"kind":"lesson","trainer_name":"SERKAN HOCA"}'),
      ('${uid(11)}', '${court}', '${admin}', now() - interval '2 months', now() - interval '2 months' + interval '1 hour',
       '{"kind":"lesson","trainer_name":"Serkan İrden"}'),
      ('${uid(12)}', '${court}', '${trainer}', now(), now() + interval '1 hour',
       '{"kind":"lesson","trainer_name":"Osman Gülay"}'),
      ('${uid(13)}', '${court}', '${member}', now(), now() + interval '1 hour', 'Legacy custom note'),
      ('${uid(14)}', '${court}', '${member}', now(), now() + interval '1 hour', '{"kind":"lesson","trainer_name":"Unknown"}');
  `);
  await db.exec(await migration("20260822165809_allow_trainers_manage_own_lessons"));
  await db.exec(await migration("20260906091240_registered_lesson_trainers"));
  const asUser = async (id, action) => {
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    try { return await action(); }
    finally { await db.exec("reset role; reset request.jwt.claim.sub"); }
  };
  const get = async (id) => (await db.query("select * from public.reservations where id = $1", [id])).rows[0];
  const update = (id, assignment) => db.query(`update public.reservations set ${assignment} where id = $1 returning *`, [id]);

  await t.test("backfill matches named trainers without changing reservation owners", async () => {
    assert.equal((await get(uid(10))).trainer_id, trainer);
    assert.equal((await get(uid(10))).user_id, admin);
    assert.equal((await get(uid(12))).trainer_id, otherTrainer);
    assert.equal((await get(uid(13))).trainer_id, null);
    assert.equal((await get(uid(14))).trainer_id, null);
  });
  await t.test("assigned trainer edits past lesson created by another person", async () => {
    const result = await asUser(trainer, () => update(uid(10), `note = '{"kind":"lesson","trainer_name":"Typed fake name","student_name":"New student"}'`));
    assert.equal(result.rows.length, 1);
    assert.equal(JSON.parse(result.rows[0].note).trainer_name, "Serkan İrden");
    assert.equal(JSON.parse((await get(uid(10))).note).student_name, "New student");
  });
  await t.test("trainer cannot manage another trainer's lesson even as reservation owner", async () => {
    await assert.rejects(asUser(trainer, () => update(uid(12), "starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day'")), /yetkiniz/);
    assert.equal((await get(uid(12))).trainer_id, otherTrainer);
  });
  await t.test("another trainer and ordinary user cannot edit assigned lesson", async () => {
    const before = await get(uid(10));
    for (const id of [otherTrainer, member]) {
      assert.equal((await asUser(id, () => update(uid(10), "note = 'spoofed'"))).rows.length, 0);
    }
    assert.deepEqual(await get(uid(10)), before);
  });
  await t.test("trainer cannot reassign owner, instructor or change lesson kind", async () => {
    for (const assignment of [`user_id = '${trainer}'`, `trainer_id = '${otherTrainer}'`, `note = '{"kind":"match"}'`,
      "starts_at = now() - interval '2 months'", `status = 'canceled', user_id = '${trainer}'`]) {
      await assert.rejects(asUser(trainer, () => update(uid(10), assignment)), /değiştirilemez/);
    }
    assert.equal((await get(uid(10))).user_id, admin);
    assert.equal((await get(uid(10))).status, "confirmed");
  });
  await t.test("one-month boundary is enforced by RLS and old rows remain intact", async () => {
    assert.equal((await asUser(trainer, () => update(uid(11), "status = 'canceled'"))).rows.length, 0);
    assert.equal((await get(uid(11))).status, "confirmed");
  });
  await t.test("new lessons require registered trainer ID, including admin inserts", async () => {
    const insert = (id) => db.query(`insert into public.reservations
      (court_id, user_id, trainer_id, starts_at, ends_at, note)
      values ($1, $2, $3, now(), now() + interval '1 hour', '{"kind":"lesson","trainer_name":"Fake"}') returning *`,
    [court, admin, id]);
    for (const id of [null, member, uid(999)]) {
      await assert.rejects(asUser(admin, () => insert(id)), /kayıtlı eğitmen/);
    }
    const saved = await asUser(admin, () => insert(trainer));
    assert.equal(saved.rows[0].trainer_id, trainer);
    assert.equal(JSON.parse(saved.rows[0].note).trainer_name, "Serkan İrden");
  });
  await t.test("assigned trainer can cancel someone else's lesson; cannot restore it", async () => {
    const result = await asUser(trainer, () => update(uid(10), "status = 'canceled'"));
    assert.equal(result.rows[0].status, "canceled");
    assert.equal((await asUser(trainer, () => update(uid(10), "status = 'confirmed'"))).rows.length, 0);
    assert.equal((await get(uid(10))).status, "canceled");
  });
  await t.test("revoking trainer status removes assigned-lesson authority immediately", async () => {
    await db.query("update public.profiles set is_trainer = false where id = $1", [otherTrainer]);
    assert.equal((await asUser(otherTrainer, () => update(uid(12), "status = 'canceled'"))).rows.length, 0);
    assert.equal((await get(uid(12))).status, "confirmed");
    await db.query("update public.profiles set is_trainer = true where id = $1", [otherTrainer]);
  });
  await t.test("validation trigger does not expose a privileged public RPC", async () => {
    const result = await db.query(`select prosecdef,
      has_function_privilege('anon', oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', oid, 'EXECUTE') as user_execute
      from pg_proc where proname = 'validate_lesson_trainer'`);
    assert.deepEqual(result.rows[0], {prosecdef:false, anon_execute:false, user_execute:false});
  });
  await t.test("normal owner cancellation stays available but cannot smuggle changes", async () => {
    await assert.rejects(asUser(member, () => update(uid(13), "status = 'canceled', note = 'changed'")), /yetkiniz/);
    const result = await asUser(member, () => update(uid(13), "status = 'canceled'"));
    assert.equal(result.rows[0].note, "Legacy custom note");
  });
  await t.test("admin may cancel unresolved legacy lesson and edit older lesson", async () => {
    assert.equal((await asUser(admin, () => update(uid(14), "status = 'canceled'"))).rows.length, 1);
    assert.equal((await asUser(admin, () => update(uid(11), `trainer_id = '${otherTrainer}'`))).rows.length, 1);
  });
});
