import { Loader2 } from "lucide-react";

/**
 * Se muestra mientras el servidor arma la página. En un arranque en frío de la
 * base esto es lo que ve el cliente en vez de una pestaña congelada.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Cargando...</p>
    </div>
  );
}
