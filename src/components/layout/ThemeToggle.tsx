"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/layout/ThemeProvider";
import { tapFeedback } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Automático", icon: Monitor },
];

export function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Cambiar tema"
        className="rounded-lg p-2 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
      >
        {/* Muestra el tema que se está viendo, no la preferencia: con
            "Automático" lo útil es saber si ahora es claro u oscuro. */}
        {resolved === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = preference === option.value;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => {
                tapFeedback();
                setPreference(option.value);
              }}
              className={cn(active && "bg-accent text-accent-foreground")}
            >
              <Icon className="h-4 w-4" />
              {option.label}
              {active && <span className="ml-auto text-xs text-primary">●</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
