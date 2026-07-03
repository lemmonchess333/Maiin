import { useId } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { platesPerSide, DEFAULT_BAR_KG } from "@/lib/plateMath";

interface PlateCalculatorSheetProps {
  open: boolean;
  onClose: () => void;
  weightKg: number;
}

/**
 * Plate calculator (#985 — the last in-session logging primitive vs
 * Hevy/Strong). Shows the per-side breakdown for the current set's
 * weight on a standard 20kg bar; when the weight isn't exactly
 * loadable, says so and names the nearest loadable weight instead of
 * pretending.
 */
export default function PlateCalculatorSheet({
  open,
  onClose,
  weightKg,
}: PlateCalculatorSheetProps) {
  const titleId = useId();
  const breakdown = platesPerSide(weightKg);

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="sm">
      <div className="p-5 space-y-4">
        <div>
          <h3 id={titleId} className="text-base font-bold text-foreground">
            Plate up{" "}
            <span className="font-mono tabular-nums">{weightKg} kg</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {DEFAULT_BAR_KG} kg bar · per side
          </p>
        </div>

        {!breakdown && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            That's below the bar ({DEFAULT_BAR_KG} kg) — no plates needed.
            Consider dumbbells or a lighter bar.
          </p>
        )}

        {breakdown && breakdown.perSide.length === 0 && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            Just the bar — no plates.
          </p>
        )}

        {breakdown && breakdown.perSide.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {breakdown.perSide.map(({ plateKg, count }) => (
              <span
                key={plateKg}
                className="inline-flex items-center gap-1.5 rounded-xl bg-lifting/10 px-3 py-2 text-sm font-semibold text-lifting"
              >
                <span className="font-mono tabular-nums">
                  {count} × {plateKg}
                </span>
                kg
              </span>
            ))}
          </div>
        )}

        {breakdown && breakdown.remainderKg > 0 && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {breakdown.remainderKg} kg can't be plated with standard plates —
            nearest loadable is{" "}
            <span className="font-mono tabular-nums text-foreground">
              {breakdown.loadableKg} kg
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
