import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getShiftOverview } from "@/lib/actions/caja";
import { CajaClient } from "@/components/caja/CajaClient";

export default async function CajaPage() {
  // El middleware solo verifica que la cookie exista, no que apunte a un
  // usuario real, y esta página se renderiza en paralelo con el layout. Sin
  // esta comprobación una sesión caduca revienta con "excepción de servidor"
  // en vez de mandar al login.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const shift = await getShiftOverview();

  return (
    <CajaClient
      summary={{
        register: shift.register
          ? {
              id: shift.register.id,
              initialAmount: Number(shift.register.initialAmount),
              openedAt: shift.register.openedAt.toISOString(),
              status: shift.register.status,
            }
          : null,
        totalIncome: shift.totalIncome,
        totalExpense: shift.totalExpense,
        netBalance: shift.netBalance,
        cashBalance: shift.cashBalance,
      }}
      transactions={shift.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        paymentMethod: t.paymentMethod,
        concept: t.concept,
        createdAt: t.createdAt.toISOString(),
        categoryName: t.category?.name ?? null,
        contactName: t.contact?.name ?? null,
        saleItemCount: t.saleItems.length,
        isDebtPayment: t.debtPayments.length > 0,
      }))}
      scope={shift.scope}
    />
  );
}
