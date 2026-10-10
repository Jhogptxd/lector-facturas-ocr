/**
 * Tema de la app: claro, oscuro o el del sistema.
 *
 * El proyecto ya tenía todos los tokens `.dark` escritos en `globals.css`
 * (incluida la paleta de gráficos validada contra la superficie oscura), pero
 * nada aplicaba nunca esa clase: el modo oscuro era código muerto. Esto es lo
 * que lo enciende.
 */

export const THEME_STORAGE_KEY = "cuarenta-theme";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** El tema que efectivamente se pinta, una vez resuelto `system`. */
export type ResolvedTheme = "light" | "dark";

/** Color de la barra del navegador por tema, para que el notch no desentone. */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#0f7a3d",
  dark: "#14241e",
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}
