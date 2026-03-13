import { useState, useMemo } from "react";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useMeals } from "@/hooks/useMeals";
import { cn } from "@/lib/utils";
import {
  UtensilsCrossed,
  Check,
  Flame,
  Beef,
  Wheat,
  Cookie,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { format } from "date-fns";

interface FoodEntry {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const DEFAULT_QUICK_MEALS = [
  { name: "Grilled Chicken & Rice", cal: 450, pro: 40, carb: 45, fat: 12 },
  { name: "Protein Shake", cal: 250, pro: 30, carb: 20, fat: 5 },
  { name: "Oatmeal & Banana", cal: 350, pro: 10, carb: 60, fat: 8 },
  { name: "Eggs on Toast", cal: 380, pro: 22, carb: 30, fat: 18 },
  { name: "Greek Yoghurt & Berries", cal: 200, pro: 15, carb: 25, fat: 5 },
  { name: "Tuna Salad", cal: 300, pro: 35, carb: 10, fat: 12 },
];

interface Props {
  date?: string;
}

export function ManualFoodLogger({ date }: Props) {
  const { user } = useAuth();
  const { meals } = useMeals();
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Dynamic quick meals from user history (top 5 most recent unique meals)
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

  const preview = {
    calories: Number(calories) || 0,
    protein: Number(protein) || 0,
    carbs: Number(carbs) || 0,
    fat: Number(fat) || 0,
  };

  const handleQuickAdd = (meal: typeof DEFAULT_QUICK_MEALS[0]) => {
    setName(meal.name);
    setCalories(meal.cal.toString());
    setProtein(meal.pro.toString());
    setCarbs(meal.carb.toString());
    setFat(meal.fat.toString());
    toast.info(`Loaded ${meal.name}`);
  };

  const handleSave = async () => {
    if (!user || !name.trim()) return;

    setSaving(true);
    try {
      const entry: FoodEntry = {
        name: name.trim(),
        calories: Number(calories) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fat: Number(fat) || 0,
      };

      const logDate = date || format(new Date(), "yyyy-MM-dd");
      const id = `${logDate}_${Date.now()}`;
      await setDoc(doc(db, "users", user.uid, "meals", id), {
        date: logDate,
        foodName: entry.name,
        items: [{ name: entry.name, portionSize: "1 serving", calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat }],
        totalCalories: entry.calories,
        totalProtein: entry.protein,
        totalCarbs: entry.carbs,
        totalFat: entry.fat,
        confidence: "manual",
        createdAt: Timestamp.now(),
      });

      setSaved(true);
      toast.success("Meal logged!");

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });

      setTimeout(() => {
        setSaved(false);
        setName("");
        setCalories("");
        setProtein("");
        setCarbs("");
        setFat("");
      }, 1500);
    } catch {
      toast.error("Failed to save meal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <UtensilsCrossed className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Log a Meal</p>
            <p className="text-xs text-muted-foreground">Manual entry</p>
          </div>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
          Free
        </span>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">Quick add</p>
        <div className="flex flex-wrap gap-2">
          {quickMeals.map((meal, i) => (
            <motion.button
              key={i}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleQuickAdd(meal)}
              className="px-4 py-2.5 text-left bg-muted hover:bg-muted/80 border border-border rounded-xl transition-all active:bg-primary/10"
            >
              <span className="text-xs font-semibold text-foreground">{meal.name}</span>
              <span className="block text-[10px] text-muted-foreground mt-0.5">
                ~{meal.cal} kcal · {meal.pro}P · {meal.carb}C · {meal.fat}F
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Meal name (e.g. Chicken & rice)"
        className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Calories", value: calories, set: setCalories, unit: "kcal" },
          { label: "Protein", value: protein, set: setProtein, unit: "g" },
          { label: "Carbs", value: carbs, set: setCarbs, unit: "g" },
          { label: "Fat", value: fat, set: setFat, unit: "g" },
        ].map((field) => (
          <div key={field.label} className="space-y-1">
            <label className="text-xs text-muted-foreground pl-1">
              {field.label} ({field.unit})
            </label>
            <input
              type="number"
              step="1"
              min="0"
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        ))}
      </div>

     <div className="pt-2">
  <p className="text-xs text-muted-foreground mb-3">Live preview</p>

  {(() => {
    // Keep these local so you don't have to refactor imports everywhere.
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

      return `#${newR.toString(16).padStart(2, "0")}${newG
        .toString(16)
        .padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
    };

    return (
      <div className="grid grid-cols-4 gap-3 text-center">
        {/* Calories */}
        <div
          className="rounded-xl p-4 shadow-sm"
          style={{
            backgroundColor: tint(macroColors.calories),
            color: macroColors.calories,
          }}
        >
          <Flame className="w-6 h-6 mx-auto mb-2" />
          <p className="text-2xl font-bold tabular-nums leading-none whitespace-nowrap">
            {preview.calories}
          </p>
          <p className="text-xs mt-1">cal</p>
        </div>

        {/* Protein */}
        <div
          className="rounded-xl p-4 shadow-sm"
          style={{
            backgroundColor: tint(macroColors.protein),
            color: macroColors.protein,
          }}
        >
          <Beef className="w-6 h-6 mx-auto mb-2" />
          <p className="text-2xl font-bold tabular-nums leading-none whitespace-nowrap">
            {preview.protein}g
          </p>
          <p className="text-xs mt-1">protein</p>
        </div>

        {/* Carbs */}
        <div
          className="rounded-xl p-4 shadow-sm"
          style={{
            backgroundColor: tint(macroColors.carbs),
            color: macroColors.carbs,
          }}
        >
          <Wheat className="w-6 h-6 mx-auto mb-2" />
          <p className="text-2xl font-bold tabular-nums leading-none whitespace-nowrap">
            {preview.carbs}g
          </p>
          <p className="text-xs mt-1">carbs</p>
        </div>

        {/* Fat */}
        <div
          className="rounded-xl p-4 shadow-sm"
          style={{
            backgroundColor: tint(macroColors.fat),
            color: macroColors.fat,
          }}
        >
          {/* CircleDot looks “off-brand” vs Cookie used everywhere else */}
          <Cookie className="w-6 h-6 mx-auto mb-2" />
          <p className="text-2xl font-bold tabular-nums leading-none whitespace-nowrap">
            {preview.fat}g
          </p>
          <p className="text-xs mt-1">fat</p>
        </div>
      </div>
    );
  })()}
</div>

      <AnimatePresence mode="wait">
        <motion.button
          key={saved ? "saved" : "save"}
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className={cn(
            "w-full py-3.5 rounded-2xl font-semibold text-sm transition-all flex items-center justify-center gap-2",
            saved
              ? "bg-green-500 text-white shadow-[0_4px_20px_rgba(52,211,153,0.35)]"
              : "bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-[var(--ds-shadow-purple-glow)] active:scale-95",
            (saving || !name.trim()) && !saved && "opacity-50 cursor-not-allowed"
          )}
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" /> Meal Logged!
            </>
          ) : saving ? (
            "Saving meal..."
          ) : (
            "Log This Meal"
          )}
        </motion.button>
      </AnimatePresence>
    </div>
  );
}
