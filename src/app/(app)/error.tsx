"use client";

import { ReconnectScreen } from "@/components/layout/ReconnectScreen";

/** Captura fallos de las páginas dentro de (app): Caja, Inventario, Cuentas... */
export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ReconnectScreen error={error} reset={reset} />;
}
