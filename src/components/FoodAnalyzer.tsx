import { useEffect, useMemo, useRef, useState } from "react";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { useCountUp } from "@/hooks/useCountUp";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";
import { THEME } from "@/lib/theme";
import { RotateCcw, Check, Plus, Minus, Download, X } from "lucide-react";
import { motion } from "framer-motion";
import { Drawer } from "vaul";
import { Timestamp } from "firebase/firestore";
import { createMealEntry, notifyMealsLogged } from "@/lib/mealEntry";
import { saveFoodPhoto } from "@/lib/foodPhotoStore";
import { invalidateFoodPhotoCache } from "@/hooks/useFoodPhotoUrls";
import { useUid } from "@/lib/auth";
import { offProductToPortion } from "@/lib/offNutrition";
import { safeNum } from "@/lib/foodParseHelpers";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { isPhotoShareSupported, sharePhotoToLibrary } from "@/lib/sharePhoto";
import FoodCameraModal, {
  type PhotoLock,
  type ScanFailureKind,
  type ScanMode,
} from "./FoodCameraModal";
import MealMacroBar from "./food/MealMacroBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import BottomSheet from "@/components/ui/BottomSheet";
import { MEAL_LABELS } from "./food/mealConstants";
import { mealSlotFor } from "@/lib/mealSlots";
import {
  validateFoodEntry,
  checkAggregateAgainstTarget,
} from "@/lib/foodValidation";
import { filterIdentifiableAiItems } from "@/lib/aiFoodIdentification";
import { buildFoodNameFromItems } from "@/lib/foodNameBuilder";
import { CALORIE_UNIT } from "@/utils/formatNutrition";

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
  /* Fired from the page-level empty-result card's "Log manually"
     action (the landing when the user exits the scanner after a
     failure rather than retaking). Closes the analyzer flow and
     opens the manual logger drawer. Optional. */
  onRequestManualLog?: () => void;
  /* Daily calorie target (Nutr1: flat === baseTarget; no eat-back,
     no calorie bonus — day-type fuelling is a net-neutral macro
     shift). Drives the aggregate-vs-target sanity check
     in saveMeal so a 5,700 cal AI scan on a 2,200 cal target
     opens a "review items" prompt before persisting. Optional —
     when omitted the aggregate check is skipped (parent still
     loading targets, or caller doesn't want the gate). */
  effectiveDailyTarget?: number;
  /** Photo scanning is not on this account's tier: the scanner opens on
   *  Barcode and its photo tabs carry the Pro offer. See PhotoLock. */
  photoLock?: PhotoLock | null;
  /** Fired each time the scanner comes on screen (the page's opening
   *  animation waits for it). */
  onCameraShown?: () => void;
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

  // One converter for OFF data, shared with the Food search results —
  // see src/lib/offNutrition.ts for the per-100 g → per-serving contract.
  const portion = offProductToPortion(data.product, "Barcode item");
  const { name, brand, calories, protein, carbs, fat } = portion;

  return {
    foodName: name,
    brand,
    barcode,
    imageUrl: data.product.image_url || undefined,
    items: [
      {
        name: brand ? `${name} (${brand})` : name,
        portionSize: portion.servingSize,
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

/** Peak-end "Saved ✓" flash before the modal auto-closes. Trimmed from a
 *  1200ms hold: the meal is already committed by then (the awaited setDoc),
 *  and the favourite + photo writes are fire-and-forget, so anything past a
 *  brief confirming flash was pure dead time (Doherty / responsiveness). */
const SAVED_FLASH_MS = 500;

/** The total-calorie figure, counting up as a result lands. Safe for a
 *  LIVE editable value: `useCountUp` animates only its first nonzero
 *  target — every later target (portion edits, item removals) is an
 *  instant set(), so the display keeps tracking the numbers exactly.
 *  Mounted inside the result card, which unmounts between analyses, so
 *  each new scan gets its own count-up. */
function AnimatedCalories({ value }: { value: number }) {
  const display = useCountUp(value);
  return (
    <motion.span className="text-xl font-extrabold font-mono tabular-nums">
      {display}
    </motion.span>
  );
}

export default function FoodAnalyzer({
  date,
  meal: targetMealCategory,
  onSaved,
  onRequestTypedInput,
  onRequestManualLog,
  effectiveDailyTarget,
  photoLock = null,
  onCameraShown,
}: Props) {
  const uid = useUid();
  const { addFavourite } = useFoodFavourites();

  const {
    analyzeFood,
    loading: aiLoading,
    error: aiError,
    result: aiResult,
    reset: resetAI,
  } = useFoodAnalysis();

  const [cameraOpen, setCameraOpen] = useState(false);
  /* The mode a reopened scanner starts on: Retake on a barcode result
     goes back to Barcode, on a label photo back to Label. */
  const [cameraTab, setCameraTab] = useState<ScanMode>("food");
  const lastCaptureModeRef = useRef<"food" | "label">("food");
  /* Ref mirror for async capture handlers: `onCaptureBase64` awaits a
     network round-trip, and the `cameraOpen` it closed over is stale
     by the time the await resolves. Reading the ref answers "is the
     modal still open NOW?" — without it, an X-out during a slow scan
     followed by a late failure would park `scanFailure` on a CLOSED
     modal, and the next scan session would open onto a stale verdict. */
  const cameraOpenRef = useRef(cameraOpen);
  useEffect(() => {
    cameraOpenRef.current = cameraOpen;
  }, [cameraOpen]);
  /* The scan's completion beat: after a USABLE analysis lands, the
     modal is held open ~420ms in a "locked" state (frame tightens,
     laser gone, Done) so the scan visibly resolves instead of
     hard-cutting to the result card. Success-with-results only, and
     skipped entirely under reduced motion, which must never be made
     to WAIT for theatre. */
  const [scanLocked, setScanLocked] = useState(false);
  /* The scan's FAILURE beat: when analysis ends with nothing to show
     (request failed / nothing identifiable / offline), the modal
     stays open and resolves in place — honest copy + Retake +
     Type-it-instead — instead of silently closing mid-sweep and
     dumping the user on a page-level card. Cleared on retake and on
     every path that closes the modal, so a reopen can never show a
     stale verdict. */
  const [scanFailure, setScanFailure] = useState<ScanFailureKind | null>(null);
  /* The user-facing reason behind an "error" failure, straight from the
     hook (server rate-limit / quota / auth copy, or the hook's mapped
     network lines). Shown verbatim as the failure beat's sub-line so a
     rate-limited user reads "wait a moment" instead of a generic
     connection line telling them to retry a closed window. */
  const [scanFailureDetail, setScanFailureDetail] = useState<string | null>(
    null
  );
  const clearScanFailure = () => {
    setScanFailure(null);
    setScanFailureDetail(null);
  };
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
    /* Array.isArray belt on top of the hook's boundary assertion — a
       malformed body reaching this render memo used to CRASH the Food
       page (filter on undefined). The hook now rejects those shapes,
       but a render-time guard costs nothing and a crash here takes the
       whole page. */
    const rawItems = (aiResult as MealResult).items;
    const items = filterIdentifiableAiItems(
      Array.isArray(rawItems) ? rawItems : []
    );
    if (items.length === 0) return null;
    return { ...(aiResult as MealResult), items };
  }, [aiResult]);

  /* True when the AI completed but every item it returned was
     generic / unidentifiable. Drives the empty-result render
     branch below. Distinct from `showError` (which fires on AI
     network failure) — here the AI succeeded but produced
     nothing usable. */
  const aiResultIsEmpty = aiResult !== null && cleanedAiResult === null;

  /* Payoff: one success tap the moment a USABLE result lands — the
     physical counterpart of the scan completing. Keyed to the cleaned
     result, so an analysis that found nothing identifiable (which
     surfaces as an error card) never celebrates. The barcode path
     already has its own feedback (toast). */
  useEffect(() => {
    if (cleanedAiResult) haptic("success");
  }, [cleanedAiResult]);
  const reducedMotion = useReducedMotion();

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
    /* Single-item AI results derive totals from the item, exactly as
       the multi-item branch does above — the model's totals fields are
       an ordinary hallucination site ({items:[{calories:240}],
       totalCalories:480}), and trusting them displayed one number over
       a row saying another, then saved the disagreement. Barcode
       results keep the totals×servings path: their totals are built
       client-side FROM the item in fetchOpenFoodFacts, so the two
       cannot diverge. */
    if (!isBarcode && activeResult.items.length === 1) {
      const only = activeResult.items[0];
      return {
        calories: safeNum(only.calories),
        protein: safeNum(only.protein),
        carbs: safeNum(only.carbs),
        fat: safeNum(only.fat),
      };
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

  /* The sheet shows the result once the scanner has closed over it. */
  const sheetOpen = !!activeResult && !cameraOpen;
  /* The name the diary row will carry (performSave builds the same). */
  const resultTitle = !activeResult
    ? ""
    : isBarcode
      ? activeResult.foodName
      : buildFoodNameFromItems(
          isMultiItem ? activeItems : activeResult.items,
          activeResult.foodName
        );
  /* Where the log lands: the targeted meal, or the slot the diary will
     file it under by the time of day. */
  const logSlot = mealSlotFor({
    meal: targetMealCategory ?? undefined,
    createdAt: Timestamp.now(),
  });

  const showLoading = aiLoading || barcodeLoading;
  const showError = aiError || barcodeError;

  const handleResetAll = () => {
    setBarcodeResult(null);
    setBarcodeError(null);
    setBarcodeLoading(false);
    setCapturedBase64(null);
    setServings(1);
    clearScanFailure();
    resetAI();
  };

  /* Back to the scanner, on the tab the result came from. */
  const retake = () => {
    haptic("light");
    const mode: ScanMode = isBarcode ? "barcode" : lastCaptureModeRef.current;
    handleResetAll();
    setCameraTab(mode);
    setCameraOpen(true);
  };

  const performSave = async (meal: MealResult) => {
    if (!uid) return;
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
            /* safeNum here matches the multi-item branch above: a 200
               body whose item carries "~30g" or omits a field would
               otherwise persist NaN into the diary doc (setDocGuarded
               strips undefined, not NaN) and poison every downstream
               consumer that sums item macros. */
            calories: Math.round(safeNum(item.calories) * s),
            protein: Math.round(safeNum(item.protein) * s),
            carbs: Math.round(safeNum(item.carbs) * s),
            fat: Math.round(safeNum(item.fat) * s),
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

      const mealRef = await createMealEntry(uid, {
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

      /* Persist the captured photo for the diary timeline ("photos
         big, text compact"). Food9: this writes to the DEVICE, not to
         Firebase Storage — no `photoUrl`/`photoPath` is written to the
         meal doc, and nothing about the photo reaches a server. The
         store keys on `mealRef.id`, which is minted client-side above,
         so no reconciliation write is needed at all.

         Deliberately AFTER the doc write and fire-and-forget: the photo
         is an enhancement, never a gate. Any failure resolves false and
         the row simply stays text.

         Gated on `isAiCapture` rather than on `capturedBase64` alone.
         The capture survives a FAILED scan (the user may retake), so a
         bare truthiness check attached a rejected food photo to whatever
         was saved next — a barcode result scanned in the same session
         rendered, and stored, someone else's failed plate. */
      const isAiCapture = !isBarcode && Boolean(capturedBase64);
      if (isAiCapture && capturedBase64) {
        const photoBase64 = capturedBase64;
        const savedMealId = mealRef.id;
        void saveFoodPhoto(uid, savedMealId, photoBase64).then((ok) => {
          // Drop the cached readdir so the diary's next resolve sees the
          // new file; without this the row stays text until remount.
          if (ok) invalidateFoodPhotoCache(uid);
        });
      }

      // Preserve favourites functionality — favourite reflects the
      // edited totals, not the original AI estimate, so a re-log via
      // the favourite chip lands on the same numbers the user saved.
      /* Favourite uses the same derived name as the diary row so
       re-logging via the Quick Add chip lands on the same label
       the user saw in the diary — pre-F5.1 the favourite carried
       the AI's container title ("Breakfast Ingredients") while
       the diary now reads correctly, which would have been a
       confusing inconsistency. */
      // Fire-and-forget (was awaited): the favourite is a quick-log CACHE,
      // not the commit — the meal is already saved above. addFavourite catches
      // its own errors and returns benign, so it can't fail the save; keeping
      // the save blocked on this cache round-trip was pure perceived latency.
      void addFavourite({
        name: derivedFoodName,
        calories: Math.round(displayTotals.calories),
        protein: Math.round(displayTotals.protein),
        carbs: Math.round(displayTotals.carbs),
        fat: Math.round(displayTotals.fat),
        servingSize: persistedItems[0]?.portionSize ?? "1 serving",
        source: meal.barcode ? "barcode" : "photo",
      });

      notifyMealsLogged(uid, [mealRef.id], `Logged ${derivedFoodName}`, {
        path: "photo",
      });
      setSaving(false);
      setSaved(true);

      setTimeout(() => {
        setSaved(false);
        handleResetAll();
        setCameraOpen(false);
        onSaved?.();
      }, SAVED_FLASH_MS);
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
    if (!activeResult || saving || saved) return;

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

  // Matches FoodCameraModal: (base64, mode). `mode` is remembered so
  // Retake reopens the scanner on the tab the photo came from.
  //
  // Every outcome resolves VISIBLY inside the modal:
  //  - usable result  → 420ms locked beat (motion users), then close
  //                     to the result card
  //  - request failed → failure beat "error"
  //  - AI answered but found nothing identifiable (a photo of the
  //    dog / the desk / your parents) → failure beat "no-food"
  //  - offline        → pre-empted BEFORE the request: an instant
  //                     honest answer beats burning the sweep on a
  //                     fetch that must fail
  //
  // NOTE `analyzeFood` never throws — the hook catches internally,
  // sets its own error state, and returns null. The old try/catch +
  // toast here was dead code, which is how every failure came to
  // close the modal silently mid-sweep: `usable` was false, no
  // branch handled it, and the close ran unconditionally. The page-
  // level error/empty cards remain as the landing if the user exits
  // the modal instead of retaking.
  const onCaptureBase64 = async (base64: string, mode: "food" | "label") => {
    lastCaptureModeRef.current = mode;
    setBarcodeResult(null);
    setBarcodeError(null);
    setCapturedBase64(base64);
    clearScanFailure();

    if (!navigator.onLine) {
      setScanFailure("offline");
      return;
    }

    const { data, errorMessage } = await analyzeFood(base64);
    /* The user may have X-ed out during the round-trip (the escape
       hatch exists precisely for slow scans). A late outcome must not
       act on a closed modal: no failure parked for the next session
       to trip over, no invisible locked beat, no redundant close. A
       late USABLE result still reaches the page — the hook's own
       `result` state feeds the result card independently. */
    if (!cameraOpenRef.current) return;
    const usable =
      data && filterIdentifiableAiItems(data.items ?? []).length > 0;
    if (usable) {
      if (!reducedMotion) {
        setScanLocked(true);
        await new Promise((r) => setTimeout(r, 420));
        setScanLocked(false);
      }
      setCameraOpen(false);
    } else {
      setScanFailureDetail(data ? null : errorMessage);
      setScanFailure(data ? "no-food" : "error");
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

    /* Drop any capture left over from an earlier food scan in this same
       session. `capturedBase64` is only cleared by handleResetAll, so a
       failed food scan followed by a barcode scan used to render the
       rejected plate as the barcode product's hero (heroImageSrc prefers
       the capture) — and, pre-Food9, upload it as that meal's photo. */
    setCapturedBase64(null);

    /* Same offline pre-empt as the photo path — without it, the fetch
       rejects with TypeError and the user was toasted the literal
       browser-internal string "Failed to fetch", the dishonest cousin
       of the modal's "You're offline" one tab over. */
    if (!navigator.onLine) {
      const msg = "You're offline — barcode lookup needs a connection.";
      setBarcodeError(msg);
      toast.error(msg, { id: "barcode-offline" });
      return;
    }

    setBarcodeLoading(true);
    setBarcodeError(null);
    setBarcodeResult(null);
    setServings(1);

    try {
      const meal = await fetchOpenFoodFacts(code);
      setBarcodeResult(meal);
      setCameraOpen(false);
      toast.success("Barcode found");
    } catch (e: unknown) {
      /* TypeError = the fetch itself failed (connection dropped
         mid-lookup) — its message is browser-internal, never copy. */
      const msg =
        e instanceof TypeError
          ? "Couldn't reach the barcode database. Check your connection."
          : e instanceof Error
            ? e.message
            : "Barcode lookup failed.";
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
        onClose={() => {
          /* Failure must not survive the modal: a reopen after an
             X-out would otherwise show a stale verdict over a fresh
             session. The page-level error/empty cards are the
             landing instead. */
          clearScanFailure();
          setCapturedBase64(null);
          setCameraOpen(false);
        }}
        onCaptureBase64={onCaptureBase64}
        onBarcodeDetected={onBarcodeDetected}
        photoLock={photoLock}
        initialTab={cameraTab}
        onShown={onCameraShown}
        loading={showLoading}
        locked={scanLocked}
        failure={scanFailure}
        failureDetail={scanFailureDetail}
        onScanRetry={() => {
          /* Retake discards the rejected capture along with its verdict.
             Leaving it set is what let a failed plate leak into whatever
             was saved next in the same session. */
          setCapturedBase64(null);
          clearScanFailure();
        }}
        onRequestTypedInput={
          onRequestTypedInput
            ? () => {
                clearScanFailure();
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
        <div className="bg-destructive/10 rounded-xl p-4 space-y-2">
          <p className="text-sm text-destructive-strong">
            Couldn't identify food.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleResetAll}
              aria-label="Try food analysis again"
              className="text-sm text-destructive-strong font-medium flex items-center gap-1"
            >
              <RotateCcw className="size-3.5" /> Try again
            </button>
            <button
              type="button"
              onClick={() => {
                handleResetAll();
                setCameraOpen(false);
              }}
              className="text-sm text-lifting-strong font-medium"
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
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="primary"
              onClick={() => {
                handleResetAll();
                setCameraOpen(true);
              }}
              leftIcon={<RotateCcw className="size-4" />}
            >
              Try again
            </Button>
            <Button
              variant="secondary"
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
            >
              Log manually
            </Button>
          </div>
        </div>
      )}

      {/* The result, as a sheet over the page. A card added below the
          composer lands behind the tab bar when the scanner closes, with
          its Log button a screen and a half down, and nothing scrolls to
          it. The sheet keeps Log on screen and closes on log, retake, or
          a swipe down (which drops the result). */}
      <BottomSheet
        open={sheetOpen}
        onOpenChange={(next) => {
          if (!next) handleResetAll();
        }}
        title={null}
        hideHeader
        dismissible={!saving && !saved}
        maxHeight="max-h-[88dvh]"
      >
        {activeResult && (
          <>
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>
            <div
              data-testid="scan-result-sheet"
              className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-2 pb-4"
            >
              {/* Low-confidence pre-save banner. Sticks to the top of the
                  sheet while the item list scrolls, so the warning stays
                  in view while editing. Save stays enabled — the banner
                  informs, it doesn't block. */}
              {activeResult.confidence === "low" && (
                <div
                  className="sticky top-0 z-10 px-3 py-2.5 rounded-xl border border-warning/30 bg-warning-bg text-warning-strong flex items-start gap-2"
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

              {/* Title block. The title is the name the diary row will
                  carry: the product for a barcode, the name built from the
                  items for a photo. The AI's own title is not shown; it
                  tends to be a category such as "Lunch Plate". The title
                  follows the edits, so removing an item renames the log.
                  The photo is a thumbnail: you took it a second ago, and
                  at full width it pushed the items down by about 215pt. */}
              <div className="flex items-center gap-3">
                {heroImageSrc && (
                  <img
                    src={heroImageSrc}
                    alt=""
                    className="size-16 shrink-0 rounded-xl bg-muted object-cover"
                  />
                )}
                <div className="min-w-0">
                  <Drawer.Title className="text-lg font-bold text-foreground line-clamp-2 text-balance">
                    {resultTitle}
                  </Drawer.Title>
                  <p className="text-sm text-muted-foreground truncate">
                    {isBarcode
                      ? (activeResult.brand ?? "From its barcode")
                      : "AI estimate · check the portions"}
                  </p>
                </div>
              </div>

              {/* Totals before the items: the number you are logging
                  reads first. Mono numerals, sans units, and the thin
                  P/C/F bar rather than coloured tiles, which read as
                  detached from the rest of the Food page. */}
              <div className="rounded-xl bg-muted/30 p-3 space-y-2">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <p className="text-foreground">
                    <AnimatedCalories
                      value={Math.round(displayTotals.calories)}
                    />
                    <span className="text-sm text-muted-foreground font-normal ml-1">
                      {CALORIE_UNIT}
                    </span>
                  </p>
                  <p className="text-small text-muted-foreground">
                    <span className="font-mono tabular-nums text-foreground">
                      {Math.round(displayTotals.protein)}
                    </span>
                    g protein
                    {" · "}
                    <span className="font-mono tabular-nums text-foreground">
                      {Math.round(displayTotals.carbs)}
                    </span>
                    g carbs
                    {" · "}
                    <span className="font-mono tabular-nums text-foreground">
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
                <div className="flex items-center justify-center gap-4">
                  <IconButton
                    variant="secondary"
                    aria-label="Decrease servings"
                    icon={<Minus className="size-4" />}
                    onClick={() => setServings(Math.max(0.5, servings - 0.5))}
                    className="rounded-full"
                  />
                  <div className="text-center">
                    <p className="text-2xl font-bold font-mono tabular-nums text-foreground">
                      {servings}
                    </p>
                    <p className="text-xs text-muted-foreground">servings</p>
                  </div>
                  <IconButton
                    variant="secondary"
                    aria-label="Increase servings"
                    icon={<Plus className="size-4" />}
                    onClick={() => setServings(servings + 0.5)}
                    className="rounded-full"
                  />
                </div>
              )}

              {/* Per-item breakdown — editable for multi-item AI results,
                  so a wrongly detected item can be removed and a portion
                  changed without rescanning. The calories sit under the
                  name with the portion ("150 g · 248 kcal"), which gives
                  the name the row's width: beside a stepper, a calorie
                  column and a remove button it cut off at "Grilled
                  chicken br…". */}
              {activeResult.items.length > 1 && (
                <div className="space-y-2 border-t border-border/40 pt-3">
                  {editedItems.map((item) => {
                    const i = item.index;
                    const itemCal = Math.round(
                      safeNum(item.calories) * item.multiplier
                    );
                    if (item.removed) {
                      return (
                        <motion.div
                          key={`${item.name}-${i}-removed`}
                          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25 }}
                          className="flex items-center justify-between gap-2 py-1"
                        >
                          <p className="text-sm text-muted-foreground line-through truncate flex-1">
                            {item.name}
                          </p>
                          <button
                            type="button"
                            onClick={() => restoreItem(i)}
                            aria-label={`Restore ${item.name}`}
                            className="flex items-center gap-1 text-xs font-medium text-lifting-strong hover:opacity-80 transition-opacity active:scale-95 shrink-0 relative before:absolute before:-inset-3 before:content-['']"
                          >
                            <RotateCcw className="size-3" />
                            Restore
                          </button>
                        </motion.div>
                      );
                    }
                    return (
                      <motion.div
                        key={`${item.name}-${i}`}
                        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.25,
                          delay: Math.min(i, 6) * 0.05,
                        }}
                        className="flex items-center gap-2"
                        data-testid="scan-result-item"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {item.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.portionSize}
                            {" · "}
                            <span className="font-mono tabular-nums">
                              {itemCal}
                            </span>{" "}
                            {CALORIE_UNIT}
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
                              className="size-7 relative before:absolute before:-inset-2 before:content-[''] rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/70 disabled:opacity-40 active:scale-90 transition-transform"
                            >
                              <Minus className="size-3.5" />
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
                              className="size-7 relative before:absolute before:-inset-2 before:content-[''] rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/70 disabled:opacity-40 active:scale-90 transition-transform"
                            >
                              <Plus className="size-3.5" />
                            </button>
                          </div>
                        )}
                        {isMultiItem && (
                          <button
                            type="button"
                            onClick={() => removeItem(i)}
                            aria-label={`Remove ${item.name}`}
                            className="size-7 relative before:absolute before:-inset-2 before:content-[''] rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive-strong hover:bg-destructive/10 active:scale-90 transition-all shrink-0"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* "All items removed" recovery prompt. Only shown for
                  multi-item AI results when every row has been removed —
                  saving a 0-calorie meal is never the user's intent. */}
              {allRemoved && (
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground text-center">
                  All items removed. Restore one above, or retake the photo.
                </div>
              )}
            </div>

            {/* The actions, fixed at the sheet's foot so the log is always
                a tap away. Log names where the meal goes: the pills that
                pick the slot are on the page, well away from this button.
                Food orange, an owner call recorded in CLAUDE.md's Button
                mapping. */}
            <div className="flex items-center gap-2 border-t border-border/40 px-4 pt-3 pb-4">
              <Button
                variant="secondary"
                size="lg"
                onClick={retake}
                disabled={saving || saved}
              >
                {isBarcode ? "Scan again" : "Retake"}
              </Button>

              {/* Save photo to camera roll via Web Share API. Hidden on
                  platforms that don't support navigator.share with files
                  (Android < 12, desktop browsers). The support check is a
                  module-level cached constant — no per-mount cost. */}
              {isPhotoShareSupported() && capturedBase64 && (
                <IconButton
                  variant="outline"
                  size="lg"
                  aria-label="Save photo to Photos library"
                  icon={<Download className="size-4" />}
                  onClick={handleSavePhoto}
                />
              )}

              <Button
                variant="nutrition"
                size="lg"
                className="flex-1"
                onClick={handleSave}
                /* Disabled while saving (no double-tap) and when every
                   item was removed (a 0-calorie log is never meant). */
                disabled={saving || allRemoved}
                /* Saved-state fill from the palette. */
                style={saved ? { background: THEME.success } : undefined}
              >
                {saved ? (
                  <>
                    <Check className="size-4" aria-hidden="true" /> Saved
                  </>
                ) : saving ? (
                  "Saving…"
                ) : (
                  `Log to ${MEAL_LABELS[logSlot]}`
                )}
              </Button>
            </div>
          </>
        )}
      </BottomSheet>
      {/* Suspicious-value override prompt for AI photo saves. The
          pending save is captured at validation time so the
          dialog commits the same totals the user was warned about
          even if state shifts between prompt and confirm. */}
      <ConfirmDialog
        open={warnTitle !== null}
        overSheet={sheetOpen}
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
