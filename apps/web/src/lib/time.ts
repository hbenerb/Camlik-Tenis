import {
  addDays,
  addMinutes,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import type { ClubSettings, Reservation } from "./types";

const TIME_PATTERN = "HH:mm";

export function normalizeTime(value: string) {
  return value.slice(0, 5);
}

export function formatDateTitle(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function formatTime(date: Date) {
  return format(date, TIME_PATTERN);
}

export function dateInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function parseDateInput(value: string) {
  return parse(value, "yyyy-MM-dd", new Date());
}

export function buildLocalDateTime(dateValue: string, timeValue: string) {
  return new Date(`${dateValue}T${timeValue}:00`);
}

export function buildTimeSlots(settings: ClubSettings | null) {
  const opening = normalizeTime(settings?.opening_time ?? "08:00");
  const closing = normalizeTime(settings?.closing_time ?? "22:00");
  const slotMinutes = settings?.reservation_slot_minutes ?? 60;
  const baseDate = "2026-01-01";
  const slots: string[] = [];
  let cursor = buildLocalDateTime(baseDate, opening);
  const end = buildLocalDateTime(baseDate, closing);

  while (addMinutes(cursor, slotMinutes) <= end) {
    slots.push(formatTime(cursor));
    cursor = addMinutes(cursor, slotMinutes);
  }

  return slots;
}

export function addSlotDuration(start: Date, settings: ClubSettings | null) {
  return addMinutes(start, settings?.reservation_slot_minutes ?? 60);
}

export function getRangeForView(date: Date, view: "day" | "week" | "month") {
  if (view === "day") {
    return { start: startOfDay(date), end: endOfDay(date) };
  }

  if (view === "week") {
    return {
      start: startOfWeek(date, { weekStartsOn: 1 }),
      end: endOfWeek(date, { weekStartsOn: 1 }),
    };
  }

  return { start: startOfMonth(date), end: endOfMonth(date) };
}

export function isReservationInRange(
  reservation: Reservation,
  start: Date,
  end: Date,
) {
  const startsAt = new Date(reservation.starts_at);
  return startsAt >= start && startsAt <= end;
}

export function findReservationAtSlot(
  reservations: Reservation[],
  courtId: string,
  date: Date,
  slot: string,
) {
  return reservations.find((reservation) => {
    const startsAt = new Date(reservation.starts_at);
    return (
      reservation.status === "confirmed" &&
      reservation.court_id === courtId &&
      isSameDay(startsAt, date) &&
      formatTime(startsAt) === slot
    );
  });
}

export function buildMonthDays(date: Date) {
  const first = startOfMonth(date);
  const last = endOfMonth(date);
  const days: Date[] = [];
  let cursor = startOfWeek(first, { weekStartsOn: 1 });
  const finalDay = endOfWeek(last, { weekStartsOn: 1 });

  while (cursor <= finalDay) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return days;
}

export function isCurrentMonth(day: Date, monthDate: Date) {
  return isSameMonth(day, monthDate);
}

