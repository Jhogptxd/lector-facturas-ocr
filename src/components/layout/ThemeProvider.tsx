"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  THEME_COLOR,
  THEME_STORAGE_KEY,
  isThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  /** Lo que el usuario eligió, que puede ser "system". */
  preference: ThemePreference;
  /** Lo que se está pintando ahora mismo. */
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
}

function applyToDocument(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
  // Sin esto los controles nativos (scrollbars, date pickers, autofill) se
  // quedan en claro sobre fondo oscuro.
  root.style.colorScheme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[resolved]);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Arranca en "system" para que el render del servidor y el primer render del
  // cliente coincidan; `ThemeScript` ya dejó el DOM con el tema correcto, y el
  // efecto de abajo sincroniza el estado sin repintar nada.
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setPreferenceState(readStoredPreference());
    setSystemDark(systemPrefersDark());

    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolved: ResolvedTheme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    applyToDocument(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Modo privado: el tema vale para esta sesión y no se recuerda. No es
      // motivo para romper el cambio de tema.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return context;
}
