"use client";

import { MessageCircle, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { buildWhatsAppCollectionMessage } from "@/lib/whatsapp";

export type DebtItem = {
  id: string;
  totalAmount: number;
  remainingAmount: number;
  status: string;
  dueDate: string | null;
  createdAt: string;
  createdDayName: string;
  createdDateLabel: string;
  createdTimeLabel: string;
  contact: { id: string; name: string; phone: string };
};

const STATUS_LABEL: Record<string, { label: string; variant: "warning" | "secondary" | "success" }> = {
  PENDING: { label: "Pendiente", variant: "warning" },
  PARTIAL: { label: "Abono parcial", variant: "secondary" },
  PAID: { label: "Pagada", variant: "success" },
};

export function DebtCard({
  debt,
  currency,
  businessName,
  onPay,
}: {
  debt: DebtItem;
  currency: string;
  businessName: string;
  onPay: () => void;
}) {
  const status = STATUS_LABEL[debt.status] ?? STATUS_LABEL.PENDING;

  function handleWhatsApp() {
    const message = buildWhatsAppCollectionMessage({
      contactName: debt.contact.name,
      businessName,
      amount: debt.remainingAmount,
      currency,
      dueDate: debt.dueDate ? new Date(debt.dueDate) : null,
    });
    const phone = debt.contact.phone?.replace(/\D/g, "");
    const url = `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold">{debt.contact.name}</p>
          <p className="text-xs text-muted-foreground">
            Registrada el {debt.createdDayName} {debt.createdDateLabel} a las {debt.createdTimeLabel}
          </p>
          {debt.dueDate && (
            <p className="text-xs text-muted-foreground">
              Vence {new Date(debt.dueDate).toLocaleDateString("es-CO")}
            </p>
          )}
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="mt-2 flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Saldo pendiente</p>
          <p className="text-lg font-bold">{formatCurrency(debt.remainingAmount, currency)}</p>
          {debt.remainingAmount < debt.totalAmount && (
            <p className="text-xs text-muted-foreground">de {formatCurrency(debt.totalAmount, currency)}</p>
          )}
        </div>
        <div className="flex gap-2">
          {debt.contact.phone && (
            <Button size="icon" variant="outline" onClick={handleWhatsApp} title="Enviar recordatorio por WhatsApp">
              <MessageCircle className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" onClick={onPay}>
            <Wallet className="mr-1 h-3.5 w-3.5" /> Abonar
          </Button>
        </div>
      </div>
    </div>
  );
}
