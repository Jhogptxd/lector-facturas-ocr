"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Package, HandCoins, Users, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Caja", icon: Wallet },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/deudas", label: "Fiados", icon: HandCoins },
  { href: "/contactos", label: "Contactos", icon: Users },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur safe-bottom">
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "fill-primary/15")} strokeWidth={active ? 2.5 : 2} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
