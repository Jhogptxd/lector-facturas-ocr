"use server";

import { revalidatePath } from "next/cache";
import { Prisma, PaymentMethod, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { businessDayRange } from "@/lib/datetime";
import { deductStockForSaleItems } from "@/lib/stock";
import { blockedReason, rollbackAndDelete } from "@/lib/transaction-rollback";

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

/**
 * Corrección de un movimiento ya registrado (error de tipeo en el monto o en la
 * descripción). Deliberadamente NO toca el stock ni las líneas de la venta: un
 * ajuste de inventario se hace desde Inventario, no corrigiendo un texto en
 * Caja. El método de pago solo alterna entre efectivo y transferencia, porque
 * pasar a/desde crédito crearía o dejaría huérfana una deuda.
 */
export type UpdateTransactionInput = {
  amount: number;
  concept: string;
  paymentMethod: "CASH" | "TRANSFER";
};

export async function updateTransaction(id: string, input: UpdateTransactionInput) {
  const business = await getCurrentBusiness();

  const existing = await prisma.transaction.findFirst({
    where: { id, businessId: business.id },
    include: { debt: true, debtPayments: true },
  });
  if (!existing) throw new Error("Movimiento no encontrado.");

  const concept = input.concept.trim();
  if (!concept) throw new Error("La descripción no puede quedar vacía.");
  if (!(input.amount > 0)) throw new Error("El monto debe ser mayor a cero.");

  const amountChanged = Math.abs(Number(existing.amount) - input.amount) > 0.0001;

  // Un abono es el espejo contable de un DebtPayment: cambiarle el monto aquí
  // dejaría el saldo de la deuda descuadrado.
  if (amountChanged && existing.debtPayments.length > 0) {
    throw new Error(
      "Este movimiento es el abono de una deuda. Puedes corregir la descripción, pero el monto debe ajustarse desde Cuentas por Cobrar o por Pagar."
    );
  }

  const isCredit = existing.paymentMethod === "CREDIT" || existing.debt !== null;
  if (isCredit && input.paymentMethod !== existing.paymentMethod) {
    throw new Error("No se puede cambiar el método de pago de una venta a crédito.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id },
      data: {
        amount: input.amount,
        concept,
        paymentMethod: isCredit ? existing.paymentMethod : input.paymentMethod,
      },
    });

    // Una venta fiada genera una deuda por el mismo valor: si se corrige el
    // monto, la deuda debe seguirlo conservando lo ya abonado.
    if (amountChanged && existing.debt) {
      const alreadyPaid = Number(existing.debt.totalAmount) - Number(existing.debt.remainingAmount);
      if (input.amount < alreadyPaid) {
        throw new Error(
          `La deuda de esta venta ya tiene abonos por ${alreadyPaid}. El nuevo monto no puede ser menor.`
        );
      }
      const remaining = input.amount - alreadyPaid;
      await tx.debt.update({
        where: { id: existing.debt.id },
        data: {
          totalAmount: input.amount,
          remainingAmount: remaining,
          status: remaining <= 0 ? "PAID" : alreadyPaid > 0 ? "PARTIAL" : "PENDING",
        },
      });
    }
  });

  revalidatePath("/");
  revalidatePath("/cuentas-por-cobrar");
  revalidatePath("/cuentas-por-pagar");
  revalidatePath("/reportes");
  revalidatePath("/contactos");

  return { id, amount: input.amount, concept };
}

/**
 * Elimina un movimiento deshaciendo todo lo que provocó al crearse.
 *
 * Hay tres orígenes de efectos secundarios y cada uno se revierte a su manera:
 * una venta normal descuenta stock vía SaleItem (y recetas); un escaneo
 * confirmado mueve stock directo sobre el producto, sin SaleItem, guardando el
 * detalle en DocumentScanItem; y un abono rebaja el saldo de una deuda.
 *
 * Se niega a borrar una venta a crédito que ya tenga abonos: eso destruiría el
 * registro de dinero realmente cobrado, así que primero hay que borrar los
 * abonos uno a uno.
 */
export async function deleteTransaction(id: string) {
  const business = await getCurrentBusiness();

  const existing = await prisma.transaction.findFirst({
    where: { id, businessId: business.id },
    include: {
      saleItems: true,
      debt: { include: { payments: true } },
      debtPayments: { include: { debt: true } },
      documentScan: { include: { items: true } },
    },
  });
  if (!existing) throw new Error("Movimiento no encontrado.");

  const blocked = blockedReason(existing);
  if (blocked) throw new Error(blocked);

  const summary = await prisma.$transaction((tx) => rollbackAndDelete(tx, existing));

  revalidatePath("/");
  revalidatePath("/cuentas-por-cobrar");
  revalidatePath("/cuentas-por-pagar");
  revalidatePath("/inventario");
  revalidatePath("/reportes");
  revalidatePath("/contactos");
  revalidatePath("/documentos");

  return summary;
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
    // debtPayments distingue un abono de una venta normal: su monto no se puede
    // corregir desde Caja sin descuadrar el saldo de la deuda.
    include: {
      category: true,
      contact: true,
      saleItems: { include: { product: true } },
      debtPayments: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/**
 * Todo lo que muestra la pantalla de Caja —totales y lista— derivado de un
 * único filtro, para que la tarjeta de resumen no pueda contradecir lo que se
 * ve abajo.
 *
 * Con caja abierta: los movimientos de esa caja. Sin caja abierta: solo los de
 * hoy registrados fuera de caja (`cashRegisterId: null`), de modo que al cerrar
 * el turno sus ventas desaparecen de la pantalla en el acto.
 */
export async function getShiftOverview() {
  const business = await getCurrentBusiness();

  const register = await prisma.cashRegister.findFirst({
    where: { businessId: business.id, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });

  const where: Prisma.TransactionWhereInput = register
    ? { businessId: business.id, cashRegisterId: register.id }
    : (() => {
        const { start, end } = businessDayRange();
        return { businessId: business.id, cashRegisterId: null, createdAt: { gte: start, lt: end } };
      })();

  // Los totales se calculan sobre TODAS las filas del filtro, mientras que la
  // lista se corta en 200: así el resumen sigue siendo exacto en un turno largo.
  const [totalsRows, transactions] = await Promise.all([
    prisma.transaction.findMany({ where, select: { type: true, paymentMethod: true, amount: true } }),
    prisma.transaction.findMany({
      where,
      include: {
        category: true,
        contact: true,
        saleItems: { include: { product: true } },
        debtPayments: { select: { id: true } },
        // La deuda y sus abonos deciden si el movimiento se puede borrar.
        debt: { select: { id: true, _count: { select: { payments: true } } } },
        documentScan: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const sum = (rows: typeof totalsRows) => rows.reduce((acc, t) => acc + Number(t.amount), 0);
  const income = totalsRows.filter((t) => t.type === "INCOME");
  const expense = totalsRows.filter((t) => t.type === "EXPENSE");

  const totalIncome = sum(income);
  const totalExpense = sum(expense);
  const cashIncome = sum(income.filter((t) => t.paymentMethod === "CASH"));
  const cashExpense = sum(expense.filter((t) => t.paymentMethod === "CASH"));

  return {
    scope: register ? ("REGISTER" as const) : ("DAY" as const),
    register,
    transactions,
    totalIncome,
    totalExpense,
    netBalance: totalIncome - totalExpense,
    // Sin caja abierta no hay base inicial que sumar.
    cashBalance: (register ? Number(register.initialAmount) : 0) + cashIncome - cashExpense,
    truncated: totalsRows.length > transactions.length,
  };
}

