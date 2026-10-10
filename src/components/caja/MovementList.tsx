import { ArrowDownLeft, ArrowUpRight, Pencil, Receipt, ScanLine, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/datetime";

export type MovementItem = {
  id: string;
  type: string;
  amount: number;
  paymentMethod: string;
  concept: string;
  createdAt: string;
  categoryName: string | null;
  contactName: string | null;
  /** Número de líneas de venta: si es > 0, corregir el monto no toca el stock. */
  saleItemCount: number;
  /** El movimiento es el espejo de un abono a una deuda. */
  isDebtPayment: boolean;
  /** Venta a crédito que generó una deuda; borrarla la elimina también. */
  hasDebt: boolean;
  /** Número de abonos ya cobrados sobre esa deuda: si hay, no se puede borrar. */
  debtPaymentCount: number;
  /** Proviene de una factura o nota escaneada que movió inventario. */
  isFromScan: boolean;
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CREDIT: "Fiado",
};

export function MovementList({
  items,
  currency,
  onView,
  onEdit,
  onDelete,
}: {
  items: MovementItem[];
  currency: string;
  onView: (item: MovementItem) => void;
  onEdit: (item: MovementItem) => void;
  onDelete: (item: MovementItem) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Aún no hay movimientos"
        description="Registra una venta con el botón de arriba y aparecerá acá, con su detalle y su comprobante."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 pb-4">
      {items.map((item) => {
        const isIncome = item.type === "INCOME";
        return (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
          >
            {/* Abrir el detalle es un botón de verdad y no la fila entera: así
                no queda un control interactivo envolviendo a los de corregir y
                eliminar, y el teclado lo alcanza sin ayuda. */}
            <button
              type="button"
              onClick={() => onView(item)}
              aria-label={`Ver detalle de ${item.concept}`}
              className="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  isIncome ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                )}
              >
                {isIncome ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{item.concept}</span>
                  {/* Marca los movimientos que traen comprobante fotografiado,
                      para que se note que el detalle tiene algo más que ver. */}
                  {item.isFromScan && (
                    <ScanLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(item.createdAt)}
                  {item.contactName ? ` · ${item.contactName}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={cn("text-sm font-semibold", isIncome ? "text-success" : "text-destructive")}>
                  {isIncome ? "+" : "-"}
                  {formatCurrency(item.amount, currency)}
                </span>
                <Badge variant={item.paymentMethod === "CREDIT" ? "warning" : "outline"} className="text-[10px]">
                  {PAYMENT_LABEL[item.paymentMethod] ?? item.paymentMethod}
                </Badge>
              </div>
            </button>
            <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                onClick={() => onEdit(item)}
                title="Corregir movimiento"
                aria-label={`Corregir ${item.concept}`}
                className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(item)}
                title="Eliminar movimiento"
                aria-label={`Eliminar ${item.concept}`}
                className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
