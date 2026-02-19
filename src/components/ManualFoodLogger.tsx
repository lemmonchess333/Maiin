import { useState } from "react";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { UtensilsCrossed, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";

interface FoodEntry {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function ManualFoodLogger() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
        ...entry,
        date: today,
        createdAt: Timestamp.now(),
      });

      setSaved(true);
      toast.success("Meal logged!");
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
    <div className="bg-card rounded-xl border border-border/50 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <UtensilsCrossed className="w-4 h-4 text-primary" />
        <p className="text-sm font-medium text-foreground">Log a Meal</p>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          Free
        </span>
      </div>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Meal name (e.g. Chicken & rice)"
        className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Calories", value: calories, set: setCalories, unit: "kcal" },
          { label: "Protein", value: protein, set: setProtein, unit: "g" },
          { label: "Carbs", value: carbs, set: setCarbs, unit: "g" },
          { label: "Fat", value: fat, set: setFat, unit: "g" },
        ].map((field) => (
          <div key={field.label} className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {field.label} ({field.unit})
            </label>
            <input
              type="number"
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.button
          key={saved ? "saved" : "save"}
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className={cn(
            "w-full py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2",
            saved
              ? "bg-green-500 text-white"
              : "bg-primary text-primary-foreground hover:opacity-90",
            (saving || !name.trim()) && !saved && "opacity-50 cursor-not-allowed"
          )}
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" /> Saved!
            </>
          ) : saving ? (
            "Saving..."
          ) : (
            "Log Meal"
          )}
        </motion.button>
      </AnimatePresence>
    </div>
  );
}
