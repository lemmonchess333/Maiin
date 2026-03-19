import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { THEME } from "@/lib/theme";
import { useDailyLogs } from "@/hooks/useFirestore";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { addDays, format } from "date-fns";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
const MotionLink = motion.create(Link);

function haptic(ms = 10) {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
}

const itemVariant = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const WorkoutLogger = lazy(() => import("@/components/WorkoutLogger"));
const ManualFoodLogger = lazy(() => import("@/components/ManualFoodLogger").then(m => ({ default: m.ManualFoodLogger })));
import { useMeals } from "@/hooks/useMeals";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { parseFoodText, getFoodSuggestions } from "@/lib/nlFoodParser";
import type { ParsedFood, FoodSuggestion } from "@/lib/nlFoodParser";
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
} from "lucide-react";
const FoodAnalyzer = lazy(() => import("@/components/FoodAnalyzer"));
import { QuickRelog } from "@/components/nutrition/QuickRelog";
import { ServingSizeDrawer } from "@/components/nutrition/ServingSizeDrawer";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";
import { useSubscription } from "@/lib/subscription";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { tint } from "@/lib/colorUtils";

// Quick-add default meals (moved from ManualFoodLogger)
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

export default function Log() {
  const { user, profile, updateProfile } = useAuth();
  const { saveLog } = useDailyLogs();
  const { getWorkoutsForDate } = useWorkouts();

  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );

  const [activeTab, setActiveTab] = useState<"workout" | "food">("workout");
  const location = useLocation();

  useEffect(() => {
    if (location.state?.tab) {
      const apply = () => { setActiveTab(location.state.tab); };
      apply();
    }
  }, [location.state]);

  const [scanOpen, setScanOpen] = useState(false);
  const [nlInput, setNlInput] = useState("");
  const [nlParsing, setNlParsing] = useState(false);
  const [suggestionsActive, setSuggestionsActive] = useState(true);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { addFavourite } = useFoodFavourites();
  const { isPro } = useSubscription();
  const { analyzeFoodText } = useFoodAnalysis();

  // OpenFoodFacts search state
  const [offResults, setOffResults] = useState<OFFResult[]>([]);
  const [, setOffLoading] = useState(false);
  const offDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual bottom sheet state
  const [manualOpen, setManualOpen] = useState(false);

  // Serving size drawer for OFF results
  const [offDrawerFood, setOffDrawerFood] = useState<OFFResult | null>(null);

  const dateInputRef = useRef<HTMLInputElement>(null);

  const todaysWorkouts = getWorkoutsForDate(selectedDate);

  const { meals, getMealsForDate, getDailyTotals, deleteMeal } = useMeals();
  const todaysMeals = getMealsForDate(selectedDate);
  const dailyTotals = getDailyTotals(selectedDate);

  const safeNum = (value: unknown): number => {
    const num = Number(value);
    return isNaN(num) || value == null ? 0 : num;
  };

  // Common meals: ranked by frequency, toggle to add/remove
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
      // Remove: find the meal we added and delete it
      const added = todaysMeals.find(
        (m) => m.foodName?.trim().toLowerCase() === key
      );
      if (added) await deleteMeal(added.id);
      setSelectedCommonIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      // Add
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

  // Macro colors — semantic palette
  const macroColors = {
    calories: THEME.semantic.nutrition,
    protein: THEME.semantic.hydration,
    carbs: THEME.semantic.activity,
    fat: THEME.semantic.nutrition,
  };

  // Auto-save daily log when workouts or meals change
  useEffect(() => {
    const workoutCount = todaysWorkouts.length;
    const mealCount = todaysMeals.length;
    if (workoutCount === 0 && mealCount === 0) return;

    saveLog({
      date: selectedDate,
      workouts: workoutCount,
      meals: mealCount,
      hasPR: false,
      notes: "",
    });
  }, [todaysWorkouts.length, todaysMeals.length, selectedDate, saveLog]);

  // Update streak helper
  const updateStreak = async () => {
    if (!profile) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(addDays(new Date(), -1), "yyyy-MM-dd");
    let newStreak = profile.currentStreak || 0;

    if (selectedDate === today) {
      if (profile.lastLogDate === yesterday || profile.lastLogDate === today) {
        if (profile.lastLogDate !== today) {
          newStreak += 1;
        }
      } else {
        newStreak = 1;
      }
      await updateProfile({
        currentStreak: newStreak,
        lastLogDate: today,
      });
    }
  };

  const handleWorkoutSaved = async () => {
    await updateStreak();
    toast.success("Workout logged!");
  };

  // Date navigation using date-fns addDays (prevents 2-day skip bug)
  const changeDate = (delta: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    setSelectedDate(format(addDays(d, delta), "yyyy-MM-dd"));
  };

  const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");

  // Derive food suggestions from input (no useEffect needed)
  const suggestions = useMemo(() => {
    const parts = nlInput.split(/,/);
    const lastPart = (parts[parts.length - 1] || "").trim();
    return lastPart.length >= 2 ? getFoodSuggestions(lastPart, 4) : [];
  }, [nlInput]);
  const showSuggestions = suggestionsActive && (suggestions.length > 0 || offResults.length > 0);

  // Derive whether OFF search should be active
  const offSearchQuery = useMemo(() => {
    const parts = nlInput.split(/,/);
    const lastPart = (parts[parts.length - 1] || "").trim();
    return lastPart.length >= 2 && suggestionsActive ? lastPart : null;
  }, [nlInput, suggestionsActive]);

  // Clear results immediately when query becomes invalid (during render)
  const [prevOffQuery, setPrevOffQuery] = useState(offSearchQuery);
  if (offSearchQuery !== prevOffQuery) {
    setPrevOffQuery(offSearchQuery);
    if (offSearchQuery === null) {
      setOffResults([]);
      setOffLoading(false);
    }
  }

  // OpenFoodFacts search triggered when query is valid
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
          .filter((p: { product_name?: string; nutriments?: Record<string, number> }) => p.product_name && p.nutriments)
          .map((p: { product_name?: string; nutriments?: Record<string, number>; brands?: string; serving_size?: string }) => ({
            name: p.product_name || "Unknown",
            brand: p.brands || "",
            calories: Math.round(p.nutriments?.["energy-kcal_100g"] || p.nutriments?.["energy-kcal"] || 0),
            protein: Math.round((p.nutriments?.proteins_100g || 0) * 10) / 10,
            carbs: Math.round((p.nutriments?.carbohydrates_100g || 0) * 10) / 10,
            fat: Math.round((p.nutriments?.fat_100g || 0) * 10) / 10,
            servingSize: p.serving_size || "100g",
          }));
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
    // Replace the last segment with the selected suggestion
    const parts = nlInput.split(/,/);
    // Preserve leading quantity if present
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
        items: [{
          name: food.name,
          portionSize: s !== 1 ? `${s}x ${food.servingSize}` : food.servingSize,
          calories: Math.round(food.calories * s),
          protein: Math.round(food.protein * s),
          carbs: Math.round(food.carbs * s),
          fat: Math.round(food.fat * s),
        }],
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

    // Zero-calorie warning for local parser results
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
    const timeoutId = setTimeout(() => { deleteMeal(mealId); }, 3000);
    toast(`${foodName} deleted`, {
      action: {
        label: "Undo",
        onClick: () => { clearTimeout(timeoutId); },
      },
      duration: 3000,
    });
  };

  const handleQuickRelog = async (fav: { name: string; calories: number; protein: number; carbs: number; fat: number; fiber?: number; sugar?: number; sodium?: number; servingSize: string }) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "users", user.uid, "meals"), {
        date: selectedDate,
        foodName: fav.name,
        items: [{ name: fav.name, portionSize: fav.servingSize, calories: fav.calories, protein: fav.protein, carbs: fav.carbs, fat: fav.fat, fiber: fav.fiber, sugar: fav.sugar, sodium: fav.sodium }],
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

  // Quick-add meals from user history or defaults
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

  const handleQuickMealAdd = async (meal: typeof DEFAULT_QUICK_MEALS[0]) => {
    if (!user || quickAdding) return;
    setQuickAdding(meal.name);
    try {
      await addDoc(collection(db, "users", user.uid, "meals"), {
        date: selectedDate,
        foodName: meal.name,
        items: [{ name: meal.name, portionSize: "1 serving", calories: meal.cal, protein: meal.pro, carbs: meal.carb, fat: meal.fat }],
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
    <motion.div className="space-y-6" initial="hidden" animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
      <motion.div variants={itemVariant}>
        <h1 className="text-xl font-bold text-foreground">Log Activity</h1>
        <p className="text-sm text-muted-foreground">
          Record your daily progress
        </p>
      </motion.div>

      {/* Date Switcher */}
      <motion.div variants={itemVariant} className="flex items-center justify-between rounded-2xl p-3"
        style={{ background: `linear-gradient(135deg, ${THEME.brand}12 0%, transparent 60%)` }}>
        <button
          onClick={() => { haptic(); changeDate(-1); }}
          aria-label="Previous day"
          className="p-2 rounded-lg hover:bg-muted active:scale-[0.93] transition-all focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ChevronLeft aria-hidden="true" className="w-4 h-4 text-foreground" />
        </button>

        <button
          onClick={() => dateInputRef.current?.showPicker?.()}
          aria-label="Select date"
          className="text-center flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-primary focus-visible:rounded-lg"
        >
          <CalendarDays aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {isToday
                ? "Today"
                : format(new Date(selectedDate + "T12:00:00"), "EEE, MMM d")}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(selectedDate + "T12:00:00"), "MMMM d, yyyy")}
            </p>
          </div>
        </button>

        {/* Hidden native date picker */}
        <input
          ref={dateInputRef}
          type="date"
          value={selectedDate}
          aria-label="Select date"
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          className="sr-only"
        />

        <button
          onClick={() => { haptic(); changeDate(1); }}
          aria-label="Next day"
          className="p-2 rounded-lg hover:bg-muted active:scale-[0.93] transition-all focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ChevronRight aria-hidden="true" className="w-4 h-4 text-foreground" />
        </button>
      </motion.div>

      {/* Tabs — Workout / Food */}
      <motion.div variants={itemVariant} className="flex gap-1 bg-muted rounded-xl p-1" role="tablist">
        {([
          { key: "workout" as const, label: "Workout", Icon: Dumbbell },
          { key: "food" as const, label: "Food", Icon: UtensilsCrossed },
        ]).map(({ key, label, Icon }) => (
          <motion.button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            whileTap={{ scale: 0.97 }}
            onClick={() => { haptic(); setActiveTab(key); }}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5",
              activeTab === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            )}
          >
            <Icon className="w-4 h-4" style={activeTab === key ? { color: THEME.brand } : undefined} /> {label}
          </motion.button>
        ))}
      </motion.div>

      {/* Workout Tab */}
      {activeTab === "workout" && (
        <motion.div variants={itemVariant} className="space-y-4">
          {/* Start a run link */}
          <MotionLink to="/run" whileTap={{ scale: 0.97 }} onClick={() => haptic()} className="flex items-center gap-3 p-3.5 rounded-2xl active:scale-[0.98] transition-transform"
            style={{ background: `linear-gradient(135deg, ${THEME.running}12 0%, transparent 60%)` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.iconBg }}>
              <Footprints className="w-5 h-5" style={{ color: THEME.running }} />
            </div>
            <div>
              <span className="text-sm font-medium text-foreground">Start a run</span>
              <span className="block text-xs text-muted-foreground">Track your route & pace</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
          </MotionLink>

          {/* Today's workout count badge */}
          {todaysWorkouts.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: `linear-gradient(135deg, ${THEME.lifting}10 0%, transparent 60%)` }}>
              <Dumbbell className="w-4 h-4" style={{ color: THEME.lifting }} />
              <span className="text-sm font-medium text-foreground">
                {todaysWorkouts.length} workout{todaysWorkouts.length !== 1 ? "s" : ""} logged today
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                {todaysWorkouts.reduce((s, w) => s + w.totalCalories, 0)} cal
              </span>
            </div>
          )}

          <Suspense fallback={<div className="py-12 text-center text-muted-foreground text-sm animate-pulse">Loading workout tracker...</div>}>
            <WorkoutLogger date={selectedDate} onSaved={handleWorkoutSaved} />
          </Suspense>
        </motion.div>
      )}

      {/* Food Tab */}
      {activeTab === "food" && (
        <motion.div variants={itemVariant} className="space-y-4">
          {/* Daily Totals */}
          <div className="rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${THEME.semantic.nutrition}08 0%, transparent 70%)` }}>
            <div className="grid grid-cols-4 gap-2 text-center">
              {/* Calories */}
              <div
                className="min-w-0 rounded-xl p-3 shadow-sm"
                style={{
                  backgroundColor: tint(macroColors.calories, 0.06),
                  color: macroColors.calories,
                }}
              >
                <Flame className="w-5 h-5 mx-auto mb-1.5" />
                <p className="stat-tile__value tabular-nums">
                  {safeNum(dailyTotals.calories)}
                </p>
                <p className="text-[10px] mt-1">cal</p>
              </div>

              {/* Protein */}
              <div
                className="min-w-0 rounded-xl p-3 shadow-sm"
                style={{
                  backgroundColor: tint(macroColors.protein, 0.06),
                  color: macroColors.protein,
                }}
              >
                <Beef className="w-5 h-5 mx-auto mb-1.5" />
                <p className="stat-tile__value tabular-nums">
                  {safeNum(dailyTotals.protein)}g
                </p>
                <p className="text-[10px] mt-1">protein</p>
              </div>

              {/* Carbs */}
              <div
                className="min-w-0 rounded-xl p-3 shadow-sm"
                style={{
                  backgroundColor: tint(macroColors.carbs, 0.06),
                  color: macroColors.carbs,
                }}
              >
                <Wheat className="w-5 h-5 mx-auto mb-1.5" />
                <p className="stat-tile__value tabular-nums">
                  {safeNum(dailyTotals.carbs)}g
                </p>
                <p className="text-[10px] mt-1">carbs</p>
              </div>

              {/* Fat */}
              <div
                className="min-w-0 rounded-xl p-3 shadow-sm"
                style={{
                  backgroundColor: tint(macroColors.fat, 0.06),
                  color: macroColors.fat,
                }}
              >
                <Cookie className="w-5 h-5 mx-auto mb-1.5" />
                <p className="stat-tile__value tabular-nums">
                  {safeNum(dailyTotals.fat)}g
                </p>
                <p className="text-[10px] mt-1">fat</p>
              </div>
            </div>
          </div>

          {/* Quick Add — horizontal scroll row */}
          <div style={{ marginTop: "14px" }}>
            <p className="text-[11px] uppercase tracking-[0.05em] font-semibold mb-2" style={{ color: THEME.text.muted }}>Quick Add</p>
            <div
              className="flex gap-2.5 pb-1 -mx-1 px-1"
              style={{ overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
            >
              <style>{`.quick-add-scroll::-webkit-scrollbar { display: none; }`}</style>
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
                  style={{
                    width: "180px",
                    padding: "8px 12px",
                    background: `linear-gradient(135deg, ${THEME.semantic.nutrition}08 0%, transparent 70%)`,
                  }}
                >
                  <span className="text-[13px] font-bold text-foreground block truncate">{meal.name}</span>
                  <span className="block text-[11px] text-muted-foreground mt-1">
                    ~{meal.cal} kcal
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Quick Relog Favourites */}
          <QuickRelog onSelect={handleQuickRelog} />

          {/* Common Meals — only shown when no favourites cover them */}
          {commonMeals.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground px-1">Frequently Logged</p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                {commonMeals.map((cm, i) => {
                  const key = cm.foodName?.trim().toLowerCase() ?? "";
                  const isActive = selectedCommonIds.has(key);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleCommonMeal(cm)}
                      className={cn(
                        "shrink-0 px-3 py-2 rounded-full text-xs font-medium border transition-all active:scale-[0.97]",
                        isActive
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-foreground border-border/50 hover:border-primary/50"
                      )}
                    >
                      {cm.foodName} · {safeNum(cm.totalCalories)} cal
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add Food */}
          <div className="rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${THEME.semantic.nutrition}06 0%, transparent 70%)` }}>
            <p className="text-[11px] uppercase tracking-[0.05em] font-semibold" style={{ color: THEME.text.muted }}>Add Food</p>

            {/* Unified smart input */}
            <div className="relative" style={{ marginTop: "10px" }}>
              <textarea
                value={nlInput}
                onChange={(e) => setNlInput(e.target.value)}
                onFocus={() => setSuggestionsActive(true)}
                onBlur={() => {
                  // Delay hiding so click on suggestion registers
                  setTimeout(() => setSuggestionsActive(false), 200);
                }}
                placeholder="Describe what you ate…"
                rows={1}
                maxLength={500}
                className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {/* Unified dropdown: AI Suggestions + Database results */}
              {showSuggestions && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto"
                >
                  {/* AI Suggestions */}
                  {suggestions.length > 0 && (
                    <div>
                      {suggestions.map((s, i) => (
                        <button
                          key={`ai-${i}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSuggestionSelect(s)}
                          className="w-full px-4 py-2.5 text-left hover:bg-muted/80 transition-colors flex items-center justify-between gap-2 border-b border-border/30 last:border-0"
                        >
                          <span className="text-sm font-medium text-foreground">{s.name} — <span className="text-muted-foreground font-normal">{s.serving}</span></span>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {s.calories} cal · P{s.protein}g · C{s.carbs}g · F{s.fat}g
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Database results */}
                  {offResults.length > 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                      {offResults.map((food, i) => (
                        <button
                          key={`off-${i}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleOFFSelect(food)}
                          className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{food.name}</p>
                              {food.brand && (
                                <p className="text-[11px] text-muted-foreground truncate">{food.brand}</p>
                              )}
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                                <span className="text-orange-500 font-medium">{food.calories} cal</span>
                                <span>&middot;</span>
                                <span>P {food.protein}g</span>
                                <span>C {food.carbs}g</span>
                                <span>F {food.fat}g</span>
                                <span className="text-[9px]">per {food.servingSize}</span>
                              </div>
                            </div>
                            <Plus className="w-4 h-4 text-primary shrink-0 mt-1" />
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>
              )}
            </div>

            {/* Log Meal button */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { haptic(); handleNLParse(); }}
              disabled={!nlInput.trim() || nlParsing}
              className={cn(
                "w-full py-3 rounded-[14px] text-[15px] font-bold transition-all text-white flex items-center justify-center gap-1.5",
                (!nlInput.trim() || nlParsing) && "opacity-50 cursor-not-allowed"
              )}
              style={{
                marginTop: "12px",
                background: THEME.gradient.brand,
                boxShadow: "0 4px 16px rgba(124,110,246,0.25)",
              }}
            >
              {isPro && <Sparkles className="w-3.5 h-3.5" />}
              {nlParsing ? "Analyzing..." : "Log Meal"}
            </motion.button>
            {!isPro && (
              <p className="text-[10px] text-muted-foreground text-center mt-1">
                Upgrade to Pro for AI-powered macro estimates
              </p>
            )}

            {/* Scan + Manual buttons — side by side */}
            <div className="flex gap-2" style={{ marginTop: "10px" }}>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => { haptic(); setScanOpen(!scanOpen); }}
                className={cn(
                  "flex-1 py-2 rounded-lg text-[11px] font-medium transition-all flex items-center justify-center gap-1 border",
                  scanOpen
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-border/50 hover:border-primary/30"
                )}
              >
                <ScanBarcode className="w-3.5 h-3.5" /> Scan
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => { haptic(); setManualOpen(true); }}
                className="flex-1 py-2 rounded-lg text-[11px] font-medium transition-all flex items-center justify-center gap-1 border bg-muted text-muted-foreground border-border/50 hover:border-primary/30"
              >
                <UtensilsCrossed className="w-3.5 h-3.5" /> Manual
              </motion.button>
            </div>

            {/* Expanded scan mode */}
            {scanOpen && (
              <Suspense fallback={<div className="py-12 text-center text-muted-foreground text-sm animate-pulse">Loading scanner...</div>}>
                <FoodAnalyzer date={selectedDate} onSaved={() => setScanOpen(false)} />
              </Suspense>
            )}
          </div>

          {/* Logged Today */}
          {todaysMeals.length > 0 && (
            <motion.div variants={itemVariant} className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-foreground px-1">Logged Today</p>
              {todaysMeals.map((m) => (
                <div key={m.id} className="rounded-2xl px-4 py-3" style={{ background: `linear-gradient(135deg, ${THEME.semantic.nutrition}04 0%, transparent 70%)` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm font-semibold text-foreground truncate">{m.foodName || "Meal"}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${macroColors.protein}10`, color: macroColors.protein }}>
                          Protein {safeNum(m.totalProtein)}g
                        </span>
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${macroColors.carbs}10`, color: macroColors.carbs }}>
                          Carbs {safeNum(m.totalCarbs)}g
                        </span>
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${macroColors.fat}10`, color: macroColors.fat }}>
                          Fat {safeNum(m.totalFat)}g
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <p className="text-base font-bold font-mono tabular-nums" style={{ color: THEME.semantic.nutrition }}>
                        {safeNum(m.totalCalories)}
                        <span className="text-[10px] font-normal text-muted-foreground ml-0.5">cal</span>
                      </p>
                      <button onClick={() => handleDeleteMeal(m.id, m.foodName || 'Meal')} aria-label={`Delete ${m.foodName || 'meal'}`} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors active:scale-90 focus-visible:outline-2 focus-visible:outline-primary">
                        <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {m.items && m.items.length > 1 && (
                    <div className="mt-2 pt-2 border-t border-border/30 space-y-0.5">
                      {m.items.map((item, i) => (
                        <p key={i} className="text-[11px] text-muted-foreground">{item.name} · {item.calories} cal</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </motion.div>
          )}

          {/* Manual entry bottom sheet */}
          <Suspense fallback={null}>
            <ManualFoodLogger date={selectedDate} open={manualOpen} onClose={() => setManualOpen(false)} />
          </Suspense>

          {/* Serving size drawer for database results */}
          <ServingSizeDrawer
            food={offDrawerFood}
            open={offDrawerFood !== null}
            onClose={() => setOffDrawerFood(null)}
            onConfirm={handleOFFConfirm}
          />
        </motion.div>
      )}

    </motion.div>
  );
}
