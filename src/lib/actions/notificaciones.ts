"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";
import { generateDueDateReminders } from "@/lib/reminders";

export type NotificationItem = {
  id: string;
  message: string;
  scheduledFor: string;
  createdAt: string;
  readAt: string | null;
  debtId: string | null;
};

export async function listNotifications(): Promise<NotificationItem[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return notifications.map((n) => ({
    id: n.id,
    message: n.message,
    scheduledFor: n.scheduledFor.toISOString(),
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
    debtId: n.debtId,
  }));
}

export async function markAllNotificationsRead() {
  const userId = await getCurrentUserId();
  if (!userId) return { updated: 0 };

  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/");
  revalidatePath("/deudas");
  return { updated: result.count };
}

/**
 * Runs the reminder sweep on demand and returns the refreshed list. Called by
 * the notification bell so the alerts stay correct even when the background
 * scheduler is not running (for example on a serverless deployment).
 */
export async function syncAndListNotifications(): Promise<NotificationItem[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  await generateDueDateReminders();
  return listNotifications();
}
