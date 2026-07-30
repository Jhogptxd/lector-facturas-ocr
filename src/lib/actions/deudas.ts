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
 * A debt is either owed to us by an existing client (picked from the directory)
 * or owed by us to a supplier the user types in freely.
 */
export type CreateManualDebtInput = {
  totalAmount: number;
  concept: string;
  dueDate?: string | null;
} & ({ contactId: string; supplierName?: never } | { supplierName: string; contactId?: never });

export async function createManualDebt(input: CreateManualDebtInput) {
  const business = await getCurrentBusiness();

  if (input.totalAmount <= 0) {
    throw new Error("El monto total debe ser mayor a cero.");
  }

  let contactId: string;
  let contactType: "CLIENT" | "SUPPLIER";

  if (input.supplierName !== undefined) {
    const supplier = await resolveContactByName(business.id, input.supplierName, "SUPPLIER");
    contactId = supplier.id;
    contactType = "SUPPLIER";
  } else {
    const contact = await prisma.contact.findFirstOrThrow({
      where: { id: input.contactId, businessId: business.id },
    });
    contactId = contact.id;
    contactType = contact.type;
  }

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

  revalidatePath("/deudas");
  revalidatePath("/");
  revalidatePath("/contactos");

  // Prisma Decimal is not serializable across the server/client boundary, so
  // only plain values are returned.
  return {
    id: result.id,
    totalAmount: Number(result.totalAmount),
    remainingAmount: Number(result.remainingAmount),
    status: result.status,
    dueDate: result.dueDate ? result.dueDate.toISOString() : null,
    createdDayName: stamp.dayName,
    createdDateLabel: stamp.dateLabel,
    createdTimeLabel: stamp.timeLabel,
  };
}

export async function createDebtPayment(debtId: string, amount: number, paymentMethod: PaymentMethod) {
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

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        businessId: business.id,
        cashRegisterId: activeRegister?.id ?? null,
        type: transactionType,
        amount,
        paymentMethod,
        concept: `Abono a deuda - ${debt.contact.name}`,
        contactId: debt.contactId,
      },
    });

    await tx.debtPayment.create({
      data: { debtId: debt.id, amount, paymentMethod, transactionId: transaction.id },
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

  revalidatePath("/deudas");
  revalidatePath("/");
  revalidatePath("/contactos");
  revalidatePath("/reportes");

  return { transactionId: result.id, amount: Number(result.amount) };
}
