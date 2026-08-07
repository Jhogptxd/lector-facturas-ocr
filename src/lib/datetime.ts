// Time zone used to stamp business records. Kept explicit so the audit labels
// stored on a debt do not shift if the server runs in a different zone (UTC on
// most hosts) than the business it belongs to.
export const APP_TIME_ZONE = "America/Bogota";
export const APP_LOCALE = "es-CO";

/** Respaldo si la zona no se puede resolver: Colombia/Ecuador, UTC-5 sin horario de verano. */
const FALLBACK_OFFSET_MS = -5 * 60 * 60 * 1000;

/**
 * Desfase de la zona respecto a UTC, en milisegundos, para un instante dado.
 * Se calcula formateando el instante en la zona y comparando con el original,
 * en vez de asumir -5 fijo, para no romperse si el negocio cambia de zona.
 * Nunca lanza: ante cualquier fallo de Intl cae al respaldo.
 */
function zoneOffsetMs(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);

    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
    const [y, mo, d, h, mi, s] = [get("year"), get("month"), get("day"), get("hour"), get("minute"), get("second")];
    // Un runtime sin datos ICU completos puede devolver partes incompletas en
    // vez de lanzar: si algo no es numérico, se usa el respaldo.
    if ([y, mo, d, h, mi, s].some((n) => !Number.isFinite(n))) return FALLBACK_OFFSET_MS;

    const asUtc = Date.UTC(y, mo - 1, d, h % 24, mi, s);
    // El formateador solo llega al segundo, así que se compara contra el
    // instante truncado: de lo contrario los milisegundos se filtrarían al
    // desfase y el corte del día quedaría desplazado hasta un segundo.
    return asUtc - (date.getTime() - date.getMilliseconds());
  } catch {
    // Intl lanza RangeError si el runtime no conoce la zona (ICU recortado).
    return FALLBACK_OFFSET_MS;
  }
}

/**
 * Límites del día en curso según la zona del negocio: `start` inclusivo y `end`
 * exclusivo. Sirve para acotar "lo de hoy" sin que el corte caiga a las 19:00
 * locales por usar el día UTC.
 */
export function businessDayRange(now: Date = new Date(), timeZone: string = APP_TIME_ZONE) {
  // Una fecha inválida propagaría NaN al filtro de Prisma y haría fallar la
  // consulta; ante la duda se usa el instante actual.
  const safeNow = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const offset = zoneOffsetMs(safeNow, timeZone);
  const shifted = new Date(safeNow.getTime() + offset);
  const midnightLocalFields = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  );
  const start = new Date(midnightLocalFields - offset);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export type DebtTimestamp = {
  /** Weekday name, capitalised. e.g. "Lunes" */
  dayName: string;
  /** DD/MM/AAAA */
  dateLabel: string;
  /** HH:MM am/pm */
  timeLabel: string;
};

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Breaks an instant into the day / date / hour labels the app persists next to
 * a debt and reuses verbatim in reminder messages.
 */
export function buildDebtTimestamp(date: Date, timeZone: string = APP_TIME_ZONE): DebtTimestamp {
  const dayName = new Intl.DateTimeFormat(APP_LOCALE, { weekday: "long", timeZone }).format(date);

  const dateLabel = new Intl.DateTimeFormat(APP_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  }).format(date);

  const rawTime = new Intl.DateTimeFormat(APP_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(date);

  // es-CO renders the day period as "a. m." / "p. m.", and some ICU builds
  // separate it with a narrow or non-breaking space. Normalise the spacing
  // first, then collapse it to the "am"/"pm" form the spec asks for.
  const timeLabel = rawTime
    .replace(/[   ]/g, " ")
    .replace(/\ba\.?\s*m\.?/i, "am")
    .replace(/\bp\.?\s*m\.?/i, "pm")
    .replace(/\s+/g, " ")
    .trim();

  return { dayName: capitalize(dayName), dateLabel, timeLabel };
}

/**
 * Reads the audit labels off a debt row, falling back to formatting `createdAt`
 * for rows written before the labels existed.
 */
export function resolveDebtTimestamp(debt: {
  createdAt: Date | string;
  createdDayName?: string | null;
  createdDateLabel?: string | null;
  createdTimeLabel?: string | null;
}): DebtTimestamp {
  if (debt.createdDayName && debt.createdDateLabel && debt.createdTimeLabel) {
    return {
      dayName: debt.createdDayName,
      dateLabel: debt.createdDateLabel,
      timeLabel: debt.createdTimeLabel,
    };
  }
  return buildDebtTimestamp(new Date(debt.createdAt));
}

/**
 * Reminder copy sent one week before a debt's due date.
 */
export function buildDueSoonMessage(params: { supplierName: string; timestamp: DebtTimestamp }) {
  const { supplierName, timestamp } = params;
  return `Le recordamos pagar esta factura de ${supplierName}, registrada el ${timestamp.dayName} ${timestamp.dateLabel} a las ${timestamp.timeLabel}.`;
}
