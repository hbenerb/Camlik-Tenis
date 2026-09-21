import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = uid(1), member = uid(2), court = uid(3), inactiveCourt = uid(4);
const migration = () => readFile(
  new URL("../../../supabase/migrations/20260919195053_allow_admin_past_reservation_entries.sql", import.meta.url),
  "utf8",
);

test("admins create and edit past reservations without widening member access", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());

  await db.exec(`
    set timezone = 'UTC';
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;

    create table public.profiles (
      id uuid primary key,
      app_role text not null default 'user',
      can_book boolean not null default false
    );
    create table public.club_settings (
      id integer primary key,
      timezone text not null,
      reservation_slot_minutes integer not null,
      max_active_reservations integer not null
    );
    create table public.courts (
      id uuid primary key,
      is_active boolean not null default true
    );
    create table public.reservations (
      id uuid primary key default gen_random_uuid(),
      court_id uuid not null references public.courts(id),
      user_id uuid not null references public.profiles(id),
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      status text not null default 'confirmed',
      note text
    );
    create table public.tournaments (
      id uuid primary key default gen_random_uuid(),
      is_active boolean not null default true
    );
    create table public.tournament_matches (
      id uuid primary key default gen_random_uuid(),
      tournament_id uuid not null references public.tournaments(id),
      court_id uuid not null references public.courts(id),
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      status text not null default 'scheduled'
    );

    create function public.is_admin() returns boolean language sql stable as $$
      select exists (
        select 1 from public.profiles
        where id = auth.uid() and app_role in ('admin', 'super_admin')
      )
    $$;
    create function public.booking_window_days(user_id uuid)
      returns integer language sql stable as $$ select 2 $$;
    create function public.is_within_club_hours(starts_at timestamptz, ends_at timestamptz)
      returns boolean language sql stable as $$ select true $$;

    insert into public.profiles values
      ('${admin}', 'admin', true),
      ('${member}', 'user', true);
    insert into public.club_settings values (1, 'UTC', 60, 2);
    insert into public.courts values ('${court}', true), ('${inactiveCourt}', false);

    alter table public.reservations enable row level security;
    grant select on public.profiles, public.club_settings, public.courts,
      public.tournaments, public.tournament_matches to authenticated;
    grant select, insert, update on public.reservations to authenticated;
    create policy reservations_select_authenticated
      on public.reservations for select to authenticated using (true);
    create policy reservations_insert_own_or_admin
      on public.reservations for insert to authenticated
      with check (
        (user_id = auth.uid() or public.is_admin())
        and status = 'confirmed'
        and ends_at > starts_at
        and starts_at >= now()
        and public.is_within_club_hours(starts_at, ends_at)
        and (public.is_admin() or starts_at <= now() + make_interval(days => public.booking_window_days(auth.uid())))
        and exists (
          select 1 from public.courts
          where courts.id = court_id and courts.is_active
        )
      );
    create policy reservations_update_admin
      on public.reservations for update to authenticated
      using (public.is_admin()) with check (public.is_admin());
  `);

  await db.exec(await migration());
  const policies = await db.query(`
    select policyname from pg_policies
    where tablename = 'reservations' and cmd = 'INSERT'
    order by policyname
  `);
  assert.deepEqual(policies.rows.map((row) => row.policyname), [
    "reservations_insert_admin_past", "reservations_insert_own_or_admin",
  ]);
  await db.exec(`
    create trigger reservations_validate
    before insert or update on public.reservations
    for each row execute function public.validate_reservation();
  `);

  const asUser = async (id, action) => {
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    try { return await action(); }
    finally { await db.exec("reset role; reset request.jwt.claim.sub"); }
  };
  const insertReservation = (ownerId, courtId, startsAt) => db.query(`
    insert into public.reservations (court_id, user_id, starts_at, ends_at)
    values ($1, $2, $3, $3::timestamptz + interval '1 hour')
    returning *
  `, [courtId, ownerId, startsAt]);

  await t.test("admin inserts an elapsed hour and an earlier day", async () => {
    const elapsed = await asUser(admin, () =>
      insertReservation(member, court, new Date(Date.now() - 15 * 60_000).toISOString()));
    const earlier = await asUser(admin, () =>
      insertReservation(member, court, new Date(Date.now() - 3 * 86_400_000).toISOString()));

    assert.equal(elapsed.rows.length, 1);
    assert.equal(earlier.rows.length, 1);
    assert.equal(elapsed.rows[0].user_id, member);
  });

  await t.test("admin moves an existing reservation further into the past", async () => {
    const inserted = await asUser(admin, () =>
      insertReservation(member, court, new Date(Date.now() - 86_400_000).toISOString()));
    const updated = await asUser(admin, () => db.query(`
      update public.reservations
      set starts_at = now() - interval '5 days', ends_at = now() - interval '5 days' + interval '1 hour'
      where id = $1
      returning *
    `, [inserted.rows[0].id]));

    assert.equal(updated.rows.length, 1);
    assert.ok(new Date(updated.rows[0].starts_at).getTime() < Date.now() - 4 * 86_400_000);
  });

  await t.test("member past inserts and inactive courts remain blocked", async () => {
    await assert.rejects(
      asUser(member, () =>
        insertReservation(member, court, new Date(Date.now() - 15 * 60_000).toISOString())),
      /Gecmis tarihli/,
    );
    await assert.rejects(
      asUser(admin, () =>
        insertReservation(member, inactiveCourt, new Date(Date.now() - 15 * 60_000).toISOString())),
      /row-level security/,
    );
  });

  await t.test("member can still create an allowed future reservation only for self", async () => {
    const future = await asUser(member, () =>
      insertReservation(member, court, new Date(Date.now() + 60 * 60_000).toISOString()));
    assert.equal(future.rows.length, 1);

    await assert.rejects(
      asUser(member, () =>
        insertReservation(admin, court, new Date(Date.now() + 61 * 60_000).toISOString())),
      /row-level security/,
    );
  });

  await t.test("migration can be applied again after a manual production update", async () => {
    await db.exec(await migration());
    const result = await db.query(`
      select count(*)::integer as count from pg_policies
      where schemaname = 'public' and tablename = 'reservations'
        and policyname = 'reservations_insert_admin_past'
    `);
    assert.equal(result.rows[0].count, 1);
  });
});
