"use client";

import { useEffect } from "react";
import { useStore } from "@/store/useStore";

export function OnlineSyncProvider() {
  const setOnline = useStore((s) => s.setOnline);
  const flushPendingSales = useStore((s) => s.flushPendingSales);

  useEffect(() => {
    setOnline(navigator.onLine);

    function handleOnline() {
      setOnline(true);
      void flushPendingSales();
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (navigator.onLine) {
      void flushPendingSales();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setOnline, flushPendingSales]);

  return null;
}
