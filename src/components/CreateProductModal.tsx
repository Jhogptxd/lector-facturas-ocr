"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PackagePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createQuickProduct, type QuickProduct } from "@/lib/actions/documentos";

/** Suggested markup over cost when proposing a sale price. */
const DEFAULT_MARKUP = 1.3;

export type CreateProductInitialData = {
  /** Index of the draft line this product is being created for. */
  lineIndex: number;
  description: string;
  unitPrice: number;
  quantity: number;
};

/**
 * Quick-create dialog for a product read off a scanned document.
 *
 * Built on the app's Dialog primitives rather than a hand-rolled overlay so it
 * inherits the theme (radius, border and background tokens) and works in dark
 * mode; errors surface through the same toast channel as the rest of the app
 * instead of a native `alert`.
 */
export function CreateProductModal({
  initialData,
  onClose,
  onCreated,
}: {
  /** `null` keeps the dialog closed. */
  initialData: CreateProductInitialData | null;
  onClose: () => void;
  onCreated: (lineIndex: number, product: QuickProduct) => void;
}) {
  const [name, setName] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [stock, setStock] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initialData) return;
    setName(initialData.description);
    setCostPrice(String(initialData.unitPrice));
    setSalePrice(
      initialData.unitPrice > 0 ? (initialData.unitPrice * DEFAULT_MARKUP).toFixed(2) : ""
    );
    setStock(String(initialData.quantity));
  }, [initialData]);

  /** Keeps the suggested sale price in step with the cost until the user edits it. */
  function handleCostChange(value: string) {
    setCostPrice(value);
    const cost = parseFloat(value);
    const currentSale = parseFloat(salePrice);
    const previousCost = parseFloat(costPrice);
    const saleWasSuggested =
      !Number.isFinite(currentSale) ||
      (Number.isFinite(previousCost) &&
        Math.abs(currentSale - previousCost * DEFAULT_MARKUP) < 0.01);

    if (Number.isFinite(cost) && cost > 0 && saleWasSuggested) {
      setSalePrice((cost * DEFAULT_MARKUP).toFixed(2));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!initialData) return;

    setSaving(true);
    try {
      const result = await createQuickProduct({
        name: name.trim(),
        costPrice: parseFloat(costPrice) || 0,
        salePrice: parseFloat(salePrice) || 0,
        stock: parseFloat(stock) || 0,
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(`"${result.product.name}" agregado al inventario.`);
      onCreated(initialData.lineIndex, result.product);
      onClose();
    } catch (error) {
      toast.error((error as Error).message || "No se pudo crear el producto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!initialData} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear producto</DialogTitle>
          <DialogDescription>
            Prellenado con lo que se leyó del documento. Ajusta lo que haga falta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="qpName">Nombre</Label>
            <Input
              id="qpName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qpCost">Costo de compra</Label>
              <Input
                id="qpCost"
                type="number"
                step="0.01"
                min={0}
                value={costPrice}
                onChange={(e) => handleCostChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qpSale">Precio de venta *</Label>
              <Input
                id="qpSale"
                type="number"
                step="0.01"
                min={0.01}
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qpStock">Stock inicial</Label>
            <Input
              id="qpStock"
              type="number"
              step="0.001"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </div>

          <p className="rounded-lg bg-muted/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            Se sugiere un 30% sobre el costo como precio de venta. El stock inicial ya incluye las{" "}
            {initialData?.quantity ?? 0} unidad(es) de este documento, así que al confirmar no se
            sumarán otra vez.
          </p>

          <DialogFooter>
            <Button type="submit" className="w-full" disabled={saving}>
              <PackagePlus className="mr-2 h-4 w-4" />
              {saving ? "Creando..." : "Crear y vincular"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
