import "server-only";

import { existsSync } from "fs";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { APP_TIME_ZONE } from "@/lib/datetime";
import { parseInvoiceText, type ParsedInvoice } from "@/lib/vision/parseInvoice";
import type { VisionMode } from "@/lib/vision/schema";

export type { VisionMode };

// The parsing helpers live in `parseInvoice.ts` (pure, unit-testable, no
// `server-only` guard) and are re-exported here so callers have a single entry
// point for the vision pipeline.
export {
  parseInvoiceText,
  parseAmount,
  normalizeDate,
  parseCoverage,
  ParsedInvoiceSchema,
  type ParsedInvoice,
  type InvoiceItem,
} from "@/lib/vision/parseInvoice";

/** Media types accepted for upload. Cloud Vision sniffs the format itself. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** Cloud Vision rejects payloads over 20 MB; stay well under. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/**
 * Returns true when credentials are available via either:
 *  - `GOOGLE_CREDENTIALS_JSON` env var (JSON string, used on Vercel)
 *  - `GOOGLE_APPLICATION_CREDENTIALS` file path (used locally)
 */
export function isVisionConfigured() {
  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON?.trim();
  if (credentialsJson) {
    try {
      JSON.parse(credentialsJson);
      return true;
    } catch {
      return false;
    }
  }
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!credentialsPath) return false;
  return existsSync(credentialsPath);
}

/**
 * - `google` → real Cloud Vision call.
 * - `mock`   → no credentials, but we're outside production: return canned data
 *              so the rest of the flow (draft, linking, stock, Transaction) can
 *              be exercised without a Google account.
 * - `off`    → no credentials in production, or the mock disabled explicitly.
 *
 * The production guard is deliberate. Without it, a deploy that forgets the
 * credential would silently book a fake $667 invoice into the real accounts
 * instead of showing an error.
 */
export function getVisionMode(): VisionMode {
  if (isVisionConfigured()) return "google";
  if (process.env.NODE_ENV === "production") return "off";
  // Accept the spellings someone would reach for to turn a flag off, not just
  // the documented "off" — a `VISION_MOCK=false` that silently kept the mock
  // running would be worse than useless.
  if (MOCK_DISABLED_VALUES.has(process.env.VISION_MOCK?.trim().toLowerCase() ?? "")) {
    return "off";
  }
  return "mock";
}

const MOCK_DISABLED_VALUES = new Set(["off", "false", "0", "no", "disabled"]);

export const MISSING_CREDENTIALS_MESSAGE =
  "La lectura automática no está configurada: falta GOOGLE_APPLICATION_CREDENTIALS o la ruta no existe. Descarga el JSON de la cuenta de servicio de Google Cloud, apunta la variable a ese archivo en tu .env y reinicia el servidor.";

let cachedClient: ImageAnnotatorClient | null = null;

function getClient(): ImageAnnotatorClient {
  if (!cachedClient) {
    const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON?.trim();
    if (credentialsJson) {
      // Vercel: credentials supplied as a JSON string in env var.
      cachedClient = new ImageAnnotatorClient({ credentials: JSON.parse(credentialsJson) });
    } else {
      // Local: credentials file pointed to by GOOGLE_APPLICATION_CREDENTIALS.
      cachedClient = new ImageAnnotatorClient();
    }
  }
  return cachedClient;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ExtractionFailure = {
  ok: false;
  kind: "not_configured" | "no_text" | "api_error";
  message: string;
};

export type ExtractionSuccess = {
  ok: true;
  parsed: ParsedInvoice;
  raw: string;
  /** True when the data is canned, not read from a real photo. */
  mock?: boolean;
};

export type ExtractionResult = ExtractionSuccess | ExtractionFailure;

// ---------------------------------------------------------------------------
// Mock mode
// ---------------------------------------------------------------------------

/** Emulates the round-trip latency of the real API. */
const MOCK_DELAY_MS = 2000;

/** Ecuador's current standard VAT rate. */
const IVA_RATE = 0.15;

/**
 * Canned purchase from a bakery-supplies wholesaler.
 *
 * Flour is a `tarifa 0%` staple in Ecuador while yeast and shortening are
 * taxed, so the mock splits the base across both subtotals — that way the
 * 0%/taxed fields both get exercised instead of one always sitting at zero.
 *
 * The arithmetic is asserted below, not just written down, so an edit to the
 * lines can't leave the totals quietly inconsistent.
 */
const MOCK_ITEMS = [
  { descripcion: "Sacos de Harina de Trigo 50kg", cantidad: 10, precio_unitario: 38.5, taxed: false },
  { descripcion: "Cajas de Levadura Fresca 500g x20", cantidad: 4, precio_unitario: 27.75, taxed: true },
  { descripcion: "Bloques de Manteca Vegetal 15kg", cantidad: 6, precio_unitario: 22.4, taxed: true },
] as const;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Today's date in the app's time zone, as `YYYY-MM-DD`. */
function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function buildMockInvoice(): { parsed: ParsedInvoice; raw: string } {
  const items = MOCK_ITEMS.map((item) => ({
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
    precio_total: round2(item.cantidad * item.precio_unitario),
  }));

  const base = (taxed: boolean) =>
    round2(
      MOCK_ITEMS.reduce(
        (sum, item, i) => (item.taxed === taxed ? sum + items[i].precio_total : sum),
        0
      )
    );

  const subtotal12 = base(true); // 245.40
  const subtotal0 = base(false); // 385.00
  const iva = round2(subtotal12 * IVA_RATE); // 36.81
  const total = round2(subtotal12 + subtotal0 + iva); // 667.21

  const itemsSum = round2(items.reduce((sum, item) => sum + item.precio_total, 0));
  if (itemsSum !== round2(subtotal12 + subtotal0)) {
    throw new Error(
      `Mock inconsistente: el detalle suma ${itemsSum} y los subtotales ${round2(subtotal12 + subtotal0)}.`
    );
  }

  const parsed: ParsedInvoice = {
    ruc_emisor: "1790012345001",
    razon_social_emisor: "MOLINOS Y LEVADURAS DEL ECUADOR S.A.",
    numero_comprobante: "001-001-000123456",
    fecha_emision: todayIso(),
    subtotal_12: subtotal12,
    subtotal_0: subtotal0,
    iva,
    total,
    items,
  };

  // A plausible OCR dump, kept in sync with `parsed`, so `raw` isn't empty in
  // mock mode. Handy for checking the parser against this same text:
  //   parseInvoiceText(raw)  ≈  parsed
  const raw = [
    "MOLINOS Y LEVADURAS DEL ECUADOR S.A.",
    "RUC: 1790012345001",
    "FACTURA",
    `No. ${parsed.numero_comprobante}`,
    `FECHA DE EMISION: ${todayIso().split("-").reverse().join("/")}`,
    "",
    "CANT  DESCRIPCION                          P.UNIT    TOTAL",
    ...items.map(
      (item) =>
        `${item.cantidad}  ${item.descripcion}  ${item.precio_unitario.toFixed(2)}  ${item.precio_total.toFixed(2)}`
    ),
    "",
    `SUBTOTAL 0%        ${subtotal0.toFixed(2)}`,
    `SUBTOTAL 15%       ${subtotal12.toFixed(2)}`,
    `IVA 15%            ${iva.toFixed(2)}`,
    `VALOR TOTAL        ${total.toFixed(2)}`,
  ].join("\n");

  return { parsed, raw };
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

/**
 * Runs Cloud Vision `documentTextDetection` and parses the recognised text.
 *
 * Returns a discriminated result rather than throwing for the outcomes a user
 * can act on (bad photo, missing credentials), so the UI can show something
 * useful instead of a generic failure.
 */
export async function extractInvoiceFields(params: {
  base64Image: string;
}): Promise<ExtractionResult> {
  const mode = getVisionMode();

  if (mode === "off") {
    return { ok: false, kind: "not_configured", message: MISSING_CREDENTIALS_MESSAGE };
  }

  if (mode === "mock") {
    console.warn(
      "[DEV] Credenciales de Google no encontradas. Usando datos simulados (Mock) para el OCR."
    );
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
    const { parsed, raw } = buildMockInvoice();
    return { ok: true, parsed, raw, mock: true };
  }

  try {
    const [result] = await getClient().documentTextDetection({
      image: { content: params.base64Image },
    });

    if (result.error?.message) {
      return {
        ok: false,
        kind: "api_error",
        message: `Cloud Vision devolvió un error: ${result.error.message}`,
      };
    }

    const raw = result.fullTextAnnotation?.text ?? "";
    if (!raw.trim()) {
      return {
        ok: false,
        kind: "no_text",
        message:
          "No se detectó texto en la imagen. Toma la foto de nuevo con más luz, enfocada y sin sombras.",
      };
    }

    return { ok: true, parsed: parseInvoiceText(raw), raw };
  } catch (error) {
    const message = (error as Error).message ?? "error desconocido";
    // Credential problems can also surface here rather than in the pre-check.
    if (/could not load the default credentials|unable to detect a project|ENOENT/i.test(message)) {
      return { ok: false, kind: "not_configured", message: MISSING_CREDENTIALS_MESSAGE };
    }
    return {
      ok: false,
      kind: "api_error",
      message: `No se pudo leer el documento con Cloud Vision: ${message}`,
    };
  }
}
