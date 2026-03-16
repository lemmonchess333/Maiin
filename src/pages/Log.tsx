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
import FoodSearch from "@/components/FoodSearch";
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
  Search,
  Beef,
  Wheat,
  Cookie,
  ScanBarcode,
  Footprints,
  Sparkles,
} from "lucide-react";
const FoodAnalyzer = lazy(() => import("@/components/FoodAnalyzer"));
import { QuickRelog } from "@/components/nutrition/QuickRelog";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";
import { useSubscription } from "@/lib/subscription";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";

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

  const [foodMode, setFoodMode] = useState<"quick" | "search" | "scan" | "manual" | null>(null);
  const [nlInput, setNlInput] = useState("");
  const [nlParsing, setNlParsing] = useState(false);
  const [suggestionsActive, setSuggestionsActive] = useState(true);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { addFavourite } = useFoodFavourites();
  const { isPro } = useSubscription();
  const { analyzeFoodText } = useFoodAnalysis();

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
    }
  };

  // Macro colors — semantic palette
  const macroColors = {
    calories: THEME.semantic.nutrition,
    protein: THEME.semantic.hydration,
    carbs: THEME.semantic.activity,
    fat: THEME.semantic.nutrition,
  };

  const tint = (hex: string, factor: number = 0.85): string => {
    if (!hex || !hex.startsWith("#")) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const newR = Math.min(255, Math.floor(r + (255 - r) * factor));
    const newG = Math.min(255, Math.floor(g + (255 - g) * factor));
    const newB = Math.min(255, Math.floor(b + (255 - b) * factor));

    return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
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
    return lastPart.length >= 2 ? getFoodSuggestions(lastPart, 6) : [];
  }, [nlInput]);
  const showSuggestions = suggestionsActive && suggestions.length > 0;

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
          `Couldn't find macros for: ${zeroItems.map((i) => i.name).join(", ")}. Try Search for accurate data.`
        );
      }
    }

    const totalCalories = items.reduce((s, i) => s + i.calories, 0);
    const totalProtein = items.reduce((s, i) => s + i.protein, 0);
    const totalCarbs = items.reduce((s, i) => s + i.carbs, 0);
    const totalFat = items.reduce((s, i) => s + i.fat, 0);

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
    setNlParsing(false);
    toast.success(`${items.length} item${items.length > 1 ? "s" : ""} logged!`);
  };

  const handleFoodSearchSelect = async (food: { name: string; calories: number; protein: number; carbs: number; fat: number; servingSize: string }) => {
    if (!user) return;
    await addDoc(collection(db, "users", user.uid, "meals"), {
      date: selectedDate,
      foodName: food.name,
      items: [{ name: food.name, portionSize: food.servingSize, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat }],
      totalCalories: food.calories,
      totalProtein: food.protein,
      totalCarbs: food.carbs,
      totalFat: food.fat,
      confidence: "database",
      createdAt: Timestamp.now(),
    });
    setFoodMode("quick");
    await addFavourite({ ...food, source: "search" });
    toast.success(`${food.name} added!`);
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
      <motion.div variants={itemVariant} className="flex gap-1 bg-muted rounded-xl p-1">
        {([
          { key: "workout" as const, label: "Workout", Icon: Dumbbell },
          { key: "food" as const, label: "Food", Icon: UtensilsCrossed },
        ]).map(({ key, label, Icon }) => (
          <motion.button
            key={key}
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
          {/* Daily Totals - now exact same look as Today's Intake on Home */}
          <div className="rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${THEME.semantic.nutrition}08 0%, transparent 70%)` }}>
            <p className="text-[11px] uppercase tracking-[0.5px] font-medium mb-4" style={{ color: THEME.text.muted }}>Daily Totals</p>
            <div className="grid grid-cols-4 gap-2 text-center overflow-hidden">
              {/* Calories */}
              <div
                className="min-w-0 rounded-xl p-3 shadow-sm"
                style={{
                  backgroundColor: tint(macroColors.calories),
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
                  backgroundColor: tint(macroColors.protein),
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
                  backgroundColor: tint(macroColors.carbs),
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
                  backgroundColor: tint(macroColors.fat),
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

          {/* Quick Relog Favourites + Common Meals (unified) */}
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

          {/* Saved Meals */}
          {todaysMeals.length > 0 && (
            <motion.div variants={itemVariant} className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-foreground px-1">Logged Today</p>
              {todaysMeals.map((m) => (
                <div key={m.id} className="rounded-2xl px-4 py-3" style={{ background: `linear-gradient(135deg, ${THEME.semantic.nutrition}04 0%, transparent 70%)` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm font-semibold text-foreground truncate">{m.foodName || "Meal"}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: `${macroColors.protein}18`, color: macroColors.protein }}>
                          P {safeNum(m.totalProtein)}g
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: `${macroColors.carbs}18`, color: macroColors.carbs }}>
                          C {safeNum(m.totalCarbs)}g
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: `${macroColors.fat}18`, color: macroColors.fat }}>
                          F {safeNum(m.totalFat)}g
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

          {/* Add Food — Quick Add is always visible, other modes expand inline */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: `linear-gradient(135deg, ${THEME.semantic.nutrition}06 0%, transparent 70%)` }}>
            <p className="text-[11px] uppercase tracking-[0.5px] font-medium" style={{ color: THEME.text.muted }}>Add Food</p>

            {/* Quick Add — always visible */}
            <div className="relative">
              <textarea
                value={nlInput}
                onChange={(e) => setNlInput(e.target.value)}
                onFocus={() => setSuggestionsActive(true)}
                onBlur={() => {
                  // Delay hiding so click on suggestion registers
                  setTimeout(() => setSuggestionsActive(false), 200);
                }}
                placeholder='Describe what you ate — e.g. "2 eggs, toast with butter"'
                rows={2}
                className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden"
                >
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSuggestionSelect(s)}
                      className="w-full px-4 py-2.5 text-left hover:bg-muted/80 transition-colors flex items-center justify-between gap-2 border-b border-border/30 last:border-0"
                    >
                      <span className="text-sm font-medium text-foreground">{s.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {s.calories} cal · P{s.protein}g · C{s.carbs}g · F{s.fat}g
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { haptic(); handleNLParse(); }}
              disabled={!nlInput.trim() || nlParsing}
              className={cn(
                "w-full py-3 rounded-lg text-sm font-semibold transition-all bg-purple-600 text-white flex items-center justify-center gap-1.5",
                (!nlInput.trim() || nlParsing) && "opacity-50 cursor-not-allowed"
              )}
            >
              {isPro && <Sparkles className="w-3.5 h-3.5" />}
              {nlParsing ? "Analyzing..." : "Log Meal"}
            </motion.button>
            {!isPro && (
              <p className="text-[10px] text-muted-foreground text-center">
                Upgrade to Pro for AI-powered macro estimates
              </p>
            )}

            {/* Secondary actions row */}
            <div className="flex gap-2">
              {([
                { key: "search" as const, label: "Search", Icon: Search },
                { key: "scan" as const, label: "Scan", Icon: ScanBarcode },
                { key: "manual" as const, label: "Manual", Icon: UtensilsCrossed },
              ]).map(({ key, label, Icon }) => (
                <motion.button
                  key={key}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { haptic(); setFoodMode(foodMode === key ? null : key); }}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-[11px] font-medium transition-all flex items-center justify-center gap-1 border",
                    foodMode === key
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-muted text-muted-foreground border-border/50 hover:border-primary/30"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </motion.button>
              ))}
            </div>

            {/* Expanded secondary mode */}
            {foodMode === "search" && (
              <FoodSearch onSelect={handleFoodSearchSelect} onClose={() => setFoodMode(null)} />
            )}
            {foodMode === "scan" && (
              <Suspense fallback={<div className="py-12 text-center text-muted-foreground text-sm animate-pulse">Loading scanner...</div>}>
                <FoodAnalyzer date={selectedDate} onSaved={() => setFoodMode(null)} />
              </Suspense>
            )}
            {foodMode === "manual" && (
              <Suspense fallback={<div className="py-12 text-center text-muted-foreground text-sm animate-pulse">Loading food logger...</div>}>
                <ManualFoodLogger date={selectedDate} />
              </Suspense>
            )}
          </div>
        </motion.div>
      )}

    </motion.div>
  );
}

