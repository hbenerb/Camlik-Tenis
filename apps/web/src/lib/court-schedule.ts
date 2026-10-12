type CourtBooking = {
  id: string;
  court_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

type DatabaseError = {
  code?: string | null;
  details?: string | null;
  message?: string | null;
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

export function reservationWriteErrorMessage(error: DatabaseError) {
  const errorText = [error.code, error.message, error.details]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");

  if (errorText.includes("turnuva maçıyla çakışıyor")) {
    return "Bu kort ve saat bir turnuva maçı için ayrılmış. Başka bir saat seçin.";
  }

  if (
    error.code === "23P01" ||
    errorText.includes("no_overlapping_confirmed_reservations") ||
    errorText.includes("mevcut bir rezervasyonla çakışıyor")
  ) {
    return "Bu kort ve saat dolu. Takvimi yenileyip başka bir saat seçin.";
  }

  if (errorText.includes("row-level security") || error.code === "42501") {
    return "Bu rezervasyonu kaydetme yetkiniz yok. Kulüple iletişime geçin.";
  }

  return `Rezervasyon kaydedilemedi: ${error.message || "Bağlantıyı kontrol edip tekrar deneyin."}`;
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
