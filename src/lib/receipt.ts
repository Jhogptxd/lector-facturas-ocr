import { jsPDF } from "jspdf";

export type ReceiptItem = { name: string; quantity: number; unitPrice: number };

export type ReceiptData = {
  businessName: string;
  concept: string;
  items: ReceiptItem[];
  amount: number;
  paymentMethod: string;
  currency: string;
  createdAt: Date;
  clientName?: string | null;
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CREDIT: "Fiado / Crédito",
};

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function buildReceiptLines(data: ReceiptData): string[] {
  const lines: string[] = [];
  lines.push(data.businessName.toUpperCase());
  lines.push("-".repeat(32));
  lines.push(data.createdAt.toLocaleString("es-CO"));
  lines.push(data.concept);
  lines.push("-".repeat(32));

  if (data.clientName) {
    lines.push(`Cliente: ${data.clientName}`);
    lines.push("-".repeat(32));
  }

  if (data.items.length > 0) {
    for (const item of data.items) {
      const lineTotal = formatMoney(item.quantity * item.unitPrice, data.currency);
      lines.push(`${item.quantity} x ${item.name}`);
      lines.push(`  ${formatMoney(item.unitPrice, data.currency)} c/u = ${lineTotal}`);
    }
    lines.push("-".repeat(32));
  }

  lines.push(`TOTAL: ${formatMoney(data.amount, data.currency)}`);
  lines.push(`Pago: ${PAYMENT_LABEL[data.paymentMethod] ?? data.paymentMethod}`);
  lines.push("-".repeat(32));
  lines.push("¡Gracias por su compra!");
  return lines;
}

export function buildReceiptText(data: ReceiptData): string {
  return buildReceiptLines(data).join("\n");
}

export function downloadReceiptPdf(data: ReceiptData, widthMm: 58 | 80 = 80) {
  const lines = buildReceiptLines(data);
  const lineHeight = 4.6;
  const heightMm = 20 + lines.length * lineHeight;

  const doc = new jsPDF({ unit: "mm", format: [widthMm, heightMm] });
  doc.setFont("courier", "normal");
  doc.setFontSize(widthMm === 58 ? 8 : 9);

  let y = 8;
  for (const line of lines) {
    doc.text(line, widthMm / 2, y, { align: "center", maxWidth: widthMm - 6 });
    y += lineHeight;
  }

  doc.save(`recibo-${Date.now()}.pdf`);
}

export function shareReceiptWhatsApp(data: ReceiptData, phone?: string | null) {
  const text = buildReceiptText(data);
  const cleanPhone = phone?.replace(/\D/g, "");
  const url = `https://wa.me/${cleanPhone ?? ""}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

const ESC = 0x1b;
const GS = 0x1d;

function encodeEscPos(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const body = encoder.encode(text.replace(/\n/g, "\r\n") + "\r\n\r\n\r\n");
  const result = new Uint8Array(2 + body.length + 3);
  result[0] = ESC;
  result[1] = 0x40;
  result.set(body, 2);
  result[2 + body.length] = GS;
  result[2 + body.length + 1] = 0x56;
  result[2 + body.length + 2] = 0x01;
  return result;
}

type BleCharacteristic = {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue: (data: BufferSource) => Promise<void>;
};
type BleService = { getCharacteristics: () => Promise<BleCharacteristic[]> };
type BleServer = { getPrimaryServices: () => Promise<BleService[]> };
type BleDevice = { gatt: { connect: () => Promise<BleServer> } };
type BluetoothNavigator = {
  bluetooth: {
    requestDevice: (options: { acceptAllDevices: boolean; optionalServices: string[] }) => Promise<BleDevice>;
  };
};

export async function printReceiptBluetooth(data: ReceiptData): Promise<void> {
  if (!("bluetooth" in navigator)) {
    throw new Error("Este dispositivo no soporta Web Bluetooth. Usa Chrome en Android.");
  }

  const device = await (navigator as unknown as BluetoothNavigator).bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ["000018f0-0000-1000-8000-00805f9b34fb", "0000ffe0-0000-1000-8000-00805f9b34fb"],
  });

  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();

  let writeCharacteristic: BleCharacteristic | null = null;
  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    writeCharacteristic = characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse) ?? null;
    if (writeCharacteristic) break;
  }

  if (!writeCharacteristic) {
    throw new Error("No se encontró un canal de impresión en la impresora emparejada.");
  }

  const payload = encodeEscPos(buildReceiptText(data));
  const chunkSize = 180;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    await writeCharacteristic.writeValue(chunk);
  }
}
