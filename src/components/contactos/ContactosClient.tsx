"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, ChevronRight, Phone, MessageCircle, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/store/useStore";
import { formatCurrency, cn } from "@/lib/utils";
import { ContactFormDialog } from "@/components/contactos/ContactFormDialog";
import { ImportContactsButton } from "@/components/contactos/ImportContactsButton";

export type ContactRow = {
  id: string;
  name: string;
  ruc: string | null;
  address: string | null;
  phone: string;
  type: string;
  pendingDebts: number;
  transactionCount: number;
};

const TYPE_LABEL: Record<string, string> = {
  CLIENT: "Cliente",
  SUPPLIER: "Proveedor",
};

export function ContactosClient({ contacts }: { contacts: ContactRow[] }) {
  const router = useRouter();
  const currency = useStore((s) => s.currency);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "CLIENT" | "SUPPLIER">("ALL");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (typeFilter !== "ALL" && c.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.ruc?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [contacts, typeFilter, search]);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-20">
      <ImportContactsButton onSuccess={refresh} />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o RUC"
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {(["ALL", "CLIENT", "SUPPLIER"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
              typeFilter === type ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
            )}
          >
            {type === "ALL" ? "Todos" : TYPE_LABEL[type]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No se encontraron clientes.
          </div>
        )}
        {filtered.map((c) => {
          const mapsUrl = c.address
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`
            : null;
          const waPhone = c.phone.replace(/\D/g, "");

          return (
            <div
              key={c.id}
              onClick={() => router.push(`/contactos/${c.id}`)}
              className="flex cursor-pointer flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABEL[c.type]}
                    {c.ruc ? ` · RUC ${c.ruc}` : ""} · {c.transactionCount} transacciones
                  </p>
                </div>
                {c.pendingDebts > 0 && (
                  <Badge variant="warning" className="text-[10px]">
                    {formatCurrency(c.pendingDebts, currency)}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>

              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                {waPhone && (
                  <a
                    href={`tel:${waPhone}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                  >
                    <Phone className="h-3.5 w-3.5" /> Llamar
                  </a>
                )}
                {waPhone && (
                  <a
                    href={`https://wa.me/${waPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                )}
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                  >
                    <MapPin className="h-3.5 w-3.5" /> Mapa
                  </a>
                )}
              </div>
            </div>
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

      <ContactFormDialog mode="create" open={creating} onOpenChange={setCreating} onSuccess={refresh} />
    </div>
  );
}
