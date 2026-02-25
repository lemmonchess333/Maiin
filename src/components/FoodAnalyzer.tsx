import { useEffect, useMemo, useRef, useState } from "react";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { cn } from "@/lib/utils";
import {
  Camera,
  Image,
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

type SheetMode = "closed" | "open";
type ScannerMode = "none" | "barcode" | "photo";

function safeNum(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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
    safeNum(nutr["energy-kcal_100g"]) ||
    safeNum(nutr["energy-kcal"]) ||
    0;

  const pro100 = safeNum(nutr["proteins_100g"]);
  const carb100 = safeNum(nutr["carbohydrates_100g"]);
  const fat100 = safeNum(nutr["fat_100g"]);

  // Default portion grams:
  const servingSize: string = (p.serving_size || "").trim();
  const servingGrams = parseServingGrams(servingSize);
  const portionGrams = servingGrams ?? 100;

  // Convert per 100g -> per portion
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
  const { analyzeFood, loading: aiLoading, error: aiError, result: aiResult, reset: resetAI } =
    useFoodAnalysis();

  // UI
  const [sheet, setSheet] = useState<SheetMode>("closed");
  const [mode, setMode] = useState<ScannerMode>("none");

  // Shared display/result
  const [barcodeResult, setBarcodeResult] = useState<MealResult | null>(null);
  const activeResult: MealResult | null = useMemo(() => {
    // aiResult may not match MealResult type exactly, but it contains these fields in your usage.
    // We cast safely to keep this file drop-in without changing your hook types.
    return (aiResult as any) || barcodeResult;
  }, [aiResult, barcodeResult]);

  // Preview image (photo) OR OFF image
  const [preview, setPreview] = useState<string | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Barcode scanner refs/state
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<any>(null);
  const stopScannerRef = useRef<(() => void) | null>(null);

  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");

  const handleResetAll = () => {
    setPreview(null);
    setBarcodeResult(null);
    setBarcodeError(null);
    setBarcodeLoading(false);
    setManualBarcode("");
    setMode("none");
    setSheet("closed");

    // stop scanner if running
    stopScannerRef.current?.();
    stopScannerRef.current = null;

    // reset AI
    resetAI();

    // reset inputs
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    // switching to photo mode clears barcode state
    setBarcodeResult(null);
    setBarcodeError(null);
    setMode("photo");

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
    if (file) handleFile(file);
  };

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
    // activeResult from AI hook might be typed differently; map defensively
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
  // Barcode scanning
  // =============================

  const startBarcodeScanner = async () => {
    setMode("barcode");
    setSheet("closed");
    setPreview(null);
    setBarcodeResult(null);
    setBarcodeError(null);

    try {
      // Dynamic import so bundling is cleaner and failures are clearer
      const mod = await import("@zxing/browser");
      const { BrowserMultiFormatReader } = mod as any;

      const reader = new BrowserMultiFormatReader();
      codeReaderRef.current = reader;

      const videoEl = videoRef.current;
      if (!videoEl) throw new Error("Camera element not ready.");

      // decodeFromVideoDevice attaches camera stream to <video> internally
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoEl,
        async (result: any, err: any) => {
          // err is spammy during scanning; ignore unless no result
          if (!result) return;

          const text = String(result.getText?.() ?? result.text ?? "").trim();
          if (!text) return;

          // stop scanning immediately once we have a code
          try {
            controls.stop();
          } catch {}
          stopScannerRef.current = () => {
            try {
              controls.stop();
            } catch {}
          };

          await handleBarcodeFound(text);
        }
      );

      stopScannerRef.current = () => {
        try {
          controls.stop();
        } catch {}
      };
    } catch (e: any) {
      console.error(e);
      setBarcodeError(
        "Couldn’t start barcode scanner. Check camera permissions or try manual entry."
      );
    }
  };

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
    } catch (e: any) {
      setBarcodeResult(null);
      setBarcodeError(e?.message || "Barcode lookup failed.");
      toast.error(e?.message || "Barcode lookup failed.");
    } finally {
      setBarcodeLoading(false);
    }
  };

  const submitManualBarcode = async () => {
    const code = manualBarcode.trim();
    if (!code) return;
    // stop live scanner if it’s running
    stopScannerRef.current?.();
    stopScannerRef.current = null;
    await handleBarcodeFound(code);
  };

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      stopScannerRef.current?.();
      stopScannerRef.current = null;
    };
  }, []);

  // =============================
  // Render
  // =============================

  const showLoading = aiLoading || barcodeLoading;
  const showError = aiError || barcodeError;
  const confidence = (activeResult as any)?.confidence;

  return (
    <div className="space-y-4">
      {/* Hidden inputs for photo */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange}
        className="hidden"
      />

      {/* PRIMARY: Single button */}
      {!preview && !activeResult && mode === "none" && (
        <button
          onClick={() => setSheet("open")}
          className="w-full py-4 rounded-xl border-2 border-dashed border-primary/30 text-primary font-medium text-sm hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
        >
          <Camera className="w-5 h-5" />
          Scan Food
        </button>
      )}

      {/* ACTION SHEET */}
      {sheet === "open" && (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="Close"
            onClick={() => setSheet("closed")}
            className="absolute inset-0 bg-black/30"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-card border-t border-border/60 rounded-t-2xl p-4 space-y-2">
            <div className="flex items-center justify-between pb-1">
              <p className="text-sm font-semibold text-foreground">Scan options</p>
              <button
                onClick={() => setSheet("closed")}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <button
              onClick={startBarcodeScanner}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.99] transition"
            >
              <Barcode className="w-5 h-5" />
              Scan Barcode
            </button>

            <button
              onClick={() => {
                setSheet("closed");
                setMode("photo");
                cameraInputRef.current?.click();
              }}
              className="w-full py-3 rounded-xl border border-border text-foreground font-medium text-sm flex items-center justify-center gap-2 hover:bg-muted/50 active:scale-[0.99] transition"
            >
              <Camera className="w-5 h-5" />
              Take Photo
            </button>

            <button
              onClick={() => {
                setSheet("closed");
                setMode("photo");
                fileInputRef.current?.click();
              }}
              className="w-full py-3 rounded-xl border border-border text-foreground font-medium text-sm flex items-center justify-center gap-2 hover:bg-muted/50 active:scale-[0.99] transition"
            >
              <Image className="w-5 h-5" />
              Upload Photo
            </button>
          </div>
        </div>
      )}

      {/* BARCODE SCANNER VIEW */}
      {mode === "barcode" && !barcodeResult && (
        <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Scan barcode</p>
              <p className="text-xs text-muted-foreground">
                Hold steady. We’ll auto-detect and fetch nutrition.
              </p>
            </div>
            <button
              onClick={handleResetAll}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          <div className="rounded-xl overflow-hidden border border-border/60 bg-black">
            <video
              ref={videoRef}
              className="w-full h-48 object-cover"
              muted
              playsInline
              autoPlay
            />
          </div>

          {/* Manual entry fallback */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Keyboard className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                inputMode="numeric"
                placeholder="Enter barcode"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <button
              onClick={submitManualBarcode}
              disabled={!manualBarcode.trim() || barcodeLoading}
              className={cn(
                "px-4 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:opacity-95 transition",
                (!manualBarcode.trim() || barcodeLoading) && "opacity-50 cursor-not-allowed"
              )}
            >
              Lookup
            </button>
          </div>

          {barcodeError && (
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-sm text-red-600">{barcodeError}</p>
              <p className="text-xs text-red-500 mt-1">
                Try manual entry or switch to photo scan.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Preview Image (photo OR product image) */}
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

              {/* confidence pill */}
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

            {Array.isArray((activeResult as any).items) && (activeResult as any).items.length > 1 && (
              <div className="space-y-1 pt-1">
                <p className="text-xs font-medium text-muted-foreground">Breakdown</p>
                {(activeResult as any).items.map((item: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs text-muted-foreground"
                  >
                    <span className="truncate">
                      {item.name} ({item.portionSize})
                    </span>
                    <span className="tabular-nums">{safeNum(item.calories)} cal</span>
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