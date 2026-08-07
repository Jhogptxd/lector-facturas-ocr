import type { Prisma } from "@prisma/client";
import { restoreStockForSaleItems } from "@/lib/stock";

/**
 * Deshacer un movimiento no es borrar una fila: al crearse pudo descontar
 * stock, mover inventario desde un documento escaneado o rebajar el saldo de
 * una deuda. Esta lógica vive fuera de `caja.ts` porque un archivo "use server"
 * solo puede exportar acciones async, y así puede probarse directamente.
 */
export type DeletableTransaction = Prisma.TransactionGetPayload<{
  include: {
    saleItems: true;
    debt: { include: { payments: true } };
    debtPayments: { include: { debt: true } };
    documentScan: { include: { items: true } };
  };
}>;

export type RollbackSummary = {
  stockRestored: number;
  debtsAdjusted: number;
  debtsDeleted: number;
};

/**
 * Motivo por el que un movimiento no se puede borrar, o null si sí se puede.
 * Borrar una venta a crédito que ya tiene abonos destruiría el registro del
 * dinero realmente cobrado.
 */
export function blockedReason(t: DeletableTransaction): string | null {
  if (t.debt && t.debt.payments.length > 0) {
    return `Esta venta a crédito ya tiene ${t.debt.payments.length} abono(s) registrados. Elimina primero esos abonos para no perder el registro del dinero cobrado.`;
  }
  return null;
}

/** Revierte todos los efectos del movimiento y lo elimina. Debe correr dentro de una transacción. */
export async function rollbackAndDelete(
  tx: Prisma.TransactionClient,
  t: DeletableTransaction
): Promise<RollbackSummary> {
  const summary: RollbackSummary = { stockRestored: 0, debtsAdjusted: 0, debtsDeleted: 0 };

  const blocked = blockedReason(t);
  if (blocked) throw new Error(blocked);

  // 1. Venta normal: devolver stock de productos, variantes e insumos de receta.
  if (t.saleItems.length > 0) {
    await restoreStockForSaleItems(
      tx,
      t.saleItems.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: Number(item.quantity),
      }))
    );
    summary.stockRestored += t.saleItems.length;
  }

  // 2. Escaneo confirmado: mueve stock directo sobre el producto, sin SaleItem.
  //    Una factura de compra sumó unidades y una nota de venta las restó; las
  //    líneas con stockPreapplied nunca movieron nada.
  if (t.documentScan) {
    const wasPurchase = t.documentScan.docType === "SUPPLIER_INVOICE";
    for (const item of t.documentScan.items) {
      const quantity = Number(item.quantity);
      if (!item.productId || item.stockPreapplied || quantity === 0) continue;
      await tx.product.update({
        where: { id: item.productId },
        data: wasPurchase ? { stock: { decrement: quantity } } : { stock: { increment: quantity } },
      });
      summary.stockRestored += 1;
    }

    // Se marca descartado en vez de volver a DRAFT: la imagen se borra al
    // confirmar, así que el borrador ya no podría revisarse.
    await tx.documentScan.update({
      where: { id: t.documentScan.id },
      data: { status: "DISCARDED", transactionId: null, confirmedAt: null },
    });
  }

  // 3. Abono: devolver el monto al saldo de la deuda y recalcular su estado.
  for (const payment of t.debtPayments) {
    const total = Number(payment.debt.totalAmount);
    const restored = Math.min(total, Number(payment.debt.remainingAmount) + Number(payment.amount));
    await tx.debt.update({
      where: { id: payment.debtId },
      data: {
        remainingAmount: restored,
        status: restored <= 0 ? "PAID" : restored >= total ? "PENDING" : "PARTIAL",
      },
    });
    // transactionId es opcional: al borrar la transacción el abono quedaría en
    // null en vez de desaparecer, así que se elimina explícitamente.
    await tx.debtPayment.delete({ where: { id: payment.id } });
    summary.debtsAdjusted += 1;
  }

  // 4. Venta a crédito sin abonos: la deuda nació de este movimiento.
  if (t.debt) {
    await tx.debt.delete({ where: { id: t.debt.id } });
    summary.debtsDeleted += 1;
  }

  // SaleItem tiene onDelete: Cascade, así que las líneas se van con la fila.
  await tx.transaction.delete({ where: { id: t.id } });

  return summary;
}
