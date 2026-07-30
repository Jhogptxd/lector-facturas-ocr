"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { listRecipes, addRecipeIngredient, removeRecipeIngredient } from "@/lib/actions/inventario";
import { useStore } from "@/store/useStore";

type RecipeRow = { id: string; quantityUsed: number; ingredient: { id: string; name: string; unit: string } };

export function RecipeTab({ productId, onChange }: { productId: string; onChange: () => void }) {
  const products = useStore((s) => s.products);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [loading, setLoading] = useState(false);

  async function load() {
    const data = await listRecipes(productId);
    setRecipes(
      data.map((r) => ({
        id: r.id,
        quantityUsed: Number(r.quantityUsed),
        ingredient: { id: r.ingredient.id, name: r.ingredient.name, unit: r.ingredient.unit },
      }))
    );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function handleAdd() {
    if (!ingredientId) {
      toast.error("Selecciona un insumo.");
      return;
    }
    setLoading(true);
    try {
      await addRecipeIngredient(productId, ingredientId, parseFloat(quantity) || 0);
      setIngredientId("");
      setQuantity("1");
      await load();
      onChange();
      toast.success("Insumo agregado a la receta");
    } catch (error) {
      toast.error((error as Error).message || "No se pudo agregar el insumo");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id: string) {
    try {
      await removeRecipeIngredient(id);
      await load();
      onChange();
    } catch (error) {
      toast.error((error as Error).message || "No se pudo eliminar");
    }
  }

  const availableIngredients = products.filter((p) => p.id !== productId);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Define los insumos que se descuentan automáticamente del inventario al vender este producto.
      </p>

      {recipes.map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
          <p className="text-sm">
            {r.quantityUsed} {r.ingredient.unit === "UNIT" ? "u." : r.ingredient.unit.toLowerCase()} de {r.ingredient.name}
          </p>
          <button onClick={() => handleRemove(r.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </button>
        </div>
      ))}

      <div className="flex gap-2 rounded-lg border border-dashed border-border p-2.5">
        <Select value={ingredientId} onValueChange={setIngredientId}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Selecciona insumo" />
          </SelectTrigger>
          <SelectContent>
            {availableIngredients.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          step="0.001"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-20"
        />
        <Button type="button" size="icon" variant="outline" onClick={handleAdd} disabled={loading}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
