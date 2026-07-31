/**
 * Bucketing for the ventas-vs-gastos chart.
 *
 * Pure and dependency-free on purpose: it lives outside `actions/reportes.ts`
 * because that file is `"use server"`, where every export has to be an async
 * server function — which would make this logic impossible to unit-test.
 */

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

/** Start of the bucket a date falls into, in local time. */
export function bucketStart(date: Date, granularity: SeriesGranularity): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (granularity === "week") {
    // Monday-first, matching how a shop owner reads a week.
    const weekday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - weekday);
  } else if (granularity === "month") {
    d.setDate(1);
  }
  return d;
}

function nextBucket(date: Date, granularity: SeriesGranularity): Date {
  const d = new Date(date);
  if (granularity === "day") d.setDate(d.getDate() + 1);
  else if (granularity === "week") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function bucketLabel(date: Date, granularity: SeriesGranularity): string {
  if (granularity === "month") {
    return date.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
  }
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
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
  to: Date
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
    let cursor = bucketStart(start, granularity);
    cursor <= to;
    cursor = nextBucket(cursor, granularity)
  ) {
    buckets.set(cursor.toISOString(), {
      key: cursor.toISOString(),
      label: bucketLabel(cursor, granularity),
      income: 0,
      expense: 0,
    });
  }

  for (const t of transactions) {
    const key = bucketStart(t.createdAt, granularity).toISOString();
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const amount = Number(t.amount);
    if (t.type === "INCOME") bucket.income += amount;
    else if (t.type === "EXPENSE") bucket.expense += amount;
  }

  return { points: Array.from(buckets.values()), granularity };
}
