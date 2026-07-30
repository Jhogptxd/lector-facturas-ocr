"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Wallet, Package, HandCoins, Users, BarChart3, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const NAV_ITEMS = [
  { href: "/", label: "Caja", icon: Wallet },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/contactos", label: "Contactos", icon: Users },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
];

const DEUDAS_ROUTES = ["/cuentas-por-cobrar", "/cuentas-por-pagar"];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const deudasActive = DEUDAS_ROUTES.some((href) => pathname.startsWith(href));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur safe-bottom">
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {NAV_ITEMS.slice(0, 2).map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium outline-none transition-colors",
              deudasActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <HandCoins className={cn("h-5 w-5", deudasActive && "fill-primary/15")} strokeWidth={deudasActive ? 2.5 : 2} />
            Deudas
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center">
            <DropdownMenuItem onSelect={() => router.push("/cuentas-por-cobrar")}>
              <ArrowDownCircle className="h-4 w-4 text-success" />
              Por cobrar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/cuentas-por-pagar")}>
              <ArrowUpCircle className="h-4 w-4 text-destructive" />
              Por pagar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {NAV_ITEMS.slice(2).map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  pathname,
}: {
  href: string;
  label: string;
  icon: typeof Wallet;
  pathname: string;
}) {
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      <Icon className={cn("h-5 w-5", active && "fill-primary/15")} strokeWidth={active ? 2.5 : 2} />
      {label}
    </Link>
  );
}
