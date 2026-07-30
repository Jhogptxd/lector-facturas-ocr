"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { createContact, updateContact, deleteContact } from "@/lib/actions/contactos";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export type ContactRecord = {
  id: string;
  name: string;
  ruc: string | null;
  address: string | null;
  phone: string;
  email: string | null;
  type: string;
};

export function ContactFormDialog({
  mode,
  contact,
  open,
  onOpenChange,
  onSuccess,
  defaultType,
}: {
  mode: "create" | "edit";
  contact?: ContactRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  defaultType?: "CLIENT" | "SUPPLIER";
}) {
  const [name, setName] = useState("");
  const [ruc, setRuc] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<"CLIENT" | "SUPPLIER">("CLIENT");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && mode === "edit" && contact) {
      setName(contact.name);
      setRuc(contact.ruc ?? "");
      setAddress(contact.address ?? "");
      setPhone(contact.phone);
      setEmail(contact.email ?? "");
      setType(contact.type as "CLIENT" | "SUPPLIER");
    } else if (open && mode === "create") {
      setName("");
      setRuc("");
      setAddress("");
      setPhone("");
      setEmail("");
      setType(defaultType ?? "CLIENT");
    }
  }, [open, mode, contact, defaultType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error("El teléfono es obligatorio.");
      return;
    }
    setLoading(true);
    try {
      const input = {
        name,
        ruc: ruc || null,
        address: address || null,
        phone,
        email: email || null,
        type,
      };
      if (mode === "create") {
        await createContact(input);
        toast.success("Cliente creado");
      } else if (contact) {
        await updateContact(contact.id, input);
        toast.success("Cliente actualizado");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error((error as Error).message || "No se pudo guardar el cliente");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!contact) return;
    if (!confirm(`¿Eliminar a "${contact.name}"?`)) return;
    setLoading(true);
    try {
      await deleteContact(contact.id);
      toast.success("Cliente eliminado");
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error((error as Error).message || "No se pudo eliminar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nuevo cliente" : "Editar cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="contactName">Nombre Completo / Razón Social</Label>
            <Input id="contactName" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactAddress">Dirección</Label>
            <Input id="contactAddress" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, ciudad" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contactRuc">RUC / Cédula</Label>
              <Input id="contactRuc" value={ruc} onChange={(e) => setRuc(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contactPhone">Teléfono</Label>
              <Input
                id="contactPhone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="300 000 0000"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactEmail">Correo (opcional)</Label>
            <Input id="contactEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLIENT">Cliente</SelectItem>
                <SelectItem value="SUPPLIER">Proveedor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Guardando..." : "Guardar cliente"}
            </Button>
            {mode === "edit" && (
              <Button type="button" variant="outline" className="text-destructive" onClick={handleDelete} disabled={loading}>
                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
