"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Smartphone, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { bulkImportContacts, type ImportedContactInput } from "@/lib/actions/contactos";

type ContactAddress = { addressLine?: string[]; city?: string; country?: string };
type PickedContact = { name?: string[]; tel?: string[]; address?: ContactAddress[] };
type ContactsManagerNavigator = {
  contacts: {
    select: (
      properties: string[],
      options?: { multiple?: boolean }
    ) => Promise<PickedContact[]>;
  };
};

function isContactPickerSupported() {
  return typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;
}

function mapPickedContacts(picked: PickedContact[]): ImportedContactInput[] {
  return picked
    .map((c) => {
      const name = c.name?.[0]?.trim() ?? "";
      const phone = c.tel?.[0]?.trim() ?? "";
      const addressParts = c.address?.[0];
      const address = addressParts?.addressLine?.join(", ") ?? "";
      return { name, phone, address: address || null };
    })
    .filter((c) => c.name && c.phone);
}

function normalizeHeader(header: string) {
  return header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function mapSpreadsheetRows(rows: Record<string, unknown>[]): ImportedContactInput[] {
  return rows
    .map((row) => {
      const normalized: Record<string, unknown> = {};
      for (const key of Object.keys(row)) {
        normalized[normalizeHeader(key)] = row[key];
      }
      const name = String(normalized["nombre"] ?? normalized["name"] ?? normalized["razon social"] ?? "").trim();
      const phone = String(normalized["telefono"] ?? normalized["phone"] ?? normalized["celular"] ?? "").trim();
      const address = String(normalized["direccion"] ?? normalized["address"] ?? "").trim();
      const ruc = String(normalized["ruc"] ?? normalized["cedula"] ?? normalized["nit"] ?? "").trim();
      const email = String(normalized["email"] ?? normalized["correo"] ?? "").trim();
      return {
        name,
        phone,
        address: address || null,
        ruc: ruc || null,
        email: email || null,
      };
    })
    .filter((c) => c.name && c.phone);
}

export function ImportContactsButton({ onSuccess }: { onSuccess: () => void }) {
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImportClick() {
    if (!isContactPickerSupported()) {
      setFallbackOpen(true);
      return;
    }

    setLoading(true);
    try {
      const picked = await (navigator as unknown as ContactsManagerNavigator).contacts.select(
        ["name", "tel", "address"],
        { multiple: true }
      );
      const contacts = mapPickedContacts(picked);
      if (contacts.length === 0) {
        toast.info("No se seleccionó ningún contacto válido.");
        return;
      }
      const result = await bulkImportContacts(contacts);
      toast.success(`${result.created} contacto(s) importado(s) desde el teléfono.`);
      onSuccess();
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error((error as Error).message || "No se pudo acceder a los contactos del teléfono.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);
      const contacts = mapSpreadsheetRows(rows);

      if (contacts.length === 0) {
        toast.error("No se encontraron filas válidas. Verifica columnas: Nombre, Teléfono, Dirección, RUC.");
        return;
      }

      const result = await bulkImportContacts(contacts);
      toast.success(`${result.created} contacto(s) importado(s) desde el archivo.`);
      setFallbackOpen(false);
      onSuccess();
    } catch {
      toast.error("No se pudo leer el archivo. Usa un CSV o Excel válido.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" className="w-full" onClick={handleImportClick} disabled={loading}>
        <Smartphone className="mr-2 h-4 w-4" />
        {loading ? "Importando..." : "Importar desde Contactos del Teléfono"}
      </Button>

      <Dialog open={fallbackOpen} onOpenChange={setFallbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importación no disponible en este dispositivo</DialogTitle>
            <DialogDescription>
              La importación directa desde la agenda de contactos solo funciona en navegadores móviles compatibles
              (Chrome en Android). Puedes registrar el cliente manualmente o importar varios a la vez desde un
              archivo CSV/Excel con columnas: <strong>Nombre, Teléfono, Dirección, RUC</strong> (opcional).
            </DialogDescription>
          </DialogHeader>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          <DialogFooter>
            <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}>
              <Upload className="mr-2 h-4 w-4" /> {loading ? "Procesando..." : "Subir archivo CSV/Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
