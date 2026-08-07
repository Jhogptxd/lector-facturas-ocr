import { z } from "zod";

/**
 * Contracts for the review-and-confirm half of the scanning flow.
 *
 * The *extraction* shape lives in `parseInvoice.ts` (`ParsedInvoiceSchema`).
 * What follows is what the client sends back after a human has checked the
 * draft, which is intentionally a separate contract: it uses the same field
 * names as the database columns and carries the catalog links the OCR never
 * produces.
 */

/**
 * How the extraction step is running. Lives here rather than in `extract.ts`
 * because the page passes it to a Client Component, and `extract.ts` is
 * `server-only`. See `getVisionMode()` for what each value means.
 */
export type VisionMode = "gemini" | "mock" | "off";

export const DOCUMENT_TYPES = ["SALE_NOTE", "SUPPLIER_INVOICE"] as const;
export type DocumentTypeValue = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABEL: Record<DocumentTypeValue, string> = {
  SALE_NOTE: "Nota de Venta Emitida",
  SUPPLIER_INVOICE: "Factura de Proveedor",
};

/** A reviewed line: corrected figures plus the optional catalog link. */
export const ReviewedLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  lineTotal: z.number(),
  productId: z.string().nullable(),
  /**
   * Set when the linked product was created inline from this line with its
   * initial stock already equal to this quantity, so confirming must not add the
   * same units twice.
   */
  stockPreapplied: z.boolean(),
});

export type ReviewedLineItem = z.infer<typeof ReviewedLineItemSchema>;

/** Fields the quick-create dialog collects. */
export const CreateQuickProductSchema = z.object({
  name: z.string().min(1, "El nombre del producto es obligatorio."),
  costPrice: z.number().nonnegative("El costo no puede ser negativo."),
  salePrice: z.number().positive("Ingresa un precio de venta mayor a cero."),
  stock: z.number("Ingresa un stock inicial válido."),
});

export type CreateQuickProductInput = z.infer<typeof CreateQuickProductSchema>;

/** Payload the confirm action accepts after the user has reviewed the draft. */
export const ConfirmScanSchema = z.object({
  scanId: z.string().min(1),
  documentNumber: z.string().nullable(),
  issueDate: z.string().nullable(),
  counterpartyName: z.string().min(1, "El nombre de la contraparte es obligatorio."),
  counterpartyTaxId: z.string().nullable(),
  subtotal12: z.number().nonnegative().nullable(),
  subtotal0: z.number().nonnegative().nullable(),
  taxAmount: z.number().nonnegative().nullable(),
  total: z.number().positive("El total debe ser mayor a cero."),
  paymentMethod: z.enum(["CASH", "TRANSFER", "CREDIT"]),
  dueDate: z.string().nullable(),
  items: z.array(ReviewedLineItemSchema),
});

export type ConfirmScanInput = z.infer<typeof ConfirmScanSchema>;
