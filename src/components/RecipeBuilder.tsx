import { useState, useMemo } from "react";
import { X, Plus, Minus, Search } from "lucide-react";

interface Ingredient {
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Recipe {
  name: string;
  servings: number;
  ingredients: Ingredient[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  perServingCalories: number;
  perServingProtein: number;
  perServingCarbs: number;
  perServingFat: number;
}

interface Props {
  onSave: (recipe: Recipe) => void;
  onClose: () => void;
}

// Common ingredient templates for quick-add
const COMMON_INGREDIENTS: Ingredient[] = [
  { name: "Chicken Breast", amount: 150, unit: "g", calories: 248, protein: 47, carbs: 0, fat: 5 },
  { name: "Brown Rice (cooked)", amount: 200, unit: "g", calories: 248, protein: 5, carbs: 52, fat: 2 },
  { name: "Olive Oil", amount: 15, unit: "ml", calories: 120, protein: 0, carbs: 0, fat: 14 },
  { name: "Egg", amount: 1, unit: "large", calories: 78, protein: 6, carbs: 1, fat: 5 },
  { name: "Oats", amount: 50, unit: "g", calories: 190, protein: 7, carbs: 34, fat: 3 },
  { name: "Banana", amount: 1, unit: "medium", calories: 105, protein: 1, carbs: 27, fat: 0 },
  { name: "Whey Protein", amount: 30, unit: "g", calories: 120, protein: 25, carbs: 3, fat: 1 },
  { name: "Greek Yogurt", amount: 170, unit: "g", calories: 100, protein: 17, carbs: 6, fat: 1 },
];

export function RecipeBuilder({ onSave, onClose }: Props) {
  const [name, setName] = useState("");
  const [servings, setServings] = useState(1);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Manual ingredient form
  const [manualName, setManualName] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualUnit, setManualUnit] = useState("g");
  const [manualCals, setManualCals] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");
  const [showManual, setShowManual] = useState(false);

  const totals = useMemo(
    () => ({
      calories: ingredients.reduce((s, i) => s + i.calories, 0),
      protein: ingredients.reduce((s, i) => s + i.protein, 0),
      carbs: ingredients.reduce((s, i) => s + i.carbs, 0),
      fat: ingredients.reduce((s, i) => s + i.fat, 0),
    }),
    [ingredients],
  );

  const perServing = useMemo(
    () => ({
      calories: Math.round(totals.calories / servings),
      protein: Math.round(totals.protein / servings),
      carbs: Math.round(totals.carbs / servings),
      fat: Math.round(totals.fat / servings),
    }),
    [totals, servings],
  );

  const filteredCommon = COMMON_INGREDIENTS.filter((i) =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const addIngredient = (ing: Ingredient) => {
    setIngredients((prev) => [...prev, { ...ing }]);
    setShowSearch(false);
    setSearchQuery("");
  };

  const addManualIngredient = () => {
    if (!manualName) return;
    addIngredient({
      name: manualName,
      amount: Number(manualAmount) || 1,
      unit: manualUnit,
      calories: Number(manualCals) || 0,
      protein: Number(manualProtein) || 0,
      carbs: Number(manualCarbs) || 0,
      fat: Number(manualFat) || 0,
    });
    setManualName("");
    setManualAmount("");
    setManualCals("");
    setManualProtein("");
    setManualCarbs("");
    setManualFat("");
    setShowManual(false);
  };

  const removeIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!name.trim() || ingredients.length === 0) return;
    onSave({
      name: name.trim(),
      servings,
      ingredients,
      totalCalories: totals.calories,
      totalProtein: totals.protein,
      totalCarbs: totals.carbs,
      totalFat: totals.fat,
      perServingCalories: perServing.calories,
      perServingProtein: perServing.protein,
      perServingCarbs: perServing.carbs,
      perServingFat: perServing.fat,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Recipe Builder</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Recipe name"
        className="w-full p-3 rounded-xl border border-border text-sm bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />

      {/* Servings */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Servings:</span>
        <button
          onClick={() => setServings((s) => Math.max(1, s - 1))}
          className="w-7 h-7 rounded-full bg-muted flex items-center justify-center"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="text-sm font-semibold text-foreground w-6 text-center">{servings}</span>
        <button
          onClick={() => setServings((s) => s + 1)}
          className="w-7 h-7 rounded-full bg-muted flex items-center justify-center"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Ingredient list */}
      {ingredients.map((ing, i) => (
        <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{ing.name}</p>
            <p className="text-xs text-muted-foreground">
              {ing.amount}
              {ing.unit} &middot; {ing.calories} cal &middot; {ing.protein}p &middot; {ing.carbs}c
              &middot; {ing.fat}f
            </p>
          </div>
          <button onClick={() => removeIngredient(i)} className="text-red-400 text-sm ml-2 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      {/* Add ingredient */}
      {showSearch ? (
        <div className="space-y-2 p-3 rounded-xl border border-border bg-card">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ingredients..."
              autoFocus
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-muted border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {filteredCommon.map((ing, i) => (
              <button
                key={i}
                onClick={() => addIngredient(ing)}
                className="w-full text-left p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <p className="text-sm font-medium text-foreground">{ing.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {ing.amount}
                  {ing.unit} &middot; {ing.calories} cal
                </p>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowManual(true)}
              className="flex-1 py-2 text-xs text-primary font-medium"
            >
              + Manual entry
            </button>
            <button
              onClick={() => {
                setShowSearch(false);
                setSearchQuery("");
              }}
              className="flex-1 py-2 text-xs text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : showManual ? (
        <div className="space-y-2 p-3 rounded-xl border border-border bg-card">
          <input
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            placeholder="Ingredient name"
            className="w-full p-2 rounded-lg bg-muted border border-border/50 text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              placeholder="Amount"
              type="number"
              className="p-2 rounded-lg bg-muted border border-border/50 text-sm text-center"
            />
            <input
              value={manualUnit}
              onChange={(e) => setManualUnit(e.target.value)}
              placeholder="Unit"
              className="p-2 rounded-lg bg-muted border border-border/50 text-sm text-center"
            />
            <input
              value={manualCals}
              onChange={(e) => setManualCals(e.target.value)}
              placeholder="Calories"
              type="number"
              className="p-2 rounded-lg bg-muted border border-border/50 text-sm text-center"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              value={manualProtein}
              onChange={(e) => setManualProtein(e.target.value)}
              placeholder="Protein (g)"
              type="number"
              className="p-2 rounded-lg bg-muted border border-border/50 text-sm text-center"
            />
            <input
              value={manualCarbs}
              onChange={(e) => setManualCarbs(e.target.value)}
              placeholder="Carbs (g)"
              type="number"
              className="p-2 rounded-lg bg-muted border border-border/50 text-sm text-center"
            />
            <input
              value={manualFat}
              onChange={(e) => setManualFat(e.target.value)}
              placeholder="Fat (g)"
              type="number"
              className="p-2 rounded-lg bg-muted border border-border/50 text-sm text-center"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={addManualIngredient}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
            >
              Add
            </button>
            <button
              onClick={() => setShowManual(false)}
              className="flex-1 py-2 text-xs text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowSearch(true)}
          className="w-full py-3 rounded-xl bg-primary/5 border border-primary/20 text-sm text-primary font-medium active:scale-[0.98] transition-all"
        >
          + Add Ingredient
        </button>
      )}

      {/* Per-serving macro preview */}
      {ingredients.length > 0 && (
        <div className="p-4 rounded-xl bg-card border border-border">
          <p className="text-xs text-muted-foreground mb-2">Per serving ({servings})</p>
          <div className="grid grid-cols-4 gap-2 text-center overflow-hidden">
            <div className="min-w-0">
              <p className="text-lg font-bold text-orange-500 truncate">{perServing.calories}</p>
              <p className="text-[10px] text-muted-foreground">cal</p>
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-blue-500 truncate">{perServing.protein}g</p>
              <p className="text-[10px] text-muted-foreground">protein</p>
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-yellow-500 truncate">{perServing.carbs}g</p>
              <p className="text-[10px] text-muted-foreground">carbs</p>
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-purple-500 truncate">{perServing.fat}g</p>
              <p className="text-[10px] text-muted-foreground">fat</p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={!name.trim() || ingredients.length === 0}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 transition-opacity"
      >
        Save Recipe
      </button>
    </div>
  );
}
