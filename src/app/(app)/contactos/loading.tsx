import { Skeleton, SkeletonList } from "@/components/ui/skeleton";

export default function ContactosLoading() {
  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-20" role="status" aria-label="Cargando contactos">
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <SkeletonList rows={7} />
      <span className="sr-only">Cargando contactos...</span>
    </div>
  );
}
