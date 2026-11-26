import { useId, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import {
  DEFAULT_BAR_KG,
  LB_BAR,
  LIGHT_BAR_KG,
  LIGHT_BAR_LB,
  platesInKit,
} from "@/lib/plateMath";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { formatLoad, liftUnitLabel } from "@/lib/liftLoad";

interface PlateCalculatorSheetProps {
  open: boolean;
  onClose: () => void;
  weightKg: number;
  /** Whether the lifter's plan has small plates (1.25 kg / 2.5 lb barbell steps). */
  smallPlates?: boolean;
}

/**
 * Plate calculator (#985 — the last in-session logging primitive vs
 * Hevy/Strong). Shows the per-side breakdown for the current set's
 * weight on a standard (20 kg / 45 lb) or lighter (15 kg / 35 lb) bar,
 * honouring `smallPlates` when enabled; when the weight isn't exactly
 * loadable, says so and names the nearest loadable weight instead of
 * pretending.
 */
export default function PlateCalculatorSheet({
  open,
  onClose,
  weightKg,
  smallPlates = false,
}: PlateCalculatorSheetProps) {
  const titleId = useId();
  const unit = useLiftUnit();
  const label = liftUnitLabel(unit);
  const [useLightBar, setUseLightBar] = useState(false);
  const standardBar = unit === "lbs" ? LB_BAR : DEFAULT_BAR_KG;
  const lightBar = unit === "lbs" ? LIGHT_BAR_LB : LIGHT_BAR_KG;
  const bar = useLightBar ? lightBar : standardBar;
  const breakdown = platesInKit(weightKg, unit, {
    smallPlates,
    barWeight: bar,
  });

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
            {bar} {label} bar · per side{smallPlates ? " · small plates" : ""}
          </p>
        </div>

        <div
          role="group"
          aria-label="Bar weight"
          className="grid grid-cols-2 gap-2"
        >
          <Button
            variant={!useLightBar ? "lifting-tinted" : "secondary"}
            aria-pressed={!useLightBar}
            onClick={() => setUseLightBar(false)}
          >
            <span className="font-mono tabular-nums">{standardBar}</span>{" "}
            {label} bar
          </Button>
          <Button
            variant={useLightBar ? "lifting-tinted" : "secondary"}
            aria-pressed={useLightBar}
            onClick={() => setUseLightBar(true)}
          >
            <span className="font-mono tabular-nums">{lightBar}</span> {label}{" "}
            bar
          </Button>
        </div>

        {!breakdown && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            That’s below the bar ({bar} {label}). Try dumbbells or a lighter
            bar.
          </p>
        )}

        {breakdown && breakdown.perSide.length === 0 && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            Just the bar.
          </p>
        )}

        {breakdown && breakdown.perSide.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {breakdown.perSide.map(({ plate, count }) => (
              <span
                key={plate}
                className="inline-block whitespace-nowrap rounded-xl bg-lifting/10 px-3 py-2 text-sm font-semibold text-lifting-strong"
              >
                {/* One run of text, so a space and not a flex gap sits
                    between the plate and its unit. */}
                <span className="font-mono tabular-nums">
                  {count} × {plate}
                </span>{" "}
                {label}
              </span>
            ))}
          </div>
        )}

        {breakdown && breakdown.remainder > 0 && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {breakdown.remainder} {label} can’t be loaded with{" "}
            {smallPlates ? "this plate set" : "standard plates"}. Nearest:{" "}
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
