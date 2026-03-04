import { useMemo } from "react";
import { useFoodFavourites, type FoodFavourite } from "@/hooks/useFoodFavourites";
import { cn } from "@/lib/utils";
import { Star, ChevronRight } from "lucide-react";

interface QuickRelogProps {
  onSelect: (food: FoodFavourite) => void;
  onViewAll?: () => void;
}

const FOOD_EMOJI: Record<string, string> = {
  egg: "🥚", chicken: "🍗", rice: "🍚", bread: "🍞", banana: "🍌",
  oats: "🥣", protein: "🥛", salad: "🥗", fish: "🐟", beef: "🥩",
  pasta: "🍝", yogurt: "🥛", apple: "🍎", coffee: "☕", sandwich: "🥪",
};

function getFoodEmoji(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(FOOD_EMOJI)) {
    if (lower.includes(key)) return emoji;
  }
  return "🍽️";
}

export function QuickRelog({ onSelect, onViewAll }: QuickRelogProps) {
  const { favourites, getTimeRelevant } = useFoodFavourites();

  const relevant = useMemo(
    () => getTimeRelevant(new Date().getHours()),
    [getTimeRelevant]
  );

  if (relevant.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-amber-500" />
          Quick Add
        </p>
        {favourites.length > 5 && onViewAll && (
          <button
            onClick={onViewAll}
            className="text-[11px] text-primary font-medium flex items-center gap-0.5"
          >
            See all <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {relevant.map((fav) => (
          <button
            key={fav.id}
            onClick={() => onSelect(fav)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full",
              "bg-amber-500/10 border border-amber-500/20",
              "text-xs font-medium text-foreground",
              "hover:bg-amber-500/20 active:scale-95 transition-all"
            )}
          >
            <span>{getFoodEmoji(fav.name)}</span>
            <span className="max-w-[100px] truncate">{fav.name}</span>
            <span className="text-muted-foreground">{fav.calories}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
