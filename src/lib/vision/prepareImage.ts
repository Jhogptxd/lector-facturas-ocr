"use client";

/**
 * Cap on the long edge before upload. Cloud Vision accepts bigger images, but a
 * phone photo at full resolution blows past the 8 MB request limit; 2576px keeps
 * printed invoice text well above the ~10px character height the OCR needs.
 */
const MAX_EDGE = 2576;
const JPEG_QUALITY = 0.9;

export type PreparedImage = {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  resized: boolean;
};

/**
 * Re-encodes a camera photo to a JPEG bounded to the model's maximum edge.
 *
 * Re-encoding also normalises formats the API doesn't accept but the browser can
 * decode (notably iPhone HEIC), so a phone photo works without asking the user
 * to convert anything. If decoding fails we fall back to the original file and
 * let the server-side media-type check produce the error message.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  try {
    const bitmap = await createImageBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

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
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) throw new Error("No se pudo codificar la imagen");

    const prepared = new File([blob], renameToJpg(file.name), { type: "image/jpeg" });

    return {
      file: prepared,
      previewUrl: URL.createObjectURL(prepared),
      width,
      height,
      resized: scale < 1,
    };
  } catch {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      width: 0,
      height: 0,
      resized: false,
    };
  }
}

function renameToJpg(name: string) {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "documento"}.jpg`;
}
