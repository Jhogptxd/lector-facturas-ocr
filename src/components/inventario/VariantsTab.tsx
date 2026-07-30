"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createVariant, deleteVariant } from "@/lib/actions/inventario";
import { useStore } from "@/store/useStore";
import { formatCurrency } from "@/lib/utils";

type Variant = { id: string; name: string; price: number; cost: number; stock: number };

export function VariantsTab({
  productId,
  variants,
  onChange,
}: {
  productId: string;
  variants: Variant[];
  onChange: () => void;
}) {
  const currency = useStore((s) => s.currency);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [stock, setStock] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!name || !price) {
      toast.error("Nombre y precio son requeridos.");
      return;
    }
    setLoading(true);
    try {
      await createVariant(productId, {
        name,
        price: parseFloat(price) || 0,
        cost: parseFloat(cost) || 0,
        stock: parseFloat(stock) || 0,
      });
      setName("");
      setPrice("");
      setCost("");
      setStock("");
      onChange();
      toast.success("Variante agregada");
    } catch (error) {
      toast.error((error as Error).message || "No se pudo agregar la variante");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteVariant(id);
      onChange();
      toast.success("Variante eliminada");
    } catch (error) {
      toast.error((error as Error).message || "No se pudo eliminar");
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Ej. Talla, Color o Presentación. Cada variante lleva su propio precio y stock.
      </p>

      {variants.map((v) => (
        <div key={v.id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
          <div>
            <p className="text-sm font-medium">{v.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(v.price, currency)} · Stock: {v.stock}
            </p>
          </div>
          <button onClick={() => handleDelete(v.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </button>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed border-border p-2.5">
        <Input placeholder="Nombre (Ej. Talla M)" value={name} onChange={(e) => setName(e.target.value)} className="col-span-2" />
        <Input placeholder="Precio" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Input placeholder="Costo" type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
        <Input placeholder="Stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="col-span-2" />
        <Button type="button" size="sm" className="col-span-2" onClick={handleAdd} disabled={loading}>
          <Plus className="mr-1 h-4 w-4" /> Agregar variante
        </Button>
      </div>
    </div>
  );
}
