import type { NextRequest } from "next/server";
import webpush from "web-push";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  AppNotification,
  AppPushSubscription,
  AppReservationReminderDelivery,
} from "@/lib/types";

export const runtime = "nodejs";

type PushSubscriptionRow = AppPushSubscription & {
  profiles?: { notification_enabled?: boolean | null } | null;
};
type ReservationReminderRow = {
  id: string;
  user_id: string;
  created_at: string;
  starts_at: string;
  status: "confirmed" | "canceled";
  courts?: { name?: string | null } | null;
};
type DispatchCounters = {
  deliveries: number;
  sent: number;
  stale: number;
};

const RESERVATION_REMINDER_MINUTES = [60, 30] as const;

function addMinutesToDate(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
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

function groupSubscriptionsByUser(subscriptions: PushSubscriptionRow[]) {
  const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>();

  subscriptions.forEach((subscription) => {
    if (!subscription.profiles?.notification_enabled) {
      return;
    }

    const userSubscriptions =
      subscriptionsByUser.get(subscription.user_id) ?? [];
    userSubscriptions.push(subscription);
    subscriptionsByUser.set(subscription.user_id, userSubscriptions);
  });

  return subscriptionsByUser;
}

function formatReminderTime(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(date);
}

async function sendPushToSubscriptions({
  body,
  tag,
  supabase,
  subscriptions,
}: {
  body: string;
  tag: string;
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
  subscriptions: PushSubscriptionRow[];
}) {
  let didSend = false;
  let sent = 0;
  let stale = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            auth: subscription.auth,
            p256dh: subscription.p256dh,
          },
        },
        JSON.stringify({
          body,
          tag,
          title: "Çamlık Tenis",
          url: "/",
        }),
      );
      didSend = true;
      sent += 1;
    } catch (error) {
      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number((error as { statusCode?: number }).statusCode)
          : null;

      if (statusCode === 404 || statusCode === 410) {
        stale += 1;
        await supabase
          .from("app_push_subscriptions")
          .delete()
          .eq("id", subscription.id);
      }
    }
  }

  return { didSend, sent, stale };
}

async function dispatchReservationReminders(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  subscriptionsByUser: Map<string, PushSubscriptionRow[]>,
  now: Date,
) {
  const counters: DispatchCounters = {
    deliveries: 0,
    sent: 0,
    stale: 0,
  };
  const latestReminderTime = addMinutesToDate(
    now,
    Math.max(...RESERVATION_REMINDER_MINUTES),
  );

  const reservationsResult = await supabase
    .from("reservations")
    .select("id, user_id, created_at, starts_at, status, courts(name)")
    .eq("status", "confirmed")
    .gt("starts_at", now.toISOString())
    .lte("starts_at", latestReminderTime.toISOString());

  if (reservationsResult.error) {
    return counters;
  }

  const reservations =
    (reservationsResult.data as ReservationReminderRow[] | null) ?? [];

  for (const reservation of reservations) {
    const userSubscriptions = subscriptionsByUser.get(reservation.user_id);

    if (!userSubscriptions?.length) {
      continue;
    }

    const startsAt = new Date(reservation.starts_at);
    const createdAt = new Date(reservation.created_at);
    const dueReminderMinutes = RESERVATION_REMINDER_MINUTES.filter(
      (reminderMinutes, index) => {
        const reminderAt = addMinutesToDate(startsAt, -reminderMinutes);
        const nextReminderMinutes = RESERVATION_REMINDER_MINUTES[index + 1];
        const reminderWindowEndsAt = nextReminderMinutes
          ? addMinutesToDate(startsAt, -nextReminderMinutes)
          : startsAt;

        return (
          createdAt <= reminderAt &&
          now >= reminderAt &&
          now < reminderWindowEndsAt
        );
      },
    );

    if (dueReminderMinutes.length === 0) {
      continue;
    }

    const reminderDeliveriesResult = await supabase
      .from("app_reservation_reminder_deliveries")
      .select("reminder_minutes")
      .eq("reservation_id", reservation.id)
      .eq("user_id", reservation.user_id);

    if (reminderDeliveriesResult.error) {
      continue;
    }

    const deliveredReminderMinutes = new Set(
      (
        (reminderDeliveriesResult.data as
          | AppReservationReminderDelivery[]
          | null) ?? []
      ).map((delivery) => delivery.reminder_minutes),
    );

    for (const reminderMinutes of dueReminderMinutes) {
      if (deliveredReminderMinutes.has(reminderMinutes)) {
        continue;
      }

      const courtName = reservation.courts?.name ?? "Kort";
      const body =
        reminderMinutes === 60
          ? `${courtName} rezervasyonunuz 1 saat sonra başlıyor. Saat: ${formatReminderTime(startsAt)}`
          : `${courtName} rezervasyonunuz 30 dakika sonra başlıyor. Saat: ${formatReminderTime(startsAt)}`;
      const pushResult = await sendPushToSubscriptions({
        body,
        tag: `reservation:${reservation.id}:${reminderMinutes}`,
        supabase,
        subscriptions: userSubscriptions,
      });

      counters.sent += pushResult.sent;
      counters.stale += pushResult.stale;

      if (!pushResult.didSend) {
        continue;
      }

      await supabase.from("app_reservation_reminder_deliveries").insert({
        reminder_minutes: reminderMinutes,
        reservation_id: reservation.id,
        user_id: reservation.user_id,
      });
      counters.deliveries += 1;
    }
  }

  return counters;
}

export async function GET(request: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY
  ) {
    return Response.json(
      { ok: false, error: "VAPID keys are not configured" },
      { status: 500 },
    );
  }

  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return Response.json(
      { ok: false, error: "Supabase service role is not configured" },
      { status: 500 },
    );
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hbenerb@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const now = new Date();
  const [notificationsResult, subscriptionsResult] = await Promise.all([
    supabase
      .from("app_notifications")
      .select("*")
      .eq("status", "active")
      .lte("starts_at", now.toISOString()),
    supabase
      .from("app_push_subscriptions")
      .select("*, profiles(notification_enabled)"),
  ]);

  if (notificationsResult.error || subscriptionsResult.error) {
    return Response.json(
      {
        ok: false,
        error:
          notificationsResult.error?.message ??
          subscriptionsResult.error?.message,
      },
      { status: 500 },
    );
  }

  const notifications =
    (notificationsResult.data as AppNotification[] | null) ?? [];
  const subscriptions =
    (subscriptionsResult.data as PushSubscriptionRow[] | null) ?? [];
  const subscriptionsByUser = groupSubscriptionsByUser(subscriptions);

  const counters: DispatchCounters = {
    deliveries: 0,
    sent: 0,
    stale: 0,
  };

  for (const notification of notifications) {
    const occurrenceAt = getNotificationOccurrence(notification, now);

    if (!occurrenceAt) {
      continue;
    }

    const occurrenceIso = occurrenceAt.toISOString();
    const deliveriesResult = await supabase
      .from("app_notification_deliveries")
      .select("user_id")
      .eq("notification_id", notification.id)
      .eq("occurrence_at", occurrenceIso);

    if (deliveriesResult.error) {
      continue;
    }

    const deliveredUsers = new Set(
      ((deliveriesResult.data as Array<{ user_id: string }> | null) ?? []).map(
        (delivery) => delivery.user_id,
      ),
    );

    for (const [userId, userSubscriptions] of subscriptionsByUser) {
      if (deliveredUsers.has(userId)) {
        continue;
      }

      let didSendToUser = false;
      const pushResult = await sendPushToSubscriptions({
        body: notification.message,
        tag: `${notification.id}:${occurrenceIso}`,
        supabase,
        subscriptions: userSubscriptions,
      });
      didSendToUser = pushResult.didSend;
      counters.sent += pushResult.sent;
      counters.stale += pushResult.stale;

      if (didSendToUser) {
        await supabase.from("app_notification_deliveries").insert({
          notification_id: notification.id,
          occurrence_at: occurrenceIso,
          user_id: userId,
        });
        counters.deliveries += 1;
      }
    }
  }

  const reservationCounters = await dispatchReservationReminders(
    supabase,
    subscriptionsByUser,
    now,
  );

  return Response.json({
    ok: true,
    deliveries: counters.deliveries + reservationCounters.deliveries,
    reservationReminders: reservationCounters.deliveries,
    sent: counters.sent + reservationCounters.sent,
    stale: counters.stale + reservationCounters.stale,
  });
}
