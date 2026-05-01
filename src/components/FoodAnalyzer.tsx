import { useEffect, useMemo, useState } from "react";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";
import { useMacroPalette } from "@/hooks/useMacroPalette";
import { cn } from "@/lib/utils";
import { Loader2, RotateCcw, Save, Check, Plus, Minus, Download, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { doc, setDoc, Timestamp, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { haptic } from "@/lib/haptic";
import { isPhotoShareSupported, sharePhotoToLibrary } from "@/lib/sharePhoto";
import FoodCameraModal from "./FoodCameraModal";

interface Props {
  date: string;
  meal?: string | null;
  onSaved?: () => void;
  /**
   * Fired when the user hits the camera permission-denied fallback and
   * taps "Type it instead". Parent page typically closes the analyzer
   * and focuses the NL text composer.
   */
  onRequestTypedInput?: () => void;
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

export default function FoodAnalyzer({ date, meal: targetMealCategory, onSaved, onRequestTypedInput }: Props) {
  const { user } = useAuth();
  const { addFavourite } = useFoodFavourites();
  const { accent, text: macroText } = useMacroPalette();

  const {
    analyzeFood,
    loading: aiLoading,
    error: aiError,
    result: aiResult,
    reset: resetAI,
  } = useFoodAnalysis();

  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);

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

  /* ── Per-item edit state (PR N) ───────────────────────────────────────
     AI photo / text-parse results often need correction before save —
     e.g. the model detected a side dish that wasn't actually on the
     plate, or got the portion size wrong on one item. Without the
     ability to fix it inline, the user's only option was Reset → re-
     scan, or Save and live with bad data.

     `itemEdits` is a sparse map keyed by the item's index in
     `activeResult.items`. Missing entries default to {multiplier: 1,
     removed: false} — i.e. the item passes through untouched. The
     state is reset whenever `activeResult` changes (a new analysis
     comes back) so edits don't bleed between scans. */
  type ItemEdit = { multiplier: number; removed: boolean };
  const [itemEdits, setItemEdits] = useState<Record<number, ItemEdit>>({});

  useEffect(() => {
    setItemEdits({});
  }, [activeResult]);

  /* The per-item editor only renders for multi-item AI / text results.
     - Barcode results are by definition single-item; their existing
       global servings stepper is the right control there.
     - Single-item AI results would mean only one row to edit, and the
       global totals are already the per-item totals — adding an editor
       would be redundant chrome. */
  const isMultiItem = !!activeResult && activeResult.items.length > 1 && !isBarcode;

  /* Derived: each item annotated with its current multiplier + removed
     flag. The base item is preserved untouched so `saveMeal` can
     reconstruct the persisted shape from the original + edits. */
  type EditedItem = MealResult["items"][number] & {
    multiplier: number;
    removed: boolean;
    index: number;
  };
  const editedItems = useMemo<EditedItem[]>(() => {
    if (!activeResult) return [];
    return activeResult.items.map((item, i) => ({
      ...item,
      multiplier: itemEdits[i]?.multiplier ?? 1,
      removed: itemEdits[i]?.removed ?? false,
      index: i,
    }));
  }, [activeResult, itemEdits]);

  const activeItems = useMemo(
    () => editedItems.filter((it) => !it.removed),
    [editedItems],
  );

  /* When the user has removed every item, saving a 0-calorie meal is
     never what they want — disable Save and show a small recovery
     prompt below the totals. They can either restore a row or reset
     the whole analysis. */
  const allRemoved = isMultiItem && activeItems.length === 0;

  /* Display totals.
     - Multi-item AI: sum of (item × per-item multiplier) over active items.
     - Single-item AI: pass-through totals × 1 (current behaviour).
     - Barcode: pass-through totals × global servings (current behaviour).
     The single source of truth for what's rendered AND what's saved. */
  const displayTotals = useMemo(() => {
    if (!activeResult) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    if (isMultiItem) {
      return activeItems.reduce(
        (sum, item) => ({
          calories: sum.calories + safeNum(item.calories) * item.multiplier,
          protein: sum.protein + safeNum(item.protein) * item.multiplier,
          carbs: sum.carbs + safeNum(item.carbs) * item.multiplier,
          fat: sum.fat + safeNum(item.fat) * item.multiplier,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      );
    }
    const factor = isBarcode ? servings : 1;
    return {
      calories: safeNum(activeResult.totalCalories) * factor,
      protein: safeNum(activeResult.totalProtein) * factor,
      carbs: safeNum(activeResult.totalCarbs) * factor,
      fat: safeNum(activeResult.totalFat) * factor,
    };
  }, [activeResult, activeItems, isMultiItem, isBarcode, servings]);

  const setItemMultiplier = (i: number, next: number) => {
    setItemEdits((prev) => ({
      ...prev,
      [i]: {
        multiplier: Math.max(0.5, Math.min(4, Math.round(next * 2) / 2)),
        removed: prev[i]?.removed ?? false,
      },
    }));
  };

  const removeItem = (i: number) => {
    haptic("light");
    setItemEdits((prev) => ({
      ...prev,
      [i]: { multiplier: prev[i]?.multiplier ?? 1, removed: true },
    }));
  };

  const restoreItem = (i: number) => {
    haptic("light");
    setItemEdits((prev) => ({
      ...prev,
      [i]: { multiplier: prev[i]?.multiplier ?? 1, removed: false },
    }));
  };

  // Hero photo shown at the top of the result card. Prefer the user's own
  // captured photo (AI food scan); fall back to the product image pulled
  // from OpenFoodFacts for barcode results. Null means no hero band.
  const heroImageSrc = useMemo(() => {
    if (capturedBase64) return `data:image/jpeg;base64,${capturedBase64}`;
    if (activeResult?.imageUrl) return activeResult.imageUrl;
    return null;
  }, [capturedBase64, activeResult?.imageUrl]);

  const showLoading = aiLoading || barcodeLoading;
  const showError = aiError || barcodeError;

  const handleResetAll = () => {
    setBarcodeResult(null);
    setBarcodeError(null);
    setBarcodeLoading(false);
    setCapturedBase64(null);
    setServings(1);
    resetAI();
  };

  const saveMeal = async (meal: MealResult) => {
    if (!user) return;
    setSaving(true);

    /* For barcode + single-item AI we keep the original "scale by global
       servings stepper" behaviour. For multi-item AI we use the per-item
       multiplier edits and skip removed items entirely. The two paths
       converge on the same persisted shape. */
    const s = isBarcode ? servings : 1;

    const persistedItems = isMultiItem
      ? activeItems.map((item) => ({
          name: item.name,
          /* Annotate the portionSize with the multiplier when it isn't
             1× so the saved entry reads accurately in the diary
             ("1.5x 1 cup pasta"). Mirrors the existing barcode treatment. */
          portionSize:
            item.multiplier !== 1
              ? `${item.multiplier}x ${item.portionSize}`
              : item.portionSize,
          calories: Math.round(safeNum(item.calories) * item.multiplier),
          protein: Math.round(safeNum(item.protein) * item.multiplier),
          carbs: Math.round(safeNum(item.carbs) * item.multiplier),
          fat: Math.round(safeNum(item.fat) * item.multiplier),
        }))
      : meal.items.map((item) => ({
          ...item,
          portionSize: s !== 1 ? `${s}x ${item.portionSize}` : item.portionSize,
          calories: Math.round(item.calories * s),
          protein: Math.round(item.protein * s),
          carbs: Math.round(item.carbs * s),
          fat: Math.round(item.fat * s),
        }));

    const mealRef = doc(collection(db, "users", user.uid, "meals"));
    await setDoc(mealRef, {
      date,
      foodName: meal.foodName,
      items: persistedItems,
      totalCalories: Math.round(displayTotals.calories),
      totalProtein: Math.round(displayTotals.protein),
      totalCarbs: Math.round(displayTotals.carbs),
      totalFat: Math.round(displayTotals.fat),
      confidence: meal.confidence,
      barcode: meal.barcode || null,
      brand: meal.brand || null,
      imageUrl: meal.imageUrl || null,
      createdAt: Timestamp.now(),
      ...(targetMealCategory ? { meal: targetMealCategory } : {}),
    });

    // Preserve favourites functionality — favourite reflects the
    // edited totals, not the original AI estimate, so a re-log via
    // the favourite chip lands on the same numbers the user saved.
    await addFavourite({
      name: meal.foodName,
      calories: Math.round(displayTotals.calories),
      protein: Math.round(displayTotals.protein),
      carbs: Math.round(displayTotals.carbs),
      fat: Math.round(displayTotals.fat),
      servingSize: persistedItems[0]?.portionSize ?? "1 serving",
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

  // Matches FoodCameraModal: (base64, mode). `mode` previously gated
  // the capture toast wording; now no toast fires (UI transitions
  // straight to the analysis result), so the parameter is unused.
  //
  // Camera auto-closes on success so the user lands on the result card.
  // On error we keep it open so a retry is a single shutter tap away.
  const onCaptureBase64 = async (base64: string, _mode: "food" | "label") => {
    setBarcodeResult(null);
    setBarcodeError(null);
    setCapturedBase64(base64);

    try {
      await analyzeFood(base64);
      setCameraOpen(false);
    } catch (e) {
      logger.error(e);
      toast.error("Food analysis failed.");
    }
  };

  // Save captured photo to the user's camera roll via the Web Share API.
  // Guards against empty base64 in case the button is tapped before capture
  // completes (e.g. rapid double-tap, race with analysis).
  const handleSavePhoto = async () => {
    if (!capturedBase64) return;
    haptic("light");
    const success = await sharePhotoToLibrary(capturedBase64);
    if (success) {
      toast.success("Photo saved");
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
      setCameraOpen(false);
      toast.success("Barcode found!");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Barcode lookup failed.";
      setBarcodeError(msg);
      toast.error(msg);
    } finally {
      setBarcodeLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <FoodCameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptureBase64={onCaptureBase64}
        onBarcodeDetected={onBarcodeDetected}
        loading={showLoading}
        onRequestTypedInput={onRequestTypedInput ? () => {
          setCameraOpen(false);
          onRequestTypedInput();
        } : undefined}
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
            <div className="bg-card rounded-2xl overflow-hidden">
              {/* Hero photo — user's captured image for AI scan, OpenFoodFacts
                  product shot for barcode. The confidence label is dropped
                  from the header (it read as a portion size next to "Rice");
                  only low-confidence results surface a warning badge. */}
              {heroImageSrc && (
                <div className="relative aspect-[5/3] bg-muted">
                  <img
                    src={heroImageSrc}
                    alt={activeResult.foodName}
                    className="w-full h-full object-cover"
                  />
                  {activeResult.confidence === "low" && (
                    <div className="absolute top-3 right-3">
                      <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-black/60 text-white backdrop-blur-sm">
                        Low confidence — double-check
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="p-4 space-y-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-foreground truncate">
                    {activeResult.foodName}
                  </h3>
                  {activeResult.brand && (
                    <p className="text-xs text-muted-foreground truncate">
                      {activeResult.brand}
                    </p>
                  )}
                </div>

                {/* Per-item breakdown — editable for multi-item AI results
                    (PR N), read-only for single-item or barcode. The
                    edit affordances let the user remove a wrongly-detected
                    item and bump per-item portions before save without
                    rescanning. */}
                {activeResult.items.length > 1 && (
                  <div className="space-y-1.5 border-t border-border/40 pt-2.5">
                    {editedItems.map((item) => {
                      const i = item.index;
                      const itemCal = Math.round(safeNum(item.calories) * item.multiplier);
                      if (item.removed) {
                        return (
                          <div
                            key={`${item.name}-${i}-removed`}
                            className="flex items-center justify-between gap-2 py-1"
                          >
                            <p className="text-sm text-muted-foreground/60 line-through truncate flex-1">
                              {item.name}
                            </p>
                            <button
                              type="button"
                              onClick={() => restoreItem(i)}
                              aria-label={`Restore ${item.name}`}
                              className="flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80 transition-opacity active:scale-95 shrink-0"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Restore
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={`${item.name}-${i}`}
                          className="flex items-center gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {item.portionSize}
                            </p>
                          </div>
                          {isMultiItem && (
                            <div className="flex items-center gap-1 shrink-0" aria-label={`${item.name} portion`}>
                              <button
                                type="button"
                                onClick={() => setItemMultiplier(i, item.multiplier - 0.5)}
                                aria-label={`Decrease ${item.name} portion`}
                                disabled={item.multiplier <= 0.5}
                                className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/70 disabled:opacity-40 active:scale-90 transition-transform"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs font-mono tabular-nums text-foreground w-9 text-center">
                                {item.multiplier}×
                              </span>
                              <button
                                type="button"
                                onClick={() => setItemMultiplier(i, item.multiplier + 0.5)}
                                aria-label={`Increase ${item.name} portion`}
                                disabled={item.multiplier >= 4}
                                className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/70 disabled:opacity-40 active:scale-90 transition-transform"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0 w-14 text-right">
                            {itemCal} cal
                          </span>
                          {isMultiItem && (
                            <button
                              type="button"
                              onClick={() => removeItem(i)}
                              aria-label={`Remove ${item.name}`}
                              className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10 active:scale-90 transition-all shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* "All items removed" recovery prompt. Only shown for
                    multi-item AI results when every row has been removed —
                    saving a 0-calorie meal is never the user's intent. */}
                {allRemoved && (
                  <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground text-center">
                    All items removed. Restore one above or Reset to scan again.
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg p-2" style={{ backgroundColor: `${accent.nutrition}1A` }}>
                    <p className="text-lg font-bold tabular-nums" style={{ color: macroText.nutrition }}>
                      {Math.round(displayTotals.calories)}
                    </p>
                    <p className="text-xs" style={{ color: macroText.nutrition }}>cal</p>
                  </div>
                  <div className="rounded-lg p-2" style={{ backgroundColor: `${accent.protein}1A` }}>
                    <p className="text-lg font-bold tabular-nums" style={{ color: macroText.protein }}>
                      {Math.round(displayTotals.protein)}g
                    </p>
                    <p className="text-xs" style={{ color: macroText.protein }}>protein</p>
                  </div>
                  <div className="rounded-lg p-2" style={{ backgroundColor: `${accent.carbs}1A` }}>
                    <p className="text-lg font-bold tabular-nums" style={{ color: macroText.carbs }}>
                      {Math.round(displayTotals.carbs)}g
                    </p>
                    <p className="text-xs" style={{ color: macroText.carbs }}>carbs</p>
                  </div>
                  <div className="rounded-lg p-2" style={{ backgroundColor: `${accent.fat}1A` }}>
                    <p className="text-lg font-bold tabular-nums" style={{ color: macroText.fat }}>
                      {Math.round(displayTotals.fat)}g
                    </p>
                    <p className="text-xs" style={{ color: macroText.fat }}>fat</p>
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
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleResetAll}
                aria-label="Reset food analysis"
                className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Reset
              </button>

              {/* Save photo to camera roll via Web Share API. Hidden on
                  platforms that don't support navigator.share with files
                  (Android < 12, desktop browsers). The support check is a
                  module-level cached constant — no per-mount cost. */}
              {isPhotoShareSupported() && capturedBase64 && (
                <button
                  onClick={handleSavePhoto}
                  aria-label="Save photo to Photos library"
                  className="py-3 px-4 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Save photo
                </button>
              )}

              <button
                onClick={handleSave}
                /* Disabled when:
                   - already saving (prevents double-tap)
                   - all items removed (would persist a 0-calorie meal —
                     never the user's intent; the recovery prompt above
                     points them at Restore or Reset). */
                disabled={saving || allRemoved}
                className={cn(
                  "flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2",
                  saved
                    ? "bg-green-500 text-white"
                    : "bg-primary text-primary-foreground hover:opacity-90",
                  (saving || allRemoved) && "opacity-50 cursor-not-allowed"
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
