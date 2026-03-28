import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { THEME } from "@/lib/theme";
import { useDailyLogs } from "@/hooks/useFirestore";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";

function haptic(ms = 10) {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
}

const itemVariant = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const ManualFoodLogger = lazy(() => import("@/components/ManualFoodLogger").then(m => ({ default: m.ManualFoodLogger })));
import { useMeals } from "@/hooks/useMeals";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { parseFoodText, getFoodSuggestions } from "@/lib/nlFoodParser";
import type { ParsedFood, FoodSuggestion } from "@/lib/nlFoodParser";
import { parseVoiceInput, formatParsedItems } from "@/lib/voiceFoodParser";
import {
  Dumbbell,
  UtensilsCrossed,
  ChevronLeft,
  ChevronRight,
  Flame,
  Trash2,
  CalendarDays,
  Beef,
  Wheat,
  Cookie,
  ScanBarcode,
  Footprints,
  Sparkles,
  Plus,
  Mic,
} from "lucide-react";
const FoodAnalyzer = lazy(() => import("@/components/FoodAnalyzer"));
import { QuickRelog } from "@/components/nutrition/QuickRelog";
import { ServingSizeDrawer } from "@/components/nutrition/ServingSizeDrawer";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";
import { useSubscription } from "@/lib/subscription";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { tint } from "@/lib/colorUtils";
import { getAdjustedTargets } from "@/lib/phaseNutrition";
import { getTodaySchedule, generateSchedule } from "@/lib/scheduleUtils";
import type { DayType } from "@/lib/types";

const DEFAULT_QUICK_MEALS = [
  { name: "Grilled Chicken & Rice", cal: 450, pro: 40, carb: 45, fat: 12 },
  { name: "Protein Shake", cal: 250, pro: 30, carb: 20, fat: 5 },
  { name: "Oatmeal & Banana", cal: 350, pro: 10, carb: 60, fat: 8 },
  { name: "Eggs on Toast", cal: 380, pro: 22, carb: 30, fat: 18 },
  { name: "Greek Yoghurt & Berries", cal: 200, pro: 15, carb: 25, fat: 5 },
  { name: "Tuna Salad", cal: 300, pro: 35, carb: 10, fat: 12 },
];

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
  const { user, profile } = useAuth();
  const { saveLog } = useDailyLogs();

  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [scanOpen, setScanOpen] = useState(false);
  const [nlInput, setNlInput] = useState("");
  const [nlParsing, setNlParsing] = useState(false);
  const [suggestionsActive, setSuggestionsActive] = useState(true);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { addFavourite } = useFoodFavourites();
  const { isPro } = useSubscription();
  const { analyzeFoodText } = useFoodAnalysis();
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in this browser.");
      return;
    }
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      toast.error("Could not capture voice. Please try again.");
    };
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      const parsed = parseVoiceInput(transcript);
      const text = parsed.length > 0 ? formatParsedItems(parsed) : transcript;
      setNlInput((prev) => (prev ? prev + ", " + text : text));
      setSuggestionsActive(true);
    };
    recognition.start();
  };

  const [offResults, setOffResults] = useState<OFFResult[]>([]);
  const [, setOffLoading] = useState(false);
  const offDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [offDrawerFood, setOffDrawerFood] = useState<OFFResult | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const { meals, getMealsForDate, getDailyTotals, deleteMeal } = useMeals();
  const todaysMeals = getMealsForDate(selectedDate);
  const dailyTotals = getDailyTotals(selectedDate);

  const [prevDate, setPrevDate] = useState(selectedDate);
  if (prevDate !== selectedDate) {
    setPrevDate(selectedDate);
  }

  const safeNum = (value: unknown): number => {
    const num = Number(value);
    return isNaN(num) || value == null ? 0 : num;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getMealCategory = (createdAt: any): string => {
    if (!createdAt || !createdAt.toDate) return "snacks";
    const hour = createdAt.toDate().getHours();
    if (hour < 11) return "breakfast";
    if (hour < 14) return "lunch";
    if (hour < 17) return "snacks";
    return "dinner";
  };

  const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snacks"] as const;
  const MEAL_LABELS: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snacks: "Snacks" };

  const mealSegmentedMeals = useMemo(() => {
    const segments: Record<string, typeof todaysMeals> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    for (const meal of todaysMeals) {
      const cat = getMealCategory(meal.createdAt);
      segments[cat].push(meal);
    }
    return segments;
  }, [todaysMeals]);

  function glowStyle(current: number, target: number, color: string): React.CSSProperties {
    const ratio = Math.min(1, current / (target || 1));
    const spread = Math.round(ratio * 85);
    const opacity = Math.round(ratio * 0.18 * 255).toString(16).padStart(2, "0");
    return {
      background: `radial-gradient(circle at 50% 28%, ${color}${opacity} 0%, transparent ${spread}%)`,
    };
  }

  const commonMeals = useMemo(() => {
    const freq = new Map<string, { count: number; meal: typeof meals[0] }>();
    for (const m of meals) {
      const key = m.foodName?.trim().toLowerCase();
      if (!key) continue;
      const existing = freq.get(key);
      if (existing) {
        existing.count++;
      } else {
        freq.set(key, { count: 1, meal: m });
      }
    }
    return Array.from(freq.values())
      .filter((v) => v.count >= 3)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map((v) => v.meal);
  }, [meals]);

  const [selectedCommonIds, setSelectedCommonIds] = useState<Set<string>>(new Set());

  const toggleCommonMeal = async (meal: typeof meals[0]) => {
    const key = meal.foodName?.trim().toLowerCase() ?? "";
    if (selectedCommonIds.has(key)) {
      const added = todaysMeals.find((m) => m.foodName?.trim().toLowerCase() === key);
      if (added) await deleteMeal(added.id);
      setSelectedCommonIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      if (!user) return;
      try {
        await addDoc(collection(db, "users", user.uid, "meals"), {
          date: selectedDate,
          foodName: meal.foodName,
          items: meal.items ?? [],
          totalCalories: meal.totalCalories ?? 0,
          totalProtein: meal.totalProtein ?? 0,
          totalCarbs: meal.totalCarbs ?? 0,
          totalFat: meal.totalFat ?? 0,
          confidence: "database",
          createdAt: Timestamp.now(),
        });
        setSelectedCommonIds((prev) => new Set(prev).add(key));
        toast.success(`${meal.foodName} added`);
      } catch {
        toast.error("Failed to save. Please try again.");
      }
    }
  };

  const macroColors = {
    calories: THEME.semantic.nutrition,
    protein: THEME.semantic.hydration,
    carbs: THEME.semantic.activity,
    fat: THEME.semantic.nutrition,
  };


  const todayDayType = useMemo(() => {
    const schedule =
      profile?.weekSchedule && profile.weekSchedule.length === 7
        ? profile.weekSchedule
        : generateSchedule(profile?.weeklyWorkoutsTarget || 3, profile?.weeklyRunsTarget || 2);
    const today = getTodaySchedule(schedule);
    return (today?.type || "rest") as DayType;
  }, [profile]);

  const adjustedTargets = useMemo(() => {
    if (!profile) return null;
    return getAdjustedTargets(profile, todayDayType);
  }, [profile, todayDayType]);

  const macroTargets = {
    calories: adjustedTargets?.calories || profile?.targetCalories || 2200,
    protein: adjustedTargets?.protein || profile?.targetProtein || 160,
    carbs: adjustedTargets?.carbs || profile?.targetCarbs || 250,
    fat: adjustedTargets?.fat || profile?.targetFat || 70,
  };

  useEffect(() => {
    const mealCount = todaysMeals.length;
    if (mealCount === 0) return;
    saveLog({
      date: selectedDate,
      workouts: 0,
      meals: mealCount,
      hasPR: false,
      notes: "",
    });
  }, [todaysMeals.length, selectedDate, saveLog]);

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    setSelectedDate(format(addDays(d, delta), "yyyy-MM-dd"));
  };

  const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");

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
      toast.success(`${food.name} added!`);
    } catch {
      toast.error("Failed to save. Please try again.");
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
      toast.error("Could not parse any foods. Try a different description.");
      setNlParsing(false);
      return;
    }
    if (confidence === "nl-parse") {
      const zeroItems = items.filter((i) => i.calories === 0);
      if (zeroItems.length > 0) {
        toast.warning(
          `Couldn't find macros for: ${zeroItems.map((i) => i.name).join(", ")}. Try searching for accurate data.`
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
      });
      setNlInput("");
      toast.success(`${items.length} item${items.length > 1 ? "s" : ""} logged!`);
    } catch {
      toast.error("Failed to save. Please try again.");
    }
    setNlParsing(false);
  };

  const handleDeleteMeal = (mealId: string, foodName: string) => {
    const timeoutId = setTimeout(() => {
      deleteMeal(mealId);
    }, 3000);
    toast(`${foodName} deleted`, {
      action: { label: "Undo", onClick: () => clearTimeout(timeoutId) },
      duration: 3000,
    });
  };

  const handleQuickRelog = async (fav: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    sugar?: number;
    sodium?: number;
    servingSize: string;
  }) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "users", user.uid, "meals"), {
        date: selectedDate,
        foodName: fav.name,
        items: [
          {
            name: fav.name,
            portionSize: fav.servingSize,
            calories: fav.calories,
            protein: fav.protein,
            carbs: fav.carbs,
            fat: fav.fat,
            fiber: fav.fiber,
            sugar: fav.sugar,
            sodium: fav.sodium,
          },
        ],
        totalCalories: fav.calories,
        totalProtein: fav.protein,
        totalCarbs: fav.carbs,
        totalFat: fav.fat,
        totalFiber: fav.fiber || undefined,
        totalSugar: fav.sugar || undefined,
        totalSodium: fav.sodium || undefined,
        confidence: "favourite",
        createdAt: Timestamp.now(),
      });
      await addFavourite({ ...fav, source: "manual" });
      toast.success(`${fav.name} added!`);
    } catch {
      toast.error("Failed to save. Please try again.");
    }
  };

  const quickMeals = useMemo(() => {
    const seen = new Set<string>();
    const fromHistory: typeof DEFAULT_QUICK_MEALS = [];
    for (const meal of meals) {
      const key = (meal.foodName || "").toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      fromHistory.push({
        name: meal.foodName,
        cal: meal.totalCalories || 0,
        pro: meal.totalProtein || 0,
        carb: meal.totalCarbs || 0,
        fat: meal.totalFat || 0,
      });
      if (fromHistory.length >= 5) break;
    }
    return fromHistory.length >= 3 ? fromHistory : DEFAULT_QUICK_MEALS;
  }, [meals]);

  const [quickAdding, setQuickAdding] = useState<string | null>(null);

  const handleQuickMealAdd = async (meal: (typeof DEFAULT_QUICK_MEALS)[0]) => {
    if (!user || quickAdding) return;
    setQuickAdding(meal.name);
    try {
      await addDoc(collection(db, "users", user.uid, "meals"), {
        date: selectedDate,
        foodName: meal.name,
        items: [
          {
            name: meal.name,
            portionSize: "1 serving",
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
      });
      toast.success(`${meal.name} added!`);
    } catch {
      toast.error("Failed to save. Please try again.");
    }
    setQuickAdding(null);
  };


  return (
    <motion.div
      className="space-y-4 pb-28"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
    >
      {/* Date Switcher */}
      <motion.div
        variants={itemVariant}
        className="flex items-center justify-between rounded-2xl p-3"
        style={{ background: `linear-gradient(135deg, ${THEME.brand}12 0%, transparent 60%)` }}
      >
        <button
          onClick={() => {
            haptic();
            changeDate(-1);
          }}
          aria-label="Previous day"
          className="p-2 rounded-lg hover:bg-muted active:scale-[0.95] transition-all"
        >
          <ChevronLeft aria-hidden="true" className="w-4 h-4 text-foreground" />
        </button>
        <button
          onClick={() => dateInputRef.current?.showPicker?.()}
          aria-label="Select date"
          className="text-center flex items-center gap-2"
        >
          <CalendarDays aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {isToday ? "Today" : format(new Date(selectedDate + "T12:00:00"), "EEE, MMMM d")}
          </p>
        </button>
        <input
          ref={dateInputRef}
          type="date"
          value={selectedDate}
          aria-label="Select date"
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          className="sr-only"
        />
        <button
          onClick={() => {
            haptic();
            changeDate(1);
          }}
          aria-label="Next day"
          className="p-2 rounded-lg hover:bg-muted active:scale-[0.95] transition-all"
        >
          <ChevronRight aria-hidden="true" className="w-4 h-4 text-foreground" />
        </button>
      </motion.div>

      {/* Header */}
      <motion.div variants={itemVariant}>
        <h1 className="text-xl font-extrabold text-foreground">Log Food</h1>
      </motion.div>

      {/* Day-type pill */}
      {isToday && adjustedTargets && todayDayType !== "rest" && (
        <motion.div variants={itemVariant} className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{
              backgroundColor:
                todayDayType === "lift"
                  ? `${THEME.lifting}15`
                  : todayDayType === "run"
                    ? `${THEME.running}15`
                    : `${THEME.lifting}15`,
              color:
                todayDayType === "lift"
                  ? THEME.lifting
                  : todayDayType === "run"
                    ? THEME.running
                    : THEME.lifting,
            }}
          >
            {todayDayType === "lift" ? (
              <Dumbbell className="w-3 h-3" />
            ) : todayDayType === "run" ? (
              <Footprints className="w-3 h-3" />
            ) : (
              <>
                <Dumbbell className="w-3 h-3" />
                <Footprints className="w-3 h-3" />
              </>
            )}
            {adjustedTargets.annotation}
          </span>
        </motion.div>
      )}
      {isToday && adjustedTargets && todayDayType === "rest" && (
        <p className="text-xs" style={{ color: THEME.text.muted }}>
          Rest day targets
        </p>
      )}

      {/* Macro Tiles */}
      <motion.div
        variants={itemVariant}
        className="rounded-2xl p-4"
        style={{
          background: `linear-gradient(135deg, ${THEME.semantic.nutrition}08 0%, transparent 70%)`,
        }}
      >
        <div className="grid grid-cols-4 gap-2 text-center">
          {(
            [
              {
                key: "calories",
                icon: Flame,
                value: dailyTotals.calories,
                target: macroTargets.calories,
                color: macroColors.calories,
                label: "cal",
                suffix: "",
              },
              {
                key: "protein",
                icon: Beef,
                value: dailyTotals.protein,
                target: macroTargets.protein,
                color: macroColors.protein,
                label: "protein",
                suffix: "g",
              },
              {
                key: "carbs",
                icon: Wheat,
                value: dailyTotals.carbs,
                target: macroTargets.carbs,
                color: macroColors.carbs,
                label: "carbs",
                suffix: "g",
              },
              {
                key: "fat",
                icon: Cookie,
                value: dailyTotals.fat,
                target: macroTargets.fat,
                color: macroColors.fat,
                label: "fat",
                suffix: "g",
              },
            ] as const
          ).map(({ key, icon: Icon, value, target, color, label, suffix }) => (
            <div
              key={key}
              className="min-w-0 rounded-xl p-3 shadow-sm relative overflow-hidden"
              style={{ backgroundColor: tint(color, 0.06), color }}
            >
              <div
                className="absolute inset-0 pointer-events-none transition-opacity duration-700"
                style={glowStyle(value, target, color)}
              />
              <div className="relative z-10">
                <Icon className="w-5 h-5 mx-auto mb-1.5" />
                <p className="stat-tile__value tabular-nums">
                  {safeNum(value)}
                  {suffix}
                </p>
                <p className="text-xs mt-1">{label}</p>
                <div
                  className="mt-2 h-1 rounded-full overflow-hidden"
                  style={{ backgroundColor: `${color}15` }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (value / target) * 100)}%`,
                      backgroundColor: color,
                      opacity: 0.6,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Input bar — primary food logging action */}
      <motion.div variants={itemVariant}>
        <div className="relative">
          <textarea
            ref={inputRef}
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            onFocus={() => setSuggestionsActive(true)}
            onBlur={() => { setTimeout(() => setSuggestionsActive(false), 200); }}
            placeholder="Describe what you ate…"
            rows={1}
            maxLength={500}
            className="w-full px-4 py-3 pr-11 rounded-xl bg-muted border border-border/50 text-foreground text-sm resize-none"
          />
          <button type="button" onClick={handleVoiceInput} aria-label={isListening ? "Stop listening" : "Voice input"}
            className={cn("absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all active:scale-90", isListening ? "text-red-500 bg-red-500/10 animate-pulse" : "text-muted-foreground hover:text-primary hover:bg-primary/10")}>
            <Mic className="w-4 h-4" />
          </button>
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
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => { haptic(); handleNLParse(); }} disabled={!nlInput.trim() || nlParsing}
          className={cn("w-full py-3 rounded-xl text-sm font-semibold transition-all text-white flex items-center justify-center gap-1.5", (!nlInput.trim() || nlParsing) && "opacity-50 cursor-not-allowed")}
          style={{ marginTop: 10, backgroundColor: "#7C6BF0", boxShadow: "0 4px 16px rgba(124,110,246,0.25)" }}>
          {isPro && <Sparkles className="w-3.5 h-3.5" />}
          {nlParsing ? "Analyzing..." : "Log Meal"}
        </motion.button>
        <div className="flex gap-2" style={{ marginTop: 8 }}>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => { haptic(); setScanOpen(!scanOpen); }}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 text-white"
            style={{ background: "linear-gradient(135deg, #f07368, #f09060)", boxShadow: "0 2px 10px rgba(240, 115, 104, 0.2)" }}>
            <ScanBarcode className="w-3.5 h-3.5" /> Scan
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => { haptic(); setManualOpen(true); }}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 border bg-muted text-muted-foreground border-border/50 hover:border-primary/30">
            <UtensilsCrossed className="w-3.5 h-3.5" /> Manual
          </motion.button>
        </div>
        {!isPro && <p className="text-xs text-muted-foreground text-center mt-1.5">Upgrade to Pro for AI-powered macro estimates</p>}
        {scanOpen && (
          <Suspense fallback={<div className="py-12 text-center text-muted-foreground text-sm animate-pulse">Loading scanner...</div>}>
            <FoodAnalyzer date={selectedDate} onSaved={() => setScanOpen(false)} />
          </Suspense>
        )}
      </motion.div>

      {/* Quick Add — merged section (quick meals + favourites + frequently logged) */}
      <motion.div variants={itemVariant} style={{ marginTop: "14px" }}>
        <p className="text-xs uppercase tracking-wide font-medium mb-2" style={{ color: THEME.text.muted }}>
          Quick Add
        </p>
        <div
          className="flex gap-2.5 pb-1 -mx-1 px-1"
          style={{ overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
        >
          {quickMeals.map((meal, i) => (
            <motion.button
              key={i}
              whileTap={{ scale: 0.95 }}
              onClick={() => { haptic(); handleQuickMealAdd(meal); }}
              disabled={quickAdding !== null}
              className={cn(
                "shrink-0 text-left border border-border/50 rounded-xl transition-all active:bg-primary/10",
                quickAdding !== null && "opacity-60 cursor-not-allowed"
              )}
              style={{ width: "180px", padding: "8px 12px", background: `linear-gradient(135deg, ${THEME.semantic.nutrition}08 0%, transparent 70%)` }}
            >
              <span className="text-micro font-semibold text-foreground block truncate">{meal.name}</span>
              <span className="block text-xs text-muted-foreground mt-1">~{meal.cal} kcal</span>
            </motion.button>
          ))}
        </div>
        <div className="mt-2">
          <QuickRelog onSelect={handleQuickRelog} />
        </div>
        {commonMeals.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 mt-2" style={{ scrollbarWidth: "none" }}>
            {commonMeals.map((cm, i) => {
              const key = cm.foodName?.trim().toLowerCase() ?? "";
              const isActive = selectedCommonIds.has(key);
              return (
                <button key={i} onClick={() => toggleCommonMeal(cm)}
                  className={cn("shrink-0 px-3 py-2 rounded-full text-xs font-medium border transition-all active:scale-[0.97]",
                    isActive ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-foreground border-border/50 hover:border-primary/50")}>
                  {cm.foodName} · {safeNum(cm.totalCalories)} cal
                </button>
              );
            })}
          </div>
        )}
      </motion.div>


      {/* Meal-segmented food log — only show populated sections */}
      {todaysMeals.length > 0 && (
        <motion.div variants={itemVariant} className="space-y-4">
          {MEAL_ORDER.filter((mealKey) => mealSegmentedMeals[mealKey].length > 0).map((mealKey) => {
            const meals = mealSegmentedMeals[mealKey];
            const mealCals = meals.reduce((s, m) => s + safeNum(m.totalCalories), 0);

            const grouped = new Map<string, { foodName: string; meals: typeof meals; totalCal: number }>();
            for (const m of meals) {
              const key = (m.foodName || "Meal").toLowerCase().trim();
              const existing = grouped.get(key);
              if (existing) {
                existing.meals.push(m);
                existing.totalCal += safeNum(m.totalCalories);
              } else {
                grouped.set(key, { foodName: m.foodName || "Meal", meals: [m], totalCal: safeNum(m.totalCalories) });
              }
            }
            const groupedEntries = Array.from(grouped.values());

          return (
            <div key={mealKey}>
              <div className="flex items-center justify-between px-1 mb-1.5">
                <p className="text-sm font-semibold text-foreground">
                  {MEAL_LABELS[mealKey]}
                  {meals.length > 0 && (
                    <span className="text-xs font-normal text-muted-foreground font-mono tabular-nums ml-1.5">
                      {mealCals} cal
                    </span>
                  )}
                </p>
              </div>
                <div className="bg-card rounded-xl overflow-hidden divide-y divide-border/20">
                  {groupedEntries.map((group) => (
                    <div key={group.foodName} className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                        <p className="text-sm text-foreground truncate">{group.foodName}</p>
                        {group.meals.length > 1 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "rgba(124,107,240,0.1)", color: "#7C6BF0" }}>
                            ×{group.meals.length}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono tabular-nums text-muted-foreground">{group.totalCal} cal</span>
                        <button
                          onClick={() => handleDeleteMeal(group.meals[group.meals.length - 1].id, group.foodName)}
                          aria-label={`Delete ${group.foodName}`}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors active:scale-90"
                        >
                          <Trash2 aria-hidden="true" className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
            </div>
          );
          })}
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
    </motion.div>
  );
}
