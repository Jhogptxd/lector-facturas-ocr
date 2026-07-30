import { listPayables } from "@/lib/actions/deudas";
import { listContacts } from "@/lib/actions/contactos";
import { getCurrentBusiness } from "@/lib/session";
import { generateDueDateReminders } from "@/lib/reminders";
import { serializeDebt } from "@/lib/debt-serialize";
import { PayablesClient } from "@/components/cuentas/PayablesClient";

export default async function CuentasPorPagarPage() {
  const business = await getCurrentBusiness();

  // Keep alerts current even if the background scheduler is not running.
  await generateDueDateReminders({ businessId: business.id });

  const [payables, suppliers] = await Promise.all([listPayables(), listContacts("SUPPLIER")]);

  return (
    <PayablesClient
      payables={payables.map(serializeDebt)}
      suppliers={suppliers.map((c) => ({ id: c.id, name: c.name }))}
      businessName={business.name}
      currency={business.currency}
    />
  );
}
