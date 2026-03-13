import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { THEME } from "@/lib/theme";
import { useDailyLogs } from "@/hooks/useFirestore";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { addDays, format } from "date-fns";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import WorkoutLogger from "@/components/WorkoutLogger";
import { ManualFoodLogger } from "@/components/ManualFoodLogger";
import FoodSearch from "@/components/FoodSearch";
import { useMeals } from "@/hooks/useMeals";
import FoodAnalyzer from "@/components/FoodAnalyzer";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { parseFoodText } from "@/lib/nlFoodParser";
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
  MessageSquare,
  ScanBarcode,
  Footprints,
} from "lucide-react";
import { BarcodeScanner } from "@/components/nutrition/BarcodeScanner";
import { QuickRelog } from "@/components/nutrition/QuickRelog";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";

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
      setActiveTab(location.state.tab);
    }
  }, []);

  const [showFoodSearch, setShowFoodSearch] = useState(false);
  const [nlInput, setNlInput] = useState("");
  const [nlParsing, setNlParsing] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const { addFavourite } = useFoodFavourites();

  const dateInputRef = useRef<HTMLInputElement>(null);

  const todaysWorkouts = getWorkoutsForDate(selectedDate);

  const { meals, getMealsForDate, getDailyTotals, deleteMeal } = useMeals();
  const todaysMeals = getMealsForDate(selectedDate);
  const dailyTotals = getDailyTotals(selectedDate);

  const safeNum = (value: any): number => {
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

  // Light pastel macro style (exact match to Today's Intake on Home)
  const macroColors = {
    calories: "#f97316",
    protein: "#3b82f6",
    carbs: "#f59e0b",
    fat: "#a855f6",
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


  const handleNLParse = async () => {
    if (!nlInput.trim() || !user) return;
    setNlParsing(true);
    const items = parseFoodText(nlInput);
    if (items.length === 0) {
      toast.error("Could not parse any foods. Try a different description.");
      setNlParsing(false);
      return;
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
      confidence: "nl-parse",
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
    setShowFoodSearch(false);
    await addFavourite({ ...food, source: "search" });
    toast.success(`${food.name} added!`);
  };

  const handleBarcodeLog = async (food: { name: string; calories: number; protein: number; carbs: number; fat: number; fiber?: number; sugar?: number; sodium?: number; servingSize: string; barcode: string; servings: number }) => {
    if (!user) return;
    const s = food.servings;
    await addDoc(collection(db, "users", user.uid, "meals"), {
      date: selectedDate,
      foodName: food.name,
      items: [{ name: food.name, portionSize: `${s}x ${food.servingSize}`, calories: Math.round(food.calories * s), protein: Math.round(food.protein * s), carbs: Math.round(food.carbs * s), fat: Math.round(food.fat * s), fiber: food.fiber != null ? Math.round(food.fiber * s) : undefined, sugar: food.sugar != null ? Math.round(food.sugar * s) : undefined, sodium: food.sodium != null ? Math.round(food.sodium * s) : undefined }],
      totalCalories: Math.round(food.calories * s),
      totalProtein: Math.round(food.protein * s),
      totalCarbs: Math.round(food.carbs * s),
      totalFat: Math.round(food.fat * s),
      totalFiber: food.fiber != null ? Math.round(food.fiber * s) : undefined,
      totalSugar: food.sugar != null ? Math.round(food.sugar * s) : undefined,
      totalSodium: food.sodium != null ? Math.round(food.sodium * s) : undefined,
      confidence: "barcode",
      createdAt: Timestamp.now(),
    });
    setShowBarcodeScanner(false);
    await addFavourite({ name: food.name, calories: Math.round(food.calories * s), protein: Math.round(food.protein * s), carbs: Math.round(food.carbs * s), fat: Math.round(food.fat * s), fiber: food.fiber != null ? Math.round(food.fiber * s) : undefined, sugar: food.sugar != null ? Math.round(food.sugar * s) : undefined, sodium: food.sodium != null ? Math.round(food.sodium * s) : undefined, servingSize: food.servingSize, source: "barcode" });
    toast.success(`${food.name} logged!`);
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Log Activity</h1>
        <p className="text-sm text-muted-foreground">
          Record your daily progress
        </p>
      </div>

      {/* Date Switcher */}
      <div className="flex items-center justify-between bg-card rounded-xl border border-border/50 p-3">
        <button
          onClick={() => changeDate(-1)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>

        <button
          onClick={() => dateInputRef.current?.showPicker?.()}
          className="text-center flex items-center gap-2"
        >
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
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
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          className="sr-only"
        />

        <button
          onClick={() => changeDate(1)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      </div>

      {/* Start a run link */}
      <Link to="/run" className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/10 active:scale-[0.98] transition-transform">
        <Footprints className="w-4 h-4 text-primary" />
        <span className="text-xs font-medium text-foreground">Start a run</span>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
      </Link>

      {/* Tabs — Workout / Food */}
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {([
          { key: "workout" as const, label: "Workout", Icon: Dumbbell },
          { key: "food" as const, label: "Food", Icon: UtensilsCrossed },
        ]).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5",
              activeTab === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Workout Tab */}
      {activeTab === "workout" && (
        <div className="space-y-4">
          {/* Today's workout count badge */}
          {todaysWorkouts.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/10">
              <Dumbbell className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {todaysWorkouts.length} workout{todaysWorkouts.length !== 1 ? "s" : ""} logged today
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                {todaysWorkouts.reduce((s, w) => s + w.totalCalories, 0)} cal
              </span>
            </div>
          )}

          <WorkoutLogger date={selectedDate} onSaved={handleWorkoutSaved} />
        </div>
      )}

      {/* Food Tab */}
      {activeTab === "food" && (
        <div className="space-y-4">
          {/* Daily Totals - now exact same look as Today's Intake on Home */}
          <div className="bg-card rounded-2xl border border-border/50 p-5">
            <p className="text-sm font-medium text-foreground mb-4">Daily Totals</p>
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

          {/* Quick Relog Favourites */}
          <QuickRelog onSelect={handleQuickRelog} />

          {/* Common Meals (fallback if no favourites) */}
          {commonMeals.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Common Meals</p>
              <div className="flex flex-wrap gap-2">
                {commonMeals.map((cm, i) => {
                  const key = cm.foodName?.trim().toLowerCase() ?? "";
                  const isActive = selectedCommonIds.has(key);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleCommonMeal(cm)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
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
            <div className="space-y-2">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground px-1">Logged Today</p>
              {todaysMeals.map((m) => (
                <div key={m.id} className="bg-card rounded-2xl border border-border/50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm font-semibold text-foreground truncate">{m.foodName || "Meal"}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: `${THEME.teal}18`, color: THEME.teal }}>
                          P {safeNum(m.totalProtein)}g
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: `${THEME.brand}18`, color: THEME.brand }}>
                          C {safeNum(m.totalCarbs)}g
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: `${THEME.warning}18`, color: THEME.warning }}>
                          F {safeNum(m.totalFat)}g
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <p className="text-base font-bold font-mono tabular-nums" style={{ color: THEME.warning }}>
                        {safeNum(m.totalCalories)}
                        <span className="text-[10px] font-normal text-muted-foreground ml-0.5">cal</span>
                      </p>
                      <button onClick={() => deleteMeal(m.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors active:scale-90">
                        <Trash2 className="w-3.5 h-3.5" />
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
            </div>
          )}

          {/* Quick Text Input (NL Food Logging) */}
          <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Quick Add</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Describe what you ate — e.g. "2 eggs, toast with butter, protein shake"
            </p>
            <textarea
              value={nlInput}
              onChange={(e) => setNlInput(e.target.value)}
              placeholder="Type your meal..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              onClick={handleNLParse}
              disabled={!nlInput.trim() || nlParsing}
              className={cn(
                "w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-95",
                nlInput.trim()
                  ? "bg-primary text-primary-foreground shadow-[var(--ds-shadow-purple-glow)]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {nlParsing ? "Parsing..." : "Log Meal"}
            </button>
          </div>

          {/* Quick action icon row */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowFoodSearch(true)}
              className="flex-1 flex flex-col items-center gap-1 p-3 bg-muted/50 rounded-xl active:scale-95 transition-transform"
            >
              <Search className="w-5 h-5 text-primary" />
              <span className="text-[10px] text-muted-foreground">Search</span>
            </button>
            <button
              onClick={() => setShowBarcodeScanner(true)}
              className="flex-1 flex flex-col items-center gap-1 p-3 bg-muted/50 rounded-xl active:scale-95 transition-transform"
            >
              <ScanBarcode className="w-5 h-5 text-primary" />
              <span className="text-[10px] text-muted-foreground">Scan</span>
            </button>
          </div>

          {/* Expanded panels */}
          {showFoodSearch && (
            <FoodSearch
              onSelect={handleFoodSearchSelect}
              onClose={() => setShowFoodSearch(false)}
            />
          )}

          {showBarcodeScanner && (
            <div className="bg-card rounded-2xl border border-border/50 p-4">
              <BarcodeScanner
                onLog={handleBarcodeLog}
                onClose={() => setShowBarcodeScanner(false)}
              />
            </div>
          )}

          {/* Manual Food Logger */}
          <ManualFoodLogger date={selectedDate} />

          {/* AI Food Analyzer */}
          <FoodAnalyzer date={selectedDate} />
        </div>
      )}

    </div>
  );
}

