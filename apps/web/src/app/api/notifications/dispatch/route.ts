import type { NextRequest } from "next/server";
import webpush from "web-push";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AppNotification, AppPushSubscription } from "@/lib/types";

export const runtime = "nodejs";

type PushSubscriptionRow = AppPushSubscription & {
  profiles?: { notification_enabled?: boolean | null } | null;
};

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

  let sentCount = 0;
  let staleCount = 0;
  let deliveryCount = 0;

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

      for (const subscription of userSubscriptions) {
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
              body: notification.message,
              tag: `${notification.id}:${occurrenceIso}`,
              title: "Çamlık Tenis",
              url: "/",
            }),
          );
          didSendToUser = true;
          sentCount += 1;
        } catch (error) {
          const statusCode =
            typeof error === "object" &&
            error !== null &&
            "statusCode" in error
              ? Number((error as { statusCode?: number }).statusCode)
              : null;

          if (statusCode === 404 || statusCode === 410) {
            staleCount += 1;
            await supabase
              .from("app_push_subscriptions")
              .delete()
              .eq("id", subscription.id);
          }
        }
      }

      if (didSendToUser) {
        await supabase.from("app_notification_deliveries").insert({
          notification_id: notification.id,
          occurrence_at: occurrenceIso,
          user_id: userId,
        });
        deliveryCount += 1;
      }
    }
  }

  return Response.json({
    ok: true,
    deliveries: deliveryCount,
    sent: sentCount,
    stale: staleCount,
  });
}
