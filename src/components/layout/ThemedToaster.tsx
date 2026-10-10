"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/components/layout/ThemeProvider";

/** Los toasts tienen su propio tema; sin esto salen blancos sobre fondo oscuro. */
export function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster richColors position="top-center" theme={resolved} />;
}
