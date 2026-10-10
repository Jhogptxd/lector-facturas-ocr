import { Skeleton, SkeletonList } from "@/components/ui/skeleton";

/**
 * Se muestra mientras el servidor arma la página. En un arranque en frío de la
 * base esto es lo que ve el cliente en vez de una pestaña congelada.
 *
 * Es un esqueleto y no un spinner a propósito: mantiene la silueta de la
 * pantalla, así que al llegar los datos nada se mueve de sitio.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-4" role="status" aria-label="Cargando">
      <Skeleton className="h-11 w-40" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <SkeletonList rows={4} />
      <span className="sr-only">Cargando...</span>
    </div>
  );
}
