import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { uid, courtA, courtB, activeTournament, draftTournament, fixtureSQL, durationSQL, migrationSQL,
  matchSQL, reservationSQL } from "./fixtures/court-schedule.mjs";

// Optional real-Postgres integration test. Use a fresh, disposable postgres:17
// container only; this fixture is never run against the production database.
const container = process.env.COURT_SCHEDULE_TEST_CONTAINER;
const docker = process.env.COURT_SCHEDULE_DOCKER ?? "docker";

function session() {
  const child = spawn(docker, ["exec", "-i", container, "psql", "-U", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"]);
  let output = "", errors = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { errors += chunk; });
  const result = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => resolve({code, output, errors}));
  });
  const waitFor = (marker) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Missing marker: ${marker}; ${errors}`)); }, 10000);
    const inspect = () => {
      if (output.includes(marker)) { clearTimeout(timeout); child.stdout.off("data", inspect); resolve(); }
    };
    child.stdout.on("data", inspect);
    inspect();
  });
  return {child, result, waitFor};
}

async function run(sql) {
  const s = session(); s.child.stdin.end(sql);
  const result = await s.result;
  assert.equal(result.code, 0, result.errors);
  return result;
}

test("real PostgreSQL concurrent schedule writes", {skip: !container, timeout:60000}, async (t) => {
  await run(fixtureSQL + await durationSQL() + `update public.tournaments set match_duration_minutes=90;` + await migrationSQL());
  const a = uid(50), b = uid(51), at = time => `2030-11-01 ${time}+03`;
  const reset = () => run(`delete from public.reservations; delete from public.tournament_matches;
    update public.tournaments set match_duration_minutes=90, is_active=(id='${activeTournament}');`);
  const race = async (firstSQL, secondSQL) => {
    const first = session();
    first.child.stdin.write(`begin; ${firstSQL} select 'write-locked';\n`);
    await first.waitFor("write-locked");
    const second = session();
    second.child.stdin.end(secondSQL);
    // The second write is issued while the first transaction is still open.
    await new Promise(resolve => setTimeout(resolve, 200));
    first.child.stdin.end("commit;\n");
    assert.equal((await first.result).code, 0);
    const loser = await second.result;
    assert.notEqual(loser.code, 0);
    assert.match(loser.errors, /çakış/);
  };

  await t.test("two simultaneous new tournament matches cannot both commit", async () => {
    await reset();
    await race(matchSQL(a,at("14:00")), matchSQL(b,at("14:30")));
  });
  await t.test("reservation first, tournament second", async () => {
    await reset();
    await race(reservationSQL(a,at("14:00")), matchSQL(b,at("14:30")));
  });
  await t.test("tournament first, reservation second", async () => {
    await reset();
    await race(matchSQL(a,at("14:00")), reservationSQL(b,at("14:30")));
  });
  await t.test("two admins move different fixtures to the same court/time", async () => {
    await reset();
    await run(matchSQL(a,at("18:00")) + matchSQL(b,at("20:00"),courtB));
    await race(`update public.tournament_matches set starts_at='${at("14:00")}' where id='${a}';`,
      `update public.tournament_matches set starts_at='${at("14:00")}',court_id='${courtA}' where id='${b}';`);
  });
  await t.test("activation and a competing reservation serialize", async () => {
    await reset();
    await run(matchSQL(a,at("14:00"),courtA,draftTournament));
    await race(`update public.tournaments set is_active=true where id='${draftTournament}';`,reservationSQL(b,at("14:30")));
  });
  await t.test("duration extension and a competing reservation serialize", async () => {
    await reset();
    await run(matchSQL(a,at("14:00")));
    await race(`update public.tournaments set match_duration_minutes=120 where id='${activeTournament}';`,reservationSQL(b,at("15:30")));
  });
  for (const isolation of ["repeatable read", "serializable"]) {
    await t.test(`${isolation} stale snapshots cannot bypass validation`, async () => {
      await reset();
      const stale = session();
      stale.child.stdin.write(`begin isolation level ${isolation}; select count(*) from public.tournament_matches; select 'snapshot-ready';\n`);
      await stale.waitFor("snapshot-ready");
      await run(matchSQL(a,at("14:00")));
      stale.child.stdin.end(matchSQL(b,at("14:30")) + "commit;\n");
      const result = await stale.result;
      assert.notEqual(result.code,0);
      assert.match(result.errors,/could not serialize/);
    });
  }
});
