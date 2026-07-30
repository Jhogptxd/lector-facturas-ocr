/**
 * Pure parsing of raw OCR text into invoice fields.
 *
 * Deliberately free of `server-only` and of any Google dependency: it is plain
 * string manipulation, which keeps it unit-testable without credentials. The
 * OCR call itself lives in `extract.ts`, which re-exports everything here.
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
 * How much of the page the heuristics actually recovered. Drives the warning on
 * the review screen — OCR parsing degrades quietly, so the UI needs to say when
 * it found little.
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

// ---------------------------------------------------------------------------
// Numbers and dates
// ---------------------------------------------------------------------------

/**
 * Parses an amount written in either Latin American (`1.234,56`) or Anglo
 * (`1,234.56`) notation.
 *
 * Rule: when both separators appear, the rightmost is the decimal point. When
 * only one appears, it is a decimal point only if followed by one or two digits
 * at the end — otherwise it groups thousands.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/[^\d.,-]/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot > -1) {
    if (!/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, "");
  }

  const value = Number.parseFloat(s);
  return Number.isFinite(value) ? value : null;
}

/** Normalises dd/mm/yyyy, dd-mm-yyyy and yyyy-mm-dd to `YYYY-MM-DD`. */
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

/** Last number on a line — invoice figures sit at the right edge. */
function lastAmountOnLine(line: string): number | null {
  const matches = line.match(/-?[\d.,]*\d/g);
  if (!matches?.length) return null;
  return parseAmount(matches[matches.length - 1]);
}

/**
 * Finds an amount by label: reads the number on the label's own line, falling
 * back to the next couple of lines for layouts that place labels and figures in
 * separate columns.
 */
function findLabeledAmount(lines: string[], label: RegExp): number | null {
  for (let i = 0; i < lines.length; i += 1) {
    if (!label.test(lines[i])) continue;

    const sameLine = lastAmountOnLine(lines[i].replace(label, " "));
    if (sameLine !== null) return sameLine;

    for (let j = i + 1; j < Math.min(i + 3, lines.length); j += 1) {
      const next = lastAmountOnLine(lines[j]);
      if (next !== null) return next;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Field extractors
// ---------------------------------------------------------------------------

/** Ecuadorian RUC is 13 digits. Prefers one adjacent to a RUC/CI/NIT label. */
function findTaxId(text: string, lines: string[]): string | null {
  for (const line of lines) {
    if (!/\b(R\.?U\.?C\.?|C\.?I\.?|NIT|RIF)\b/i.test(line)) continue;
    const digits = line.match(/\b(\d{10,13})\b/);
    if (digits) return digits[1];
  }
  const anyRuc = text.match(/\b(\d{13})\b/);
  return anyRuc ? anyRuc[1] : null;
}

/**
 * Company name. Prefers a line carrying a legal suffix; otherwise the first line
 * that reads like a name rather than a label or figure, since the business name
 * is normally printed at the top of the page.
 */
function findCompanyName(lines: string[]): string | null {
  const legalSuffix =
    /\b(S\.?A\.?S?\.?|C\.?A\.?|LTDA|CIA|S\.?R\.?L\.?|E\.?I\.?R\.?L\.?|INC)\b/i;

  for (const line of lines.slice(0, 12)) {
    if (legalSuffix.test(line) && letterCount(line) >= 4) return cleanName(line);
  }

  // Fallback needs a reasonably long line: a real company name runs well past a
  // few characters, and requiring length keeps OCR noise out of this field.
  const labelish =
    /(factura|nota de venta|recibo|ruc|r\.u\.c|fecha|autoriz|cliente|subtotal|iva|total|cantidad|descripci)/i;
  for (const line of lines.slice(0, 8)) {
    if (letterCount(line) >= 8 && !labelish.test(line) && !/^\d/.test(line.trim())) {
      return cleanName(line);
    }
  }

  return null;
}

function letterCount(line: string): number {
  return line.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").length;
}

/** Removes specific regex matches from a string, working right-to-left so earlier indices stay valid. */
function removeTokens(line: string, tokens: RegExpMatchArray[]): string {
  const spans = tokens
    .filter((t) => t.index !== undefined)
    .map((t) => ({ start: t.index as number, end: (t.index as number) + t[0].length }))
    .sort((a, b) => b.start - a.start);

  let out = line;
  for (const span of spans) {
    out = `${out.slice(0, span.start)} ${out.slice(span.end)}`;
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function cleanName(line: string): string {
  return line
    .replace(/\b(R\.?U\.?C\.?|NIT|RIF)\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** SRI receipt number (`001-001-000000123`), else a number after a document label. */
function findDocumentNumber(text: string, lines: string[]): string | null {
  const sri = text.match(/\b(\d{3}-\d{3}-\d{6,9})\b/);
  if (sri) return sri[1];

  for (const line of lines) {
    if (!/(factura|nota de venta|comprobante|recibo)/i.test(line)) continue;
    const numbered = line.match(/(?:n[o°º.]*|#|nro\.?|num\.?)\s*[:.]?\s*([A-Z0-9-]{4,})/i);
    if (numbered) return numbered[1];
  }
  return null;
}

function findIssueDate(lines: string[]): string | null {
  for (const line of lines) {
    if (!/fecha/i.test(line)) continue;
    const parsed = normalizeDate(line);
    if (parsed) return parsed;
  }
  // No labelled date: accept the first date-looking token anywhere.
  for (const line of lines) {
    const parsed = normalizeDate(line);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Line items — the least reliable part of OCR parsing, because raw text carries
 * no table structure. Relies on the common layout
 * `qty | description | unit price | line total`.
 *
 * A candidate row must end in at least two amounts *and* have its arithmetic
 * hold (qty x unit ≈ total, 2% tolerance). That check is what keeps address
 * lines and the totals block out of the detail.
 */
function findItems(lines: string[]): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  const totalsBlock =
    /(subtotal|iva|i\.v\.a|total|descuento|propina|valor a pagar|forma de pago|autoriz)/i;

  for (const line of lines) {
    if (totalsBlock.test(line)) continue;

    const numbers = Array.from(line.matchAll(/-?[\d.,]*\d/g));
    if (numbers.length < 3) continue;

    const qtyToken = numbers[0];
    const unitToken = numbers[numbers.length - 2];
    const totalToken = numbers[numbers.length - 1];

    const quantity = parseAmount(qtyToken[0]);
    const unitPrice = parseAmount(unitToken[0]);
    const lineTotal = parseAmount(totalToken[0]);
    if (quantity === null || unitPrice === null || lineTotal === null) continue;
    if (quantity <= 0 || lineTotal <= 0) continue;

    const tolerance = Math.max(0.02 * Math.abs(lineTotal), 0.05);
    if (Math.abs(quantity * unitPrice - lineTotal) > tolerance) continue;

    // Strip only the three tokens actually consumed, so sizes embedded in the
    // description survive ("Cemento Portland 50kg", "Varilla 12mm 6m").
    const description = removeTokens(line, [qtyToken, unitToken, totalToken]);
    if (letterCount(description) < 3) continue;

    items.push({
      descripcion: description,
      cantidad: quantity,
      precio_unitario: unitPrice,
      precio_total: lineTotal,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseInvoiceText(text: string): ParsedInvoice {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Ecuador's taxed rate moved 12% -> 15% and other countries differ, so match
  // any double-digit percentage rather than hard-coding 12.
  const subtotalTaxed = findLabeledAmount(lines, /subtotal[^\n%]*\b(1[2-9]|[2-9]\d)\s*%/i);
  const subtotalZero = findLabeledAmount(
    lines,
    /subtotal[^\n%]*\b0\s*%|subtotal\s+sin\s+impuesto|exent/i
  );

  // Require a total-ish label and exclude SUBTOTAL rows, so "TOTAL" never
  // accidentally matches inside "SUBTOTAL".
  let total = findLabeledAmount(lines, /\b(valor\s+total|total\s+a\s+pagar|importe\s+total)\b/i);
  if (total === null) {
    const totalIndex = lines.findIndex((l) => /\btotal\b/i.test(l) && !/subtotal/i.test(l));
    if (totalIndex > -1) {
      total = lastAmountOnLine(lines[totalIndex]);
      if (total === null) {
        for (let j = totalIndex + 1; j < Math.min(totalIndex + 3, lines.length); j += 1) {
          total = lastAmountOnLine(lines[j]);
          if (total !== null) break;
        }
      }
    }
  }

  return {
    ruc_emisor: findTaxId(text, lines),
    razon_social_emisor: findCompanyName(lines),
    numero_comprobante: findDocumentNumber(text, lines),
    fecha_emision: findIssueDate(lines),
    subtotal_12: subtotalTaxed,
    subtotal_0: subtotalZero,
    iva: findLabeledAmount(lines, /\bi\.?v\.?a\.?\b/i),
    total,
    items: findItems(lines),
  };
}
