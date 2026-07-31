"use client";

import { useEffect, useState, type ReactNode } from "react";
import { formatCurrency } from "@/lib/utils";

/**
 * Whether the charts may animate.
 *
 * Recharts grows its bars and sweeps its arcs on mount; that is motion the OS
 * setting asks us to skip. It starts `true` so the server render and the first
 * client render agree, then settles once `matchMedia` can be read.
 */
export function useChartAnimation(override?: boolean) {
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAllowed(!query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return override ?? allowed;
}

/**
 * Shared chart chrome for the Reportes module.
 *
 * The palette lives in `globals.css` as `--chart-*` custom properties so the
 * light and dark steps swap in one place; components reference roles, never
 * hex. Recharts forwards `fill`/`stroke` straight to the SVG node, so a
 * `var(--chart-income)` works the same as a literal colour.
 */
export const CHART_COLORS = {
  income: "var(--chart-income)",
  expense: "var(--chart-expense)",
  other: "var(--chart-other)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
} as const;

/** Categorical slots for the product pie, in fixed assignment order. */
export const CATEGORICAL_SLOTS = [
  "var(--chart-cat-1)",
  "var(--chart-cat-2)",
  "var(--chart-cat-3)",
  "var(--chart-cat-4)",
  "var(--chart-cat-5)",
] as const;

/** Axis ticks: short enough not to overflow a phone. `$1,2 M` beats `$1.200.000`. */
export function formatCompactCurrency(value: number, currency: string) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return formatCurrency(value, currency);
}

/** Hairline-bordered tooltip that follows the app's card styling. */
export function ChartTooltip({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color: string }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-2 shadow-md">
      <p className="mb-1 text-[11px] font-semibold text-popover-foreground">{title}</p>
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-[11px]">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: row.color }}
            />
            <span className="text-muted-foreground">{row.label}</span>
            <span className="ml-auto font-medium tabular-nums text-popover-foreground">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Legend chip: colour never carries identity alone — it always sits beside text. */
export function LegendSwatch({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-[2px]"
        style={{ background: color }}
      />
      {children}
    </span>
  );
}

export function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-border">
      <p className="px-6 text-center text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
