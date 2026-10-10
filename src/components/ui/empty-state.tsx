import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pantalla vacía con icono, título y salida.
 *
 * Una lista vacía con una sola línea de texto deja al usuario sin saber si algo
 * falló, si filtró de más o si todavía no ha registrado nada. Esto separa los
 * tres casos y, cuando tiene sentido, ofrece la acción que sigue.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center",
        className
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="text-balance text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
