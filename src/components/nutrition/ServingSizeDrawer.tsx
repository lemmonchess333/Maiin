import { useState } from "react";
import { Drawer } from "vaul";
import { Plus, Minus } from "lucide-react";
import { THEME } from "@/lib/theme";

interface Props {
  food: { name: string; brand: string; calories: number; protein: number; carbs: number; fat: number; servingSize: string } | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (servings: number) => void;
}

export function ServingSizeDrawer({ food, open, onClose, onConfirm }: Props) {
  const [servings, setServings] = useState(1);
  const [prevFood, setPrevFood] = useState(food);
  if (prevFood !== food) {
    setPrevFood(food);
    setServings(1);
  }

  if (!food) return null;

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content
          aria-labelledby="serving-drawer-title"
          className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-background border-t border-border max-h-[50vh] flex flex-col"
        >
          <div className="px-5 pt-4 pb-6">
            {/* Drag handle */}
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: "rgba(0,0,0,0.15)" }} />

            {/* Food header */}
            <div className="mb-4">
              <p id="serving-drawer-title" className="text-sm font-semibold text-foreground">{food.name}</p>
              {food.brand && <p className="text-xs text-muted-foreground">{food.brand}</p>}
              <p className="text-xs text-muted-foreground mt-0.5">per {food.servingSize}</p>
            </div>

            {/* Macro grid */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-2">
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                  {Math.round(food.calories * servings)}
                </p>
                <p className="text-xs text-orange-500 dark:text-orange-400/70">cal</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-2">
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                  {Math.round(food.protein * servings)}g
                </p>
                <p className="text-xs text-blue-500 dark:text-blue-400/70">protein</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2">
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {Math.round(food.carbs * servings)}g
                </p>
                <p className="text-xs text-amber-500 dark:text-amber-400/70">carbs</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg p-2">
                <p className="text-lg font-bold text-purple-600 dark:text-purple-400 tabular-nums">
                  {Math.round(food.fat * servings)}g
                </p>
                <p className="text-xs text-purple-500 dark:text-purple-400/70">fat</p>
              </div>
            </div>

            {/* Serving adjuster */}
            <div className="flex items-center justify-center gap-4 pt-4">
              <button
                onClick={() => setServings(Math.max(0.5, servings - 0.5))}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
              >
                <Minus className="w-4 h-4" />
              </button>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{servings}</p>
                <p className="text-xs text-muted-foreground">servings</p>
              </div>
              <button
                onClick={() => setServings(servings + 0.5)}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Log Food button */}
            <button
              onClick={() => onConfirm(servings)}
              className="w-full py-3 rounded-xl text-base font-semibold text-white mt-4"
              style={{
                background: THEME.gradient.brand,
                boxShadow: "0 4px 16px rgba(124,110,246,0.25)",
              }}
            >
              Log Food
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
