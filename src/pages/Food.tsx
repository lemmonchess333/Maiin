import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { THEME } from "@/lib/theme";
import { useDailyLogs } from "@/hooks/useFirestore";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { haptic } from "@/lib/haptic";
import { formatCalories, formatMacro, CALORIE_UNIT } from "@/utils/formatNutrition";

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
  ChevronLeft,
  ChevronRight,
  Flame,
  Trash2,
  CalendarDays,
  Footprints,
  Plus,
  Mic,
  SendHorizontal,
  RotateCcw,
  Camera,
  X,
} from "lucide-react";
const FoodAnalyzer = lazy(() => import("@/components/FoodAnalyzer"));
import { QuickRelog } from "@/components/nutrition/QuickRelog";
import { ServingSizeDrawer } from "@/components/nutrition/ServingSizeDrawer";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";
import { useSubscription } from "@/lib/subscription";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { useDailyTargets } from "@/hooks/useDailyTargets";
import MacroRow from "@/components/food/MacroRow";
import CalorieRing from "@/components/food/CalorieRing";
import { useScanUsage } from "@/hooks/useScanUsage";
import ScanQuotaIndicator from "@/components/food/ScanQuotaIndicator";
import { useScanButtonOverrides } from "@/components/food/scanButtonOverrides";

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
  const { user } = useAuth();
  const { saveLog } = useDailyLogs();

  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [scanOpen, setScanOpen] = useState(false);
  const [nlInput, setNlInput] = useState("");
  const [nlParsing, setNlParsing] = useState(false);
  const [suggestionsActive, setSuggestionsActive] = useState(true);
  const [targetMeal, setTargetMeal] = useState<"breakfast" | "lunch" | "snacks" | "dinner" | null>(null);
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
  const macroSentinelRef = useRef<HTMLDivElement>(null);
  const [showStickyHeader, setShowStickyHeader] = useState(false);

  const selectedDateObj = useMemo(() => new Date(selectedDate + "T12:00:00"), [selectedDate]);
  const dailyTargets = useDailyTargets(selectedDateObj);
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
  const dailyTotals = getDailyTotals(selectedDate);

  const [prevDate, setPrevDate] = useState(selectedDate);
  if (prevDate !== selectedDate) {
    setPrevDate(selectedDate);
    if (targetMeal) setTargetMeal(null);
  }

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

  const MEAL_ORDER = ["breakfast", "lunch", "snacks", "dinner"] as const;
  const MEAL_LABELS: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snacks: "Snacks" };

  const mealSegmentedMeals = useMemo(() => {
    const segments: Record<string, typeof todaysMeals> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    for (const meal of todaysMeals) {
      const cat = getMealCategory(meal);
      segments[cat].push(meal);
    }
    return segments;
  }, [todaysMeals]);

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

  const copyFromYesterday = async (mealKey: string) => {
    const items = yesterdaySegmented[mealKey];
    if (!items.length || !user) return;
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
    }
    haptic(15);
    toast.success(`Copied ${items.length} item${items.length > 1 ? "s" : ""} from yesterday`);
  };

  const macroTargets = {
    calories: dailyTargets.finalTarget,
    protein: dailyTargets.protein,
    carbs: dailyTargets.carbs,
    fat: dailyTargets.fat,
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

  // Sticky header: show when macro tiles scroll out of view
  useEffect(() => {
    const el = macroSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyHeader(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
        ...(targetMeal ? { meal: targetMeal } : {}),
      });
      setNlInput("");
      setTargetMeal(null);
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
        ...(targetMeal ? { meal: targetMeal } : {}),
      });
      setTargetMeal(null);
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
        ...(targetMeal ? { meal: targetMeal } : {}),
      });
      setTargetMeal(null);
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
        className="sticky top-0 z-30 bg-background flex items-center justify-between rounded-xl py-2 px-3"
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
          <CalendarDays aria-hidden="true" className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs font-medium text-foreground">
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
        <h1 className="text-xl font-extrabold text-foreground">Food</h1>
      </motion.div>

      {/* Day-type context */}
      <AnimatePresence>
        {isToday && dailyTargets.dayType !== "rest" && dailyTargets.annotation && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[11px] font-medium flex items-center gap-1"
            style={{ color: dailyTargets.dayType === "run" ? THEME.running : THEME.lifting }}
          >
            {dailyTargets.dayType === "lift" ? <Dumbbell className="w-3 h-3" /> : dailyTargets.dayType === "run" ? <Footprints className="w-3 h-3" /> : <><Dumbbell className="w-3 h-3" /><Footprints className="w-3 h-3" /></>}
            {dailyTargets.annotation}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Macro Tiles */}
      <motion.div variants={itemVariant} key={selectedDate}>
        <div className="mb-4">
          <CalorieRing consumed={dailyTotals.calories} target={macroTargets.calories} />
        </div>
        <MacroRow
          macros={["protein", "carbs", "fat"]}
          dailyTotals={dailyTotals}
          macroTargets={macroTargets}
        />
      </motion.div>

      {/* Sticky macro summary — appears when tiles scroll out of view */}
      <div ref={macroSentinelRef} className="h-0" />
      <AnimatePresence>
        {showStickyHeader && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="sticky top-0 z-30 -mx-4 px-4 py-2 backdrop-blur-md"
            style={{ backgroundColor: "var(--background-translucent, rgba(242,242,247,0.85))", WebkitBackdropFilter: "blur(12px)" }}
          >
            <p className="text-xs font-semibold font-mono tabular-nums text-center text-foreground">
              {formatCalories(Math.max(0, macroTargets.calories - dailyTotals.calories))} {CALORIE_UNIT} left
              <span className="text-muted-foreground font-normal">
                {" · P: "}{formatMacro(Math.max(0, macroTargets.protein - dailyTotals.protein))}g
                {" · C: "}{formatMacro(Math.max(0, macroTargets.carbs - dailyTotals.carbs))}g
                {" · F: "}{formatMacro(Math.max(0, macroTargets.fat - dailyTotals.fat))}g
              </span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar + scan circle */}
      <motion.div variants={itemVariant} className="sticky top-[44px] z-20 bg-background pb-2 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="flex items-start gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={nlInput}
              onChange={(e) => setNlInput(e.target.value)}
              onFocus={() => setSuggestionsActive(true)}
              onBlur={() => { setTimeout(() => setSuggestionsActive(false), 200); }}
              placeholder={targetMeal ? `Adding to ${MEAL_LABELS[targetMeal]}…` : "What did you eat?"}
              aria-label="What did you eat"
              rows={1}
              maxLength={500}
              className="w-full px-4 py-3 pr-11 rounded-xl bg-white border border-border/50 shadow-sm text-foreground text-sm resize-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
            />
            {nlInput.trim() ? (
              <button type="button" onClick={() => { haptic(); handleNLParse(); }} disabled={nlParsing}
                aria-label="Send"
                className={cn("absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all active:scale-90", nlParsing ? "opacity-50" : "")}
                style={{ color: "#7C6BF0" }}>
                <SendHorizontal className="w-5 h-5" />
              </button>
            ) : (
              <button type="button" onClick={handleVoiceInput} aria-label={isListening ? "Stop listening" : "Voice input"}
                className={cn("absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all active:scale-90", isListening ? "text-red-500 bg-red-500/10 animate-pulse" : "text-muted-foreground hover:text-primary hover:bg-primary/10")}>
                <Mic className="w-4 h-4" />
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
          <div className="relative shrink-0">
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => { haptic(); scanOverrides.onClick(); }}
              aria-label={scanUsage.isUnlimited || scanUsage.remaining > 0 ? "Scan food" : "Upgrade to scan food"}
              className="w-11 h-11 rounded-full flex items-center justify-center text-white shadow-sm active:scale-95 transition-transform mt-[1px]"
              style={scanOverrides.style}>
              <Camera className="w-5 h-5" />
            </motion.button>
            {scanOverrides.icon}
          </div>
        </div>
      </motion.div>
      {/* Meal targeting pill */}
      <AnimatePresence>
        {targetMeal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="flex justify-center mt-2"
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-purple-50 border border-purple-200 text-purple-700">
              <ChevronRight className="w-3 h-3" />
              {MEAL_LABELS[targetMeal]}
              <button
                onClick={() => setTargetMeal(null)}
                aria-label={`Cancel adding to ${MEAL_LABELS[targetMeal]}`}
                className="ml-0.5 p-0.5 rounded-full hover:bg-purple-100 active:scale-90 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
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
          <FoodAnalyzer date={selectedDate} meal={targetMeal} onSaved={() => { setScanOpen(false); setTargetMeal(null); }} />
        </Suspense>
      )}

      {/* Quick Add — merged section (quick meals + favourites + frequently logged) */}
      <motion.div variants={itemVariant} style={{ marginTop: "14px" }}>
        <p className="text-xs tracking-wide font-medium mb-2" style={{ color: THEME.text.muted }}>
          Quick add
        </p>
        {quickMeals.length >= 3 ? (
          <div
            className="flex gap-2 pb-1 -mx-1 px-1"
            style={{ overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
          >
            {quickMeals.map((meal, i) => (
              <motion.button
                key={i}
                whileTap={{ scale: 0.95 }}
                onClick={() => { haptic(); handleQuickMealAdd(meal); }}
                disabled={quickAdding !== null}
                className={cn(
                  "shrink-0 h-9 px-3.5 rounded-full bg-white border border-black/[0.08] text-[13px] text-foreground whitespace-nowrap transition-all active:scale-95",
                  quickAdding !== null && "opacity-60 cursor-not-allowed"
                )}
              >
                {meal.name} · {meal.cal} kcal
              </motion.button>
            ))}
            <div className="shrink-0 w-4" aria-hidden="true" />
          </div>
        ) : (
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
                  "shrink-0 text-left border border-border/60 border-l-[3px] border-l-orange-300 rounded-xl transition-all active:bg-primary/10",
                  quickAdding !== null && "opacity-60 cursor-not-allowed"
                )}
                style={{ width: "180px", padding: "8px 12px", background: `linear-gradient(135deg, ${THEME.semantic.nutrition}08 0%, transparent 70%)` }}
              >
                <span className="text-micro font-semibold text-foreground block truncate">{meal.name}</span>
                <span className="block text-xs text-muted-foreground mt-1">~{meal.cal} kcal</span>
              </motion.button>
            ))}
            <div className="shrink-0 w-4" aria-hidden="true" />
          </div>
        )}
        <div className="mt-2">
          <QuickRelog onSelect={handleQuickRelog} />
        </div>
      </motion.div>


      {/* Meal sections — all four render as cards with + button */}
      {todaysMeals.length > 0 && (
        <motion.div variants={itemVariant} className="space-y-3">
          {MEAL_ORDER.map((mealKey) => {
            const meals = mealSegmentedMeals[mealKey];
            const isEmpty = meals.length === 0;
            const mealCals = meals.reduce((s, m) => s + safeNum(m.totalCalories), 0);

            // Group populated items by food name
            const grouped = new Map<string, { foodName: string; meals: typeof meals; totalCal: number; totalPro: number; totalCarb: number; totalFat: number }>();
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
                grouped.set(key, { foodName: m.foodName || "Meal", meals: [m], totalCal: safeNum(m.totalCalories), totalPro: safeNum(m.totalProtein), totalCarb: safeNum(m.totalCarbs), totalFat: safeNum(m.totalFat) });
              }
            }
            const groupedEntries = Array.from(grouped.values());

            return (
              <div key={mealKey}>
                <div className="bg-card rounded-xl overflow-hidden" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.04)" }}>
                  {/* Header row — always visible */}
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <p className="text-sm font-semibold text-foreground">
                      {MEAL_LABELS[mealKey]}
                      {!isEmpty && (
                        <span className="text-xs font-normal text-muted-foreground font-mono tabular-nums ml-1.5">
                          {formatCalories(mealCals)} {CALORIE_UNIT}
                        </span>
                      )}
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
                  {/* Food items */}
                  {!isEmpty && (
                    <div className="divide-y divide-border/20">
                      {groupedEntries.map((group) => {
                        const proCal = group.totalPro * 4;
                        const carbCal = group.totalCarb * 4;
                        const fatCal = group.totalFat * 9;
                        const dotColor = proCal === 0 && carbCal === 0 && fatCal === 0 ? "#D1D5DB"
                          : proCal >= carbCal && proCal >= fatCal ? THEME.macros.protein
                          : carbCal >= proCal && carbCal >= fatCal ? THEME.macros.carbs
                          : THEME.macros.fat;
                        return (
                          <div key={group.foodName} className="flex items-center justify-between px-3 py-2.5">
                            <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                              <p className="text-sm text-foreground truncate">{group.foodName}</p>
                              {group.meals.length > 1 && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 text-white" style={{ backgroundColor: "#7C6BF0" }}>
                                  ×{group.meals.length}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-mono tabular-nums text-muted-foreground">{formatCalories(group.totalCal)} {CALORIE_UNIT}</span>
                              <button
                                onClick={() => handleDeleteMeal(group.meals[group.meals.length - 1].id, group.foodName)}
                                aria-label={`Delete ${group.foodName}`}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors active:scale-90"
                              >
                                <Trash2 aria-hidden="true" className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Empty state */}
                  {isEmpty && (
                    <div className="px-3 pb-3">
                      <p className="text-xs text-muted-foreground/50">No {MEAL_LABELS[mealKey].toLowerCase()} logged yet</p>
                      {yesterdaySegmented[mealKey]?.length > 0 && (
                        <button onClick={() => copyFromYesterday(mealKey)} className="flex items-center gap-1.5 mt-2 text-xs font-medium text-muted-foreground active:scale-[0.97] transition-all">
                          <RotateCcw className="w-3 h-3" /> Copy from yesterday
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* Empty day state — centered prompt when nothing logged */}
      {todaysMeals.length === 0 && (
        <motion.div variants={itemVariant} className="flex flex-col items-center justify-center py-10 space-y-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${THEME.semantic.nutrition}12` }}>
            <Flame className="w-6 h-6" style={{ color: THEME.semantic.nutrition, opacity: 0.5 }} />
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
          {isToday && dailyTargets.dayType === "rest" && !isPro && !localStorage.getItem("tropos_ever_scanned") && (
            <div className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl" style={{ backgroundColor: "rgba(124,107,240,0.06)" }}>
              <Camera className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <p className="text-[11px] font-medium text-muted-foreground">Scan any meal for instant macro estimates</p>
            </div>
          )}
          {isToday && yesterdayMeals.length > 0 && (
            <button
              onClick={() => {
                for (const key of MEAL_ORDER) {
                  if (yesterdaySegmented[key]?.length > 0) {
                    copyFromYesterday(key);
                  }
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/60 bg-card text-[13px] font-medium text-muted-foreground hover:bg-muted/50 active:scale-[0.97] transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Copy from yesterday
            </button>
          )}
        </motion.div>
      )}

      {/* Pro upsell — populated state only */}
      {!isPro && todaysMeals.length > 0 && !localStorage.getItem("tropos_ever_scanned") && (
        <div className="flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl" style={{ backgroundColor: "rgba(124,107,240,0.06)" }}>
          <Camera className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <p className="text-[11px] font-medium text-muted-foreground">Scan any meal for instant macro estimates</p>
        </div>
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
