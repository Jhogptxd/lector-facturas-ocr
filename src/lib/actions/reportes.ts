"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { buildSeries } from "@/lib/reportes/series";

export type ReportRange = { from?: string; to?: string };

function resolveRange(range?: ReportRange) {
  const to = range?.to ? new Date(range.to) : new Date();
  const from = range?.from ? new Date(range.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function getDashboardMetrics(range?: ReportRange) {
  const business = await getCurrentBusiness();
  const { from, to } = resolveRange(range);

  const transactions = await prisma.transaction.findMany({
    where: { businessId: business.id, createdAt: { gte: from, lte: to } },
    include: { saleItems: { include: { product: true } } },
  });

  const incomeTransactions = transactions.filter((t) => t.type === "INCOME");
  const expenseTransactions = transactions.filter((t) => t.type === "EXPENSE");

  const totalIncome = incomeTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = expenseTransactions.reduce((sum, t) => sum + Number(t.amount), 0);

  const allSaleItems = transactions.flatMap((t) => t.saleItems);
  const productRevenue = allSaleItems.reduce((sum, i) => sum + Number(i.unitPrice) * Number(i.quantity), 0);
  const cogs = allSaleItems.reduce((sum, i) => sum + Number(i.unitCost) * Number(i.quantity), 0);

  const grossProfit = totalIncome - cogs;
  const netProfit = totalIncome - totalExpense - cogs;
  const averageTicket = incomeTransactions.length > 0 ? totalIncome / incomeTransactions.length : 0;
  const averageMarginPercent = productRevenue > 0 ? ((productRevenue - cogs) / productRevenue) * 100 : 0;

  const productTotals = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const item of allSaleItems) {
    const key = item.productId;
    const current = productTotals.get(key) ?? { name: item.product.name, quantity: 0, revenue: 0 };
    current.quantity += Number(item.quantity);
    current.revenue += Number(item.unitPrice) * Number(item.quantity);
    productTotals.set(key, current);
  }
  const rankedProducts = Array.from(productTotals.entries())
    .map(([productId, data]) => ({ productId, ...data }))
    .sort((a, b) => b.revenue - a.revenue);

  const topProducts = rankedProducts.slice(0, 5).map((p) => ({
    ...p,
    // Share of product revenue, not of total income: income without sale items
    // (a confirmed sale note, say) has no product to attribute it to, and
    // folding it in would make every slice understate its real weight.
    share: productRevenue > 0 ? (p.revenue / productRevenue) * 100 : 0,
  }));

  const otherRevenue = rankedProducts.slice(5).reduce((sum, p) => sum + p.revenue, 0);

  const { points: series, granularity } = buildSeries(transactions, from, to);

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    totalIncome,
    totalExpense,
    grossProfit,
    netProfit,
    averageTicket,
    averageMarginPercent,
    salesCount: incomeTransactions.length,
    topProducts,
    /** Revenue from products outside the top 5 — the pie's "Otros" slice. */
    otherRevenue,
    otherCount: Math.max(0, rankedProducts.length - 5),
    /** Denominator behind `share`. */
    productRevenue,
    series,
    granularity,
  };
}

export async function getSalesReportRows(range?: ReportRange) {
  const business = await getCurrentBusiness();
  const { from, to } = resolveRange(range);

  const transactions = await prisma.transaction.findMany({
    where: { businessId: business.id, type: "INCOME", createdAt: { gte: from, lte: to } },
    include: { contact: true, category: true },
    orderBy: { createdAt: "desc" },
  });

  return transactions.map((t) => ({
    Fecha: t.createdAt.toLocaleString("es-CO"),
    Concepto: t.concept,
    Monto: Number(t.amount),
    "Método de pago": t.paymentMethod,
    Categoría: t.category?.name ?? "",
    Contacto: t.contact?.name ?? "",
  }));
}

export async function getCashReportRows(range?: ReportRange) {
  const business = await getCurrentBusiness();
  const { from, to } = resolveRange(range);

  const registers = await prisma.cashRegister.findMany({
    where: { businessId: business.id, openedAt: { gte: from, lte: to } },
    orderBy: { openedAt: "desc" },
  });

  return registers.map((r) => ({
    Apertura: r.openedAt.toLocaleString("es-CO"),
    Cierre: r.closedAt ? r.closedAt.toLocaleString("es-CO") : "Abierta",
    "Monto inicial": Number(r.initialAmount),
    "Monto final": r.finalAmount ? Number(r.finalAmount) : "",
    Estado: r.status,
  }));
}

export async function getInventoryReportRows() {
  const business = await getCurrentBusiness();
  const products = await prisma.product.findMany({
    where: { businessId: business.id },
    include: { category: true },
    orderBy: { name: "asc" },
  });

  return products.map((p) => ({
    Producto: p.name,
    Categoría: p.category?.name ?? "",
    Precio: Number(p.price),
    Costo: Number(p.cost),
    Stock: Number(p.stock),
    Unidad: p.unit,
    "Alerta mínima": Number(p.minStockAlert),
  }));
}
