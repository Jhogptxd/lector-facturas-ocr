"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Lock, RefreshCw, ScanLine, ShoppingCart, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { AnimatedCurrency } from "@/components/ui/animated-number";
import { tapFeedback } from "@/lib/haptics";
import { OpenRegisterDialog } from "@/components/caja/OpenRegisterDialog";
import { CloseRegisterDialog } from "@/components/caja/CloseRegisterDialog";
import { VentaSheet } from "@/components/caja/VentaSheet";
import { EditTransactionDialog } from "@/components/caja/EditTransactionDialog";
import { DeleteTransactionDialog } from "@/components/caja/DeleteTransactionDialog";
import { TransactionDetailDialog } from "@/components/caja/TransactionDetailDialog";
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
  const [viewingMovement, setViewingMovement] = useState<MovementItem | null>(null);
  const [editingMovement, setEditingMovement] = useState<MovementItem | null>(null);
  const [deletingMovement, setDeletingMovement] = useState<MovementItem | null>(null);

  const [filterType, setFilterType] = useState<"ALL" | "INCOME" | "EXPENSE">("ALL");

  const filteredTransactions = useMemo(() => {
    if (filterType === "ALL") return transactions;
    return transactions.filter((t) => t.type === filterType);
  }, [transactions, filterType]);

  const [isRefreshing, startRefresh] = useTransition();

  function refresh() {
    startRefresh(() => router.refresh());
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
          <AnimatedCurrency
            value={summary.netBalance}
            currency={currency}
            className="mt-1 block text-3xl font-bold"
          />

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-white/15 px-3 py-2">
              <p className="text-xs text-primary-foreground/80">Ingresos</p>
              <AnimatedCurrency
                value={summary.totalIncome}
                currency={currency}
                className="block font-semibold"
              />
            </div>
            <div className="rounded-lg bg-white/15 px-3 py-2">
              <p className="text-xs text-primary-foreground/80">Gastos</p>
              <AnimatedCurrency
                value={summary.totalExpense}
                currency={currency}
                className="block font-semibold"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg bg-white/10 px-3 py-2">
            <div>
              <p className="text-xs text-primary-foreground/80">
                {summary.register ? "Caja abierta · Efectivo esperado" : "Caja cerrada"}
              </p>
              {summary.register && (
                <AnimatedCurrency
                  value={summary.cashBalance}
                  currency={currency}
                  className="block font-semibold"
                />
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {transactions.length} {transactions.length === 1 ? "movimiento" : "movimientos"}
          </span>
          <button
            type="button"
            onClick={() => {
              tapFeedback();
              refresh();
            }}
            disabled={isRefreshing}
            aria-label="Actualizar movimientos"
            className="tappable rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {(["ALL", "INCOME", "EXPENSE"] as const).map((type) => {
          const active = filterType === type;
          const count =
            type === "ALL"
              ? transactions.length
              : transactions.filter((t) => t.type === type).length;
          return (
            <button
              key={type}
              onClick={() => {
                tapFeedback();
                setFilterType(type);
              }}
              // `aria-pressed` marca el filtro elegido para quien no ve el color.
              aria-pressed={active}
              className={cn(
                "tappable flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground"
              )}
            >
              {type === "ALL" ? "Todos" : type === "INCOME" ? "Ingresos" : "Gastos"}
              {/* El contador por filtro ahorra tocar para descubrir que está
                  vacío. */}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] tabular-nums",
                  active ? "bg-primary-foreground/20" : "bg-muted"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <MovementList
        items={filteredTransactions}
        currency={currency}
        onView={setViewingMovement}
        onEdit={setEditingMovement}
        onDelete={setDeletingMovement}
      />

      <TransactionDetailDialog
        movement={viewingMovement}
        open={!!viewingMovement}
        onOpenChange={(open) => !open && setViewingMovement(null)}
        onEdit={setEditingMovement}
        onDelete={setDeletingMovement}
      />

      <EditTransactionDialog
        movement={editingMovement}
        open={!!editingMovement}
        onOpenChange={(open) => !open && setEditingMovement(null)}
        onSuccess={refresh}
      />

      <DeleteTransactionDialog
        movement={deletingMovement}
        open={!!deletingMovement}
        onOpenChange={(open) => !open && setDeletingMovement(null)}
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
