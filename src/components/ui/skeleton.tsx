import { cn } from "@/lib/utils";

/**
 * Bloque gris que ocupa el sitio del contenido que falta.
 *
 * Preferido sobre un spinner centrado porque conserva la forma de la pantalla:
 * no hay salto de layout cuando llegan los datos, y la espera se percibe más
 * corta. El `animate-pulse` lo neutraliza la regla de `prefers-reduced-motion`.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

/** Varias líneas de texto simuladas; la última sale más corta, como un párrafo real. */
export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3", index === lines - 1 ? "w-1/2" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Fila de lista: icono o avatar a la izquierda, texto al centro, importe a la derecha. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-4 w-16 shrink-0" />
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  );
}
