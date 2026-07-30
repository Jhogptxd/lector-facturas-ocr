"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetectorLike;
  }
}

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!open) return;

    if (typeof window === "undefined" || !window.BarcodeDetector) {
      setSupported(false);
      return;
    }
    setSupported(true);

    let cancelled = false;
    let rafId: number;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new window.BarcodeDetector!({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
        });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              onDetected(codes[0].rawValue);
              onOpenChange(false);
              return;
            }
          } catch {
            // ignore per-frame detection errors
          }
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      } catch {
        toast.error("No se pudo acceder a la cámara.");
        onOpenChange(false);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escanear código de barras</DialogTitle>
          {!supported && (
            <DialogDescription>
              Tu navegador no soporta el escáner de códigos. Ingresa el código manualmente.
            </DialogDescription>
          )}
        </DialogHeader>
        {supported && (
          <video ref={videoRef} className="w-full rounded-lg bg-black" muted playsInline />
        )}
      </DialogContent>
    </Dialog>
  );
}
