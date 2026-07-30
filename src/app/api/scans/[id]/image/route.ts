import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness, getCurrentUserId } from "@/lib/session";

const SCAN_DIR = path.join(process.cwd(), ".data", "scans");

/**
 * Serves an archived scan image. The files live outside `public/`, so this is
 * the only way to read them — and it checks both the session and that the scan
 * belongs to the caller's business before returning any bytes.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const business = await getCurrentBusiness();
  const scan = await prisma.documentScan.findFirst({
    where: { id: params.id, businessId: business.id },
    select: { imagePath: true, imageMediaType: true },
  });

  if (!scan?.imagePath) {
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
