"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { deleteTransaction } from "@/lib/actions/caja";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import type { MovementItem } from "@/components/caja/MovementList";

export function DeleteTransactionDialog({
  movement,
  open,
  onOpenChange,
  onSuccess,
}: {
  movement: MovementItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const currency = useStore((s) => s.currency);
  const [loading, setLoading] = useState(false);

  if (!movement) return null;

  // Una venta fiada con abonos no se puede borrar sin destruir el registro del
  // dinero ya cobrado; se avisa antes de dejar pulsar.
  const blocked = movement.hasDebt && movement.debtPaymentCount > 0;

  const consequences: string[] = [];
  if (movement.saleItemCount > 0) {
    consequences.push(
      `Se devolverán al inventario los ${movement.saleItemCount} producto(s) de esta venta, junto con los insumos de sus recetas.`
    );
  }
  if (movement.isFromScan) {
    consequences.push(
      "Se revertirá el movimiento de inventario del documento escaneado y este quedará marcado como descartado."
    );
  }
  if (movement.isDebtPayment) {
    consequences.push(
      `Se devolverá ${formatCurrency(movement.amount, currency)} al saldo pendiente de la deuda y se recalculará su estado.`
    );
  }
  if (movement.hasDebt && !blocked) {
    consequences.push("Se eliminará también la deuda que generó esta venta a crédito.");
  }

  async function handleDelete() {
    if (!movement) return;
    setLoading(true);
    try {
      await deleteTransaction(movement.id);
      toast.success("Movimiento eliminado");
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error((error as Error).message || "No se pudo eliminar el movimiento");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar este registro?</DialogTitle>
          <DialogDescription>
            {movement.concept} · {formatCurrency(movement.amount, currency)}
          </DialogDescription>
        </DialogHeader>

        {blocked ? (
          <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Esta venta a crédito ya tiene {movement.debtPaymentCount} abono(s) cobrados. Elimina
              primero esos abonos, para no borrar el registro del dinero recibido.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esta acción devolverá el stock y ajustará las deudas.{" "}
              <span className="font-medium text-foreground">No se puede deshacer.</span>
            </p>
            {consequences.length > 0 && (
              <ul className="space-y-1.5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                {consequences.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span aria-hidden>•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1"
            onClick={handleDelete}
            disabled={loading || blocked}
          >
            {loading ? "Eliminando..." : "Sí, eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
