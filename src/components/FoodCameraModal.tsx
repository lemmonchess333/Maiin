import { useState, useRef, useEffect, useCallback } from "react";
import { X, Camera, ScanLine, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "food" | "barcode" | "label";

export interface BarcodeNutrition {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPhotoCapture: (base64: string, mode: "food" | "label") => void;
  onBarcodeResult: (nutrition: BarcodeNutrition) => void;
}

export default function FoodCameraModal({
  open,
  onClose,
  onPhotoCapture,
  onBarcodeResult,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const barcodeControlsRef = useRef<{ stop: () => void } | null>(null);

  // Stable refs for callbacks used in async barcode handler
  const onBarcodeResultRef = useRef(onBarcodeResult);
  const onCloseRef = useRef(onClose);
  onBarcodeResultRef.current = onBarcodeResult;
  onCloseRef.current = onClose;

  const [activeTab, setActiveTab] = useState<Tab>("food");
  const [cameraReady, setCameraReady] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [barcodeStatus, setBarcodeStatus] = useState<
    "idle" | "scanning" | "looking_up"
  >("idle");

  const lookupBarcode = useCallback(async (code: string) => {
    setBarcodeStatus("looking_up");
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${code}.json`
      );
      const data = await res.json();

      if (data.status === 1 && data.product) {
        const p = data.product;
        const n = p.nutriments || {};
        onBarcodeResultRef.current({
          name: p.product_name || "Unknown Product",
          calories: Math.round(
            n["energy-kcal_100g"] || n["energy-kcal"] || 0
          ),
          protein: Math.round(n.proteins_100g || n.proteins || 0),
          carbs: Math.round(n.carbohydrates_100g || n.carbohydrates || 0),
          fat: Math.round(n.fat_100g || n.fat || 0),
          servingSize: p.serving_size || "100g",
        });
        onCloseRef.current();
      } else {
        setPermissionError(`Product not found for barcode: ${code}`);
        setBarcodeStatus("scanning");
      }
    } catch {
      setPermissionError("Failed to look up product.");
      setBarcodeStatus("scanning");
    }
  }, []);

  // Camera + barcode lifecycle
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const setup = async () => {
      if (activeTab === "barcode") {
        // Barcode mode — @zxing manages the camera stream
        try {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (cancelled) return;

          const reader = new BrowserMultiFormatReader();
          setBarcodeStatus("scanning");

          const controls = await reader.decodeFromVideoDevice(
            undefined,
            videoRef.current!,
            (result) => {
              if (result && !cancelled) {
                controls.stop();
                barcodeControlsRef.current = null;
                lookupBarcode(result.getText());
              }
            }
          );

          if (cancelled) {
            controls.stop();
          } else {
            barcodeControlsRef.current = controls;
            setCameraReady(true);
          }
        } catch {
          if (!cancelled)
            setPermissionError(
              "Barcode scanner failed. Check camera permissions."
            );
        }
      } else {
        // Photo mode — manual getUserMedia
        try {
          setPermissionError(null);
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });

          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          setCameraReady(true);
        } catch {
          if (!cancelled)
            setPermissionError(
              "Camera permission denied. Allow camera access in browser settings."
            );
        }
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (barcodeControlsRef.current) {
        barcodeControlsRef.current.stop();
        barcodeControlsRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
      setBarcodeStatus("idle");
    };
  }, [open, activeTab, lookupBarcode]);

  // Capture photo from video frame
  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const base64 = dataUrl.split(",")[1];
    onPhotoCapture(base64, activeTab as "food" | "label");
    onClose();
  };

  if (!open) return null;

  const TABS: { id: Tab; label: string; icon: typeof Camera }[] = [
    { id: "food", label: "Scan Food", icon: Camera },
    { id: "barcode", label: "Barcode", icon: ScanLine },
    { id: "label", label: "Label", icon: FileText },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex gap-1 bg-white/10 rounded-lg p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setPermissionError(null);
                  setActiveTab(tab.id);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5",
                  activeTab === tab.id
                    ? "bg-white text-black"
                    : "text-white/70"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="w-9" />
      </div>

      {/* Camera viewfinder */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Barcode scanning overlay */}
        {activeTab === "barcode" && cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-40 border-2 border-white/50 rounded-2xl relative">
              {barcodeStatus === "scanning" && (
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-primary animate-pulse" />
              )}
            </div>
          </div>
        )}

        {/* Permission / error overlay */}
        {permissionError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <div className="bg-card rounded-2xl p-6 max-w-sm text-center space-y-3">
              <p className="text-sm text-foreground">{permissionError}</p>
              <button
                onClick={() => setPermissionError(null)}
                className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Barcode lookup loading */}
        {barcodeStatus === "looking_up" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="flex items-center gap-2 text-white text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              Looking up product...
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 py-6 flex flex-col items-center gap-3">
        {activeTab === "barcode" ? (
          <p className="text-white/60 text-xs">
            {barcodeStatus === "scanning"
              ? "Point at a barcode..."
              : barcodeStatus === "looking_up"
                ? "Looking up product..."
                : "Starting scanner..."}
          </p>
        ) : (
          <>
            <button
              onClick={capturePhoto}
              disabled={!cameraReady}
              className="w-16 h-16 rounded-full bg-white border-4 border-white/30 active:scale-95 transition-transform disabled:opacity-40"
            />
            <p className="text-white/60 text-xs">
              {activeTab === "food"
                ? "Take a photo of your food"
                : "Take a photo of the nutrition label"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
