import type { ContactType, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Resolves a free-typed counterparty name to a contact, reusing an existing one
 * when the name matches ignoring case and surrounding whitespace, so repeated
 * entries of the same supplier or client don't litter the directory.
 *
 * Matching is done in JS rather than with a `mode: "insensitive"` filter because
 * SQLite does not support that Prisma option; contact lists are small enough
 * that fetching them is cheap, and this stays portable to PostgreSQL.
 */
export async function resolveContactByName(
  businessId: string,
  rawName: string,
  type: ContactType,
  options: { taxId?: string | null; client?: PrismaLike } = {}
): Promise<{ id: string; name: string }> {
  const db = options.client ?? prisma;
  const name = rawName.trim();
  if (!name) {
    throw new Error("El nombre del contacto no puede estar vacío.");
  }

  const existing = await db.contact.findMany({
    where: { businessId, type },
    select: { id: true, name: true, ruc: true },
  });

  const normalized = name.toLowerCase();
  const match = existing.find((c) => c.name.trim().toLowerCase() === normalized);

  if (match) {
    // Backfill a tax id we now know but didn't have before; never overwrite one.
    if (options.taxId?.trim() && !match.ruc) {
      await db.contact.update({
        where: { id: match.id },
        data: { ruc: options.taxId.trim() },
      });
    }
    return { id: match.id, name: match.name };
  }

  // Phone is required on Contact but unknown from a scanned document or a typed
  // supplier name; it can be completed later from the Contactos screen.
  return db.contact.create({
    data: {
      businessId,
      name,
      phone: "",
      ruc: options.taxId?.trim() || null,
      type,
    },
    select: { id: true, name: true },
  });
}
