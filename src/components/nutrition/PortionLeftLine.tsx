import { useCalorieRingMode } from "@/hooks/useCalorieRingMode";
import { cn } from "@/lib/utils";
import {
  portionLeftText,
  type DayBudget,
  type PortionFigures,
} from "@/lib/portionLeft";

/**
 * One muted line under a portion's figures: what the day comes to with
 * it. The search result's, the barcode and photo result's, the Quick add
 * portion's and the edit sheet's share it, and it reads the hero's
 * left/logged view from the same store the hero writes. Nothing renders
 * without a day to count against.
 */
export default function PortionLeftLine({
  day,
  portion,
  className,
}: {
  day?: DayBudget | null;
  portion: PortionFigures;
  className?: string;
}) {
  const mode = useCalorieRingMode();
  const text = day ? portionLeftText(day, portion, mode) : null;
  if (!text) return null;
  return (
    <p
      className={cn(
        "text-xs text-muted-foreground font-mono tabular-nums text-balance",
        className
      )}
    >
      {text}
    </p>
  );
}
