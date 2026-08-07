"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createDebtPayment } from "@/lib/actions/deudas";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import type { DebtItem } from "@/components/cuentas/DebtCard";

export function PaymentDialog({
  debt,
  open,
  onOpenChange,
  onSuccess,
}: {
  debt: DebtItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const currency = useStore((s) => s.currency);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER">("CASH");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  // Al reabrir el diálogo se parte de cero: el saldo actual y sin la nota del
  // abono anterior, que no tiene por qué arrastrarse al siguiente pago.
  useEffect(() => {
    if (open && debt) {
      setAmount(String(debt.remainingAmount));
      setPaymentMethod("CASH");
      setNotes("");
    }
  }, [open, debt]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!debt) return;
    setLoading(true);
    try {
      await createDebtPayment(debt.id, parseFloat(amount) || 0, paymentMethod, notes);
      toast.success("Abono registrado");
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error((error as Error).message || "No se pudo registrar el abono");
    } finally {
      setLoading(false);
    }
  }

  if (!debt) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abonar a {debt.contact.name}</DialogTitle>
          <DialogDescription>Saldo pendiente: {formatCurrency(debt.remainingAmount, currency)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="paymentAmount">Monto del abono</Label>
            <Input
              id="paymentAmount"
              type="number"
              min={0.01}
              step="0.01"
              max={debt.remainingAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Método de pago</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Efectivo</SelectItem>
                <SelectItem value="TRANSFER">Transferencia</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paymentNotes">
              Observaciones <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="paymentNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Cheque # 2264, nota de crédito, cruce de pagos..."
              rows={3}
              maxLength={500}
              className="min-h-[64px]"
            />
          </div>
          <DialogFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Guardando..." : "Registrar abono"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
