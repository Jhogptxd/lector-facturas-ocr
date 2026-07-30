"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { Handshake } from "lucide-react";
import { registerAction, type AuthState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/auth/SubmitButton";

export default function RegisterPage() {
  const [state, formAction] = useFormState<AuthState, FormData>(registerAction, undefined);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-10">
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Handshake className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">Crea tu cuenta en CUARENTA</h1>
        <p className="text-sm text-muted-foreground">Empieza a gestionar tus ventas y clientes hoy</p>
      </div>

      <form action={formAction} className="w-full max-w-sm space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Tu nombre</Label>
          <Input id="name" name="name" placeholder="Juan Pérez" required autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="businessName">Nombre del negocio</Label>
          <Input id="businessName" name="businessName" placeholder="Tienda Don Juan" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input id="email" name="email" type="email" placeholder="tu@correo.com" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Teléfono (opcional)</Label>
          <Input id="phone" name="phone" type="tel" placeholder="300 000 0000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" name="password" type="password" placeholder="Mínimo 6 caracteres" required />
        </div>

        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

        <SubmitButton label="Crear cuenta" pendingLabel="Creando cuenta..." />
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-primary">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
