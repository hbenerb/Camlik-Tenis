import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = () => readFile(
  new URL("../../../supabase/migrations/20260910093954_fix_reservations_ending_at_midnight.sql", import.meta.url),
  "utf8",
);

test("club closing time includes the final slot ending at midnight", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());

  await db.exec(`
    create table public.club_settings (
      id integer primary key,
      timezone text not null,
      opening_time time not null,
      closing_time time not null
    );
    insert into public.club_settings values (1, 'Europe/Istanbul', '07:00', '24:00');
  `);
  await db.exec(await migration());

  const isAllowed = async (start, end) => {
    const result = await db.query(
      "select public.is_within_club_hours($1::timestamptz, $2::timestamptz) as allowed",
      [start, end],
    );
    return result.rows[0].allowed;
  };

  assert.equal(await isAllowed("2026-09-11 20:00+00", "2026-09-11 21:00+00"), true);
  assert.equal(await isAllowed("2026-09-11 20:30+00", "2026-09-11 21:30+00"), false);
  assert.equal(await isAllowed("2026-09-11 03:59+00", "2026-09-11 04:59+00"), false);

  await db.exec("update public.club_settings set closing_time = '00:00' where id = 1");
  assert.equal(await isAllowed("2026-09-11 20:00+00", "2026-09-11 21:00+00"), true);
});
