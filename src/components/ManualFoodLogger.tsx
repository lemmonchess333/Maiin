import { useState } from "react";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { 
  UtensilsCrossed, 
  Check, 
  Flame, 
  Beef, 
  Wheat, 
  Droplet 
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

const QUICK_MEALS = [
  { name: "Grilled Chicken & Rice", cal: 520, pro: 45, carb: 55, fat: 8 },
  { name: "Whey Protein Shake", cal: 120, pro: 25, carb: 4, fat: 2 },
  { name: "Greek Yogurt + Berries", cal: 180, pro: 20, carb: 15, fat: 3 },
  { name: "Salmon & Avocado", cal: 380, pro: 28, carb: 8, fat: 25 },
  { name: "Oats & Banana", cal: 320, pro: 10, carb: 55, fat: 6 },
];

export function ManualFoodLogger() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Live preview totals
  const preview = {
    calories: Number(calories) || 0,
    protein: Number(protein) || 0,
    carbs: Number(carbs) || 0,
    fat: Number(fat) || 0,
  };

  const handleQuickAdd = (meal: typeof QUICK_MEALS[0]) => {
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

      const today = format(new Date(), "yyyy-MM-dd");
      const id = `${today}_${Date.now()}`;
      await setDoc(doc(db, "users", user.uid, "meals", id), {
        date: today,
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
      toast.success("Meal logged successfully!");

      // Confetti on successful log
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <UtensilsCrossed className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Log a Meal</p>
            <p className="text-xs text-muted-foreground">Manual entry • Free forever</p>
          </div>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
          Free
        </span>
      </div>

      {/* Quick Add Buttons */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Quick add common meals</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_MEALS.map((meal, i) => (
            <motion.button
              key={i}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleQuickAdd(meal)}
              className="px-4 py-2 text-xs bg-muted hover:bg-muted/80 border border-border rounded-xl transition-all active:bg-primary/10"
            >
              {meal.name}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Meal Name */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Meal name (e.g. Chicken & rice)"
        className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />

      {/* Macro Inputs */}
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

      {/* Live Macro Preview */}
      <div className="pt-2">
        <p className="text-xs text-muted-foreground mb-3">Live preview</p>
        <div className="grid grid-cols-4 gap-3 text-center">
          {/* Calories */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-950 dark:to-amber-950/60 rounded-xl p-3 shadow-sm border border-orange-100/60 dark:border-orange-900/40">
            <Flame className="w-5 h-5 mx-auto mb-1 text-orange-500 dark:text-orange-400" />
            <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
              {preview.calories}
            </p>
            <p className="text-[10px] text-orange-500 dark:text-orange-400/80">cal</p>
          </div>

          {/* Protein */}
          <div className="bg-gradient-to-br from-blue-50 to-sky-100 dark:from-blue-950 dark:to-sky-950/60 rounded-xl p-3 shadow-sm border border-blue-100/60 dark:border-blue-900/40">
            <Beef className="w-5 h-5 mx-auto mb-1 text-blue-500 dark:text-blue-400" />
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
              {preview.protein}g
            </p>
            <p className="text-[10px] text-blue-500 dark:text-blue-400/80">protein</p>
          </div>

          {/* Carbs */}
          <div className="bg-gradient-to-br from-yellow-50 to-amber-100 dark:from-amber-950 dark:to-yellow-950/60 rounded-xl p-3 shadow-sm border border-amber-100/60 dark:border-amber-900/40">
            <Wheat className="w-5 h-5 mx-auto mb-1 text-amber-500 dark:text-amber-400" />
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {preview.carbs}g
            </p>
            <p className="text-[10px] text-amber-500 dark:text-amber-400/80">carbs</p>
          </div>

          {/* Fat */}
          <div className="bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-950 dark:to-violet-950/60 rounded-xl p-3 shadow-sm border border-purple-100/60 dark:border-purple-900/40">
            <Droplet className="w-5 h-5 mx-auto mb-1 text-purple-500 dark:text-purple-400" />
            <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
              {preview.fat}g
            </p>
            <p className="text-[10px] text-purple-500 dark:text-purple-400/80">fat</p>
          </div>
        </div>
      </div>

      {/* Log Button */}
      <AnimatePresence mode="wait">
        <motion.button
          key={saved ? "saved" : "save"}
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className={cn(
            "w-full py-3.5 rounded-2xl font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-sm",
            saved
              ? "bg-green-500 text-white"
              : "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.985]",
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