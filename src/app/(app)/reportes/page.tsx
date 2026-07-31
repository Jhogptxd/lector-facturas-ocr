import { getDashboardMetrics } from "@/lib/actions/reportes";
import { getCurrentBusiness } from "@/lib/session";
import { ReportesClient } from "@/components/reportes/ReportesClient";

export default async function ReportesPage() {
  const [metrics, business] = await Promise.all([getDashboardMetrics(), getCurrentBusiness()]);

  return <ReportesClient initialMetrics={metrics} businessName={business.name} />;
}
