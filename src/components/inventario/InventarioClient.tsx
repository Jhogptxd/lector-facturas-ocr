"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/store/useStore";
import { formatCurrency, cn } from "@/lib/utils";
import { ProductFormSheet, type ProductFull } from "@/components/inventario/ProductFormSheet";

export type CategoryOption = { id: string; name: string };

export function InventarioClient({
  products,
  categories,
}: {
  products: ProductFull[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const currency = useStore((s) => s.currency);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductFull | null>(null);
  const [creating, setCreating] = useState(false);

  const lowStockCount = products.filter((p) => p.stock <= p.minStockAlert).length;

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (categoryFilter !== "ALL" && p.categoryId !== categoryFilter) return false;
      if (showLowStockOnly && p.stock > p.minStockAlert) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [products, categoryFilter, showLowStockOnly, search]);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, código o SKU"
          className="pl-9"
        />
      </div>

      {lowStockCount > 0 && (
        <button
          onClick={() => setShowLowStockOnly((v) => !v)}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
            showLowStockOnly ? "border-amber-400 bg-amber-50 text-amber-800" : "border-amber-200 bg-amber-50/60 text-amber-700"
          )}
        >
          <AlertTriangle className="h-4 w-4" />
          {lowStockCount} producto(s) con stock bajo {showLowStockOnly ? "· mostrando solo estos" : ""}
        </button>
      )}

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setCategoryFilter("ALL")}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
            categoryFilter === "ALL" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
          )}
        >
          Todas
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(c.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
              categoryFilter === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 pb-20">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No se encontraron productos.
          </div>
        )}
        {filtered.map((p) => {
          const lowStock = p.stock <= p.minStockAlert;
          return (
            <button
              key={p.id}
              onClick={() => setEditingProduct(p)}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-sm"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
                {p.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.categoryName ?? "Sin categoría"} · {formatCurrency(p.price, currency)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={cn("text-sm font-semibold", lowStock && "text-destructive")}>
                  {p.stock} {p.unit === "UNIT" ? "u." : p.unit.toLowerCase()}
                </span>
                {lowStock && (
                  <Badge variant="destructive" className="text-[10px]">
                    Stock bajo
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Button
        size="icon"
        className="fixed bottom-24 right-4 z-30 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setCreating(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>

      <ProductFormSheet
        mode="create"
        open={creating}
        onOpenChange={setCreating}
        categories={categories}
        onSuccess={refresh}
      />
      <ProductFormSheet
        mode="edit"
        product={editingProduct}
        open={!!editingProduct}
        onOpenChange={(open) => !open && setEditingProduct(null)}
        categories={categories}
        onSuccess={refresh}
      />
    </div>
  );
}
