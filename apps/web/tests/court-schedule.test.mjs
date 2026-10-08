import assert from "node:assert/strict";
import test from "node:test";
import { findCourtConflict, timeRangesOverlap, tournamentOccupancyChanged } from "../src/lib/court-schedule.ts";

const booking = {
  id: "first", court_id: "A", starts_at: "2026-10-10T14:00:00+03:00",
  ends_at: "2026-10-10T15:30:00+03:00", status: "scheduled",
};
const date = (time) => new Date(`2026-10-10T${time}:00+03:00`);

test("equal, partial and contained intervals conflict; touching boundaries do not", () => {
  for (const [start, end] of [["14:00", "15:30"], ["13:30", "14:30"], ["15:00", "16:00"], ["14:30", "15:00"], ["13:00", "16:00"]]) {
    assert.equal(findCourtConflict([booking], "A", date(start), date(end)), booking);
  }
  for (const [start, end] of [["12:30", "14:00"], ["15:30", "17:00"]]) {
    assert.equal(findCourtConflict([booking], "A", date(start), date(end)), undefined);
  }
  assert.equal(timeRangesOverlap(date("18:00"), date("19:30"), date("19:00"), date("20:00")), true);
});

test("ignore self, canceled matches and other courts, but not completed matches", () => {
  assert.equal(findCourtConflict([booking], "A", date("14:00"), date("15:00"), booking.id), undefined);
  assert.equal(findCourtConflict([booking], "B", date("14:00"), date("15:00")), undefined);
  assert.equal(findCourtConflict([{...booking, status:"canceled"}], "A", date("14:00"), date("15:00")), undefined);
  assert.equal(findCourtConflict([{...booking, status:"completed"}], "A", date("14:00"), date("15:00")).id, booking.id);
});

test("moves, court/duration changes and restorations require validation", () => {
  for (const patch of [{court_id:"B"}, {starts_at:"2026-10-11T14:00:00+03:00"}, {ends_at:"2026-10-10T16:00:00+03:00"}]) {
    assert.equal(tournamentOccupancyChanged(booking, {...booking, ...patch}), true);
  }
  assert.equal(tournamentOccupancyChanged({...booking,status:"canceled"}, booking), true);
});

test("score/name edits, equivalent timezones and cancellation do not create occupancy", () => {
  assert.equal(tournamentOccupancyChanged(booking, {...booking, status:"completed"}), false);
  assert.equal(tournamentOccupancyChanged(booking, {...booking, starts_at:"2026-10-10T11:00:00Z"}), false);
  assert.equal(tournamentOccupancyChanged(booking, {...booking, court_id:"B", status:"canceled"}), false);
});
