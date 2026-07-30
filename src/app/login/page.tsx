"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { Handshake } from "lucide-react";
import { loginAction, type AuthState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/auth/SubmitButton";

export default function LoginPage() {
  const [state, formAction] = useFormState<AuthState, FormData>(loginAction, undefined);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Handshake className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">CUARENTA</h1>
        <p className="text-sm text-muted-foreground">Gestión de ventas y clientes para asesores comerciales</p>
      </div>

      <form action={formAction} className="w-full max-w-sm space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input id="email" name="email" type="email" placeholder="tu@correo.com" required autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" name="password" type="password" placeholder="••••••••" required />
        </div>

        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

        <SubmitButton label="Ingresar" pendingLabel="Ingresando..." />
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="font-medium text-primary">
          Regístrate
        </Link>
      </p>
    </div>
  );
}
