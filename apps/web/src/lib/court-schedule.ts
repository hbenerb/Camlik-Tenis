type CourtBooking = {
  id: string;
  court_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

export function timeRangesOverlap(firstStart: Date, firstEnd: Date, secondStart: Date, secondEnd: Date) {
  return firstStart < secondEnd && secondStart < firstEnd;
}

export function findCourtConflict<T extends CourtBooking>(
  bookings: T[], courtId: string, startsAt: Date, endsAt: Date, excludeId?: string,
) {
  return bookings.find((booking) => booking.id !== excludeId
    && booking.status !== "canceled" && booking.court_id === courtId
    && timeRangesOverlap(startsAt, endsAt, new Date(booking.starts_at), new Date(booking.ends_at)));
}

// Match the database rule: changing scores/names does not create occupancy;
// restoring a canceled fixture, moving it or changing its duration does.
export function tournamentOccupancyChanged(previous: CourtBooking, next: CourtBooking) {
  return next.status !== "canceled" && (
    previous.status === "canceled" || previous.court_id !== next.court_id
    || new Date(previous.starts_at).getTime() !== new Date(next.starts_at).getTime()
    || new Date(previous.ends_at).getTime() !== new Date(next.ends_at).getTime()
  );
}
