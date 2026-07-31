"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { SeriesGranularity, SeriesPoint } from "@/lib/reportes/series";
import {
  CHART_COLORS,
  ChartEmptyState,
  ChartTooltip,
  LegendSwatch,
  formatCompactCurrency,
  useChartAnimation,
} from "@/components/reportes/ChartKit";

const GRANULARITY_LABEL: Record<SeriesGranularity, string> = {
  day: "por día",
  week: "por semana",
  month: "por mes",
};

/**
 * Grouped bars, ventas vs gastos, on a single axis.
 *
 * Both series are money in the same currency, so they share one scale — a
 * second y-axis would invent a relationship the data doesn't have.
 */
export function IncomeExpenseChart({
  series,
  granularity,
  currency,
  animate,
}: {
  series: SeriesPoint[];
  granularity: SeriesGranularity;
  currency: string;
  /** Overrides the reduced-motion preference. */
  animate?: boolean;
}) {
  const animated = useChartAnimation(animate);
  const hasMovement = series.some((p) => p.income > 0 || p.expense > 0);

  if (!hasMovement) {
    return <ChartEmptyState message="Sin movimientos en este período. Registra una venta o un gasto para ver la comparación." />;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <LegendSwatch color={CHART_COLORS.income}>Ventas</LegendSwatch>
        <LegendSwatch color={CHART_COLORS.expense}>Gastos</LegendSwatch>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
          {GRANULARITY_LABEL[granularity]}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barGap={2}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.grid }}
            tick={{ fontSize: 10, fill: CHART_COLORS.axis }}
            // Phones are narrow: thin the ticks instead of letting them overlap.
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fontSize: 10, fill: CHART_COLORS.axis }}
            tickFormatter={(value: number) => formatCompactCurrency(value, currency)}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as SeriesPoint;
              return (
                <ChartTooltip
                  title={String(label)}
                  rows={[
                    {
                      label: "Ventas",
                      value: formatCurrency(point.income, currency),
                      color: CHART_COLORS.income,
                    },
                    {
                      label: "Gastos",
                      value: formatCurrency(point.expense, currency),
                      color: CHART_COLORS.expense,
                    },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="income"
            name="Ventas"
            fill={CHART_COLORS.income}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
            isAnimationActive={animated}
            animationDuration={450}
          />
          <Bar
            dataKey="expense"
            name="Gastos"
            fill={CHART_COLORS.expense}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
            isAnimationActive={animated}
            animationDuration={450}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
