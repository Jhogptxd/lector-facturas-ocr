"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/store/idbStorage";
import { createTransaction, type CreateTransactionInput } from "@/lib/actions/caja";

export type CachedProduct = {
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
};

export type CachedContact = {
  id: string;
  name: string;
  phone: string;
  ruc: string | null;
  type: string;
};

export type CachedCategory = {
  id: string;
  name: string;
};

export type PendingSale = {
  localId: string;
  createdAt: string;
  input: CreateTransactionInput;
  status: "pending" | "syncing" | "error";
  error?: string;
};

type StoreState = {
  businessId: string | null;
  businessName: string;
  currency: string;
  products: CachedProduct[];
  categories: CachedCategory[];
  contacts: CachedContact[];
  activeCashRegisterId: string | null;
  isOnline: boolean;
  pendingSales: PendingSale[];

  setBusiness: (id: string, name: string, currency: string) => void;
  setProducts: (products: CachedProduct[]) => void;
  setCategories: (categories: CachedCategory[]) => void;
  setContacts: (contacts: CachedContact[]) => void;
  setActiveCashRegisterId: (id: string | null) => void;
  setOnline: (online: boolean) => void;

  queueSale: (input: CreateTransactionInput) => Promise<{ synced: boolean }>;
  flushPendingSales: () => Promise<void>;
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      businessId: null,
      businessName: "",
      currency: "COP",
      products: [],
      categories: [],
      contacts: [],
      activeCashRegisterId: null,
      isOnline: true,
      pendingSales: [],

      setBusiness: (id, name, currency) => set({ businessId: id, businessName: name, currency }),
      setProducts: (products) => set({ products }),
      setCategories: (categories) => set({ categories }),
      setContacts: (contacts) => set({ contacts }),
      setActiveCashRegisterId: (id) => set({ activeCashRegisterId: id }),
      setOnline: (online) => set({ isOnline: online }),

      queueSale: async (input) => {
        const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const pending: PendingSale = {
          localId,
          createdAt: new Date().toISOString(),
          input,
          status: "pending",
        };

        set((state) => ({ pendingSales: [pending, ...state.pendingSales] }));

        if (!get().isOnline) {
          return { synced: false };
        }

        try {
          await createTransaction(input);
          set((state) => ({
            pendingSales: state.pendingSales.filter((s) => s.localId !== localId),
          }));
          return { synced: true };
        } catch (error) {
          set((state) => ({
            pendingSales: state.pendingSales.map((s) =>
              s.localId === localId
                ? { ...s, status: "error", error: (error as Error).message }
                : s
            ),
          }));
          return { synced: false };
        }
      },

      flushPendingSales: async () => {
        const pending = get().pendingSales.filter((s) => s.status !== "syncing");
        for (const sale of pending) {
          set((state) => ({
            pendingSales: state.pendingSales.map((s) =>
              s.localId === sale.localId ? { ...s, status: "syncing" } : s
            ),
          }));
          try {
            await createTransaction(sale.input);
            set((state) => ({
              pendingSales: state.pendingSales.filter((s) => s.localId !== sale.localId),
            }));
          } catch (error) {
            set((state) => ({
              pendingSales: state.pendingSales.map((s) =>
                s.localId === sale.localId
                  ? { ...s, status: "error", error: (error as Error).message }
                  : s
              ),
            }));
          }
        }
      },
    }),
    {
      name: "cuarenta-store",
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        businessId: state.businessId,
        businessName: state.businessName,
        currency: state.currency,
        products: state.products,
        categories: state.categories,
        contacts: state.contacts,
        activeCashRegisterId: state.activeCashRegisterId,
        pendingSales: state.pendingSales,
      }),
    }
  )
);
