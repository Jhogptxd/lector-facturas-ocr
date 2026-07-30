"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ScanBarcode, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createProduct, updateProduct, deleteProduct } from "@/lib/actions/inventario";
import { BarcodeScannerDialog } from "@/components/inventario/BarcodeScannerDialog";
import { VariantsTab } from "@/components/inventario/VariantsTab";
import { RecipeTab } from "@/components/inventario/RecipeTab";
import type { CategoryOption } from "@/components/inventario/InventarioClient";

export type ProductFull = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  price: number;
  cost: number;
  stock: number;
  unit: string;
  minStockAlert: number;
  categoryId: string | null;
  categoryName: string | null;
  variants: { id: string; name: string; price: number; cost: number; stock: number }[];
};

export function ProductFormSheet({
  mode,
  product,
  open,
  onOpenChange,
  categories,
  onSuccess,
}: {
  mode: "create" | "edit";
  product?: ProductFull | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryOption[];
  onSuccess: () => void;
}) {
  const [tab, setTab] = useState("datos");
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState<"UNIT" | "KG" | "LT">("UNIT");
  const [minStockAlert, setMinStockAlert] = useState("0");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    if (open && mode === "edit" && product) {
      setName(product.name);
      setBarcode(product.barcode ?? "");
      setSku(product.sku ?? "");
      setPrice(String(product.price));
      setCost(String(product.cost));
      setStock(String(product.stock));
      setUnit(product.unit as "UNIT" | "KG" | "LT");
      setMinStockAlert(String(product.minStockAlert));
      setCategoryId(product.categoryId ?? "");
    } else if (open && mode === "create") {
      setName("");
      setBarcode("");
      setSku("");
      setPrice("");
      setCost("");
      setStock("");
      setUnit("UNIT");
      setMinStockAlert("0");
      setCategoryId("");
    }
    setTab("datos");
  }, [open, mode, product]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const input = {
        name,
        barcode: barcode || null,
        sku: sku || null,
        price: parseFloat(price) || 0,
        cost: parseFloat(cost) || 0,
        stock: parseFloat(stock) || 0,
        unit,
        minStockAlert: parseFloat(minStockAlert) || 0,
        categoryId: categoryId || null,
      };

      if (mode === "create") {
        await createProduct(input);
        toast.success("Producto creado");
      } else if (product) {
        await updateProduct(product.id, input);
        toast.success("Producto actualizado");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message || "No se pudo guardar el producto");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!product) return;
    if (!confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return;
    setLoading(true);
    try {
      await deleteProduct(product.id);
      toast.success("Producto eliminado");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message || "No se pudo eliminar el producto");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{mode === "create" ? "Nuevo producto" : "Editar producto"}</SheetTitle>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="datos" className="flex-1">
              Datos
            </TabsTrigger>
            <TabsTrigger value="variantes" className="flex-1" disabled={mode === "create"}>
              Variantes
            </TabsTrigger>
            <TabsTrigger value="receta" className="flex-1" disabled={mode === "create"}>
              Receta
            </TabsTrigger>
          </TabsList>

          <TabsContent value="datos">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="barcode">Código de barras</Label>
                  <div className="flex gap-1.5">
                    <Input id="barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                    <Button type="button" size="icon" variant="outline" onClick={() => setScannerOpen(true)}>
                      <ScanBarcode className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sku">SKU</Label>
                  <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="price">Precio de venta</Label>
                  <Input id="price" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cost">Costo</Label>
                  <Input id="cost" type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="stock">Stock</Label>
                  <Input id="stock" type="number" step="0.001" value={stock} onChange={(e) => setStock(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Unidad</Label>
                  <Select value={unit} onValueChange={(v) => setUnit(v as typeof unit)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNIT">Unidad</SelectItem>
                      <SelectItem value="KG">Kilos</SelectItem>
                      <SelectItem value="LT">Litros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="minStockAlert">Alerta mín.</Label>
                  <Input
                    id="minStockAlert"
                    type="number"
                    step="0.001"
                    value={minStockAlert}
                    onChange={(e) => setMinStockAlert(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <SheetFooter>
                <Button type="submit" size="lg" disabled={loading}>
                  {loading ? "Guardando..." : "Guardar producto"}
                </Button>
                {mode === "edit" && (
                  <Button type="button" variant="outline" className="text-destructive" onClick={handleDelete} disabled={loading}>
                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar producto
                  </Button>
                )}
              </SheetFooter>
            </form>
          </TabsContent>

          <TabsContent value="variantes">
            {product && <VariantsTab productId={product.id} variants={product.variants} onChange={onSuccess} />}
          </TabsContent>

          <TabsContent value="receta">
            {product && <RecipeTab productId={product.id} onChange={onSuccess} />}
          </TabsContent>
        </Tabs>
      </SheetContent>

      <BarcodeScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} onDetected={setBarcode} />
    </Sheet>
  );
}
