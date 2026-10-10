import { Skeleton } from "@/components/ui/skeleton";

/** Copia la silueta de Reportes: filtros, cuatro indicadores y dos gráficos. */
export default function ReportesLoading() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-20" role="status" aria-label="Cargando reportes">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-24" />
          </div>
        ))}
      </div>

      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="mt-1 h-3 w-48" />
          <Skeleton className="mt-4 h-[190px] w-full rounded-lg" />
        </div>
      ))}
      <span className="sr-only">Cargando reportes...</span>
    </div>
  );
}
