import { useEffect, useMemo, useRef, useState } from "react";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { cn } from "@/lib/utils";
import {
  Camera,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Save,
  Check,
  X,
  Barcode,
  Keyboard,
} from "lucide-react";
import { doc, setDoc, Timestamp, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

interface Props {
  date: string;
  onSaved?: () => void;
}

/** Minimal shape we need to render + save a meal */
type MealResult = {
  foodName: string;
  items: Array<{
    name: string;
    portionSize: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  confidence: "high" | "medium" | "low" | "barcode" | "database" | "manual";
  imageUrl?: string;
  barcode?: string;
  brand?: string;
};

type ScannerTab = "food" | "barcode" | "label";

function safeNum(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

/**
 * OpenFoodFacts helpers:
 * - Prefer kcal per 100g if available
 * - Use macros per 100g
 * - Default portion to serving_size if it contains grams; else "100g"
 */
function parseServingGrams(servingSize?: string): number | null {
  if (!servingSize) return null;
  // Examples: "30 g", "30g", "1 bar (40g)"
  const m = servingSize.match(/(\d+(\.\d+)?)\s*g/i);
  if (!m) return null;
  const grams = Number(m[1]);
  return Number.isFinite(grams) && grams > 0 ? grams : null;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

async function fetchOpenFoodFacts(barcode: string): Promise<MealResult> {
  const url =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
    `?fields=product_name,brands,nutriments,serving_size,image_url`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("OpenFoodFacts request failed.");
  const data = await res.json();

  if (!data || data.status !== 1 || !data.product) {
    throw new Error("Product not found for this barcode.");
  }

  const p = data.product;
  const name: string = (p.product_name || "").trim() || "Barcode item";
  const brand: string = (p.brands || "").trim();

  const nutr = p.nutriments || {};
  const kcal100 =
    safeNum(nutr["energy-kcal_100g"]) || safeNum(nutr["energy-kcal"]) || 0;

  const pro100 = safeNum(nutr["proteins_100g"]);
  const carb100 = safeNum(nutr["carbohydrates_100g"]);
  const fat100 = safeNum(nutr["fat_100g"]);

  const servingSize: string = (p.serving_size || "").trim();
  const servingGrams = parseServingGrams(servingSize);
  const portionGrams = servingGrams ?? 100;

  const factor = portionGrams / 100;

  const calories = Math.round(kcal100 * factor);
  const protein = round1(pro100 * factor);
  const carbs = round1(carb100 * factor);
  const fat = round1(fat100 * factor);

  return {
    foodName: name,
    brand,
    barcode,
    imageUrl: p.image_url || undefined,
    items: [
      {
        name: brand ? `${name} (${brand})` : name,
        portionSize: servingGrams ? servingSize : `${portionGrams}g`,
        calories,
        protein,
        carbs,
        fat,
      },
    ],
    totalCalories: calories,
    totalProtein: protein,
    totalCarbs: carbs,
    totalFat: fat,
    confidence: "barcode",
  };
}

export default function FoodAnalyzer({ date, onSaved }: Props) {
  const { user } = useAuth();

  // Photo AI hook
  const {
    analyzeFood,
    loading: aiLoading,
    error: aiError,
    result: aiResult,
    reset: resetAI,
  } = useFoodAnalysis();

  // Scanner modal (one entry point)
  const [scannerOpen, setScannerOpen] = useState(false);
  const [tab, setTab] = useState<ScannerTab>("food");

  // Shared display/result
  const [barcodeResult, setBarcodeResult] = useState<MealResult | null>(null);
  const activeResult: MealResult | null = useMemo(() => {
    return (aiResult as any) || barcodeResult;
  }, [aiResult, barcodeResult]);

  // Preview image (captured photo OR OFF image)
  const [preview, setPreview] = useState<string | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // File input (gallery)
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera (WebRTC)
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Barcode scanning
  const stopScannerRef = useRef<(() => void) | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");

  const showLoading = aiLoading || barcodeLoading;
  const showError = aiError || barcodeError;
  const confidence = (activeResult as any)?.confidence;

  const stopAllCamera = () => {
    // stop barcode scanner controls
    stopScannerRef.current?.();
    stopScannerRef.current = null;

    // stop camera stream
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }

    // detach video srcObject
    if (videoRef.current) {
      try {
        (videoRef.current as any).srcObject = null;
      } catch {
        // ignore
      }
    }
  };

  const openScanner = (nextTab: ScannerTab) => {
    setTab(nextTab);
    setScannerOpen(true);
    setBarcodeError(null);
    setManualBarcode("");
    setBarcodeResult(null);
    // keep aiResult until they capture; but we’ll clear when new capture happens
  };

  const closeScanner = () => {
    stopAllCamera();
    setScannerOpen(false);
  };

  const handleResetAll = () => {
    setPreview(null);
    setBarcodeResult(null);
    setBarcodeError(null);
    setBarcodeLoading(false);
    setManualBarcode("");

    stopAllCamera();
    setScannerOpen(false);

    resetAI();

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // =============================
  // Gallery upload
  // =============================
  const handleFile = async (file: File) => {
    // new scan -> clear old results
    setBarcodeResult(null);
    setBarcodeError(null);
    resetAI();

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      await analyzeFood(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  // =============================
  // Save
  // =============================
  const saveMeal = async (meal: MealResult) => {
    if (!user) return;
    setSaving(true);

    const mealRef = doc(collection(db, "users", user.uid, "meals"));
    await setDoc(mealRef, {
      date,
      foodName: meal.foodName,
      items: meal.items,
      totalCalories: meal.totalCalories,
      totalProtein: meal.totalProtein,
      totalCarbs: meal.totalCarbs,
      totalFat: meal.totalFat,
      confidence: meal.confidence,
      barcode: meal.barcode || null,
      brand: meal.brand || null,
      imageUrl: meal.imageUrl || null,
      createdAt: Timestamp.now(),
    });

    setSaving(false);
    setSaved(true);

    setTimeout(() => {
      setSaved(false);
      handleResetAll();
      onSaved?.();
    }, 1200);
  };

  const handleSave = async () => {
    if (!activeResult) return;
    const meal: MealResult = {
      foodName: (activeResult as any).foodName ?? "Meal",
      items: (activeResult as any).items ?? [],
      totalCalories: safeNum((activeResult as any).totalCalories),
      totalProtein: safeNum((activeResult as any).totalProtein),
      totalCarbs: safeNum((activeResult as any).totalCarbs),
      totalFat: safeNum((activeResult as any).totalFat),
      confidence: ((activeResult as any).confidence ?? "low") as any,
      barcode: (activeResult as any).barcode,
      brand: (activeResult as any).brand,
      imageUrl: (activeResult as any).imageUrl,
    };
    await saveMeal(meal);
  };

  // =============================
  // Camera start (WebRTC)
  // =============================
  const ensureCameraStream = async () => {
    if (streamRef.current) return;

    const videoEl = videoRef.current;
    if (!videoEl) throw new Error("Camera element not ready.");

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: "environment" },
      },
      audio: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    streamRef.current = stream;

    try {
      (videoEl as any).srcObject = stream;
    } catch {
      // fallback for older browsers
      // @ts-expect-error legacy
      videoEl.src = URL.createObjectURL(stream);
    }
    await videoEl.play();
  };

  const captureFrameToDataUrl = async (): Promise<string> => {
    const videoEl = videoRef.current;
    if (!videoEl) throw new Error("Camera not ready.");

    const w = videoEl.videoWidth || 1280;
    const h = videoEl.videoHeight || 720;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");

    ctx.drawImage(videoEl, 0, 0, w, h);
    // JPEG to keep payload reasonable
    return canvas.toDataURL("image/jpeg", 0.85);
  };

  const takePhotoAndAnalyze = async () => {
    setBarcodeResult(null);
    setBarcodeError(null);
    resetAI();

    try {
      const dataUrl = await captureFrameToDataUrl();
      setPreview(dataUrl);
      closeScanner();

      const base64 = dataUrl.split(",")[1];
      await analyzeFood(base64);
    } catch (e: any) {
      console.error(e);
      toast.error("Couldn’t capture photo. Try again.");
    }
  };

  // =============================
  // Barcode scanning (ZXing)
  // =============================
  const handleBarcodeFound = async (code: string) => {
    const cleaned = code.replace(/\s+/g, "");
    setManualBarcode(cleaned);
    setBarcodeLoading(true);
    setBarcodeError(null);

    try {
      const meal = await fetchOpenFoodFacts(cleaned);
      setBarcodeResult(meal);
      if (meal.imageUrl) setPreview(meal.imageUrl);
      toast.success("Barcode found!");
      closeScanner();
    } catch (e: any) {
      setBarcodeResult(null);
      setBarcodeError(e?.message || "Barcode lookup failed.");
      toast.error(e?.message || "Barcode lookup failed.");
    } finally {
      setBarcodeLoading(false);
    }
  };

  const startBarcodeScanner = async () => {
    setBarcodeError(null);
    setBarcodeResult(null);
    setBarcodeLoading(false);

    await ensureCameraStream();

    // Stop any previous scanner
    stopScannerRef.current?.();
    stopScannerRef.current = null;

    try {
      const mod = await import("@zxing/browser");
      const { BrowserMultiFormatReader } = mod as any;

      const reader = new BrowserMultiFormatReader();
      const videoEl = videoRef.current;
      if (!videoEl) throw new Error("Camera element not ready.");

      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoEl,
        async (result: any, _err: any) => {
          // _err is noisy while scanning; ignore to keep console clean
          if (_err) void _err;

          if (!result) return;
          const text = String(result.getText?.() ?? result.text ?? "").trim();
          if (!text) return;

          try {
            controls.stop();
          } catch {
            // ignore
          }

          stopScannerRef.current = () => {
            try {
              controls.stop();
            } catch {
              // ignore
            }
          };

          await handleBarcodeFound(text);
        }
      );

      stopScannerRef.current = () => {
        try {
          controls.stop();
        } catch {
          // ignore
        }
      };
    } catch (e: any) {
      console.error(e);
      setBarcodeError(
        "Couldn’t start barcode scanner. Check camera permissions or try manual entry."
      );
    }
  };

  const submitManualBarcode = async () => {
    const code = manualBarcode.trim();
    if (!code) return;

    stopScannerRef.current?.();
    stopScannerRef.current = null;

    await handleBarcodeFound(code);
  };

  // =============================
  // Scanner modal lifecycle
  // =============================
  useEffect(() => {
    if (!scannerOpen) return;

    // Start camera ASAP
    (async () => {
      try {
        await ensureCameraStream();
        if (tab === "barcode") {
          await startBarcodeScanner();
        }
        if (tab === "label") {
          toast.message("Tip: fill the frame with the nutrition label.");
        }
      } catch (e: any) {
        console.error(e);
        toast.error("Camera blocked. Enable permissions or use Gallery.");
      }
    })();

    return () => {
      stopAllCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerOpen, tab]);

  // =============================
  // Render
  // =============================
  return (
    <div className="space-y-4">
      {/* Hidden input for Gallery (iOS will show a sheet; that’s normal) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />

      {/* PRIMARY: Single button */}
      {!preview && !activeResult && (
        <button
          onClick={() => openScanner("food")}
          className="w-full py-4 rounded-xl border-2 border-dashed border-primary/30 text-primary font-medium text-sm hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
        >
          <Camera className="w-5 h-5" />
          Scan Food
        </button>
      )}

      {/* UNIFIED SCANNER MODAL */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black">
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between">
            <button
              onClick={closeScanner}
              className="p-2 rounded-full bg-black/40 text-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => setTab("food")}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition",
                  tab === "food"
                    ? "bg-white text-black"
                    : "bg-black/40 text-white"
                )}
              >
                Food
              </button>
              <button
                onClick={() => setTab("barcode")}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition",
                  tab === "barcode"
                    ? "bg-white text-black"
                    : "bg-black/40 text-white"
                )}
              >
                Barcode
              </button>
              <button
                onClick={() => setTab("label")}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition",
                  tab === "label"
                    ? "bg-white text-black"
                    : "bg-black/40 text-white"
                )}
              >
                Label
              </button>
            </div>
          </div>

          {/* Video */}
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
            autoPlay
          />

          {/* Frame overlay (simple) */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute left-6 right-6 top-[22%] bottom-[22%] border-2 border-white/70 rounded-2xl" />
          </div>

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-6 bg-gradient-to-t from-black/70 to-transparent">
            {/* Barcode manual bar */}
            {tab === "barcode" && (
              <div className="mb-3 bg-white/90 rounded-2xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-black">
                    Scan a barcode
                  </p>
                  {barcodeLoading && (
                    <span className="text-xs text-black/70">Looking up…</span>
                  )}
                </div>

                <div className="mt-2 flex gap-2">
                  <div className="flex-1 relative">
                    <Keyboard className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-black/50" />
                    <input
                      value={manualBarcode}
                      onChange={(e) => setManualBarcode(e.target.value)}
                      inputMode="numeric"
                      placeholder="Enter barcode"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-black/10 text-black text-sm placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-black/20"
                    />
                  </div>
                  <button
                    onClick={submitManualBarcode}
                    disabled={!manualBarcode.trim() || barcodeLoading}
                    className={cn(
                      "px-4 rounded-xl text-sm font-medium bg-black text-white",
                      (!manualBarcode.trim() || barcodeLoading) &&
                        "opacity-50 cursor-not-allowed"
                    )}
                  >
                    Lookup
                  </button>
                </div>

                {barcodeError && (
                  <p className="mt-2 text-xs text-red-600">{barcodeError}</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              {/* Gallery */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-3 rounded-2xl bg-white/20 text-white text-sm font-medium flex items-center gap-2"
              >
                <ImageIcon className="w-5 h-5" />
                Gallery
              </button>

              {/* Main action */}
              {tab === "barcode" ? (
                <button
                  onClick={startBarcodeScanner}
                  className="flex-1 py-3 rounded-2xl bg-white text-black text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Barcode className="w-5 h-5" />
                  Scan
                </button>
              ) : (
                <button
                  onClick={takePhotoAndAnalyze}
                  className="flex-1 py-3 rounded-2xl bg-white text-black text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Camera className="w-5 h-5" />
                  {tab === "label" ? "Capture label" : "Capture food"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Image (captured photo OR product image) */}
      {preview && (
        <div className="relative rounded-xl overflow-hidden">
          <img src={preview} alt="Food" className="w-full h-48 object-cover" />
          {!showLoading && !activeResult && (
            <button
              onClick={handleResetAll}
              className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {showLoading && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          {barcodeLoading ? "Fetching nutrition..." : "Analyzing your food..."}
        </div>
      )}

      {/* Error */}
      {showError && !activeResult && (
        <div className="bg-red-50 rounded-xl p-4 space-y-2">
          <p className="text-sm text-red-600">{String(showError)}</p>
          <button
            onClick={handleResetAll}
            className="text-sm text-red-500 font-medium flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}

      {/* Result card */}
      {activeResult && (
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {(activeResult as any).foodName}
                </h3>
                {(activeResult as any).brand && (
                  <p className="text-xs text-muted-foreground truncate">
                    {(activeResult as any).brand}
                  </p>
                )}
              </div>

              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium shrink-0",
                  confidence === "high"
                    ? "bg-green-100 text-green-700"
                    : confidence === "medium"
                    ? "bg-yellow-100 text-yellow-700"
                    : confidence === "barcode"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-red-100 text-red-700"
                )}
              >
                {confidence}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-orange-50 rounded-lg p-2">
                <p className="text-lg font-bold text-orange-600 tabular-nums">
                  {safeNum((activeResult as any).totalCalories)}
                </p>
                <p className="text-xs text-orange-500">cal</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-2">
                <p className="text-lg font-bold text-blue-600 tabular-nums">
                  {safeNum((activeResult as any).totalProtein)}g
                </p>
                <p className="text-xs text-blue-500">protein</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-2">
                <p className="text-lg font-bold text-amber-600 tabular-nums">
                  {safeNum((activeResult as any).totalCarbs)}g
                </p>
                <p className="text-xs text-amber-500">carbs</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-2">
                <p className="text-lg font-bold text-purple-600 tabular-nums">
                  {safeNum((activeResult as any).totalFat)}g
                </p>
                <p className="text-xs text-purple-500">fat</p>
              </div>
            </div>

            {Array.isArray((activeResult as any).items) &&
              (activeResult as any).items.length > 1 && (
                <div className="space-y-1 pt-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Breakdown
                  </p>
                  {(activeResult as any).items.map((item: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs text-muted-foreground"
                    >
                      <span className="truncate">
                        {item.name} ({item.portionSize})
                      </span>
                      <span className="tabular-nums">
                        {safeNum(item.calories)} cal
                      </span>
                    </div>
                  ))}
                </div>
              )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleResetAll}
              className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Scan again
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className={cn(
                "flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2",
                saved
                  ? "bg-green-500 text-white"
                  : "bg-primary text-primary-foreground hover:opacity-90",
                saving && "opacity-50 cursor-not-allowed"
              )}
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" /> Saved!
                </>
              ) : saving ? (
                "Saving..."
              ) : (
                <>
                  <Save className="w-4 h-4" /> Log meal
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}