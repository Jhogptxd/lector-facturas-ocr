/**
 * Bucketing for the ventas-vs-gastos chart.
 *
 * Vive fuera de `actions/reportes.ts` porque ese archivo es `"use server"`,
 * donde toda exportación tiene que ser una función async de servidor — lo que
 * dejaría esta lógica imposible de testear. Acá es puro y determinista.
 *
 * Todos los cortes van en la zona del negocio, no en la del proceso: en Vercel
 * el servidor corre en UTC, así que una venta de las 20:00 en Ecuador cae en el
 * día siguiente UTC y aparecería en la barra equivocada.
 */

import { APP_LOCALE, APP_TIME_ZONE, zoneOffsetMs } from "@/lib/datetime";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SeriesGranularity = "day" | "week" | "month";

/** One bar in the income-vs-expense chart. */
export type SeriesPoint = {
  /** Bucket start, ISO — the stable key; `label` is only for display. */
  key: string;
  label: string;
  income: number;
  expense: number;
};

export type SeriesInput = {
  type: string;
  amount: number | string | { toString(): string };
  createdAt: Date;
};

/**
 * Bars have to stay readable on a phone, so the bucket size follows the span
 * rather than being fixed: a year of daily bars would be 365 slivers.
 */
export function pickGranularity(spanDays: number): SeriesGranularity {
  if (spanDays <= 21) return "day";
  if (spanDays <= 120) return "week";
  return "month";
}

/**
 * Instante UTC que corresponde a unos campos de calendario de la zona.
 *
 * El desfase se consulta dos veces: la primera con una estimación, la segunda
 * ya sobre el instante resultante, porque el desfase puede cambiar justo entre
 * ambos (en una zona con horario de verano). En America/Bogota las dos vueltas
 * dan lo mismo, pero así el cálculo no depende de que la zona sea fija.
 */
function fromZonedFields(utcFields: number, timeZone: string): Date {
  let instant = new Date(utcFields - zoneOffsetMs(new Date(utcFields), timeZone));
  instant = new Date(utcFields - zoneOffsetMs(instant, timeZone));
  return instant;
}

/** Campos de calendario de un instante, leídos en la zona del negocio. */
function zonedFields(date: Date, timeZone: string) {
  const shifted = new Date(date.getTime() + zoneOffsetMs(date, timeZone));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** Inicio del período al que pertenece una fecha, en la zona del negocio. */
export function bucketStart(
  date: Date,
  granularity: SeriesGranularity,
  timeZone: string = APP_TIME_ZONE
): Date {
  const { year, month, day, weekday } = zonedFields(date, timeZone);

  if (granularity === "month") {
    return fromZonedFields(Date.UTC(year, month, 1), timeZone);
  }
  if (granularity === "week") {
    // La semana arranca el lunes, que es como lee la semana un comerciante.
    const sinceMonday = (weekday + 6) % 7;
    return fromZonedFields(Date.UTC(year, month, day - sinceMonday), timeZone);
  }
  return fromZonedFields(Date.UTC(year, month, day), timeZone);
}

function nextBucket(date: Date, granularity: SeriesGranularity, timeZone: string): Date {
  const { year, month, day } = zonedFields(date, timeZone);
  if (granularity === "day") return fromZonedFields(Date.UTC(year, month, day + 1), timeZone);
  if (granularity === "week") return fromZonedFields(Date.UTC(year, month, day + 7), timeZone);
  return fromZonedFields(Date.UTC(year, month + 1, 1), timeZone);
}

function bucketLabel(date: Date, granularity: SeriesGranularity, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions =
    granularity === "month"
      ? { month: "short", year: "2-digit" }
      : { day: "2-digit", month: "short" };

  // Se arma desde las partes en vez de usar `format()` porque el español
  // intercala un "de" ("25 de jul") que en un eje de móvil ocupa un tercio más
  // de ancho y hace que las etiquetas se pisen.
  return new Intl.DateTimeFormat(APP_LOCALE, { timeZone, ...options })
    .formatToParts(date)
    .filter((part) => part.type === "day" || part.type === "month" || part.type === "year")
    .map((part) => part.value)
    .join(" ");
}

/**
 * Buckets income and expense into a continuous series.
 *
 * Empty buckets are emitted as zeros on purpose: skipping them would space the
 * bars evenly and hide the gap, making a quiet week look like a busy one.
 */
export function buildSeries(
  transactions: SeriesInput[],
  from: Date,
  to: Date,
  timeZone: string = APP_TIME_ZONE
): { points: SeriesPoint[]; granularity: SeriesGranularity } {
  // For an open-ended range ("Todo") the window starts at the first movement,
  // not at the year 2000, or the series would be mostly empty buckets.
  const earliest = transactions.reduce<Date | null>(
    (min, t) => (min === null || t.createdAt < min ? t.createdAt : min),
    null
  );
  const start = earliest && earliest > from ? earliest : from;
  const spanDays = Math.max(1, Math.ceil((to.getTime() - start.getTime()) / DAY_MS));
  const granularity = pickGranularity(spanDays);

  const buckets = new Map<string, SeriesPoint>();
  for (
    let cursor = bucketStart(start, granularity, timeZone);
    cursor <= to;
    cursor = nextBucket(cursor, granularity, timeZone)
  ) {
    buckets.set(cursor.toISOString(), {
      key: cursor.toISOString(),
      label: bucketLabel(cursor, granularity, timeZone),
      income: 0,
      expense: 0,
    });
  }

  for (const t of transactions) {
    const key = bucketStart(t.createdAt, granularity, timeZone).toISOString();
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const amount = Number(t.amount);
    if (t.type === "INCOME") bucket.income += amount;
    else if (t.type === "EXPENSE") bucket.expense += amount;
  }

  return { points: Array.from(buckets.values()), granularity };
}
