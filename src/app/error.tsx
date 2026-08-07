"use client";

import { ReconnectScreen } from "@/components/layout/ReconnectScreen";

/**
 * Frontera de un nivel por encima de (app). Es la que atrapa los fallos del
 * propio `(app)/layout.tsx` —que consulta productos, contactos y
 * notificaciones—, porque un error.tsx nunca captura errores de su own layout.
 */
export default function RootSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ReconnectScreen error={error} reset={reset} />;
}
