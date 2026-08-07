"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { buildDebtTimestamp } from "@/lib/datetime";
import { generateDueDateReminders } from "@/lib/reminders";
import { resolveContactByName } from "@/lib/contacts";

export async function listReceivables() {
  const business = await getCurrentBusiness();
  return prisma.debt.findMany({
    where: { businessId: business.id, contact: { type: "CLIENT" }, status: { not: "PAID" } },
    include: { contact: true, payments: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listPayables() {
  const business = await getCurrentBusiness();
  return prisma.debt.findMany({
    where: { businessId: business.id, contact: { type: "SUPPLIER" }, status: { not: "PAID" } },
    include: { contact: true, payments: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDebtHistory(businessId?: string) {
  const business = await getCurrentBusiness();
  return prisma.debt.findMany({
    where: { businessId: businessId ?? business.id },
    include: { contact: true, payments: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * A debt is either owed to us by a client or owed by us to a supplier. The
 * counterparty is typed in freely and matched (or created) by name, so
 * registering a brand-new debtor/supplier needs no prior setup in Contactos.
 */
export type CreateManualDebtInput = {
  contactName: string;
  contactType: "CLIENT" | "SUPPLIER";
  totalAmount: number;
  concept: string;
  dueDate?: string | null;
};

export async function createManualDebt(input: CreateManualDebtInput) {
  const business = await getCurrentBusiness();

  if (input.totalAmount <= 0) {
    throw new Error("El monto total debe ser mayor a cero.");
  }

  const contact = await resolveContactByName(business.id, input.contactName, input.contactType);
  const contactId = contact.id;
  const contactType = input.contactType;

  const activeRegister = await prisma.cashRegister.findFirst({
    where: { businessId: business.id, status: "OPEN" },
  });

  const type = contactType === "SUPPLIER" ? "EXPENSE" : "INCOME";

  // Stamp the exact moment of registration and freeze its day/date/hour labels
  // so the audit trail and reminder copy always show when it was created.
  const createdAt = new Date();
  const stamp = buildDebtTimestamp(createdAt);

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        businessId: business.id,
        cashRegisterId: activeRegister?.id ?? null,
        type,
        amount: input.totalAmount,
        paymentMethod: "CREDIT",
        concept: input.concept,
        contactId,
        createdAt,
      },
    });

    const debt = await tx.debt.create({
      data: {
        businessId: business.id,
        contactId,
        transactionId: transaction.id,
        description: input.concept,
        totalAmount: input.totalAmount,
        remainingAmount: input.totalAmount,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        createdAt,
        createdDayName: stamp.dayName,
        createdDateLabel: stamp.dateLabel,
        createdTimeLabel: stamp.timeLabel,
      },
    });

    return debt;
  });

  // If the due date already falls inside the reminder window, raise the alert
  // now instead of waiting for the next scheduled sweep.
  if (result.dueDate) {
    await generateDueDateReminders({ businessId: business.id });
  }

  revalidatePath("/cuentas-por-cobrar");
  revalidatePath("/cuentas-por-pagar");
  revalidatePath("/");
  revalidatePath("/contactos");

  // Prisma Decimal is not serializable across the server/client boundary, so
  // only plain values are returned.
  return {
    id: result.id,
    description: result.description,
    totalAmount: Number(result.totalAmount),
    remainingAmount: Number(result.remainingAmount),
    status: result.status,
    dueDate: result.dueDate ? result.dueDate.toISOString() : null,
    createdDayName: stamp.dayName,
    createdDateLabel: stamp.dateLabel,
    createdTimeLabel: stamp.timeLabel,
  };
}

export async function createDebtPayment(
  debtId: string,
  amount: number,
  paymentMethod: PaymentMethod,
  notes?: string | null
) {
  const business = await getCurrentBusiness();

  const debt = await prisma.debt.findFirst({
    where: { id: debtId, businessId: business.id },
    include: { contact: true },
  });
  if (!debt) throw new Error("Deuda no encontrada.");
  if (amount <= 0) throw new Error("El abono debe ser mayor a cero.");
  if (amount > Number(debt.remainingAmount)) {
    throw new Error("El abono no puede ser mayor al saldo pendiente.");
  }

  const activeRegister = await prisma.cashRegister.findFirst({
    where: { businessId: business.id, status: "OPEN" },
  });

  const transactionType = debt.contact.type === "SUPPLIER" ? "EXPENSE" : "INCOME";

  // Observación libre del abono (ej. "Cheque # 2264"). Se guarda como null
  // cuando viene vacía para no dejar cadenas en blanco en la base.
  const cleanNotes = notes?.trim() || null;

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        businessId: business.id,
        cashRegisterId: activeRegister?.id ?? null,
        type: transactionType,
        amount,
        paymentMethod,
        // La nota se anexa al concepto para que también sea legible desde Caja
        // y Reportes, que solo muestran transacciones.
        concept: cleanNotes
          ? `Abono a deuda - ${debt.contact.name} — ${cleanNotes}`
          : `Abono a deuda - ${debt.contact.name}`,
        contactId: debt.contactId,
      },
    });

    await tx.debtPayment.create({
      data: { debtId: debt.id, amount, paymentMethod, notes: cleanNotes, transactionId: transaction.id },
    });

    const newRemaining = Number(debt.remainingAmount) - amount;
    await tx.debt.update({
      where: { id: debt.id },
      data: {
        remainingAmount: newRemaining,
        status: newRemaining <= 0 ? "PAID" : "PARTIAL",
      },
    });

    return transaction;
  });

  revalidatePath("/cuentas-por-cobrar");
  revalidatePath("/cuentas-por-pagar");
  revalidatePath("/");
  revalidatePath("/contactos");
  revalidatePath("/reportes");

  return { transactionId: result.id, amount: Number(result.amount) };
}
