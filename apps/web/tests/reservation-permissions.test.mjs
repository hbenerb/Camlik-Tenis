import assert from "node:assert/strict";
import test from "node:test";
import { canTrainerManageLessonReservation, earliestCalendarDate, registeredTrainer } from "../src/lib/reservation-permissions.ts";

const now = new Date(2026, 8, 6, 12);
const trainer = { id: "trainer", is_trainer: true, app_role: "user" };
const lesson = { trainer_id: "trainer", user_id: "other", starts_at: new Date(2026, 8, 1, 10).toISOString(),
  status: "confirmed", note: JSON.stringify({kind: "lesson", trainer_name: "Original name"}) };

test("assigned trainer manages another user's past or future lesson", () => {
  assert.equal(canTrainerManageLessonReservation(trainer, trainer.id, lesson, now), true);
  assert.equal(canTrainerManageLessonReservation(trainer, trainer.id, {
    ...lesson, starts_at: new Date(2026, 8, 9).toISOString(),
  }, now), true);
});

test("ownership, typed name or a revoked trainer flag do not grant lesson authority", () => {
  for (const reservation of [
    { ...lesson, trainer_id: "someone-else", user_id: "trainer" },
    { ...lesson, trainer_id: null },
    { ...lesson, status: "canceled" },
    { ...lesson, note: "invalid JSON" },
    { ...lesson, note: JSON.stringify({kind: "match"}) },
  ]) assert.equal(canTrainerManageLessonReservation(trainer, trainer.id, reservation, now), false);
  assert.equal(canTrainerManageLessonReservation({...trainer, is_trainer: false}, trainer.id, lesson, now), false);
});

test("one calendar month includes the boundary day and excludes earlier days", () => {
  const boundary = earliestCalendarDate(trainer, now);
  assert.equal(boundary.getTime(), new Date(2026, 7, 6).getTime());
  assert.equal(canTrainerManageLessonReservation(trainer, trainer.id, {...lesson, starts_at: boundary.toISOString()}, now), true);
  assert.equal(canTrainerManageLessonReservation(trainer, trainer.id, {...lesson, starts_at: new Date(boundary.getTime() - 1).toISOString()}, now), false);
  assert.equal(earliestCalendarDate(trainer, new Date(2026, 2, 31)).getTime(), new Date(2026, 1, 28).getTime());
});

test("admins keep unlimited history; members and guests start at today", () => {
  assert.equal(earliestCalendarDate({...trainer, app_role: "admin"}, now), null);
  assert.equal(earliestCalendarDate({...trainer, app_role: "super_admin"}, now), null);
  assert.equal(earliestCalendarDate(null, now).getTime(), new Date(2026, 8, 6).getTime());
  assert.equal(earliestCalendarDate({...trainer, is_trainer: false}, now).getTime(), new Date(2026, 8, 6).getTime());
});

test("trainer selection uses registered user IDs, not free text or duplicate names", () => {
  const profiles = [trainer, {id:"other", full_name:"trainer", is_trainer:false}];
  assert.equal(registeredTrainer(profiles, "trainer"), trainer);
  assert.equal(registeredTrainer(profiles, "other"), null);
  assert.equal(registeredTrainer(profiles, ""), null);
  assert.equal(registeredTrainer(profiles, "arbitrary text"), null);
});
