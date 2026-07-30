// Time zone used to stamp business records. Kept explicit so the audit labels
// stored on a debt do not shift if the server runs in a different zone (UTC on
// most hosts) than the business it belongs to.
export const APP_TIME_ZONE = "America/Bogota";
export const APP_LOCALE = "es-CO";

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
