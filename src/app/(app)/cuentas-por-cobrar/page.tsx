import { listReceivables } from "@/lib/actions/deudas";
import { listContacts } from "@/lib/actions/contactos";
import { getCurrentBusiness } from "@/lib/session";
import { generateDueDateReminders } from "@/lib/reminders";
import { serializeDebt } from "@/lib/debt-serialize";
import { ReceivablesClient } from "@/components/cuentas/ReceivablesClient";

export default async function CuentasPorCobrarPage() {
  const business = await getCurrentBusiness();

  // Keep alerts current even if the background scheduler is not running.
  await generateDueDateReminders({ businessId: business.id });

  const [receivables, clients] = await Promise.all([listReceivables(), listContacts("CLIENT")]);

  return (
    <ReceivablesClient
      receivables={receivables.map(serializeDebt)}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      businessName={business.name}
      currency={business.currency}
    />
  );
}
