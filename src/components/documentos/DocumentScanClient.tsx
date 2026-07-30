"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  Check,
  FileText,
  FlaskConical,
  Loader2,
  Plus,
  RotateCcw,
  ShoppingBag,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useStore } from "@/store/useStore";
import { cn, formatCurrency } from "@/lib/utils";
import { prepareImage } from "@/lib/vision/prepareImage";
import {
  extractScan,
  confirmScan,
  discardScan,
  getScanDraft,
  setScanItemLink,
  type QuickProduct,
  type ScanCoverage,
  type ScanDraft,
  type ScanListItem,
} from "@/lib/actions/documentos";
import {
  DOCUMENT_TYPE_LABEL,
  type DocumentTypeValue,
  type ReviewedLineItem,
  type VisionMode,
} from "@/lib/vision/schema";
import {
  CreateProductModal,
  type CreateProductInitialData,
} from "@/components/CreateProductModal";

/** Sentinel value for the "create new" entry in the per-row product select. */
const CREATE_NEW = "__create_new__";
const UNLINKED = "__none__";

type DraftForm = {
  documentNumber: string;
  issueDate: string;
  counterpartyName: string;
  counterpartyTaxId: string;
  issuerName: string;
  issuerTaxId: string;
  subtotal12: string;
  subtotal0: string;
  taxAmount: string;
  total: string;
  paymentMethod: "CASH" | "TRANSFER" | "CREDIT";
  dueDate: string;
  items: ReviewedLineItem[];
};

const COVERAGE_META: Record<
  ScanCoverage,
  { label: string; variant: "success" | "warning" | "destructive" }
> = {
  high: { label: "Lectura completa", variant: "success" },
  medium: { label: "Revisa los importes", variant: "warning" },
  low: { label: "Lectura parcial: verifica todo", variant: "destructive" },
};

export function DocumentScanClient({
  scans,
  visionMode,
}: {
  scans: ScanListItem[];
  visionMode: VisionMode;
}) {
  /** In mock mode processing works, it just doesn't read the photo. */
  const visionConfigured = visionMode !== "off";
  const router = useRouter();
  const currency = useStore((s) => s.currency);
  const products = useStore((s) => s.products);
  const setProducts = useStore((s) => s.setProducts);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [docType, setDocType] = useState<DocumentTypeValue | null>(null);
  const [preview, setPreview] = useState<{ url: string; file: File; note: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ScanDraft | null>(null);
  const [form, setForm] = useState<DraftForm | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [newProductFor, setNewProductFor] = useState<CreateProductInitialData | null>(null);

  /** Fresh scans preview from the in-memory File; resumed ones from the archive. */
  const previewSrc = preview?.url ?? (draft?.hasImage ? `/api/scans/${draft.id}/image` : null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const prepared = await prepareImage(file);
    setPreview({
      url: prepared.previewUrl,
      file: prepared.file,
      note: prepared.resized
        ? `Redimensionada a ${prepared.width}×${prepared.height} px`
        : `${(prepared.file.size / 1024).toFixed(0)} KB`,
    });
  }

  /** Builds the editable form from a parsed draft, shared by fresh and resumed scans. */
  function formFromDraft(next: ScanDraft): DraftForm {
    const p = next.parsed;
    const isPurchase = next.docType === "SUPPLIER_INVOICE";

    return {
      documentNumber: p.numero_comprobante ?? "",
      issueDate: p.fecha_emision ?? "",
      // OCR only recovers the issuer. On a purchase that *is* the counterparty;
      // on a sale note the counterparty is the client, which the user must type.
      counterpartyName: isPurchase ? p.razon_social_emisor ?? "" : "",
      counterpartyTaxId: isPurchase ? p.ruc_emisor ?? "" : "",
      issuerName: p.razon_social_emisor ?? "",
      issuerTaxId: p.ruc_emisor ?? "",
      subtotal12: p.subtotal_12 === null ? "" : String(p.subtotal_12),
      subtotal0: p.subtotal_0 === null ? "" : String(p.subtotal_0),
      taxAmount: p.iva === null ? "" : String(p.iva),
      total: p.total === null ? "" : String(p.total),
      paymentMethod: "CASH",
      dueDate: "",
      items: p.items.map((item, index) => ({
        description: item.descripcion,
        quantity: item.cantidad ?? 1,
        unitPrice: item.precio_unitario ?? 0,
        lineTotal: item.precio_total ?? 0,
        productId: next.itemLinks[index]?.productId ?? null,
        stockPreapplied: next.itemLinks[index]?.stockPreapplied ?? false,
      })),
    };
  }

  async function handleProcess() {
    if (!docType) {
      toast.error("Selecciona el tipo de documento.");
      return;
    }
    if (!preview) {
      toast.error("Adjunta o toma una foto del documento.");
      return;
    }

    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append("docType", docType);
      formData.append("image", preview.file);

      const result = await extractScan(formData);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setDraft(result.draft);
      setForm(formFromDraft(result.draft));

      if (result.draft.coverage === "low") {
        toast.warning("El OCR extrajo pocos campos. Verifica y completa todo a mano.");
      }
    } catch (error) {
      toast.error((error as Error).message || "No se pudo procesar el documento.");
    } finally {
      setProcessing(false);
    }
  }

  async function handleResume(scanId: string) {
    setResumingId(scanId);
    try {
      const resumed = await getScanDraft(scanId);
      if (!resumed) {
        toast.error("Ese borrador ya no está disponible.");
        router.refresh();
        return;
      }
      setDocType(resumed.docType);
      setDraft(resumed);
      setForm(formFromDraft(resumed));
    } catch (error) {
      toast.error((error as Error).message || "No se pudo abrir el borrador.");
    } finally {
      setResumingId(null);
    }
  }

  function resetAll() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setDraft(null);
    setForm(null);
    setDocType(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  async function handleDiscard() {
    if (draft) await discardScan(draft.id);
    resetAll();
    router.refresh();
  }

  /**
   * Links a row to a product. Applied optimistically and persisted right away so
   * the choice — and especially `stockPreapplied` on an inline-created product —
   * survives leaving the page.
   */
  function setItemLink(index: number, productId: string | null, stockPreapplied = false) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item, i) =>
              i === index ? { ...item, productId, stockPreapplied } : item
            ),
          }
        : prev
    );

    if (!draft) return;
    void setScanItemLink({ scanId: draft.id, position: index, productId, stockPreapplied })
      .then((result) => {
        if (!result.ok) toast.error(result.message);
      })
      .catch(() => {
        toast.error("No se pudo guardar el vínculo con el inventario. Revísalo antes de confirmar.");
      });
  }

  function handleSelectChange(index: number, value: string, item: ReviewedLineItem) {
    if (value === CREATE_NEW) {
      setNewProductFor({
        lineIndex: index,
        description: item.description,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      });
      return;
    }
    setItemLink(index, value === UNLINKED ? null : value);
  }

  /** A product created inline lands in the client cache so other rows can pick it. */
  function handleProductCreated(lineIndex: number, product: QuickProduct) {
    setProducts([
      ...products,
      {
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        sku: product.sku,
        price: product.price,
        cost: product.cost,
        stock: product.stock,
        unit: product.unit,
        minStockAlert: product.minStockAlert,
        categoryId: product.categoryId,
      },
    ]);
    // Its initial stock already covers this line, so don't move stock again.
    setItemLink(lineIndex, product.id, true);
  }

  function updateItem(index: number, patch: Partial<ReviewedLineItem>) {
    setForm((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, ...patch };
        next.lineTotal = Number((next.quantity * next.unitPrice).toFixed(2));
        return next;
      });
      return { ...prev, items };
    });
  }

  async function handleConfirm() {
    if (!draft || !form) return;

    const total = parseFloat(form.total);
    if (!Number.isFinite(total) || total <= 0) {
      toast.error("Ingresa el valor total del documento.");
      return;
    }
    if (!form.counterpartyName.trim()) {
      toast.error(
        draft.docType === "SUPPLIER_INVOICE"
          ? "Ingresa el nombre del proveedor."
          : "Ingresa el nombre del cliente."
      );
      return;
    }

    setSaving(true);
    try {
      const result = await confirmScan({
        scanId: draft.id,
        documentNumber: form.documentNumber.trim() || null,
        issueDate: form.issueDate || null,
        counterpartyName: form.counterpartyName.trim(),
        counterpartyTaxId: form.counterpartyTaxId.trim() || null,
        subtotal12: form.subtotal12 === "" ? null : Number(form.subtotal12),
        subtotal0: form.subtotal0 === "" ? null : Number(form.subtotal0),
        taxAmount: form.taxAmount === "" ? null : Number(form.taxAmount),
        total,
        paymentMethod: form.paymentMethod,
        dueDate: form.paymentMethod === "CREDIT" ? form.dueDate || null : null,
        items: form.items,
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      const stockNote =
        result.stockMoves > 0 ? ` Stock actualizado en ${result.stockMoves} producto(s).` : "";
      toast.success(
        (result.debtCreated
          ? "Documento guardado y registrado en Fiados."
          : "Documento guardado y registrado en Caja.") + stockNote
      );
      resetAll();
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message || "No se pudo guardar el documento.");
    } finally {
      setSaving(false);
    }
  }

  const itemsSum = form
    ? Number(form.items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2))
    : 0;

  const numeric = (raw: string) => {
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
  };

  // The detail lines add up to the taxable base, not to the total. Comparing
  // them against a total that includes IVA flags every taxed invoice, so use the
  // printed subtotals and fall back to total − IVA when they weren't read.
  const statedSubtotals = form ? numeric(form.subtotal12) + numeric(form.subtotal0) : 0;
  const expectedItemsSum = form
    ? statedSubtotals > 0
      ? statedSubtotals
      : numeric(form.total) - numeric(form.taxAmount)
    : 0;
  const totalsDiverge =
    form !== null && form.items.length > 0 && Math.abs(itemsSum - expectedItemsSum) > 0.5;

  // ---------- Draft review ----------
  if (draft && form) {
    const isPurchase = draft.docType === "SUPPLIER_INVOICE";
    const coverage = COVERAGE_META[draft.coverage] ?? COVERAGE_META.medium;

    return (
      <div className="flex flex-col gap-4 px-4 pt-4 pb-24">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">Verifica los datos</h1>
            <p className="text-xs text-muted-foreground">{DOCUMENT_TYPE_LABEL[draft.docType]}</p>
          </div>
          <Badge variant={coverage.variant}>{coverage.label}</Badge>
        </div>

        {draft.coverage !== "high" && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              El OCR lee texto plano, así que puede omitir campos o líneas. Compara con la foto antes
              de guardar.
            </p>
          </div>
        )}

        {previewSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewSrc}
            alt="Documento escaneado"
            className="max-h-48 w-full rounded-lg border border-border object-contain"
          />
        )}

        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isPurchase ? "Proveedor (emisor)" : "Cliente (receptor)"}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="cpName">Nombre / Razón social</Label>
              <Input
                id="cpName"
                value={form.counterpartyName}
                onChange={(e) => setForm({ ...form, counterpartyName: e.target.value })}
                placeholder={isPurchase ? "Requerido" : "El OCR no lee el receptor; escríbelo"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpTaxId">RUC / CI</Label>
              <Input
                id="cpTaxId"
                value={form.counterpartyTaxId}
                onChange={(e) => setForm({ ...form, counterpartyTaxId: e.target.value })}
              />
            </div>
            {!isPurchase && form.issuerName && (
              <p className="text-xs text-muted-foreground">
                Emisor leído: {form.issuerName}
                {form.issuerTaxId ? ` · ${form.issuerTaxId}` : ""}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Comprobante
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="docNum">Número</Label>
                <Input
                  id="docNum"
                  value={form.documentNumber}
                  onChange={(e) => setForm({ ...form, documentNumber: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="issueDate">Fecha emisión</Label>
                <Input
                  id="issueDate"
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Detalle ({form.items.length})
              </p>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    items: [
                      ...form.items,
                      {
                        description: "",
                        quantity: 1,
                        unitPrice: 0,
                        lineTotal: 0,
                        productId: null,
                        stockPreapplied: false,
                      },
                    ],
                  })
                }
                className="flex items-center gap-1 text-xs font-medium text-primary"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar línea
              </button>
            </div>

            {form.items.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                El OCR no identificó líneas de detalle. Puedes guardar solo con el total, o
                agregarlas a mano.
              </p>
            )}

            {form.items.map((item, index) => {
              const linked = products.find((p) => p.id === item.productId) ?? null;
              const projected = linked
                ? isPurchase
                  ? linked.stock + item.quantity
                  : linked.stock - item.quantity
                : null;

              return (
                <div key={index} className="space-y-2 rounded-lg border border-border p-2.5">
                  <div className="flex items-start gap-2">
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                      placeholder="Descripción"
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm({ ...form, items: form.items.filter((_, i) => i !== index) })
                      }
                      className="mt-2.5 shrink-0"
                      aria-label="Eliminar línea"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Cantidad</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(index, { quantity: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">P. unitario</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateItem(index, { unitPrice: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="pb-2 text-right text-sm font-semibold">
                      {formatCurrency(item.lineTotal, currency)}
                    </div>
                  </div>

                  {/* Native select: on a phone this opens the OS picker, and it
                      degrades gracefully when the catalog is small. */}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Vincular con inventario (opcional)
                    </Label>
                    <select
                      value={item.productId ?? UNLINKED}
                      onChange={(e) => handleSelectChange(index, e.target.value, item)}
                      className="flex h-9 w-full rounded-lg border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value={UNLINKED}>Sin vincular — solo contable</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (stock {p.stock})
                        </option>
                      ))}
                      <option value={CREATE_NEW}>+ Crear nuevo producto…</option>
                    </select>

                    {linked && (
                      <p className="text-[10px] text-muted-foreground">
                        {item.stockPreapplied
                          ? `Stock ${linked.stock} (ya incluye esta línea)`
                          : `Stock ${linked.stock} → ${projected}${isPurchase ? " (suma)" : " (resta)"}`}
                      </p>
                    )}
                    {linked && !item.stockPreapplied && projected !== null && projected < 0 && (
                      <p className="text-[10px] font-medium text-destructive">
                        Este movimiento deja el stock en negativo.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Vincular una línea {isPurchase ? "suma" : "resta"} su cantidad al stock del producto al
              confirmar. Las líneas sin vincular quedan solo como registro contable.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Totales
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="subtotal12">Subtotal con IVA</Label>
                <Input
                  id="subtotal12"
                  type="number"
                  step="0.01"
                  value={form.subtotal12}
                  onChange={(e) => setForm({ ...form, subtotal12: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subtotal0">Subtotal 0%</Label>
                <Input
                  id="subtotal0"
                  type="number"
                  step="0.01"
                  value={form.subtotal0}
                  onChange={(e) => setForm({ ...form, subtotal0: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="taxAmount">IVA</Label>
                <Input
                  id="taxAmount"
                  type="number"
                  step="0.01"
                  value={form.taxAmount}
                  onChange={(e) => setForm({ ...form, taxAmount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="total">Total *</Label>
                <Input
                  id="total"
                  type="number"
                  step="0.01"
                  value={form.total}
                  onChange={(e) => setForm({ ...form, total: e.target.value })}
                  required
                />
              </div>
            </div>

            {totalsDiverge && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                La suma del detalle ({formatCurrency(itemsSum, currency)}) no coincide con los
                subtotales ({formatCurrency(expectedItemsSum, currency)}). Se guardará el total que
                escribas arriba.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Método de pago</Label>
                <Select
                  value={form.paymentMethod}
                  onValueChange={(v) =>
                    setForm({ ...form, paymentMethod: v as DraftForm["paymentMethod"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Efectivo</SelectItem>
                    <SelectItem value="TRANSFER">Transferencia</SelectItem>
                    <SelectItem value="CREDIT">Crédito / Fiado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.paymentMethod === "CREDIT" && (
                <div className="space-y-1.5">
                  <Label htmlFor="dueDate">Fecha límite</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  />
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Se registrará como{" "}
              <strong>{isPurchase ? "gasto (compra)" : "ingreso (venta)"}</strong>
              {form.paymentMethod === "CREDIT" ? " y quedará como deuda en Fiados." : " en la caja."}
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={handleConfirm} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" /> Guardar documento
              </>
            )}
          </Button>
          <Button variant="outline" onClick={handleDiscard} disabled={saving}>
            <RotateCcw className="mr-2 h-4 w-4" /> Descartar y escanear otro
          </Button>
        </div>

        <CreateProductModal
          initialData={newProductFor}
          onClose={() => setNewProductFor(null)}
          onCreated={handleProductCreated}
        />
      </div>
    );
  }

  // ---------- Capture ----------
  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-24">
      <div>
        <h1 className="text-base font-semibold">Escanear documento</h1>
        <p className="text-xs text-muted-foreground">
          Toma una foto de la factura o nota de venta y se leerán los datos automáticamente.
        </p>
      </div>

      {visionMode === "off" && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Lectura automática no configurada</p>
            <p>
              Falta <code className="font-mono">GOOGLE_APPLICATION_CREDENTIALS</code> en tu archivo{" "}
              <code className="font-mono">.env</code>, o la ruta no existe. Apúntala al JSON de tu
              cuenta de servicio de Google Cloud y reinicia el servidor. Mientras tanto puedes
              registrar el documento a mano desde Caja.
            </p>
          </div>
        </div>
      )}

      {visionMode === "mock" && (
        <div className="flex gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Modo de prueba (datos simulados)</p>
            <p>
              Sin <code className="font-mono">GOOGLE_APPLICATION_CREDENTIALS</code> no se lee la
              foto: cualquier imagen devuelve la misma factura de ejemplo. Sirve para probar el
              flujo, pero <strong>lo que confirmes se guarda de verdad</strong> en Caja e inventario.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>1. Tipo de documento *</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["SALE_NOTE", "SUPPLIER_INVOICE"] as const).map((type) => {
            const active = docType === type;
            const Icon = type === "SALE_NOTE" ? ShoppingBag : FileText;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setDocType(type)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card"
                )}
              >
                <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                <span className="text-xs font-medium leading-tight">
                  {DOCUMENT_TYPE_LABEL[type]}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {type === "SALE_NOTE" ? "Ingreso a caja" : "Gasto / compra"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>2. Foto del documento *</Label>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {preview ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt="Vista previa del documento"
              className="max-h-64 w-full rounded-lg border border-border object-contain"
            />
            <p className="text-xs text-muted-foreground">{preview.note}</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                URL.revokeObjectURL(preview.url);
                setPreview(null);
              }}
            >
              Cambiar foto
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border bg-card p-5 text-xs font-medium"
            >
              <Camera className="h-6 w-6 text-primary" />
              Tomar foto
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border bg-card p-5 text-xs font-medium"
            >
              <Upload className="h-6 w-6 text-primary" />
              Subir archivo
            </button>
          </div>
        )}
      </div>

      <Button
        size="lg"
        onClick={handleProcess}
        disabled={processing || !docType || !preview || !visionConfigured}
      >
        {processing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Leyendo documento...
          </>
        ) : (
          "Procesar documento"
        )}
      </Button>
      {visionConfigured && (!docType || !preview) && (
        <p className="-mt-2 text-center text-xs text-muted-foreground">
          Selecciona el tipo y adjunta una foto para continuar.
        </p>
      )}

      {scans.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Documentos procesados
          </p>
          {scans.map((scan) => {
            const isDraft = scan.status === "DRAFT";
            return (
              <div
                key={scan.id}
                role={isDraft ? "button" : undefined}
                tabIndex={isDraft ? 0 : undefined}
                onClick={isDraft ? () => handleResume(scan.id) : undefined}
                onKeyDown={
                  isDraft
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleResume(scan.id);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-border bg-card p-3",
                  isDraft && "cursor-pointer hover:bg-accent/40"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {scan.counterpartyName || "Sin contraparte"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {DOCUMENT_TYPE_LABEL[scan.docType]}
                    {scan.documentNumber ? ` · ${scan.documentNumber}` : ""} · {scan.itemCount}{" "}
                    línea(s)
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {scan.total !== null && (
                    <span className="text-sm font-semibold">
                      {formatCurrency(scan.total, currency)}
                    </span>
                  )}
                  <Badge variant={scan.status === "CONFIRMED" ? "success" : "warning"}>
                    {resumingId === scan.id
                      ? "Abriendo..."
                      : scan.status === "CONFIRMED"
                        ? "Guardado"
                        : "Borrador · continuar"}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
