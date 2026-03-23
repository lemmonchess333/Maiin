import { useState } from "react";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";
import { Drawer } from "vaul";

interface FoodEntry {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Props {
  date?: string;
  open: boolean;
  onClose: () => void;
}

export function ManualFoodLogger({ date, open, onClose }: Props) {
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

      setTimeout(() => {
        setSaved(false);
        setName("");
        setCalories("");
        setProtein("");
        setCarbs("");
        setFat("");
        onClose();
      }, 1500);
    } catch {
      toast.error("Failed to save meal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-background border-t border-border max-h-[60vh] flex flex-col">
          <div className="overflow-y-auto flex-1 px-5 pt-4 pb-6">
            {/* Drag handle */}
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: "rgba(0,0,0,0.15)" }} />

            {/* Title */}
            <div className="mb-5">
              <p className="text-lg font-bold text-foreground">Log a Meal</p>
              <p className="text-[13px] text-muted-foreground">Manual entry</p>
            </div>

            {/* Meal name input */}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Meal name (e.g. Chicken & rice)"
              className="w-full px-3.5 py-3.5 rounded-xl text-foreground text-[15px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              style={{ border: "1px solid rgba(0,0,0,0.08)", backgroundColor: "rgba(0,0,0,0.02)" }}
            />

            {/* Macro input grid */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {[
                { label: "Calories", value: calories, set: setCalories, unit: "kcal" },
                { label: "Protein", value: protein, set: setProtein, unit: "g" },
                { label: "Carbs", value: carbs, set: setCarbs, unit: "g" },
                { label: "Fat", value: fat, set: setFat, unit: "g" },
              ].map((field) => (
                <div key={field.label} className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.05em] font-semibold text-muted-foreground pl-1">
                    {field.label} ({field.unit})
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={field.value}
                    onChange={(e) => field.set(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-3 rounded-xl text-foreground text-base font-semibold text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                    style={{ border: "1px solid rgba(0,0,0,0.08)", backgroundColor: "rgba(0,0,0,0.02)" }}
                  />
                </div>
              ))}
            </div>

            {/* Log This Meal button */}
            <AnimatePresence mode="wait">
              <motion.button
                key={saved ? "saved" : "save"}
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className={cn(
                  "w-full py-3.5 rounded-xl font-bold text-[15px] transition-all flex items-center justify-center gap-2 mt-5",
                  saved
                    ? "bg-green-500 text-white shadow-[0_4px_20px_rgba(52,211,153,0.35)]"
                    : "text-white active:scale-95",
                  (saving || !name.trim()) && !saved && "opacity-50 cursor-not-allowed"
                )}
                style={!saved ? {
                  background: THEME.gradient.brand,
                  boxShadow: "0 4px 16px rgba(124,110,246,0.25)",
                } : undefined}
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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
