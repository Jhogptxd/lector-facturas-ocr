import type { listReceivables } from "@/lib/actions/deudas";
import { resolveDebtTimestamp } from "@/lib/datetime";

type DebtWithContact = Awaited<ReturnType<typeof listReceivables>>[number];

export function serializeDebt(debt: DebtWithContact) {
  const stamp = resolveDebtTimestamp(debt);
  return {
    id: debt.id,
    description: debt.description,
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
