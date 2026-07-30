"use server";

import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness, getCurrentUserId } from "@/lib/session";
import { resolveContactByName } from "@/lib/contacts";
import { buildDebtTimestamp } from "@/lib/datetime";
import { generateDueDateReminders } from "@/lib/reminders";
import {
  extractInvoiceFields,
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  ParsedInvoiceSchema,
  parseCoverage,
  type AcceptedImageType,
  type ParsedInvoice,
} from "@/lib/vision/extract";
import {
  ConfirmScanSchema,
  CreateQuickProductSchema,
  DOCUMENT_TYPE_LABEL,
  type ConfirmScanInput,
  type CreateQuickProductInput,
  type DocumentTypeValue,
} from "@/lib/vision/schema";

/** Scans live outside `public/` so images are only reachable through an authenticated route. */
const SCAN_DIR = path.join(process.cwd(), ".data", "scans");

const EXTENSION_BY_TYPE: Record<AcceptedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Removes an archived scan image once the draft is resolved, so confirmed and
 * discarded documents stop consuming disk.
 *
 * Never throws: by the time this runs the ledger write has committed, and an
 * orphaned file is a smaller problem than a failed confirmation. The path is
 * re-resolved and re-checked so a tampered row can't reach outside the folder.
 */
async function deleteScanImage(imagePath: string | null) {
  if (!imagePath) return;
  const resolved = path.resolve(SCAN_DIR, imagePath);
  if (path.dirname(resolved) !== path.resolve(SCAN_DIR)) return;
  try {
    await unlink(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[documentos] no se pudo borrar la imagen ${imagePath}`, error);
    }
  }
}

export type ScanCoverage = "high" | "medium" | "low";

export type ScanDraft = {
  id: string;
  docType: DocumentTypeValue;
  /** Straight from the OCR parser — the same shape `parseInvoiceText` returns. */
  parsed: ParsedInvoice;
  /** How much of the page the heuristics recovered, for the review warning. */
  coverage: ScanCoverage;
  /** Catalog links per line, aligned by index with `parsed.items`. */
  itemLinks: Array<{ productId: string | null; stockPreapplied: boolean }>;
  hasImage: boolean;
};

export type ExtractScanResult =
  | { ok: true; draft: ScanDraft }
  | { ok: false; message: string };

/**
 * Step 1 — OCR the photo and persist a DRAFT. Nothing touches the ledger yet;
 * the user reviews and corrects the draft before it becomes a transaction.
 */
export async function extractScan(formData: FormData): Promise<ExtractScanResult> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, message: "Sesión expirada. Vuelve a iniciar sesión." };

  const business = await getCurrentBusiness();

  const rawDocType = String(formData.get("docType") ?? "");
  if (rawDocType !== "SALE_NOTE" && rawDocType !== "SUPPLIER_INVOICE") {
    return { ok: false, message: "Selecciona el tipo de documento antes de procesar." };
  }
  const docType: DocumentTypeValue = rawDocType;

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Adjunta una foto del documento." };
  }
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as AcceptedImageType)) {
    return {
      ok: false,
      message: `Formato no soportado (${file.type || "desconocido"}). Usa JPG, PNG, WEBP o GIF.`,
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo es ${
        MAX_IMAGE_BYTES / 1024 / 1024
      } MB.`,
    };
  }

  const mediaType = file.type as AcceptedImageType;
  const bytes = Buffer.from(await file.arrayBuffer());

  const result = await extractInvoiceFields({ base64Image: bytes.toString("base64") });
  if (!result.ok) return { ok: false, message: result.message };

  const parsed = result.parsed;

  let imagePath: string | null = null;
  try {
    await mkdir(SCAN_DIR, { recursive: true });
    const filename = `${randomUUID()}.${EXTENSION_BY_TYPE[mediaType]}`;
    await writeFile(path.join(SCAN_DIR, filename), bytes);
    imagePath = filename;
  } catch (error) {
    // A failed archive copy must not throw away a successful read.
    console.error("[documentos] no se pudo guardar la imagen del escaneo", error);
  }

  const coverage = parseCoverage(parsed);

  const scan = await prisma.documentScan.create({
    data: {
      businessId: business.id,
      userId,
      docType,
      status: "DRAFT",
      imagePath,
      imageMediaType: imagePath ? mediaType : null,
      extractedJson: JSON.stringify(parsed),
      // OCR only identifies the issuer: raw text gives no reliable way to tell
      // the two parties apart, so the receiver stays empty for the user to fill.
      issuerName: parsed.razon_social_emisor,
      issuerTaxId: parsed.ruc_emisor,
      documentNumber: parsed.numero_comprobante,
      issueDate: parseIsoDate(parsed.fecha_emision),
      subtotal12: parsed.subtotal_12,
      subtotal0: parsed.subtotal_0,
      subtotal: sumSubtotals(parsed),
      taxAmount: parsed.iva,
      total: parsed.total,
      modelConfidence: coverage,
      items: {
        create: parsed.items.map((item, index) => ({
          position: index,
          description: item.descripcion,
          quantity: item.cantidad ?? 1,
          unitPrice: item.precio_unitario ?? 0,
          lineTotal: item.precio_total ?? 0,
        })),
      },
    },
    select: { id: true },
  });

  return {
    ok: true,
    draft: {
      id: scan.id,
      docType,
      parsed,
      coverage,
      itemLinks: parsed.items.map(() => ({ productId: null, stockPreapplied: false })),
      hasImage: imagePath !== null,
    },
  };
}

export type ConfirmScanResult =
  | { ok: true; transactionId: string; debtCreated: boolean; stockMoves: number }
  | { ok: false; message: string };

/**
 * Step 2 — the user validated the draft. Writes it into the canonical ledger:
 * a Transaction (INCOME for a sale note, EXPENSE for a supplier invoice), the
 * counterparty contact, a Debt when on credit, and stock movements for every
 * line linked to a catalog product.
 */
export async function confirmScan(input: ConfirmScanInput): Promise<ConfirmScanResult> {
  const parsedInput = ConfirmScanSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      message: parsedInput.error.issues[0]?.message ?? "Datos del borrador inválidos.",
    };
  }
  const data = parsedInput.data;

  const business = await getCurrentBusiness();

  const scan = await prisma.documentScan.findFirst({
    where: { id: data.scanId, businessId: business.id },
  });
  if (!scan) return { ok: false, message: "El escaneo no existe o pertenece a otro negocio." };
  if (scan.status === "CONFIRMED") {
    return { ok: false, message: "Este documento ya fue confirmado." };
  }

  const docType = scan.docType as DocumentTypeValue;
  const isPurchase = docType === "SUPPLIER_INVOICE";
  const contactType = isPurchase ? "SUPPLIER" : "CLIENT";
  const transactionType = isPurchase ? "EXPENSE" : "INCOME";

  // Any productId the client sent must belong to this business; otherwise one
  // tenant could move another tenant's stock.
  const linkedIds = Array.from(
    new Set(data.items.map((item) => item.productId).filter((id): id is string => id !== null))
  );
  const ownedProducts = linkedIds.length
    ? await prisma.product.findMany({
        where: { id: { in: linkedIds }, businessId: business.id },
        select: { id: true },
      })
    : [];
  if (ownedProducts.length !== linkedIds.length) {
    return { ok: false, message: "Uno de los productos vinculados no pertenece a este negocio." };
  }

  const activeRegister = await prisma.cashRegister.findFirst({
    where: { businessId: business.id, status: "OPEN" },
  });

  const createdAt = new Date();
  const stamp = buildDebtTimestamp(createdAt);
  const concept = `${DOCUMENT_TYPE_LABEL[docType]}${
    data.documentNumber ? ` ${data.documentNumber}` : ""
  } - ${data.counterpartyName.trim()}`;

  let debtCreated = false;
  let stockMoves = 0;

  const transactionId = await prisma.$transaction(async (tx) => {
    const contact = await resolveContactByName(business.id, data.counterpartyName, contactType, {
      taxId: data.counterpartyTaxId,
      client: tx,
    });

    const transaction = await tx.transaction.create({
      data: {
        businessId: business.id,
        cashRegisterId: activeRegister?.id ?? null,
        type: transactionType,
        amount: data.total,
        paymentMethod: data.paymentMethod,
        concept,
        contactId: contact.id,
        createdAt,
      },
      select: { id: true },
    });

    if (data.paymentMethod === "CREDIT") {
      await tx.debt.create({
        data: {
          businessId: business.id,
          contactId: contact.id,
          transactionId: transaction.id,
          totalAmount: data.total,
          remainingAmount: data.total,
          dueDate: parseIsoDate(data.dueDate),
          createdAt,
          createdDayName: stamp.dayName,
          createdDateLabel: stamp.dateLabel,
          createdTimeLabel: stamp.timeLabel,
        },
      });
      debtCreated = true;
    }

    // Replace the line detail with whatever the user approved.
    await tx.documentScanItem.deleteMany({ where: { scanId: scan.id } });

    await tx.documentScan.update({
      where: { id: scan.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: createdAt,
        transactionId: transaction.id,
        contactId: contact.id,
        documentNumber: data.documentNumber,
        issueDate: parseIsoDate(data.issueDate),
        subtotal12: data.subtotal12,
        subtotal0: data.subtotal0,
        subtotal:
          data.subtotal12 === null && data.subtotal0 === null
            ? null
            : (data.subtotal12 ?? 0) + (data.subtotal0 ?? 0),
        taxAmount: data.taxAmount,
        total: data.total,
        ...(isPurchase
          ? { issuerName: data.counterpartyName.trim(), issuerTaxId: data.counterpartyTaxId }
          : { receiverName: data.counterpartyName.trim(), receiverTaxId: data.counterpartyTaxId }),
        items: {
          create: data.items.map((item, index) => ({
            position: index,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            productId: item.productId,
            stockPreapplied: item.stockPreapplied,
          })),
        },
      },
    });

    // Only linked lines move inventory: a purchase adds units, a sale note
    // removes them. Lines whose product was created inline already carry these
    // units as their initial stock, so they are skipped.
    for (const item of data.items) {
      if (!item.productId || item.stockPreapplied || item.quantity === 0) continue;
      await tx.product.update({
        where: { id: item.productId },
        data: isPurchase
          ? { stock: { increment: item.quantity } }
          : { stock: { decrement: item.quantity } },
      });
      stockMoves += 1;
    }

    return transaction.id;
  });

  if (debtCreated) {
    await generateDueDateReminders({ businessId: business.id });
  }

  // The draft is resolved, so the photo has served its purpose. Done after the
  // commit because filesystem work cannot join the database transaction.
  await deleteScanImage(scan.imagePath);
  await prisma.documentScan.update({
    where: { id: scan.id },
    data: { imagePath: null, imageMediaType: null },
  });

  revalidatePath("/documentos");
  revalidatePath("/");
  revalidatePath("/cuentas-por-cobrar");
  revalidatePath("/cuentas-por-pagar");
  revalidatePath("/contactos");
  revalidatePath("/inventario");
  revalidatePath("/reportes");

  return { ok: true, transactionId, debtCreated, stockMoves };
}

/**
 * Throws away a pending draft: deletes the row (cascading its line items) and
 * unlinks the archived photo so no orphan files pile up.
 *
 * Only DRAFT rows are removable — a confirmed document stays as the audit trail
 * behind its transaction.
 */
export async function discardScan(scanId: string) {
  const business = await getCurrentBusiness();

  const scan = await prisma.documentScan.findFirst({
    where: { id: scanId, businessId: business.id, status: "DRAFT" },
    select: { id: true, imagePath: true },
  });
  if (!scan) return { ok: false as const, message: "El borrador no está disponible." };

  await prisma.documentScan.delete({ where: { id: scan.id } });
  await deleteScanImage(scan.imagePath);

  revalidatePath("/documentos");
  return { ok: true as const };
}

export type QuickProduct = {
  id: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  unit: string;
  minStockAlert: number;
  categoryId: string | null;
  barcode: string | null;
  sku: string | null;
};

export type CreateQuickProductResult =
  | { ok: true; product: QuickProduct }
  | { ok: false; message: string };

/**
 * Creates a catalog product on the fly from a scanned line.
 *
 * The product is saved with `stock` already applied, so the caller must mark that
 * line `stockPreapplied` — otherwise confirming the scan would add the same units
 * a second time.
 */
export async function createQuickProduct(
  data: CreateQuickProductInput
): Promise<CreateQuickProductResult> {
  const parsed = CreateQuickProductSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos del producto inválidos.",
    };
  }

  const business = await getCurrentBusiness();
  const name = parsed.data.name.trim();

  // Reuse an existing product rather than create a duplicate to merge by hand.
  const existing = await prisma.product.findFirst({
    where: { businessId: business.id, name },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      message: `Ya existe un producto llamado "${name}". Selecciónalo en la lista en lugar de crear uno nuevo.`,
    };
  }

  const product = await prisma.product.create({
    data: {
      businessId: business.id,
      name,
      cost: parsed.data.costPrice,
      price: parsed.data.salePrice,
      stock: parsed.data.stock,
    },
  });

  revalidatePath("/inventario");
  revalidatePath("/documentos");

  return {
    ok: true,
    product: {
      id: product.id,
      name: product.name,
      price: Number(product.price),
      cost: Number(product.cost),
      stock: Number(product.stock),
      unit: product.unit,
      minStockAlert: Number(product.minStockAlert),
      categoryId: product.categoryId,
      barcode: product.barcode,
      sku: product.sku,
    },
  };
}

/**
 * Persists a line's catalog link as soon as the user picks it.
 *
 * Not just convenience: a product created inline is saved with this line's
 * quantity already in stock, and only `stockPreapplied` stops the confirm step
 * adding those units again. If that flag lived purely in component state,
 * leaving the page and re-linking by hand would silently double-count.
 */
export async function setScanItemLink(params: {
  scanId: string;
  position: number;
  productId: string | null;
  stockPreapplied: boolean;
}) {
  const business = await getCurrentBusiness();

  const scan = await prisma.documentScan.findFirst({
    where: { id: params.scanId, businessId: business.id, status: "DRAFT" },
    select: { id: true },
  });
  if (!scan) return { ok: false as const, message: "El borrador no está disponible." };

  if (params.productId) {
    const owned = await prisma.product.findFirst({
      where: { id: params.productId, businessId: business.id },
      select: { id: true },
    });
    if (!owned) {
      return { ok: false as const, message: "Ese producto no pertenece a este negocio." };
    }
  }

  await prisma.documentScanItem.updateMany({
    where: { scanId: scan.id, position: params.position },
    data: { productId: params.productId, stockPreapplied: params.stockPreapplied },
  });

  return { ok: true as const };
}

/**
 * Reloads a pending draft so a review interrupted by a page change doesn't force
 * a second OCR call on the same photo.
 */
export async function getScanDraft(scanId: string): Promise<ScanDraft | null> {
  const business = await getCurrentBusiness();

  const scan = await prisma.documentScan.findFirst({
    where: { id: scanId, businessId: business.id, status: "DRAFT" },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!scan) return null;

  // The stored JSON is the parser's own output and round-trips exactly; the
  // column rebuild is a safety net for rows written by an earlier version.
  const parsed = safeParseInvoice(scan.extractedJson) ?? {
    ruc_emisor: scan.issuerTaxId,
    razon_social_emisor: scan.issuerName,
    numero_comprobante: scan.documentNumber,
    fecha_emision: scan.issueDate ? scan.issueDate.toISOString().slice(0, 10) : null,
    subtotal_12: scan.subtotal12 === null ? null : Number(scan.subtotal12),
    subtotal_0: scan.subtotal0 === null ? null : Number(scan.subtotal0),
    iva: scan.taxAmount === null ? null : Number(scan.taxAmount),
    total: scan.total === null ? null : Number(scan.total),
    items: scan.items.map((item) => ({
      descripcion: item.description,
      cantidad: Number(item.quantity),
      precio_unitario: Number(item.unitPrice),
      precio_total: Number(item.lineTotal),
    })),
  };

  return {
    id: scan.id,
    docType: scan.docType as DocumentTypeValue,
    parsed,
    coverage: (scan.modelConfidence as ScanCoverage) ?? parseCoverage(parsed),
    // Rows are ordered by `position`, which is how they were written, so they
    // line up with the parsed item order.
    itemLinks: parsed.items.map((_, index) => ({
      productId: scan.items[index]?.productId ?? null,
      stockPreapplied: scan.items[index]?.stockPreapplied ?? false,
    })),
    hasImage: scan.imagePath !== null,
  };
}

function safeParseInvoice(raw: string): ParsedInvoice | null {
  try {
    const result = ParsedInvoiceSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export type ScanListItem = {
  id: string;
  docType: DocumentTypeValue;
  status: string;
  counterpartyName: string | null;
  documentNumber: string | null;
  issueDate: string | null;
  total: number | null;
  coverage: string | null;
  createdAt: string;
  itemCount: number;
};

export async function listScans(): Promise<ScanListItem[]> {
  const business = await getCurrentBusiness();
  const scans = await prisma.documentScan.findMany({
    where: { businessId: business.id, status: { not: "DISCARDED" } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { items: true } } },
  });

  return scans.map((scan) => ({
    id: scan.id,
    docType: scan.docType as DocumentTypeValue,
    status: scan.status,
    counterpartyName:
      scan.docType === "SUPPLIER_INVOICE" ? scan.issuerName : scan.receiverName,
    documentNumber: scan.documentNumber,
    issueDate: scan.issueDate ? scan.issueDate.toISOString() : null,
    total: scan.total === null ? null : Number(scan.total),
    coverage: scan.modelConfidence,
    createdAt: scan.createdAt.toISOString(),
    itemCount: scan._count.items,
  }));
}

function sumSubtotals(parsed: ParsedInvoice): number | null {
  if (parsed.subtotal_12 === null && parsed.subtotal_0 === null) return null;
  return (parsed.subtotal_12 ?? 0) + (parsed.subtotal_0 ?? 0);
}

/** `YYYY-MM-DD` (or any Date-parseable string) → Date, tolerating unreadable input. */
function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
