import { useId } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { DEFAULT_BAR_KG, LB_BAR, platesInKit } from "@/lib/plateMath";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { formatLoad, liftUnitLabel } from "@/lib/liftLoad";

interface PlateCalculatorSheetProps {
  open: boolean;
  onClose: () => void;
  weightKg: number;
}

/**
 * Plate calculator (#985 — the last in-session logging primitive vs
 * Hevy/Strong). Shows the per-side breakdown for the current set's
 * weight on a standard bar (20 kg, or 45 lb for an lb kit, Lift18); when the weight isn't exactly
 * loadable, says so and names the nearest loadable weight instead of
 * pretending.
 */
export default function PlateCalculatorSheet({
  open,
  onClose,
  weightKg,
}: PlateCalculatorSheetProps) {
  const titleId = useId();
  const unit = useLiftUnit();
  const label = liftUnitLabel(unit);
  const breakdown = platesInKit(weightKg, unit);
  const bar = unit === "lbs" ? LB_BAR : DEFAULT_BAR_KG;

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="sm">
      <div className="p-5 space-y-4">
        <div>
          <h3 id={titleId} className="text-base font-bold text-foreground">
            Plate up{" "}
            <span className="font-mono tabular-nums">
              {formatLoad(weightKg, unit)}
            </span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {bar} {label} bar · per side
          </p>
        </div>

        {!breakdown && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            That's below the bar ({bar} {label}) — no plates needed. Consider
            dumbbells or a lighter bar.
          </p>
        )}

        {breakdown && breakdown.perSide.length === 0 && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            Just the bar — no plates.
          </p>
        )}

        {breakdown && breakdown.perSide.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {breakdown.perSide.map(({ plate, count }) => (
              <span
                key={plate}
                className="inline-flex items-center gap-1.5 rounded-xl bg-lifting/10 px-3 py-2 text-sm font-semibold text-lifting-strong"
              >
                <span className="font-mono tabular-nums">
                  {count} × {plate}
                </span>
                {label}
              </span>
            ))}
          </div>
        )}

        {breakdown && breakdown.remainder > 0 && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {breakdown.remainder} {label} can't be plated with standard plates —
            nearest loadable is{" "}
            <span className="font-mono tabular-nums text-foreground">
              {breakdown.loadable} {label}
            </span>
            .
          </p>
        )}

        <Button variant="outline" className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
