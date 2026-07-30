import { listContacts } from "@/lib/actions/contactos";
import { ContactosClient } from "@/components/contactos/ContactosClient";

export default async function ContactosPage() {
  const contacts = await listContacts();

  return (
    <ContactosClient
      contacts={contacts.map((c) => ({
        id: c.id,
        name: c.name,
        ruc: c.ruc,
        address: c.address,
        phone: c.phone,
        type: c.type,
        pendingDebts: c.debts.reduce((sum, d) => sum + Number(d.remainingAmount), 0),
        transactionCount: c._count.transactions,
      }))}
    />
  );
}
