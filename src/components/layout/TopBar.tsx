"use client";

import { useEffect, useState } from "react";
import { WifiOff, LogOut } from "lucide-react";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/lib/actions/auth";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import type { NotificationItem } from "@/lib/actions/notificaciones";

export function TopBar({
  businessName,
  notifications,
}: {
  businessName: string;
  notifications: NotificationItem[];
}) {
  const isOnline = useStore((s) => s.isOnline);
  const pendingCount = useStore((s) => s.pendingSales.length);
  const scrolled = useScrolled();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur transition-shadow duration-200",
        // Sin esto la barra y el contenido se mezclan al desplazar; la sombra
        // aparece solo cuando hay algo arriba, como en las apps nativas.
        scrolled ? "border-border shadow-sm" : "border-transparent"
      )}
    >
      <div>
        <p className="text-sm font-semibold leading-tight">{businessName}</p>
        {!isOnline && (
          <p className="flex items-center gap-1 text-xs text-amber-600">
            <WifiOff className="h-3 w-3" /> Sin conexión{pendingCount > 0 ? ` · ${pendingCount} por sincronizar` : ""}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <NotificationBell initialNotifications={notifications} />
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </form>
      </div>
    </header>
  );
}

/**
 * Verdadero cuando el contenido está desplazado.
 *
 * El que hace scroll es el `<main>`, no la ventana, y los eventos `scroll` de
 * un elemento no burbujean — por eso el listener va en fase de captura sobre el
 * documento, que sí los ve, sin tener que acoplar este componente al layout.
 */
function useScrolled(threshold = 4) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = (event: Event) => {
      const target = event.target;
      const top =
        target instanceof HTMLElement ? target.scrollTop : window.scrollY;
      setScrolled(top > threshold);
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [threshold]);

  return scrolled;
}
