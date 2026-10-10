"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/datetime";
import {
  markAllNotificationsRead,
  syncAndListNotifications,
  type NotificationItem,
} from "@/lib/actions/notificaciones";

export function NotificationBell({ initialNotifications }: { initialNotifications: NotificationItem[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  useEffect(() => {
    setNotifications(initialNotifications);
  }, [initialNotifications]);

  // Close when clicking outside the panel.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;

    try {
      const fresh = await syncAndListNotifications();
      setNotifications(fresh);
      if (fresh.some((n) => !n.readAt)) {
        await markAllNotificationsRead();
        setNotifications(fresh.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      }
    } catch {
      // Offline or transient failure: keep showing what we already have.
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : "Notificaciones"}
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          <div className="border-b border-border px-3 py-2">
            <p className="text-sm font-semibold">Recordatorios</p>
          </div>

          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No tienes recordatorios pendientes.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "border-b border-border px-3 py-2.5 last:border-b-0",
                    !n.readAt && "bg-accent/40"
                  )}
                >
                  <p className="text-xs leading-relaxed">{n.message}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {formatDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
