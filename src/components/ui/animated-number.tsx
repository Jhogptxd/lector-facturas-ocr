"use client";

import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/utils";

const DURATION_MS = 550;

/** Arranque suave y frenada al final: se lee mejor que una interpolación lineal. */
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Lleva un número desde su valor anterior hasta el nuevo.
 *
 * El primer render no se anima: al abrir la app el saldo debe estar ahí, no
 * contando desde cero. Lo que sí se anima es cada cambio posterior — registras
 * una venta y el saldo sube a la vista, que es la señal de que entró.
 */
function useCountUp(target: number) {
  const [display, setDisplay] = useState(target);
  const previous = useRef(target);
  const frame = useRef<number>();

  useEffect(() => {
    if (previous.current === target) return;

    if (prefersReducedMotion()) {
      previous.current = target;
      setDisplay(target);
      return;
    }

    const from = previous.current;
    const start = performance.now();
    previous.current = target;

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      setDisplay(from + (target - from) * easeOutCubic(progress));
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target]);

  return display;
}

/** Importe que se anima al cambiar. `tabular-nums` evita el baile de dígitos. */
export function AnimatedCurrency({
  value,
  currency,
  className,
}: {
  value: number;
  currency: string;
  className?: string;
}) {
  const display = useCountUp(value);
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatCurrency(Math.round(display), currency)}
    </span>
  );
}
