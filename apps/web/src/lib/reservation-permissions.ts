import { addMonths, startOfDay } from "date-fns";
import type { Profile, Reservation } from "@/lib/types";

export function earliestCalendarDate(profile: Profile | null, now: Date): Date | null {
  if (profile?.app_role === "admin" || profile?.app_role === "super_admin") {
    return null;
  }
  return startOfDay(profile?.is_trainer ? addMonths(now, -1) : now);
}

export function canTrainerManageLessonReservation(
  profile: Profile | null,
  userId: string | undefined,
  reservation: Reservation,
  now: Date,
) {
  if (!profile?.is_trainer || !userId || profile.id !== userId ||
      reservation.trainer_id !== userId || reservation.status !== "confirmed" ||
      new Date(reservation.starts_at) < startOfDay(addMonths(now, -1))) {
    return false;
  }
  try {
    return JSON.parse(reservation.note ?? "null")?.kind === "lesson";
  } catch {
    return false;
  }
}

export function registeredTrainer(profiles: Profile[], trainerId: string) {
  return profiles.find((profile) => profile.id === trainerId && profile.is_trainer) ?? null;
}
