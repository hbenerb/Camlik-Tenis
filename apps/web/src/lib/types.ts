export type AppRole = "user" | "admin" | "super_admin";
export type ReservationStatus = "confirmed" | "canceled";
export type CalendarView = "day" | "week" | "month";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  app_role: AppRole;
  is_club_member: boolean;
  reservation_days_ahead: number | null;
  created_at: string;
  updated_at: string;
};

export type ClubSettings = {
  id: number;
  timezone: string;
  opening_time: string;
  closing_time: string;
  reservation_slot_minutes: number;
  max_active_reservations: number;
  default_booking_days_ahead: number;
  club_member_booking_days_ahead: number;
  cancellation_deadline_hours: number;
  updated_at: string;
};

export type Court = {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Reservation = {
  id: string;
  court_id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  status: ReservationStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  courts?: Pick<Court, "name"> | null;
  profiles?: Pick<Profile, "email" | "full_name"> | null;
};

