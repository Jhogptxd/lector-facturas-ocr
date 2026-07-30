import { listScans } from "@/lib/actions/documentos";
import { getVisionMode } from "@/lib/vision/extract";
import { DocumentScanClient } from "@/components/documentos/DocumentScanClient";

export default async function DocumentosPage() {
  const scans = await listScans();

  // Surfaced up front so a missing credential — or the fact that we're on canned
  // mock data — is visible before the user takes a photo, rather than only after
  // pressing "Procesar".
  return <DocumentScanClient scans={scans} visionMode={getVisionMode()} />;
}
