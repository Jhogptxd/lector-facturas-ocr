"use client";

/**
 * Cap on the long edge before upload. Gemini accepts bigger images, but a phone
 * photo at full resolution blows past the 8 MB request limit; 2576px keeps
 * printed invoice text well above the character height the model needs to read
 * the small print.
 */
const MAX_EDGE = 2576;
const JPEG_QUALITY = 0.9;

/**
 * Tope del respaldo que se archiva. La copia del OCR es deliberadamente grande
 * —bajarla arruinaría la lectura de la letra pequeña—, así que se genera una
 * segunda copia ligera pensada solo para que el dueño reconozca el documento
 * después. 150 KB caben de sobra en la base sin pagar almacenamiento aparte.
 */
export const RECEIPT_MAX_BYTES = 150 * 1024;

/**
 * Escalones de búsqueda: primero se sacrifica resolución y luego calidad, en
 * ese orden, porque para reconocer un recibo a ojo importa más que el texto no
 * se vea borroso que el número exacto de píxeles.
 */
const RECEIPT_EDGE_STEPS = [1600, 1280, 1024, 800, 640];
const RECEIPT_QUALITY_STEPS = [0.7, 0.6, 0.5, 0.4];

export type ReceiptImage = {
  file: File;
  bytes: number;
  width: number;
  height: number;
  quality: number;
  /** false si ni con la compresión más agresiva se bajó del tope. */
  withinTarget: boolean;
};

export type PreparedImage = {
  /** Copia de alta resolución: se manda al OCR y no se archiva. */
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  resized: boolean;
  /** Copia ligera para archivar. null si el navegador no pudo decodificar la foto. */
  receipt: ReceiptImage | null;
};

/**
 * Re-encodes a camera photo to a JPEG bounded to the model's maximum edge.
 *
 * Re-encoding also normalises formats the API doesn't accept but the browser can
 * decode (notably iPhone HEIC), so a phone photo works without asking the user
 * to convert anything. If decoding fails we fall back to the original file and
 * let the server-side media-type check produce the error message.
 *
 * Devuelve además una copia ligera bajo `RECEIPT_MAX_BYTES`: ambas salen del
 * mismo bitmap, así que la cámara se decodifica una sola vez.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const blob = await encode(bitmap, width, height, JPEG_QUALITY);
    if (!blob) throw new Error("No se pudo codificar la imagen");

    const prepared = new File([blob], renameToJpg(file.name), { type: "image/jpeg" });
    const receipt = await buildReceiptCopy(bitmap, file.name);

    return {
      file: prepared,
      previewUrl: URL.createObjectURL(receipt?.file ?? prepared),
      width,
      height,
      resized: scale < 1,
      receipt,
    };
  } catch {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      width: 0,
      height: 0,
      resized: false,
      receipt: null,
    };
  } finally {
    bitmap?.close();
  }
}

/**
 * Baja resolución y calidad por escalones hasta caber en el tope, devolviendo el
 * primer resultado que entra. Si ninguno lo logra, entrega el más pequeño y lo
 * marca, para que la interfaz pueda avisar en vez de archivar algo enorme.
 */
async function buildReceiptCopy(bitmap: ImageBitmap, name: string): Promise<ReceiptImage | null> {
  const longEdge = Math.max(bitmap.width, bitmap.height);
  let smallest: ReceiptImage | null = null;

  for (const edge of RECEIPT_EDGE_STEPS) {
    const scale = longEdge > edge ? edge / longEdge : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    for (const quality of RECEIPT_QUALITY_STEPS) {
      const blob = await encode(bitmap, width, height, quality);
      if (!blob) continue;

      const candidate: ReceiptImage = {
        file: new File([blob], renameToJpg(name, "-recibo"), { type: "image/jpeg" }),
        bytes: blob.size,
        width,
        height,
        quality,
        withinTarget: blob.size <= RECEIPT_MAX_BYTES,
      };

      if (candidate.withinTarget) return candidate;
      if (!smallest || candidate.bytes < smallest.bytes) smallest = candidate;
    }
  }

  return smallest;
}

async function encode(bitmap: ImageBitmap, width: number, height: number, quality: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");

  // White backdrop: flattening a transparent PNG onto JPEG would otherwise
  // render transparent pixels black and swallow printed text.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function renameToJpg(name: string, suffix = "") {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "documento"}${suffix}.jpg`;
}
