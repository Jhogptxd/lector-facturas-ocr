"use client";

import { useState } from "react";
import { ChevronDown, MessageCircle, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { buildWhatsAppCollectionMessage } from "@/lib/whatsapp";
import { formatDate } from "@/lib/datetime";

export type DebtPaymentItem = {
  id: string;
  amount: number;
  paymentMethod: string;
  /** Observación escrita al registrar el abono, ej. "Cheque # 2264". */
  notes: string | null;
  createdAt: string;
};

export type DebtItem = {
  id: string;
  description: string | null;
  totalAmount: number;
  remainingAmount: number;
  status: string;
  dueDate: string | null;
  createdAt: string;
  createdDayName: string;
  createdDateLabel: string;
  createdTimeLabel: string;
  contact: { id: string; name: string; phone: string };
  payments: DebtPaymentItem[];
};

const METHOD_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
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
  accentClassName = "text-foreground",
  onPay,
}: {
  debt: DebtItem;
  currency: string;
  businessName: string;
  /** Text color applied to the balance amount, e.g. green for receivables, red for payables. */
  accentClassName?: string;
  onPay: () => void;
}) {
  const status = STATUS_LABEL[debt.status] ?? STATUS_LABEL.PENDING;
  const [showPayments, setShowPayments] = useState(false);
  const payments = debt.payments ?? [];

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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{debt.contact.name}</p>
          {debt.description && (
            <p className="truncate text-xs text-muted-foreground">{debt.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Registrada el {debt.createdDayName} {debt.createdDateLabel} a las {debt.createdTimeLabel}
          </p>
          {debt.dueDate && (
            <p className="text-xs text-muted-foreground">
              Vence {formatDate(debt.dueDate)}
            </p>
          )}
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="mt-2 flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Saldo pendiente</p>
          <p className={`text-lg font-bold ${accentClassName}`}>{formatCurrency(debt.remainingAmount, currency)}</p>
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

      {payments.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setShowPayments((v) => !v)}
            aria-expanded={showPayments}
            className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <span>
              {payments.length} {payments.length === 1 ? "abono" : "abonos"}
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showPayments ? "rotate-180" : ""}`}
            />
          </button>

          {showPayments && (
            <ul className="mt-2 space-y-2">
              {payments.map((p) => (
                <li key={p.id} className="rounded-lg bg-muted/50 px-2.5 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{formatCurrency(p.amount, currency)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(p.createdAt, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod}
                  </p>
                  {p.notes && (
                    <p className="mt-1 whitespace-pre-wrap break-words border-l-2 border-border pl-2 text-xs italic text-foreground/80">
                      {p.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
