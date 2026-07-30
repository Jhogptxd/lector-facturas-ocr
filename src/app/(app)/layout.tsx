import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentBusiness } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listNotifications } from "@/lib/actions/notificaciones";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { StoreHydrator } from "@/components/layout/StoreHydrator";
import { OnlineSyncProvider } from "@/components/layout/OnlineSyncProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const business = await getCurrentBusiness();

  const [products, categories, contacts, activeRegister, notifications] = await Promise.all([
    prisma.product.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
    prisma.contact.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
    prisma.cashRegister.findFirst({ where: { businessId: business.id, status: "OPEN" } }),
    listNotifications(),
  ]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-background">
      <StoreHydrator
        businessId={business.id}
        businessName={business.name}
        currency={business.currency}
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
        }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        contacts={contacts.map((c) => ({ id: c.id, name: c.name, phone: c.phone, ruc: c.ruc, type: c.type }))}
        activeCashRegisterId={activeRegister?.id ?? null}
      />
      <OnlineSyncProvider />
      <TopBar businessName={business.name} notifications={notifications} />
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
