import { getDashboardMetrics } from "@/lib/actions/reportes";
import { ReportesClient } from "@/components/reportes/ReportesClient";

export default async function ReportesPage() {
  const metrics = await getDashboardMetrics();

  return <ReportesClient initialMetrics={metrics} />;
}
