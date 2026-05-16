"use client";

import type { User } from "@supabase/supabase-js";
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
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  ShieldCheck,
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
  formatTime,
  getRangeForView,
  isCurrentMonth,
  isReservationInRange,
  normalizeTime,
  parseDateInput,
} from "@/lib/time";
import type {
  AppRole,
  CalendarView,
  ClubSettings,
  Court,
  Profile,
  Reservation,
  ReservationStatus,
  SkillLevel,
} from "@/lib/types";

type AppTab = "calendar" | "reservations" | "profile" | "admin";
type OAuthProvider = "google" | "apple";
type ThemeMode = "light" | "dark";
type DayAvailability = "past" | "bookable" | "future";

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

const skillLevelLabels: Record<SkillLevel, string> = {
  beginner: "Başlangıç",
  intermediate: "Orta",
  advanced: "İleri",
  master: "Master",
};

const skillLevels = Object.keys(skillLevelLabels) as SkillLevel[];

const ADMIN_EDIT_BOOKING_WINDOW_DAYS = 365;

function normalizeFullName(value: string) {
  return value.trim().replace(/\s+/g, " ");
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

function isAdmin(profile: Profile | null) {
  return profile?.app_role === "admin" || profile?.app_role === "super_admin";
}

function getDisplayName(profile: Profile | null, user: User | null) {
  return profile?.full_name || user?.user_metadata?.full_name || profile?.email || "";
}

function getReservationOwner(reservation: Reservation) {
  return (
    reservation.profiles?.full_name ||
    reservation.profiles?.email ||
    "İsim yok"
  );
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

export function ClubApp() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<ClubSettings>(defaultSettings);
  const [settingsDraft, setSettingsDraft] =
    useState<ClubSettings>(defaultSettings);
  const [courts, setCourts] = useState<Court[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>("calendar");
  const [calendarView, setCalendarView] = useState<CalendarView>("day");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [isReservationOpen, setIsReservationOpen] = useState(false);
  const [editingReservation, setEditingReservation] =
    useState<Reservation | null>(null);
  const [reservationForm, setReservationForm] = useState({
    court_id: "",
    date: dateInputValue(new Date()),
    start_time: "09:00",
  });
  const [reservationEditForm, setReservationEditForm] = useState({
    court_id: "",
    date: dateInputValue(new Date()),
    start_time: "09:00",
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
  const [isProfileSchemaReady, setIsProfileSchemaReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [theme, setTheme] = useState<ThemeMode>("light");

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

  const visibleReservations = useMemo(() => {
    const range = getRangeForView(selectedDate, calendarView);
    return reservations.filter((reservation) =>
      isReservationInRange(reservation, range.start, range.end),
    );
  }, [calendarView, reservations, selectedDate]);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => {
      return currentTheme === "dark" ? "light" : "dark";
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "theme-dark-root",
      theme === "dark",
    );
    document.documentElement.classList.toggle(
      "theme-light-root",
      theme === "light",
    );
  }, [theme]);

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
      if (current.court_id || loadedCourts.length === 0) {
        return current;
      }

      return {
        ...current,
        court_id:
          loadedCourts.find((court) => court.is_active)?.id ?? loadedCourts[0].id,
        start_time: buildTimeSlots(loadedSettings)[0] ?? current.start_time,
      };
    });

    const reservationResult = await supabase
      .from("reservations")
      .select("*, courts(name), profiles(email, full_name)")
      .order("starts_at", { ascending: true });

    let loadedMembers: Profile[] = [];

    if (isAdmin(loadedProfile)) {
      const memberResult = await supabase
        .from("profiles")
        .select("*")
        .order("email", { ascending: true });

      if (memberResult.error) {
        setStatusMessage(memberResult.error.message);
      } else {
        loadedMembers = (memberResult.data as Profile[] | null) ?? [];
        setMembers(loadedMembers);
      }
    } else {
      setMembers([]);
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
  }, [supabase]);

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

  async function signIn(provider: OAuthProvider) {
    if (!supabase) {
      return;
    }

    setStatusMessage(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatusMessage(error.message);
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

  function openReservationForm(courtId?: string, date?: Date, slot?: string) {
    const requestedDate = date ?? selectedDate;
    const dateForForm = isBookableDay(
      requestedDate,
      bookingWindowDays,
      currentTime,
    )
      ? requestedDate
      : firstBookableDate(bookingWindowDays, timeSlots, currentTime);
    const dateValue = dateInputValue(dateForForm);
    const slotForForm =
      slot && isBookableStart(dateValue, slot, bookingWindowDays, currentTime)
        ? slot
        : firstBookableSlot(
            dateValue,
            timeSlots,
            bookingWindowDays,
            currentTime,
          );

    setReservationForm({
      court_id: courtId ?? activeCourts[0]?.id ?? "",
      date: dateValue,
      start_time: slotForForm ?? timeSlots[0] ?? "09:00",
    });
    setStatusMessage(null);
    setIsReservationOpen(true);
  }

  function openEditReservation(reservation: Reservation) {
    const startsAt = new Date(reservation.starts_at);

    if (startsAt < currentTime) {
      setStatusMessage("Geçmiş rezervasyonlar düzenlenemez.");
      return;
    }

    setReservationEditForm({
      court_id: reservation.court_id,
      date: dateInputValue(startsAt),
      start_time: formatTime(startsAt),
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
        bookingWindowDays,
        currentTime,
      )
    ) {
      setStatusMessage("Bu tarih ve saat için rezervasyon yapılamaz.");
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    const startsAt = buildLocalDateTime(
      reservationForm.date,
      reservationForm.start_time,
    );
    const endsAt = addSlotDuration(startsAt, settings);

    const { error } = await supabase.from("reservations").insert({
      court_id: reservationForm.court_id,
      user_id: user.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
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

    setIsSaving(true);
    setStatusMessage(null);

    const startsAt = buildLocalDateTime(
      reservationEditForm.date,
      reservationEditForm.start_time,
    );
    const endsAt = addSlotDuration(startsAt, settings);

    const { error } = await supabase
      .from("reservations")
      .update({
        court_id: reservationEditForm.court_id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
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
    await loadData(user);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user) {
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    const { error } = await supabase
      .from("club_settings")
      .update({
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
      })
      .eq("id", 1);

    setIsSaving(false);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setStatusMessage("Kulüp ayarları güncellendi.");
    await loadData(user);
  }

  async function addCourt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user || !newCourtName.trim()) {
      return;
    }

    const { error } = await supabase.from("courts").insert({
      name: newCourtName.trim(),
      display_order: courts.length + 1,
      is_active: true,
    });

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setNewCourtName("");
    setStatusMessage("Kort eklendi.");
    await loadData(user);
  }

  async function saveCourt(court: Court) {
    if (!supabase || !user) {
      return;
    }

    const { error } = await supabase
      .from("courts")
      .update({
        name: court.name,
        display_order: Number(court.display_order),
        is_active: court.is_active,
      })
      .eq("id", court.id);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setStatusMessage("Kort güncellendi.");
    await loadData(user);
  }

  async function updateMember(memberId: string, fields: Partial<Profile>) {
    if (!supabase || !user) {
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update(fields)
      .eq("id", memberId);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setStatusMessage("Üye güncellendi.");
    await loadData(user);
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
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <ClubMark size="sm" />
            <div className="min-w-0">
              <p className="text-sm text-[#6d746c]">Ayvalık Çamlık</p>
              <h1 className="text-xl font-semibold tracking-normal">
                Kort Rezervasyon
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
                    ? "bg-[#1e4a32] text-white"
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
              icon={<UserIcon size={18} />}
              iconOnly
              isActive={visibleActiveTab === "profile"}
              label="Profil"
              onClick={() => setActiveTab("profile")}
            />
          </nav>
        </aside>

        <section className="mx-auto w-full min-w-0 max-w-5xl">
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
              bookingWindowDays={bookingWindowDays}
              calendarView={calendarView}
              courts={courts}
              currentTime={currentTime}
              moveCalendar={moveCalendar}
              onDeleteReservation={
                isAdmin(profile) ? deleteReservation : undefined
              }
              onEditReservation={
                isAdmin(profile) ? openEditReservation : undefined
              }
              onCreateReservation={openReservationForm}
              onRefresh={() => loadData(user)}
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
              onDelete={deleteReservation}
              onEdit={openEditReservation}
              onCancel={cancelReservation}
              reservations={
                isAdmin(profile)
                  ? reservations
                  : reservations.filter(
                      (reservation) => reservation.user_id === user.id,
                    )
              }
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
              onSubmit={saveOwnProfile}
              profile={profile}
            />
          ) : null}

          {!isLoading && visibleActiveTab === "admin" && profile && isAdmin(profile) ? (
            <AdminPanel
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
              onSaveCourt={saveCourt}
              onSaveSettings={saveSettings}
              onSettingsDraftChange={setSettingsDraft}
              settingsDraft={settingsDraft}
            />
          ) : null}
        </section>
      </div>

      {isReservationOpen ? (
        <ReservationDialog
          activeCourts={activeCourts}
          bookingWindowDays={bookingWindowDays}
          currentTime={currentTime}
          form={reservationForm}
          isSaving={isSaving}
          onClose={() => setIsReservationOpen(false)}
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
          currentTime={currentTime}
          form={reservationEditForm}
          isSaving={isSaving}
          onClose={() => setEditingReservation(null)}
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
  statusMessage,
  theme,
}: {
  isAuthDisabled?: boolean;
  onToggleTheme: () => void;
  onSignIn: (provider: OAuthProvider) => void;
  statusMessage: string | null;
  theme: ThemeMode;
}) {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-10 pt-14 lg:grid-cols-[1fr_420px]">
      <div className="absolute right-4 top-4 sm:right-8">
        <ThemeToggle onToggle={onToggleTheme} theme={theme} />
      </div>
      <section className="max-w-2xl">
        <ClubMark size="lg" />
        <p className="mt-8 text-sm font-medium uppercase tracking-[0.18em] text-[#7c6f52]">
          Ayvalık Çamlık Tenis Kulübü
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-normal text-[#17211c] sm:text-6xl">
          Kort rezervasyonları için üye girişi
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-[#546257]">
          Günlük, haftalık ve aylık takvimden uygun saatleri görün; kulüp
          kurallarına göre rezervasyon oluşturun.
        </p>
      </section>

      <section className="rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold">Üye girişi</h2>
          <p className="mt-2 text-sm leading-6 text-[#68756b]">
            Kulüp üyeliği admin tarafından ayrıca işaretlenir. Uygulama
            hesabını burada oluşturabilirsiniz.
          </p>
        </div>

        <div className="grid gap-3">
          <button
            className="inline-flex h-12 items-center justify-center gap-3 rounded-md border border-[#cfc8b8] bg-white px-4 text-sm font-semibold hover:bg-[#f1ede2] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isAuthDisabled}
            onClick={() => onSignIn("google")}
            type="button"
          >
            <span className="grid size-6 place-items-center rounded-full border border-[#d5d0c3] text-sm font-bold">
              G
            </span>
            Google ile bağlan
          </button>
          <button
            className="inline-flex h-12 items-center justify-center gap-3 rounded-md bg-[#1e4a32] px-4 text-sm font-semibold text-white hover:bg-[#28613f] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isAuthDisabled}
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
    </div>
  );
}

function CalendarPanel({
  activeCourts,
  bookingWindowDays,
  calendarView,
  courts,
  currentTime,
  moveCalendar,
  onCreateReservation,
  onDeleteReservation,
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
  courts: Court[];
  currentTime: Date;
  moveCalendar: (direction: -1 | 1) => void;
  onCreateReservation: (courtId?: string, date?: Date, slot?: string) => void;
  onDeleteReservation?: (reservation: Reservation) => void;
  onEditReservation?: (reservation: Reservation) => void;
  onRefresh: () => void;
  reservations: Reservation[];
  selectedDate: Date;
  setCalendarView: (view: CalendarView) => void;
  setSelectedDate: (date: Date) => void;
  settings: ClubSettings;
  timeSlots: string[];
}) {
  return (
    <div className="mx-auto w-full space-y-3 sm:space-y-4">
      <div className="rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-[#68756b]">
              {normalizeTime(settings.opening_time)} -{" "}
              {normalizeTime(settings.closing_time)} ·{" "}
              {settings.reservation_slot_minutes} dk
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold sm:text-2xl">
              {calendarView === "month"
                ? format(selectedDate, "MMMM yyyy")
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

        <div className="mt-3 grid gap-2">
          <div className="grid grid-cols-3 rounded-md border border-[#cfc8b8] bg-white p-1">
            {(Object.keys(viewLabels) as CalendarView[]).map((view) => (
              <button
                className={`h-9 rounded px-2 text-sm font-medium ${
                  calendarView === view
                    ? "bg-[#1e4a32] text-white"
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
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#1e4a32] px-4 text-sm font-semibold text-white hover:bg-[#28613f]"
            onClick={() => onCreateReservation()}
            type="button"
          >
            <Plus size={18} />
            Rezervasyon yap
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
          className="h-10 rounded-md border border-[#cfc8b8] bg-white px-2 text-sm font-medium hover:bg-[#eee9dd]"
          onClick={() => setSelectedDate(new Date())}
          type="button"
        >
          Bugün
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
          courts={activeCourts}
          currentTime={currentTime}
          onDeleteReservation={onDeleteReservation}
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
  courts,
  currentTime,
  onDeleteReservation,
  onEditReservation,
  onCreateReservation,
  reservations,
  selectedDate,
  timeSlots,
}: {
  bookingWindowDays: number;
  courts: Court[];
  currentTime: Date;
  onDeleteReservation?: (reservation: Reservation) => void;
  onEditReservation?: (reservation: Reservation) => void;
  onCreateReservation: (courtId?: string, date?: Date, slot?: string) => void;
  reservations: Reservation[];
  selectedDate: Date;
  timeSlots: string[];
}) {
  const compactCourtGrid = courts.length <= 3;
  const gridTemplateColumns = compactCourtGrid
    ? `42px repeat(${courts.length}, minmax(0, 1fr))`
    : `64px repeat(${courts.length}, minmax(116px, 1fr))`;

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
              <div className="grid place-items-center border-r border-t border-[#eee7db] px-1 py-2 text-center text-[10px] font-medium text-[#68756b] sm:p-3 sm:text-sm">
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
                  const owner = getReservationOwner(reservation);

                  return (
                    <div
                      className={`${cellClassName} flex flex-col items-center justify-center bg-[#e6f0e7] hover:bg-[#dbe8dc]`}
                      key={`${court.id}-${slot}`}
                    >
                      <p
                        className="w-full truncate text-[12px] font-semibold text-[#1e4a32] sm:text-sm"
                        title={owner}
                      >
                        {owner}
                      </p>
                      {onEditReservation || onDeleteReservation ? (
                        <div className="mt-1 flex flex-wrap justify-center gap-1 sm:mt-2 sm:justify-start">
                          {onEditReservation ? (
                            <button
                              className="inline-flex rounded border border-[#cfc8b8] px-1 py-0.5 text-[9px] font-medium sm:px-2 sm:py-1 sm:text-xs"
                              onClick={(event) => {
                                event.stopPropagation();
                                onEditReservation(reservation);
                              }}
                              type="button"
                            >
                              Düzenle
                            </button>
                          ) : null}
                          {onDeleteReservation ? (
                            <button
                              className="inline-flex rounded border border-[#cfc8b8] px-1 py-0.5 text-[9px] font-medium sm:px-2 sm:py-1 sm:text-xs"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeleteReservation(reservation);
                              }}
                              type="button"
                            >
                              Sil
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <button
                    className={`${cellClassName} flex items-center justify-center ${
                      slotBookable
                        ? "cursor-pointer bg-[#f0f8ef] text-[#1e4a32] hover:bg-[#e3f1df]"
                        : "cursor-not-allowed bg-white text-[#8b8f86]"
                    }`}
                    disabled={!slotBookable}
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
  onDelete,
  onEdit,
  reservations,
  userId,
}: {
  canManageAll: boolean;
  currentTime: Date;
  onCancel: (reservation: Reservation) => void;
  onDelete: (reservation: Reservation) => void;
  onEdit: (reservation: Reservation) => void;
  reservations: Reservation[];
  userId: string;
}) {
  const sorted = reservations
    .filter((reservation) => isFutureReservation(reservation, currentTime))
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="Rezervasyon yok"
        text={
          canManageAll
            ? "Henüz oluşturulmuş rezervasyon bulunmuyor."
            : "Gelecek rezervasyonunuz bulunmuyor."
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((reservation) => {
        const startsAt = new Date(reservation.starts_at);
        const isMine = reservation.user_id === userId;
        const isFuture = isFutureReservation(reservation, currentTime);
        const canCancel = isMine && isFuture && reservation.status === "confirmed";
        const canManageReservation = canManageAll && isFuture;

        return (
          <div
            className="flex flex-col gap-3 rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-4 sm:flex-row sm:items-center sm:justify-between"
            key={reservation.id}
          >
            <div>
              <p className="text-sm text-[#68756b]">
                {formatDateTitle(startsAt)}
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                {reservation.courts?.name ?? "Kort"} · {formatTime(startsAt)} -{" "}
                {formatTime(new Date(reservation.ends_at))}
              </h3>
              <p className="mt-1 text-sm text-[#68756b]">
                Rezervasyonu yapan: {getReservationOwner(reservation)}
              </p>
              <p className="mt-1 text-sm text-[#68756b]">
                Durum:{" "}
                {reservation.status === "confirmed" ? "Onaylı" : "İptal edildi"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManageReservation ? (
                <>
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfc8b8] px-3 text-sm font-medium hover:bg-[#eee9dd]"
                    onClick={() => onEdit(reservation)}
                    type="button"
                  >
                    Düzenle
                  </button>
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfc8b8] px-3 text-sm font-medium hover:bg-[#eee9dd]"
                    onClick={() => onDelete(reservation)}
                    type="button"
                  >
                    Sil
                  </button>
                </>
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

function ProfilePanel({
  form,
  isRequired,
  isSaving,
  isSchemaReady,
  onFormChange,
  onSubmit,
  profile,
}: {
  form: { full_name: string; skill_level: SkillLevel };
  isRequired: boolean;
  isSaving: boolean;
  isSchemaReady: boolean;
  onFormChange: (form: { full_name: string; skill_level: SkillLevel }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  profile: Profile;
}) {
  return (
    <section className="rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-4 sm:p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[#e6f0e7] text-[#1e4a32]">
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
    </section>
  );
}

function AdminPanel({
  courts,
  currentProfile,
  isSaving,
  members,
  newCourtName,
  onAddCourt,
  onCourtChange,
  onMemberUpdate,
  onNewCourtNameChange,
  onSaveCourt,
  onSaveSettings,
  onSettingsDraftChange,
  settingsDraft,
}: {
  courts: Court[];
  currentProfile: Profile;
  isSaving: boolean;
  members: Profile[];
  newCourtName: string;
  onAddCourt: (event: FormEvent<HTMLFormElement>) => void;
  onCourtChange: (courtId: string, fields: Partial<Court>) => void;
  onMemberUpdate: (memberId: string, fields: Partial<Profile>) => void;
  onNewCourtNameChange: (value: string) => void;
  onSaveCourt: (court: Court) => void;
  onSaveSettings: (event: FormEvent<HTMLFormElement>) => void;
  onSettingsDraftChange: (settings: ClubSettings) => void;
  settingsDraft: ClubSettings;
}) {
  const canManageRoles = currentProfile.app_role === "super_admin";

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-4">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck size={20} />
          <h2 className="text-xl font-semibold">Kulüp ayarları</h2>
        </div>

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
      </section>

      <section className="rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-4">
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays size={20} />
          <h2 className="text-xl font-semibold">Kortlar</h2>
        </div>

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
              className="grid gap-3 rounded-md border border-[#eee7db] bg-white p-3 md:grid-cols-[1fr_110px_120px_96px]"
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
                onClick={() => onSaveCourt(court)}
                type="button"
              >
                Kaydet
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-[#ddd7c8] bg-[#fffdf8] p-4">
        <div className="mb-4 flex items-center gap-2">
          <Users size={20} />
          <h2 className="text-xl font-semibold">Üyeler</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#e6dfd2] text-left text-[#68756b]">
                <th className="py-3 pr-3 font-medium">E-posta</th>
                <th className="py-3 pr-3 font-medium">Kulüp üyesi</th>
                <th className="py-3 pr-3 font-medium">Gün limiti</th>
                <th className="py-3 pr-3 font-medium">Rol</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr className="border-b border-[#eee7db]" key={member.id}>
                  <td className="py-3 pr-3">
                    <div className="font-medium">{member.email}</div>
                    <div className="text-xs text-[#68756b]">
                      {member.full_name ?? "İsim yok"}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <input
                      checked={member.is_club_member}
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
                      className="input max-w-28"
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
                      defaultValue={member.reservation_days_ahead ?? ""}
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <select
                      className="input max-w-40"
                      disabled={!canManageRoles}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ReservationDialog({
  activeCourts,
  bookingWindowDays,
  currentTime,
  form,
  isSaving,
  onClose,
  onSubmit,
  setForm,
  settings,
  timeSlots,
}: {
  activeCourts: Court[];
  bookingWindowDays: number;
  currentTime: Date;
  form: { court_id: string; date: string; start_time: string };
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setForm: (form: { court_id: string; date: string; start_time: string }) => void;
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

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-0 sm:items-center sm:justify-center sm:p-6">
      <section className="w-full rounded-t-lg bg-[#fffdf8] p-5 shadow-xl sm:max-w-lg sm:rounded-lg">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-[#68756b]">Yeni rezervasyon</p>
            <h2 className="text-2xl font-semibold">Kort ve saat seç</h2>
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

        <form className="grid gap-4" onSubmit={onSubmit}>
          <Field label="Kort">
            <select
              className="input"
              onChange={(event) => setForm({ ...form, court_id: event.target.value })}
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

          <div className="rounded-md border border-[#e6dfd2] bg-[#f6f1e7] p-3 text-sm text-[#546257]">
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
  currentTime,
  form,
  isSaving,
  onClose,
  onSubmit,
  setForm,
  settings,
  timeSlots,
}: {
  activeCourts: Court[];
  bookingWindowDays: number;
  currentTime: Date;
  form: {
    court_id: string;
    date: string;
    start_time: string;
    status: ReservationStatus;
  };
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setForm: (form: {
    court_id: string;
    date: string;
    start_time: string;
    status: ReservationStatus;
  }) => void;
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

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-0 sm:items-center sm:justify-center sm:p-6">
      <section className="w-full rounded-t-lg bg-[#fffdf8] p-5 shadow-xl sm:max-w-lg sm:rounded-lg">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-[#68756b]">Admin düzenleme</p>
            <h2 className="text-2xl font-semibold">Rezervasyonu düzenle</h2>
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

        <form className="grid gap-4" onSubmit={onSubmit}>
          <Field label="Kort">
            <select
              className="input"
              onChange={(event) => setForm({ ...form, court_id: event.target.value })}
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

          <Field label="Durum">
            <select
              className="input"
              onChange={(event) =>
                setForm({
                  ...form,
                  status: event.target.value as ReservationStatus,
                })
              }
              value={form.status}
            >
              <option value="confirmed">Onaylı</option>
              <option value="canceled">İptal edildi</option>
            </select>
          </Field>

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

          <div className="rounded-md border border-[#e6dfd2] bg-[#f6f1e7] p-3 text-sm text-[#546257]">
            Seçilen aralık: {formatDateTitle(parseDateInput(form.date))},{" "}
            {formatTime(selectedStart)} - {formatTime(selectedEnd)}
            {!selectedSlotBookable ? (
              <span className="mt-2 block font-medium text-[#a0543b]">
                Onaylı rezervasyon için bu saat kullanılamaz.
              </span>
            ) : null}
          </div>

          <button
            className="primary-button"
            disabled={isSaving || !selectedSlotBookable}
            type="submit"
          >
            Değişiklikleri kaydet
          </button>
        </form>
      </section>
    </div>
  );
}

function NavButton({
  iconOnly = false,
  icon,
  isActive,
  label,
  onClick,
}: {
  iconOnly?: boolean;
  icon: ReactNode;
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`inline-flex h-11 items-center justify-center whitespace-nowrap rounded-md text-sm font-semibold ${
        iconOnly ? "w-11 px-0" : "gap-2 px-3"
      } ${
        isActive
          ? "bg-[#1e4a32] text-white"
          : "border border-[#ddd7c8] bg-[#fffdf8] text-[#546257] hover:bg-[#eee9dd]"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className={iconOnly ? "sr-only" : undefined}>{label}</span>
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

function ClubMark({ size }: { size: "sm" | "lg" }) {
  const dimensions = size === "lg" ? "size-20 text-2xl" : "size-12 text-base";

  return (
    <div
      className={`${dimensions} grid place-items-center rounded-full border border-[#d0c7b0] bg-[#fffdf8] font-semibold text-[#1f4b32] shadow-sm`}
      aria-label="Ayvalık Çamlık Tenis Kulübü"
    >
      ÇT
    </div>
  );
}
