import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "cuarenta_session";

export async function createSession(userId: string) {
  cookies().set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  cookies().delete(SESSION_COOKIE);
}

export async function getCurrentUserId(): Promise<string | null> {
  return cookies().get(SESSION_COOKIE)?.value ?? null;
}

export async function getCurrentUser() {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function getCurrentBusiness() {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("No autenticado");

  const business = await prisma.business.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (business) return business;

  // Una cookie puede sobrevivir al usuario que la emitió (por ejemplo si se
  // repuebla la base). Crear el negocio a ciegas en ese caso viola la clave
  // foránea y tumba la página con una excepción de servidor, así que se
  // comprueba primero y se trata como sesión inválida.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new Error("Sesión inválida");

  return prisma.business.create({ data: { name: "Mi Negocio", userId } });
}
