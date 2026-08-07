/**
 * Forma de una factura leída, y lo poco que hay que normalizar después.
 *
 * Deliberadamente sin `server-only` y sin dependencia del proveedor de IA: es
 * el contrato que comparten la extracción (`extract.ts`) y los borradores
 * releídos de la base, así que tiene que poder importarse desde cualquier lado.
 *
 * Hasta la migración a Gemini este archivo albergaba además ~250 líneas de
 * heurísticas que reconstruían estos campos a partir del volcado de texto de
 * Cloud Vision. El modelo ahora devuelve el JSON ya estructurado, así que esas
 * heurísticas se fueron con él.
 */

import { z } from "zod";

export const InvoiceItemSchema = z.object({
  descripcion: z.string(),
  cantidad: z.number().nullable(),
  precio_unitario: z.number().nullable(),
  precio_total: z.number().nullable(),
});

/**
 * Exactly the requested contract: `null` for anything not found on the page.
 *
 * Defined as a Zod schema so the same declaration validates a draft re-read from
 * the database, with the TypeScript type inferred from it — one source of truth.
 */
export const ParsedInvoiceSchema = z.object({
  ruc_emisor: z.string().nullable(),
  razon_social_emisor: z.string().nullable(),
  numero_comprobante: z.string().nullable(),
  /** YYYY-MM-DD */
  fecha_emision: z.string().nullable(),
  subtotal_12: z.number().nullable(),
  subtotal_0: z.number().nullable(),
  iva: z.number().nullable(),
  total: z.number().nullable(),
  items: z.array(InvoiceItemSchema),
});

export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;
export type ParsedInvoice = z.infer<typeof ParsedInvoiceSchema>;

/**
 * Cuánto de la página se recuperó de verdad. Alimenta el aviso de la pantalla
 * de revisión: una foto borrosa no falla, devuelve campos en null, así que la
 * interfaz necesita poder decir que encontró poco.
 */
export function parseCoverage(parsed: ParsedInvoice): "high" | "medium" | "low" {
  const keyFields = [
    parsed.ruc_emisor,
    parsed.razon_social_emisor,
    parsed.numero_comprobante,
    parsed.fecha_emision,
    parsed.total,
  ];
  const found = keyFields.filter((v) => v !== null).length;
  if (found >= 4 && parsed.items.length > 0) return "high";
  return found >= 3 ? "medium" : "low";
}

/**
 * Normaliza dd/mm/yyyy, dd-mm-yyyy y yyyy-mm-dd a `YYYY-MM-DD`.
 *
 * Al modelo se le pide la fecha ya en ISO, pero se le pide sobre una foto donde
 * casi siempre está impresa como dd/mm/yyyy: cuando se despista, copia lo que
 * ve. Esto lo endereza en lugar de guardar una fecha que `new Date()` leería
 * como mes/día y movería el asiento de mes.
 */
export function normalizeDate(raw: string): string | null {
  const cleaned = raw.trim();

  const iso = cleaned.match(/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/);
  if (iso) return buildDate(iso[1], iso[2], iso[3]);

  // Ambiguous forms are read as DD/MM/YYYY, the local convention.
  const local = cleaned.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (local) {
    const year = local[3].length === 2 ? `20${local[3]}` : local[3];
    return buildDate(year, local[2], local[1]);
  }

  return null;
}

function buildDate(y: string, m: string, d: string): string | null {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2200) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
