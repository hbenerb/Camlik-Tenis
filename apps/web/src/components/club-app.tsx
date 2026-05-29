"use client";

import type { User } from "@supabase/supabase-js";
import Image from "next/image";
import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  Apple,
  Bell,
  CalendarDays,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogOut,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  addSlotDuration,
  buildLocalDateTime,
  buildMonthDays,
  buildTimeSlots,
  dateInputValue,
  findReservationAtSlot,
  formatDateTitle,
  formatMonthTitle,
  formatTime,
  getRangeForView,
  isCurrentMonth,
  isReservationInRange,
  normalizeTime,
  parseDateInput,
} from "@/lib/time";
import type {
  AppRole,
  AppNotification,
  AppNotificationDelivery,
  CalendarView,
  ClubSettings,
  Court,
  NotificationScheduleType,
  Profile,
  Reservation,
  ReservationStatus,
  SkillLevel,
} from "@/lib/types";

type AppTab = "calendar" | "reservations" | "profile" | "admin";
type OAuthProvider = "google" | "apple";
type ThemeMode = "light" | "dark";
type DayAvailability = "past" | "bookable" | "future";
type MatchType = "singles" | "doubles";
type MatchPlayerKey =
  | "team1_player1_name"
  | "team1_player2_name"
  | "team2_player1_name"
  | "team2_player2_name";
type ReservationMatchNote = {
  kind: "match";
  version: 1;
  match_type: MatchType;
  team1_player1_name: string | null;
  team1_player2_name: string | null;
  team2_player1_name: string | null;
  team2_player2_name: string | null;
};
type ReservationLessonNote = {
  kind: "lesson";
  version: 1;
  trainer_name: string | null;
  student_name: string | null;
};
type ReservationFormState = {
  court_id: string;
  custom_info: string;
  date: string;
  is_custom: boolean;
  is_lesson: boolean;
  match_type: MatchType;
  start_time: string;
  student_name: string;
  team1_player1_name: string;
  team1_player2_name: string;
  team2_player1_name: string;
  team2_player2_name: string;
  user_id: string;
};
type ReservationEditFormState = ReservationFormState & {
  status: ReservationStatus;
};
type NotificationIntervalUnit = "minutes" | "hours" | "days";
type AdminNotificationDraft = {
  id: string | null;
  interval_count: number;
  interval_unit: NotificationIntervalUnit;
  message: string;
  schedule_type: NotificationScheduleType;
  starts_date: string;
  starts_time: string;
  expires_date: string;
  expires_time: string;
};
type AdminNotificationPayload = {
  id?: string;
  interval_minutes: number | null;
  expires_at: string | null;
  message: string;
  schedule_type: NotificationScheduleType;
  starts_at: string;
};
type NotificationPermissionState = NotificationPermission | "unsupported";
type NotificationToast = {
  id: string;
  message: string;
  occurrence_at: string;
};

const defaultSettings: ClubSettings = {
  id: 1,
  timezone: "Europe/Istanbul",
  opening_time: "08:00",
  closing_time: "22:00",
  reservation_slot_minutes: 60,
  max_active_reservations: 2,
  default_booking_days_ahead: 1,
  club_member_booking_days_ahead: 2,
  cancellation_deadline_hours: 6,
  updated_at: new Date().toISOString(),
};

const roleLabels: Record<AppRole, string> = {
  user: "Kullanıcı",
  admin: "Admin",
  super_admin: "Baş admin",
};

const viewLabels: Record<CalendarView, string> = {
  day: "Günlük",
  week: "Haftalık",
  month: "Aylık",
};

const matchTypeLabels: Record<MatchType, string> = {
  singles: "Tekler",
  doubles: "Çiftler",
};

const notificationScheduleTypeLabels: Record<NotificationScheduleType, string> = {
  instant: "Anında",
  scheduled: "Zamanlı",
  recurring: "Sürekli",
};

const notificationIntervalUnitLabels: Record<NotificationIntervalUnit, string> = {
  minutes: "Dakika",
  hours: "Saat",
  days: "Gün",
};

const notificationIntervalUnitMinutes: Record<NotificationIntervalUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

const skillLevelLabels: Record<SkillLevel, string> = {
  beginner: "Başlangıç",
  intermediate: "Orta",
  advanced: "İleri",
  master: "Master",
};

const skillLevels = Object.keys(skillLevelLabels) as SkillLevel[];

const ADMIN_EDIT_BOOKING_WINDOW_DAYS = 365;
const THEME_STORAGE_KEY = "camlik-tenis-theme";
const NOTIFICATION_PROMPT_STORAGE_PREFIX = "camlik-tenis-notification-prompt";
const EMPTY_PLAYER_LABEL = "-";
const DEFAULT_NOTIFICATION_TITLE = "Çamlık Tenis";

function normalizeFullName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function notificationPromptStorageKey(userId: string) {
  return `${NOTIFICATION_PROMPT_STORAGE_PREFIX}:${userId}`;
}

function normalizeNullableFullName(value: string | null | undefined) {
  return normalizeFullName(value ?? "") || null;
}

function hasCompleteFullName(value: string | null | undefined) {
  return normalizeFullName(value ?? "").split(" ").filter(Boolean).length >= 2;
}

function isSkillLevel(value: unknown): value is SkillLevel {
  return typeof value === "string" && skillLevels.includes(value as SkillLevel);
}

function isProfileComplete(profile: Profile | null) {
  return (
    hasCompleteFullName(profile?.full_name) &&
    isSkillLevel(profile?.skill_level)
  );
}

function triggerLightHaptic() {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) {
    return;
  }

  navigator.vibrate(8);
}

function isAdmin(profile: Profile | null) {
  return profile?.app_role === "admin" || profile?.app_role === "super_admin";
}

function getDisplayName(profile: Profile | null, user: User | null) {
  return profile?.full_name || user?.user_metadata?.full_name || profile?.email || "";
}

function normalizePlayerName(value: string | null | undefined) {
  return normalizeFullName(value ?? "");
}

function displayPlayerName(value: string | null | undefined) {
  return normalizePlayerName(value) || EMPTY_PLAYER_LABEL;
}

function displayDoublesPlayerName(value: string | null | undefined) {
  const normalizedName = normalizePlayerName(value);

  if (!normalizedName) {
    return "";
  }

  const nameParts = normalizedName.split(" ").filter(Boolean);

  if (nameParts.length === 1) {
    return nameParts[0];
  }

  const firstName = nameParts[0];
  const lastNameInitial = nameParts[nameParts.length - 1]
    .charAt(0)
    .toLocaleUpperCase("tr-TR");

  return `${firstName} ${lastNameInitial}.`;
}

function parseReservationMatchNote(note: string | null | undefined) {
  if (!note) {
    return null;
  }

  try {
    const parsed = JSON.parse(note) as Partial<ReservationMatchNote>;

    if (
      parsed.kind !== "match" ||
      (parsed.match_type !== "singles" && parsed.match_type !== "doubles")
    ) {
      return null;
    }

    return {
      kind: "match",
      version: 1,
      match_type: parsed.match_type,
      team1_player1_name: normalizePlayerName(parsed.team1_player1_name),
      team1_player2_name: normalizePlayerName(parsed.team1_player2_name),
      team2_player1_name: normalizePlayerName(parsed.team2_player1_name),
      team2_player2_name: normalizePlayerName(parsed.team2_player2_name),
    } satisfies ReservationMatchNote;
  } catch {
    return null;
  }
}

function parseReservationLessonNote(note: string | null | undefined) {
  if (!note) {
    return null;
  }

  try {
    const parsed = JSON.parse(note) as Partial<ReservationLessonNote>;

    if (parsed.kind !== "lesson") {
      return null;
    }

    return {
      kind: "lesson",
      version: 1,
      trainer_name: normalizePlayerName(parsed.trainer_name),
      student_name: normalizePlayerName(parsed.student_name),
    } satisfies ReservationLessonNote;
  } catch {
    return null;
  }
}

function getLegacyReservationOwner(reservation: Reservation) {
  return (
    reservation.note ||
    reservation.profiles?.full_name ||
    reservation.profiles?.email ||
    "İsim yok"
  );
}

function getReservationDisplayLines(reservation: Reservation) {
  const match = parseReservationMatchNote(reservation.note);
  const lesson = parseReservationLessonNote(reservation.note);

  if (!match) {
    if (lesson) {
      return [
        displayPlayerName(lesson.trainer_name),
        displayPlayerName(lesson.student_name),
      ];
    }

    return [getLegacyReservationOwner(reservation)];
  }

  if (match.match_type === "singles") {
    return [
      displayPlayerName(match.team1_player1_name),
      displayPlayerName(match.team2_player1_name),
    ];
  }

  const firstTeamNames = [
    displayDoublesPlayerName(match.team1_player1_name),
    displayDoublesPlayerName(match.team1_player2_name),
  ].filter(Boolean);
  const secondTeamNames = [
    displayDoublesPlayerName(match.team2_player1_name),
    displayDoublesPlayerName(match.team2_player2_name),
  ].filter(Boolean);

  return [
    firstTeamNames.join("-") || EMPTY_PLAYER_LABEL,
    secondTeamNames.join("-") || EMPTY_PLAYER_LABEL,
  ];
}

function getReservationCustomInfo(reservation: Reservation) {
  return reservation.note &&
    !parseReservationMatchNote(reservation.note) &&
    !parseReservationLessonNote(reservation.note)
    ? reservation.note
    : "";
}

function getReservationMatchFormFields(reservation: Reservation) {
  const match = parseReservationMatchNote(reservation.note);
  const lesson = parseReservationLessonNote(reservation.note);

  if (match) {
    return {
      is_lesson: false,
      match_type: match.match_type,
      student_name: "",
      team1_player1_name: match.team1_player1_name ?? "",
      team1_player2_name: match.team1_player2_name ?? "",
      team2_player1_name: match.team2_player1_name ?? "",
      team2_player2_name: match.team2_player2_name ?? "",
    };
  }

  if (lesson) {
    return {
      is_lesson: true,
      match_type: "singles" as MatchType,
      student_name: lesson.student_name ?? "",
      team1_player1_name: lesson.trainer_name ?? "",
      team1_player2_name: "",
      team2_player1_name: "",
      team2_player2_name: "",
    };
  }

  const legacyOwner = getLegacyReservationOwner(reservation);

  return {
    is_lesson: false,
    match_type: "singles" as MatchType,
    student_name: "",
    team1_player1_name: legacyOwner === "İsim yok" ? "" : legacyOwner,
    team1_player2_name: "",
    team2_player1_name: "",
    team2_player2_name: "",
  };
}

function buildReservationMatchNote(form: ReservationFormState) {
  const matchNote: ReservationMatchNote = {
    kind: "match",
    version: 1,
    match_type: form.match_type,
    team1_player1_name: normalizeNullableFullName(form.team1_player1_name),
    team1_player2_name:
      form.match_type === "doubles"
        ? normalizeNullableFullName(form.team1_player2_name)
        : null,
    team2_player1_name: normalizeNullableFullName(form.team2_player1_name),
    team2_player2_name:
      form.match_type === "doubles"
        ? normalizeNullableFullName(form.team2_player2_name)
        : null,
  };

  return JSON.stringify(matchNote);
}

function buildReservationLessonNote(form: ReservationFormState, trainerName: string) {
  const lessonNote: ReservationLessonNote = {
    kind: "lesson",
    version: 1,
    trainer_name: normalizeNullableFullName(trainerName),
    student_name: normalizeNullableFullName(form.student_name),
  };

  return JSON.stringify(lessonNote);
}

function isLessonReservation(reservation: Reservation) {
  return Boolean(parseReservationLessonNote(reservation.note));
}

function attachReservationProfiles(
  reservations: Reservation[],
  profiles: Profile[],
) {
  const profileMap = new Map(
    profiles.map((profile) => [
      profile.id,
      {
        email: profile.email,
        full_name: profile.full_name,
      },
    ]),
  );

  return reservations.map((reservation) => {
    if (reservation.profiles?.full_name || reservation.profiles?.email) {
      return reservation;
    }

    const reservationProfile = profileMap.get(reservation.user_id);

    if (!reservationProfile) {
      return reservation;
    }

    return {
      ...reservation,
      profiles: reservationProfile,
    };
  });
}

function uniqueProfiles(profiles: Array<Profile | null>) {
  const profileMap = new Map<string, Profile>();

  profiles.forEach((profile) => {
    if (profile) {
      profileMap.set(profile.id, profile);
    }
  });

  return Array.from(profileMap.values()).sort((first, second) =>
    (first.full_name ?? first.email).localeCompare(
      second.full_name ?? second.email,
      "tr",
    ),
  );
}

function profileOptionLabel(profile: Profile) {
  return profile.full_name || "İsim yok";
}

function canUseLessonForSelectedOwner(
  form: ReservationFormState,
  ownerOptions: Profile[],
  canChooseOwner: boolean,
  canMarkLesson: boolean,
) {
  if (!canMarkLesson) {
    return false;
  }

  if (!canChooseOwner) {
    return true;
  }

  const selectedOwner = ownerOptions.find((owner) => owner.id === form.user_id);
  return Boolean(selectedOwner?.is_trainer) || form.is_lesson;
}

function isFutureReservation(reservation: Reservation, currentTime: Date) {
  return new Date(reservation.starts_at).getTime() >= currentTime.getTime();
}

function dayAvailability(
  day: Date,
  bookingWindowDays: number,
  currentTime: Date,
): DayAvailability {
  const today = startOfDay(currentTime);
  const targetDay = startOfDay(day);
  const lastBookableDay = startOfDay(addDays(today, bookingWindowDays));

  if (targetDay < today) {
    return "past";
  }

  if (targetDay <= lastBookableDay) {
    return "bookable";
  }

  return "future";
}

function isBookableDay(day: Date, bookingWindowDays: number, currentTime: Date) {
  return dayAvailability(day, bookingWindowDays, currentTime) === "bookable";
}

function isBookableStart(
  dateValue: string,
  timeValue: string,
  bookingWindowDays: number,
  currentTime: Date,
) {
  const startsAt = buildLocalDateTime(dateValue, timeValue);

  return (
    startsAt >= currentTime &&
    isBookableDay(startsAt, bookingWindowDays, currentTime)
  );
}

function firstBookableSlot(
  dateValue: string,
  slots: string[],
  bookingWindowDays: number,
  currentTime: Date,
) {
  return (
    slots.find((slot) =>
      isBookableStart(dateValue, slot, bookingWindowDays, currentTime),
    ) ?? null
  );
}

function firstBookableDate(
  bookingWindowDays: number,
  slots: string[],
  currentTime: Date,
) {
  for (let dayOffset = 0; dayOffset <= bookingWindowDays; dayOffset += 1) {
    const candidate = addDays(currentTime, dayOffset);
    const candidateValue = dateInputValue(candidate);

    if (firstBookableSlot(candidateValue, slots, bookingWindowDays, currentTime)) {
      return candidate;
    }
  }

  return currentTime;
}

function formatWeekdayTiny(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(date);
}

function formatWeekdayLong(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(date);
}

function visibleDayAvailability(
  day: Date,
  bookingWindowDays: number,
  currentTime: Date,
  slots: string[],
) {
  const status = dayAvailability(day, bookingWindowDays, currentTime);

  if (status !== "bookable") {
    return status;
  }

  return firstBookableSlot(
    dateInputValue(day),
    slots,
    bookingWindowDays,
    currentTime,
  )
    ? "bookable"
    : "future";
}

function dateTimeInputParts(date: Date) {
  return {
    date: dateInputValue(date),
    time: formatTime(date),
  };
}

function addMinutesToDate(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function defaultNotificationDraft(): AdminNotificationDraft {
  const startsAt = addMinutesToDate(new Date(), 60);
  const startParts = dateTimeInputParts(startsAt);

  return {
    id: null,
    interval_count: 1,
    interval_unit: "days",
    message: "",
    schedule_type: "instant",
    starts_date: startParts.date,
    starts_time: startParts.time,
    expires_date: "",
    expires_time: "",
  };
}

function intervalPartsFromMinutes(minutes: number | null) {
  if (!minutes) {
    return { count: 1, unit: "days" as NotificationIntervalUnit };
  }

  if (minutes % notificationIntervalUnitMinutes.days === 0) {
    return {
      count: minutes / notificationIntervalUnitMinutes.days,
      unit: "days" as NotificationIntervalUnit,
    };
  }

  if (minutes % notificationIntervalUnitMinutes.hours === 0) {
    return {
      count: minutes / notificationIntervalUnitMinutes.hours,
      unit: "hours" as NotificationIntervalUnit,
    };
  }

  return {
    count: minutes,
    unit: "minutes" as NotificationIntervalUnit,
  };
}

function draftFromNotification(
  notification: AppNotification,
): AdminNotificationDraft {
  const startsAt = dateTimeInputParts(new Date(notification.starts_at));
  const expiresAt = notification.expires_at
    ? dateTimeInputParts(new Date(notification.expires_at))
    : { date: "", time: "" };
  const intervalParts = intervalPartsFromMinutes(notification.interval_minutes);

  return {
    id: notification.id,
    interval_count: intervalParts.count,
    interval_unit: intervalParts.unit,
    message: notification.message,
    schedule_type: notification.schedule_type,
    starts_date: startsAt.date,
    starts_time: startsAt.time,
    expires_date: expiresAt.date,
    expires_time: expiresAt.time,
  };
}

function notificationDraftToPayload(
  draft: AdminNotificationDraft,
): AdminNotificationPayload {
  const message = normalizeFullName(draft.message);
  const now = new Date();
  const startsAt =
    draft.schedule_type === "instant"
      ? now
      : buildLocalDateTime(draft.starts_date, draft.starts_time);
  const intervalMinutes =
    draft.schedule_type === "recurring"
      ? Math.max(1, Number(draft.interval_count) || 1) *
        notificationIntervalUnitMinutes[draft.interval_unit]
      : null;
  const expiresAt =
    draft.schedule_type === "recurring"
      ? draft.expires_date
        ? buildLocalDateTime(
            draft.expires_date,
            draft.expires_time || "23:59",
          )
        : null
      : addMinutesToDate(startsAt, 7 * 24 * 60);

  return {
    ...(draft.id ? { id: draft.id } : {}),
    interval_minutes: intervalMinutes,
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    message,
    schedule_type: draft.schedule_type,
    starts_at: startsAt.toISOString(),
  };
}

function getNotificationOccurrence(
  notification: AppNotification,
  currentTime: Date,
) {
  const startsAt = new Date(notification.starts_at);
  const expiresAt = notification.expires_at
    ? new Date(notification.expires_at)
    : null;

  if (startsAt > currentTime) {
    return null;
  }

  if (expiresAt && expiresAt < currentTime) {
    return null;
  }

  if (notification.schedule_type !== "recurring") {
    return startsAt;
  }

  if (!notification.interval_minutes || notification.interval_minutes < 1) {
    return null;
  }

  const elapsedMinutes = Math.floor(
    (currentTime.getTime() - startsAt.getTime()) / 60000,
  );
  const occurrenceOffset =
    Math.floor(elapsedMinutes / notification.interval_minutes) *
    notification.interval_minutes;
  const occurrenceAt = addMinutesToDate(startsAt, occurrenceOffset);

  if (expiresAt && occurrenceAt > expiresAt) {
    return null;
  }

  return occurrenceAt;
}

function notificationDeliveryKey(notificationId: string, occurrenceAt: Date) {
  return `${notificationId}:${occurrenceAt.toISOString()}`;
}

function sortNotifications(notifications: AppNotification[]) {
  return [...notifications].sort(
    (first, second) =>
      new Date(first.starts_at).getTime() - new Date(second.starts_at).getTime(),
  );
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  return `${format(date, "dd.MM.yyyy")} ${formatTime(date)}`;
}

function formatNotificationInterval(minutes: number | null) {
  const intervalParts = intervalPartsFromMinutes(minutes);
  return `${intervalParts.count} ${
    notificationIntervalUnitLabels[intervalParts.unit]
  }`;
}

async function showBrowserNotification(
  notification: NotificationToast,
  permission: NotificationPermissionState,
) {
  if (
    typeof window === "undefined" ||
    permission !== "granted" ||
    !("Notification" in window)
  ) {
    return;
  }

  const options: NotificationOptions = {
    body: notification.message,
    icon: "/tenis-icon-192.png",
    badge: "/tenis-icon-192.png",
    tag: notificationDeliveryKey(notification.id, new Date(notification.occurrence_at)),
  };

  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(DEFAULT_NOTIFICATION_TITLE, options);
      return;
    } catch {
      // Native Notification below is the fallback for browsers without an active SW.
    }
  }

  new Notification(DEFAULT_NOTIFICATION_TITLE, options);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export function ClubApp() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<ClubSettings>(defaultSettings);
  const [settingsDraft, setSettingsDraft] =
    useState<ClubSettings>(defaultSettings);
  const [courts, setCourts] = useState<Court[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<AppNotification[]>(
    [],
  );
  const [notificationToast, setNotificationToast] =
    useState<NotificationToast | null>(null);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>("unsupported");
  const [isNotificationPromptOpen, setIsNotificationPromptOpen] =
    useState(false);
  const [isPushSubscriptionSynced, setIsPushSubscriptionSynced] =
    useState(false);
  const [members, setMembers] = useState<Profile[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>("calendar");
  const [calendarView, setCalendarView] = useState<CalendarView>("day");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [isReservationOpen, setIsReservationOpen] = useState(false);
  const [editingReservation, setEditingReservation] =
    useState<Reservation | null>(null);
  const [reservationForm, setReservationForm] = useState<ReservationFormState>({
    court_id: "",
    custom_info: "",
    date: dateInputValue(new Date()),
    is_custom: false,
    is_lesson: false,
    match_type: "singles",
    start_time: "09:00",
    student_name: "",
    team1_player1_name: "",
    team1_player2_name: "",
    team2_player1_name: "",
    team2_player2_name: "",
    user_id: "",
  });
  const [reservationEditForm, setReservationEditForm] =
    useState<ReservationEditFormState>({
    court_id: "",
    custom_info: "",
    date: dateInputValue(new Date()),
    is_custom: false,
    is_lesson: false,
    match_type: "singles",
    start_time: "09:00",
    student_name: "",
    team1_player1_name: "",
    team1_player2_name: "",
    team2_player1_name: "",
    team2_player2_name: "",
    user_id: "",
    status: "confirmed" as ReservationStatus,
  });
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    skill_level: "beginner" as SkillLevel,
  });
  const [newCourtName, setNewCourtName] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [signingInProvider, setSigningInProvider] =
    useState<OAuthProvider | null>(null);
  const [isProfileSchemaReady, setIsProfileSchemaReady] = useState(false);
  const [showAllReservations, setShowAllReservations] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [isThemeReady, setIsThemeReady] = useState(false);

  const themeClassName = theme === "dark" ? "theme-dark" : "theme-light";

  const activeCourts = useMemo(
    () => courts.filter((court) => court.is_active),
    [courts],
  );

  const timeSlots = useMemo(() => buildTimeSlots(settings), [settings]);

  const mustCompleteProfile =
    Boolean(profile) && isProfileSchemaReady && !isProfileComplete(profile);

  const bookingWindowDays = useMemo(() => {
    if (!profile) {
      return settings.default_booking_days_ahead;
    }

    return (
      profile.reservation_days_ahead ??
      (profile.is_club_member
        ? settings.club_member_booking_days_ahead
        : settings.default_booking_days_ahead)
    );
  }, [profile, settings]);

  const reservationOwnerOptions = useMemo(
    () => uniqueProfiles([profile, ...members]),
    [members, profile],
  );

  const canManageReservations = isAdmin(profile);
  const reservationPermissionSchemaReady = Boolean(
    profile && Object.prototype.hasOwnProperty.call(profile, "can_book"),
  );
  const canCreateReservation =
    canManageReservations ||
    (reservationPermissionSchemaReady ? Boolean(profile?.can_book) : true);
  const canMarkLesson = Boolean(profile?.is_trainer) || canManageReservations;

  const effectiveBookingWindowDays = canManageReservations
    ? ADMIN_EDIT_BOOKING_WINDOW_DAYS
    : bookingWindowDays;

  const visibleReservations = useMemo(() => {
    const range = getRangeForView(selectedDate, calendarView);
    return reservations.filter((reservation) =>
      isReservationInRange(reservation, range.start, range.end),
    );
  }, [calendarView, reservations, selectedDate]);

  const syncPushSubscription = useCallback(
    async (currentUser: User, showErrors = false) => {
      if (!supabase) {
        return false;
      }

      const vapidPublicKey =
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

      if (!vapidPublicKey) {
        if (showErrors) {
          setStatusMessage(
            "Web Push anahtarı Vercel ortam değişkenlerine eklenmeli.",
          );
        }
        return false;
      }

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (showErrors) {
          setStatusMessage("Bu tarayıcı arka plan notification desteklemiyor.");
        }
        return false;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const existingSubscription =
          await registration.pushManager.getSubscription();
        const subscription =
          existingSubscription ??
          (await registration.pushManager.subscribe({
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
            userVisibleOnly: true,
          }));
        const subscriptionJson = subscription.toJSON();
        const endpoint = subscriptionJson.endpoint;
        const p256dh = subscriptionJson.keys?.p256dh;
        const auth = subscriptionJson.keys?.auth;

        if (!endpoint || !p256dh || !auth) {
          if (showErrors) {
            setStatusMessage("Notification aboneliği alınamadı.");
          }
          return false;
        }

        const { error } = await supabase.from("app_push_subscriptions").upsert(
          {
            auth,
            endpoint,
            p256dh,
            user_agent: navigator.userAgent,
            user_id: currentUser.id,
          },
          { onConflict: "endpoint" },
        );

        if (error) {
          if (showErrors) {
            setStatusMessage(
              `${error.message} Push subscription SQL'i çalıştırılmalı.`,
            );
          }
          return false;
        }

        setIsPushSubscriptionSynced(true);
        return true;
      } catch (error) {
        if (showErrors) {
          setStatusMessage(
            error instanceof Error
              ? error.message
              : "Notification aboneliği oluşturulamadı.",
          );
        }
        return false;
      }
    },
    [supabase],
  );

  const removePushSubscription = useCallback(
    async (currentUser: User) => {
      if (!supabase || !("serviceWorker" in navigator)) {
        return;
      }

      const registration = await navigator.serviceWorker.ready.catch(() => null);
      const subscription = await registration?.pushManager
        .getSubscription()
        .catch(() => null);

      if (!subscription?.endpoint) {
        setIsPushSubscriptionSynced(false);
        return;
      }

      await supabase
        .from("app_push_subscriptions")
        .delete()
        .eq("endpoint", subscription.endpoint)
        .eq("user_id", currentUser.id);
      await subscription.unsubscribe().catch(() => false);
      setIsPushSubscriptionSynced(false);
    },
    [supabase],
  );

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  }, [theme]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

      if (storedTheme === "dark") {
        setTheme("dark");
      }

      setIsThemeReady(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (!("Notification" in window)) {
        setNotificationPermission("unsupported");
        return;
      }

      setNotificationPermission(Notification.permission);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    function handleButtonTouch(event: PointerEvent) {
      if (event.pointerType === "mouse") {
        return;
      }

      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const button = target.closest("button, [role='button']");

      if (!button) {
        return;
      }

      if (
        (button instanceof HTMLButtonElement && button.disabled) ||
        button.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }

      triggerLightHaptic();
    }

    document.addEventListener("pointerdown", handleButtonTouch, {
      capture: true,
    });

    return () => {
      document.removeEventListener("pointerdown", handleButtonTouch, {
        capture: true,
      });
    };
  }, []);

  useEffect(() => {
    function preventMultiTouchZoom(event: TouchEvent) {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    }

    function preventGestureZoom(event: Event) {
      event.preventDefault();
    }

    function preventShortcutZoom(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        ["+", "-", "=", "0"].includes(event.key)
      ) {
        event.preventDefault();
      }
    }

    function preventWheelZoom(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    }

    document.addEventListener("touchmove", preventMultiTouchZoom, {
      passive: false,
    });
    document.addEventListener("gesturestart", preventGestureZoom);
    document.addEventListener("gesturechange", preventGestureZoom);
    document.addEventListener("keydown", preventShortcutZoom);
    document.addEventListener("wheel", preventWheelZoom, { passive: false });

    return () => {
      document.removeEventListener("touchmove", preventMultiTouchZoom);
      document.removeEventListener("gesturestart", preventGestureZoom);
      document.removeEventListener("gesturechange", preventGestureZoom);
      document.removeEventListener("keydown", preventShortcutZoom);
      document.removeEventListener("wheel", preventWheelZoom);
    };
  }, []);

  useEffect(() => {
    if (isThemeReady) {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }

    document.documentElement.classList.toggle(
      "theme-dark-root",
      theme === "dark",
    );
    document.documentElement.classList.toggle(
      "theme-light-root",
      theme === "light",
    );
  }, [isThemeReady, theme]);

  const processDueNotifications = useCallback(
    async (currentUser: User, currentProfile: Profile | null) => {
      if (!supabase || !currentProfile?.notification_enabled) {
        return;
      }

      const now = new Date();
      const [notificationsResult, deliveriesResult] = await Promise.all([
        supabase
          .from("app_notifications")
          .select("*")
          .eq("status", "active")
          .lte("starts_at", now.toISOString())
          .order("starts_at", { ascending: true }),
        supabase
          .from("app_notification_deliveries")
          .select("notification_id, occurrence_at")
          .eq("user_id", currentUser.id),
      ]);

      if (notificationsResult.error || deliveriesResult.error) {
        return;
      }

      const deliveredKeys = new Set(
        ((deliveriesResult.data as AppNotificationDelivery[] | null) ?? []).map(
          (delivery) =>
            notificationDeliveryKey(
              delivery.notification_id,
              new Date(delivery.occurrence_at),
            ),
        ),
      );

      const dueNotifications =
        (notificationsResult.data as AppNotification[] | null) ?? [];

      for (const notification of dueNotifications) {
        const occurrenceAt = getNotificationOccurrence(notification, now);

        if (!occurrenceAt) {
          continue;
        }

        const deliveryKey = notificationDeliveryKey(
          notification.id,
          occurrenceAt,
        );

        if (deliveredKeys.has(deliveryKey)) {
          continue;
        }

        const { error } = await supabase
          .from("app_notification_deliveries")
          .insert({
            notification_id: notification.id,
            occurrence_at: occurrenceAt.toISOString(),
            user_id: currentUser.id,
          });

        if (error) {
          continue;
        }

        deliveredKeys.add(deliveryKey);

        const toast = {
          id: notification.id,
          message: notification.message,
          occurrence_at: occurrenceAt.toISOString(),
        };

        setNotificationToast(toast);
        void showBrowserNotification(toast, notificationPermission);
      }
    },
    [notificationPermission, supabase],
  );

  const loadData = useCallback(async (currentUser: User) => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);
    setCurrentTime(new Date());

    const [initialProfileResult, settingsResult, courtsResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(),
      supabase.from("club_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("courts").select("*").order("display_order"),
    ]);

    let loadedProfile = initialProfileResult.data as Profile | null;

    if (!loadedProfile || initialProfileResult.error) {
      const repairResult = await supabase.rpc("ensure_profile_for_current_user");

      if (repairResult.error) {
        setStatusMessage(
          "Profil oluşturulamadı. Supabase düzeltme SQL'i çalıştırılmalı.",
        );
        setIsLoading(false);
        return;
      }

      loadedProfile = repairResult.data as Profile | null;
    }

    if (!loadedProfile) {
      const repairedProfileResult = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (repairedProfileResult.error || !repairedProfileResult.data) {
        setStatusMessage(
          repairedProfileResult.error?.message ??
            "Profil kaydı bulunamadı. Supabase SQL düzeltmesini tekrar kontrol edelim.",
        );
        setIsLoading(false);
        return;
      }

      loadedProfile = repairedProfileResult.data as Profile;
    }

    const loadedSettings = (settingsResult.data as ClubSettings | null) ?? defaultSettings;
    const loadedCourts = (courtsResult.data as Court[] | null) ?? [];

    if (settingsResult.error) {
      setStatusMessage(`Kulüp ayarları okunamadı: ${settingsResult.error.message}`);
    }

    if (courtsResult.error) {
      setStatusMessage(`Kortlar okunamadı: ${courtsResult.error.message}`);
      setCourts([]);
      setIsLoading(false);
      return;
    }

    const profileSchemaReady = Object.prototype.hasOwnProperty.call(
      loadedProfile,
      "skill_level",
    );

    setIsProfileSchemaReady(profileSchemaReady);
    setProfileForm({
      full_name:
        loadedProfile.full_name ??
        currentUser.user_metadata?.full_name ??
        currentUser.user_metadata?.name ??
        "",
      skill_level: isSkillLevel(loadedProfile.skill_level)
        ? loadedProfile.skill_level
        : "beginner",
    });
    setProfile(loadedProfile);
    setSettings(loadedSettings);
    setSettingsDraft(loadedSettings);
    setCourts(loadedCourts);

    setReservationForm((current) => {
      return {
        ...current,
        user_id: current.user_id || currentUser.id,
        court_id:
          current.court_id ||
          loadedCourts.find((court) => court.is_active)?.id ||
          loadedCourts[0]?.id ||
          "",
        start_time: buildTimeSlots(loadedSettings)[0] ?? current.start_time,
      };
    });

    const reservationResult = await supabase
      .from("reservations")
      .select("*, courts(name), profiles(email, full_name)")
      .order("starts_at", { ascending: true });

    let loadedMembers: Profile[] = [];
    let loadedNotifications: AppNotification[] = [];

    if (isAdmin(loadedProfile)) {
      const [memberResult, notificationResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .order("full_name", { ascending: true, nullsFirst: false })
          .order("email", { ascending: true }),
        supabase
          .from("app_notifications")
          .select("*")
          .order("starts_at", { ascending: true }),
      ]);

      if (memberResult.error) {
        setStatusMessage(memberResult.error.message);
      } else {
        loadedMembers = (memberResult.data as Profile[] | null) ?? [];
        setMembers(loadedMembers);
      }

      if (notificationResult.error) {
        setAdminNotifications([]);
      } else {
        loadedNotifications =
          (notificationResult.data as AppNotification[] | null) ?? [];
        setAdminNotifications(sortNotifications(loadedNotifications));
      }
    } else {
      setMembers([]);
      setAdminNotifications([]);
    }

    if (reservationResult.error) {
      setStatusMessage(reservationResult.error.message);
    } else {
      const loadedReservations =
        (reservationResult.data as Reservation[] | null) ?? [];
      setReservations(
        attachReservationProfiles(loadedReservations, [
          loadedProfile,
          ...loadedMembers,
        ]),
      );
    }

    setIsLoading(false);
    void processDueNotifications(currentUser, loadedProfile);
  }, [processDueNotifications, supabase]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setUser(data.user);
      if (!data.user) {
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadData(user);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData, user]);

  useEffect(() => {
    if (!user || !profile?.notification_enabled) {
      return;
    }

    const timer = window.setInterval(() => {
      void processDueNotifications(user, profile);
    }, 30000);

    return () => window.clearInterval(timer);
  }, [processDueNotifications, profile, user]);

  useEffect(() => {
    if (
      !user ||
      !profile?.notification_enabled ||
      notificationPermission !== "granted" ||
      isPushSubscriptionSynced
    ) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      void syncPushSubscription(user);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    isPushSubscriptionSynced,
    notificationPermission,
    profile?.notification_enabled,
    syncPushSubscription,
    user,
  ]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (
        !user ||
        !profile ||
        isLoading ||
        mustCompleteProfile ||
        isNotificationPromptOpen ||
        notificationPermission === "unsupported" ||
        notificationPermission === "denied" ||
        !Object.prototype.hasOwnProperty.call(profile, "notification_enabled") ||
        profile.notification_enabled
      ) {
        return;
      }

      if (window.localStorage.getItem(notificationPromptStorageKey(user.id))) {
        return;
      }

      setIsNotificationPromptOpen(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    isLoading,
    isNotificationPromptOpen,
    mustCompleteProfile,
    notificationPermission,
    profile,
    user,
  ]);

  async function signIn(provider: OAuthProvider) {
    if (!supabase) {
      return;
    }

    setStatusMessage(null);
    setSigningInProvider(provider);
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatusMessage(error.message);
      setSigningInProvider(null);
    }
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setIsProfileSchemaReady(false);
    setProfileForm({ full_name: "", skill_level: "beginner" });
    setReservations([]);
    setMembers([]);
    setAdminNotifications([]);
    setNotificationToast(null);
    setIsNotificationPromptOpen(false);
    setIsPushSubscriptionSynced(false);
  }

  async function saveOwnProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user) {
      return;
    }

    if (!isProfileSchemaReady) {
      setStatusMessage("Profil SQL'i henüz Supabase'de çalıştırılmadı.");
      return;
    }

    const fullName = normalizeFullName(profileForm.full_name);

    if (!hasCompleteFullName(fullName)) {
      setStatusMessage("Ad soyad iki kelime olacak şekilde girilmeli.");
      return;
    }

    if (!isSkillLevel(profileForm.skill_level)) {
      setStatusMessage("Seviye seçilmeli.");
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    const { data, error } = await supabase.rpc("update_own_profile", {
      profile_full_name: fullName,
      profile_skill_level: profileForm.skill_level,
    });

    setIsSaving(false);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    const updatedProfile = data as Profile;

    setProfile(updatedProfile);
    setProfileForm({
      full_name: updatedProfile.full_name ?? fullName,
      skill_level: isSkillLevel(updatedProfile.skill_level)
        ? updatedProfile.skill_level
        : profileForm.skill_level,
    });
    setActiveTab("calendar");
    await loadData(user);
    setStatusMessage("Profil güncellendi.");
  }

  async function saveNotificationPreference(enabled: boolean) {
    if (!supabase || !user || !profile) {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(profile, "notification_enabled")) {
      setStatusMessage("Notification SQL'i henüz Supabase'de çalıştırılmadı.");
      return;
    }

    let nextPermission = notificationPermission;

    if (enabled && "Notification" in window) {
      if (Notification.permission === "default") {
        nextPermission = await Notification.requestPermission();
        setNotificationPermission(nextPermission);
      } else {
        nextPermission = Notification.permission;
      }
    }

    if (enabled && nextPermission === "denied") {
      setStatusMessage(
        "Tarayıcı notification izni kapalı. Telefon veya tarayıcı ayarlarından izin vermek gerekiyor.",
      );
      return;
    }

    if (enabled && nextPermission !== "granted") {
      setStatusMessage("Notification izni verilmeden bildirim açılamaz.");
      return;
    }

    if (enabled) {
      const didSyncPushSubscription = await syncPushSubscription(user, true);

      if (!didSyncPushSubscription) {
        return;
      }
    }

    setIsSaving(true);
    setStatusMessage(null);

    const { data, error } = await supabase.rpc(
      "update_own_notification_preference",
      {
        profile_notification_enabled: enabled,
      },
    );

    setIsSaving(false);

    if (error) {
      setStatusMessage(
        `${error.message} Notification SQL'i Supabase'de çalıştırılmalı.`,
      );
      return;
    }

    const updatedProfile = data as Profile;
    setProfile(updatedProfile);
    setStatusMessage(
      enabled ? "Notificationlar açıldı." : "Notificationlar kapatıldı.",
    );

    if (!enabled) {
      await removePushSubscription(user);
    }

    if (enabled) {
      void processDueNotifications(user, updatedProfile);
    }
  }

  function dismissNotificationPrompt() {
    if (user) {
      window.localStorage.setItem(notificationPromptStorageKey(user.id), "1");
    }

    setIsNotificationPromptOpen(false);
  }

  async function enableNotificationsFromPrompt() {
    if (user) {
      window.localStorage.setItem(notificationPromptStorageKey(user.id), "1");
    }

    setIsNotificationPromptOpen(false);
    await saveNotificationPreference(true);
  }

  async function saveAdminNotification(
    payload: AdminNotificationPayload,
  ): Promise<boolean> {
    if (!supabase || !user || !isAdmin(profile)) {
      return false;
    }

    if (!payload.message) {
      setStatusMessage("Notification metni boş olamaz.");
      return false;
    }

    const startsAt = new Date(payload.starts_at);
    const expiresAt = payload.expires_at ? new Date(payload.expires_at) : null;

    if (payload.schedule_type === "scheduled" && startsAt <= new Date()) {
      setStatusMessage("Zamanlı notification için gelecek bir tarih seçilmeli.");
      return false;
    }

    if (payload.schedule_type === "recurring" && expiresAt && expiresAt < startsAt) {
      setStatusMessage("Sürekli notification bitiş zamanı başlangıçtan önce olamaz.");
      return false;
    }

    setIsSaving(true);
    setStatusMessage(null);

    const notificationPayload = {
      expires_at: payload.expires_at,
      interval_minutes: payload.interval_minutes,
      message: payload.message,
      schedule_type: payload.schedule_type,
      starts_at: payload.starts_at,
      status: "active",
    };

    const result = payload.id
      ? await supabase
          .from("app_notifications")
          .update(notificationPayload)
          .eq("id", payload.id)
          .select("*")
          .single()
      : await supabase
          .from("app_notifications")
          .insert({
            ...notificationPayload,
            created_by: user.id,
          })
          .select("*")
          .single();

    setIsSaving(false);

    if (result.error || !result.data) {
      setStatusMessage(
        `${result.error?.message ?? "Notification kaydedilemedi."} Notification SQL'i Supabase'de çalıştırılmalı.`,
      );
      return false;
    }

    const savedNotification = result.data as AppNotification;

    setAdminNotifications((current) =>
      sortNotifications(
        payload.id
          ? current.map((notification) =>
              notification.id === savedNotification.id
                ? savedNotification
                : notification,
            )
          : [...current, savedNotification],
      ),
    );

    setStatusMessage(
      payload.schedule_type === "instant"
        ? "Notification gönderildi."
        : "Notification ayarlandı.",
    );
    void processDueNotifications(user, profile);

    return true;
  }

  async function cancelAdminNotification(notification: AppNotification) {
    if (!supabase || !isAdmin(profile)) {
      return;
    }

    const shouldCancel = window.confirm("Bu notification iptal edilsin mi?");

    if (!shouldCancel) {
      return;
    }

    const { data, error } = await supabase
      .from("app_notifications")
      .update({ status: "canceled" })
      .eq("id", notification.id)
      .select("*")
      .single();

    if (error || !data) {
      setStatusMessage(
        `${error?.message ?? "Notification iptal edilemedi."} Notification SQL'i Supabase'de çalıştırılmalı.`,
      );
      return;
    }

    const canceledNotification = data as AppNotification;
    setAdminNotifications((current) =>
      current.map((currentNotification) =>
        currentNotification.id === canceledNotification.id
          ? canceledNotification
          : currentNotification,
      ),
    );
    setStatusMessage("Notification iptal edildi.");
  }

  function openReservationForm(courtId?: string, date?: Date, slot?: string) {
    if (!user) {
      return;
    }

    if (!canCreateReservation) {
      setStatusMessage(
        "Rezervasyon yetkiniz henüz açılmadı. Takvimi görebilir, rezervasyon için admin onayını bekleyebilirsiniz.",
      );
      return;
    }

    const requestedDate = date ?? selectedDate;
    const dateForForm = isBookableDay(
      requestedDate,
      effectiveBookingWindowDays,
      currentTime,
    )
      ? requestedDate
      : firstBookableDate(effectiveBookingWindowDays, timeSlots, currentTime);
    const dateValue = dateInputValue(dateForForm);
    const slotForForm =
      slot &&
      isBookableStart(dateValue, slot, effectiveBookingWindowDays, currentTime)
        ? slot
        : firstBookableSlot(
            dateValue,
            timeSlots,
            effectiveBookingWindowDays,
            currentTime,
          );
    const selectedOwner =
      reservationOwnerOptions.find(
        (owner) => owner.id === (reservationForm.user_id || user.id),
      ) ?? profile;
    const selectedOwnerName =
      selectedOwner && profileOptionLabel(selectedOwner) !== "İsim yok"
        ? profileOptionLabel(selectedOwner)
        : getDisplayName(profile, user);

    setReservationForm({
      court_id: courtId ?? activeCourts[0]?.id ?? "",
      custom_info: "",
      date: dateValue,
      is_custom: false,
      is_lesson: canMarkLesson ? reservationForm.is_lesson : false,
      match_type: reservationForm.match_type,
      start_time: slotForForm ?? timeSlots[0] ?? "09:00",
      student_name: "",
      team1_player1_name: selectedOwnerName,
      team1_player2_name: "",
      team2_player1_name: "",
      team2_player2_name: "",
      user_id: reservationForm.user_id || user.id,
    });
    setStatusMessage(null);
    setIsReservationOpen(true);
  }

  function openEditReservation(reservation: Reservation) {
    const startsAt = new Date(reservation.starts_at);
    const customInfo = getReservationCustomInfo(reservation);

    if (startsAt < currentTime) {
      setStatusMessage("Geçmiş rezervasyonlar düzenlenemez.");
      return;
    }

    setReservationEditForm({
      court_id: reservation.court_id,
      custom_info: customInfo,
      date: dateInputValue(startsAt),
      is_custom: Boolean(customInfo),
      ...getReservationMatchFormFields(reservation),
      start_time: formatTime(startsAt),
      user_id: reservation.user_id,
      status: reservation.status,
    });
    setStatusMessage(null);
    setEditingReservation(reservation);
  }

  async function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user) {
      return;
    }

    if (!reservationForm.court_id) {
      setStatusMessage("Önce aktif bir kort eklenmeli.");
      return;
    }

    if (
      !isBookableStart(
        reservationForm.date,
        reservationForm.start_time,
        effectiveBookingWindowDays,
        currentTime,
      )
    ) {
      setStatusMessage("Bu tarih ve saat için rezervasyon yapılamaz.");
      return;
    }

    const customInfo = normalizeFullName(reservationForm.custom_info);

    if (canManageReservations && reservationForm.is_custom && !customInfo) {
      setStatusMessage("Özel rezervasyon bilgisi girilmeli.");
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    const startsAt = buildLocalDateTime(
      reservationForm.date,
      reservationForm.start_time,
    );
    const endsAt = addSlotDuration(startsAt, settings);
    const selectedOwner =
      reservationOwnerOptions.find(
        (owner) => owner.id === (reservationForm.user_id || user.id),
      ) ?? profile;
    const trainerName =
      selectedOwner && profileOptionLabel(selectedOwner) !== "İsim yok"
        ? profileOptionLabel(selectedOwner)
        : getDisplayName(profile, user);
    const reservationNote =
      canManageReservations && reservationForm.is_custom
        ? customInfo
        : canMarkLesson && reservationForm.is_lesson
          ? buildReservationLessonNote(reservationForm, trainerName)
          : buildReservationMatchNote(reservationForm);

    const { error } = await supabase.from("reservations").insert({
      court_id: reservationForm.court_id,
      user_id: canManageReservations ? reservationForm.user_id || user.id : user.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      note: reservationNote,
      status: "confirmed",
    });

    setIsSaving(false);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setIsReservationOpen(false);
    setStatusMessage("Rezervasyon eklendi.");
    await loadData(user);
  }

  async function cancelReservation(reservation: Reservation) {
    if (!supabase || !user) {
      return;
    }

    setStatusMessage(null);
    const { error } = await supabase
      .from("reservations")
      .update({ status: "canceled" })
      .eq("id", reservation.id);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setStatusMessage("Rezervasyon iptal edildi.");
    await loadData(user);
  }

  async function updateReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user || !editingReservation || !isAdmin(profile)) {
      return;
    }

    if (
      reservationEditForm.status === "confirmed" &&
      !isBookableStart(
        reservationEditForm.date,
        reservationEditForm.start_time,
        ADMIN_EDIT_BOOKING_WINDOW_DAYS,
        currentTime,
      )
    ) {
      setStatusMessage("Bu tarih ve saat için rezervasyon yapılamaz.");
      return;
    }

    const customInfo = normalizeFullName(reservationEditForm.custom_info);

    if (reservationEditForm.is_custom && !customInfo) {
      setStatusMessage("Özel rezervasyon bilgisi girilmeli.");
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    const startsAt = buildLocalDateTime(
      reservationEditForm.date,
      reservationEditForm.start_time,
    );
    const endsAt = addSlotDuration(startsAt, settings);
    const selectedOwner =
      reservationOwnerOptions.find(
        (owner) =>
          owner.id ===
          (reservationEditForm.user_id || editingReservation.user_id),
      ) ?? profile;
    const trainerName =
      selectedOwner && profileOptionLabel(selectedOwner) !== "İsim yok"
        ? profileOptionLabel(selectedOwner)
        : getDisplayName(profile, user);
    const reservationNote = reservationEditForm.is_custom
      ? customInfo
      : reservationEditForm.is_lesson
        ? buildReservationLessonNote(reservationEditForm, trainerName)
        : buildReservationMatchNote(reservationEditForm);

    const { error } = await supabase
      .from("reservations")
      .update({
        court_id: reservationEditForm.court_id,
        user_id: reservationEditForm.user_id || editingReservation.user_id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        note: reservationNote,
        status: reservationEditForm.status,
      })
      .eq("id", editingReservation.id);

    setIsSaving(false);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setEditingReservation(null);
    setStatusMessage("Rezervasyon güncellendi.");
    await loadData(user);
  }

  async function deleteReservation(reservation: Reservation) {
    if (!supabase || !user || !isAdmin(profile)) {
      return;
    }

    if (!isFutureReservation(reservation, currentTime)) {
      setStatusMessage("Geçmiş rezervasyonlar silinemez.");
      return;
    }

    setStatusMessage(null);
    const { error } = await supabase
      .from("reservations")
      .delete()
      .eq("id", reservation.id);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setStatusMessage("Rezervasyon silindi.");
    setEditingReservation(null);
    await loadData(user);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user) {
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    const updatedSettings: ClubSettings = {
      ...settingsDraft,
      opening_time: settingsDraft.opening_time,
      closing_time: settingsDraft.closing_time,
      reservation_slot_minutes: Number(settingsDraft.reservation_slot_minutes),
      max_active_reservations: Number(settingsDraft.max_active_reservations),
      default_booking_days_ahead: Number(
        settingsDraft.default_booking_days_ahead,
      ),
      club_member_booking_days_ahead: Number(
        settingsDraft.club_member_booking_days_ahead,
      ),
      cancellation_deadline_hours: Number(
        settingsDraft.cancellation_deadline_hours,
      ),
    };

    const settingsPayload = {
      setting_cancellation_deadline_hours:
        updatedSettings.cancellation_deadline_hours,
      setting_closing_time: updatedSettings.closing_time,
      setting_club_member_booking_days_ahead:
        updatedSettings.club_member_booking_days_ahead,
      setting_default_booking_days_ahead:
        updatedSettings.default_booking_days_ahead,
      setting_max_active_reservations:
        updatedSettings.max_active_reservations,
      setting_opening_time: updatedSettings.opening_time,
      setting_reservation_slot_minutes:
        updatedSettings.reservation_slot_minutes,
    };

    const rpcResult = await supabase.rpc(
      "admin_update_club_settings",
      settingsPayload,
    );
    const updateResult = rpcResult.error
      ? await supabase
          .from("club_settings")
          .update({
            opening_time: updatedSettings.opening_time,
            closing_time: updatedSettings.closing_time,
            reservation_slot_minutes: updatedSettings.reservation_slot_minutes,
            max_active_reservations: updatedSettings.max_active_reservations,
            default_booking_days_ahead:
              updatedSettings.default_booking_days_ahead,
            club_member_booking_days_ahead:
              updatedSettings.club_member_booking_days_ahead,
            cancellation_deadline_hours:
              updatedSettings.cancellation_deadline_hours,
          })
          .eq("id", 1)
      : rpcResult;

    setIsSaving(false);

    if (updateResult.error) {
      setStatusMessage(
        `${updateResult.error.message} Ayarlar kaydolmadıysa Supabase admin ayar SQL'ini çalıştırmak gerekiyor.`,
      );
      return;
    }

    const refreshedSettingsResult = await supabase
      .from("club_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (refreshedSettingsResult.error || !refreshedSettingsResult.data) {
      setStatusMessage(
        refreshedSettingsResult.error?.message ??
          "Kulüp ayarları kaydedildi ama doğrulama için tekrar okunamadı.",
      );
      return;
    }

    const savedSettings = refreshedSettingsResult.data as ClubSettings;

    if (
      normalizeTime(savedSettings.opening_time) !==
        normalizeTime(updatedSettings.opening_time) ||
      normalizeTime(savedSettings.closing_time) !==
        normalizeTime(updatedSettings.closing_time) ||
      Number(savedSettings.reservation_slot_minutes) !==
        updatedSettings.reservation_slot_minutes ||
      Number(savedSettings.max_active_reservations) !==
        updatedSettings.max_active_reservations ||
      Number(savedSettings.default_booking_days_ahead) !==
        updatedSettings.default_booking_days_ahead ||
      Number(savedSettings.club_member_booking_days_ahead) !==
        updatedSettings.club_member_booking_days_ahead ||
      Number(savedSettings.cancellation_deadline_hours) !==
        updatedSettings.cancellation_deadline_hours
    ) {
      setSettings(savedSettings);
      setSettingsDraft(savedSettings);
      setStatusMessage(
        "Kulüp ayarları kaydedilemedi. Supabase admin ayar SQL'ini çalıştırmak gerekiyor.",
      );
      return;
    }

    setSettings(savedSettings);
    setSettingsDraft(savedSettings);
    setStatusMessage("Kulüp ayarları güncellendi.");
  }

  async function addCourt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user || !newCourtName.trim()) {
      return;
    }

    const nextDisplayOrder =
      Math.max(0, ...courts.map((court) => Number(court.display_order) || 0)) + 1;
    const insertedCourtDraft = {
      name: newCourtName.trim(),
      display_order: nextDisplayOrder,
      is_active: true,
    };

    const rpcResult = await supabase.rpc("admin_create_court", {
      court_display_order: insertedCourtDraft.display_order,
      court_name: insertedCourtDraft.name,
    });
    const insertResult = rpcResult.error
      ? await supabase.from("courts").insert(insertedCourtDraft).select("*").single()
      : rpcResult;
    const { data, error } = insertResult;

    if (error || !data) {
      setStatusMessage(
        error?.message ??
          "Kort eklenemedi. Supabase admin izin SQL'ini çalıştırmak gerekiyor.",
      );
      return;
    }

    setNewCourtName("");
    setCourts((currentCourts) =>
      [...currentCourts, data as Court].sort(
        (firstCourt, secondCourt) =>
          firstCourt.display_order - secondCourt.display_order,
      ),
    );
    setStatusMessage("Kort eklendi.");
  }

  async function saveCourt(courtId: string) {
    if (!supabase || !user) {
      return;
    }

    const court = courts.find((currentCourt) => currentCourt.id === courtId);

    if (!court) {
      setStatusMessage("Kort bulunamadı.");
      return;
    }

    const updatedCourt: Court = {
      ...court,
      name: court.name,
      display_order: Number(court.display_order),
      is_active: court.is_active,
    };

    const { error } = await supabase
      .from("courts")
      .update({
        name: updatedCourt.name,
        display_order: updatedCourt.display_order,
        is_active: updatedCourt.is_active,
      })
      .eq("id", court.id);

    if (error) {
      setStatusMessage(
        `${error.message} Kort kaydolmadıysa Supabase admin izin SQL'ini çalıştırmak gerekiyor.`,
      );
      return;
    }

    const refreshedCourtResult = await supabase
      .from("courts")
      .select("*")
      .eq("id", court.id)
      .maybeSingle();

    if (refreshedCourtResult.error || !refreshedCourtResult.data) {
      setStatusMessage(
        refreshedCourtResult.error?.message ??
          "Kort güncellendi ama doğrulama için tekrar okunamadı.",
      );
      return;
    }

    const savedCourt = refreshedCourtResult.data as Court;

    if (
      savedCourt.name !== updatedCourt.name ||
      Number(savedCourt.display_order) !== updatedCourt.display_order ||
      savedCourt.is_active !== updatedCourt.is_active
    ) {
      setCourts((currentCourts) =>
        currentCourts
          .map((currentCourt) =>
            currentCourt.id === court.id ? savedCourt : currentCourt,
          )
          .sort(
            (firstCourt, secondCourt) =>
              firstCourt.display_order - secondCourt.display_order,
          ),
      );
      setStatusMessage(
        "Kort ayarı kaydedilemedi. Supabase admin izin SQL'ini çalıştırmak gerekiyor.",
      );
      return;
    }

    setCourts((currentCourts) =>
      currentCourts
        .map((currentCourt) =>
          currentCourt.id === court.id ? savedCourt : currentCourt,
        )
        .sort(
          (firstCourt, secondCourt) =>
            firstCourt.display_order - secondCourt.display_order,
        ),
    );
    setStatusMessage("Kort güncellendi.");
  }

  async function deleteCourt(court: Court) {
    if (!supabase || !user || profile?.app_role !== "super_admin") {
      return;
    }

    const shouldDelete = window.confirm(
      `${court.name} silinsin mi? Bu işlem geri alınamaz.`,
    );

    if (!shouldDelete) {
      return;
    }

    const rpcResult = await supabase.rpc("admin_delete_court", {
      target_court_id: court.id,
    });
    const deleteResult = rpcResult.error
      ? await supabase.from("courts").delete().eq("id", court.id)
      : rpcResult;

    if (deleteResult.error) {
      setStatusMessage(
        `${deleteResult.error.message} Kort silinmediyse Supabase baş admin silme SQL'ini çalıştırmak gerekiyor.`,
      );
      return;
    }

    setCourts((currentCourts) =>
      currentCourts.filter((currentCourt) => currentCourt.id !== court.id),
    );
    setStatusMessage("Kort silindi.");
  }

  async function updateMember(memberId: string, fields: Partial<Profile>) {
    if (!supabase || !user) {
      return;
    }

    const currentMember =
      members.find((member) => member.id === memberId) ??
      (profile?.id === memberId ? profile : null);

    if (!currentMember) {
      setStatusMessage("Üye bulunamadı.");
      return;
    }

    const nextMember: Profile = {
      ...currentMember,
      ...fields,
    };
    const expectedMember: Profile = {
      ...nextMember,
      can_book: Boolean(nextMember.can_book),
      full_name: normalizeNullableFullName(nextMember.full_name),
      is_trainer: Boolean(nextMember.is_trainer),
      reservation_days_ahead: nextMember.reservation_days_ahead ?? null,
      skill_level: nextMember.skill_level ?? "beginner",
    };

    const profileUpdatePayload = {
      profile_app_role: expectedMember.app_role,
      profile_can_book: expectedMember.can_book,
      profile_full_name: expectedMember.full_name,
      profile_id: memberId,
      profile_is_club_member: expectedMember.is_club_member,
      profile_reservation_days_ahead: expectedMember.reservation_days_ahead,
      profile_skill_level: expectedMember.skill_level,
    };
    const rpcResult =
      fields.can_book !== undefined || fields.is_trainer !== undefined
        ? await supabase.rpc("admin_update_profile", {
            ...profileUpdatePayload,
            profile_is_trainer: expectedMember.is_trainer,
          })
        : await supabase.rpc("admin_update_profile", {
            profile_app_role: expectedMember.app_role,
            profile_full_name: expectedMember.full_name,
            profile_id: memberId,
            profile_is_club_member: expectedMember.is_club_member,
            profile_reservation_days_ahead:
              expectedMember.reservation_days_ahead,
            profile_skill_level: expectedMember.skill_level,
          });
    const updateResult = rpcResult.error
      ? await supabase.from("profiles").update(fields).eq("id", memberId)
      : rpcResult;

    if (updateResult.error) {
      setStatusMessage(
        `${updateResult.error.message} Üye kaydolmadıysa Supabase admin ayar SQL'ini çalıştırmak gerekiyor.`,
      );
      return;
    }

    let savedMember = rpcResult.error ? null : (rpcResult.data as Profile | null);

    if (!savedMember) {
      const refreshedMemberResult = await supabase
        .from("profiles")
        .select("*")
        .eq("id", memberId)
        .maybeSingle();

      if (refreshedMemberResult.error || !refreshedMemberResult.data) {
        setStatusMessage(
          refreshedMemberResult.error?.message ??
            "Üye güncellendi ama doğrulama için tekrar okunamadı.",
        );
        return;
      }

      savedMember = refreshedMemberResult.data as Profile;
    }

    if (
      (fields.full_name !== undefined &&
        normalizeNullableFullName(savedMember.full_name) !==
          expectedMember.full_name) ||
      (fields.can_book !== undefined &&
        Boolean(savedMember.can_book) !== Boolean(expectedMember.can_book)) ||
      (fields.skill_level !== undefined &&
        savedMember.skill_level !== expectedMember.skill_level) ||
      (fields.is_club_member !== undefined &&
        savedMember.is_club_member !== expectedMember.is_club_member) ||
      (fields.is_trainer !== undefined &&
        Boolean(savedMember.is_trainer) !== Boolean(expectedMember.is_trainer)) ||
      (fields.reservation_days_ahead !== undefined &&
        (savedMember.reservation_days_ahead ?? null) !==
          expectedMember.reservation_days_ahead) ||
      (fields.app_role !== undefined &&
        savedMember.app_role !== expectedMember.app_role)
    ) {
      setMembers((currentMembers) =>
        currentMembers.map((member) =>
          member.id === memberId ? savedMember : member,
        ),
      );
      if (profile?.id === memberId) {
        setProfile(savedMember);
      }
      setStatusMessage(
        "Üye ayarı kaydedilemedi. Supabase admin ayar SQL'ini çalıştırmak gerekiyor.",
      );
      return;
    }

    setMembers((currentMembers) =>
      currentMembers.map((member) =>
        member.id === memberId ? savedMember : member,
      ),
    );
    if (profile?.id === memberId) {
      setProfile(savedMember);
    }
    setStatusMessage("Üye güncellendi.");
  }

  function moveCalendar(direction: -1 | 1) {
    setSelectedDate((current) => {
      if (calendarView === "day") {
        return addDays(current, direction);
      }

      if (calendarView === "week") {
        return addWeeks(current, direction);
      }

      return addMonths(current, direction);
    });
  }

  function refreshCalendar() {
    if (!user) {
      return;
    }

    void loadData(user);
  }

  if (!supabase) {
    return (
      <main
        className={`${themeClassName} min-h-screen w-full overflow-x-hidden bg-[#f7f6f1] px-4 py-6 text-[#17211c] sm:px-8`}
      >
        <LandingShell
          onToggleTheme={toggleTheme}
          statusMessage="Supabase bilgileri henüz .env.local dosyasına eklenmemiş."
          theme={theme}
          onSignIn={signIn}
          signingInProvider={signingInProvider}
          showPageRefresh
          isAuthDisabled
        />
      </main>
    );
  }

  if (!user) {
    return (
      <main
        className={`${themeClassName} min-h-screen w-full overflow-x-hidden bg-[#f7f6f1] px-4 py-6 text-[#17211c] sm:px-8`}
      >
        <LandingShell
          onToggleTheme={toggleTheme}
          statusMessage={statusMessage}
          theme={theme}
          onSignIn={signIn}
          signingInProvider={signingInProvider}
          showPageRefresh
        />
      </main>
    );
  }

  const visibleActiveTab = mustCompleteProfile ? "profile" : activeTab;

  return (
    <main
      className={`${themeClassName} min-h-screen w-full overflow-x-hidden bg-[#f7f6f1] text-[#17211c]`}
    >
      <header className="border-b border-[#ddd7c8] bg-[#fffdf8]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <ClubMark size="banner" />
            <div className="min-w-0">
              <h1 className="text-base font-semibold leading-tight tracking-normal sm:text-xl">
                <span className="block">Ayvalık Çamlık</span>
                <span className="block">Tenis Kulübü</span>
              </h1>
              <div className="mt-1 text-xs text-[#546257] sm:text-sm">
                <span className="font-medium text-[#17211c]">
                  {getDisplayName(profile, user)}
                </span>
                {profile?.is_club_member ? " · Kulüp üyesi" : " · App üyesi"}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <ThemeToggle onToggle={toggleTheme} theme={theme} />
              <PageRefreshButton />
              <button
                aria-label="Çıkış yap"
                className="grid size-10 place-items-center rounded-md border border-[#cfc8b8] bg-white text-[#17211c] hover:bg-[#eee9dd]"
                onClick={signOut}
                title="Çıkış yap"
                type="button"
              >
                <LogOut size={16} />
              </button>
            </div>
            {isAdmin(profile) ? (
              <button
                className={`h-8 rounded-md px-3 text-xs font-semibold ${
                  visibleActiveTab === "admin"
                    ? "bg-[#237000] text-white"
                    : "border border-[#ddd7c8] bg-[#fffdf8] text-[#546257] hover:bg-[#eee9dd]"
                }`}
                onClick={() => setActiveTab("admin")}
                type="button"
              >
                Admin
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-4 px-3 py-4 sm:px-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6 lg:py-6">
        <aside className="w-full lg:sticky lg:top-6 lg:self-start">
          <nav className="flex justify-center gap-2 overflow-x-auto lg:flex-col lg:justify-start lg:overflow-visible">
            <NavButton
              icon={<CalendarDays size={18} />}
              isActive={visibleActiveTab === "calendar"}
              label="Takvim"
              onClick={() => setActiveTab("calendar")}
            />
            <NavButton
              icon={<Clock3 size={18} />}
              isActive={visibleActiveTab === "reservations"}
              label="Rezervasyonlar"
              onClick={() => setActiveTab("reservations")}
            />
            <NavButton
              compactOnMobile
              icon={<UserIcon size={18} />}
              isActive={visibleActiveTab === "profile"}
              label="Profil"
              onClick={() => setActiveTab("profile")}
            />
          </nav>
        </aside>

        <section className="mx-auto w-full min-w-0 max-w-5xl">
          {notificationToast ? (
            <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-[#9ec596] bg-[#f0f8ef] px-4 py-3 text-sm text-[#1f6500]">
              <div className="min-w-0">
                <p className="font-semibold">Notification</p>
                <p className="mt-1 leading-5">{notificationToast.message}</p>
              </div>
              <button
                aria-label="Notification kapat"
                className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-[#e3f1df]"
                onClick={() => setNotificationToast(null)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}

          {statusMessage ? (
            <div className="mb-4 rounded-md border border-[#d9c799] bg-[#fff8df] px-4 py-3 text-sm text-[#5f4b19]">
              {statusMessage}
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-md border border-[#ddd7c8] bg-[#fffdf8]">
              <div className="flex items-center gap-2 text-sm text-[#546257]">
                <RefreshCw className="animate-spin" size={18} />
                Yükleniyor
              </div>
            </div>
          ) : null}

          {!isLoading && visibleActiveTab === "calendar" ? (
            <CalendarPanel
              activeCourts={activeCourts}
              bookingWindowDays={effectiveBookingWindowDays}
              calendarView={calendarView}
              canCreateReservation={canCreateReservation}
              courts={courts}
              currentTime={currentTime}
              moveCalendar={moveCalendar}
              onEditReservation={
                isAdmin(profile) ? openEditReservation : undefined
              }
              onCreateReservation={openReservationForm}
              onRefresh={refreshCalendar}
              reservations={visibleReservations}
              selectedDate={selectedDate}
              setCalendarView={setCalendarView}
              setSelectedDate={setSelectedDate}
              settings={settings}
              timeSlots={timeSlots}
            />
          ) : null}

          {!isLoading && visibleActiveTab === "reservations" ? (
            <ReservationsPanel
              canManageAll={isAdmin(profile)}
              currentTime={currentTime}
              onEdit={openEditReservation}
              onCancel={cancelReservation}
              onShowAllChange={setShowAllReservations}
              reservations={reservations}
              showAll={showAllReservations}
              userId={user.id}
            />
          ) : null}

          {!isLoading && visibleActiveTab === "profile" && profile ? (
            <ProfilePanel
              form={profileForm}
              isRequired={mustCompleteProfile}
              isSaving={isSaving}
              isSchemaReady={isProfileSchemaReady}
              onFormChange={setProfileForm}
              notificationPermission={notificationPermission}
              onNotificationPreferenceChange={saveNotificationPreference}
              onSubmit={saveOwnProfile}
              profile={profile}
            />
          ) : null}

          {!isLoading && visibleActiveTab === "admin" && profile && isAdmin(profile) ? (
            <AdminPanel
              adminNotifications={adminNotifications}
              courts={courts}
              currentProfile={profile}
              isSaving={isSaving}
              members={members}
              newCourtName={newCourtName}
              onAddCourt={addCourt}
              onCourtChange={(courtId, fields) =>
                setCourts((current) =>
                  current.map((court) =>
                    court.id === courtId ? { ...court, ...fields } : court,
                  ),
                )
              }
              onMemberUpdate={updateMember}
              onNewCourtNameChange={setNewCourtName}
              onDeleteCourt={deleteCourt}
              onCancelNotification={cancelAdminNotification}
              onSaveNotification={saveAdminNotification}
              onSaveCourt={saveCourt}
              onSaveSettings={saveSettings}
              onSettingsDraftChange={setSettingsDraft}
              settingsDraft={settingsDraft}
            />
          ) : null}
        </section>
      </div>

      {isNotificationPromptOpen ? (
        <NotificationOptInDialog
          isSaving={isSaving}
          onClose={dismissNotificationPrompt}
          onEnable={enableNotificationsFromPrompt}
        />
      ) : null}

      {isReservationOpen ? (
        <ReservationDialog
          activeCourts={activeCourts}
          bookingWindowDays={effectiveBookingWindowDays}
          canMarkLesson={canMarkLesson}
          canChooseOwner={canManageReservations}
          currentTime={currentTime}
          form={reservationForm}
          isSaving={isSaving}
          onClose={() => setIsReservationOpen(false)}
          ownerOptions={reservationOwnerOptions}
          onSubmit={createReservation}
          setForm={setReservationForm}
          settings={settings}
          timeSlots={timeSlots}
        />
      ) : null}

      {editingReservation ? (
        <ReservationEditDialog
          activeCourts={activeCourts}
          bookingWindowDays={ADMIN_EDIT_BOOKING_WINDOW_DAYS}
          canMarkLesson={
            canMarkLesson || Boolean(parseReservationLessonNote(editingReservation.note))
          }
          currentTime={currentTime}
          form={reservationEditForm}
          isSaving={isSaving}
          onClose={() => setEditingReservation(null)}
          onDelete={() => {
            void deleteReservation(editingReservation);
          }}
          ownerOptions={reservationOwnerOptions}
          onSubmit={updateReservation}
          setForm={setReservationEditForm}
          settings={settings}
          timeSlots={timeSlots}
        />
      ) : null}
    </main>
  );
}

function LandingShell({
  isAuthDisabled = false,
  onToggleTheme,
  onSignIn,
  showPageRefresh = false,
  signingInProvider,
  statusMessage,
  theme,
}: {
  isAuthDisabled?: boolean;
  onToggleTheme: () => void;
  onSignIn: (provider: OAuthProvider) => void;
  showPageRefresh?: boolean;
  signingInProvider: OAuthProvider | null;
  statusMessage: string | null;
  theme: ThemeMode;
}) {
  const isSigningIn = Boolean(signingInProvider);
  const loadingLabel =
    signingInProvider === "apple"
      ? "Apple ile bağlanılıyor"
      : "Google ile bağlanılıyor";
  const isAuthActionDisabled = isAuthDisabled || isSigningIn;

  return (
    <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl content-start gap-5 pt-20 sm:pt-16 lg:grid-cols-[1fr_420px] lg:content-center lg:gap-10 lg:pt-14">
      <div className="absolute right-4 top-4 flex items-center gap-2 sm:right-8">
        <ThemeToggle onToggle={onToggleTheme} theme={theme} />
        {showPageRefresh ? <PageRefreshButton /> : null}
      </div>
      <section className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <ClubMark size="lg" />
        <div className="mt-5">
          <p className="brand-title text-[2.45rem] font-semibold leading-none tracking-normal sm:text-5xl">
            Ayvalık Çamlık
          </p>
          <p className="brand-title mt-2 text-[2rem] font-semibold leading-none tracking-normal sm:text-4xl">
            Tenis Kulübü
          </p>
        </div>
        <h1 className="mt-5 whitespace-nowrap text-xl font-medium tracking-normal text-[#546257] sm:text-3xl">
          Kort Rezervasyon
        </h1>
      </section>

      <section className="rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-center text-2xl font-semibold">Üye girişi</h2>
        </div>

        <div className="grid gap-3">
          <button
            className="inline-flex h-12 items-center justify-center gap-3 rounded-md border border-[#cfc8b8] bg-white px-4 text-sm font-semibold hover:bg-[#f1ede2] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isAuthActionDisabled}
            onClick={() => onSignIn("google")}
            type="button"
          >
            <span className="grid size-6 place-items-center rounded-full border border-[#d5d0c3] text-sm font-bold">
              G
            </span>
            Google ile bağlan
          </button>
          <button
            className="inline-flex h-12 items-center justify-center gap-3 rounded-md bg-[#237000] px-4 text-sm font-semibold text-white hover:bg-[#1f6500] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isAuthActionDisabled}
            onClick={() => onSignIn("apple")}
            type="button"
          >
            <Apple size={20} />
            Apple ile bağlan
          </button>
        </div>

        {statusMessage ? (
          <div className="mt-5 rounded-md border border-[#d9c799] bg-[#fff8df] px-4 py-3 text-sm leading-6 text-[#5f4b19]">
            {statusMessage}
          </div>
        ) : null}
      </section>

      {isSigningIn ? (
        <div
          aria-live="polite"
          className="absolute inset-0 z-10 grid min-h-[calc(100vh-3rem)] place-items-center bg-[#f7f6f1]/90 px-4 backdrop-blur-sm"
        >
          <div className="grid justify-items-center gap-4 rounded-md border border-[#ddd7c8] bg-[#fffdf8] px-8 py-7 text-center shadow-sm">
            <ClubMark size="banner" />
            <RefreshCw className="animate-spin text-[#237000]" size={24} />
            <p className="text-sm font-semibold text-[#17211c]">
              {loadingLabel}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CalendarPanel({
  activeCourts,
  bookingWindowDays,
  calendarView,
  canCreateReservation,
  courts,
  currentTime,
  moveCalendar,
  onCreateReservation,
  onEditReservation,
  onRefresh,
  reservations,
  selectedDate,
  setCalendarView,
  setSelectedDate,
  settings,
  timeSlots,
}: {
  activeCourts: Court[];
  bookingWindowDays: number;
  calendarView: CalendarView;
  canCreateReservation: boolean;
  courts: Court[];
  currentTime: Date;
  moveCalendar: (direction: -1 | 1) => void;
  onCreateReservation: (courtId?: string, date?: Date, slot?: string) => void;
  onEditReservation?: (reservation: Reservation) => void;
  onRefresh: () => void;
  reservations: Reservation[];
  selectedDate: Date;
  setCalendarView: (view: CalendarView) => void;
  setSelectedDate: (date: Date) => void;
  settings: ClubSettings;
  timeSlots: string[];
}) {
  const todayActionLabel =
    calendarView === "week"
      ? "Bu Hafta"
      : calendarView === "month"
        ? "Bu Ay"
        : "Bugün";
  const isCurrentPeriodSelected =
    calendarView === "day"
      ? isSameDay(selectedDate, currentTime)
      : calendarView === "week"
        ? startOfWeek(selectedDate, { weekStartsOn: 1 }).getTime() ===
          startOfWeek(currentTime, { weekStartsOn: 1 }).getTime()
        : startOfMonth(selectedDate).getTime() ===
          startOfMonth(currentTime).getTime();

  return (
    <div className="mx-auto w-full space-y-3 sm:space-y-4">
      <div className="rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-3 sm:p-4">
        <div className="grid gap-2">
          <div className="grid grid-cols-3 rounded-md border border-[#cfc8b8] bg-white p-1">
            {(Object.keys(viewLabels) as CalendarView[]).map((view) => (
              <button
                className={`h-9 rounded px-2 text-sm font-medium ${
                  calendarView === view
                    ? "bg-[#237000] text-white"
                    : "text-[#546257] hover:bg-[#eee9dd]"
                }`}
                key={view}
                onClick={() => setCalendarView(view)}
                type="button"
              >
                {viewLabels[view]}
              </button>
            ))}
          </div>
          {canCreateReservation ? (
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#237000] px-4 text-sm font-semibold text-white hover:bg-[#1f6500]"
              onClick={() => onCreateReservation()}
              type="button"
            >
              <Plus size={18} />
              Rezervasyon yap
            </button>
          ) : (
            <div className="rounded-md border border-[#e6dfd2] bg-[#f6f1e7] px-3 py-2 text-center text-sm font-medium text-[#68756b]">
              Rezervasyon yetkisi için admin onayı bekleniyor.
            </div>
          )}
        </div>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-[#68756b]">
              {normalizeTime(settings.opening_time)} -{" "}
              {normalizeTime(settings.closing_time)} ·{" "}
              {settings.reservation_slot_minutes} dk
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold sm:text-2xl">
              {calendarView === "month"
                ? formatMonthTitle(selectedDate)
                : formatDateTitle(selectedDate)}
            </h2>
          </div>
          <button
            aria-label="Yenile"
            className="grid size-10 shrink-0 place-items-center rounded-md border border-[#cfc8b8] bg-white text-[#17211c] hover:bg-[#eee9dd]"
            onClick={onRefresh}
            title="Yenile"
            type="button"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-[#cfc8b8] bg-white px-2 text-sm font-medium hover:bg-[#eee9dd]"
          onClick={() => moveCalendar(-1)}
          type="button"
        >
          <ChevronLeft size={18} />
          <span className="sr-only sm:not-sr-only">Önceki</span>
        </button>
        <button
          className={`h-10 rounded-md border px-2 text-sm font-medium ${
            isCurrentPeriodSelected
              ? "border-[#237000] bg-[#237000] text-white"
              : "border-[#cfc8b8] bg-white hover:bg-[#eee9dd]"
          }`}
          onClick={() => setSelectedDate(new Date())}
          type="button"
        >
          {todayActionLabel}
        </button>
        <button
          className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-[#cfc8b8] bg-white px-2 text-sm font-medium hover:bg-[#eee9dd]"
          onClick={() => moveCalendar(1)}
          type="button"
        >
          <span className="sr-only sm:not-sr-only">Sonraki</span>
          <ChevronRight size={18} />
        </button>
      </div>

      {activeCourts.length === 0 ? (
        <EmptyState
          title="Aktif kort yok"
          text={`Toplam ${courts.length} kort tanımlı. Admin panelden en az bir kortu aktif yapın.`}
        />
      ) : null}

      {activeCourts.length > 0 && calendarView === "day" ? (
        <DayCalendar
          bookingWindowDays={bookingWindowDays}
          canCreateReservation={canCreateReservation}
          courts={activeCourts}
          currentTime={currentTime}
          onEditReservation={onEditReservation}
          onCreateReservation={onCreateReservation}
          reservations={reservations}
          selectedDate={selectedDate}
          timeSlots={timeSlots}
        />
      ) : null}

      {activeCourts.length > 0 && calendarView === "week" ? (
        <WeekCalendar
          bookingWindowDays={bookingWindowDays}
          currentTime={currentTime}
          reservations={reservations}
          selectedDate={selectedDate}
          setCalendarView={setCalendarView}
          setSelectedDate={setSelectedDate}
          timeSlots={timeSlots}
        />
      ) : null}

      {activeCourts.length > 0 && calendarView === "month" ? (
        <MonthCalendar
          bookingWindowDays={bookingWindowDays}
          currentTime={currentTime}
          reservations={reservations}
          selectedDate={selectedDate}
          setCalendarView={setCalendarView}
          setSelectedDate={setSelectedDate}
          timeSlots={timeSlots}
        />
      ) : null}
    </div>
  );
}

function DayCalendar({
  bookingWindowDays,
  canCreateReservation,
  courts,
  currentTime,
  onEditReservation,
  onCreateReservation,
  reservations,
  selectedDate,
  timeSlots,
}: {
  bookingWindowDays: number;
  canCreateReservation: boolean;
  courts: Court[];
  currentTime: Date;
  onEditReservation?: (reservation: Reservation) => void;
  onCreateReservation: (courtId?: string, date?: Date, slot?: string) => void;
  reservations: Reservation[];
  selectedDate: Date;
  timeSlots: string[];
}) {
  const compactCourtGrid = courts.length <= 3;
  const gridTemplateColumns = compactCourtGrid
    ? `clamp(64px, 15vw, 96px) repeat(${courts.length}, minmax(0, 1fr))`
    : `112px repeat(${courts.length}, minmax(116px, 1fr))`;

  return (
    <div className="w-full overflow-x-auto rounded-md border border-[#ddd7c8] bg-[#fffdf8]">
      <div
        className={compactCourtGrid ? "w-full min-w-0" : "min-w-[560px]"}
        style={{
          display: "grid",
          gridTemplateColumns,
        }}
      >
        <div className="grid place-items-center border-b border-r border-[#e6dfd2] bg-[#f3efe5] px-1 py-2 text-center text-[9px] font-semibold uppercase text-[#68756b] sm:p-3 sm:text-xs">
          Saat
        </div>
        {courts.map((court) => (
          <div
            className="grid place-items-center break-words border-b border-r border-[#e6dfd2] bg-[#f3efe5] px-1 py-2 text-center text-[10px] font-semibold leading-tight sm:p-3 sm:text-sm"
            key={court.id}
          >
            {court.name}
          </div>
        ))}

        {timeSlots
          .filter((slot) =>
            isBookableStart(
              dateInputValue(selectedDate),
              slot,
              ADMIN_EDIT_BOOKING_WINDOW_DAYS,
              currentTime,
            ),
          )
          .map((slot) => (
            <div className="contents" key={slot}>
              <div className="grid place-items-center border-r border-t border-[#eee7db] px-1 py-2 text-center text-[15px] font-bold leading-none text-[#17211c] sm:p-3 sm:text-xl">
                {slot}
              </div>
              {courts.map((court) => {
                const slotBookable = isBookableStart(
                  dateInputValue(selectedDate),
                  slot,
                  bookingWindowDays,
                  currentTime,
                );
                const reservation = findReservationAtSlot(
                  reservations,
                  court.id,
                  selectedDate,
                  slot,
                );
                const cellClassName =
                  "min-h-12 border-r border-t border-[#eee7db] p-1 text-center transition sm:min-h-20 sm:p-2";

                if (reservation) {
                  const reservationLines = getReservationDisplayLines(reservation);
                  const isLesson = isLessonReservation(reservation);
                  const reservedCellClassName = `${cellClassName} flex flex-col items-center justify-center ${
                    isLesson
                      ? "bg-[#f3b340] !text-black hover:bg-[#e7a530]"
                      : "bg-[#237000] text-white hover:bg-[#1f6500]"
                  }`;
                  const reservedCellContent = (
                    <div
                      className="grid w-full gap-0.5"
                      title={reservationLines.join(" / ")}
                    >
                      {reservationLines.map((line, index) => (
                        <p
                          className="truncate text-[11px] font-semibold leading-tight sm:text-sm"
                          key={`${line}-${index}`}
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  );

                  if (onEditReservation) {
                    return (
                      <button
                        className={`${reservedCellClassName} cursor-pointer`}
                        key={`${court.id}-${slot}`}
                        onClick={() => onEditReservation(reservation)}
                        type="button"
                      >
                        {reservedCellContent}
                      </button>
                    );
                  }

                  return (
                    <div
                      className={reservedCellClassName}
                      key={`${court.id}-${slot}`}
                    >
                      {reservedCellContent}
                    </div>
                  );
                }

                return (
                  <button
                    className={`${cellClassName} flex items-center justify-center ${
                      slotBookable && canCreateReservation
                        ? "cursor-pointer bg-[#f0f8ef] text-[#237000] hover:bg-[#e3f1df]"
                        : slotBookable
                          ? "cursor-not-allowed bg-[#f0f8ef] text-[#237000]"
                          : "cursor-not-allowed bg-white text-[#8b8f86]"
                    }`}
                    disabled={!slotBookable || !canCreateReservation}
                    key={`${court.id}-${slot}`}
                    onClick={() =>
                      onCreateReservation(court.id, selectedDate, slot)
                    }
                    type="button"
                  >
                    <span className="text-[12px] font-semibold sm:text-sm">
                      {slotBookable ? "Açık" : "Kapalı"}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}

function WeekCalendar({
  bookingWindowDays,
  currentTime,
  reservations,
  selectedDate,
  setCalendarView,
  setSelectedDate,
  timeSlots,
}: {
  bookingWindowDays: number;
  currentTime: Date;
  reservations: Reservation[];
  selectedDate: Date;
  setCalendarView: (view: CalendarView) => void;
  setSelectedDate: (date: Date) => void;
  timeSlots: string[];
}) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const weekdayLabels = days.map((day) => formatWeekdayTiny(day));

  return (
    <div className="rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-1">
      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((label, index) => (
          <div
            className="px-1 py-1 text-center text-[10px] font-semibold uppercase text-[#68756b] sm:text-xs"
            key={`${label}-${index}`}
          >
            {label}
          </div>
        ))}
      {days.map((day) => {
        const dayReservations = reservations.filter((reservation) =>
          isSameDay(new Date(reservation.starts_at), day),
        );
        const status = visibleDayAvailability(
          day,
          bookingWindowDays,
          currentTime,
          timeSlots,
        );

        return (
          <button
            className={`min-h-20 rounded border p-1 text-left transition sm:min-h-32 sm:p-2 ${
              status === "past"
                ? "border-[#eee7db] bg-[#f1eee5] text-[#8b8f86]"
                : status === "bookable"
                ? "border-[#9ec596] bg-[#f0f8ef] hover:bg-[#e3f1df]"
                : "border-[#ddd7c8] bg-[#fffdf8] hover:bg-[#f7f1e5]"
            }`}
            key={day.toISOString()}
            onClick={() => {
              setSelectedDate(day);
              setCalendarView("day");
            }}
            type="button"
          >
            <p className="text-center text-xs font-semibold sm:text-sm">
              {format(day, "d")}
            </p>
            <p className="mt-1 text-center text-[10px] text-[#68756b] sm:text-xs">
              {dayReservations.length > 0 ? `${dayReservations.length} rez.` : ""}
            </p>
          </button>
        );
      })}
      </div>
    </div>
  );
}

function MonthCalendar({
  bookingWindowDays,
  currentTime,
  reservations,
  selectedDate,
  setCalendarView,
  setSelectedDate,
  timeSlots,
}: {
  bookingWindowDays: number;
  currentTime: Date;
  reservations: Reservation[];
  selectedDate: Date;
  setCalendarView: (view: CalendarView) => void;
  setSelectedDate: (date: Date) => void;
  timeSlots: string[];
}) {
  const monthAnchor = startOfMonth(selectedDate);
  const days = buildMonthDays(monthAnchor);
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    formatWeekdayTiny(addDays(startOfWeek(monthAnchor, { weekStartsOn: 1 }), index)),
  );

  return (
    <div className="rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-1">
      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((label, index) => (
          <div
            className="px-1 py-1 text-center text-[10px] font-semibold uppercase text-[#68756b] sm:text-xs"
            key={`${label}-${index}`}
          >
            {label}
          </div>
        ))}
      {days.map((day) => {
        const count = reservations.filter((reservation) =>
          isSameDay(new Date(reservation.starts_at), day),
        ).length;
        const status = visibleDayAvailability(
          day,
          bookingWindowDays,
          currentTime,
          timeSlots,
        );
        const isMonthDay = isCurrentMonth(day, monthAnchor);

        return (
          <button
            className={`min-h-16 rounded border p-1 text-left transition sm:min-h-24 sm:p-2 ${
              status === "past" || !isMonthDay
                ? "border-[#eee7db] bg-[#f1eee5] text-[#8b8f86]"
                : status === "bookable"
                ? "border-[#9ec596] bg-[#f0f8ef] hover:bg-[#e3f1df]"
                : "border-[#ddd7c8] bg-[#fffdf8] hover:bg-[#f7f1e5]"
            }`}
            key={day.toISOString()}
            onClick={() => {
              setSelectedDate(day);
              setCalendarView("day");
            }}
            type="button"
          >
            <p className="text-center text-xs font-semibold sm:text-sm">
              {format(day, "d")}
            </p>
            <p className="mt-1 text-center text-[10px] text-[#68756b] sm:text-xs">
              {count > 0 ? `${count} rez.` : ""}
            </p>
          </button>
        );
      })}
      </div>
    </div>
  );
}

function ReservationsPanel({
  canManageAll,
  currentTime,
  onCancel,
  onEdit,
  onShowAllChange,
  reservations,
  showAll,
  userId,
}: {
  canManageAll: boolean;
  currentTime: Date;
  onCancel: (reservation: Reservation) => void;
  onEdit: (reservation: Reservation) => void;
  onShowAllChange: (value: boolean) => void;
  reservations: Reservation[];
  showAll: boolean;
  userId: string;
}) {
  const visibleReservations =
    canManageAll && showAll
      ? reservations
      : reservations.filter((reservation) => reservation.user_id === userId);
  const sorted = visibleReservations
    .filter((reservation) => isFutureReservation(reservation, currentTime))
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );

  if (sorted.length === 0) {
    return (
      <div className="space-y-3">
        {canManageAll ? (
          <ReservationListHeader
            onShowAllChange={onShowAllChange}
            showAll={showAll}
          />
        ) : null}
        <EmptyState
          title="Rezervasyon yok"
          text={
            canManageAll && showAll
              ? "Henüz oluşturulmuş rezervasyon bulunmuyor."
              : "Gelecek rezervasyonunuz bulunmuyor."
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canManageAll ? (
        <ReservationListHeader
          onShowAllChange={onShowAllChange}
          showAll={showAll}
        />
      ) : null}
      {sorted.map((reservation) => {
        const startsAt = new Date(reservation.starts_at);
        const reservationLines = getReservationDisplayLines(reservation);
        const isMine = reservation.user_id === userId;
        const isFuture = isFutureReservation(reservation, currentTime);
        const canCancel = isMine && isFuture && reservation.status === "confirmed";
        const canManageReservation = canManageAll && isFuture;

        return (
          <div
            className="flex items-center justify-between gap-3 rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-3 sm:p-4"
            key={reservation.id}
          >
            <div className="min-w-0">
              <div className="space-y-0.5">
                {reservationLines.map((line, index) => (
                  <p
                    className="truncate text-sm font-semibold sm:text-base"
                    key={`${line}-${index}`}
                  >
                    {line}
                  </p>
                ))}
              </div>
              <div className="mt-1 space-y-0.5 text-xs leading-5 text-[#68756b] sm:text-sm">
                <p className="truncate">
                  {reservation.courts?.name ?? "Kort"}
                </p>
                <p className="truncate">
                  {format(startsAt, "dd.MM.yyyy")} · {formatWeekdayLong(startsAt)}
                </p>
                <p className="truncate">
                  {formatTime(startsAt)} - {formatTime(new Date(reservation.ends_at))}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canManageReservation ? (
                <button
                  aria-label="Düzenle"
                  className="grid size-10 place-items-center rounded-md border border-[#cfc8b8] text-[#17211c] hover:bg-[#eee9dd]"
                  onClick={() => onEdit(reservation)}
                  title="Düzenle"
                  type="button"
                >
                  <Pencil size={16} />
                </button>
              ) : null}
              {canCancel ? (
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfc8b8] px-3 text-sm font-medium hover:bg-[#eee9dd]"
                  onClick={() => onCancel(reservation)}
                  type="button"
                >
                  İptal et
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReservationListHeader({
  onShowAllChange,
  showAll,
}: {
  onShowAllChange: (value: boolean) => void;
  showAll: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-3">
      <h2 className="text-lg font-semibold">Rezervasyonlar</h2>
      <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#34443a]">
        Tüm
        <input
          checked={showAll}
          className="size-4"
          onChange={(event) => onShowAllChange(event.target.checked)}
          type="checkbox"
        />
      </label>
    </div>
  );
}

function ProfilePanel({
  form,
  isRequired,
  isSaving,
  isSchemaReady,
  notificationPermission,
  onFormChange,
  onNotificationPreferenceChange,
  onSubmit,
  profile,
}: {
  form: { full_name: string; skill_level: SkillLevel };
  isRequired: boolean;
  isSaving: boolean;
  isSchemaReady: boolean;
  notificationPermission: NotificationPermissionState;
  onFormChange: (form: { full_name: string; skill_level: SkillLevel }) => void;
  onNotificationPreferenceChange: (enabled: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  profile: Profile;
}) {
  const notificationSchemaReady = Object.prototype.hasOwnProperty.call(
    profile,
    "notification_enabled",
  );

  return (
    <section className="rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-4 sm:p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[#e6f0e7] text-[#237000]">
          <UserIcon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-[#68756b]">{profile.email}</p>
          <h2 className="text-xl font-semibold">Profil</h2>
          {isRequired ? (
            <p className="mt-1 text-sm font-medium text-[#a0543b]">
              Devam etmek için ad soyad ve seviye girilmeli.
            </p>
          ) : null}
          {!isSchemaReady ? (
            <p className="mt-1 text-sm font-medium text-[#a0543b]">
              {"Profil SQL'i Supabase'de çalıştırılınca aktifleşecek."}
            </p>
          ) : null}
        </div>
      </div>

      <form className="grid gap-4 sm:max-w-lg" onSubmit={onSubmit}>
        <Field label="Ad soyad">
          <input
            className="input"
            disabled={!isSchemaReady}
            minLength={3}
            onChange={(event) =>
              onFormChange({ ...form, full_name: event.target.value })
            }
            placeholder="Ad Soyad"
            required
            value={form.full_name}
          />
        </Field>

        <Field label="Seviye">
          <select
            className="input"
            disabled={!isSchemaReady}
            onChange={(event) =>
              onFormChange({
                ...form,
                skill_level: event.target.value as SkillLevel,
              })
            }
            required
            value={form.skill_level}
          >
            {skillLevels.map((level) => (
              <option key={level} value={level}>
                {skillLevelLabels[level]}
              </option>
            ))}
          </select>
        </Field>

        <button
          className="primary-button"
          disabled={isSaving || !isSchemaReady}
          type="submit"
        >
          Profili kaydet
        </button>
      </form>

      <div className="mt-5 rounded-md border border-[#eee7db] bg-white p-3 sm:max-w-lg">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-semibold">Notificationlar</span>
            <span className="mt-1 block text-xs leading-5 text-[#68756b]">
              Admin duyuruları için tarayıcı bildirimi.
            </span>
          </span>
          <input
            checked={Boolean(profile.notification_enabled)}
            className="size-5"
            disabled={isSaving || !notificationSchemaReady}
            onChange={(event) =>
              onNotificationPreferenceChange(event.target.checked)
            }
            type="checkbox"
          />
        </label>
        {!notificationSchemaReady ? (
          <p className="mt-2 text-xs font-medium text-[#a0543b]">
            {"Notification SQL'i Supabase'de çalıştırılınca aktifleşecek."}
          </p>
        ) : null}
        {notificationSchemaReady && notificationPermission === "denied" ? (
          <p className="mt-2 text-xs font-medium text-[#a0543b]">
            Tarayıcı izni kapalı. Açmak için telefon veya tarayıcı ayarlarından
            izin vermek gerekiyor.
          </p>
        ) : null}
        {notificationSchemaReady && notificationPermission === "unsupported" ? (
          <p className="mt-2 text-xs font-medium text-[#a0543b]">
            Bu tarayıcı notification desteklemiyor.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function AdminPanel({
  adminNotifications,
  courts,
  currentProfile,
  isSaving,
  members,
  newCourtName,
  onAddCourt,
  onCancelNotification,
  onCourtChange,
  onDeleteCourt,
  onMemberUpdate,
  onNewCourtNameChange,
  onSaveNotification,
  onSaveCourt,
  onSaveSettings,
  onSettingsDraftChange,
  settingsDraft,
}: {
  adminNotifications: AppNotification[];
  courts: Court[];
  currentProfile: Profile;
  isSaving: boolean;
  members: Profile[];
  newCourtName: string;
  onAddCourt: (event: FormEvent<HTMLFormElement>) => void;
  onCancelNotification: (notification: AppNotification) => void;
  onCourtChange: (courtId: string, fields: Partial<Court>) => void;
  onDeleteCourt: (court: Court) => void;
  onMemberUpdate: (memberId: string, fields: Partial<Profile>) => void;
  onNewCourtNameChange: (value: string) => void;
  onSaveNotification: (payload: AdminNotificationPayload) => Promise<boolean>;
  onSaveCourt: (courtId: string) => void;
  onSaveSettings: (event: FormEvent<HTMLFormElement>) => void;
  onSettingsDraftChange: (settings: ClubSettings) => void;
  settingsDraft: ClubSettings;
}) {
  const canManageRoles = currentProfile.app_role === "super_admin";
  const [memberFiltersOpen, setMemberFiltersOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AppRole | "all">("all");
  const [skillFilter, setSkillFilter] = useState<SkillLevel | "all">("all");
  const [trainerFilter, setTrainerFilter] = useState<"all" | "yes" | "no">(
    "all",
  );
  const [bookingFilter, setBookingFilter] = useState<"all" | "yes" | "no">(
    "all",
  );
  const normalizedMemberSearch = normalizeFullName(memberSearch).toLocaleLowerCase(
    "tr-TR",
  );
  const visibleMembers = members.filter((member) => {
    const matchesSearch =
      !normalizedMemberSearch ||
      `${member.full_name ?? ""} ${member.email}`
        .toLocaleLowerCase("tr-TR")
        .includes(normalizedMemberSearch);
    const matchesRole = roleFilter === "all" || member.app_role === roleFilter;
    const matchesSkill =
      skillFilter === "all" ||
      (member.skill_level ?? "beginner") === skillFilter;
    const matchesTrainer =
      trainerFilter === "all" ||
      Boolean(member.is_trainer) === (trainerFilter === "yes");
    const matchesBooking =
      bookingFilter === "all" ||
      Boolean(member.can_book) === (bookingFilter === "yes");

    return (
      matchesSearch &&
      matchesRole &&
      matchesSkill &&
      matchesTrainer &&
      matchesBooking
    );
  });
  const activeMemberFilterCount =
    Number(Boolean(normalizedMemberSearch)) +
    Number(roleFilter !== "all") +
    Number(skillFilter !== "all") +
    Number(trainerFilter !== "all") +
    Number(bookingFilter !== "all");
  const hasMemberFilters = activeMemberFilterCount > 0;
  const [notificationDraft, setNotificationDraft] = useState(
    defaultNotificationDraft,
  );
  const scheduledNotifications = adminNotifications.filter((notification) => {
    if (notification.status !== "active") {
      return false;
    }

    if (notification.schedule_type === "recurring") {
      return true;
    }

    return (
      notification.schedule_type === "scheduled" &&
      new Date(notification.starts_at) > new Date()
    );
  });

  async function submitNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const didSave = await onSaveNotification(
      notificationDraftToPayload(notificationDraft),
    );

    if (didSave) {
      setNotificationDraft(defaultNotificationDraft());
    }
  }

  return (
    <div className="space-y-6">
      <AdminFoldout icon={<ShieldCheck size={20} />} title="Kulüp ayarları">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSaveSettings}>
          <Field label="Açılış saati">
            <input
              className="input"
              onChange={(event) =>
                onSettingsDraftChange({
                  ...settingsDraft,
                  opening_time: event.target.value,
                })
              }
              type="time"
              value={normalizeTime(settingsDraft.opening_time)}
            />
          </Field>
          <Field label="Kapanış saati">
            <input
              className="input"
              onChange={(event) =>
                onSettingsDraftChange({
                  ...settingsDraft,
                  closing_time: event.target.value,
                })
              }
              type="time"
              value={normalizeTime(settingsDraft.closing_time)}
            />
          </Field>
          <Field label="Rezervasyon süresi">
            <select
              className="input"
              onChange={(event) =>
                onSettingsDraftChange({
                  ...settingsDraft,
                  reservation_slot_minutes: Number(event.target.value),
                })
              }
              value={settingsDraft.reservation_slot_minutes}
            >
              {[30, 45, 60, 90, 120].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} dakika
                </option>
              ))}
            </select>
          </Field>
          <Field label="Aktif rezervasyon limiti">
            <input
              className="input"
              min={1}
              onChange={(event) =>
                onSettingsDraftChange({
                  ...settingsDraft,
                  max_active_reservations: Number(event.target.value),
                })
              }
              type="number"
              value={settingsDraft.max_active_reservations}
            />
          </Field>
          <Field label="App üyesi rezervasyon penceresi">
            <input
              className="input"
              min={0}
              onChange={(event) =>
                onSettingsDraftChange({
                  ...settingsDraft,
                  default_booking_days_ahead: Number(event.target.value),
                })
              }
              type="number"
              value={settingsDraft.default_booking_days_ahead}
            />
          </Field>
          <Field label="Kulüp üyesi rezervasyon penceresi">
            <input
              className="input"
              min={0}
              onChange={(event) =>
                onSettingsDraftChange({
                  ...settingsDraft,
                  club_member_booking_days_ahead: Number(event.target.value),
                })
              }
              type="number"
              value={settingsDraft.club_member_booking_days_ahead}
            />
          </Field>
          <Field label="İptal son süresi">
            <input
              className="input"
              min={0}
              onChange={(event) =>
                onSettingsDraftChange({
                  ...settingsDraft,
                  cancellation_deadline_hours: Number(event.target.value),
                })
              }
              type="number"
              value={settingsDraft.cancellation_deadline_hours}
            />
          </Field>

          <div className="md:col-span-2">
            <button className="primary-button" disabled={isSaving} type="submit">
              Ayarları kaydet
            </button>
          </div>
        </form>
      </AdminFoldout>

      <AdminFoldout icon={<Bell size={20} />} title="Notification">
        <form className="grid gap-4" onSubmit={submitNotification}>
          <Field label="Notification metni">
            <textarea
              className="input min-h-24 resize-y py-3"
              onChange={(event) =>
                setNotificationDraft({
                  ...notificationDraft,
                  message: event.target.value,
                })
              }
              placeholder="Kullanıcılara gönderilecek metin"
              required
              value={notificationDraft.message}
            />
          </Field>

          <div className="grid grid-cols-3 rounded-md border border-[#cfc8b8] bg-white p-1">
            {(Object.keys(notificationScheduleTypeLabels) as NotificationScheduleType[]).map(
              (scheduleType) => (
                <button
                  className={`h-10 rounded px-2 text-sm font-semibold ${
                    notificationDraft.schedule_type === scheduleType
                      ? "bg-[#237000] text-white"
                      : "text-[#546257] hover:bg-[#eee9dd]"
                  }`}
                  key={scheduleType}
                  onClick={() =>
                    setNotificationDraft({
                      ...notificationDraft,
                      schedule_type: scheduleType,
                    })
                  }
                  type="button"
                >
                  {notificationScheduleTypeLabels[scheduleType]}
                </button>
              ),
            )}
          </div>

          {notificationDraft.schedule_type !== "instant" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label={
                  notificationDraft.schedule_type === "recurring"
                    ? "Başlangıç tarihi"
                    : "Gönderim tarihi"
                }
              >
                <input
                  className="input"
                  onChange={(event) =>
                    setNotificationDraft({
                      ...notificationDraft,
                      starts_date: event.target.value,
                    })
                  }
                  required
                  type="date"
                  value={notificationDraft.starts_date}
                />
              </Field>
              <Field
                label={
                  notificationDraft.schedule_type === "recurring"
                    ? "Başlangıç saati"
                    : "Gönderim saati"
                }
              >
                <input
                  className="input"
                  onChange={(event) =>
                    setNotificationDraft({
                      ...notificationDraft,
                      starts_time: event.target.value,
                    })
                  }
                  required
                  type="time"
                  value={notificationDraft.starts_time}
                />
              </Field>
            </div>
          ) : null}

          {notificationDraft.schedule_type === "recurring" ? (
            <div className="grid gap-3 rounded-md border border-[#eee7db] bg-white p-3 md:grid-cols-2">
              <Field label="Aralık">
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <input
                    className="input"
                    min={1}
                    onChange={(event) =>
                      setNotificationDraft({
                        ...notificationDraft,
                        interval_count: Number(event.target.value),
                      })
                    }
                    required
                    type="number"
                    value={notificationDraft.interval_count}
                  />
                  <select
                    className="input"
                    onChange={(event) =>
                      setNotificationDraft({
                        ...notificationDraft,
                        interval_unit:
                          event.target.value as NotificationIntervalUnit,
                      })
                    }
                    value={notificationDraft.interval_unit}
                  >
                    {(Object.keys(notificationIntervalUnitLabels) as NotificationIntervalUnit[]).map(
                      (unit) => (
                        <option key={unit} value={unit}>
                          {notificationIntervalUnitLabels[unit]}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Bitiş tarihi">
                  <input
                    className="input"
                    onChange={(event) =>
                      setNotificationDraft({
                        ...notificationDraft,
                        expires_date: event.target.value,
                      })
                    }
                    type="date"
                    value={notificationDraft.expires_date}
                  />
                </Field>
                <Field label="Bitiş saati">
                  <input
                    className="input"
                    disabled={!notificationDraft.expires_date}
                    onChange={(event) =>
                      setNotificationDraft({
                        ...notificationDraft,
                        expires_time: event.target.value,
                      })
                    }
                    type="time"
                    value={notificationDraft.expires_time}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              className="primary-button inline-flex items-center gap-2"
              disabled={isSaving}
              type="submit"
            >
              <Send size={16} />
              Send
            </button>
            {notificationDraft.id ? (
              <button
                className="secondary-button"
                onClick={() => setNotificationDraft(defaultNotificationDraft())}
                type="button"
              >
                Vazgeç
              </button>
            ) : null}
          </div>
        </form>

        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#34443a]">
            <CalendarClock size={17} />
            Zamanlı / sürekli notificationlar
          </div>

          {scheduledNotifications.length === 0 ? (
            <div className="rounded-md border border-[#eee7db] bg-white p-3 text-sm text-[#68756b]">
              Aktif zamanlı veya sürekli notification yok.
            </div>
          ) : (
            <div className="grid gap-2">
              {scheduledNotifications.map((notification) => (
                <div
                  className="flex items-start justify-between gap-3 rounded-md border border-[#eee7db] bg-white p-3"
                  key={notification.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#68756b]">
                      <span>{notificationScheduleTypeLabels[notification.schedule_type]}</span>
                      <span>{formatNotificationDate(notification.starts_at)}</span>
                      {notification.schedule_type === "recurring" ? (
                        <span>
                          Her {formatNotificationInterval(notification.interval_minutes)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm font-medium leading-5">
                      {notification.message}
                    </p>
                    {notification.expires_at &&
                    notification.schedule_type === "recurring" ? (
                      <p className="mt-1 text-xs text-[#68756b]">
                        Bitiş: {formatNotificationDate(notification.expires_at)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      aria-label="Düzenle"
                      className="grid size-9 place-items-center rounded-md border border-[#cfc8b8] hover:bg-[#eee9dd]"
                      onClick={() =>
                        setNotificationDraft(draftFromNotification(notification))
                      }
                      title="Düzenle"
                      type="button"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="h-9 rounded-md border border-[#a0543b] px-3 text-sm font-semibold text-[#a0543b] hover:bg-[#f7ece7]"
                      onClick={() => onCancelNotification(notification)}
                      type="button"
                    >
                      İptal
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AdminFoldout>

      <AdminFoldout icon={<CalendarDays size={20} />} title="Kortlar">
        <form className="mb-4 flex flex-col gap-2 sm:flex-row" onSubmit={onAddCourt}>
          <input
            className="input"
            onChange={(event) => onNewCourtNameChange(event.target.value)}
            placeholder="Yeni kort adı"
            value={newCourtName}
          />
          <button className="primary-button sm:w-36" type="submit">
            Kort ekle
          </button>
        </form>

        <div className="space-y-3">
          {courts.map((court) => (
            <div
              className={`grid gap-3 rounded-md border border-[#eee7db] bg-white p-3 ${
                canManageRoles
                  ? "md:grid-cols-[1fr_110px_120px_96px_80px]"
                  : "md:grid-cols-[1fr_110px_120px_96px]"
              }`}
              key={court.id}
            >
              <input
                className="input"
                onChange={(event) =>
                  onCourtChange(court.id, { name: event.target.value })
                }
                value={court.name}
              />
              <input
                className="input"
                min={1}
                onChange={(event) =>
                  onCourtChange(court.id, {
                    display_order: Number(event.target.value),
                  })
                }
                type="number"
                value={court.display_order}
              />
              <label className="flex h-11 items-center gap-2 rounded-md border border-[#cfc8b8] px-3 text-sm">
                <input
                  checked={court.is_active}
                  onChange={(event) =>
                    onCourtChange(court.id, { is_active: event.target.checked })
                  }
                  type="checkbox"
                />
                Aktif
              </label>
              <button
                className="secondary-button"
                onClick={() => onSaveCourt(court.id)}
                type="button"
              >
                Kaydet
              </button>
              {canManageRoles ? (
                <button
                  className="secondary-button border-[#a0543b] text-[#a0543b]"
                  onClick={() => onDeleteCourt(court)}
                  type="button"
                >
                  Sil
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </AdminFoldout>

      <AdminFoldout icon={<Users size={20} />} title="Üyeler">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[#68756b]">
            {visibleMembers.length} / {members.length} üye
          </div>
          <button
            aria-expanded={memberFiltersOpen}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold ${
              memberFiltersOpen || hasMemberFilters
                ? "border-[#237000] bg-[#eff7ec] text-[#237000]"
                : "border-[#ddd7c8] bg-white text-[#31382f]"
            }`}
            onClick={() => setMemberFiltersOpen((isOpen) => !isOpen)}
            type="button"
          >
            <SlidersHorizontal size={17} />
            Filtreler
            {hasMemberFilters ? (
              <span className="rounded-full bg-[#237000] px-2 py-0.5 text-xs text-white">
                {activeMemberFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        {memberFiltersOpen ? (
          <div className="mb-4 grid gap-3 rounded-md border border-[#eee7db] bg-white p-3 md:grid-cols-5">
            <input
              className="input input-compact md:col-span-2"
              onChange={(event) => setMemberSearch(event.target.value)}
              placeholder="İsim veya e-posta ara"
              value={memberSearch}
            />
            <select
              className="input input-compact"
              onChange={(event) =>
                setTrainerFilter(event.target.value as "all" | "yes" | "no")
              }
              value={trainerFilter}
            >
              <option value="all">Tüm hocalar</option>
              <option value="yes">Sadece eğitmen</option>
              <option value="no">Eğitmen değil</option>
            </select>
            <select
              className="input input-compact"
              onChange={(event) =>
                setBookingFilter(event.target.value as "all" | "yes" | "no")
              }
              value={bookingFilter}
            >
              <option value="all">Tüm yetkiler</option>
              <option value="yes">Rez. yetkili</option>
              <option value="no">Yetkisiz</option>
            </select>
            <select
              className="input input-compact"
              onChange={(event) =>
                setRoleFilter(event.target.value as AppRole | "all")
              }
              value={roleFilter}
            >
              <option value="all">Tüm roller</option>
              {(Object.keys(roleLabels) as AppRole[]).map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
            <select
              className="input input-compact md:col-start-5"
              onChange={(event) =>
                setSkillFilter(event.target.value as SkillLevel | "all")
              }
              value={skillFilter}
            >
              <option value="all">Tüm seviyeler</option>
              {skillLevels.map((level) => (
                <option key={level} value={level}>
                  {skillLevelLabels[level]}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-[1160px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#e6dfd2] text-left text-[#68756b]">
                <th className="py-3 pr-3 font-medium">Ad soyad</th>
                <th className="py-3 pr-3 font-medium">E-posta</th>
                <th className="py-3 pr-3 font-medium">Seviye</th>
                <th className="py-3 pr-3 font-medium">Kulüp üyesi</th>
                <th className="py-3 pr-3 font-medium">Rez. yetkisi</th>
                <th className="py-3 pr-3 font-medium">Eğitmen</th>
                <th className="py-3 pr-3 font-medium">Gün limiti</th>
                {canManageRoles ? (
                  <th className="py-3 pr-3 font-medium">Rol</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((member) => {
                const canEditMember =
                  canManageRoles || member.app_role !== "super_admin";

                return (
                  <tr className="border-b border-[#eee7db]" key={member.id}>
                    <td className="py-3 pr-3">
                      <input
                        className="input min-w-44"
                        defaultValue={member.full_name ?? ""}
                        disabled={!canEditMember}
                        onBlur={(event) =>
                          onMemberUpdate(member.id, {
                            full_name:
                              normalizeFullName(event.target.value) || null,
                          })
                        }
                        placeholder="İsim yok"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <div className="font-medium">{member.email}</div>
                      <div className="text-xs text-[#68756b]">
                        {roleLabels[member.app_role]}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <select
                        className="input min-w-36"
                        defaultValue={member.skill_level ?? "beginner"}
                        disabled={!canEditMember}
                        onChange={(event) =>
                          onMemberUpdate(member.id, {
                            skill_level: event.target.value as SkillLevel,
                          })
                        }
                      >
                        {skillLevels.map((level) => (
                          <option key={level} value={level}>
                            {skillLevelLabels[level]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        checked={member.is_club_member}
                        disabled={!canEditMember}
                        onChange={(event) =>
                          onMemberUpdate(member.id, {
                            is_club_member: event.target.checked,
                          })
                        }
                        type="checkbox"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        checked={Boolean(member.can_book)}
                        disabled={!canEditMember}
                        onChange={(event) =>
                          onMemberUpdate(member.id, {
                            can_book: event.target.checked,
                          })
                        }
                        type="checkbox"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        checked={Boolean(member.is_trainer)}
                        disabled={!canEditMember}
                        onChange={(event) =>
                          onMemberUpdate(member.id, {
                            is_trainer: event.target.checked,
                          })
                        }
                        type="checkbox"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        className="input max-w-28"
                        defaultValue={member.reservation_days_ahead ?? ""}
                        disabled={!canEditMember}
                        min={0}
                        onBlur={(event) =>
                          onMemberUpdate(member.id, {
                            reservation_days_ahead: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                        placeholder="Varsayılan"
                        type="number"
                      />
                    </td>
                    {canManageRoles ? (
                      <td className="py-3 pr-3">
                        <select
                          className="input max-w-40"
                          onChange={(event) =>
                            onMemberUpdate(member.id, {
                              app_role: event.target.value as AppRole,
                            })
                          }
                          value={member.app_role}
                        >
                          {(Object.keys(roleLabels) as AppRole[]).map((role) => (
                            <option key={role} value={role}>
                              {roleLabels[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AdminFoldout>
    </div>
  );
}

function AdminFoldout({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <details className="group rounded-md border border-[#ddd7c8] bg-[#fffdf8]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
        <ChevronRight className="transition group-open:rotate-90" size={18} />
      </summary>
      <div className="border-t border-[#eee7db] p-4">{children}</div>
    </details>
  );
}

function MatchSetupFields<T extends ReservationFormState>({
  form,
  listId,
  ownerOptions,
  setForm,
}: {
  form: T;
  listId: string;
  ownerOptions: Profile[];
  setForm: (form: T) => void;
}) {
  const playerOptions = Array.from(
    new Set(
      ownerOptions
        .map((owner) => profileOptionLabel(owner))
        .filter((name) => name !== "İsim yok"),
    ),
  );

  function setMatchType(matchType: MatchType) {
    setForm({
      ...form,
      match_type: matchType,
      team1_player2_name:
        matchType === "singles" ? "" : form.team1_player2_name,
      team2_player2_name:
        matchType === "singles" ? "" : form.team2_player2_name,
    });
  }

  function setPlayerName(key: MatchPlayerKey, value: string) {
    setForm({ ...form, [key]: value });
  }

  function renderPlayerRow(label: string, key: MatchPlayerKey) {
    return (
      <div
        className="grid grid-cols-[72px_minmax(0,1fr)_72px] items-center gap-2"
        key={key}
      >
        <span className="text-xs font-semibold text-[#34443a]">{label}</span>
        <input
          className="input input-compact"
          list={listId}
          onChange={(event) => setPlayerName(key, event.target.value)}
          placeholder="İsim yaz"
          value={form[key]}
        />
        <select
          aria-label={`${label} seç`}
          className="h-9 rounded-md border border-[#cfc8b8] bg-white px-2 text-xs font-semibold text-[#34443a]"
          onChange={(event) => setPlayerName(key, event.target.value)}
          value=""
        >
          <option value="">Seç</option>
          {playerOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border border-[#e6dfd2] bg-[#f6f1e7] p-2.5">
      <div className="grid grid-cols-2 rounded-md border border-[#cfc8b8] bg-white p-1">
        {(Object.keys(matchTypeLabels) as MatchType[]).map((matchType) => (
          <button
            className={`h-9 rounded px-2 text-sm font-semibold ${
              form.match_type === matchType
                ? "bg-[#237000] text-white"
                : "text-[#546257] hover:bg-[#eee9dd]"
            }`}
            key={matchType}
            onClick={() => setMatchType(matchType)}
            type="button"
          >
            {matchTypeLabels[matchType]}
          </button>
        ))}
      </div>

      <datalist id={listId}>
        {playerOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {form.match_type === "singles" ? (
        <div className="grid gap-2">
          {renderPlayerRow("Oyuncu", "team1_player1_name")}
          {renderPlayerRow("Rakip", "team2_player1_name")}
        </div>
      ) : (
        <div className="grid gap-2">
          {renderPlayerRow("Takım 1", "team1_player1_name")}
          {renderPlayerRow("Eşi", "team1_player2_name")}
          {renderPlayerRow("Takım 2", "team2_player1_name")}
          {renderPlayerRow("Eşi", "team2_player2_name")}
        </div>
      )}
    </div>
  );
}

function LessonSetupFields<T extends ReservationFormState>({
  form,
  listId,
  ownerOptions,
  setForm,
}: {
  form: T;
  listId: string;
  ownerOptions: Profile[];
  setForm: (form: T) => void;
}) {
  const playerOptions = Array.from(
    new Set(
      ownerOptions
        .map((owner) => profileOptionLabel(owner))
        .filter((name) => name !== "İsim yok"),
    ),
  );

  return (
    <div className="grid gap-2 rounded-md border border-[#e6dfd2] bg-[#fff8df] p-2.5">
      <datalist id={listId}>
        {playerOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="grid grid-cols-[72px_minmax(0,1fr)_72px] items-center gap-2">
        <span className="text-xs font-semibold text-[#34443a]">Öğrenci</span>
        <input
          className="input input-compact"
          list={listId}
          onChange={(event) =>
            setForm({ ...form, student_name: event.target.value })
          }
          placeholder="Öğrenci adı"
          value={form.student_name}
        />
        <select
          aria-label="Öğrenci seç"
          className="h-9 rounded-md border border-[#cfc8b8] bg-white px-2 text-xs font-semibold text-[#34443a]"
          onChange={(event) =>
            setForm({ ...form, student_name: event.target.value })
          }
          value=""
        >
          <option value="">Seç</option>
          {playerOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function NotificationOptInDialog({
  isSaving,
  onClose,
  onEnable,
}: {
  isSaving: boolean;
  onClose: () => void;
  onEnable: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-0 sm:items-center sm:justify-center sm:p-6">
      <section className="w-full rounded-t-lg bg-[#fffdf8] p-4 shadow-xl sm:max-w-md sm:rounded-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[#e6f0e7] text-[#237000]">
              <Bell size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[#68756b]">Notificationlar</p>
              <h2 className="text-xl font-semibold">Duyuruları aç</h2>
            </div>
          </div>
          <button
            aria-label="Kapat"
            className="grid size-10 shrink-0 place-items-center rounded-md border border-[#cfc8b8] hover:bg-[#eee9dd]"
            onClick={onClose}
            title="Kapat"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm leading-6 text-[#546257]">
          Kulüp duyurularını ve önemli bilgilendirmeleri almak için
          notificationları açabilirsiniz.
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            className="secondary-button"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Şimdilik hayır
          </button>
          <button
            className="primary-button"
            disabled={isSaving}
            onClick={onEnable}
            type="button"
          >
            Aç
          </button>
        </div>
      </section>
    </div>
  );
}

function ReservationDialog({
  activeCourts,
  bookingWindowDays,
  canMarkLesson,
  canChooseOwner,
  currentTime,
  form,
  isSaving,
  onClose,
  ownerOptions,
  onSubmit,
  setForm,
  settings,
  timeSlots,
}: {
  activeCourts: Court[];
  bookingWindowDays: number;
  canMarkLesson: boolean;
  canChooseOwner: boolean;
  currentTime: Date;
  form: ReservationFormState;
  isSaving: boolean;
  onClose: () => void;
  ownerOptions: Profile[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setForm: (form: ReservationFormState) => void;
  settings: ClubSettings;
  timeSlots: string[];
}) {
  const selectedStart = buildLocalDateTime(form.date, form.start_time);
  const selectedEnd = addSlotDuration(selectedStart, settings);
  const selectedSlotBookable = isBookableStart(
    form.date,
    form.start_time,
    bookingWindowDays,
    currentTime,
  );
  const canUseLesson = canUseLessonForSelectedOwner(
    form,
    ownerOptions,
    canChooseOwner,
    canMarkLesson,
  );
  const maxBookingDate = dateInputValue(addDays(currentTime, bookingWindowDays));
  const minBookingDate = dateInputValue(currentTime);

  function handleDateChange(dateValue: string) {
    setForm({
      ...form,
      date: dateValue,
      start_time:
        firstBookableSlot(
          dateValue,
          timeSlots,
          bookingWindowDays,
          currentTime,
        ) ??
        timeSlots[0] ??
        form.start_time,
    });
  }

  function handleOwnerChange(ownerId: string) {
    const currentOwnerName =
      ownerOptions.find((owner) => owner.id === form.user_id)?.full_name ?? "";
    const nextOwnerName =
      ownerOptions.find((owner) => owner.id === ownerId)?.full_name ?? "";
    const firstPlayer = normalizePlayerName(form.team1_player1_name);
    const shouldReplaceFirstPlayer =
      !firstPlayer ||
      (currentOwnerName && firstPlayer === normalizePlayerName(currentOwnerName));

    setForm({
      ...form,
      user_id: ownerId,
      team1_player1_name: shouldReplaceFirstPlayer
        ? nextOwnerName
        : form.team1_player1_name,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-0 sm:items-center sm:justify-center sm:p-6">
      <section className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-[#fffdf8] p-4 shadow-xl sm:max-w-xl sm:rounded-lg">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-[#68756b]">Yeni rezervasyon</p>
            <h2 className="text-xl font-semibold">Kort ve saat seç</h2>
          </div>
          <button
            className="grid size-10 place-items-center rounded-md border border-[#cfc8b8] hover:bg-[#eee9dd]"
            onClick={onClose}
            title="Kapat"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <form className="grid gap-3" onSubmit={onSubmit}>
          {canChooseOwner ? (
            <div className="grid gap-2 rounded-md border border-[#e6dfd2] bg-[#f6f1e7] p-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[#34443a]">
                  Rezervasyon Bilgisi
                </span>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#34443a]">
                  Özel
                  <input
                    checked={form.is_custom}
                    className="size-4"
                    onChange={(event) =>
                      setForm({ ...form, is_custom: event.target.checked })
                    }
                    type="checkbox"
                  />
                </label>
              </div>
              {form.is_custom ? (
                <input
                  className="input input-compact"
                  onChange={(event) =>
                    setForm({ ...form, custom_info: event.target.value })
                  }
                  placeholder="Örn. Turnuva, antrenman, misafir"
                  required
                  value={form.custom_info}
                />
              ) : (
                <>
                  <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-2">
                    <span className="text-xs font-semibold text-[#34443a]">
                      Bağlı üye
                    </span>
                    <select
                      className="input input-compact"
                      onChange={(event) => handleOwnerChange(event.target.value)}
                      required
                      value={form.user_id}
                    >
                      {ownerOptions.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {profileOptionLabel(owner)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {canUseLesson ? (
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#34443a]">
                      Ders
                      <input
                        checked={form.is_lesson}
                        className="size-4"
                        onChange={(event) =>
                          setForm({ ...form, is_lesson: event.target.checked })
                        }
                        type="checkbox"
                      />
                    </label>
                  ) : null}
                  {canUseLesson && form.is_lesson ? (
                    <LessonSetupFields
                      form={form}
                      listId="reservation-student-options"
                      ownerOptions={ownerOptions}
                      setForm={setForm}
                    />
                  ) : (
                    <MatchSetupFields
                      form={form}
                      listId="reservation-player-options"
                      ownerOptions={ownerOptions}
                      setForm={setForm}
                    />
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              {canUseLesson ? (
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#34443a]">
                  Ders
                  <input
                    checked={form.is_lesson}
                    className="size-4"
                    onChange={(event) =>
                      setForm({ ...form, is_lesson: event.target.checked })
                    }
                    type="checkbox"
                  />
                </label>
              ) : null}
              {canUseLesson && form.is_lesson ? (
                <LessonSetupFields
                  form={form}
                  listId="reservation-student-options"
                  ownerOptions={ownerOptions}
                  setForm={setForm}
                />
              ) : (
                <MatchSetupFields
                  form={form}
                  listId="reservation-player-options"
                  ownerOptions={ownerOptions}
                  setForm={setForm}
                />
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Kort">
              <select
                className="input"
                onChange={(event) =>
                  setForm({ ...form, court_id: event.target.value })
                }
                required
                value={form.court_id}
              >
                {activeCourts.map((court) => (
                  <option key={court.id} value={court.id}>
                    {court.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Tarih">
              <input
                className="input"
                max={maxBookingDate}
                min={minBookingDate}
                onChange={(event) => handleDateChange(event.target.value)}
                required
                type="date"
                value={form.date}
              />
            </Field>

            <Field label="Başlangıç saati">
              <select
                className="input"
                onChange={(event) =>
                  setForm({ ...form, start_time: event.target.value })
                }
                required
                value={form.start_time}
              >
                {timeSlots.map((slot) => {
                  const optionBookable = isBookableStart(
                    form.date,
                    slot,
                    bookingWindowDays,
                    currentTime,
                  );

                  return (
                    <option disabled={!optionBookable} key={slot} value={slot}>
                      {slot}
                      {optionBookable ? "" : " - uygun değil"}
                    </option>
                  );
                })}
              </select>
            </Field>
          </div>

          <div className="rounded-md border border-[#e6dfd2] bg-[#f6f1e7] p-2.5 text-xs text-[#546257] sm:text-sm">
            Seçilen aralık: {formatDateTitle(parseDateInput(form.date))},{" "}
            {formatTime(selectedStart)} - {formatTime(selectedEnd)}
            {!selectedSlotBookable ? (
              <span className="mt-2 block font-medium text-[#a0543b]">
                Bu saat için rezervasyon yapılamaz.
              </span>
            ) : null}
          </div>

          <button
            className="primary-button"
            disabled={isSaving || !selectedSlotBookable}
            type="submit"
          >
            Rezervasyonu kaydet
          </button>
        </form>
      </section>
    </div>
  );
}

function ReservationEditDialog({
  activeCourts,
  bookingWindowDays,
  canMarkLesson,
  currentTime,
  form,
  isSaving,
  onClose,
  onDelete,
  ownerOptions,
  onSubmit,
  setForm,
  settings,
  timeSlots,
}: {
  activeCourts: Court[];
  bookingWindowDays: number;
  canMarkLesson: boolean;
  currentTime: Date;
  form: ReservationEditFormState;
  isSaving: boolean;
  onClose: () => void;
  onDelete: () => void;
  ownerOptions: Profile[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setForm: (form: ReservationEditFormState) => void;
  settings: ClubSettings;
  timeSlots: string[];
}) {
  const selectedStart = buildLocalDateTime(form.date, form.start_time);
  const selectedEnd = addSlotDuration(selectedStart, settings);
  const selectedSlotBookable =
    form.status === "canceled" ||
    isBookableStart(
      form.date,
      form.start_time,
      bookingWindowDays,
      currentTime,
    );
  const canUseLesson = canUseLessonForSelectedOwner(
    form,
    ownerOptions,
    true,
    canMarkLesson,
  );

  function handleDateChange(dateValue: string) {
    setForm({
      ...form,
      date: dateValue,
      start_time:
        firstBookableSlot(
          dateValue,
          timeSlots,
          bookingWindowDays,
          currentTime,
        ) ??
        timeSlots[0] ??
        form.start_time,
    });
  }

  function handleOwnerChange(ownerId: string) {
    const currentOwnerName =
      ownerOptions.find((owner) => owner.id === form.user_id)?.full_name ?? "";
    const nextOwnerName =
      ownerOptions.find((owner) => owner.id === ownerId)?.full_name ?? "";
    const firstPlayer = normalizePlayerName(form.team1_player1_name);
    const shouldReplaceFirstPlayer =
      !firstPlayer ||
      (currentOwnerName && firstPlayer === normalizePlayerName(currentOwnerName));

    setForm({
      ...form,
      user_id: ownerId,
      team1_player1_name: shouldReplaceFirstPlayer
        ? nextOwnerName
        : form.team1_player1_name,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-0 sm:items-center sm:justify-center sm:p-6">
      <section className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-[#fffdf8] p-4 shadow-xl sm:max-w-xl sm:rounded-lg">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-[#68756b]">Admin düzenleme</p>
            <h2 className="text-xl font-semibold">Rezervasyonu düzenle</h2>
          </div>
          <button
            className="grid size-10 place-items-center rounded-md border border-[#cfc8b8] hover:bg-[#eee9dd]"
            onClick={onClose}
            title="Kapat"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <form className="grid gap-3" onSubmit={onSubmit}>
          <div className="grid gap-2 rounded-md border border-[#e6dfd2] bg-[#f6f1e7] p-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-[#34443a]">
                Rezervasyon Bilgisi
              </span>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#34443a]">
                Özel
                <input
                  checked={form.is_custom}
                  className="size-4"
                  onChange={(event) =>
                    setForm({ ...form, is_custom: event.target.checked })
                  }
                  type="checkbox"
                />
              </label>
            </div>
            {form.is_custom ? (
              <input
                className="input input-compact"
                onChange={(event) =>
                  setForm({ ...form, custom_info: event.target.value })
                }
                placeholder="Örn. Turnuva, antrenman, misafir"
                required
                value={form.custom_info}
              />
            ) : (
              <>
                <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-2">
                  <span className="text-xs font-semibold text-[#34443a]">
                    Bağlı üye
                  </span>
                  <select
                    className="input input-compact"
                    onChange={(event) => handleOwnerChange(event.target.value)}
                    required
                    value={form.user_id}
                  >
                    {ownerOptions.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {profileOptionLabel(owner)}
                      </option>
                    ))}
                  </select>
                </div>
                {canUseLesson ? (
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#34443a]">
                    Ders
                    <input
                      checked={form.is_lesson}
                      className="size-4"
                      onChange={(event) =>
                        setForm({ ...form, is_lesson: event.target.checked })
                      }
                      type="checkbox"
                    />
                  </label>
                ) : null}
                {canUseLesson && form.is_lesson ? (
                  <LessonSetupFields
                    form={form}
                    listId="reservation-edit-student-options"
                    ownerOptions={ownerOptions}
                    setForm={setForm}
                  />
                ) : (
                  <MatchSetupFields
                    form={form}
                    listId="reservation-edit-player-options"
                    ownerOptions={ownerOptions}
                    setForm={setForm}
                  />
                )}
              </>
            )}
          </div>

          <div className="grid gap-3">
            <Field label="Kort">
              <select
                className="input"
                onChange={(event) =>
                  setForm({ ...form, court_id: event.target.value })
                }
                required
                value={form.court_id}
              >
                {activeCourts.map((court) => (
                  <option key={court.id} value={court.id}>
                    {court.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tarih">
              <input
                className="input"
                onChange={(event) => handleDateChange(event.target.value)}
                required
                type="date"
                value={form.date}
              />
            </Field>

            <Field label="Başlangıç saati">
              <select
                className="input"
                onChange={(event) =>
                  setForm({ ...form, start_time: event.target.value })
                }
                required
                value={form.start_time}
              >
                {timeSlots.map((slot) => {
                  const optionBookable = isBookableStart(
                    form.date,
                    slot,
                    bookingWindowDays,
                    currentTime,
                  );

                  return (
                    <option
                      disabled={form.status === "confirmed" && !optionBookable}
                      key={slot}
                      value={slot}
                    >
                      {slot}
                      {optionBookable || form.status === "canceled"
                        ? ""
                        : " - uygun değil"}
                    </option>
                  );
                })}
              </select>
            </Field>
          </div>

          <div className="rounded-md border border-[#e6dfd2] bg-[#f6f1e7] p-2.5 text-xs text-[#546257] sm:text-sm">
            Seçilen aralık: {formatDateTitle(parseDateInput(form.date))},{" "}
            {formatTime(selectedStart)} - {formatTime(selectedEnd)}
            {!selectedSlotBookable ? (
              <span className="mt-2 block font-medium text-[#a0543b]">
                Onaylı rezervasyon için bu saat kullanılamaz.
              </span>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="primary-button"
              disabled={isSaving || !selectedSlotBookable}
              type="submit"
            >
              Değişiklikleri kaydet
            </button>
            <button
              className="secondary-button border-[#a0543b] text-[#a0543b]"
              disabled={isSaving}
              onClick={onDelete}
              type="button"
            >
              Sil
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function NavButton({
  compactOnMobile = false,
  icon,
  isActive,
  label,
  onClick,
}: {
  compactOnMobile?: boolean;
  icon: ReactNode;
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`inline-flex h-11 items-center justify-center whitespace-nowrap rounded-md text-sm font-semibold ${
        compactOnMobile ? "w-11 px-0 lg:w-auto lg:gap-2 lg:px-3" : "gap-2 px-3"
      } ${
        isActive
          ? "bg-[#237000] text-white"
          : "border border-[#ddd7c8] bg-[#fffdf8] text-[#546257] hover:bg-[#eee9dd]"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className={compactOnMobile ? "sr-only lg:not-sr-only" : undefined}>
        {label}
      </span>
    </button>
  );
}

function ThemeToggle({
  onToggle,
  theme,
}: {
  onToggle: () => void;
  theme: ThemeMode;
}) {
  const isDark = theme === "dark";
  const label = isDark ? "Açık moda geç" : "Koyu moda geç";

  return (
    <button
      aria-label={label}
      className="grid size-10 place-items-center rounded-md border border-[#cfc8b8] bg-white text-[#17211c] hover:bg-[#eee9dd]"
      onClick={onToggle}
      title={label}
      type="button"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function PageRefreshButton() {
  return (
    <button
      aria-label="Sayfayı yenile"
      className="grid size-10 place-items-center rounded-md border border-[#cfc8b8] bg-white text-[#17211c] hover:bg-[#eee9dd]"
      onClick={() => window.location.reload()}
      title="Sayfayı yenile"
      type="button"
    >
      <RefreshCw size={16} />
    </button>
  );
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-[#34443a]">
      {label}
      {children}
    </label>
  );
}

function EmptyState({ text, title }: { text: string; title: string }) {
  return (
    <div className="rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-8 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#68756b]">
        {text}
      </p>
    </div>
  );
}

function ClubMark({ size }: { size: "sm" | "banner" | "lg" }) {
  const dimensionsBySize = {
    banner: "size-16 sm:size-20",
    lg: "size-64 sm:size-44 lg:size-48",
    sm: "size-12",
  };
  const imageSizeBySize = {
    banner: 80,
    lg: 256,
    sm: 48,
  };

  return (
    <Image
      alt="Ayvalık Çamlık Tenis Kulübü"
      aria-label="Ayvalık Çamlık Tenis Kulübü"
      className={`${dimensionsBySize[size]} rounded-full object-contain shadow-sm`}
      height={imageSizeBySize[size]}
      priority={size !== "sm"}
      src="/tenis-logo.png"
      width={imageSizeBySize[size]}
    />
  );
}
