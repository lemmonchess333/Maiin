import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { X, Image as ImageIcon } from "lucide-react";

type Mode = "food" | "barcode";

type Props = {
  open: boolean;
  initialMode?: Mode;
  onClose: () => void;

  // Called when user captures a photo (base64 WITHOUT the data URL prefix)
  onFoodPhoto: (base64: string, previewDataUrl: string) => Promise<void> | void;

  // Called when a barcode is detected (digits/string)
  onBarcode: (code: string) => Promise<void> | void;

  // Optional: show an error toast upstream
  onError?: (message: string) => void;
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
  initialMode = "food",
  onClose,
  onFoodPhoto,
  onBarcode,
  onError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [busy, setBusy] = useState(false);
  const [barcodeStatus, setBarcodeStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ZXing controls stopper
  const stopZXingRef = useRef<null | (() => void)>(null);

  const canUseCamera = useMemo(() => {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }, []);

  useEffect(() => {
    if (!open) return;

    // reset each open
    setMode(initialMode);
    setFacing("environment");
    setBusy(false);
    setBarcodeStatus(null);

    const run = async () => {
      try {
        const videoEl = videoRef.current;
        if (!videoEl) return;
        if (!canUseCamera) {
          onError?.("Camera not available in this browser.");
          return;
        }
        streamRef.current = await startStream(videoEl, "environment");
      } catch (e: any) {
        onError?.(
          e?.message ||
            "Couldn’t access camera. Check permissions and try again."
        );
      }
    };

    void run();

    return () => {
      // stop barcode scanning
      stopZXingRef.current?.();
      stopZXingRef.current = null;

      // stop stream
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [open, initialMode, canUseCamera, onError]);

  // Restart stream when flipping camera
  useEffect(() => {
    if (!open) return;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const restart = async () => {
      try {
        // stop zxing if switching
        stopZXingRef.current?.();
        stopZXingRef.current = null;
        setBarcodeStatus(null);

        stopStream(streamRef.current);
        streamRef.current = await startStream(videoEl, facing);
      } catch (e: any) {
        onError?.(
          e?.message ||
            "Couldn’t switch camera. Check permissions and try again."
        );
      }
    };

    void restart();
  }, [facing, open, onError]);

  // Start/stop ZXing based on mode
  useEffect(() => {
    if (!open) return;
    if (mode !== "barcode") {
      stopZXingRef.current?.();
      stopZXingRef.current = null;
      setBarcodeStatus(null);
      return;
    }

    const startZXing = async () => {
      try {
        const videoEl = videoRef.current;
        if (!videoEl) return;

        setBarcodeStatus("Scanning…");

        const mod = await import("@zxing/browser");
        const { BrowserMultiFormatReader } = mod as any;

        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(
          videoEl,
          async (result: any, err: any) => {
            // ignore noisy errors while scanning
            if (err) void err;
            if (!result) return;

            const text = String(
              result.getText?.() ?? result.text ?? ""
            ).trim();
            if (!text) return;

            // stop scanning once found
            try {
              controls.stop();
            } catch {
              // ignore
            }
            stopZXingRef.current = null;
            setBarcodeStatus("Found!");

            await onBarcode(text);
          }
        );

        stopZXingRef.current = () => {
          try {
            controls.stop();
          } catch {
            // ignore
          }
        };
      } catch (e: any) {
        onError?.(
          e?.message ||
            "Couldn’t start barcode scanner. Try again or use manual entry."
        );
      }
    };

    void startZXing();

    return () => {
      stopZXingRef.current?.();
      stopZXingRef.current = null;
    };
  }, [mode, open, onBarcode, onError]);

  const takePhoto = async () => {
    if (busy) return;
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

      await onFoodPhoto(base64, dataUrl);
    } catch (e: any) {
      onError?.(e?.message || "Couldn’t capture photo. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const pickFromLibrary = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking same image again
    if (!file) return;

    try {
      setBusy(true);
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result || "");
        const base64 = dataUrlToBase64(dataUrl);
        await onFoodPhoto(base64, dataUrl);
        setBusy(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setBusy(false);
      onError?.(err?.message || "Couldn’t read photo. Try again.");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black">
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
          onClick={() => setFacing((p) => (p === "environment" ? "user" : "environment"))}
          className="h-10 px-4 rounded-full bg-black/50 text-white text-sm"
          aria-label="Flip camera"
        >
          Flip
        </button>
      </div>

      {/* video */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
        autoPlay
      />

      {/* overlay frame */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-[78%] max-w-[360px] aspect-[4/2.3] rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>

      {/* bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pb-8">
        <div className="mx-auto max-w-[520px] space-y-3">
          {/* mode pills */}
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setMode("food")}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium",
                mode === "food"
                  ? "bg-white text-black"
                  : "bg-black/40 text-white"
              )}
            >
              Scan Food
            </button>
            <button
              onClick={() => setMode("barcode")}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium",
                mode === "barcode"
                  ? "bg-white text-black"
                  : "bg-black/40 text-white"
              )}
            >
              Barcode
            </button>
          </div>

          {/* status */}
          {mode === "barcode" && (
            <p className="text-center text-xs text-white/80">
              {barcodeStatus || "Align the barcode inside the frame"}
            </p>
          )}

          {/* capture row */}
          <div className="flex items-center justify-between">
            <button
              onClick={pickFromLibrary}
              className="h-12 w-12 rounded-full bg-black/50 text-white flex items-center justify-center"
              aria-label="Photo library"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            <button
              onClick={mode === "food" ? takePhoto : undefined}
              disabled={busy || mode !== "food"}
              className={cn(
                "h-16 w-16 rounded-full border-4 border-white bg-white/10",
                (busy || mode !== "food") && "opacity-50"
              )}
              aria-label="Capture"
            />

            <div className="h-12 w-12" />
          </div>

          <p className="text-center text-xs text-white/70">
            {mode === "food"
              ? "Tap the shutter to capture food"
              : "Auto-detects barcode (no shutter needed)"}
          </p>
        </div>
      </div>

      {/* hidden file input (photo library only) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        className="hidden"
      />

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}