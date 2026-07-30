"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, MapPin, MessageCircle, Pencil, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { buildWhatsAppCollectionMessage } from "@/lib/whatsapp";
import { ContactFormDialog } from "@/components/contactos/ContactFormDialog";

const TYPE_LABEL: Record<string, string> = {
  CLIENT: "Cliente",
  SUPPLIER: "Proveedor",
};

type Transaction = {
  id: string;
  type: string;
  amount: number;
  paymentMethod: string;
  concept: string;
  createdAt: string;
};

type Debt = {
  id: string;
  totalAmount: number;
  remainingAmount: number;
  status: string;
  dueDate: string | null;
  createdAt: string;
  payments: { id: string; amount: number; paymentMethod: string; createdAt: string }[];
};

type ContactDetail = {
  id: string;
  name: string;
  ruc: string | null;
  address: string | null;
  phone: string;
  email: string | null;
  type: string;
};

export function ContactDetailClient({
  contact,
  businessName,
  currency,
  transactions,
  debts,
}: {
  contact: ContactDetail;
  businessName: string;
  currency: string;
  transactions: Transaction[];
  debts: Debt[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const pendingDebts = debts.filter((d) => d.status !== "PAID");
  const totalPending = pendingDebts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const waPhone = contact.phone.replace(/\D/g, "");
  const mapsUrl = contact.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`
    : null;

  function handleWhatsAppCollection() {
    const message = buildWhatsAppCollectionMessage({
      contactName: contact.name,
      businessName,
      amount: totalPending,
      currency,
    });
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`, "_blank");
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-20">
      <div className="flex items-center gap-2">
        <Link href="/contactos" className="rounded-lg p-1.5 hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold">{contact.name}</h1>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Badge variant="outline">{TYPE_LABEL[contact.type]}</Badge>
            <p className="text-sm text-muted-foreground">{contact.phone}</p>
            {contact.ruc && <p className="text-xs text-muted-foreground">RUC / Cédula: {contact.ruc}</p>}
            {contact.address && <p className="text-xs text-muted-foreground">{contact.address}</p>}
            {contact.email && <p className="text-xs text-muted-foreground">{contact.email}</p>}
          </div>
          <Button size="icon" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 flex gap-2">
          {waPhone && (
            <a
              href={`tel:${waPhone}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium hover:bg-accent"
            >
              <Phone className="h-3.5 w-3.5" /> Llamar
            </a>
          )}
          {waPhone && (
            <a
              href={`https://wa.me/${waPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium hover:bg-accent"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium hover:bg-accent"
            >
              <MapPin className="h-3.5 w-3.5" /> Mapa
            </a>
          )}
        </div>

        {totalPending > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-50 p-3">
            <div>
              <p className="text-xs text-amber-700">Saldo pendiente</p>
              <p className="font-bold text-amber-800">{formatCurrency(totalPending, currency)}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={handleWhatsAppCollection}>
              <MessageCircle className="mr-1 h-3.5 w-3.5" /> Cobrar
            </Button>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Historial de transacciones</h2>
        <div className="flex flex-col gap-2">
          {transactions.length === 0 && (
            <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Sin transacciones registradas.
            </p>
          )}
          {transactions.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
              <div>
                <p className="text-sm font-medium">{t.concept}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(t.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </div>
              <span className={t.type === "INCOME" ? "text-sm font-semibold text-success" : "text-sm font-semibold text-destructive"}>
                {t.type === "INCOME" ? "+" : "-"}
                {formatCurrency(t.amount, currency)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ContactFormDialog
        mode="edit"
        contact={contact}
        open={editing}
        onOpenChange={setEditing}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
