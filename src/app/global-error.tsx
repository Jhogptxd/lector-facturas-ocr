"use client";

import { ReconnectScreen } from "@/components/layout/ReconnectScreen";
import "./globals.css";

/**
 * Última red de seguridad: se activa si falla el layout raíz, que reemplaza por
 * completo. Por eso debe renderizar sus propios <html> y <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="antialiased">
        <ReconnectScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
