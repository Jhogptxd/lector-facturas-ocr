/**
 * Vibración corta de confirmación.
 *
 * `navigator.vibrate` no existe en iOS ni en escritorio, y en Android el
 * navegador la ignora si la pestaña no está visible o si el usuario no ha
 * interactuado todavía — por eso va envuelta y nunca lanza. Es un extra: la
 * interfaz no debe depender de que funcione.
 */
export function tapFeedback(pattern: number | number[] = 8) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate(pattern);
  } catch {
    // Da igual: es decorativo.
  }
}
