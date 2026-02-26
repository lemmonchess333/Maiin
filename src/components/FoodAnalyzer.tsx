import { useMemo, useState } from "react";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { cn } from "@/lib/utils";
import { Loader2, RotateCcw, Save, Check } from "lucide-react";
import { doc, setDoc, Timestamp, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import FoodCameraModal from "./FoodCameraModal";

interface Props {
  date: string;
  onSaved?: () => void;
}

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

function safeNum(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function parseServingGrams(servingSize?: string): number | null {
  if (!servingSize) return null;
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

  const {
    analyzeFood,
    loading: aiLoading,
    error: aiError,
    result: aiResult,
    reset: resetAI,
  } = useFoodAnalysis();

  const [cameraOpen, setCameraOpen] = useState(false);

  const [barcodeResult, setBarcodeResult] = useState<MealResult | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const activeResult: MealResult | null = useMemo(() => {
    return (aiResult as any) || barcodeResult;
  }, [aiResult, barcodeResult]);

  const showLoading = aiLoading || barcodeLoading;
  const showError = aiError || barcodeError;

  const handleResetAll = () => {
    setBarcodeResult(null);
    setBarcodeError(null);
    setBarcodeLoading(false);
    resetAI();
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
      setCameraOpen(false);
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

  // Matches FoodCameraModal: (base64, mode)
  const onCaptureBase64 = async (base64: string, mode: "food" | "label") => {
    setBarcodeResult(null);
    setBarcodeError(null);

    try {
      await analyzeFood(base64);
      toast.success(mode === "label" ? "Label captured!" : "Food captured!");
    } catch (e) {
      console.error(e);
      toast.error("Food analysis failed.");
    }
  };

  const onBarcodeDetected = async (raw: string) => {
    const code = raw.replace(/\s+/g, "");
    setBarcodeLoading(true);
    setBarcodeError(null);
    setBarcodeResult(null);

    try {
      const meal = await fetchOpenFoodFacts(code);
      setBarcodeResult(meal);
      toast.success("Barcode found!");
    } catch (e: any) {
      setBarcodeError(e?.message || "Barcode lookup failed.");
      toast.error(e?.message || "Barcode lookup failed.");
    } finally {
      setBarcodeLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Always visible — won't disappear if you cancel camera */}
      <button
        onClick={() => setCameraOpen(true)}
        className="w-full py-4 rounded-xl border-2 border-dashed border-primary/30 text-primary font-medium text-sm hover:bg-primary/5 transition-colors"
      >
        Scan Food
      </button>

      <FoodCameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptureBase64={onCaptureBase64}
        onBarcodeDetected={onBarcodeDetected}
        loading={showLoading}
      />

      {showLoading && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          {barcodeLoading ? "Fetching nutrition..." : "Analyzing..."}
        </div>
      )}

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

              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-foreground">
                {(activeResult as any).confidence}
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
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleResetAll}
              className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Reset
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
