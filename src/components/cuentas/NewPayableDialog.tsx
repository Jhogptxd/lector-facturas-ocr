"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createManualDebt } from "@/lib/actions/deudas";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewPayableDialog({
  open,
  onOpenChange,
  suppliers,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: { id: string; name: string }[];
  onSuccess: () => void;
}) {
  const [supplierName, setSupplierName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);

  function resetFields() {
    setSupplierName("");
    setTotalAmount("");
    setConcept("");
    setDueDate("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!supplierName.trim()) {
      toast.error("Escribe el nombre del proveedor.");
      return;
    }

    setLoading(true);
    try {
      await createManualDebt({
        contactName: supplierName.trim(),
        contactType: "SUPPLIER",
        totalAmount: parseFloat(totalAmount) || 0,
        concept: concept || "Compra a crédito",
        dueDate: dueDate || null,
      });

      toast.success("Deuda registrada");
      resetFields();
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error((error as Error).message || "No se pudo registrar la deuda");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva deuda a proveedor</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="supplierName">Proveedor</Label>
            <Input
              id="supplierName"
              list="payable-suppliers"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Escribe o elige un proveedor existente"
              autoComplete="off"
              required
            />
            <datalist id="payable-suppliers">
              {suppliers.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="totalAmount">Monto total</Label>
            <Input
              id="totalAmount"
              type="number"
              min={0.01}
              step="0.01"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="concept">Descripción (motivo de la deuda)</Label>
            <Input
              id="concept"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Ej. Mercancía a crédito"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dueDate">Fecha límite (opcional)</Label>
            <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Te avisaremos automáticamente una semana antes de esta fecha.
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Guardando..." : "Registrar deuda"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
