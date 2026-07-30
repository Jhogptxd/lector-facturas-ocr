"use server";

import { revalidatePath } from "next/cache";
import { Prisma, PaymentMethod, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { deductStockForSaleItems } from "@/lib/actions/inventario";

export type SaleItemInput = {
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitPrice: number;
  unitCost?: number;
};

export type CreateTransactionInput = {
  type: TransactionType;
  amount: number;
  paymentMethod: PaymentMethod;
  concept: string;
  categoryId?: string | null;
  contactId?: string | null;
  dueDate?: string | null;
  saleItems?: SaleItemInput[];
};

export async function getActiveCashRegister() {
  const business = await getCurrentBusiness();
  return prisma.cashRegister.findFirst({
    where: { businessId: business.id, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });
}

export async function openCashRegister(initialAmount: number) {
  const business = await getCurrentBusiness();

  const existing = await prisma.cashRegister.findFirst({
    where: { businessId: business.id, status: "OPEN" },
  });
  if (existing) {
    throw new Error("Ya existe una caja abierta.");
  }

  const register = await prisma.cashRegister.create({
    data: { businessId: business.id, initialAmount },
  });

  revalidatePath("/");
  // Decimal is not serializable to Client Components; return plain values only.
  return { id: register.id, initialAmount: Number(register.initialAmount) };
}

export async function closeCashRegister(cashRegisterId: string, finalAmount: number) {
  const business = await getCurrentBusiness();

  const register = await prisma.cashRegister.findFirst({
    where: { id: cashRegisterId, businessId: business.id, status: "OPEN" },
  });
  if (!register) throw new Error("Caja no encontrada o ya cerrada.");

  const updated = await prisma.cashRegister.update({
    where: { id: cashRegisterId },
    data: { status: "CLOSED", closedAt: new Date(), finalAmount },
  });

  revalidatePath("/");
  return {
    id: updated.id,
    status: updated.status,
    finalAmount: updated.finalAmount ? Number(updated.finalAmount) : null,
  };
}

export async function createTransaction(input: CreateTransactionInput) {
  const business = await getCurrentBusiness();

  const activeRegister = await prisma.cashRegister.findFirst({
    where: { businessId: business.id, status: "OPEN" },
  });

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        businessId: business.id,
        cashRegisterId: activeRegister?.id ?? null,
        type: input.type,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        concept: input.concept,
        categoryId: input.categoryId || null,
        contactId: input.contactId || null,
        saleItems: input.saleItems?.length
          ? {
              create: input.saleItems.map((item) => ({
                productId: item.productId,
                variantId: item.variantId || null,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                unitCost: item.unitCost ?? 0,
              })),
            }
          : undefined,
      },
      include: { saleItems: true },
    });

    if (input.saleItems?.length) {
      await deductStockForSaleItems(tx, input.saleItems);
    }

    if (input.paymentMethod === "CREDIT") {
      if (!input.contactId) {
        throw new Error("Selecciona un contacto para ventas a crédito/fiado.");
      }
      await tx.debt.create({
        data: {
          businessId: business.id,
          contactId: input.contactId,
          transactionId: transaction.id,
          totalAmount: input.amount,
          remainingAmount: input.amount,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
        },
      });
    }

    return transaction;
  });

  revalidatePath("/");
  revalidatePath("/cuentas-por-cobrar");
  revalidatePath("/cuentas-por-pagar");
  revalidatePath("/inventario");
  revalidatePath("/reportes");

  return { id: result.id, amount: Number(result.amount), createdAt: result.createdAt.toISOString() };
}

export type TransactionFilters = {
  from?: string;
  to?: string;
  type?: TransactionType;
  paymentMethod?: PaymentMethod;
  cashRegisterId?: string;
};

export async function listTransactions(filters: TransactionFilters = {}) {
  const business = await getCurrentBusiness();

  const where: Prisma.TransactionWhereInput = { businessId: business.id };

  if (filters.type) where.type = filters.type;
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters.cashRegisterId) where.cashRegisterId = filters.cashRegisterId;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }

  return prisma.transaction.findMany({
    where,
    include: { category: true, contact: true, saleItems: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getCashSummary(cashRegisterId?: string) {
  const business = await getCurrentBusiness();

  const register =
    cashRegisterId
      ? await prisma.cashRegister.findFirst({ where: { id: cashRegisterId, businessId: business.id } })
      : await prisma.cashRegister.findFirst({
          where: { businessId: business.id, status: "OPEN" },
          orderBy: { openedAt: "desc" },
        });

  if (!register) {
    return { register: null, totalIncome: 0, totalExpense: 0, netBalance: 0, cashBalance: 0 };
  }

  const transactions = await prisma.transaction.findMany({
    where: { cashRegisterId: register.id },
  });

  const totalIncome = transactions
    .filter((t) => t.type === "INCOME")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const cashIncome = transactions
    .filter((t) => t.type === "INCOME" && t.paymentMethod === "CASH")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const cashExpense = transactions
    .filter((t) => t.type === "EXPENSE" && t.paymentMethod === "CASH")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return {
    register,
    totalIncome,
    totalExpense,
    netBalance: totalIncome - totalExpense,
    cashBalance: Number(register.initialAmount) + cashIncome - cashExpense,
  };
}
