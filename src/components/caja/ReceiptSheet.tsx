"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bluetooth, Download, MessageCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { buildReceiptLines, downloadReceiptPdf, shareReceiptWhatsApp, printReceiptBluetooth, type ReceiptData } from "@/lib/receipt";

export function ReceiptSheet({
  data,
  contactPhone,
  onOpenChange,
}: {
  data: ReceiptData | null;
  contactPhone?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    if (!data) return;
    setPrinting(true);
    try {
      await printReceiptBluetooth(data);
      toast.success("Enviado a la impresora");
    } catch (error) {
      toast.error((error as Error).message || "No se pudo imprimir. Verifica la conexión Bluetooth.");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Sheet open={!!data} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Comprobante de venta</SheetTitle>
        </SheetHeader>

        {data && (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
            {buildReceiptLines(data).map((line, i) => (
              <p key={i} className="whitespace-pre">
                {line}
              </p>
            ))}
          </div>
        )}

        <SheetFooter>
          <Button onClick={() => data && downloadReceiptPdf(data)} variant="outline">
            <Download className="mr-2 h-4 w-4" /> Descargar PDF (58/80mm)
          </Button>
          <Button onClick={() => data && shareReceiptWhatsApp(data, contactPhone)} variant="outline">
            <MessageCircle className="mr-2 h-4 w-4" /> Enviar por WhatsApp
          </Button>
          <Button onClick={handlePrint} disabled={printing}>
            <Bluetooth className="mr-2 h-4 w-4" /> {printing ? "Imprimiendo..." : "Imprimir (Bluetooth 58/80mm)"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
