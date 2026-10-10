"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { updateTransaction } from "@/lib/actions/caja";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { MovementItem } from "@/components/caja/MovementList";

export function EditTransactionDialog({
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
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER">("CASH");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && movement) {
      setAmount(String(movement.amount));
      setConcept(movement.concept);
      setPaymentMethod(movement.paymentMethod === "TRANSFER" ? "TRANSFER" : "CASH");
    }
  }, [open, movement]);

  if (!movement) return null;

  const isCredit = movement.paymentMethod === "CREDIT";
  // El monto de un abono no se toca aquí: es el reflejo de un pago que ya
  // rebajó el saldo de una deuda.
  const amountLocked = movement.isDebtPayment;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!movement) return;
    setLoading(true);
    try {
      await updateTransaction(movement.id, {
        amount: amountLocked ? movement.amount : parseFloat(amount) || 0,
        concept,
        paymentMethod,
      });
      toast.success("Movimiento corregido");
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error((error as Error).message || "No se pudo corregir el movimiento");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corregir movimiento</DialogTitle>
          <DialogDescription>
            Ajusta el monto o la descripción si hubo un error de tipeo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="editConcept">Descripción</Label>
            <Input
              id="editConcept"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="editAmount">Monto</Label>
            <Input
              id="editAmount"
              type="number"
              min={0.01}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={amountLocked}
              required
            />
            {amountLocked && (
              <p className="text-xs text-muted-foreground">
                Es el abono de una deuda: su monto se ajusta desde Cuentas por Cobrar o por Pagar.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Método de pago</Label>
            <Select
              value={isCredit ? "CREDIT" : paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as "CASH" | "TRANSFER")}
              disabled={isCredit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isCredit ? (
                  <SelectItem value="CREDIT">Fiado</SelectItem>
                ) : (
                  <>
                    <SelectItem value="CASH">Efectivo</SelectItem>
                    <SelectItem value="TRANSFER">Transferencia</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            {isCredit && (
              <p className="text-xs text-muted-foreground">
                Una venta fiada no cambia de método de pago. Al corregir el monto, la deuda se
                actualiza sola.
              </p>
            )}
          </div>

          {movement.saleItemCount > 0 && (
            <div className="flex gap-2 rounded-lg border border-warning-border bg-warning-surface p-2.5 text-xs text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                Esta venta tiene {movement.saleItemCount}{" "}
                {movement.saleItemCount === 1 ? "producto" : "productos"}. Corregir el monto no
                modifica el stock ni las líneas de la venta; si el inventario quedó mal, ajústalo
                desde Inventario.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
