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

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

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

  function glowStyle(current: number, target: number, color: string): React.CSSProperties {
    const ratio = Math.min(1, current / (target || 1));
    const opacity = Math.round(ratio * 0.12 * 255).toString(16).padStart(2, '0');
    return {
      backgroundColor: `${color}${opacity}`,
    };
  }

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

  // Day-type-aware nutrition targets
  const todayDayType = useMemo(() => {
    const schedule = profile?.weekSchedule && profile.weekSchedule.length === 7
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
      <header>
        <motion.div variants={itemVariant}>
          <h1 className="text-xl font-bold text-foreground">Log Activity</h1>
          <p className="text-sm text-muted-foreground">
            Record your daily progress
          </p>
        </motion.div>
      </header>

      {/* Date Switcher */}
      <motion.div variants={itemVariant} className="flex items-center justify-between rounded-2xl p-3 accent-edge bg-card"
        style={{ '--accent-edge-color': THEME.brand } as React.CSSProperties}>
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
                : format(new Date(selectedDate + "T12:00:00"), "EEE, MMMM d")}
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
        <section aria-label="Workout logging">
        <motion.div variants={itemVariant} className="space-y-4">
          {/* Start a run link */}
          <MotionLink to="/run" whileTap={{ scale: 0.97 }} onClick={() => haptic()} className="flex items-center gap-3 p-3.5 rounded-2xl active:scale-[0.98] transition-transform accent-edge bg-card"
            style={{ '--accent-edge-color': THEME.running } as React.CSSProperties}>
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
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl accent-edge bg-card"
              style={{ '--accent-edge-color': THEME.lifting } as React.CSSProperties}>
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
        </section>
      )}

      {/* Food Tab */}
      {activeTab === "food" && (
        <section aria-label="Food logging">
        <motion.div variants={itemVariant} className="space-y-4 pb-28">
          {/* Day-type annotation pill */}
          {adjustedTargets && todayDayType !== "rest" && (
            <div className="flex items-center gap-2 mb-2">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                style={{
                  backgroundColor: todayDayType === "lift" ? `${THEME.lifting}15` : todayDayType === "run" ? `${THEME.running}15` : `${THEME.lifting}15`,
                  color: todayDayType === "lift" ? THEME.lifting : todayDayType === "run" ? THEME.running : THEME.lifting,
                }}
              >
                {todayDayType === "lift" ? <Dumbbell className="w-3 h-3" /> : todayDayType === "run" ? <Footprints className="w-3 h-3" /> : <><Dumbbell className="w-3 h-3" /><Footprints className="w-3 h-3" /></>}
                {adjustedTargets.annotation}
              </span>
            </div>
          )}
          {adjustedTargets && todayDayType === "rest" && (
            <p className="text-[11px] mb-2" style={{ color: THEME.text.muted }}>
              Rest day targets
            </p>
          )}

          {/* Daily Totals */}
          <div className="rounded-2xl p-4 accent-edge bg-card" style={{ '--accent-edge-color': THEME.semantic.nutrition } as React.CSSProperties}>
            <div className="grid grid-cols-4 gap-2 text-center">
              {/* Calories */}
              <div
                className="min-w-0 rounded-xl p-3 shadow-sm relative overflow-hidden"
                style={{
                  backgroundColor: tint(macroColors.calories, 0.06),
                  color: macroColors.calories,
                }}
              >
                <div className="absolute inset-0 pointer-events-none transition-opacity duration-700" style={glowStyle(dailyTotals.calories, macroTargets.calories, macroColors.calories)} />
                <div className="relative z-10">
                  <Flame className="w-5 h-5 mx-auto mb-1.5" />
                  <p className="stat-tile__value tabular-nums">
                    {safeNum(dailyTotals.calories)}
                  </p>
                  <p className="text-[11px] mt-1">cal</p>
                  <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ backgroundColor: `${macroColors.calories}15` }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (dailyTotals.calories / macroTargets.calories) * 100)}%`, backgroundColor: macroColors.calories, opacity: 0.6 }} />
                  </div>
                </div>
              </div>

              {/* Protein */}
              <div
                className="min-w-0 rounded-xl p-3 shadow-sm relative overflow-hidden"
                style={{
                  backgroundColor: tint(macroColors.protein, 0.06),
                  color: macroColors.protein,
                }}
              >
                <div className="absolute inset-0 pointer-events-none transition-opacity duration-700" style={glowStyle(dailyTotals.protein, macroTargets.protein, macroColors.protein)} />
                <div className="relative z-10">
                  <Beef className="w-5 h-5 mx-auto mb-1.5" />
                  <p className="stat-tile__value tabular-nums">
                    {safeNum(dailyTotals.protein)}g
                  </p>
                  <p className="text-[11px] mt-1">protein</p>
                  <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ backgroundColor: `${macroColors.protein}15` }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (dailyTotals.protein / macroTargets.protein) * 100)}%`, backgroundColor: macroColors.protein, opacity: 0.6 }} />
                  </div>
                </div>
              </div>

              {/* Carbs */}
              <div
                className="min-w-0 rounded-xl p-3 shadow-sm relative overflow-hidden"
                style={{
                  backgroundColor: tint(macroColors.carbs, 0.06),
                  color: macroColors.carbs,
                }}
              >
                <div className="absolute inset-0 pointer-events-none transition-opacity duration-700" style={glowStyle(dailyTotals.carbs, macroTargets.carbs, macroColors.carbs)} />
                <div className="relative z-10">
                  <Wheat className="w-5 h-5 mx-auto mb-1.5" />
                  <p className="stat-tile__value tabular-nums">
                    {safeNum(dailyTotals.carbs)}g
                  </p>
                  <p className="text-[11px] mt-1">carbs</p>
                  <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ backgroundColor: `${macroColors.carbs}15` }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (dailyTotals.carbs / macroTargets.carbs) * 100)}%`, backgroundColor: macroColors.carbs, opacity: 0.6 }} />
                  </div>
                </div>
              </div>

              {/* Fat */}
              <div
                className="min-w-0 rounded-xl p-3 shadow-sm relative overflow-hidden"
                style={{
                  backgroundColor: tint(macroColors.fat, 0.06),
                  color: macroColors.fat,
                }}
              >
                <div className="absolute inset-0 pointer-events-none transition-opacity duration-700" style={glowStyle(dailyTotals.fat, macroTargets.fat, macroColors.fat)} />
                <div className="relative z-10">
                  <Cookie className="w-5 h-5 mx-auto mb-1.5" />
                  <p className="stat-tile__value tabular-nums">
                    {safeNum(dailyTotals.fat)}g
                  </p>
                  <p className="text-[11px] mt-1">fat</p>
                  <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ backgroundColor: `${macroColors.fat}15` }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (dailyTotals.fat / macroTargets.fat) * 100)}%`, backgroundColor: macroColors.fat, opacity: 0.6 }} />
                  </div>
                </div>
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
                    backgroundColor: `${THEME.semantic.nutrition}0A`,
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
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground px-1">Frequently Logged</p>
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
          <div className="rounded-2xl p-4 bg-card">
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
                className="w-full px-4 py-3 pr-11 rounded-xl bg-muted border border-border/50 text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={handleVoiceInput}
                aria-label={isListening ? "Stop listening" : "Voice input"}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all active:scale-90",
                  isListening
                    ? "text-red-500 bg-red-500/10 animate-pulse"
                    : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                )}
              >
                <Mic className="w-4 h-4" />
              </button>
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
                              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                                <span className="text-orange-500 font-medium">{food.calories} cal</span>
                                <span>&middot;</span>
                                <span>P {food.protein}g</span>
                                <span>C {food.carbs}g</span>
                                <span>F {food.fat}g</span>
                                <span className="text-[11px]">per {food.servingSize}</span>
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
                "w-full py-3 rounded-xl text-[15px] font-bold transition-all text-white flex items-center justify-center gap-1.5",
                (!nlInput.trim() || nlParsing) && "opacity-50 cursor-not-allowed"
              )}
              style={{
                marginTop: "12px",
                backgroundColor: THEME.brand,
              }}
            >
              {isPro && <Sparkles className="w-3.5 h-3.5" />}
              {nlParsing ? "Analyzing..." : "Log Meal"}
            </motion.button>
            {!isPro && (
              <p className="text-[11px] text-muted-foreground text-center mt-1">
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
              <p className="text-[11px] uppercase tracking-widest text-foreground px-1">Logged Today</p>
              {todaysMeals.map((m) => (
                <div key={m.id} className="rounded-2xl px-4 py-3 bg-card">
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
                        <span className="text-[11px] font-normal text-muted-foreground ml-0.5">cal</span>
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
        </section>
      )}

    </motion.div>
  );
}
