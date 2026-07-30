"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DebtCard, type DebtItem } from "@/components/cuentas/DebtCard";
import { PaymentDialog } from "@/components/cuentas/PaymentDialog";
import { NewReceivableDialog } from "@/components/cuentas/NewReceivableDialog";
import { formatCurrency } from "@/lib/utils";

export function ReceivablesClient({
  receivables,
  clients,
  businessName,
  currency,
}: {
  receivables: DebtItem[];
  clients: { id: string; name: string }[];
  businessName: string;
  currency: string;
}) {
  const router = useRouter();
  const [payingDebt, setPayingDebt] = useState<DebtItem | null>(null);
  const [creating, setCreating] = useState(false);

  const totalReceivable = receivables.reduce((sum, d) => sum + d.remainingAmount, 0);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-24">
      <div>
        <h1 className="text-lg font-bold">Cuentas por Cobrar</h1>
        <p className="text-sm text-muted-foreground">Clientes que te deben</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Total en la calle</p>
        <p className="text-2xl font-bold text-success">{formatCurrency(totalReceivable, currency)}</p>
      </div>

      <div className="space-y-3">
        {receivables.length === 0 && (
          <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No tienes cuentas por cobrar.
          </div>
        )}
        {receivables.map((d) => (
          <DebtCard
            key={d.id}
            debt={d}
            currency={currency}
            businessName={businessName}
            accentClassName="text-success"
            onPay={() => setPayingDebt(d)}
          />
        ))}
      </div>

      <Button
        size="icon"
        className="fixed bottom-24 right-4 z-30 h-14 w-14 rounded-full bg-success text-success-foreground shadow-lg hover:bg-success/90"
        onClick={() => setCreating(true)}
        aria-label="Registrar nuevo deudor"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <PaymentDialog
        debt={payingDebt}
        open={!!payingDebt}
        onOpenChange={(open) => !open && setPayingDebt(null)}
        onSuccess={refresh}
      />

      <NewReceivableDialog open={creating} onOpenChange={setCreating} clients={clients} onSuccess={refresh} />
    </div>
  );
}
