import type { Prisma } from "@prisma/client";

/**
 * Movimientos de inventario, en un módulo puro y sin `server-only`: los
 * consumen tanto las acciones de servidor como la lógica de reversión, y así
 * pueden ejercitarse en pruebas sin arrastrar el contexto de una petición.
 */
export type StockMovementItem = {
  productId: string;
  variantId?: string | null;
  quantity: number;
};

/**
 * Descuenta lo vendido: la variante si la hay, si no el producto, y siempre los
 * insumos que su receta consume.
 */
export async function deductStockForSaleItems(
  tx: Prisma.TransactionClient,
  items: StockMovementItem[]
) {
  await moveStock(tx, items, -1);
}

/**
 * Devuelve al inventario lo que una venta eliminada había descontado. Es el
 * espejo exacto de `deductStockForSaleItems` —insumos de receta incluidos—,
 * porque cualquier asimetría entre ambas descuadra el stock.
 */
export async function restoreStockForSaleItems(
  tx: Prisma.TransactionClient,
  items: StockMovementItem[]
) {
  await moveStock(tx, items, 1);
}

async function moveStock(
  tx: Prisma.TransactionClient,
  items: StockMovementItem[],
  sign: 1 | -1
) {
  for (const item of items) {
    const delta = sign * item.quantity;

    if (item.variantId) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stock: { increment: delta } },
      });
    } else {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: delta } },
      });
    }

    const recipes = await tx.recipe.findMany({ where: { productId: item.productId } });
    for (const recipe of recipes) {
      await tx.product.update({
        where: { id: recipe.ingredientId },
        data: { stock: { increment: sign * Number(recipe.quantityUsed) * item.quantity } },
      });
    }
  }
}
