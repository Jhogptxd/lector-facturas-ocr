import { listScans } from "@/lib/actions/documentos";
import { getVisionMode } from "@/lib/vision/extract";
import { DocumentScanClient } from "@/components/documentos/DocumentScanClient";

/**
 * Las Server Actions heredan el límite de esta página, y leer una factura no es
 * rápido: medido contra la API real, una lectura tarda entre 20 y 30 segundos,
 * y más si hay que reintentar por saturación. Con el límite por defecto de
 * Vercel (10 s) el proceso se corta siempre y el dueño ve un error que no tiene
 * nada que ver con su foto.
 *
 * En el plan Hobby Vercel recorta esto a 60 s; en Pro respeta los 300.
 */
export const maxDuration = 300;

export default async function DocumentosPage() {
  const scans = await listScans();

  // Surfaced up front so a missing credential — or the fact that we're on canned
  // mock data — is visible before the user takes a photo, rather than only after
  // pressing "Procesar".
  return <DocumentScanClient scans={scans} visionMode={getVisionMode()} />;
}
