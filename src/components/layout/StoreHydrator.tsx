"use client";

import { useEffect } from "react";
import { useStore, type CachedProduct, type CachedCategory, type CachedContact } from "@/store/useStore";

export function StoreHydrator({
  businessId,
  businessName,
  currency,
  products,
  categories,
  contacts,
  activeCashRegisterId,
}: {
  businessId: string;
  businessName: string;
  currency: string;
  products: CachedProduct[];
  categories: CachedCategory[];
  contacts: CachedContact[];
  activeCashRegisterId: string | null;
}) {
  const setBusiness = useStore((s) => s.setBusiness);
  const setProducts = useStore((s) => s.setProducts);
  const setCategories = useStore((s) => s.setCategories);
  const setContacts = useStore((s) => s.setContacts);
  const setActiveCashRegisterId = useStore((s) => s.setActiveCashRegisterId);

  useEffect(() => {
    setBusiness(businessId, businessName, currency);
    setProducts(products);
    setCategories(categories);
    setContacts(contacts);
    setActiveCashRegisterId(activeCashRegisterId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, businessName, currency, products, categories, contacts, activeCashRegisterId]);

  return null;
}
