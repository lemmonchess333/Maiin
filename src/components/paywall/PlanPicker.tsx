import { cn } from "@/lib/utils";
import { weeklyPriceLabel, type PlanId, type ProPlan } from "@/lib/proPlans";

/**
 * PlanPicker — the monthly / yearly radiogroup, once.
 *
 * ProModal and the Upgrade page each carried their own copy of this
 * markup (the same radio tile, two radii, two hover treatments), so a
 * change to one drifted from the other. One component; both surfaces
 * render it. Plan cards SELECT; the caller's CTA purchases.
 *
 * Prices come in via `plans` (Apple-localised on the RC build through
 * `useProPlanPrices`), never from here — this component knows nothing
 * about money beyond how to lay it out.
 */
interface Props {
  plans: ProPlan[];
  selectedPlan: PlanId;
  onSelect: (plan: PlanId) => void;
  disabled?: boolean;
  className?: string;
}

export default function PlanPicker({
  plans,
  selectedPlan,
  onSelect,
  disabled = false,
  className,
}: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Choose Pro billing plan"
      className={cn("space-y-2", className)}
    >
      {plans.map((plan) => {
        const isSelected = selectedPlan === plan.id;
        return (
          <button
            key={plan.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onSelect(plan.id)}
            className={cn(
              "relative w-full flex items-center justify-between p-4 rounded-2xl border transition-colors text-left",
              "min-h-[64px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              isSelected
                ? "border-primary bg-primary/10"
                : "border-border bg-card hover:border-primary/40"
            )}
          >
            {plan.topBadge ? (
              <span className="absolute -top-2.5 left-4 text-caption px-2 py-0.5 rounded-full bg-primary-strong text-primary-foreground font-semibold uppercase tracking-wider">
                {plan.topBadge}
              </span>
            ) : null}

            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "size-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  isSelected ? "border-primary" : "border-border"
                )}
                aria-hidden="true"
              >
                {isSelected ? (
                  <div className="size-2.5 rounded-full bg-primary" />
                ) : null}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground leading-tight">
                  {plan.label}
                </p>
                {plan.savingsLabel ? (
                  <p className="text-xs font-medium text-success-strong mt-0.5">
                    {plan.savingsLabel}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Billed {plan.billingFrequency}
                  </p>
                )}
              </div>
            </div>

            <div className="text-right">
              <p className="text-base font-bold text-foreground font-mono tabular-nums">
                {plan.price}
                <span className="text-xs font-medium text-muted-foreground">
                  {plan.period}
                </span>
              </p>
              {/* Weekly anchoring (Sub3): both plans in the same per-week
                  unit makes the annual saving legible. */}
              <p className="text-xs text-muted-foreground font-mono tabular-nums">
                {weeklyPriceLabel(plan.id)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
