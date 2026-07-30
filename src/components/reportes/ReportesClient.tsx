"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/useStore";
import { formatCurrency, cn } from "@/lib/utils";
import {
  getDashboardMetrics,
  getSalesReportRows,
  getCashReportRows,
  getInventoryReportRows,
  type ReportRange,
} from "@/lib/actions/reportes";
import { exportRowsToExcel, exportRowsToPdf } from "@/lib/export";

type Metrics = Awaited<ReturnType<typeof getDashboardMetrics>>;

const PRESETS: { label: string; days: number | null }[] = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "Todo", days: null },
];

export function ReportesClient({ initialMetrics }: { initialMetrics: Metrics }) {
  const currency = useStore((s) => s.currency);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [activePreset, setActivePreset] = useState(30);
  const [isPending, startTransition] = useTransition();

  function buildRange(days: number | null): ReportRange {
    if (days === null) return { from: "2000-01-01" };
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  function handlePreset(days: number | null) {
    setActivePreset(days ?? -1);
    startTransition(async () => {
      const data = await getDashboardMetrics(buildRange(days));
      setMetrics(data);
    });
  }

  async function handleExportExcel(kind: "ventas" | "caja" | "inventario") {
    try {
      const range = buildRange(activePreset === -1 ? null : activePreset);
      const rows =
        kind === "ventas"
          ? await getSalesReportRows(range)
          : kind === "caja"
          ? await getCashReportRows(range)
          : await getInventoryReportRows();
      exportRowsToExcel(rows, `reporte-${kind}`);
    } catch {
      toast.error("No se pudo generar el archivo Excel.");
    }
  }

  async function handleExportPdf(kind: "ventas" | "caja" | "inventario") {
    try {
      const range = buildRange(activePreset === -1 ? null : activePreset);
      const rows =
        kind === "ventas"
          ? await getSalesReportRows(range)
          : kind === "caja"
          ? await getCashReportRows(range)
          : await getInventoryReportRows();
      const titles = { ventas: "Reporte de Ventas", caja: "Reporte de Caja", inventario: "Reporte de Inventario" };
      exportRowsToPdf(titles[kind], rows, `reporte-${kind}`);
    } catch {
      toast.error("No se pudo generar el PDF.");
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-20">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => handlePreset(p.days)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
              (p.days ?? -1) === activePreset
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground"
            )}
          >
            {p.label}
          </button>
        ))}
        {isPending && <span className="text-xs text-muted-foreground">Actualizando...</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Utilidad bruta</p>
            <p className="text-lg font-bold">{formatCurrency(metrics.grossProfit, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Utilidad neta</p>
            <p className="text-lg font-bold">{formatCurrency(metrics.netProfit, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ticket promedio</p>
            <p className="text-lg font-bold">{formatCurrency(metrics.averageTicket, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Margen promedio</p>
            <p className="text-lg font-bold">{metrics.averageMarginPercent.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Top 5 productos más vendidos</p>
          </div>
          {metrics.topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas registradas en este período.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {metrics.topProducts.map((p, index) => (
                <div key={p.productId} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    {p.name}
                  </span>
                  <span className="font-medium">{formatCurrency(p.revenue, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">Exportar reportes</p>
        {(["ventas", "caja", "inventario"] as const).map((kind) => (
          <div key={kind} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <span className="text-sm font-medium capitalize">{kind}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleExportExcel(kind)}>
                <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleExportPdf(kind)}>
                <FileText className="mr-1 h-3.5 w-3.5" /> PDF
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
