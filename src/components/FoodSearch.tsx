import { useState, useEffect, useRef } from "react";
import { Search, Plus, X, Loader2 } from "lucide-react";

interface FoodResult {
  name: string;
  brand: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
}

interface Props {
  onSelect: (food: FoodResult) => void;
  onClose: () => void;
}

export default function FoodSearch({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const res = await fetch(
          `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=15&fields=product_name,brands,nutriments,serving_size`
        );
        const data = await res.json();
        const products: FoodResult[] = (data.products || [])
          .filter((p: { product_name?: string; nutriments?: Record<string, number>; brands?: string; serving_size?: string }) => p.product_name && p.nutriments)
          .map((p: { product_name?: string; nutriments?: Record<string, number>; brands?: string; serving_size?: string }) => ({
            name: p.product_name || "Unknown",
            brand: p.brands || "",
            calories: Math.round(p.nutriments?.["energy-kcal_100g"] || p.nutriments?.["energy-kcal"] || 0),
            protein: Math.round((p.nutriments?.proteins_100g || 0) * 10) / 10,
            carbs: Math.round((p.nutriments?.carbohydrates_100g || 0) * 10) / 10,
            fat: Math.round((p.nutriments?.fat_100g || 0) * 10) / 10,
            servingSize: p.serving_size || "100g",
          }));
        setResults(products);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="space-y-3">
      {/* Search header */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search foods (e.g. chicken breast, rice)"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Results */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="bg-card rounded-xl border border-border/50 overflow-hidden max-h-80 overflow-y-auto">
          {results.map((food, i) => (
            <button
              key={i}
              onClick={() => onSelect(food)}
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{food.name}</p>
                  {food.brand && (
                    <p className="text-[11px] text-muted-foreground truncate">{food.brand}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span className="text-orange-500 font-medium">{food.calories} cal</span>
                    <span>&middot;</span>
                    <span>P {food.protein}g</span>
                    <span>C {food.carbs}g</span>
                    <span>F {food.fat}g</span>
                    <span className="text-[9px]">per {food.servingSize}</span>
                  </div>
                </div>
                <Plus className="w-4 h-4 text-primary shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">No results found</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Try a different search term</p>
        </div>
      )}

      {!searched && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Search the OpenFoodFacts database for nutrition info
        </p>
      )}
    </div>
  );
}
