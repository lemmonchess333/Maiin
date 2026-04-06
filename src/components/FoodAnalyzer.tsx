import { useEffect, useMemo, useState } from "react";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";
import { cn } from "@/lib/utils";
import { Loader2, RotateCcw, Save, Check, Plus, Minus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { doc, setDoc, Timestamp, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import FoodCameraModal from "./FoodCameraModal";

interface Props {
  date: string;
  meal?: string | null;
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

export default function FoodAnalyzer({ date, meal: targetMealCategory, onSaved }: Props) {
  const { user } = useAuth();
  const { addFavourite } = useFoodFavourites();

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

  const [servings, setServings] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Auto-open camera with 150ms delay to avoid jarring
  useEffect(() => {
    const timer = setTimeout(() => setCameraOpen(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const activeResult: MealResult | null = useMemo(() => {
    return (aiResult as MealResult | null) || barcodeResult;
  }, [aiResult, barcodeResult]);

  const isBarcode = activeResult?.confidence === "barcode";

  const showLoading = aiLoading || barcodeLoading;
  const showError = aiError || barcodeError;

  const handleResetAll = () => {
    setBarcodeResult(null);
    setBarcodeError(null);
    setBarcodeLoading(false);
    setServings(1);
    resetAI();
  };

  const saveMeal = async (meal: MealResult) => {
    if (!user) return;
    setSaving(true);

    const s = isBarcode ? servings : 1;

    const mealRef = doc(collection(db, "users", user.uid, "meals"));
    await setDoc(mealRef, {
      date,
      foodName: meal.foodName,
      items: meal.items.map((item) => ({
        ...item,
        portionSize: s !== 1 ? `${s}x ${item.portionSize}` : item.portionSize,
        calories: Math.round(item.calories * s),
        protein: Math.round(item.protein * s),
        carbs: Math.round(item.carbs * s),
        fat: Math.round(item.fat * s),
      })),
      totalCalories: Math.round(meal.totalCalories * s),
      totalProtein: Math.round(meal.totalProtein * s),
      totalCarbs: Math.round(meal.totalCarbs * s),
      totalFat: Math.round(meal.totalFat * s),
      confidence: meal.confidence,
      barcode: meal.barcode || null,
      brand: meal.brand || null,
      imageUrl: meal.imageUrl || null,
      createdAt: Timestamp.now(),
      ...(targetMealCategory ? { meal: targetMealCategory } : {}),
    });

    // Preserve favourites functionality
    await addFavourite({
      name: meal.foodName,
      calories: Math.round(meal.totalCalories * s),
      protein: Math.round(meal.totalProtein * s),
      carbs: Math.round(meal.totalCarbs * s),
      fat: Math.round(meal.totalFat * s),
      servingSize: meal.items[0]?.portionSize ?? "1 serving",
      source: meal.barcode ? "barcode" : "photo",
    });

    localStorage.setItem("tropos_ever_scanned", "1");

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
      foodName: activeResult.foodName ?? "Meal",
      items: activeResult.items ?? [],
      totalCalories: safeNum(activeResult.totalCalories),
      totalProtein: safeNum(activeResult.totalProtein),
      totalCarbs: safeNum(activeResult.totalCarbs),
      totalFat: safeNum(activeResult.totalFat),
      confidence: activeResult.confidence ?? "low",
      barcode: activeResult.barcode,
      brand: activeResult.brand,
      imageUrl: activeResult.imageUrl,
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
      logger.error(e);
      toast.error("Food analysis failed.");
    }
  };

  const onBarcodeDetected = async (raw: string) => {
    const code = raw.replace(/\s+/g, "");
    setBarcodeLoading(true);
    setBarcodeError(null);
    setBarcodeResult(null);
    setServings(1);

    try {
      const meal = await fetchOpenFoodFacts(code);
      setBarcodeResult(meal);
      toast.success("Barcode found!");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Barcode lookup failed.";
      setBarcodeError(msg);
      toast.error(msg);
    } finally {
      setBarcodeLoading(false);
    }
  };

  const s = isBarcode ? servings : 1;

  return (
    <div className="space-y-4">
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
          <p className="text-sm text-red-600">Couldn't identify food. Try manual entry.</p>
          <div className="flex gap-3">
            <button
              onClick={handleResetAll}
              aria-label="Try food analysis again"
              className="text-sm text-red-500 font-medium flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Try again
            </button>
            <button
              onClick={() => { handleResetAll(); setCameraOpen(false); }}
              className="text-sm text-primary font-medium"
            >
              Switch to manual entry
            </button>
          </div>
        </div>
      )}

      {/* AnimatePresence enter-only: no exit animation keeps it snappy */}
      <AnimatePresence>
        {activeResult && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="bg-card rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground truncate">
                    {activeResult.foodName}
                  </h3>
                  {activeResult.brand && (
                    <p className="text-xs text-muted-foreground truncate">
                      {activeResult.brand}
                    </p>
                  )}
                </div>

                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-foreground">
                  {activeResult.confidence}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-2">
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                    {Math.round(safeNum(activeResult.totalCalories) * s)}
                  </p>
                  <p className="text-xs text-orange-500 dark:text-orange-400/70">cal</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-2">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                    {Math.round(safeNum(activeResult.totalProtein) * s)}g
                  </p>
                  <p className="text-xs text-blue-500 dark:text-blue-400/70">protein</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2">
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                    {Math.round(safeNum(activeResult.totalCarbs) * s)}g
                  </p>
                  <p className="text-xs text-amber-500 dark:text-amber-400/70">carbs</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg p-2">
                  <p className="text-lg font-bold text-purple-600 dark:text-purple-400 tabular-nums">
                    {Math.round(safeNum(activeResult.totalFat) * s)}g
                  </p>
                  <p className="text-xs text-purple-500 dark:text-purple-400/70">fat</p>
                </div>
              </div>

              {/* Serving size adjuster — shown for barcode results */}
              {isBarcode && (
                <div className="flex items-center justify-center gap-4 pt-1">
                  <button
                    onClick={() => setServings(Math.max(0.5, servings - 0.5))}
                    aria-label="Decrease servings"
                    className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{servings}</p>
                    <p className="text-xs text-muted-foreground">servings</p>
                  </div>
                  <button
                    onClick={() => setServings(servings + 0.5)}
                    aria-label="Increase servings"
                    className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleResetAll}
                aria-label="Reset food analysis"
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
