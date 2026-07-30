import { getCashSummary, listTransactions } from "@/lib/actions/caja";
import { CajaClient } from "@/components/caja/CajaClient";

export default async function CajaPage() {
  const [summary, transactions] = await Promise.all([getCashSummary(), listTransactions()]);

  return (
    <CajaClient
      summary={{
        register: summary.register
          ? {
              id: summary.register.id,
              initialAmount: Number(summary.register.initialAmount),
              openedAt: summary.register.openedAt.toISOString(),
              status: summary.register.status,
            }
          : null,
        totalIncome: summary.totalIncome,
        totalExpense: summary.totalExpense,
        netBalance: summary.netBalance,
        cashBalance: summary.cashBalance,
      }}
      transactions={transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        paymentMethod: t.paymentMethod,
        concept: t.concept,
        createdAt: t.createdAt.toISOString(),
        categoryName: t.category?.name ?? null,
        contactName: t.contact?.name ?? null,
      }))}
    />
  );
}
