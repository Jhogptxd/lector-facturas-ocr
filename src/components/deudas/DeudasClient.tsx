"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DebtCard, type DebtItem } from "@/components/deudas/DebtCard";
import { PaymentDialog } from "@/components/deudas/PaymentDialog";
import { NewDebtDialog } from "@/components/deudas/NewDebtDialog";
import { formatCurrency } from "@/lib/utils";

type ContactOption = { id: string; name: string };

export function DeudasClient({
  receivables,
  payables,
  clients,
  businessName,
  currency,
}: {
  receivables: DebtItem[];
  payables: DebtItem[];
  clients: ContactOption[];
  businessName: string;
  currency: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("cobrar");
  const [payingDebt, setPayingDebt] = useState<DebtItem | null>(null);
  const [creating, setCreating] = useState(false);

  const totalReceivable = receivables.reduce((sum, d) => sum + d.remainingAmount, 0);
  const totalPayable = payables.reduce((sum, d) => sum + d.remainingAmount, 0);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-20">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="cobrar" className="flex-1">
            Por cobrar
          </TabsTrigger>
          <TabsTrigger value="pagar" className="flex-1">
            Por pagar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cobrar" className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total por cobrar</p>
            <p className="text-2xl font-bold text-success">{formatCurrency(totalReceivable, currency)}</p>
          </div>
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
              onPay={() => setPayingDebt(d)}
            />
          ))}
        </TabsContent>

        <TabsContent value="pagar" className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total por pagar</p>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(totalPayable, currency)}</p>
          </div>
          {payables.length === 0 && (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No tienes cuentas por pagar.
            </div>
          )}
          {payables.map((d) => (
            <DebtCard
              key={d.id}
              debt={d}
              currency={currency}
              businessName={businessName}
              onPay={() => setPayingDebt(d)}
            />
          ))}
        </TabsContent>
      </Tabs>

      <Button
        size="icon"
        className="fixed bottom-24 right-4 z-30 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setCreating(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>

      <PaymentDialog
        debt={payingDebt}
        open={!!payingDebt}
        onOpenChange={(open) => !open && setPayingDebt(null)}
        onSuccess={refresh}
      />

      <NewDebtDialog open={creating} onOpenChange={setCreating} clients={clients} onSuccess={refresh} />
    </div>
  );
}
