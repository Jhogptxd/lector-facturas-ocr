import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, cn } from "@/lib/utils";

export type MovementItem = {
  id: string;
  type: string;
  amount: number;
  paymentMethod: string;
  concept: string;
  createdAt: string;
  categoryName: string | null;
  contactName: string | null;
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CREDIT: "Fiado",
};

export function MovementList({ items, currency }: { items: MovementItem[]; currency: string }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        Aún no hay movimientos registrados.
      </div>
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
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                isIncome ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
              )}
            >
              {isIncome ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.concept}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                {item.contactName ? ` · ${item.contactName}` : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={cn("text-sm font-semibold", isIncome ? "text-success" : "text-destructive")}>
                {isIncome ? "+" : "-"}
                {formatCurrency(item.amount, currency)}
              </span>
              <Badge variant={item.paymentMethod === "CREDIT" ? "warning" : "outline"} className="text-[10px]">
                {PAYMENT_LABEL[item.paymentMethod] ?? item.paymentMethod}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
