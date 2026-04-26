import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { THEME } from "@/lib/theme";
import { useDailyLogs } from "@/hooks/useFirestore";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { formatCalories, CALORIE_UNIT } from "@/utils/formatNutrition";

const itemVariant = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};
const TAP_EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const ManualFoodLogger = lazy(() => import("@/components/ManualFoodLogger").then(m => ({ default: m.ManualFoodLogger })));
import { useMeals, type Meal } from "@/hooks/useMeals";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { parseFoodText, getFoodSuggestions } from "@/lib/nlFoodParser";
import type { ParsedFood, FoodSuggestion } from "@/lib/nlFoodParser";
import {
  Utensils,
  Plus,
  SendHorizontal,
  PenLine,
  RotateCcw,
  Star,
  X,
} from "lucide-react";
const FoodAnalyzer = lazy(() => import("@/components/FoodAnalyzer"));
import { ServingSizeDrawer } from "@/components/nutrition/ServingSizeDrawer";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";
import { useSubscription } from "@/lib/subscription";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { useEffectiveTargets } from "@/hooks/useEffectiveTargets";
import FoodHeroCard from "@/components/food/FoodHeroCard";
import FoodRow, { type FoodRowGroup } from "@/components/food/FoodRow";
import FoodDateBar from "@/components/food/FoodDateBar";
import EditServingsSheet from "@/components/food/EditServingsSheet";
import MealMacroBar from "@/components/food/MealMacroBar";
import { useScanUsage } from "@/hooks/useScanUsage";
import ScanQuotaIndicator from "@/components/food/ScanQuotaIndicator";
import { useScanButtonOverrides } from "@/components/food/scanButtonOverrides";
import ScanMealButton from "@/components/food/ScanMealButton";

const DEFAULT_QUICK_MEALS = [
  { name: "Grilled Chicken & Rice", cal: 450, pro: 40, carb: 45, fat: 12 },
  { name: "Protein Shake", cal: 250, pro: 30, carb: 20, fat: 5 },
  { name: "Oatmeal & Banana", cal: 350, pro: 10, carb: 60, fat: 8 },
  { name: "Eggs on Toast", cal: 380, pro: 22, carb: 30, fat: 18 },
  { name: "Greek Yoghurt & Berries", cal: 200, pro: 15, carb: 25, fat: 5 },
  { name: "Tuna Salad", cal: 300, pro: 35, carb: 10, fat: 12 },
];

// Rotating placeholder examples — shown in the NL input when empty +
// unfocused. Each one is a real string the parser handles, so they
// serve as both decoration and a working tutorial.
const NL_EXAMPLE_PROMPTS = [
  "What did you eat?",
  "200g chicken & rice",
  "2 eggs and toast",
  "Protein shake with banana",
  "Greek yoghurt & berries",
  "Large coffee, no sugar",
];

// Meal slot ordering and display labels — true constants, defined at module
// scope so the references are stable across renders. (Previously declared
// inside the Food component body which made every render produce a new
// array / object identity, defeating any useMemo that closed over them.)
const MEAL_ORDER = ["breakfast", "lunch", "snacks", "dinner"] as const;
const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

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
  const [targetMeal, setTargetMeal] = useState<"breakfast" | "lunch" | "snacks" | "dinner" | null>(null);

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

  const [offResults, setOffResults] = useState<OFFResult[]>([]);
  const [, setOffLoading] = useState(false);
  const offDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [offDrawerFood, setOffDrawerFood] = useState<OFFResult | null>(null);

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

  // Split meal keys into populated vs empty so the renderer can show
  // populated cards in MEAL_ORDER and roll empty slots into a single
  // compact chip row at the bottom — instead of three dashed boxes
  // sandwiching the actual content.
  const populatedMealKeys = useMemo(
    () => MEAL_ORDER.filter((k) => mealSegmentedMeals[k].length > 0),
    [mealSegmentedMeals],
  );
  const emptyMealKeys = useMemo(
    () => MEAL_ORDER.filter((k) => mealSegmentedMeals[k].length === 0),
    [mealSegmentedMeals],
  );

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

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    setSelectedDate(format(addDays(d, delta), "yyyy-MM-dd"));
  };

  const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");

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
  const showSuggestions = suggestionsActive && (suggestions.length > 0 || offResults.length > 0);

  const offSearchQuery = useMemo(() => {
    const parts = nlInput.split(/,/);
    const lastPart = (parts[parts.length - 1] || "").trim();
    return lastPart.length >= 2 && suggestionsActive ? lastPart : null;
  }, [nlInput, suggestionsActive]);

  const [prevOffQuery, setPrevOffQuery] = useState(offSearchQuery);
  if (offSearchQuery !== prevOffQuery) {
    setPrevOffQuery(offSearchQuery);
    if (offSearchQuery === null) {
      setOffResults([]);
      setOffLoading(false);
    }
  }

  useEffect(() => {
    if (!offSearchQuery) return;
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
      } catch {
        setOffResults([]);
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
          portionSize: "1 serving",
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
      toast.success(`${items.length} item${items.length > 1 ? "s" : ""} logged!`, { id: "food-nl-success" });
    } catch {
      toast.error("Failed to save. Please try again.", { id: "food-save-error" });
    }
    setNlParsing(false);
  };

  // Edit-servings state. The sheet itself (EditServingsSheet) owns
  // the stepper's target value — Food.tsx just tracks which group is
  // open and persists the change when the user taps Save.
  const [editingGroup, setEditingGroup] = useState<{ foodName: string; meals: Meal[] } | null>(null);

  const applyServingsChange = async (targetCount: number) => {
    if (!user || !editingGroup) return;
    const { meals: groupMeals } = editingGroup;
    const currentCount = groupMeals.length;
    if (targetCount === currentCount || targetCount < 1) {
      setEditingGroup(null);
      return;
    }
    haptic("light");
    try {
      if (targetCount > currentCount) {
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
      } else {
        const removes = currentCount - targetCount;
        const toRemove = groupMeals.slice(-removes);
        for (const m of toRemove) {
          await deleteMeal(m.id);
        }
      }
      setEditingGroup(null);
      setOpenRowId(null);
      toast.success(`Updated to ${targetCount} ${targetCount === 1 ? "serving" : "servings"}`, {
        id: `food-edit-${editingGroup.foodName}`,
      });
    } catch {
      toast.error("Couldn't update. Try again.", { id: "food-edit-error" });
    }
  };

  const handleDeleteMeal = (mealId: string, foodName: string) => {
    // 1. Optimistic hide — the row disappears instantly and the hero card
    //    totals update as if the meal is gone. Close any open swipe state
    //    so the UI settles cleanly.
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.add(mealId);
      return next;
    });
    setOpenRowId(null);

    // 2. Schedule the actual Firestore delete after the undo window.
    const timeoutId = setTimeout(() => {
      deleteMeal(mealId);
      // Don't remove from pendingDeleteIds here. The Firestore onSnapshot
      // will drop the meal from the meals array, making the pending ID a
      // harmless no-op filter on a non-existent entry. Removing from pending
      // BEFORE onSnapshot confirms the delete causes a brief flash where the
      // meal reappears in the list (the "automatically adds back" bug).
    }, 3000);

    // 3. Toast with Undo. If the user taps it, cancel the timer AND remove
    //    the id from pending — the row reappears, ring ticks back up, done.
    toast(`${foodName} deleted`, {
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timeoutId);
          setPendingDeleteIds((prev) => {
            const next = new Set(prev);
            next.delete(mealId);
            return next;
          });
        },
      },
      duration: 3000,
    });
  };

  const handleTargetMeal = (mealKey: "breakfast" | "lunch" | "snacks" | "dinner") => {
    haptic();
    // Toggle off if same meal tapped again
    if (targetMeal === mealKey) {
      setTargetMeal(null);
      return;
    }
    setTargetMeal(mealKey);
    // Scroll input into view then focus
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => inputRef.current?.focus(), 300);
    }, 50);
  };

  // Merged Quick Add source: time-relevant favourites first (they're tagged
  // by time of day so breakfast foods bubble up at breakfast), then fill
  // from recent meal history (top unique names), then a seeded fallback.
  // Dedupe is by normalized food name across all three sources — previously
  // a "Pasta with Sauce" favourite was listed twice (once via QuickRelog,
  // once via the history-derived row) which was the duplicate the user
  // flagged. Cap at 5 entries to keep the row scannable.
  const quickMeals = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{
      name: string;
      cal: number;
      pro: number;
      carb: number;
      fat: number;
      portionSize: string;
    }> = [];

    const push = (entry: typeof items[number]) => {
      const key = entry.name.toLowerCase().trim();
      if (!key || seen.has(key) || items.length >= 5) return;
      seen.add(key);
      items.push(entry);
    };

    // 1. Time-relevant favourites (richest data — known portion size)
    for (const f of getTimeRelevant(new Date().getHours(), 10)) {
      push({
        name: f.name,
        cal: f.calories,
        pro: f.protein,
        carb: f.carbs,
        fat: f.fat,
        portionSize: f.servingSize || "1 serving",
      });
    }

    // 2. Recent meal history
    for (const meal of meals) {
      push({
        name: meal.foodName,
        cal: meal.totalCalories || 0,
        pro: meal.totalProtein || 0,
        carb: meal.totalCarbs || 0,
        fat: meal.totalFat || 0,
        portionSize: "1 serving",
      });
    }

    // 3. Seeded defaults so first-time users still see suggestions
    if (items.length < 3) {
      for (const d of DEFAULT_QUICK_MEALS) {
        push({ ...d, portionSize: "1 serving" });
      }
    }

    return items;
  }, [meals, getTimeRelevant]);

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
      className="space-y-4.5 pb-28"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
    >
      <FoodDateBar
        selectedDate={selectedDate}
        isToday={isToday}
        onPrev={() => changeDate(-1)}
        onNext={() => changeDate(1)}
        onPick={(next) => setSelectedDate(next)}
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

      {/* Input area — text field stacked above full-width Scan CTA.
          Leading PenLine icon signals "write / input" without the
          Sparkles+purple AI-chatbot connotation (the previous iteration
          looked like a Gemini-style input, which clashed with the rest
          of the Food page's warm nutrition palette). Focus state uses
          the nutrition orange so the accent ties into the macros, the
          scan button, and the hero ring — one consistent Food colour
          instead of introducing a brand-purple in a nutrition context. */}
      <motion.div variants={itemVariant} className="pb-2">
        <div className="relative">
          <PenLine
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors",
              inputFocused ? "" : "text-muted-foreground",
            )}
            style={inputFocused ? { color: THEME.semantic.nutrition } : undefined}
          />
          <textarea
            ref={inputRef}
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            onFocus={() => { setSuggestionsActive(true); setInputFocused(true); }}
            onBlur={() => { setInputFocused(false); setTimeout(() => setSuggestionsActive(false), 200); }}
            onKeyDown={(e) => {
              // Return / Enter submits. Two-tap confirm when the
              // suggestion dropdown is active so the parser doesn't
              // fire while the user is still mid-selection — first
              // tap dismisses, second tap sends.
              //
              // No Shift+Enter newline or Escape branch: this app is
              // mobile-first and those keys don't exist on iOS/Android
              // software keyboards. Commas in a single line cover the
              // multi-item use case ("chicken, rice, 2 eggs").
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (showSuggestions) {
                setSuggestionsActive(false);
                return;
              }
              if (!nlInput.trim() || nlParsing) return;
              haptic();
              handleNLParse();
            }}
            placeholder={
              targetMeal
                ? `Adding to ${MEAL_LABELS[targetMeal]}…`
                : NL_EXAMPLE_PROMPTS[placeholderIdx]
            }
            aria-label="What did you eat"
            rows={1}
            maxLength={500}
            className="w-full pl-10 pr-11 py-3.5 rounded-xl border bg-card text-foreground text-sm resize-none transition-all duration-200 ease-out"
            style={{
              // Pure white (bg-card) instead of the grey --input-fill so
              // the composer reads as a peer of the calorie hero card and
              // macro cards (all white) instead of melting into the grey
              // grouped-background. Shadow bumped to match card elevation.
              borderColor: inputFocused
                ? "rgba(217,136,78,0.5)" // nutrition orange, 50%
                : "rgba(0,0,0,0.06)",
              outline: "none",
              boxShadow: inputFocused
                ? "0 4px 14px -8px rgba(217,136,78,0.28), 0 0 0 2.5px rgba(217,136,78,0.11)"
                : "0 1px 6px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.025)",
            }}
          />
          {nlInput.trim() && (
            <button type="button" onClick={() => { haptic(); handleNLParse(); }} disabled={nlParsing}
              aria-label="Log meal"
              className={cn("absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all active:scale-90", nlParsing ? "opacity-50" : "")}
              style={{ color: THEME.semantic.nutrition }}>
              <SendHorizontal className="w-5 h-5" />
            </button>
          )}
          {!nlInput.trim() && targetMeal && (
            <button type="button" onClick={() => { haptic("light"); setTargetMeal(null); }}
              aria-label={`Cancel adding to ${MEAL_LABELS[targetMeal]}`}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg active:scale-90 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
          {showSuggestions && (
            <div ref={suggestionsRef} className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto">
              {suggestions.length > 0 && (<div>{suggestions.map((s, i) => (
                <button key={`ai-${i}`} onMouseDown={(e) => e.preventDefault()} onClick={() => handleSuggestionSelect(s)} className="w-full px-4 py-2.5 text-left hover:bg-muted/80 transition-colors flex items-center justify-between gap-2 border-b border-border/30 last:border-0">
                  <span className="text-sm font-medium text-foreground">{s.name} — <span className="text-muted-foreground font-normal">{s.serving}</span></span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">{s.calories} cal · P{s.protein}g · C{s.carbs}g · F{s.fat}g</span>
                </button>
              ))}</div>)}
              {offResults.length > 0 && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                {offResults.map((food, i) => (
                  <button key={`off-${i}`} onMouseDown={(e) => e.preventDefault()} onClick={() => handleOFFSelect(food)} className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{food.name}</p>
                        {food.brand && <p className="text-xs text-muted-foreground truncate">{food.brand}</p>}
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span className="text-orange-500 font-medium">{food.calories} cal</span>
                          <span>&middot;</span><span>P {food.protein}g</span><span>C {food.carbs}g</span><span>F {food.fat}g</span>
                          <span className="text-xs">per {food.servingSize}</span>
                        </div>
                      </div>
                      <Plus className="w-4 h-4 text-primary shrink-0 mt-1" />
                    </div>
                  </button>
                ))}
              </motion.div>)}
            </div>
          )}
        </div>
        {(inputFocused || !!nlInput.trim() || !!targetMeal) && (
          <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">Add to</span>
            {MEAL_ORDER.map((mealKey) => {
              const selected = targetMeal === mealKey;
              return (
                <button
                  key={mealKey}
                  type="button"
                  onClick={() => handleTargetMeal(mealKey)}
                  className={cn(
                    "h-7 px-3 rounded-full border text-xs font-medium shrink-0 transition-all active:scale-95",
                    selected
                      ? "border-transparent text-white"
                      : "border-border/80 text-muted-foreground bg-card hover:bg-muted/60"
                  )}
                  style={selected ? { backgroundColor: THEME.semantic.nutrition } : undefined}
                  aria-pressed={selected}
                >
                  {MEAL_LABELS[mealKey]}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-3">
          <ScanMealButton
            onClick={() => { haptic(); scanOverrides.onClick(); }}
            ariaLabel={scanUsage.isUnlimited || scanUsage.remaining > 0 ? "Scan your meal" : "Upgrade to scan your meal"}
            styleOverride={scanOverrides.style}
            statusIcon={scanOverrides.icon}
          />
        </div>
      </motion.div>
      {/* Scan quota indicator — free users only, 3-stage escalation */}
      {!scanUsage.isUnlimited && !scanUsage.loading && (
        <div className="mt-2">
          <ScanQuotaIndicator
            remaining={scanUsage.remaining}
            resetDate={scanUsage.resetDate}
            onUpgrade={handleUpgrade}
          />
        </div>
      )}

      {scanOpen && (
        <Suspense fallback={<div className="py-12 text-center text-muted-foreground text-sm animate-pulse">Loading scanner...</div>}>
          <FoodAnalyzer
            date={selectedDate}
            meal={targetMeal}
            onSaved={() => { setScanOpen(false); setTargetMeal(null); }}
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

      {/* Quick Add — merged section (quick meals + favourites + frequently logged) */}
      {/* Quick Add — single merged surface (favourites + history). Previously
          this was two stacked rows ("Quick add" recents + a separate
          "Quick Add" favourites strip via QuickRelog) which duplicated any
          food that was both recent and favourited. */}
      <motion.div variants={itemVariant} className="mt-3.5">
        <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
          Quick Add
        </p>
        <div className="relative">
          <div
            className="flex gap-2 pb-1 -mx-1 px-1 snap-x snap-mandatory"
            style={{ overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
          >
            {quickMeals.map((meal, i) => (
              <motion.button
                key={`${meal.name}-${i}`}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.16, ease: TAP_EASE }}
                onClick={() => { haptic(); handleQuickMealAdd(meal); }}
                disabled={quickAdding !== null}
                className={cn(
                  "shrink-0 snap-start h-9 px-3.5 rounded-full bg-card border border-border text-[13px] text-foreground whitespace-nowrap transition-all active:scale-95 max-w-[85vw] overflow-hidden text-ellipsis",
                  quickAdding !== null && "opacity-60 cursor-not-allowed"
                )}
              >
                {meal.name} · {meal.cal} kcal
              </motion.button>
            ))}
            <div className="shrink-0 w-4" aria-hidden="true" />
          </div>
          {/* Right-edge fade — signals more chips off-screen instead of
              hard-cutting "Pasta with Sauce · 400 kcal" mid-word. Mirrors
              the History.tsx FilterPills pattern. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-background to-transparent"
          />
        </div>
      </motion.div>


      {/* Meal sections — only populated meals render as full cards.
          Empty slots collapse into a single chip row below (see the
          emptyMealKeys block) instead of dashed placeholders that used
          to sandwich the real data. Framer Motion `layout` (plain, not
          layoutId) so height transitions animate smoothly when entries
          come and go. */}
      {todaysMeals.length > 0 && (
        <motion.div variants={itemVariant} className="space-y-3">
          {populatedMealKeys.map((mealKey) => {
            const meals = mealSegmentedMeals[mealKey];
            const mealCals = meals.reduce((s, m) => s + safeNum(m.totalCalories), 0);

            // Aggregate macros for the micro-bar (change #8)
            const totalPro = meals.reduce((s, m) => s + safeNum(m.totalProtein), 0);
            const totalCarb = meals.reduce((s, m) => s + safeNum(m.totalCarbs), 0);
            const totalFat = meals.reduce((s, m) => s + safeNum(m.totalFat), 0);

            // Latest createdAt for the inline section time. Previously
            // this was the EARLIEST — so adding a second item at 10:10
            // to a section whose first item was at 9:50 left the header
            // stuck at 9:50. "When did you last eat this meal" is the
            // more useful reading, and it matches the user's mental
            // model of "most recent activity in this section".
            let latestDate: Date | null = null;
            for (const m of meals) {
              const ts = m.createdAt;
              if (
                ts &&
                typeof ts === "object" &&
                "toDate" in ts &&
                typeof (ts as { toDate: unknown }).toDate === "function"
              ) {
                const d = (ts as { toDate: () => Date }).toDate();
                if (!latestDate || d > latestDate) latestDate = d;
              }
            }
            const timeLabel = latestDate
              ? format(latestDate, "h:mm a").toUpperCase()
              : null;

            // Group populated items by food name
            const grouped = new Map<
              string,
              {
                id: string;
                foodName: string;
                meals: typeof meals;
                totalCal: number;
                totalPro: number;
                totalCarb: number;
                totalFat: number;
              }
            >();
            for (const m of meals) {
              const key = (m.foodName || "Meal").toLowerCase().trim();
              const existing = grouped.get(key);
              if (existing) {
                existing.meals.push(m);
                existing.totalCal += safeNum(m.totalCalories);
                existing.totalPro += safeNum(m.totalProtein);
                existing.totalCarb += safeNum(m.totalCarbs);
                existing.totalFat += safeNum(m.totalFat);
              } else {
                grouped.set(key, {
                  id: `${mealKey}-${key}`,
                  foodName: m.foodName || "Meal",
                  meals: [m],
                  totalCal: safeNum(m.totalCalories),
                  totalPro: safeNum(m.totalProtein),
                  totalCarb: safeNum(m.totalCarbs),
                  totalFat: safeNum(m.totalFat),
                });
              }
            }
            const groupedEntries = Array.from(grouped.values());

            // ── Populated full card ─────────────────────────────────────
            return (
              <motion.div
                key={mealKey}
                layout
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="bg-card rounded-xl overflow-hidden"
                style={{ boxShadow: "var(--ds-shadow-card)" }}
              >
                {/* Header caption — small uppercase grey matching the hero
                    card's "LIFT + RUN · +250 FUEL" grammar (change #3 + #7) */}
                <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2.5">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/90 font-semibold tabular-nums">
                    <span className="font-semibold">{MEAL_LABELS[mealKey].toUpperCase()}</span>
                    {timeLabel && <> · {timeLabel}</>}
                    {" · "}
                    {formatCalories(mealCals)} {CALORIE_UNIT.toUpperCase()}
                  </p>
                  <button
                    onClick={() => handleTargetMeal(mealKey)}
                    aria-label={`Add food to ${MEAL_LABELS[mealKey]}`}
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-90",
                      targetMeal === mealKey
                        ? "bg-primary text-white"
                        : "border border-black/[0.12] text-muted-foreground"
                    )}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Macro micro-bar (change #8) — 3 segments P/C/F. Sits
                    directly below the caption with 4px breathing room. */}
                <div className="px-3.5 pb-1.5">
                  <MealMacroBar
                    totalProtein={totalPro}
                    totalCarbs={totalCarb}
                    totalFat={totalFat}
                  />
                </div>

                {/* Food rows with swipe-to-delete (change #2). Each row
                    receives the lifted `isOpen` + `onOpenChange` props. */}
                <div className="divide-y divide-border/12">
                  {groupedEntries.map((group) => {
                    const rowGroup: FoodRowGroup = {
                      id: group.id,
                      foodName: group.foodName,
                      items: group.meals.flatMap((m) => m.items ?? []),
                      count: group.meals.length,
                      totalCal: group.totalCal,
                      totalPro: group.totalPro,
                      totalCarb: group.totalCarb,
                      totalFat: group.totalFat,
                    };
                    return (
                      <FoodRow
                        key={group.id}
                        group={rowGroup}
                        isOpen={openRowId === group.id}
                        onOpenChange={(open) =>
                          setOpenRowId(open ? group.id : null)
                        }
                        onDelete={() =>
                          handleDeleteMeal(
                            group.meals[group.meals.length - 1].id,
                            group.foodName
                          )
                        }
                        onEdit={() => { setOpenRowId(null); setEditingGroup(group); }}
                      />
                    );
                  })}
                </div>
              </motion.div>
            );
          })}

          {/* Compact "add a meal" chip row — replaces the per-slot dashed
              boxes that used to sit between populated cards. Each chip
              targets a specific empty slot via handleTargetMeal so the
              user keeps one-tap targeting; the visual weight is much
              lighter than three stacked rows competing with real data. */}
          {emptyMealKeys.length > 0 && (
            <motion.div
              layout
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex flex-wrap gap-2 pt-1"
            >
              {emptyMealKeys.map((mealKey) => (
                <button
                  key={mealKey}
                  type="button"
                  onClick={() => handleTargetMeal(mealKey)}
                  aria-label={`Add food to ${MEAL_LABELS[mealKey]}`}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-muted/50 border border-border/60 text-xs font-medium text-muted-foreground active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  <span>{MEAL_LABELS[mealKey]}</span>
                </button>
              ))}
            </motion.div>
          )}

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
                  className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-card border border-border text-xs font-medium text-muted-foreground active:scale-[0.97] disabled:opacity-50 transition-transform"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {label}
                </button>
              </div>
            );
          })()}
        </motion.div>
      )}

      {/* Empty day state — centered prompt when nothing logged */}
      {todaysMeals.length === 0 && (
        <motion.div variants={itemVariant} className="flex flex-col items-center justify-center py-10 space-y-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${THEME.semantic.nutrition}12` }}>
            <Utensils className="w-5 h-5" style={{ color: THEME.semantic.nutrition, opacity: 0.5 }} />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {isToday
              ? "Start by logging your first meal"
              : selectedDate > format(new Date(), "yyyy-MM-dd")
                ? "Nothing planned"
                : "Nothing logged"}
          </p>
          {isToday && dailyTargets.dayType !== "rest" && (
            <p className="text-xs text-muted-foreground/60 italic">
              {({ lift: "Lift day — fuel up to recover stronger", run: "Run day — carbs are your friend today", both: "Lift + Run day — fuel up for both" } as Record<string, string>)[dailyTargets.dayType]}
            </p>
          )}
        </motion.div>
      )}

      <Suspense fallback={null}>
        <ManualFoodLogger
          date={selectedDate}
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

      <EditServingsSheet
        source={editingGroup ? {
          foodName: editingGroup.foodName,
          currentCount: editingGroup.meals.length,
          currentTotalCalories: editingGroup.meals.reduce((s, m) => s + safeNum(m.totalCalories), 0),
        } : null}
        onCancel={() => setEditingGroup(null)}
        onSave={applyServingsChange}
      />
    </motion.div>
  );
}
