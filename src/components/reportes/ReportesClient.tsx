"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { BarChart3, FileSpreadsheet, FileText, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/useStore";
import { formatCurrency, cn } from "@/lib/utils";
import {
  getDashboardMetrics,
  getSalesReportRows,
  getExpenseReportRows,
  getDebtsReportRows,
  getInventoryReportRows,
  type ReportRange,
} from "@/lib/actions/reportes";
import { exportRowsToExcel, exportRowsToPdf, exportFinancialExcel, exportFinancialPdf } from "@/lib/export";
import { formatDate } from "@/lib/datetime";

/**
 * The charting library is ~90 kB of the bundle — more than the rest of this
 * page put together. Loading it on demand keeps the KPI cards, which are what
 * the user came for, painting immediately on a phone.
 */
const ChartFallback = () => <div className="h-[210px] animate-pulse rounded-lg bg-muted/50" />;

const IncomeExpenseChart = dynamic(
  () => import("@/components/reportes/IncomeExpenseChart").then((m) => m.IncomeExpenseChart),
  { ssr: false, loading: ChartFallback }
);

const TopProductsChart = dynamic(
  () => import("@/components/reportes/TopProductsChart").then((m) => m.TopProductsChart),
  { ssr: false, loading: ChartFallback }
);

type Metrics = Awaited<ReturnType<typeof getDashboardMetrics>>;

const PRESETS: { label: string; days: number | null }[] = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "Todo", days: null },
];

export function ReportesClient({
  initialMetrics,
  businessName,
}: {
  initialMetrics: Metrics;
  businessName: string;
}) {
  const currency = useStore((s) => s.currency);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [activePreset, setActivePreset] = useState(30);
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);

  function buildRange(days: number | null): ReportRange {
    if (days === null) return { from: "2000-01-01" };
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  function buildRangeLabel(days: number | null) {
    if (days === null) return "Todo el historial";
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => formatDate(d, { day: "2-digit", month: "2-digit", year: "numeric" });
    return `${fmt(from)} - ${fmt(to)}`;
  }

  function handlePreset(days: number | null) {
    setActivePreset(days ?? -1);
    startTransition(async () => {
      const data = await getDashboardMetrics(buildRange(days));
      setMetrics(data);
    });
  }

  async function handleExportFinancial(format: "excel" | "pdf") {
    setIsExporting(true);
    try {
      const days = activePreset === -1 ? null : activePreset;
      const range = buildRange(days);
      const [ventas, gastos, deudas] = await Promise.all([
        getSalesReportRows(range),
        getExpenseReportRows(range),
        getDebtsReportRows(range),
      ]);

      const totalVentas = ventas.reduce((sum, r) => sum + r.Monto, 0);
      const totalGastos = gastos.reduce((sum, r) => sum + r.Monto, 0);
      const totalPorCobrar = deudas
        .filter((r) => r.Tipo === "Por cobrar")
        .reduce((sum, r) => sum + r["Saldo pendiente"], 0);
      const totalPorPagar = deudas
        .filter((r) => r.Tipo === "Por pagar")
        .reduce((sum, r) => sum + r["Saldo pendiente"], 0);

      const summary = [
        { label: "Total ventas", value: formatCurrency(totalVentas, currency) },
        { label: "Total gastos", value: formatCurrency(totalGastos, currency) },
        { label: "Utilidad neta", value: formatCurrency(totalVentas - totalGastos, currency) },
        { label: "Por cobrar pendiente", value: formatCurrency(totalPorCobrar, currency) },
        { label: "Por pagar pendiente", value: formatCurrency(totalPorPagar, currency) },
      ];

      const sections = [
        { title: "Ventas", rows: ventas },
        { title: "Gastos", rows: gastos },
        { title: "Deudas", rows: deudas },
      ];

      if (format === "excel") {
        exportFinancialExcel(sections, "reporte-financiero");
      } else {
        exportFinancialPdf({
          businessName,
          rangeLabel: buildRangeLabel(days),
          summary,
          sections,
          filename: "reporte-financiero",
        });
      }
    } catch {
      toast.error(`No se pudo generar el ${format === "excel" ? "Excel" : "PDF"}.`);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportInventoryExcel() {
    try {
      const rows = await getInventoryReportRows();
      exportRowsToExcel(rows, "reporte-inventario");
    } catch {
      toast.error("No se pudo generar el archivo Excel.");
    }
  }

  async function handleExportInventoryPdf() {
    try {
      const rows = await getInventoryReportRows();
      exportRowsToPdf("Reporte de Inventario", rows, "reporte-inventario");
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

      {/* Everything below reads from the same slice, so it dims as one block
          while the new one loads — no skeleton flash, no layout jump. */}
      <div
        className={cn(
          "flex flex-col gap-4 transition-opacity duration-200",
          isPending && "opacity-60"
        )}
      >
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
            <div className="mb-1 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Ventas vs. gastos</p>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Ingresos {formatCurrency(metrics.totalIncome, currency)} · Gastos{" "}
              {formatCurrency(metrics.totalExpense, currency)}
            </p>
            <IncomeExpenseChart
              series={metrics.series}
              granularity={metrics.granularity}
              currency={currency}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Top 5 productos más vendidos</p>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Participación sobre las ventas de productos del período.
            </p>
            <TopProductsChart
              topProducts={metrics.topProducts}
              otherRevenue={metrics.otherRevenue}
              otherCount={metrics.otherCount}
              productRevenue={metrics.productRevenue}
              currency={currency}
            />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">Exportar reportes</p>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Reporte financiero</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Ventas, gastos y deudas del período seleccionado ({buildRangeLabel(activePreset === -1 ? null : activePreset)})
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="outline"
              disabled={isExporting}
              onClick={() => handleExportFinancial("excel")}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              disabled={isExporting}
              onClick={() => handleExportFinancial("pdf")}
            >
              <FileText className="mr-1.5 h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
          <span className="text-sm font-medium">Inventario</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleExportInventoryExcel}>
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportInventoryPdf}>
              <FileText className="mr-1 h-3.5 w-3.5" /> PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
