"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/utils";
import {
  CATEGORICAL_SLOTS,
  CHART_COLORS,
  ChartEmptyState,
  ChartTooltip,
  useChartAnimation,
} from "@/components/reportes/ChartKit";

export type TopProduct = {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  share: number;
};

type Slice = {
  id: string;
  name: string;
  revenue: number;
  share: number;
  color: string;
};

/**
 * Donut of product share, with the figures repeated as a list underneath.
 *
 * The list is not decoration: three of the light-mode slot colours sit below
 * 3:1 against a white card, so the values have to be readable without relying
 * on the fill — and a donut is only good for "roughly how big", never for
 * comparing two close slices.
 */
export function TopProductsChart({
  topProducts,
  otherRevenue,
  otherCount,
  productRevenue,
  currency,
  animate,
}: {
  topProducts: TopProduct[];
  otherRevenue: number;
  otherCount: number;
  productRevenue: number;
  currency: string;
  /** Overrides the reduced-motion preference. */
  animate?: boolean;
}) {
  const animated = useChartAnimation(animate);
  const [activeId, setActiveId] = useState<string | null>(null);

  if (topProducts.length === 0) {
    return <ChartEmptyState message="Sin ventas de productos en este período." />;
  }

  const slices: Slice[] = topProducts.map((product, index) => ({
    id: product.productId,
    name: product.name,
    revenue: product.revenue,
    share: product.share,
    // Slot by rank position, fixed order — a product keeps its colour as long
    // as it keeps its place in the ranking.
    color: CATEGORICAL_SLOTS[index % CATEGORICAL_SLOTS.length],
  }));

  if (otherRevenue > 0) {
    slices.push({
      id: "__otros__",
      name: `Otros (${otherCount} producto${otherCount === 1 ? "" : "s"})`,
      revenue: otherRevenue,
      share: productRevenue > 0 ? (otherRevenue / productRevenue) * 100 : 0,
      color: CHART_COLORS.other,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="revenue"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={82}
              // A 2px surface gap separates the segments instead of a stroke.
              paddingAngle={1.5}
              stroke="hsl(var(--card))"
              strokeWidth={2}
              isAnimationActive={animated}
              animationDuration={450}
              onMouseEnter={(_, index) => setActiveId(slices[index].id)}
              onMouseLeave={() => setActiveId(null)}
            >
              {slices.map((slice) => (
                <Cell
                  key={slice.id}
                  fill={slice.color}
                  opacity={activeId === null || activeId === slice.id ? 1 : 0.45}
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const slice = payload[0].payload as Slice;
                return (
                  <ChartTooltip
                    title={slice.name}
                    rows={[
                      {
                        label: "Participación",
                        value: `${slice.share.toFixed(1)}%`,
                        color: slice.color,
                      },
                      {
                        label: "Ventas",
                        value: formatCurrency(slice.revenue, currency),
                        color: slice.color,
                      },
                    ]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* The hole is the natural place for the number the slices divide up. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span>
          <span className="text-sm font-bold">{formatCurrency(productRevenue, currency)}</span>
        </div>
      </div>

      <ul className="flex flex-col gap-1.5">
        {slices.map((slice) => (
          <li
            key={slice.id}
            className="flex items-center gap-2 text-xs"
            onMouseEnter={() => setActiveId(slice.id)}
            onMouseLeave={() => setActiveId(null)}
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: slice.color }}
            />
            <span className="truncate text-foreground">{slice.name}</span>
            <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
              {slice.share.toFixed(1)}%
            </span>
            <span className="w-20 shrink-0 text-right font-medium tabular-nums">
              {formatCurrency(slice.revenue, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
