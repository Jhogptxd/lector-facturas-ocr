"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createManualDebt } from "@/lib/actions/deudas";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

type ContactOption = { id: string; name: string };

export function NewDebtDialog({
  open,
  onOpenChange,
  clients,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ContactOption[];
  onSuccess: () => void;
}) {
  const [kind, setKind] = useState<"cobrar" | "pagar">("cobrar");
  const [contactId, setContactId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);

  function resetFields() {
    setContactId("");
    setSupplierName("");
    setTotalAmount("");
    setConcept("");
    setDueDate("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const isSupplier = kind === "pagar";

    if (isSupplier && !supplierName.trim()) {
      toast.error("Escribe el nombre del proveedor.");
      return;
    }
    if (!isSupplier && !contactId) {
      toast.error("Selecciona un cliente.");
      return;
    }

    setLoading(true);
    try {
      const shared = {
        totalAmount: parseFloat(totalAmount) || 0,
        concept: concept || (isSupplier ? "Compra a crédito" : "Venta a crédito"),
        dueDate: dueDate || null,
      };

      await createManualDebt(
        isSupplier
          ? { ...shared, supplierName: supplierName.trim() }
          : { ...shared, contactId }
      );

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
          <DialogTitle>Nueva deuda</DialogTitle>
        </DialogHeader>

        <Tabs
          value={kind}
          onValueChange={(v) => {
            setKind(v as "cobrar" | "pagar");
            setContactId("");
            setSupplierName("");
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="cobrar" className="flex-1">
              Cliente me debe
            </TabsTrigger>
            <TabsTrigger value="pagar" className="flex-1">
              Le debo a proveedor
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={handleSubmit} className="space-y-4">
          {kind === "pagar" ? (
            <div className="space-y-1.5">
              <Label htmlFor="supplierName">Proveedor</Label>
              <Input
                id="supplierName"
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Escribe el nombre de la empresa o proveedor"
                autoComplete="off"
                required
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
            <Label htmlFor="concept">Concepto</Label>
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
            {kind === "pagar" && (
              <p className="text-xs text-muted-foreground">
                Te avisaremos automáticamente una semana antes de esta fecha.
              </p>
            )}
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
