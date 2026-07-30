import { listProducts, listCategories } from "@/lib/actions/inventario";
import { InventarioClient } from "@/components/inventario/InventarioClient";

export default async function InventarioPage() {
  const [products, categories] = await Promise.all([listProducts(), listCategories()]);

  return (
    <InventarioClient
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        sku: p.sku,
        price: Number(p.price),
        cost: Number(p.cost),
        stock: Number(p.stock),
        unit: p.unit,
        minStockAlert: Number(p.minStockAlert),
        categoryId: p.categoryId,
        categoryName: p.category?.name ?? null,
        variants: p.variants.map((v) => ({
          id: v.id,
          name: v.name,
          price: Number(v.price),
          cost: Number(v.cost),
          stock: Number(v.stock),
        })),
      }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
