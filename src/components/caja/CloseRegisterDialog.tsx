"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { closeCashRegister } from "@/lib/actions/caja";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";

export function CloseRegisterDialog({
  open,
  onOpenChange,
  registerId,
  expectedCash,
  currency,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registerId: string | null;
  expectedCash: number;
  currency: string;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setAmount(String(expectedCash));
  }, [open, expectedCash]);

  const counted = parseFloat(amount) || 0;
  const difference = counted - expectedCash;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!registerId) return;
    setLoading(true);
    try {
      await closeCashRegister(registerId, counted);
      toast.success("Caja cerrada");
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error((error as Error).message || "No se pudo cerrar la caja");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar caja</DialogTitle>
          <DialogDescription>
            Efectivo esperado en caja: {formatCurrency(expectedCash, currency)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="finalAmount">Dinero contado en efectivo</Label>
            <Input
              id="finalAmount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
            />
          </div>
          {difference !== 0 && (
            <p className={difference > 0 ? "text-sm text-success" : "text-sm text-destructive"}>
              {difference > 0 ? "Sobrante" : "Faltante"}: {formatCurrency(Math.abs(difference), currency)}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Cerrando..." : "Confirmar cierre"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
