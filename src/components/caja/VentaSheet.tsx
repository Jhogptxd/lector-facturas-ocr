"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Search, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useStore } from "@/store/useStore";
import { formatCurrency } from "@/lib/utils";
import type { SaleItemInput } from "@/lib/actions/caja";
import { ReceiptSheet } from "@/components/caja/ReceiptSheet";
import type { ReceiptData } from "@/lib/receipt";

type CartLine = { productId: string; name: string; quantity: number; unitPrice: number; unitCost: number; stock: number; unit: string };

export function VentaSheet({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const products = useStore((s) => s.products);
  const contacts = useStore((s) => s.contacts);
  const currency = useStore((s) => s.currency);
  const businessName = useStore((s) => s.businessName);
  const queueSale = useStore((s) => s.queueSale);
  const isOnline = useStore((s) => s.isOnline);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER" | "CREDIT">("CASH");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const clients = useMemo(() => contacts.filter((c) => c.type === "CLIENT"), [contacts]);
  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  const clientMatches = useMemo(() => {
    if (!clientSearch.trim()) return [];
    const q = clientSearch.trim().toLowerCase();
    return clients
      .filter((c) => c.name.toLowerCase().includes(q) || c.ruc?.toLowerCase().includes(q))
      .slice(0, 6);
  }, [clients, clientSearch]);

  const total = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  function resetForm() {
    setCart([]);
    setSelectedProductId("");
    setPaymentMethod("CASH");
    setClientSearch("");
    setSelectedClientId(null);
  }

  function unitLabel(unit: string) {
    return unit === "UNIT" ? "u." : unit.toLowerCase();
  }

  function addProduct(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    setCart((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        if (existing.quantity + 1 > product.stock) {
          toast.error(`Stock insuficiente. Disponible: ${product.stock} ${unitLabel(product.unit)}`);
          return prev;
        }
        return prev.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l));
      }
      if (product.stock < 1) {
        toast.error("Este producto no tiene stock disponible.");
        return prev;
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: product.price,
          unitCost: product.cost,
          stock: product.stock,
          unit: product.unit,
        },
      ];
    });
    setSelectedProductId("");
  }

  function incrementQuantity(productId: string) {
    setCart((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        if (l.quantity + 1 > l.stock) {
          toast.error(`Stock insuficiente. Disponible: ${l.stock} ${unitLabel(l.unit)}`);
          return l;
        }
        return { ...l, quantity: l.quantity + 1 };
      })
    );
  }

  function decrementQuantity(productId: string) {
    setCart((prev) => {
      const line = prev.find((l) => l.productId === productId);
      if (!line) return prev;
      if (line.quantity <= 1) {
        return prev.filter((l) => l.productId !== productId);
      }
      return prev.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity - 1 } : l));
    });
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  function selectClient(id: string, name: string) {
    setSelectedClientId(id);
    setClientSearch(name);
  }

  function clearClient() {
    setSelectedClientId(null);
    setClientSearch("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (cart.length === 0) {
      toast.error("Agrega al menos un producto para registrar la venta.");
      return;
    }
    if (paymentMethod === "CREDIT" && !selectedClientId) {
      toast.error("Selecciona un cliente para registrar la venta a fiado/crédito.");
      return;
    }

    const saleItems: SaleItemInput[] = cart.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
    }));

    const concept = `Venta - ${cart.length} producto(s)`;

    setLoading(true);
    try {
      const result = await queueSale({
        type: "INCOME",
        amount: total,
        paymentMethod,
        concept,
        contactId: selectedClientId,
        saleItems,
      });

      if (result.synced) {
        onSuccess();
        setReceipt({
          businessName,
          concept,
          items: cart.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice })),
          amount: total,
          paymentMethod,
          currency,
          createdAt: new Date(),
          clientName: selectedClient?.name ?? null,
        });
        resetForm();
      } else if (!isOnline) {
        toast.info("Sin conexión: la venta se guardó y se sincronizará automáticamente.");
        resetForm();
        onOpenChange(false);
      } else {
        toast.error("No se pudo registrar la venta.");
      }
    } catch (error) {
      toast.error((error as Error).message || "No se pudo registrar la venta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nueva venta</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Agregar producto</Label>
            <Select value={selectedProductId} onValueChange={addProduct}>
              <SelectTrigger>
                <SelectValue placeholder="Buscar producto en el catálogo..." />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => {
                  const inCart = cart.find((l) => l.productId === p.id);
                  const remaining = p.stock - (inCart?.quantity ?? 0);
                  return (
                    <SelectItem key={p.id} value={p.id} disabled={remaining <= 0}>
                      {p.name} · {formatCurrency(p.price, currency)} · Disponible: {remaining}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {cart.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Agrega al menos un producto del catálogo para continuar.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {cart.map((item) => {
                  const available = item.stock - item.quantity;
                  return (
                    <div key={item.productId} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(item.unitPrice, currency)} c/u · Stock disponible: {available}{" "}
                            {unitLabel(item.unit)}
                          </p>
                        </div>
                        <button type="button" onClick={() => removeFromCart(item.productId)} className="shrink-0">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => decrementQuantity(item.productId)}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-accent"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => incrementQuantity(item.productId)}
                            disabled={item.quantity >= item.stock}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span className="text-sm font-semibold">
                          {formatCurrency(item.quantity * item.unitPrice, currency)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-between rounded-lg border border-border p-3 text-base font-semibold">
            <span>Total</span>
            <span>{formatCurrency(total, currency)}</span>
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
                <SelectItem value="CREDIT">Fiado / Crédito</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              Cliente {paymentMethod === "CREDIT" ? "(obligatorio)" : "(opcional)"}
            </Label>
            {selectedClient ? (
              <div className="flex items-center justify-between rounded-lg border border-border p-2.5">
                <div>
                  <p className="text-sm font-medium">{selectedClient.name}</p>
                  {selectedClient.ruc && <p className="text-xs text-muted-foreground">RUC {selectedClient.ruc}</p>}
                </div>
                <button type="button" onClick={clearClient}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Buscar por nombre o RUC"
                  className="pl-9"
                />
                {clientMatches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-popover shadow-md">
                    {clientMatches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectClient(c.id, c.name)}
                        className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span>{c.name}</span>
                        {c.ruc && <span className="text-xs text-muted-foreground">RUC {c.ruc}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <SheetFooter>
            <Button type="submit" size="lg" disabled={loading || cart.length === 0}>
              {loading ? "Guardando..." : `Confirmar venta · ${formatCurrency(total, currency)}`}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>

      <ReceiptSheet
        data={receipt}
        contactPhone={selectedClient?.phone}
        onOpenChange={(receiptOpen) => {
          if (!receiptOpen) {
            setReceipt(null);
            onOpenChange(false);
          }
        }}
      />
    </Sheet>
  );
}
