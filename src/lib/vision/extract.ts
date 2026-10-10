import "server-only";

import { ApiError, GoogleGenAI, Type } from "@google/genai";
import { APP_TIME_ZONE } from "@/lib/datetime";
import { ParsedInvoiceSchema, normalizeDate, type ParsedInvoice } from "@/lib/vision/invoice";
import type { VisionMode } from "@/lib/vision/schema";

export type { VisionMode };

// El contrato de la factura vive en `invoice.ts` (puro, sin `server-only` ni
// dependencia del proveedor) y se reexporta aquí para que quien llame tenga una
// sola puerta de entrada a la lectura de documentos.
export {
  normalizeDate,
  parseCoverage,
  ParsedInvoiceSchema,
  type ParsedInvoice,
  type InvoiceItem,
} from "@/lib/vision/invoice";

/**
 * Formatos que acepta la subida. Es la intersección de lo que Gemini entiende
 * con lo que un `<img>` sabe pintar después: el respaldo del comprobante se
 * guarda con este mismo tipo y el dueño tiene que poder verlo desde Caja.
 *
 * GIF salió al migrar desde Cloud Vision —Gemini no lo admite—; en la práctica
 * no cambia nada, porque el navegador reencoda toda foto a JPEG antes de subir.
 */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/**
 * Una petición con la imagen incrustada no puede pasar de 20 MB; este tope deja
 * margen de sobra, y de todos modos el navegador sube ~1 MB tras comprimir.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Modelo por defecto. Se puede fijar otro con `GEMINI_MODEL` sin tocar código.
 *
 * Es un alias, no una versión fija, y eso es deliberado: aquí ya se quemaron
 * dos modelos clavados a mano. Primero `gemini-1.5-flash`, cuando la serie 1.5
 * quedó fuera de alcance para los proyectos nuevos; después `gemini-2.5-flash`,
 * que una clave recién creada ya no alcanza —responde 404 pidiendo que se use
 * la serie 3—. Cada retiro dejó la lectura de facturas muerta hasta que alguien
 * tocó el código. `gemini-flash-latest` sigue apuntando al flash vigente, así
 * que el próximo retiro no rompe nada.
 *
 * Probado contra la API el 2026-10-09: lee una factura completa (emisor, RUC,
 * comprobante, fecha, subtotales, IVA, total y las tres líneas de detalle) sin
 * errores.
 */
const DEFAULT_MODEL = "gemini-flash-latest";

function getModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

// ---------------------------------------------------------------------------
// Credenciales
// ---------------------------------------------------------------------------

function getApiKey() {
  return process.env.GEMINI_API_KEY?.trim() || "";
}

/** True cuando hay una clave de la API de Gemini configurada. */
export function isVisionConfigured() {
  return getApiKey().length > 0;
}

/**
 * - `gemini` → llamada real a la API.
 * - `mock`   → sin clave, pero fuera de producción: devuelve datos de ejemplo
 *              para poder ejercitar el resto del flujo (borrador, vínculos,
 *              stock, Transaction) sin darse de alta en ningún lado.
 * - `off`    → sin clave en producción, o mock desactivado explícitamente.
 *
 * El corte en producción es deliberado. Sin él, un despliegue que olvidara la
 * clave registraría en silencio una factura falsa de $667 en las cuentas
 * reales en vez de mostrar un error.
 */
export function getVisionMode(): VisionMode {
  if (isVisionConfigured()) return "gemini";
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
  "La lectura automática no está configurada: falta GEMINI_API_KEY. Crea una clave gratuita en Google AI Studio (aistudio.google.com/apikey), añádela a tu .env y reinicia el servidor.";

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!cachedClient) cachedClient = new GoogleGenAI({ apiKey: getApiKey() });
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
  /** El JSON tal cual lo devolvió el modelo, para poder auditar la lectura. */
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

function buildMockInvoice(): ParsedInvoice {
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

  return {
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
}

// ---------------------------------------------------------------------------
// Extracción
// ---------------------------------------------------------------------------

/**
 * Esquema que se le impone a la respuesta. No es una sugerencia del prompt: la
 * API obliga al modelo a emitir exactamente esta forma, así que no hay manera
 * de que conteste con explicaciones, disculpas ni un bloque ```json alrededor.
 *
 * Todos los campos van en `required` —incluidos los que pueden ser null— porque
 * `ParsedInvoiceSchema` espera la clave presente: una clave ausente es
 * `undefined` y no pasa la validación.
 */
const NUMBER_OR_NULL = { type: Type.NUMBER, nullable: true } as const;
const STRING_OR_NULL = { type: Type.STRING, nullable: true } as const;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ruc_emisor: { ...STRING_OR_NULL, description: "RUC o cédula del emisor, solo dígitos." },
    razon_social_emisor: {
      ...STRING_OR_NULL,
      description: "Nombre o razón social de quien emite el documento.",
    },
    numero_comprobante: {
      ...STRING_OR_NULL,
      description: "Número del comprobante, con su formato impreso (ej. 001-001-000123456).",
    },
    fecha_emision: { ...STRING_OR_NULL, description: "Fecha de emisión en formato YYYY-MM-DD." },
    subtotal_12: {
      ...NUMBER_OR_NULL,
      description: "Suma de las líneas gravadas con IVA (12% histórico, 15% actual).",
    },
    subtotal_0: { ...NUMBER_OR_NULL, description: "Suma de las líneas con tarifa 0%." },
    iva: { ...NUMBER_OR_NULL, description: "Monto del IVA." },
    total: { ...NUMBER_OR_NULL, description: "Valor total a pagar, con IVA incluido." },
    items: {
      type: Type.ARRAY,
      description: "Una entrada por línea del detalle. Vacío si no hay detalle legible.",
      items: {
        type: Type.OBJECT,
        properties: {
          descripcion: { type: Type.STRING, description: "Descripción del producto o servicio." },
          cantidad: NUMBER_OR_NULL,
          precio_unitario: NUMBER_OR_NULL,
          precio_total: NUMBER_OR_NULL,
        },
        required: ["descripcion", "cantidad", "precio_unitario", "precio_total"],
      },
    },
  },
  required: [
    "ruc_emisor",
    "razon_social_emisor",
    "numero_comprobante",
    "fecha_emision",
    "subtotal_12",
    "subtotal_0",
    "iva",
    "total",
    "items",
  ],
};

const PROMPT = [
  "Eres un asistente contable que transcribe comprobantes ecuatorianos (facturas y notas de venta).",
  "Extrae los datos de la imagen y devuelve ÚNICAMENTE el JSON del esquema, sin texto alrededor.",
  "",
  "Reglas:",
  "- Transcribe lo que está impreso. No inventes, no completes ni estimes ningún dato.",
  "- Si un campo no aparece o no se lee con seguridad, ponlo en null. Es preferible un null a un valor inventado.",
  "- Los importes van como número, con punto decimal y sin símbolo de moneda ni separador de miles.",
  "- La fecha de emisión va como YYYY-MM-DD. Ojo: en Ecuador se imprime dd/mm/aaaa, así que 05/08/2026 es el 2026-08-05.",
  "- En `items` incluye una entrada por línea del detalle, en el orden impreso. Si el detalle no se lee, devuelve una lista vacía.",
  "- No sumes ni recalcules totales: copia los que estén impresos. Si el documento no los muestra, van en null.",
].join("\n");

/**
 * Manda la foto a Gemini y devuelve la factura ya estructurada.
 *
 * Devuelve un resultado discriminado en vez de lanzar para los desenlaces sobre
 * los que el usuario puede actuar (foto ilegible, falta la clave, cuota agotada),
 * para que la interfaz muestre algo útil en lugar de un fallo genérico.
 */
export async function extractInvoiceFields(params: {
  base64Image: string;
  mediaType: AcceptedImageType;
}): Promise<ExtractionResult> {
  const mode = getVisionMode();

  if (mode === "off") {
    return { ok: false, kind: "not_configured", message: MISSING_CREDENTIALS_MESSAGE };
  }

  if (mode === "mock") {
    console.warn("[DEV] Falta GEMINI_API_KEY. Usando datos simulados (Mock) para la lectura.");
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
    const parsed = buildMockInvoice();
    return { ok: true, parsed, raw: JSON.stringify(parsed, null, 2), mock: true };
  }

  let raw: string;
  try {
    const response = await withRetry(() =>
      getClient().models.generateContent({
        model: getModel(),
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: params.mediaType, data: params.base64Image } },
              { text: PROMPT },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          // Transcribir no es una tarea creativa: se quiere la misma lectura de
          // la misma foto, no una versión distinta en cada intento.
          temperature: 0,
        },
      })
    );

    raw = response.text?.trim() ?? "";
  } catch (error) {
    return { ok: false, kind: "api_error", message: describeApiError(error) };
  }

  if (!raw) {
    return {
      ok: false,
      kind: "no_text",
      message:
        "El modelo no devolvió nada legible de esta foto. Tómala de nuevo con más luz, enfocada y sin sombras.",
    };
  }

  // El esquema hace improbable un JSON con otra forma, pero se valida igual:
  // esto es lo que se guarda y luego se vuelca a Caja e inventario.
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    console.error("[gemini] respuesta no es JSON:", raw.slice(0, 500));
    return {
      ok: false,
      kind: "api_error",
      message: "La respuesta del modelo no vino en el formato esperado. Intenta procesar de nuevo.",
    };
  }

  const validated = ParsedInvoiceSchema.safeParse(candidate);
  if (!validated.success) {
    console.error("[gemini] JSON fuera de contrato:", validated.error.issues);
    return {
      ok: false,
      kind: "api_error",
      message: "La lectura llegó incompleta. Intenta procesar de nuevo o registra el documento a mano.",
    };
  }

  return { ok: true, parsed: sanitize(validated.data), raw };
}

/**
 * Endereza lo que el esquema no puede garantizar: que la fecha venga de verdad
 * en ISO y que no queden descripciones vacías ocupando una línea del detalle.
 */
function sanitize(parsed: ParsedInvoice): ParsedInvoice {
  return {
    ...parsed,
    fecha_emision: parsed.fecha_emision ? normalizeDate(parsed.fecha_emision) : null,
    items: parsed.items.filter((item) => item.descripcion.trim().length > 0),
  };
}

/** Esperas entre reintentos, en milisegundos. */
const RETRY_DELAYS_MS = [1500, 4000];

/**
 * Reintenta solo los fallos que de verdad son pasajeros.
 *
 * La ruta de visión de Gemini devuelve 503 "high demand" con bastante
 * frecuencia: midiendo contra la API real, una de cada dos lecturas fallaba al
 * primer intento y salía bien al segundo. Sin esto el dueño ve "el servicio
 * está caído", vuelve a tomar la foto y repite el trabajo para nada.
 *
 * Un 400, 403 o 404 no se reintenta: la clave o el modelo están mal y repetir
 * no lo arregla. Un 429 tampoco: la cuota está agotada y reintentar la quema
 * más rápido.
 */
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
      const transient = error instanceof ApiError && error.status >= 500;
      const delay = RETRY_DELAYS_MS[attempt];
      if (!transient || delay === undefined) break;
      console.warn(
        `[gemini] ${error instanceof ApiError ? error.status : "error"} pasajero; reintentando en ${delay} ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/** Traduce el fallo de la API a algo sobre lo que el dueño pueda actuar. */
function describeApiError(error: unknown): string {
  const message = (error as Error)?.message ?? "error desconocido";

  if (error instanceof ApiError) {
    if (error.status === 400 && /api[_ ]?key/i.test(message)) {
      return "La GEMINI_API_KEY no es válida. Genera una nueva en Google AI Studio y actualízala.";
    }
    if (error.status === 403) {
      return "La GEMINI_API_KEY no tiene permiso para usar este modelo. Revísala en Google AI Studio.";
    }
    if (error.status === 404) {
      return `El modelo "${getModel()}" no existe o tu clave no lo alcanza. Cambia GEMINI_MODEL por uno disponible.`;
    }
    if (error.status === 429) {
      return "Se agotó la cuota gratuita de lectura por ahora. Espera unos minutos y vuelve a intentar.";
    }
    if (error.status >= 500) {
      // Se llega aquí con los reintentos ya agotados, así que no tiene sentido
      // sugerir "vuelve a intentar" sin más: la saturación lleva un rato.
      return "El servicio de lectura de Google está saturado ahora mismo. Se reintentó sin suerte; prueba de nuevo en unos minutos o registra el documento a mano desde Caja.";
    }
  }

  return `No se pudo leer el documento: ${message}`;
}
