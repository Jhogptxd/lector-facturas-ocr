"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Lock, ScanLine, ShoppingCart, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useStore } from "@/store/useStore";
import { formatCurrency } from "@/lib/utils";
import { OpenRegisterDialog } from "@/components/caja/OpenRegisterDialog";
import { CloseRegisterDialog } from "@/components/caja/CloseRegisterDialog";
import { VentaSheet } from "@/components/caja/VentaSheet";
import { EditTransactionDialog } from "@/components/caja/EditTransactionDialog";
import { MovementList, type MovementItem } from "@/components/caja/MovementList";

type Summary = {
  register: { id: string; initialAmount: number; openedAt: string; status: string } | null;
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  cashBalance: number;
};

export function CajaClient({
  summary,
  transactions,
  scope,
}: {
  summary: Summary;
  transactions: MovementItem[];
  /** Qué está listando la pantalla: la caja abierta o el día en curso. */
  scope: "REGISTER" | "DAY";
}) {
  const router = useRouter();
  const currency = useStore((s) => s.currency);

  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [ventaOpen, setVentaOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<MovementItem | null>(null);

  const [filterType, setFilterType] = useState<"ALL" | "INCOME" | "EXPENSE">("ALL");

  const filteredTransactions = useMemo(() => {
    if (filterType === "ALL") return transactions;
    return transactions.filter((t) => t.type === filterType);
  }, [transactions, filterType]);

  function refresh() {
    router.refresh();
  }

  const scopeLabel =
    scope === "REGISTER" ? "Caja abierta · turno actual" : "Hoy · movimientos fuera de caja";

  return (
    <div className="flex flex-col gap-4 px-4 pt-4">
      <Card className="border-primary/20 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md">
        <CardContent className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-primary-foreground/80">
            Balance neto (ingresos - gastos)
          </p>
          {/* El alcance va en la tarjeta y en la lista: ambos salen del mismo
              filtro, así que nunca pueden contradecirse. */}
          <p className="text-xs text-primary-foreground/70">{scopeLabel}</p>
          <p className="mt-1 text-3xl font-bold">{formatCurrency(summary.netBalance, currency)}</p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-white/15 px-3 py-2">
              <p className="text-xs text-primary-foreground/80">Ingresos</p>
              <p className="font-semibold">{formatCurrency(summary.totalIncome, currency)}</p>
            </div>
            <div className="rounded-lg bg-white/15 px-3 py-2">
              <p className="text-xs text-primary-foreground/80">Gastos</p>
              <p className="font-semibold">{formatCurrency(summary.totalExpense, currency)}</p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg bg-white/10 px-3 py-2">
            <div>
              <p className="text-xs text-primary-foreground/80">
                {summary.register ? "Caja abierta · Efectivo esperado" : "Caja cerrada"}
              </p>
              {summary.register && (
                <p className="font-semibold">{formatCurrency(summary.cashBalance, currency)}</p>
              )}
            </div>
            {summary.register ? (
              <Button size="sm" variant="secondary" onClick={() => setCloseDialog(true)}>
                <Lock className="mr-1 h-3.5 w-3.5" /> Cerrar caja
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setOpenDialog(true)}>
                <Unlock className="mr-1 h-3.5 w-3.5" /> Abrir caja
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Button size="lg" className="h-14 w-full text-base" onClick={() => setVentaOpen(true)}>
        <ShoppingCart className="mr-2 h-5 w-5" /> Venta
      </Button>

      <Button asChild variant="outline" className="w-full">
        <Link href="/documentos">
          <ScanLine className="mr-2 h-4 w-4" /> Escanear factura o nota de venta
        </Link>
      </Button>

      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {scope === "REGISTER" ? "Movimientos de la caja abierta" : "Movimientos de hoy fuera de caja"}
        </h2>
        <span className="text-xs text-muted-foreground">
          {transactions.length} {transactions.length === 1 ? "movimiento" : "movimientos"}
        </span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {(["ALL", "INCOME", "EXPENSE"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
              (filterType === type
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground")
            }
          >
            {type === "ALL" ? "Todos" : type === "INCOME" ? "Ingresos" : "Gastos"}
          </button>
        ))}
      </div>

      <MovementList items={filteredTransactions} currency={currency} onEdit={setEditingMovement} />

      <EditTransactionDialog
        movement={editingMovement}
        open={!!editingMovement}
        onOpenChange={(open) => !open && setEditingMovement(null)}
        onSuccess={refresh}
      />

      <OpenRegisterDialog open={openDialog} onOpenChange={setOpenDialog} onSuccess={refresh} />
      <CloseRegisterDialog
        open={closeDialog}
        onOpenChange={setCloseDialog}
        registerId={summary.register?.id ?? null}
        expectedCash={summary.cashBalance}
        currency={currency}
        onSuccess={refresh}
      />
      <VentaSheet
        open={ventaOpen}
        onOpenChange={setVentaOpen}
        onSuccess={() => {
          refresh();
          toast.success("Venta registrada");
        }}
      />
    </div>
  );
}
