import { useState } from "react";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";
import { Drawer } from "vaul";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { validateFoodEntry } from "@/lib/foodValidation";

interface FoodEntry {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Props {
  date?: string;
  /* Meal slot ("breakfast" / "lunch" / "snacks" / "dinner") if the
     user picked one before opening the drawer. Persisted as the
     `meal` field on the doc when set; omitted when null/undefined
     to match the NL / quick-add convention (no default slot). */
  meal?: "breakfast" | "lunch" | "snacks" | "dinner" | null;
  open: boolean;
  onClose: () => void;
}

export function ManualFoodLogger({ date, meal, open, onClose }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  /* ConfirmDialog state for suspicious-but-possible high values
     (>5000 cal etc). Negative / NaN values are blocked outright
     via inline toast — they never reach this prompt. */
  const [warnTitle, setWarnTitle] = useState<string | null>(null);
  const [warnDescription, setWarnDescription] = useState<string>("");

  const performSave = async (entry: FoodEntry) => {
    if (!user) return;
    setSaving(true);
    try {
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
        /* Optional `meal` slot mirrors the NL / quick-add
           convention — persisted only when the user explicitly
           picked one. No default. */
        ...(meal ? { meal } : {}),
        createdAt: Timestamp.now(),
      });

      setSaved(true);
      toast.success("Logged manually", { id: "food-manual-success" });

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
      toast.error("Couldn't save this meal. Try again.", { id: "food-save-error" });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!user || !name.trim()) return;

    /* Coerce empty string → 0 (water, black coffee, 0-cal entries
       are legitimate). Number("") returns NaN; we want 0. */
    const numOrZero = (s: string) => (s.trim() === "" ? 0 : Number(s));
    const entry: FoodEntry = {
      name: name.trim(),
      calories: numOrZero(calories),
      protein: numOrZero(protein),
      carbs: numOrZero(carbs),
      fat: numOrZero(fat),
    };

    const verdict = validateFoodEntry(entry);
    if (verdict.kind === "blocked") {
      toast.error(verdict.reason, { id: "food-validation-error" });
      return;
    }
    if (verdict.kind === "warn") {
      /* Open ConfirmDialog with field-specific title + body. The
         confirm path performs the save; cancel returns the user
         to the form with all values intact. */
      setWarnTitle(verdict.title);
      setWarnDescription(verdict.description);
      return;
    }
    await performSave(entry);
  };

  const handleConfirmOverride = async () => {
    setWarnTitle(null);
    const numOrZero = (s: string) => (s.trim() === "" ? 0 : Number(s));
    const entry: FoodEntry = {
      name: name.trim(),
      calories: numOrZero(calories),
      protein: numOrZero(protein),
      carbs: numOrZero(carbs),
      fat: numOrZero(fat),
    };
    await performSave(entry);
  };

  return (
    <>
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-background border-t border-border max-h-[60vh] flex flex-col">
          <div className="overflow-y-auto flex-1 px-5 pt-4 pb-3">
            {/* Drag handle */}
            <div className="w-10 h-1 rounded-full mx-auto mb-4 bg-border" />

            {/* Title */}
            <div className="mb-5">
              <p className="text-lg font-bold text-foreground">Log a Meal</p>
              <p className="text-xs text-muted-foreground">Manual entry</p>
            </div>

            {/* Meal name input */}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Meal name (e.g. Chicken & rice)"
              aria-label="Meal name"
              className="w-full px-3.5 py-3.5 rounded-xl text-foreground text-base placeholder:text-muted-foreground bg-muted/40 border border-border"
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
                  <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground pl-1">
                    {field.label} ({field.unit})
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={field.value}
                    onChange={(e) => field.set(e.target.value)}
                    placeholder={field.unit}
                    className="w-full px-3 py-3 rounded-xl text-foreground text-base font-semibold text-center placeholder:text-muted-foreground/40 bg-muted/40 border border-border"
                  />
                </div>
              ))}
            </div>

          </div>
          {/* Sticky save footer. Pre-F2 the button lived inside the
              overflow-y-auto container, so on small iPhone viewports
              with the keyboard up + form filled the Save button
              could scroll below the keyboard and become unreachable.
              Lifting it into a non-scrolling footer with safe-area
              bottom padding keeps it pinned regardless of scroll
              state. */}
          <div className="px-5 pt-3 pb-5 border-t border-border safe-area-pb">
            <AnimatePresence mode="wait">
              <motion.button
                key={saved ? "saved" : "save"}
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className={cn(
                  "w-full py-3.5 rounded-xl font-semibold text-base transition-all flex items-center justify-center gap-2",
                  saved
                    ? "bg-green-500 text-white shadow-[0_4px_20px_rgba(52,211,153,0.35)]"
                    : "text-white active:scale-95",
                  (saving || !name.trim()) && !saved && "opacity-50 cursor-not-allowed"
                )}
                style={!saved ? {
                  backgroundColor: "#7C6BF0",
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
    {/* Suspicious-but-possible high-value override prompt. Cancel
        leaves the form intact so the user can adjust; Save anyway
        commits the entry as typed. Negative / NaN values are
        blocked outright via toast and never reach this dialog. */}
    <ConfirmDialog
      open={warnTitle !== null}
      title={warnTitle ?? ""}
      description={warnDescription}
      confirmLabel="Save anyway"
      cancelLabel="Edit"
      onConfirm={handleConfirmOverride}
      onCancel={() => setWarnTitle(null)}
    />
    </>
  );
}
