import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { useDailyLogs } from "@/hooks/useFirestore";
import { useAuth } from "@/lib/auth";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";

const itemVariant = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};
const ManualFoodLogger = lazy(() => import("@/components/ManualFoodLogger").then(m => ({ default: m.ManualFoodLogger })));
import { useMeals, type Meal } from "@/hooks/useMeals";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { parseFoodText, getFoodSuggestions } from "@/lib/nlFoodParser";
import type { ParsedFood, FoodSuggestion } from "@/lib/nlFoodParser";
import { RotateCcw } from "lucide-react";
const FoodAnalyzer = lazy(() => import("@/components/FoodAnalyzer"));
import { ServingSizeDrawer } from "@/components/nutrition/ServingSizeDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { validateFoodEntry } from "@/lib/foodValidation";
import { orderQuickAddItems, type QuickAddItem } from "@/lib/quickAddOrder";
import { isGenericAiFoodName } from "@/lib/aiFoodIdentification";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";
import { useSubscription } from "@/lib/subscription";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { useEffectiveTargets } from "@/hooks/useEffectiveTargets";
import FoodHeroCard from "@/components/food/FoodHeroCard";
import FoodMealSection from "@/components/food/FoodMealSection";
import FoodDateBar from "@/components/food/FoodDateBar";
import EditServingsSheet from "@/components/food/EditServingsSheet";
import { useScanUsage } from "@/hooks/useScanUsage";
import { useScanButtonOverrides } from "@/components/food/scanButtonOverrides";
import FoodQuickAddRow from "@/components/food/FoodQuickAddRow";
import FoodComposerCard from "@/components/food/FoodComposerCard";
import { MEAL_ORDER, MEAL_LABELS, type MealKey } from "@/components/food/mealConstants";
import { track as trackFoodEvent } from "@/lib/foodAnalytics";

const DEFAULT_QUICK_MEALS = [
  { name: "Grilled Chicken & Rice", cal: 450, pro: 40, carb: 45, fat: 12 },
  { name: "Protein Shake", cal: 250, pro: 30, carb: 20, fat: 5 },
  { name: "Oatmeal & Banana", cal: 350, pro: 10, carb: 60, fat: 8 },
  { name: "Eggs on Toast", cal: 380, pro: 22, carb: 30, fat: 18 },
  { name: "Greek Yoghurt & Berries", cal: 200, pro: 15, carb: 25, fat: 5 },
  { name: "Tuna Salad", cal: 300, pro: 35, carb: 10, fat: 12 },
];

// Rotating placeholder examples — shown in the NL input when empty +
// unfocused. The input does dual duty: short terms ("Eggs") surface
// database/search suggestions, longer phrases ("200g chicken & rice")
// parse as natural language. The first prompt makes both modes
// explicit; subsequent rotations show real strings the parser
// handles, which serve as both decoration and a working tutorial.
const NL_EXAMPLE_PROMPTS = [
  "Search food or describe a meal",
  "Eggs",
  "200g chicken & rice",
  "Large coffee, no sugar",
  "Greek yoghurt & berries",
];

// Meal slot ordering + labels live in components/food/mealConstants
// so the extracted child components (FoodComposerCard,
// FoodSuggestionsDropdown) share the same identity without prop-
// drilling.

interface OFFResult {
  name: string;
  brand: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
}

export default function Food() {
  const { user } = useAuth();
  const { saveLog } = useDailyLogs();

  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [scanOpen, setScanOpen] = useState(false);
  const [nlInput, setNlInput] = useState("");
  const [nlParsing, setNlParsing] = useState(false);
  const [suggestionsActive, setSuggestionsActive] = useState(true);
  // Rotating placeholder index — cycles through example meals every few
  // seconds when the input is empty and not focused. Teaches users what
  // kind of string the NL parser understands without needing a help doc.
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const [targetMeal, setTargetMeal] = useState<MealKey | null>(null);

  // Cycle the placeholder every 2.8s when the input is idle (empty +
  // unfocused + not adding to a specific meal). Stops the moment the
  // user engages so the placeholder doesn't shift mid-typing.
  useEffect(() => {
    if (nlInput.trim() || inputFocused || targetMeal) return;
    const id = window.setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % NL_EXAMPLE_PROMPTS.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, [nlInput, inputFocused, targetMeal]);
  // Swipe-to-delete: at most ONE row across the whole page can be open. State
  // lives here (at the page level), not per-row or per-section. Food rows
  // receive `isOpen` and `onOpenChange` as props — no context, no refs.
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  // Optimistic delete: meals are immediately hidden from the visible list +
  // hero card totals when deleted, then actually removed from Firestore 3s
  // later. Tapping Undo on the toast within that window restores the row.
  // Gmail/Twitter/iOS Mail pattern — instant feedback + safe rollback.
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(
    () => new Set()
  );

  // Copy-from-yesterday: tracks which meal section is being copied so the
  // pill stays disabled until the Firestore subscription propagates the new
  // entries and the section actually becomes populated. Prevents double-taps.
  const [copyingMealKey, setCopyingMealKey] = useState<string | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { addFavourite, getTimeRelevant } = useFoodFavourites();
  const { isPro } = useSubscription();
  const { analyzeFoodText } = useFoodAnalysis();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const quickAddScrollRef = useRef<HTMLDivElement>(null);
  /* Stable per-date order cache. The frequency map underneath
     would otherwise reshuffle chips on every log (each new entry
     bumps a count and shifts ties). Snapshot the order ONCE per
     selectedDate and apply it on every render until the date
     changes — vanished items drop, new items append at the end
     via `orderQuickAddItems` rather than rebuilding the whole
     cache and reintroducing the reshuffle bug. */
  const quickAddOrderCache = useRef<Map<string, string[]>>(new Map());

  const [offResults, setOffResults] = useState<OFFResult[]>([]);
  const [, setOffLoading] = useState(false);
  /* OFF API outcome for the most recent query — surfaces inline
     fallback states in the suggestions dropdown so the user
     understands "we searched and there's nothing" vs "you haven't
     typed enough yet". offError fires the toast separately. */
  const [offEmpty, setOffEmpty] = useState(false);
  const offDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [offDrawerFood, setOffDrawerFood] = useState<OFFResult | null>(null);
  /* Hour-of-day pinned at the moment the user opens (or switches
     to) a date. F4 audit found that calling
     `getTimeRelevant(new Date().getHours(), 10)` directly inside
     the quickMeals useMemo was the F2 stable-ordering escape
     hatch: the hour wasn't a memo dep, so as wall-clock time
     advanced and the useMemo recomputed for unrelated reasons
     (a meal logged or deleted), a different time-of-day window
     could roll in via `getTimeRelevant`. The new favourite set
     would drop a previously-cached key, the cache filter would
     skip it at render, and a different chip would silently fill
     the slot. The user saw "chips change seconds apart" without
     touching anything that should have caused it. Pinning at
     selectedDate change makes the favourite set stable across
     the session for that date — the F2 stable-order contract
     is now intact at both the cache layer AND its upstream
     favourite-set computation. */
  const timeRelevantHour = useMemo(() => {
    /* selectedDate referenced here only to wire the recompute
       trigger — the hour value doesn't derive from selectedDate,
       it's "what's the wall-clock hour right now, at the moment
       this date was opened". The eslint-exhaustive-deps rule
       flags selectedDate as unnecessary because the body
       doesn't read it; the void reference satisfies the linter
       while keeping the freeze-on-date-change semantics
       readable to future maintainers. */
    void selectedDate;
    return new Date().getHours();
  }, [selectedDate]);

  /* Suspicious-value confirm state for the NL parse path. The
     pending save closure is captured at validation time and
     replayed on confirm — closures over `items` / `confidence` /
     `targetMeal` so the eventual save uses the same data the user
     was warned about, even if state changes mid-prompt. */
  const [nlWarnTitle, setNlWarnTitle] = useState<string | null>(null);
  const [nlWarnDescription, setNlWarnDescription] = useState<string>("");
  const [nlPendingSave, setNlPendingSave] = useState<(() => Promise<void>) | null>(null);

  const selectedDateObj = useMemo(() => new Date(selectedDate + "T12:00:00"), [selectedDate]);
  // Training-aware: returns planned values when adjustCaloriesForTraining is
  // off; otherwise effectiveBonus = max(strategicBonus, actualBurn).
  const dailyTargets = useEffectiveTargets(selectedDateObj);
  const scanUsage = useScanUsage();
  const handleUpgrade = () => { window.location.href = `${import.meta.env.BASE_URL}upgrade`; };
  const scanOverrides = useScanButtonOverrides(
    scanUsage.remaining,
    scanUsage.isUnlimited,
    handleUpgrade,
    () => { haptic(); setScanOpen(!scanOpen); },
  );

  const { meals, getMealsForDate, getDailyTotals, deleteMeal } = useMeals();
  const todaysMeals = getMealsForDate(selectedDate);
  const rawDailyTotals = getDailyTotals(selectedDate);

  const [prevDate, setPrevDate] = useState(selectedDate);
  if (prevDate !== selectedDate) {
    setPrevDate(selectedDate);
    if (targetMeal) setTargetMeal(null);
    // Clear any in-flight typed text on date change. Without this,
    // typing "2 eggs" for today, then tapping yesterday on the date
    // bar, would silently submit "2 eggs" against yesterday — a
    // trust-destroying bug because the calorie totals on both days
    // shift and the user can't see why.
    if (nlInput) setNlInput("");
  }

  /**
   * Join a list of strings into a human-readable phrase:
   *   ["Lunch"]                  → "Lunch"
   *   ["Breakfast","Lunch"]      → "Breakfast & Lunch"
   *   ["Breakfast","Lunch","Dinner"] → "Breakfast, Lunch & Dinner"
   * Used by the "Copy yesterday's …" button label and its success toast
   * so the user sees exactly which meal slots are about to be / were
   * just touched.
   */
  const joinHumanList = (items: string[]): string => {
    if (items.length === 0) return "";
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} & ${items[1]}`;
    return `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`;
  };

  const safeNum = (value: unknown): number => {
    const num = Number(value);
    return isNaN(num) || value == null ? 0 : num;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getMealCategory = (item: any): string => {
    // Check explicit meal field first (used by copied items and meal targeting)
    if (item?.meal && ["breakfast", "lunch", "snacks", "dinner"].includes(item.meal)) return item.meal;
    // Fall back to time-based derivation (snacks is never auto-assigned — use + button to target)
    const createdAt = item?.createdAt || item;
    if (!createdAt || !createdAt.toDate) return "lunch";
    const hour = createdAt.toDate().getHours();
    if (hour < 11) return "breakfast";
    if (hour < 17) return "lunch";
    return "dinner";
  };


  // Visible meals = all of today's meals minus any that are pending delete.
  // Used for meal sections, hero card totals, and the food row list so the
  // user sees an instant disappearance while the 3s undo window is active.
  const visibleTodaysMeals = useMemo(
    () =>
      pendingDeleteIds.size === 0
        ? todaysMeals
        : todaysMeals.filter((m) => !pendingDeleteIds.has(m.id)),
    [todaysMeals, pendingDeleteIds]
  );

  // Optimistic daily totals — the hero card's ring and macro columns reflect
  // the pending-delete state instantly. If the user undoes, the ring ticks
  // back up.
  const dailyTotals = useMemo(() => {
    if (pendingDeleteIds.size === 0) return rawDailyTotals;
    let calories = rawDailyTotals.calories;
    let protein = rawDailyTotals.protein;
    let carbs = rawDailyTotals.carbs;
    let fat = rawDailyTotals.fat;
    for (const m of todaysMeals) {
      if (!pendingDeleteIds.has(m.id)) continue;
      calories -= safeNum(m.totalCalories);
      protein -= safeNum(m.totalProtein);
      carbs -= safeNum(m.totalCarbs);
      fat -= safeNum(m.totalFat);
    }
    return {
      ...rawDailyTotals,
      calories,
      protein,
      carbs,
      fat,
    };
  }, [rawDailyTotals, pendingDeleteIds, todaysMeals]);

  const mealSegmentedMeals = useMemo(() => {
    const segments: Record<string, typeof visibleTodaysMeals> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    for (const meal of visibleTodaysMeals) {
      const cat = getMealCategory(meal);
      segments[cat].push(meal);
    }
    return segments;
  }, [visibleTodaysMeals]);

  // Yesterday's meals for "Copy from yesterday" feature
  const yesterdayDate = useMemo(() => format(addDays(new Date(selectedDate + "T12:00:00"), -1), "yyyy-MM-dd"), [selectedDate]);
  const yesterdayMeals = getMealsForDate(yesterdayDate);
  const yesterdaySegmented = useMemo(() => {
    const segments: Record<string, typeof yesterdayMeals> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    for (const meal of yesterdayMeals) {
      const cat = getMealCategory(meal);
      segments[cat].push(meal);
    }
    return segments;
  }, [yesterdayMeals]);

  /**
   * Slots that yesterday has and today doesn't. Drives both the bottom
   * "Copy yesterday's …" button visibility + label and the copy handler
   * so the two can't drift on what's about to happen vs what happens.
   */
  const slotsToCopyFromYesterday = useMemo(() => {
    return MEAL_ORDER.filter((mealKey) => {
      const yHas = (yesterdaySegmented[mealKey]?.length ?? 0) > 0;
      const tHas = (mealSegmentedMeals[mealKey]?.length ?? 0) > 0;
      return yHas && !tHas;
    });
  }, [yesterdaySegmented, mealSegmentedMeals]);

  /**
   * Copy every yesterday meal that today is missing in the same slot.
   * Skips slots today already has so we never produce duplicates. Used by
   * the bottom-of-page "Copy yesterday's …" button — replaces the
   * per-section "Copy yesterday's lunch" pills that used to sit beneath
   * each empty section header.
   */
  const handleCopyAllMissingFromYesterday = async () => {
    if (copyingMealKey || !user) return;
    // Use a sentinel value so the in-flight UI guard works even though
    // there's no single mealKey driving this call.
    setCopyingMealKey("__all__");
    haptic("light");
    try {
      let total = 0;
      const copied: string[] = [];
      for (const mealKey of slotsToCopyFromYesterday) {
        const items = yesterdaySegmented[mealKey] ?? [];
        if (items.length === 0) continue;
        for (const item of items) {
          await addDoc(collection(db, "users", user.uid, "meals"), {
            date: selectedDate,
            meal: mealKey,
            foodName: item.foodName,
            items: item.items ?? [],
            totalCalories: item.totalCalories ?? 0,
            totalProtein: item.totalProtein ?? 0,
            totalCarbs: item.totalCarbs ?? 0,
            totalFat: item.totalFat ?? 0,
            confidence: "copy",
            createdAt: Timestamp.now(),
          });
          total++;
        }
        copied.push(MEAL_LABELS[mealKey]);
      }
      haptic(15);
      // Toast names the slots that received copies so the user can see
      // exactly what happened, not just an opaque item count.
      toast.success(
        `Copied ${total} item${total === 1 ? "" : "s"} into ${joinHumanList(copied)}`,
        { id: "food-copy-yesterday" },
      );
    } catch (err) {
      logger.error("[copy-all] Failed:", err);
      toast.error("Couldn't copy from yesterday", { id: "food-copy-yesterday" });
    } finally {
      setCopyingMealKey(null);
    }
  };

  useEffect(() => {
    const mealCount = todaysMeals.length;
    if (mealCount === 0) return;
    // Fire-and-forget previously: a failed log write (permission, offline)
    // would silently desync the streak system from the user's actual
    // activity. We removed the "Meal logged!" success toast in 0f68ff3
    // arguing visible meal-list state is the confirmation, but that
    // assumption only holds if the daily-log write actually succeeds.
    // Now we capture the failure — toast.error already same-id'd as
    // food-save-error so rapid retries collapse into one message.
    saveLog({
      date: selectedDate,
      workouts: 0,
      meals: mealCount,
      hasPR: false,
      notes: "",
    }).catch((err) => {
      logger.error("[Food] daily log save failed", err);
      toast.error("Couldn't update today's log", { id: "food-save-error" });
    });
  }, [todaysMeals.length, selectedDate, saveLog]);

  // Food6a-3: tap-back limited to 90 days; beyond that the History
  // page is the surface for review (privacy + data freshness).
  // Forward navigation is bounded by today — logging in the future
  // has no meaning in a diary.
  const FOOD_TAP_BACK_DAYS = 90;
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const minDateStr = format(addDays(new Date(), -FOOD_TAP_BACK_DAYS), "yyyy-MM-dd");

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    const next = format(addDays(d, delta), "yyyy-MM-dd");
    if (next < minDateStr || next > todayStr) return;
    setSelectedDate(next);
    trackFoodEvent("food_date_navigated", { direction: delta < 0 ? "prev" : "next" });
  };

  const isToday = selectedDate === todayStr;
  const canGoBack = selectedDate > minDateStr;
  const canGoForward = selectedDate < todayStr;

  // Swipe-to-delete: close any open row when the user taps outside a food row.
  // A row marks itself with `data-food-row` so we can detect the boundary via
  // Element.closest. No-op if no row is currently open.
  useEffect(() => {
    if (!openRowId) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-food-row]")) return;
      setOpenRowId(null);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [openRowId]);

  const suggestions = useMemo(() => {
    const parts = nlInput.split(/,/);
    const lastPart = (parts[parts.length - 1] || "").trim();
    return lastPart.length >= 2 ? getFoodSuggestions(lastPart, 4) : [];
  }, [nlInput]);

  const offSearchQuery = useMemo(() => {
    const parts = nlInput.split(/,/);
    const lastPart = (parts[parts.length - 1] || "").trim();
    return lastPart.length >= 2 && suggestionsActive ? lastPart : null;
  }, [nlInput, suggestionsActive]);

  /* Dropdown surfaces local NL suggestions, OFF results, OR an
     inline "No matches" fallback row when the OFF API completed
     with zero matches and we have no local suggestions to show.
     Without that fallback the dropdown silently disappeared and
     the user had no signal that the search returned nothing. */
  const showSuggestions = suggestionsActive && (suggestions.length > 0 || offResults.length > 0 || (offEmpty && offSearchQuery !== null));

  const [prevOffQuery, setPrevOffQuery] = useState(offSearchQuery);
  if (offSearchQuery !== prevOffQuery) {
    setPrevOffQuery(offSearchQuery);
    if (offSearchQuery === null) {
      setOffResults([]);
      setOffLoading(false);
    }
  }

  useEffect(() => {
    if (!offSearchQuery) {
      /* Reset the inline empty state when the query clears so a
         stale "No matches" doesn't linger after the user has
         deleted their input. */
      setOffEmpty(false);
      return;
    }
    if (offDebounceRef.current) clearTimeout(offDebounceRef.current);
    offDebounceRef.current = setTimeout(async () => {
      setOffLoading(true);
      try {
        const res = await fetch(
          `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(offSearchQuery)}&search_simple=1&action=process&json=1&page_size=4&fields=product_name,brands,nutriments,serving_size&lc=en&countries_tags_contains=en`
        );
        const data = await res.json();
        const products: OFFResult[] = (data.products || [])
          .filter(
            (p: { product_name?: string; nutriments?: Record<string, number> }) =>
              p.product_name && p.nutriments
          )
          .map(
            (p: {
              product_name?: string;
              nutriments?: Record<string, number>;
              brands?: string;
              serving_size?: string;
            }) => ({
              name: p.product_name || "Unknown",
              brand: p.brands || "",
              calories: Math.round(
                p.nutriments?.["energy-kcal_100g"] || p.nutriments?.["energy-kcal"] || 0
              ),
              protein: Math.round((p.nutriments?.proteins_100g || 0) * 10) / 10,
              carbs: Math.round((p.nutriments?.carbohydrates_100g || 0) * 10) / 10,
              fat: Math.round((p.nutriments?.fat_100g || 0) * 10) / 10,
              servingSize: p.serving_size || "100g",
            })
          );
        setOffResults(products);
        setOffEmpty(products.length === 0);
      } catch {
        /* Pre-F1 this caught silently with no user feedback. The
           catch fires for OFF API timeouts / network errors /
           5xx — distinct from a successful query that returned
           zero matches. Surface the failure with a manual
           fallback action so the user has somewhere to go. */
        setOffResults([]);
        setOffEmpty(false);
        toast.error("Couldn't search foods. Try again.", {
          id: "food-off-error",
          action: { label: "Log manually", onClick: () => setManualOpen(true) },
        });
      }
      setOffLoading(false);
    }, 400);
    return () => {
      if (offDebounceRef.current) clearTimeout(offDebounceRef.current);
    };
  }, [offSearchQuery]);

  const handleSuggestionSelect = (suggestion: FoodSuggestion) => {
    const parts = nlInput.split(/,/);
    const lastPart = (parts[parts.length - 1] || "").trim();
    const qtyMatch = lastPart.match(/^(\d+(?:\.\d+)?)\s*/);
    const prefix = qtyMatch ? qtyMatch[1] + " " : "";
    parts[parts.length - 1] = " " + prefix + suggestion.name.toLowerCase();
    setNlInput(parts.join(",").trim());
    setSuggestionsActive(false);
  };

  const handleOFFSelect = (food: OFFResult) => {
    setOffDrawerFood(food);
    setSuggestionsActive(false);
    setNlInput("");
    setOffResults([]);
  };

  const handleOFFConfirm = async (servings: number) => {
    const food = offDrawerFood;
    if (!user || !food) return;
    const s = servings;
    try {
      await addDoc(collection(db, "users", user.uid, "meals"), {
        date: selectedDate,
        foodName: food.name,
        items: [
          {
            name: food.name,
            portionSize: s !== 1 ? `${s}x ${food.servingSize}` : food.servingSize,
            calories: Math.round(food.calories * s),
            protein: Math.round(food.protein * s),
            carbs: Math.round(food.carbs * s),
            fat: Math.round(food.fat * s),
          },
        ],
        totalCalories: Math.round(food.calories * s),
        totalProtein: Math.round(food.protein * s),
        totalCarbs: Math.round(food.carbs * s),
        totalFat: Math.round(food.fat * s),
        confidence: "database",
        createdAt: Timestamp.now(),
      });
      await addFavourite({ ...food, source: "search" });
      setOffDrawerFood(null);
      // No success toast — the food appears in the meal list and the
      // macro tiles animate, which is the confirmation. See ToastProvider
      // commit notes for the wider rule.
    } catch {
      toast.error("Failed to save. Please try again.", { id: "food-save-error" });
    }
  };

  const handleNLParse = async () => {
    if (!nlInput.trim() || !user) return;
    setNlParsing(true);
    let items: ParsedFood[];
    let confidence: string;
    if (isPro) {
      try {
        const result = await analyzeFoodText(nlInput);
        if (result && result.items?.length > 0) {
          items = result.items.map((i) => ({
            name: i.name,
            calories: i.calories,
            protein: i.protein,
            carbs: i.carbs,
            fat: i.fat,
            // Carry the AI's portion estimate ("1 cup", "200g", etc.)
            // through to the save path so the diary row records what
            // the AI thought it identified instead of a placeholder.
            ...(i.portionSize ? { portionLabel: i.portionSize } : {}),
          }));
          confidence = "ai-parse";
        } else {
          items = parseFoodText(nlInput);
          confidence = "nl-parse";
        }
      } catch {
        items = parseFoodText(nlInput);
        confidence = "nl-parse";
      }
    } else {
      items = parseFoodText(nlInput);
      confidence = "nl-parse";
    }
    if (items.length === 0) {
      toast.error("Could not parse any foods. Try a different description.", { id: "food-nl-error" });
      setNlParsing(false);
      return;
    }
    if (confidence === "nl-parse") {
      const zeroItems = items.filter((i) => i.calories === 0);
      if (zeroItems.length > 0) {
        toast.warning(
          `Couldn't find macros for: ${zeroItems.map((i) => i.name).join(", ")}. Try searching for accurate data.`,
          { id: "food-nl-warning" }
        );
      }
    }
    /* Per-item suspicious-value validation. Runs only on freshly
       parsed user-entered text — database / barcode / quick-add
       paths skip validation (per F1 scope). Negative / NaN values
       are blocked outright; high-but-possible values open the
       Save anyway dialog with the offending item's verdict. The
       first warn surfaces; we don't chain dialogs for multi-item
       parses. */
    let warnVerdict: { title: string; description: string } | null = null;
    for (const item of items) {
      const v = validateFoodEntry({
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
      });
      if (v.kind === "blocked") {
        toast.error(v.reason, { id: "food-validation-error" });
        setNlParsing(false);
        return;
      }
      if (v.kind === "warn" && !warnVerdict) {
        warnVerdict = { title: v.title, description: v.description };
      }
    }

    const performNLSave = async () => {
      const totalCalories = items.reduce((s, i) => s + i.calories, 0);
      const totalProtein = items.reduce((s, i) => s + i.protein, 0);
      const totalCarbs = items.reduce((s, i) => s + i.carbs, 0);
      const totalFat = items.reduce((s, i) => s + i.fat, 0);
      try {
        await addDoc(collection(db, "users", user.uid, "meals"), {
          date: selectedDate,
          foodName: items.map((i) => i.name).join(", "),
          items: items.map((i) => ({
            name: i.name,
            // Preserve the user's typed portion when one was detected
            // (e.g. "200g", "150ml"); otherwise fall back to the
            // generic placeholder. Without this fallback the diary
            // row reads "1 serving" even when the user wrote "200g
            // chicken", which broke trust between input and record.
            portionSize: i.portionLabel ?? "1 serving",
            calories: i.calories,
            protein: i.protein,
            carbs: i.carbs,
            fat: i.fat,
          })),
          totalCalories,
          totalProtein,
          totalCarbs,
          totalFat,
          confidence,
          createdAt: Timestamp.now(),
          ...(targetMeal ? { meal: targetMeal } : {}),
        });
        setNlInput("");
        setTargetMeal(null);
        const inputSegmentCount = nlInput
          .split(/[,\n]+/)
          .map((s) => s.trim())
          .filter(Boolean).length;
        const mergedCount = inputSegmentCount - items.length;
        const itemNoun = items.length > 1 ? "items" : "item";
        const mergedSuffix = mergedCount > 0
          ? ` (${mergedCount} combined)`
          : "";
        /* Source-aware success copy. AI-parsed entries surface
           "Logged from AI estimate" so the user understands the
           numbers came from an AI guess and can review them.
           Local NL parser keeps the existing item-count copy
           (the user typed it themselves). */
        if (confidence === "ai-parse") {
          toast.success("Logged from AI estimate", { id: "food-nl-success" });
        } else {
          toast.success(`${items.length} ${itemNoun} logged${mergedSuffix}!`, { id: "food-nl-success" });
        }
      } catch {
        toast.error("Failed to save. Please try again.", { id: "food-save-error" });
      }
      setNlParsing(false);
    };

    if (warnVerdict) {
      /* Park the save behind the confirm dialog. setNlParsing stays
         true so the input stays disabled while the user decides;
         performNLSave will reset it on resolve. */
      setNlPendingSave(() => performNLSave);
      setNlWarnTitle(warnVerdict.title);
      setNlWarnDescription(warnVerdict.description);
      return;
    }

    await performNLSave();
  };

  // Edit-servings state. The sheet itself (EditServingsSheet) owns
  // the stepper's target value — Food.tsx just tracks which group is
  // open and persists the change when the user taps Save.
  const [editingGroup, setEditingGroup] = useState<{ id: string; foodName: string; meals: Meal[] } | null>(null);

  const applyServingsChange = async (targetCount: number) => {
    if (!user || !editingGroup) return;
    const { meals: groupMeals, foodName } = editingGroup;
    const currentCount = groupMeals.length;
    if (targetCount === currentCount || targetCount < 1) {
      setEditingGroup(null);
      return;
    }
    haptic("light");
    try {
      if (targetCount > currentCount) {
        /* Increment branch — no undo needed. The user can
           always step the count back down (which routes through
           the decrement branch with its own undo window) or
           swipe-delete an extra entry. */
        const source = groupMeals[groupMeals.length - 1];
        const adds = targetCount - currentCount;
        for (let i = 0; i < adds; i++) {
          await addDoc(collection(db, "users", user.uid, "meals"), {
            date: selectedDate,
            foodName: source.foodName,
            items: source.items ?? [],
            totalCalories: safeNum(source.totalCalories),
            totalProtein: safeNum(source.totalProtein),
            totalCarbs: safeNum(source.totalCarbs),
            totalFat: safeNum(source.totalFat),
            confidence: "duplicate",
            createdAt: Timestamp.now(),
            ...(source.meal ? { meal: source.meal } : {}),
          });
        }
        setEditingGroup(null);
        setOpenRowId(null);
        toast.success(`Updated to ${targetCount} ${targetCount === 1 ? "serving" : "servings"}`, {
          id: `food-edit-${foodName}`,
        });
      } else {
        /* Decrement branch — actual data loss. Mirrors the
           handleDeleteMeal pattern (line 733+): optimistically
           hide via pendingDeleteIds + schedule the real delete
           after a 3s window + render an Undo action on the
           toast. Without this, stepping a count down was
           irreversible — asymmetric vs swipe-delete. */
        const removes = currentCount - targetCount;
        const toRemove = groupMeals.slice(-removes);
        const idsToRemove = toRemove.map((m) => m.id);

        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          for (const id of idsToRemove) next.add(id);
          return next;
        });
        setEditingGroup(null);
        setOpenRowId(null);

        const timeoutId = setTimeout(() => {
          for (const id of idsToRemove) deleteMeal(id);
        }, 3000);

        toast.success(`Updated to ${targetCount} ${targetCount === 1 ? "serving" : "servings"}`, {
          id: `food-edit-${foodName}`,
          action: {
            label: "Undo",
            onClick: () => {
              clearTimeout(timeoutId);
              setPendingDeleteIds((prev) => {
                const next = new Set(prev);
                for (const id of idsToRemove) next.delete(id);
                return next;
              });
            },
          },
        });
      }
    } catch {
      toast.error("Couldn't update. Try again.", { id: "food-edit-error" });
    }
  };

  const handleDeleteMeal = (mealIds: string[], foodName: string) => {
    /* Accepts a list of meal IDs because each FoodRow visually represents
       a *grouped* set of identical meal entries (e.g. "Rice ×3"). The
       previous implementation only deleted the last entry in the group,
       leaving "Rice ×2" behind — an obvious correctness bug from the
       user's perspective. Looping over every ID in the group makes the
       row's visible state and the underlying data agree.

       Optimistic hide / 3-second undo / Firestore delete logic is
       symmetric across all IDs — they go in and out of pending together
       so the toast's "Undo" action restores the entire group. */
    if (mealIds.length === 0) return;

    // 1. Optimistic hide for every meal in the group.
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      for (const id of mealIds) next.add(id);
      return next;
    });
    setOpenRowId(null);

    // 2. Schedule the Firestore deletes after the undo window.
    const timeoutId = setTimeout(() => {
      for (const id of mealIds) deleteMeal(id);
      // Don't remove from pendingDeleteIds here. The Firestore onSnapshot
      // will drop the meals from the meals array, making the pending IDs a
      // harmless no-op filter on non-existent entries. Removing from
      // pending BEFORE onSnapshot confirms the delete causes a brief flash
      // where the rows reappear in the list (the "automatically adds back"
      // bug).
    }, 3000);

    // 3. Toast with Undo — pluralised when the group held multiple
    //    servings so the user knows how many entries the action covered.
    const message =
      mealIds.length === 1
        ? `${foodName} deleted`
        : `${mealIds.length} servings of ${foodName} deleted`;

    toast(message, {
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timeoutId);
          setPendingDeleteIds((prev) => {
            const next = new Set(prev);
            for (const id of mealIds) next.delete(id);
            return next;
          });
        },
      },
      duration: 3000,
    });
  };

  const handleTargetMeal = (mealKey: MealKey) => {
    haptic();
    // Toggle off if same meal tapped again
    if (targetMeal === mealKey) {
      setTargetMeal(null);
      return;
    }
    setTargetMeal(mealKey);
    trackFoodEvent("food_meal_slot_tapped", { slot: mealKey });
    // Scroll input into view then focus
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => inputRef.current?.focus(), 300);
    }, 50);
  };

  // Merged Quick Add source.
  //
  // Three layers, in priority order:
  //   1. Time-relevant favourites — foods the user has explicitly
  //      starred, filtered by time-of-day. Favourites are the
  //      strongest user signal (explicit), so they go first.
  //   2. Frequency-ranked history (last 30 days) — the foods the user
  //      actually relies on day-to-day. Was previously sorted by
  //      simple recency (chronological), which let a one-off meal
  //      (e.g. takeaway pizza last night) bubble above habitual
  //      foods like daily Greek yoghurt. Frequency over a rolling
  //      window better matches the "Quick Add" promise: surface the
  //      foods I quick-add the most. Tie-broken by last-logged so
  //      ties favour the more recent of two equally-frequent items
  //      (handles "I switched from oats to yoghurt" gracefully).
  //   3. Seeded defaults — first-time users with no history still
  //      see suggestions.
  //
  // Dedupe is by normalized food name across all three sources.
  // Capped at 5 to keep the row scannable.
  const quickMeals = useMemo(() => {
    /* Build the live key→item map first. Cap is enforced AFTER
       cache application via orderQuickAddItems (was previously
       enforced during ranking, which combined with the cache
       would risk dropping cached keys before they got a chance
       to claim their stable slot). */
    const current = new Map<string, QuickAddItem>();

    const push = (entry: { name: string; cal: number; pro: number; carb: number; fat: number; portionSize: string }) => {
      const key = entry.name.toLowerCase().trim();
      if (!key || current.has(key)) return;
      /* Legacy hygiene: filter generic / unidentifiable AI names
         (e.g. "Unidentifiable", "Unknown food") at render time so
         pre-F4 entries that may already exist in the user's
         frequency map don't surface as Quick Add chips. Filter
         lives here rather than in `orderQuickAddItems` so the
         cached order in `quickAddOrderCache` stays untouched —
         skipping at render preserves F2's stable-order contract.
         New AI saves are blocked at the FoodAnalyzer source so
         this filter is purely backstop for legacy data. */
      if (isGenericAiFoodName(entry.name)) return;
      current.set(key, { key, ...entry });
    };

    // 1. Time-relevant favourites (richest data — known portion size).
    //    Hour pinned at `timeRelevantHour` (declared above, keyed on
    //    selectedDate) — see that block's comment for why a fresh
    //    `new Date().getHours()` here would re-introduce the F2 escape
    //    hatch the F4 audit identified.
    for (const f of getTimeRelevant(timeRelevantHour, 10)) {
      push({
        name: f.name,
        cal: f.calories,
        pro: f.protein,
        carb: f.carbs,
        fat: f.fat,
        portionSize: f.servingSize || "1 serving",
      });
    }

    // 2. Frequency-ranked history over the last 30 days.
    //    `meal.date` is a `YYYY-MM-DD` string; lexical comparison
    //    against the cutoff string is correct (and avoids parsing
    //    every meal's date into a Date object).
    const cutoff = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
    })();
    const freq = new Map<
      string,
      { count: number; lastLogged: string; meal: typeof meals[number] }
    >();
    for (const meal of meals) {
      if (!meal.date || meal.date < cutoff) continue;
      const key = meal.foodName.toLowerCase().trim();
      if (!key) continue;
      const existing = freq.get(key);
      if (existing) {
        existing.count += 1;
        // Keep the latest version's macros — they may differ if the
        // user logged the same name with different portions.
        if (meal.date > existing.lastLogged) {
          existing.lastLogged = meal.date;
          existing.meal = meal;
        }
      } else {
        freq.set(key, { count: 1, lastLogged: meal.date, meal });
      }
    }
    const ranked = Array.from(freq.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      // tie → most recent wins
      return b.lastLogged.localeCompare(a.lastLogged);
    });
    for (const entry of ranked) {
      /* Smart display label for multi-item meals.
         AI-detected meals from photo scans return verbose foodNames
         like "Plate with Fish, Fries, Salad, and Roasted Vegetables"
         that read poorly in a chip — even with truncation. The items
         array carries individual food names ("Fish", "Fries", "Salad",
         "Roasted Vegetables"), so we can build a tight summary:
         "Fish, Fries +2" when the meal has 3+ items.
         Two-item and single-item meals keep their foodName because
         a 2-item summary "Fish, Fries" isn't shorter than a clean
         foodName like "Bacon and Eggs". */
      const items = entry.meal.items ?? [];
      const smartName =
        items.length > 2 && items[0]?.name && items[1]?.name
          ? `${items[0].name}, ${items[1].name} +${items.length - 2}`
          : entry.meal.foodName;
      push({
        name: smartName,
        cal: entry.meal.totalCalories || 0,
        pro: entry.meal.totalProtein || 0,
        carb: entry.meal.totalCarbs || 0,
        fat: entry.meal.totalFat || 0,
        portionSize: "1 serving",
      });
    }

    // 3. Seeded defaults so first-time users still see suggestions
    if (current.size < 3) {
      for (const d of DEFAULT_QUICK_MEALS) {
        push({ ...d, portionSize: "1 serving" });
      }
    }

    /* Apply the stable per-date cache. First visit to a date:
       seed the cache with the freshly-computed order. Subsequent
       visits / re-renders within the same date: render the cached
       order, with vanished keys dropped and new keys appended at
       the end. Cap of 5 enforced at render. */
    const cached = quickAddOrderCache.current.get(selectedDate);
    if (!cached) {
      const seedOrder = Array.from(current.keys());
      quickAddOrderCache.current.set(selectedDate, seedOrder);
    }
    return orderQuickAddItems(
      quickAddOrderCache.current.get(selectedDate) ?? [],
      current,
      5,
    );
    /* timeRelevantHour added explicitly so eslint-react-hooks
       can verify the dep wiring — even though it derives from
       selectedDate, an explicit dep makes the freeze contract
       readable to future maintainers (and to the linter). */
  }, [meals, getTimeRelevant, selectedDate, timeRelevantHour]);

  /* Reset Quick Add scroll position whenever the rendered chips
     change. Without this, the carousel keeps its previous scrollLeft
     across re-renders — so when the frequency-ranked ordering
     reshuffles after a new log, the user can land on a half-scrolled
     state where the leftmost visible chip is mid-clipped (e.g.
     "rink · 160 kcal" instead of the start of "Energy Drink").
     auto behaviour (no animation) — the layout shouldn't appear to
     "scroll back" on update; it should just be at the start. */
  useEffect(() => {
    quickAddScrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [quickMeals]);

  const [quickAdding, setQuickAdding] = useState<string | null>(null);

  const handleQuickMealAdd = async (meal: (typeof quickMeals)[number]) => {
    if (!user || quickAdding) return;
    setQuickAdding(meal.name);
    try {
      await addDoc(collection(db, "users", user.uid, "meals"), {
        date: selectedDate,
        foodName: meal.name,
        items: [
          {
            name: meal.name,
            portionSize: meal.portionSize,
            calories: meal.cal,
            protein: meal.pro,
            carbs: meal.carb,
            fat: meal.fat,
          },
        ],
        totalCalories: meal.cal,
        totalProtein: meal.pro,
        totalCarbs: meal.carb,
        totalFat: meal.fat,
        confidence: "quick-add",
        createdAt: Timestamp.now(),
        ...(targetMeal ? { meal: targetMeal } : {}),
      });
      setTargetMeal(null);
      // No success toast — meal list updates, macros animate.
    } catch {
      toast.error("Failed to save. Please try again.", { id: "food-save-error" });
    }
    setQuickAdding(null);
  };


  return (
    <motion.div
      /* Bottom padding hooks into the canonical --page-bottom-pad
         token (tab-bar height + env(safe-area-inset-bottom) +
         1rem) so the last meal section / Copy yesterday button
         clears the home indicator on notched iPhones. The previous
         hardcoded `pb-28` (7rem / 112px) ignored safe-area inset
         and could clip on devices with deeper insets. Same pattern
         as RunSummary.tsx. */
      className="space-y-4.5"
      style={{ paddingBottom: 'var(--page-bottom-pad)' }}
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
    >
      <FoodDateBar
        selectedDate={selectedDate}
        isToday={isToday}
        onPrev={() => changeDate(-1)}
        onNext={() => changeDate(1)}
        onPick={(next) => {
          if (next < minDateStr || next > todayStr) return;
          setSelectedDate(next);
          trackFoodEvent("food_date_navigated", { direction: "pick" });
        }}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        minDate={minDateStr}
        maxDate={todayStr}
        itemVariant={itemVariant}
      />

      {/* Header */}
      <motion.div variants={itemVariant}>
        <h1 className="text-xl font-extrabold text-foreground">Food</h1>
      </motion.div>

      {/* Hero card — ring + macros on a single white card */}
      <motion.div variants={itemVariant} key={selectedDate}>
        <FoodHeroCard
          selectedDate={selectedDate}
          isToday={isToday}
          dailyTargets={dailyTargets}
          dailyTotals={{
            calories: dailyTotals.calories,
            protein: dailyTotals.protein,
            carbs: dailyTotals.carbs,
            fat: dailyTotals.fat,
          }}
        />
      </motion.div>

      {/* Composer: NL textarea + Add to pills + Scan CTA + manual
          log fallback. Extracted to components/food/FoodComposerCard.
          The dropdown surfacing under the input is owned by the
          composer; its ref + outside-click dismissal still resolve
          here via the forwarded `suggestionsRef`. */}
      <motion.div variants={itemVariant}>
        <FoodComposerCard
          ref={suggestionsRef}
          nlInput={nlInput}
          setNlInput={setNlInput}
          nlParsing={nlParsing}
          inputFocused={inputFocused}
          setInputFocused={(v) => {
            if (v && !inputFocused) trackFoodEvent("food_composer_focused");
            setInputFocused(v);
          }}
          setSuggestionsActive={setSuggestionsActive}
          placeholderPrompt={NL_EXAMPLE_PROMPTS[placeholderIdx]}
          onParse={handleNLParse}
          inputRef={inputRef}
          targetMeal={targetMeal}
          setTargetMeal={setTargetMeal}
          onTargetMeal={handleTargetMeal}
          showSuggestions={showSuggestions}
          suggestions={suggestions}
          offResults={offResults}
          offEmpty={offEmpty}
          offSearchQuery={offSearchQuery}
          onSelectSuggestion={handleSuggestionSelect}
          onSelectOff={handleOFFSelect}
          scanUsage={scanUsage}
          scanOverrides={scanOverrides}
          onUpgrade={handleUpgrade}
          onManualOpen={() => setManualOpen(true)}
        />
      </motion.div>

      {scanOpen && (
        <Suspense fallback={<div className="py-12 text-center text-muted-foreground text-sm animate-pulse">Loading scanner...</div>}>
          <FoodAnalyzer
            date={selectedDate}
            meal={targetMeal}
            /* Pass the day's effective calorie target so AI scans
               whose aggregate exceeds 150% of it open the
               "review items" prompt before persisting. Already
               includes day-type fuel adjustments (lift/run
               bonus calories) via useEffectiveTargets, so the
               threshold scales with the user's planned day. */
            effectiveDailyTarget={dailyTargets.finalTarget}
            onSaved={() => { setScanOpen(false); setTargetMeal(null); }}
            onRequestManualLog={() => {
              // AI photo failure fallback. The camera modal stays
              // open after AI errors (single-tap retry intent), so
              // the toast's Log manually action needs to close the
              // scanner AND open the manual drawer so the user has
              // a clear next path without finding their way back to
              // Food.tsx's CTA themselves.
              setScanOpen(false);
              setTimeout(() => setManualOpen(true), 50);
            }}
            onRequestTypedInput={() => {
              // Camera denied fallback path — close the scanner and
              // focus the NL composer so the user can type the meal
              // instead. setTimeout to let the modal teardown finish
              // before requesting focus (otherwise iOS Safari rejects
              // the focus call).
              setScanOpen(false);
              setTimeout(() => {
                inputRef.current?.focus();
                setSuggestionsActive(true);
              }, 100);
            }}
          />
        </Suspense>
      )}

      {/* Quick Add — merged favourites + recents row, extracted to
          components/food/FoodQuickAddRow.tsx. */}
      <motion.div variants={itemVariant} className="mt-3.5">
        <FoodQuickAddRow
          ref={quickAddScrollRef}
          meals={quickMeals}
          adding={quickAdding}
          onAdd={handleQuickMealAdd}
        />
      </motion.div>


      {/* Meal sections — Food6d locks per-slot independent empty
          states: all four slots always render so mixed states
          (breakfast logged, lunch empty) read as intentional rather
          than "page is half broken". The empty body in each slot is
          a muted "+ Add to [slot]" CTA that routes through the
          composer-focus path. Framer Motion `layout` keeps height
          transitions smooth when entries come and go. */}
      <motion.div variants={itemVariant} className="space-y-3">
        {MEAL_ORDER.map((mealKey) => (
          <FoodMealSection
            key={mealKey}
            mealKey={mealKey}
            meals={mealSegmentedMeals[mealKey]}
            targetMeal={targetMeal}
            openRowId={openRowId}
            setOpenRowId={setOpenRowId}
            onTargetMeal={handleTargetMeal}
            onDelete={handleDeleteMeal}
            onEdit={setEditingGroup}
          />
        ))}

        {/* Bottom "Copy yesterday's …" button. Renders only when yesterday
            has slots today is missing. Label is intentionally short:
            a single missing slot names it (`Copy yesterday's lunch`),
            two or more collapses to the generic `Copy yesterday's meals`
            — listing every slot was verbose and the user can read the
            toast after tapping to see what was copied where. */}
        {slotsToCopyFromYesterday.length > 0 && (() => {
          const inFlight = copyingMealKey === "__all__";
          const label =
            slotsToCopyFromYesterday.length === 1
              ? `Copy yesterday's ${MEAL_LABELS[slotsToCopyFromYesterday[0]].toLowerCase()}`
              : "Copy yesterday's meals";
          return (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleCopyAllMissingFromYesterday}
                disabled={inFlight}
                aria-label={label}
                className="flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-card border border-border text-xs font-medium text-muted-foreground active:scale-[0.97] disabled:opacity-50 transition-transform"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {label}
              </button>
            </div>
          );
        })()}
      </motion.div>

      <Suspense fallback={null}>
        <ManualFoodLogger
          date={selectedDate}
          /* Pass the user's pre-selected meal slot through so a
             manual entry honours the same "Add to Breakfast" pill
             selection as NL / quick-add. Null when no slot is
             selected — ManualFoodLogger omits the meal field in
             that case (no default slot, matches NL convention). */
          meal={targetMeal}
          open={manualOpen}
          onClose={() => setManualOpen(false)}
        />
      </Suspense>
      <ServingSizeDrawer
        food={offDrawerFood}
        open={offDrawerFood !== null}
        onClose={() => setOffDrawerFood(null)}
        onConfirm={handleOFFConfirm}
      />

      {/* Mount the sheet only while a group is being edited and key it
          on the group id. Each open gets a fresh component instance so
          the stepper's local target state can't be stomped by a parent
          re-render rebuilding the `source` prop with a new identity. */}
      {editingGroup && (
        <EditServingsSheet
          key={editingGroup.id}
          source={{
            foodName: editingGroup.foodName,
            currentCount: editingGroup.meals.length,
            currentTotalCalories: editingGroup.meals.reduce((s, m) => s + safeNum(m.totalCalories), 0),
          }}
          onCancel={() => setEditingGroup(null)}
          onSave={applyServingsChange}
        />
      )}
      {/* Suspicious-value override prompt for the NL parse path.
          AI-parsed and locally-parsed entries with a single item
          above the warn threshold (5000 cal / 300g protein etc)
          land here. Save anyway commits the entry as-is; Edit
          dismisses the dialog and resets parsing state so the
          user can adjust their input. */}
      <ConfirmDialog
        open={nlWarnTitle !== null}
        title={nlWarnTitle ?? ""}
        description={nlWarnDescription}
        confirmLabel="Save anyway"
        cancelLabel="Edit"
        onConfirm={async () => {
          const save = nlPendingSave;
          setNlWarnTitle(null);
          setNlPendingSave(null);
          if (save) await save();
        }}
        onCancel={() => {
          setNlWarnTitle(null);
          setNlPendingSave(null);
          setNlParsing(false);
        }}
      />
    </motion.div>
  );
}
