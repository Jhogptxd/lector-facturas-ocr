import { notFound } from "next/navigation";
import { getContact } from "@/lib/actions/contactos";
import { getCurrentBusiness } from "@/lib/session";
import { ContactDetailClient } from "@/components/contactos/ContactDetailClient";

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  const [contact, business] = await Promise.all([getContact(params.id), getCurrentBusiness()]);

  if (!contact) notFound();

  return (
    <ContactDetailClient
      contact={{
        id: contact.id,
        name: contact.name,
        ruc: contact.ruc,
        address: contact.address,
        phone: contact.phone,
        email: contact.email,
        type: contact.type,
      }}
      businessName={business.name}
      currency={business.currency}
      transactions={contact.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        paymentMethod: t.paymentMethod,
        concept: t.concept,
        createdAt: t.createdAt.toISOString(),
      }))}
      debts={contact.debts.map((d) => ({
        id: d.id,
        totalAmount: Number(d.totalAmount),
        remainingAmount: Number(d.remainingAmount),
        status: d.status,
        dueDate: d.dueDate ? d.dueDate.toISOString() : null,
        createdAt: d.createdAt.toISOString(),
        payments: d.payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          paymentMethod: p.paymentMethod,
          createdAt: p.createdAt.toISOString(),
        })),
      }))}
    />
  );
}
