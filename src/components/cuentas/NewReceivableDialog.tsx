"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createManualDebt } from "@/lib/actions/deudas";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewReceivableDialog({
  open,
  onOpenChange,
  clients,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: { id: string; name: string }[];
  onSuccess: () => void;
}) {
  const [clientName, setClientName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);

  function resetFields() {
    setClientName("");
    setTotalAmount("");
    setConcept("");
    setDueDate("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!clientName.trim()) {
      toast.error("Escribe el nombre del cliente.");
      return;
    }

    setLoading(true);
    try {
      await createManualDebt({
        contactName: clientName.trim(),
        contactType: "CLIENT",
        totalAmount: parseFloat(totalAmount) || 0,
        concept: concept || "Venta a crédito",
        dueDate: dueDate || null,
      });

      toast.success("Deudor registrado");
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
          <DialogTitle>Nuevo deudor</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="clientName">Cliente</Label>
            <Input
              id="clientName"
              list="receivable-clients"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Escribe o elige un cliente existente"
              autoComplete="off"
              required
            />
            <datalist id="receivable-clients">
              {clients.map((c) => (
                <option key={c.id} value={c.name} />
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
              placeholder="Ej. Venta de mercancía a crédito"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dueDate">Fecha límite (opcional)</Label>
            <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Guardando..." : "Registrar deudor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
