import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { X, Image as ImageIcon, RefreshCw } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { logger } from "@/lib/logger";

type CaptureMode = "food" | "label";
type TabMode = "food" | "barcode" | "label";

type Props = {
  open: boolean;
  onClose: () => void;
  onCaptureBase64: (base64: string, mode: CaptureMode) => Promise<void>;
  onBarcodeDetected: (raw: string) => Promise<void>;
  loading: boolean;
};

function dataUrlToBase64(dataUrl: string) {
  const parts = dataUrl.split(",");
  return parts.length > 1 ? parts[1] : "";
}

async function startStream(
  videoEl: HTMLVideoElement,
  facingMode: "environment" | "user"
) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}

export default function FoodCameraModal({
  open,
  onClose,
  onCaptureBase64,
  onBarcodeDetected,
  loading,
}: Props) {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(open);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stopZXingRef = useRef<null | (() => void)>(null);

  const [tab, setTab] = useState<TabMode>("food");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [busy, setBusy] = useState(false);
  const [barcodeHint, setBarcodeHint] = useState<string>("Align barcode in frame");

  // start camera when opened
  useEffect(() => {
    if (!open) return;

    setTab("food");
    setFacing("environment");
    setBusy(false);
    setBarcodeHint("Align barcode in frame");

    const run = async () => {
      try {
        const videoEl = videoRef.current;
        if (!videoEl) return;

        streamRef.current = await startStream(videoEl, "environment");
      } catch (e: unknown) {
        // If camera permissions fail, close gracefully
        logger.error(e);
        onClose();
      }
    };

    void run();

    return () => {
      stopZXingRef.current?.();
      stopZXingRef.current = null;

      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [open, onClose]);

  // flip camera
  useEffect(() => {
    if (!open) return;

    const videoEl = videoRef.current;
    if (!videoEl) return;

    const restart = async () => {
      try {
        stopZXingRef.current?.();
        stopZXingRef.current = null;

        stopStream(streamRef.current);
        streamRef.current = await startStream(videoEl, facing);
      } catch (e: unknown) {
        logger.error(e);
      }
    };

    void restart();
  }, [facing, open]);

  // barcode scanning
  useEffect(() => {
    if (!open) return;

    // only scan when in barcode tab
    if (tab !== "barcode") {
      stopZXingRef.current?.();
      stopZXingRef.current = null;
      setBarcodeHint("Align barcode in frame");
      return;
    }

    const startZXing = async () => {
      try {
        const videoEl = videoRef.current;
        if (!videoEl) return;

        setBarcodeHint("Scanning…");

        const mod = await import("@zxing/browser");
        const { BrowserMultiFormatReader } = mod as unknown as { BrowserMultiFormatReader: new () => { decodeFromVideoElement: (el: HTMLVideoElement, cb: (result: { getText?: () => string; text?: string } | null, err: unknown) => void) => Promise<{ stop: () => void }> } };

        const reader = new BrowserMultiFormatReader();

        const controls = await reader.decodeFromVideoElement(
          videoEl,
          async (result: { getText?: () => string; text?: string } | null, err: unknown) => {
            // ignore noisy errors
            if (err) void err;
            if (!result) return;

            const text = String(result.getText?.() ?? result.text ?? "").trim();
            if (!text) return;

            // stop after first detection
            try {
              controls.stop();
            } catch {
              // ignore
            }
            stopZXingRef.current = null;
            setBarcodeHint("Found!");

            await onBarcodeDetected(text);
          }
        );

        stopZXingRef.current = () => {
          try {
            controls.stop();
          } catch {
            // ignore
          }
        };
      } catch (e: unknown) {
        logger.error(e);
        setBarcodeHint("Scanner failed — try again");
      }
    };

    void startZXing();

    return () => {
      stopZXingRef.current?.();
      stopZXingRef.current = null;
    };
  }, [tab, open, onBarcodeDetected]);

  const pickFromLibrary = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      setBusy(true);
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result || "");
        const base64 = dataUrlToBase64(dataUrl);
        await onCaptureBase64(base64, tab === "label" ? "label" : "food");
        setBusy(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      logger.error(err);
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    if (busy || loading) return;

    try {
      setBusy(true);

      const videoEl = videoRef.current;
      const canvas = canvasRef.current;
      if (!videoEl || !canvas) return;

      const w = videoEl.videoWidth || 1280;
      const h = videoEl.videoHeight || 720;

      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(videoEl, 0, 0, w, h);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = dataUrlToBase64(dataUrl);

      await onCaptureBase64(base64, tab === "label" ? "label" : "food");
    } catch (e) {
      logger.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const disableShutter = loading || busy || tab === "barcode";

  return (
    <div ref={focusTrapRef} role="dialog" aria-modal="true" aria-label="Food camera" className="fixed inset-0 z-[60] bg-black">
      {/* top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4">
        <button
          onClick={onClose}
          className="h-10 w-10 rounded-full bg-black/50 text-white flex items-center justify-center"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <button
          onClick={() => { haptic("light"); setFacing((p) => (p === "environment" ? "user" : "environment")); }}
          className="h-10 w-10 rounded-full bg-black/50 text-white flex items-center justify-center"
          aria-label="Flip camera"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* camera */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
        autoPlay
      />

      {/* frame overlay */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-[78%] max-w-[360px] aspect-[4/2.3] rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>

      {/* bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pb-8">
        <div className="mx-auto max-w-[520px] space-y-3">
          {/* tabs — pill/segment pattern matching app style */}
          <div className="flex gap-1.5 justify-center bg-black/30 rounded-full p-1">
            {([
              { key: "food" as const, label: "Scan Food" },
              { key: "barcode" as const, label: "Barcode" },
              { key: "label" as const, label: "Food label" },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { haptic("light"); setTab(key); }}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  tab === key
                    ? "bg-[#7B72E9] text-white shadow-sm"
                    : "text-white/70 hover:text-white"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "barcode" && (
            <p className="text-center text-xs text-white/80">{barcodeHint}</p>
          )}

          {/* capture row */}
          <div className="flex items-center justify-between">
            {/* Photo library */}
            <button
              onClick={pickFromLibrary}
              className="h-12 w-12 rounded-full bg-black/50 text-white flex items-center justify-center"
              aria-label="Photo library"
              disabled={loading || busy}
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            {/* Shutter (only for food/label) — white fill + coral ring */}
            <button
              onClick={() => { haptic("medium"); takePhoto(); }}
              disabled={disableShutter}
              className={cn(
                "h-16 w-16 rounded-full border-[5px] flex items-center justify-center transition-transform active:scale-90",
                disableShutter && "opacity-50"
              )}
              style={{ borderColor: "#D4637A" }}
              aria-label="Capture"
            >
              <div className="w-[52px] h-[52px] rounded-full bg-white" />
            </button>

            <div className="h-12 w-12" />
          </div>

          <p className="text-center text-xs text-white/70">
            {tab === "barcode"
              ? "Auto-detects barcode (no shutter)"
              : "Snap a photo or pick from library"}
          </p>
        </div>
      </div>

      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
