"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_AUTO_RETRIES = 3;
/** Espera creciente entre reintentos: da tiempo a que Neon despierte. */
const BACKOFF_MS = [2000, 4000, 8000];
/** Pasado este tiempo sin fallos, un error nuevo se trata como otro incidente. */
const INCIDENT_RESET_MS = 60_000;

// Estos contadores viven fuera del componente a propósito: `reset()` lo
// desmonta y lo vuelve a montar, así que con useState los intentos volverían a
// cero en cada fallo y el reintento automático quedaría en bucle infinito.
let attempts = 0;
let lastFailureAt = 0;

export function ReconnectScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    // Deja rastro en la consola del navegador: en producción el mensaje llega
    // saneado, pero el digest permite cruzarlo con los logs del servidor.
    console.error("[Caja] fallo al cargar:", error?.digest ?? error?.message ?? error);
  }, [error]);

  useEffect(() => {
    if (Date.now() - lastFailureAt > INCIDENT_RESET_MS) attempts = 0;
    lastFailureAt = Date.now();

    if (attempts >= MAX_AUTO_RETRIES) {
      setExhausted(true);
      return;
    }

    const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
    attempts += 1;

    setSecondsLeft(Math.ceil(delay / 1000));
    const tick = setInterval(
      () => setSecondsLeft((s) => (s !== null && s > 1 ? s - 1 : 0)),
      1000
    );
    const timer = setTimeout(reset, delay);

    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [reset]);

  function retryNow() {
    attempts = 0;
    setExhausted(false);
    reset();
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {exhausted ? (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <ServerCrash className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold">No pudimos conectar</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              El servidor no respondió tras varios intentos. Revisa tu conexión y vuelve a
              intentarlo.
            </p>
          </div>
          <Button onClick={retryNow} className="mt-1">
            <RefreshCw className="mr-2 h-4 w-4" /> Reintentar
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="space-y-1">
            <p className="text-base font-semibold">Conectando con el servidor, un momento...</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              El servidor estaba en reposo y está despertando. Esto solo pasa en la primera
              carga del día.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {secondsLeft && secondsLeft > 0
              ? `Reintentando en ${secondsLeft}s...`
              : "Reintentando..."}
          </p>
          <button
            type="button"
            onClick={retryNow}
            className="text-xs font-medium text-primary underline underline-offset-4"
          >
            Reintentar ahora
          </button>
        </>
      )}

      {error?.digest && (
        <p className="mt-2 text-[10px] text-muted-foreground/70">Ref: {error.digest}</p>
      )}
    </div>
  );
}
