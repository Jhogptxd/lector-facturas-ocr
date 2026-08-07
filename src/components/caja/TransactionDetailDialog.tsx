"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ImageOff, Loader2, Pencil, ScanLine, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/useStore";
import { cn, formatCurrency } from "@/lib/utils";
import { getTransactionDocument, type TransactionDocument } from "@/lib/actions/documentos";
import { DOCUMENT_TYPE_LABEL } from "@/lib/vision/schema";
import type { MovementItem } from "@/components/caja/MovementList";

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CREDIT: "Fiado",
};

/**
 * Ficha de un movimiento de Caja, con el comprobante escaneado que lo originó.
 *
 * El documento se pide al abrir y no viene con la lista: son ~200 KB de Base64
 * por movimiento y la pantalla carga hasta 200. Ver `getTransactionDocument`.
 */
export function TransactionDetailDialog({
  movement,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  movement: MovementItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (movement: MovementItem) => void;
  onDelete: (movement: MovementItem) => void;
}) {
  const currency = useStore((s) => s.currency);
  const [scanDoc, setScanDoc] = useState<TransactionDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const movementId = movement?.id ?? null;
  const isFromScan = movement?.isFromScan ?? false;

  useEffect(() => {
    if (!open || !movementId || !isFromScan) {
      setScanDoc(null);
      return;
    }

    // Cerrar el diálogo (o abrir otro movimiento) mientras la consulta está en
    // vuelo no debe pintar el comprobante que ya no corresponde.
    let active = true;
    setLoading(true);
    setImageFailed(false);

    getTransactionDocument(movementId)
      .then((result) => {
        if (active) setScanDoc(result);
      })
      .catch(() => {
        if (active) setScanDoc(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, movementId, isFromScan]);

  if (!movement) return null;

  const isIncome = movement.type === "INCOME";
  const receiptSrc = scanDoc?.hasReceipt ? `/api/scans/${scanDoc.scanId}/image` : null;

  const rows: Array<{ label: string; value: string }> = [
    {
      label: "Fecha",
      value: new Date(movement.createdAt).toLocaleString("es-CO", {
        dateStyle: "long",
        timeStyle: "short",
      }),
    },
    { label: "Método de pago", value: PAYMENT_LABEL[movement.paymentMethod] ?? movement.paymentMethod },
  ];
  if (movement.contactName) rows.push({ label: "Contacto", value: movement.contactName });
  if (movement.categoryName) rows.push({ label: "Categoría", value: movement.categoryName });
  if (scanDoc) {
    rows.push({ label: "Documento", value: DOCUMENT_TYPE_LABEL[scanDoc.docType] });
    if (scanDoc.documentNumber) rows.push({ label: "Número", value: scanDoc.documentNumber });
    if (scanDoc.issueDate) {
      rows.push({
        label: "Fecha de emisión",
        value: new Date(scanDoc.issueDate).toLocaleDateString("es-CO", { dateStyle: "long" }),
      });
    }
    if (scanDoc.issuerName) rows.push({ label: "Emisor leído", value: scanDoc.issuerName });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="pr-6 text-base">{movement.concept}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span
              className={cn("text-lg font-bold", isIncome ? "text-success" : "text-destructive")}
            >
              {isIncome ? "+" : "-"}
              {formatCurrency(movement.amount, currency)}
            </span>
            <Badge variant={isIncome ? "success" : "destructive"}>
              {isIncome ? "Ingreso" : "Gasto"}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-border rounded-lg border border-border text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3 px-3 py-2">
              <dt className="shrink-0 text-xs text-muted-foreground">{row.label}</dt>
              <dd className="text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>

        {movement.isFromScan && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ScanLine className="h-3.5 w-3.5" /> Comprobante escaneado
            </p>

            {loading ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando comprobante...
              </div>
            ) : receiptSrc && !imageFailed ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receiptSrc}
                  alt={`Comprobante de ${movement.concept}`}
                  onError={() => setImageFailed(true)}
                  className="max-h-72 w-full rounded-lg border border-border bg-muted/30 object-contain"
                />
                <a
                  href={receiptSrc}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs font-medium text-primary"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Ver en tamaño completo
                </a>
              </>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                <ImageOff className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Este movimiento vino de un escaneo, pero no quedó copia de la foto. Los documentos
                  escaneados antes de esta versión no guardaban respaldo.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => {
              onOpenChange(false);
              onEdit(movement);
            }}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" /> Corregir
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 text-destructive hover:bg-destructive/10"
            onClick={() => {
              onOpenChange(false);
              onDelete(movement);
            }}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
