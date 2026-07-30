"use client";

import { WifiOff, LogOut } from "lucide-react";
import { useStore } from "@/store/useStore";
import { logoutAction } from "@/lib/actions/auth";
import { NotificationBell } from "@/components/layout/NotificationBell";
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

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
      <div>
        <p className="text-sm font-semibold leading-tight">{businessName}</p>
        {!isOnline && (
          <p className="flex items-center gap-1 text-xs text-amber-600">
            <WifiOff className="h-3 w-3" /> Sin conexión{pendingCount > 0 ? ` · ${pendingCount} por sincronizar` : ""}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
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
