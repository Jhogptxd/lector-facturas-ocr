"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DebtCard, type DebtItem } from "@/components/cuentas/DebtCard";
import { PaymentDialog } from "@/components/cuentas/PaymentDialog";
import { NewPayableDialog } from "@/components/cuentas/NewPayableDialog";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";

export function PayablesClient({
  payables,
  suppliers,
  businessName,
  currency,
}: {
  payables: DebtItem[];
  suppliers: { id: string; name: string }[];
  businessName: string;
  currency: string;
}) {
  const router = useRouter();
  const [payingDebt, setPayingDebt] = useState<DebtItem | null>(null);
  const [creating, setCreating] = useState(false);

  const totalPayable = payables.reduce((sum, d) => sum + d.remainingAmount, 0);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-24">
      <div>
        <h1 className="text-lg font-bold">Cuentas por Pagar</h1>
        <p className="text-sm text-muted-foreground">Lo que le debes a proveedores</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Total de tus deudas</p>
        <p className="text-2xl font-bold text-destructive">{formatCurrency(totalPayable, currency)}</p>
      </div>

      <div className="space-y-3">
        {payables.length === 0 && (
          <EmptyState
            icon={CheckCircle2}
            title="No le debes nada a nadie"
            description="Cuando registres una factura de proveedor a crédito, aparecerá acá con su fecha límite y su recordatorio."
          />
        )}
        {payables.map((d) => (
          <DebtCard
            key={d.id}
            debt={d}
            currency={currency}
            businessName={businessName}
            accentClassName="text-destructive"
            onPay={() => setPayingDebt(d)}
          />
        ))}
      </div>

      <Button
        size="icon"
        variant="destructive"
        className="fixed bottom-24 right-4 z-30 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setCreating(true)}
        aria-label="Registrar nueva deuda"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <PaymentDialog
        debt={payingDebt}
        open={!!payingDebt}
        onOpenChange={(open) => !open && setPayingDebt(null)}
        onSuccess={refresh}
      />

      <NewPayableDialog open={creating} onOpenChange={setCreating} suppliers={suppliers} onSuccess={refresh} />
    </div>
  );
}
