import { useEffect, useMemo, useState } from "react";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";
import { cn } from "@/lib/utils";
import { RotateCcw, Save, Check, Plus, Minus, Download, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { doc, setDoc, Timestamp, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { safeNum, parseServingGrams, round1 } from "@/lib/foodParseHelpers";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { haptic } from "@/lib/haptic";
import { isPhotoShareSupported, sharePhotoToLibrary } from "@/lib/sharePhoto";
import FoodCameraModal from "./FoodCameraModal";
import MealMacroBar from "./food/MealMacroBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import {
  validateFoodEntry,
  checkAggregateAgainstTarget,
} from "@/lib/foodValidation";
import { filterIdentifiableAiItems } from "@/lib/aiFoodIdentification";
import { buildFoodNameFromItems } from "@/lib/foodNameBuilder";

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
  /* Fired from the AI photo failure toast's action button. The
     camera modal stays open on AI errors (so a retry is a single
     shutter tap away — original product intent), which means the
     user can't see Food.tsx's Log manually CTA from inside the
     scanner. The action button bridges that gap: closes the
     scanner + opens the manual logger drawer. Optional — when not
     provided the toast renders without an action button. */
  onRequestManualLog?: () => void;
  /* Effective daily calorie target — already includes day-type
     fuel adjustments (effectiveBonus = max(strategicBonus,
     actualBurn)). Drives the aggregate-vs-target sanity check
     in saveMeal so a 5,700 cal AI scan on a 2,200 cal target
     opens a "review items" prompt before persisting. Optional —
     when omitted the aggregate check is skipped (parent still
     loading targets, or caller doesn't want the gate). */
  effectiveDailyTarget?: number;
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

/* safeNum / parseServingGrams / round1 extracted to
   `@/lib/foodParseHelpers` so they can be tested in isolation. */

async function fetchOpenFoodFacts(barcode: string): Promise<MealResult> {
  const url =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
    `?fields=product_name,brands,nutriments,serving_size,image_url`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't look up barcode. Try again.");
  const data = await res.json();

  if (!data || data.status !== 1 || !data.product) {
    /* Throw message becomes the toast body when caught at the
       call site (line 433 toast.error(msg)). Direct the user to
       the manual fallback rather than a dead-end. */
    throw new Error("Barcode not found. Log it manually instead.");
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

export default function FoodAnalyzer({
  date,
  meal: targetMealCategory,
  onSaved,
  onRequestTypedInput,
  onRequestManualLog,
  effectiveDailyTarget,
}: Props) {
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
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);

  const [barcodeResult, setBarcodeResult] = useState<MealResult | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  const [servings, setServings] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  /* Suspicious-value confirm state. Only fires for AI photo
     results (barcode skips validation). */
  const [warnTitle, setWarnTitle] = useState<string | null>(null);
  const [warnDescription, setWarnDescription] = useState<string>("");
  /* Per-trigger Cancel label so the per-entry warn (where the
     user adjusts an obviously-wrong macro field) reads "Edit"
     while the aggregate-vs-target warn (where the user reviews
     AI-detected items in the editor) reads "Review items".
     Defaults to "Edit" — matches the F1 wording. */
  const [warnCancelLabel, setWarnCancelLabel] = useState<string>("Edit");
  const [pendingSave, setPendingSave] = useState<(() => Promise<void>) | null>(
    null
  );

  // Auto-open camera with 150ms delay to avoid jarring
  useEffect(() => {
    const timer = setTimeout(() => setCameraOpen(true), 150);
    return () => clearTimeout(timer);
  }, []);

  /* Filter generic / unidentifiable AI items out of the result
     before it reaches the editor or save flow. The AI photo path
     can return a "Unidentifiable" item — sometimes with zero
     macros, sometimes with a stray hallucinated 2-cal value —
     and the editor would otherwise let the user save it as a
     diary entry. The reliable signal is the NAME, not the
     macros (real zero-cal foods like Water and Black coffee
     must remain savable). When all items in the AI result are
     generic, we set cleanedAiResult to null and surface the
     empty-result state below. Barcode results are not filtered:
     they go through OFF data with user-confirmed product names. */
  const cleanedAiResult: MealResult | null = useMemo(() => {
    if (!aiResult) return null;
    const items = filterIdentifiableAiItems((aiResult as MealResult).items);
    if (items.length === 0) return null;
    return { ...(aiResult as MealResult), items };
  }, [aiResult]);

  /* True when the AI completed but every item it returned was
     generic / unidentifiable. Drives the empty-result render
     branch below. Distinct from `showError` (which fires on AI
     network failure) — here the AI succeeded but produced
     nothing usable. */
  const aiResultIsEmpty = aiResult !== null && cleanedAiResult === null;

  const activeResult: MealResult | null = useMemo(() => {
    return cleanedAiResult || barcodeResult;
  }, [cleanedAiResult, barcodeResult]);

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
  const isMultiItem =
    !!activeResult && activeResult.items.length > 1 && !isBarcode;

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
    [editedItems]
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
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
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

  const performSave = async (meal: MealResult) => {
    if (!user) return;
    setSaving(true);
    try {
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
            portionSize:
              s !== 1 ? `${s}x ${item.portionSize}` : item.portionSize,
            calories: Math.round(item.calories * s),
            protein: Math.round(item.protein * s),
            carbs: Math.round(item.carbs * s),
            fat: Math.round(item.fat * s),
          }));

      /* Diary row name derived from items, not from the AI's
       generated container title. F4 audit found that the model
       (Gemini 2.0 Flash) interprets the prompt's "name of the
       food/meal" as a category label and returns titles like
       "Breakfast Ingredients" or "Lunch Plate" — which then
       surfaced in the diary row even though the actual
       identified items (Granola, Blueberries, Hummus) were
       correctly stored in `items`. The NL parse path already
       built the foodName from items via
       `items.map(i => i.name).join(", ")`; aligning the AI
       scan persistence with the same shape (smart "+N" form
       borrowed from Quick Add to avoid 200-char rows on
       multi-item scans). Barcode results pass an explicit
       fallback so single-product entries keep their product
       name when items happen to be empty. */
      const derivedFoodName = isBarcode
        ? meal.foodName
        : buildFoodNameFromItems(persistedItems, meal.foodName);

      const mealRef = doc(collection(db, "users", user.uid, "meals"));
      await setDoc(mealRef, {
        date,
        foodName: derivedFoodName,
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
      /* Favourite uses the same derived name as the diary row so
       re-logging via the Quick Add chip lands on the same label
       the user saw in the diary — pre-F5.1 the favourite carried
       the AI's container title ("Breakfast Ingredients") while
       the diary now reads correctly, which would have been a
       confusing inconsistency. */
      await addFavourite({
        name: derivedFoodName,
        calories: Math.round(displayTotals.calories),
        protein: Math.round(displayTotals.protein),
        carbs: Math.round(displayTotals.carbs),
        fat: Math.round(displayTotals.fat),
        servingSize: persistedItems[0]?.portionSize ?? "1 serving",
        source: meal.barcode ? "barcode" : "photo",
      });

      try {
        localStorage.setItem("tropos_ever_scanned", "1");
      } catch {
        // Safari private mode — non-essential flag, swallow.
      }

      setSaving(false);
      setSaved(true);

      setTimeout(() => {
        setSaved(false);
        handleResetAll();
        setCameraOpen(false);
        onSaved?.();
      }, 1200);
    } catch (err) {
      // Catch every throw on the save path — pre-fix any error
      // (offline setDoc, addFavourite quota, localStorage in
      // private mode) left `saving=true` forever with no toast,
      // making the save button stuck and the camera modal unable
      // to close. Toast + reset so the user gets feedback and can
      // retry.
      setSaving(false);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Couldn't save — please try again.";
      toast.error(message);
    }
  };

  /* Suspicious-value gate. AI photo + multi-item AI are user-input
     boundaries (the user is committing AI-estimated numbers as
     theirs). Barcode reuses already-validated OFF data — skip.
     Two layered checks for non-barcode results:

       1. Aggregate-vs-target sanity (target-relative). Catches
          AI scans summing to >150% of the user's effective daily
          calorie target — almost always a hallucination or a
          misidentified recipe batch. Surfaces first because the
          contextual copy ("over a full day's target") is more
          useful than the absolute-threshold copy.

       2. Per-entry suspicious-value validation (absolute floor).
          Catches typos / outright invalid values regardless of
          target — negative/NaN are blocked outright; >5000 cal /
          >300g protein / etc surface a Save anyway prompt.

     Save anyway on the aggregate prompt skips re-prompting on the
     per-entry threshold — the user has already acknowledged the
     high total once. */
  const saveMeal = async (meal: MealResult) => {
    if (meal.confidence !== "barcode") {
      const aggregateVerdict = checkAggregateAgainstTarget(
        displayTotals.calories,
        effectiveDailyTarget
      );
      if (aggregateVerdict) {
        setWarnTitle(aggregateVerdict.title);
        setWarnDescription(aggregateVerdict.description);
        setWarnCancelLabel("Review items");
        setPendingSave(() => () => performSave(meal));
        return;
      }

      const verdict = validateFoodEntry({
        calories: Math.round(displayTotals.calories),
        protein: Math.round(displayTotals.protein),
        carbs: Math.round(displayTotals.carbs),
        fat: Math.round(displayTotals.fat),
      });
      if (verdict.kind === "blocked") {
        toast.error(verdict.reason, { id: "food-validation-error" });
        return;
      }
      if (verdict.kind === "warn") {
        setWarnTitle(verdict.title);
        setWarnDescription(verdict.description);
        setWarnCancelLabel("Edit");
        setPendingSave(() => () => performSave(meal));
        return;
      }
    }
    await performSave(meal);
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
      /* Camera modal stays open on AI failure (per the original
         "retry is a single shutter tap away" intent), which means
         the user can't see Food.tsx's Log manually CTA. The toast
         action bridges that — closes the scanner and opens the
         manual logger so the user has a clear next action that
         doesn't require finding their way back to the page. */
      toast.error("Couldn't analyse the photo. Try again or log manually.", {
        id: "food-ai-error",
        ...(onRequestManualLog
          ? {
              action: {
                label: "Log manually",
                onClick: () => {
                  setCameraOpen(false);
                  onRequestManualLog();
                },
              },
            }
          : {}),
      });
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
        onRequestTypedInput={
          onRequestTypedInput
            ? () => {
                setCameraOpen(false);
                onRequestTypedInput();
              }
            : undefined
        }
      />

      {showLoading && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Spinner
            size="sm"
            variant="muted"
            label={barcodeLoading ? "Fetching nutrition" : "Analyzing food"}
          />
          {barcodeLoading ? "Fetching nutrition..." : "Analyzing..."}
        </div>
      )}

      {showError && !activeResult && (
        <div className="bg-red-50 rounded-xl p-4 space-y-2">
          <p className="text-sm text-red-600">
            Couldn't identify food. Try manual entry.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleResetAll}
              aria-label="Try food analysis again"
              className="text-sm text-red-500 font-medium flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Try again
            </button>
            <button
              onClick={() => {
                handleResetAll();
                setCameraOpen(false);
              }}
              className="text-sm text-primary font-medium"
            >
              Switch to manual entry
            </button>
          </div>
        </div>
      )}

      {/* Empty-result state. AI succeeded but returned only
          generic / unidentifiable items ("Unidentifiable",
          "Unknown food", or hallucinated stray macros on a
          generic name). The editor + Save UI is intentionally
          suppressed in favour of an explicit "Couldn't identify
          food" copy with two recovery actions. The low-confidence
          banner from F2 does NOT render above this state — the
          empty state replaces it because there's nothing useful
          to review. */}
      {aiResultIsEmpty && !showError && !showLoading && (
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              Couldn't identify food
            </p>
            <p className="text-sm text-muted-foreground">
              Try another photo, or log it manually.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                handleResetAll();
                setCameraOpen(true);
              }}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white active:scale-95 transition-transform flex items-center justify-center gap-1.5"
              style={{ backgroundColor: "#7C6BF0" }}
            >
              <RotateCcw className="w-4 h-4" /> Try again
            </button>
            <button
              type="button"
              onClick={() => {
                /* Mirrors the AI failure → manual fallback wired
                   in F1's followup. Resets analyzer state, closes
                   the camera, hands off to the parent's manual
                   logger (which preserves selectedDate +
                   targetMeal from the Food page state). */
                handleResetAll();
                setCameraOpen(false);
                onRequestManualLog?.();
              }}
              className="flex-1 py-3 rounded-xl text-sm font-medium text-foreground bg-muted active:scale-95 transition-transform border border-border"
            >
              Log manually
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
            {/* Low-confidence pre-save banner. Renders ABOVE the
                review card and sticks to the top of the modal
                content area while the per-item list scrolls,
                so the user keeps seeing the warning while
                editing. Replaces the older corner pill on the
                hero image (too easy to miss next to the food
                title). Save stays enabled — banner informs,
                doesn't block. */}
            {activeResult.confidence === "low" && (
              <div
                className="sticky top-0 z-10 -mx-1 px-3 py-2.5 rounded-xl border flex items-start gap-2"
                style={{
                  background: "rgba(229,154,11,0.10)",
                  borderColor: "rgba(229,154,11,0.30)",
                  color: "#a26a05",
                }}
                role="status"
              >
                <span aria-hidden="true">⚠</span>
                <div className="text-xs leading-relaxed">
                  <span className="font-semibold">
                    AI estimate — review carefully.
                  </span>
                  <span className="ml-1 opacity-80">
                    Some items may need correcting before you save.
                  </span>
                </div>
              </div>
            )}
            <div className="bg-card rounded-2xl overflow-hidden">
              {/* Hero photo — user's captured image for AI scan, OpenFoodFacts
                  product shot for barcode. Low-confidence warning has
                  moved to the sticky banner above, so the hero stays
                  clean. */}
              {heroImageSrc && (
                <div className="relative aspect-[5/3] bg-muted">
                  <img
                    src={heroImageSrc}
                    alt={activeResult.foodName}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="p-4 space-y-3">
                {/* Title block.
                    - Barcode results carry a clean product name like
                      "Big Mac" — keep it as the prominent title.
                    - AI photo / text results return a verbose
                      auto-generated label (e.g. "Plate with Fish,
                      Fries, Salad, and Roasted vegetables") that
                      truncates awkwardly and reads as machine-written.
                      Use a stable header instead, with the AI's
                      label demoted to a muted subtitle so the user
                      still sees what the model thought it saw.
                    Trust copy: a one-line "AI estimate — adjust
                    before logging" cue under non-barcode titles
                    sets the expectation that the result is a draft
                    the user is meant to correct, not a final answer. */}
                <div className="min-w-0">
                  {isBarcode ? (
                    <>
                      <h3 className="text-base font-semibold text-foreground truncate">
                        {activeResult.foodName}
                      </h3>
                      {activeResult.brand && (
                        <p className="text-xs text-muted-foreground truncate">
                          {activeResult.brand}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <h3 className="text-base font-semibold text-foreground">
                        Scanned meal
                      </h3>
                      {activeResult.foodName && (
                        <p className="text-xs text-muted-foreground line-clamp-1 italic">
                          {activeResult.foodName}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground/70 mt-1">
                        AI estimate — adjust portions before logging.
                      </p>
                    </>
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
                      const itemCal = Math.round(
                        safeNum(item.calories) * item.multiplier
                      );
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
                            <p className="text-sm text-foreground truncate">
                              {item.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {item.portionSize}
                            </p>
                          </div>
                          {isMultiItem && (
                            <div
                              className="flex items-center gap-1 shrink-0"
                              aria-label={`${item.name} portion`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setItemMultiplier(i, item.multiplier - 0.5)
                                }
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
                                onClick={() =>
                                  setItemMultiplier(i, item.multiplier + 0.5)
                                }
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

                {/* Unified macro summary.
                    Replaces an older four-box pastel grid (cal / protein
                    / carbs / fat each in its own coloured tile) that
                    looked stylistically detached from the rest of the
                    Food page. The new layout matches the design
                    language used elsewhere — mono numerals + sans
                    units, single neutral surface, and a thin three-
                    segment MealMacroBar carrying the P/C/F proportional
                    read instead of separate coloured chips. The
                    underlying values are the same `displayTotals`
                    consumed elsewhere. */}
                <div className="rounded-xl bg-muted/30 p-3 space-y-2">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <p className="text-foreground">
                      <span className="text-xl font-extrabold font-mono tabular-nums">
                        {Math.round(displayTotals.calories)}
                      </span>
                      <span className="text-sm text-muted-foreground font-normal ml-1">
                        cal
                      </span>
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      <span className="font-mono tabular-nums text-foreground/80">
                        {Math.round(displayTotals.protein)}
                      </span>
                      g protein
                      {" · "}
                      <span className="font-mono tabular-nums text-foreground/80">
                        {Math.round(displayTotals.carbs)}
                      </span>
                      g carbs
                      {" · "}
                      <span className="font-mono tabular-nums text-foreground/80">
                        {Math.round(displayTotals.fat)}
                      </span>
                      g fat
                    </p>
                  </div>
                  <MealMacroBar
                    totalProtein={displayTotals.protein}
                    totalCarbs={displayTotals.carbs}
                    totalFat={displayTotals.fat}
                  />
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
                      <p className="text-2xl font-bold text-foreground">
                        {servings}
                      </p>
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

            {/* Action row.
                Previously three equal-weight bordered buttons (Reset /
                Save photo / Log meal). Only Log meal is the primary
                action; flat-equal weight underplayed it. New hierarchy:
                  - Reset → small ghost text button (left)
                  - Save photo → icon-only secondary (when supported)
                  - Log meal → flex-1 primary fill (dominant)
                Behaviour unchanged; this is purely visual reweighting. */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetAll}
                aria-label="Reset food analysis"
                className="px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors active:scale-95"
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
                  className="w-11 h-11 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center shrink-0 active:scale-95"
                >
                  <Download className="w-4 h-4" />
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
                  "flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 active:scale-[0.98]",
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
      {/* Suspicious-value override prompt for AI photo saves. The
          pending save is captured at validation time so the
          dialog commits the same totals the user was warned about
          even if state shifts between prompt and confirm. */}
      <ConfirmDialog
        open={warnTitle !== null}
        title={warnTitle ?? ""}
        description={warnDescription}
        confirmLabel="Save anyway"
        cancelLabel={warnCancelLabel}
        onConfirm={async () => {
          const save = pendingSave;
          setWarnTitle(null);
          setPendingSave(null);
          setWarnCancelLabel("Edit");
          if (save) await save();
        }}
        onCancel={() => {
          setWarnTitle(null);
          setPendingSave(null);
          setWarnCancelLabel("Edit");
        }}
      />
    </div>
  );
}
