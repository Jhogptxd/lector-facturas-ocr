import { listReceivables, listPayables } from "@/lib/actions/deudas";
import { listContacts } from "@/lib/actions/contactos";
import { getCurrentBusiness } from "@/lib/session";
import { generateDueDateReminders } from "@/lib/reminders";
import { resolveDebtTimestamp } from "@/lib/datetime";
import { DeudasClient } from "@/components/deudas/DeudasClient";

type DebtWithContact = Awaited<ReturnType<typeof listReceivables>>[number];

function serializeDebt(debt: DebtWithContact) {
  const stamp = resolveDebtTimestamp(debt);
  return {
    id: debt.id,
    totalAmount: Number(debt.totalAmount),
    remainingAmount: Number(debt.remainingAmount),
    status: debt.status,
    dueDate: debt.dueDate ? debt.dueDate.toISOString() : null,
    createdAt: debt.createdAt.toISOString(),
    createdDayName: stamp.dayName,
    createdDateLabel: stamp.dateLabel,
    createdTimeLabel: stamp.timeLabel,
    contact: { id: debt.contact.id, name: debt.contact.name, phone: debt.contact.phone },
  };
}

export default async function DeudasPage() {
  const business = await getCurrentBusiness();

  // Keep alerts current even if the background scheduler is not running.
  await generateDueDateReminders({ businessId: business.id });

  const [receivables, payables, contacts] = await Promise.all([
    listReceivables(),
    listPayables(),
    listContacts(),
  ]);

  return (
    <DeudasClient
      receivables={receivables.map(serializeDebt)}
      payables={payables.map(serializeDebt)}
      clients={contacts.filter((c) => c.type === "CLIENT").map((c) => ({ id: c.id, name: c.name }))}
      businessName={business.name}
      currency={business.currency}
    />
  );
}
