interface StepperProps {
  label: string;
  value: number;
  displayValue?: string;
  onDecrement: () => void;
  onIncrement: () => void;
  unit?: string;
}

/**
 * Onboarding number stepper (height / weight). Theme-aware: the surface,
 * border, control fills and text all resolve through design-system tokens so
 * it reads in BOTH themes. It previously hardcoded `rgba(255,255,255,*)` for
 * every layer — a dark-only recipe that rendered white-on-white (invisible
 * card, border, and label) on the light onboarding page.
 */
export default function Stepper({
  label,
  value,
  displayValue,
  onDecrement,
  onIncrement,
  unit,
}: StepperProps) {
  return (
    <div className="rounded-2xl p-4 text-center bg-muted border border-border">
      <p className="text-xs uppercase tracking-wider mb-2 text-muted-foreground">
        {label}
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onDecrement}
          aria-label={`Decrease ${label}`}
          className="size-11 rounded-full flex items-center justify-center text-lg font-bold text-foreground bg-background border border-border active:scale-[0.95]"
        >
          −
        </button>
        <span className="text-xl font-bold font-mono tabular-nums min-w-[60px] text-center text-foreground">
          {displayValue ?? value}
        </span>
        <button
          type="button"
          onClick={onIncrement}
          aria-label={`Increase ${label}`}
          className="size-11 rounded-full flex items-center justify-center text-lg font-bold text-foreground bg-background border border-border active:scale-[0.95]"
        >
          +
        </button>
      </div>
      {unit && <p className="text-xs mt-1 text-muted-foreground">{unit}</p>}
    </div>
  );
}
