export type AppRole = "user" | "admin" | "super_admin";
export type ReservationStatus = "confirmed" | "canceled";
export type CalendarView = "day" | "week" | "month";
export type SkillLevel = "beginner" | "intermediate" | "advanced" | "master";
export type NotificationScheduleType = "instant" | "scheduled" | "recurring";
export type AppNotificationStatus = "active" | "canceled";
export type TournamentMatchPhase = "group" | "final";
export type TournamentMatchStatus = "scheduled" | "completed" | "canceled";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  skill_level?: SkillLevel | null;
  avatar_url: string | null;
  app_role: AppRole;
  can_book?: boolean | null;
  is_club_member: boolean;
  is_trainer?: boolean | null;
  notification_enabled?: boolean | null;
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

export type AppNotification = {
  id: string;
  message: string;
  schedule_type: NotificationScheduleType;
  status: AppNotificationStatus;
  starts_at: string;
  interval_minutes: number | null;
  expires_at: string | null;
  target_user_id?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AppNotificationDelivery = {
  notification_id: string;
  occurrence_at: string;
};

export type AppPushSubscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
};

export type Tournament = {
  id: string;
  name: string;
  group_stage_start_date: string;
  group_stage_end_date: string;
  finals_start_date: string;
  finals_end_date: string;
  is_active: boolean;
  source_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TournamentCourt = {
  tournament_id: string;
  court_id: string;
};

export type TournamentCategory = {
  id: string;
  tournament_id: string;
  name: string;
  group_count: number;
  group_size: number;
  display_order: number;
  created_at: string;
};

export type TournamentGroup = {
  id: string;
  category_id: string;
  name: string;
  display_order: number;
  created_at: string;
};

export type TournamentParticipant = {
  id: string;
  category_id: string;
  group_id: string | null;
  display_name: string;
  display_order: number;
  created_at: string;
};

export type TournamentMatch = {
  id: string;
  tournament_id: string;
  category_id: string;
  group_id: string | null;
  court_id: string | null;
  phase: TournamentMatchPhase;
  starts_at: string;
  ends_at: string;
  player1_name: string;
  player2_name: string;
  round_label: string | null;
  status: TournamentMatchStatus;
  source_key: string | null;
  created_at: string;
  updated_at: string;
  courts?: Pick<Court, "name"> | null;
  tournament_categories?: Pick<TournamentCategory, "name"> | null;
  tournament_groups?: Pick<TournamentGroup, "name"> | null;
};

export type TournamentWithDetails = Tournament & {
  courts: TournamentCourt[];
  categories: TournamentCategory[];
  groups: TournamentGroup[];
  participants: TournamentParticipant[];
  matches: TournamentMatch[];
};
