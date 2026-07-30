import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildDueSoonMessage, resolveDebtTimestamp } from "@/lib/datetime";

/** How long before the due date the reminder fires. */
export const REMINDER_LEAD_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Creates the "pay this invoice" reminder for every supplier debt whose due
 * date is a week or less away and that has not been alerted yet.
 *
 * The window is `dueDate <= now + 7 days` rather than an exact-day match so a
 * debt registered with a due date already inside the week still gets its
 * reminder — an exact match would silently skip those. The unique constraint on
 * (debtId, kind) keeps the job idempotent, so it is safe to run on any cadence.
 */
export async function generateDueDateReminders(options: { businessId?: string } = {}) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_LEAD_DAYS * DAY_MS);

  const dueDebts = await prisma.debt.findMany({
    where: {
      ...(options.businessId ? { businessId: options.businessId } : {}),
      status: { not: "PAID" },
      dueDate: { not: null, lte: windowEnd },
      contact: { type: "SUPPLIER" },
      notifications: { none: { kind: "DEBT_DUE_SOON" } },
    },
    include: {
      contact: { select: { name: true } },
      business: { select: { id: true, userId: true } },
    },
  });

  let created = 0;

  for (const debt of dueDebts) {
    if (!debt.dueDate) continue;

    const message = buildDueSoonMessage({
      supplierName: debt.contact.name,
      timestamp: resolveDebtTimestamp(debt),
    });

    try {
      await prisma.notification.create({
        data: {
          userId: debt.business.userId,
          businessId: debt.business.id,
          debtId: debt.id,
          kind: "DEBT_DUE_SOON",
          message,
          scheduledFor: new Date(debt.dueDate.getTime() - REMINDER_LEAD_DAYS * DAY_MS),
        },
      });
      created += 1;
    } catch (error) {
      // P2002 = another run already inserted this reminder. Anything else is
      // unexpected but must not abort the remaining debts.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        console.error(`[reminders] could not create reminder for debt ${debt.id}`, error);
      }
    }
  }

  return { created, evaluated: dueDebts.length };
}
