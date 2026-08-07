"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, ProductUnit } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";

// Los movimientos de stock viven en `@/lib/stock`, sin `server-only`, para que
// la lógica de reversión pueda reutilizarlos y probarse de forma aislada.

// ---------- Categories ----------

export async function listCategories() {
  const business = await getCurrentBusiness();
  return prisma.category.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } });
}

export async function createCategory(name: string) {
  const business = await getCurrentBusiness();
  const category = await prisma.category.create({ data: { name, businessId: business.id } });
  revalidatePath("/inventario");
  return category;
}

// ---------- Products ----------

export type ProductInput = {
  name: string;
  barcode?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
  categoryId?: string | null;
  price: number;
  cost: number;
  stock: number;
  unit: ProductUnit;
  minStockAlert: number;
};

export async function listProducts(search?: string) {
  const business = await getCurrentBusiness();
  const where: Prisma.ProductWhereInput = { businessId: business.id };
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { barcode: { contains: search } },
      { sku: { contains: search } },
    ];
  }
  return prisma.product.findMany({
    where,
    include: { category: true, variants: true },
    orderBy: { name: "asc" },
  });
}

export async function getProductByBarcode(barcode: string) {
  const business = await getCurrentBusiness();
  return prisma.product.findFirst({ where: { businessId: business.id, barcode } });
}

export async function createProduct(input: ProductInput) {
  const business = await getCurrentBusiness();
  const product = await prisma.product.create({
    data: { ...input, businessId: business.id },
  });
  revalidatePath("/inventario");
  // Decimal is not serializable to Client Components; return plain values only.
  return { id: product.id, name: product.name };
}

export async function updateProduct(id: string, input: Partial<ProductInput>) {
  const business = await getCurrentBusiness();
  const product = await prisma.product.update({
    where: { id, businessId: business.id },
    data: input,
  });
  revalidatePath("/inventario");
  return { id: product.id, name: product.name };
}

export async function deleteProduct(id: string) {
  const business = await getCurrentBusiness();
  await prisma.product.delete({ where: { id, businessId: business.id } });
  revalidatePath("/inventario");
}

export async function adjustStock(id: string, delta: number) {
  const business = await getCurrentBusiness();
  const product = await prisma.product.update({
    where: { id, businessId: business.id },
    data: { stock: { increment: delta } },
  });
  revalidatePath("/inventario");
  return { id: product.id, stock: Number(product.stock) };
}

export async function getLowStockProducts() {
  const business = await getCurrentBusiness();
  const products = await prisma.product.findMany({ where: { businessId: business.id } });
  return products.filter((p) => Number(p.stock) <= Number(p.minStockAlert));
}

// ---------- Variants ----------

export async function createVariant(productId: string, data: { name: string; price: number; cost: number; stock: number }) {
  const variant = await prisma.productVariant.create({ data: { productId, ...data } });
  revalidatePath("/inventario");
  return { id: variant.id, name: variant.name };
}

export async function updateVariant(id: string, data: Partial<{ name: string; price: number; cost: number; stock: number }>) {
  const variant = await prisma.productVariant.update({ where: { id }, data });
  revalidatePath("/inventario");
  return { id: variant.id, name: variant.name };
}

export async function deleteVariant(id: string) {
  await prisma.productVariant.delete({ where: { id } });
  revalidatePath("/inventario");
}

// ---------- Recipes (Bill of materials) ----------

export type RecipeRow = {
  id: string;
  quantityUsed: number;
  ingredient: { id: string; name: string; unit: ProductUnit };
};

export async function listRecipes(productId: string): Promise<RecipeRow[]> {
  const recipes = await prisma.recipe.findMany({
    where: { productId },
    include: { ingredient: true },
  });

  // Map to plain values: Decimal cannot cross into a Client Component.
  return recipes.map((r) => ({
    id: r.id,
    quantityUsed: Number(r.quantityUsed),
    ingredient: { id: r.ingredient.id, name: r.ingredient.name, unit: r.ingredient.unit },
  }));
}

export async function addRecipeIngredient(productId: string, ingredientId: string, quantityUsed: number) {
  if (productId === ingredientId) {
    throw new Error("Un producto no puede ser insumo de sí mismo.");
  }
  const recipe = await prisma.recipe.create({ data: { productId, ingredientId, quantityUsed } });
  revalidatePath("/inventario");
  return { id: recipe.id };
}

export async function removeRecipeIngredient(recipeId: string) {
  await prisma.recipe.delete({ where: { id: recipeId } });
  revalidatePath("/inventario");
}

// ---------- Kardex (derived from sale items, most recent movements) ----------

export async function getProductKardex(productId: string) {
  const saleItems = await prisma.saleItem.findMany({
    where: { productId },
    include: { transaction: true },
    orderBy: { id: "desc" },
    take: 50,
  });

  return saleItems.map((item) => ({
    id: item.id,
    date: item.transaction.createdAt,
    type: "SALIDA" as const,
    quantity: Number(item.quantity),
    concept: item.transaction.concept,
  }));
}
