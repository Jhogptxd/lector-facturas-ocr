import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness, getCurrentUserId } from "@/lib/session";

/** Solo para escaneos anteriores al data URI; ver `receiptDataUrl` en el schema. */
const SCAN_DIR = path.join(process.cwd(), ".data", "scans");

/** `data:image/jpeg;base64,<...>` — el formato exacto que escribe `extractScan`. */
const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i;

/**
 * Serves an archived scan image. It never comes back inline with the page: the
 * Base64 backup weighs ~200 KB, so it travels through this route —which checks
 * both the session and that the scan belongs to the caller's business— and the
 * browser gets to cache it.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const business = await getCurrentBusiness();
  const scan = await prisma.documentScan.findFirst({
    where: { id: params.id, businessId: business.id },
    select: { receiptDataUrl: true, imagePath: true, imageMediaType: true },
  });

  if (!scan) {
    return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
  }

  if (scan.receiptDataUrl) {
    const match = DATA_URL.exec(scan.receiptDataUrl);
    if (match) {
      return new NextResponse(new Uint8Array(Buffer.from(match[2], "base64")), {
        headers: {
          "Content-Type": match[1],
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
    console.error(`[scans] data URI ilegible en el escaneo ${params.id}`);
  }

  // Escaneos antiguos: la copia quedó en disco y la fila solo guarda su nombre.
  if (!scan.imagePath) {
    return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
  }

  // The stored value is a generated UUID filename, but resolve and re-check the
  // path anyway so a tampered row can never read outside the scan directory.
  const resolved = path.resolve(SCAN_DIR, scan.imagePath);
  if (path.dirname(resolved) !== path.resolve(SCAN_DIR)) {
    return NextResponse.json({ error: "Ruta inválida" }, { status: 400 });
  }

  try {
    const bytes = await readFile(resolved);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": scan.imageMediaType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Imagen no disponible" }, { status: 404 });
  }
}
