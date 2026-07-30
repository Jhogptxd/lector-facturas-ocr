"use server";

import { revalidatePath } from "next/cache";
import type { ContactType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";

export type ContactInput = {
  name: string;
  ruc?: string | null;
  address?: string | null;
  phone: string;
  email?: string | null;
  type: ContactType;
};

export async function listContacts(type?: ContactType, search?: string) {
  const business = await getCurrentBusiness();
  const where: Prisma.ContactWhereInput = { businessId: business.id };
  if (type) where.type = type;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { ruc: { contains: search } },
      { phone: { contains: search } },
    ];
  }

  return prisma.contact.findMany({
    where,
    include: {
      debts: { where: { status: { not: "PAID" } } },
      _count: { select: { transactions: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getContact(id: string) {
  const business = await getCurrentBusiness();
  return prisma.contact.findFirst({
    where: { id, businessId: business.id },
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
        include: { saleItems: { include: { product: true } } },
      },
      debts: { include: { payments: true } },
    },
  });
}

export async function createContact(input: ContactInput) {
  const business = await getCurrentBusiness();
  const contact = await prisma.contact.create({ data: { ...input, businessId: business.id } });
  revalidatePath("/contactos");
  revalidatePath("/cuentas-por-cobrar");
  revalidatePath("/cuentas-por-pagar");
  return contact;
}

export async function updateContact(id: string, input: Partial<ContactInput>) {
  const business = await getCurrentBusiness();
  const contact = await prisma.contact.update({ where: { id, businessId: business.id }, data: input });
  revalidatePath("/contactos");
  return contact;
}

export async function deleteContact(id: string) {
  const business = await getCurrentBusiness();
  await prisma.contact.delete({ where: { id, businessId: business.id } });
  revalidatePath("/contactos");
}

export type ImportedContactInput = {
  name: string;
  phone: string;
  address?: string | null;
  ruc?: string | null;
  email?: string | null;
};

export async function bulkImportContacts(contacts: ImportedContactInput[], type: ContactType = "CLIENT") {
  const business = await getCurrentBusiness();

  const validContacts = contacts.filter((c) => c.name?.trim() && c.phone?.trim());
  if (validContacts.length === 0) {
    return { created: 0 };
  }

  const result = await prisma.contact.createMany({
    data: validContacts.map((c) => ({
      businessId: business.id,
      name: c.name.trim(),
      phone: c.phone.trim(),
      address: c.address?.trim() || null,
      ruc: c.ruc?.trim() || null,
      email: c.email?.trim() || null,
      type,
    })),
  });

  revalidatePath("/contactos");
  return { created: result.count };
}
