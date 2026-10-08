import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { uid, admin, member, courtA, courtB, activeTournament, draftTournament, legacy1, fixtureSQL,
  durationSQL, migrationSQL, matchSQL, reservationSQL, seedSQL } from "./fixtures/court-schedule.mjs";

test("court occupancy is enforced on every write path without changing existing fixtures", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fixtureSQL);
  await db.exec(await durationSQL());
  await db.exec(seedSQL);
  const before = (await db.query("select * from public.tournament_matches order by id")).rows;
  await db.exec(await migrationSQL());
  assert.deepEqual((await db.query("select * from public.tournament_matches order by id")).rows, before);

  const a = uid(20), b = uid(21), r = uid(22);
  const at = (time) => `2030-11-01 ${time}+03`;
  const check = (name, fn) => t.test(name, async () => {
    await db.exec("begin");
    try { await fn(); } finally { await db.exec("rollback"); }
  });
  const rejected = async (sql, pattern = /çakış/) => {
    await db.exec("savepoint rejection");
    await assert.rejects(db.exec(sql), pattern);
    await db.exec("rollback to savepoint rejection; release savepoint rejection");
  };
  const move = (id, start) => `update public.tournament_matches set starts_at='${at(start)}' where id='${id}'`;

  await check("equal/partial/contained intervals and other tournaments are rejected", async () => {
    await db.exec(matchSQL(a, at("14:00")));
    for (const time of ["14:00", "13:30", "15:00"]) await rejected(matchSQL(b, at(time)));
    await rejected(matchSQL(b, at("14:30"), courtA, draftTournament));
    await db.exec(reservationSQL(r, at("14:30"), courtA, "canceled"));
    await rejected(`update public.reservations set status='confirmed' where id='${r}'`);
  });
  await check("back-to-back and different-court matches are allowed", async () => {
    await db.exec(matchSQL(a, at("14:00")) + matchSQL(b, at("15:30")) + matchSQL(uid(23), at("14:00"), courtB));
  });
  await check("editing date/time cannot move a match onto another", async () => {
    await db.exec(matchSQL(a, at("14:00")) + matchSQL(b, at("18:00")));
    await rejected(move(b, "14:00"));
    await rejected(move(b, "15:00"));
    assert.equal((await db.query(`select extract(hour from starts_at at time zone 'Europe/Istanbul')::int as hour from public.tournament_matches where id='${b}'`)).rows[0].hour,18);
  });
  await check("changing only court is checked", async () => {
    await db.exec(matchSQL(a, at("14:00")) + matchSQL(b, at("14:00"), courtB));
    await rejected(`update public.tournament_matches set court_id='${courtA}' where id='${b}'`);
  });
  await check("canceled fixtures do not occupy courts but restoring them does", async () => {
    await db.exec(matchSQL(a, at("14:00")) + matchSQL(b, at("14:00"), courtA, activeTournament, "canceled"));
    await rejected(`update public.tournament_matches set status='scheduled' where id='${b}'`);
    await rejected(`update public.tournament_matches set status='completed' where id='${b}'`);
    await db.exec(`update public.tournament_matches set status='canceled' where id='${a}';
      update public.tournament_matches set status='scheduled' where id='${b}';`);
  });
  await check("completed fixtures still occupy their court", async () => {
    await db.exec(matchSQL(a, at("14:00"), courtA, activeTournament, "completed"));
    await rejected(matchSQL(b, at("15:00")));
  });
  await check("reservation/lesson and tournament conflicts are blocked in both directions", async () => {
    await db.exec(reservationSQL(r, at("14:00")));
    await rejected(matchSQL(a, at("14:30")));
    await db.exec(matchSQL(a, at("18:00")));
    await rejected(`update public.reservations set starts_at='${at("18:30")}', ends_at='${at("19:30")}' where id='${r}'`);
    await rejected(reservationSQL(uid(23), at("18:30")));
    await rejected(reservationSQL(uid(24), at("14:30")));
  });
  await check("a tournament duration increase is fully rolled back on overlap", async () => {
    await db.exec(matchSQL(a, at("14:00"), courtB) + matchSQL(b, at("15:30"), courtB));
    await rejected(`update public.tournaments set match_duration_minutes=120 where id='${activeTournament}'`);
    assert.equal((await db.query(`select match_duration_minutes as duration from public.tournaments where id='${activeTournament}'`)).rows[0].duration,90);
    assert.equal((await db.query(`select extract(epoch from ends_at-starts_at)::int as seconds from public.tournament_matches where id='${a}'`)).rows[0].seconds,5400);
  });
  await check("duration growth also checks normal reservations", async () => {
    await db.exec(matchSQL(a, at("14:00"), courtB, draftTournament));
    await db.exec(`update public.tournaments set is_active=true where id='${draftTournament}'`);
    await db.exec(reservationSQL(r, at("15:30"), courtB));
    await rejected(`update public.tournaments set match_duration_minutes=120 where id='${draftTournament}'`);
  });
  await check("inactive drafts may overlap reservations but cannot be activated", async () => {
    await db.exec(matchSQL(a, at("14:00"), courtA, draftTournament) + reservationSQL(r, at("14:00")));
    await rejected(`update public.tournaments set is_active=true where id='${draftTournament}'`);
    await db.exec(`update public.reservations set status='canceled' where id='${r}';
      update public.tournaments set is_active=true where id='${draftTournament}'`);
  });
  await check("moving a draft fixture into an active tournament rechecks occupancy", async () => {
    await db.exec(matchSQL(a, at("14:00"), courtA, draftTournament) + reservationSQL(r, at("14:00")));
    await rejected(`update public.tournament_matches set tournament_id='${activeTournament}' where id='${a}'`);
  });
  await check("activating a legacy overlapping fixture fails", async () => {
    await db.exec(`update public.tournaments set is_active=false where id='${activeTournament}'`);
    await rejected(`update public.tournaments set is_active=true where id='${activeTournament}'`);
  });
  await check("activation checks final duration when both settings change", async () => {
    await db.exec(matchSQL(a, at("14:00"), courtB, draftTournament) + reservationSQL(r, at("15:00"), courtB));
    await db.exec(`update public.tournaments set is_active=true,match_duration_minutes=60 where id='${draftTournament}'`);
  });
  await check("multi-row insertion cannot bypass the check", async () => {
    await rejected(`insert into public.tournament_matches(tournament_id,court_id,starts_at,ends_at)
      values ('${activeTournament}','${courtA}','${at("14:00")}','${at("15:30")}'),
             ('${activeTournament}','${courtA}','${at("15:00")}','${at("16:30")}')`);
  });
  await check("bulk movement checks final rows, not the previous positions", async () => {
    await db.exec(matchSQL(a, at("14:00")) + matchSQL(b, at("15:30")));
    await db.exec(`update public.tournament_matches set starts_at=starts_at+interval '90 minutes' where id in ('${a}','${b}')`);
  });
  await check("legacy score/name edits are allowed, moving into a conflict is not", async () => {
    await db.exec(`update public.tournament_matches set status='completed', score='6-4 6-4', starts_at=starts_at where id='${legacy1}'`);
    await rejected(`update public.tournament_matches set starts_at=starts_at+interval '30 minutes' where id='${legacy1}'`);
    await db.exec(`update public.tournament_matches set starts_at=starts_at+interval '90 minutes' where id='${legacy1}'`);
  });
  await check("hidden RLS rows still prevent overlapping member reservations", async () => {
    await db.exec(matchSQL(a, at("14:00")));
    await db.exec(`set local role authenticated; select set_config('request.jwt.claims','{"role":"authenticated","sub":"${member}"}',true)`);
    assert.equal((await db.query("select count(*)::int as n from public.tournament_matches")).rows[0].n,0);
    await rejected(reservationSQL(r, at("14:30")));
    await db.exec(reservationSQL(r, at("15:30")));
    await rejected(matchSQL(b, at("18:00")), /row-level security/);
  });
  await check("source RLS is preserved and private helpers cannot be invoked", async () => {
    await db.exec(`set local role authenticated; select set_config('request.jwt.claims','{"role":"authenticated","sub":"${admin}"}',true)`);
    await db.exec(matchSQL(a, at("14:00")));
    await rejected("select * from private.court_schedule_write_guard", /permission denied/);
    await rejected("select private.serialize_court_schedule_writes()", /permission denied/);
    await rejected("select private.validate_court_schedule()", /permission denied/);
  });
  await check("unauthenticated writes remain denied", async () => {
    await db.exec("set local role authenticated");
    await rejected(matchSQL(a, at("14:00")), /kullanıcı kimliği gerekli/);
  });
  await check("guard covers all three write tables and has no API privileges", async () => {
    const rows = (await db.query("select tgrelid::regclass::text as name from pg_trigger where tgname='court_schedule_serialize' order by name")).rows;
    assert.deepEqual(rows.map(row=>row.name),["reservations","tournament_matches","tournaments"]);
    for(const role of ["anon","authenticated","service_role"]) {
      const permissions = (await db.query(`select has_table_privilege('${role}','private.court_schedule_write_guard','UPDATE') as write,
        has_function_privilege('${role}','private.validate_court_schedule()','EXECUTE') as execute`)).rows[0];
      assert.deepEqual(permissions,{write:false,execute:false});
    }
  });
});
