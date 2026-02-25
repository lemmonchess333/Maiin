import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { X, Images, Camera, Barcode, List } from "lucide-react";
import { toast } from "sonner";

// We keep this generic: parent provides handlers
export type FoodCameraMode = "food" | "barcode" | "label";

type Props = {
  open: boolean;
  onClose: () => void;

  // Called when user captures a frame (Food/Label)
  onCaptureBase64: (base64: string, mode: "food" | "label") => Promise<void>;

  // Called when barcode detected
  onBarcodeDetected: (barcode: string) => Promise<void>;

  // Optional: show loading state from parent (AI or barcode lookup)
  loading?: boolean;

  // Optional: allow parent to reset UI when something saved
  resetKey?: string | number;
};

function dataUrlToBase64(dataUrl: string) {
  return dataUrl.split(",")[1] || "";
}

export default function FoodCameraModal({
  open,
  onClose,
  onCaptureBase64,
  onBarcodeDetected,
  loading,
  resetKey,
}: Props) {
  const [mode, setMode] = useState<FoodCameraMode>("food");
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Barcode scanning
  const stopBarcodeRef = useRef<null | (() => void)>(null);
  const barcodeRunning = useRef(false);

  const canUseCamera = useMemo(() => {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }, []);

  const stopCamera = () => {
    // stop barcode if running
    try {
      stopBarcodeRef.current?.();
    } catch {
      // ignore
    }
    stopBarcodeRef.current = null;
    barcodeRunning.current = false;

    // stop stream tracks
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = null;
    setCameraReady(false);
  };

  const startCamera = async () => {
    if (!canUseCamera) {
      toast.error("Camera not available in this browser.");
      return;
    }

    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      // iOS needs these
      video.muted = true;
      video.playsInline = true;

      await video.play();
      setCameraReady(true);
    } catch (e) {
      console.error(e);
      toast.error("Couldn’t access the camera. Check permissions.");
      stopCamera();
    }
  };

  const captureFrame = async (captureMode: "food" | "label") => {
    const video = videoRef.current;
    if (!video) return;

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);

    // JPEG is smaller than PNG
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrlToBase64(dataUrl);

    await onCaptureBase64(base64, captureMode);
  };

  const startBarcode = async () => {
    // Ensure camera is running first
    if (!cameraReady) await startCamera();
    const video = videoRef.current;
    if (!video) return;

    // already running
    if (barcodeRunning.current) return;
    barcodeRunning.current = true;

    try {
      const mod = await import("@zxing/browser");
      const { BrowserMultiFormatReader } = mod as any;

      const reader = new BrowserMultiFormatReader();

      // decodeFromVideoElementContinuously exists in zxing/browser
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        video,
        async (result: any, err: any) => {
          // ignore noisy errors
          if (err) void err;

          if (!result) return;

          const text = String(result.getText?.() ?? result.text ?? "").trim();
          if (!text) return;

          // stop scanning immediately after a hit
          try {
            controls.stop();
          } catch {
            // ignore
          }

          stopBarcodeRef.current = () => {
            try {
              controls.stop();
            } catch {
              // ignore
            }
          };
          barcodeRunning.current = false;

          await onBarcodeDetected(text);
        }
      );

      stopBarcodeRef.current = () => {
        try {
          controls.stop();
        } catch {
          // ignore
        }
      };
    } catch (e) {
      console.error(e);
      barcodeRunning.current = false;
      toast.error("Barcode scanner failed to start.");
    }
  };

  // When opening, start camera; when closing, stop camera
  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    // default start camera
    void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resetKey]);

  // Switch behavior per tab
  useEffect(() => {
    if (!open) return;

    // Stop barcode when leaving barcode tab
    if (mode !== "barcode") {
      try {
        stopBarcodeRef.current?.();
      } catch {
        // ignore
      }
      stopBarcodeRef.current = null;
      barcodeRunning.current = false;
    }

    // Start barcode scanner when entering barcode tab
    if (mode === "barcode") {
      void startBarcode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, open, cameraReady]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] bg-black">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        <div className="text-white text-sm font-medium">
          {mode === "food" ? "Scan Food" : mode === "barcode" ? "Barcode" : "Food Label"}
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center"
          aria-label="Open gallery"
        >
          <Images className="w-5 h-5 text-white" />
        </button>

        {/* Gallery input (only invoked when user taps gallery icon) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (ev) => {
              const dataUrl = String(ev.target?.result || "");
              const base64 = dataUrlToBase64(dataUrl);

              // For gallery pick: treat as current mode (food or label)
              const m = mode === "label" ? "label" : "food";
              await onCaptureBase64(base64, m);
            };
            reader.readAsDataURL(file);

            // allow selecting same image again later
            e.currentTarget.value = "";
          }}
        />
      </div>

      {/* Camera */}
      <div className="absolute inset-0">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
          autoPlay
        />

        {/* Overlay frame (simple, lightweight) */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "border border-white/40 rounded-2xl",
              mode === "barcode" ? "w-[78%] h-[26%]" : "w-[78%] h-[55%]"
            )}
          />
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
            <div className="text-white text-sm font-medium">Working...</div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8 bg-gradient-to-t from-black/70 to-transparent">
        {/* Tabs */}
        <div className="mx-auto max-w-sm bg-black/40 rounded-2xl p-1 flex">
          <button
            onClick={() => setMode("food")}
            className={cn(
              "flex-1 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-2",
              mode === "food" ? "bg-white text-black" : "text-white"
            )}
          >
            <Camera className="w-4 h-4" />
            Food
          </button>
          <button
            onClick={() => setMode("barcode")}
            className={cn(
              "flex-1 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-2",
              mode === "barcode" ? "bg-white text-black" : "text-white"
            )}
          >
            <Barcode className="w-4 h-4" />
            Barcode
          </button>
          <button
            onClick={() => setMode("label")}
            className={cn(
              "flex-1 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-2",
              mode === "label" ? "bg-white text-black" : "text-white"
            )}
          >
            <List className="w-4 h-4" />
            Label
          </button>
        </div>

        {/* Shutter (only for food/label) */}
        {mode !== "barcode" && (
          <div className="mt-5 flex items-center justify-center">
            <button
              disabled={loading}
              onClick={() => captureFrame(mode === "label" ? "label" : "food")}
              className={cn(
                "w-16 h-16 rounded-full bg-white/95 active:scale-95 transition",
                loading && "opacity-60"
              )}
              aria-label="Capture"
            />
          </div>
        )}

        {/* Barcode hint */}
        {mode === "barcode" && (
          <div className="mt-5 text-center text-white/90 text-xs">
            Align barcode in the frame — it will auto-detect.
          </div>
        )}
      </div>
    </div>
  );
}