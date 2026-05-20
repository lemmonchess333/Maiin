import BottomSheet from "@/components/ui/BottomSheet";
import { THEME } from "@/lib/theme";
import { formatCalories, formatMacro, CALORIE_UNIT } from "@/utils/formatNutrition";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";

interface DailyTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface HeroDrillDownSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  isToday: boolean;
  dailyTotals: DailyTotals;
  dailyTargets: EffectiveTargets;
}

function clampPct(consumed: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((consumed / target) * 100)));
}

interface MacroRowProps {
  label: string;
  consumed: number;
  target: number;
  color: string;
}

function MacroRow({ label, consumed, target, color }: MacroRowProps) {
  const pct = clampPct(consumed, target);
  const remaining = Math.max(0, Math.round(target - consumed));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          {label}
        </span>
        <span className="font-mono tabular-nums text-sm">
          <span className="font-semibold text-foreground">{formatMacro(consumed)}</span>
          <span className="text-muted-foreground">
            {" / "}
            {formatMacro(target)}g
          </span>
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(0,0,0,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {remaining > 0
          ? `${formatMacro(remaining)}g left`
          : `${formatMacro(consumed - target)}g over`}
        {" · "}
        {pct}%
      </p>
    </div>
  );
}

/**
 * Food6 a2: tap-on-hero drill-down sheet. Surfaces the same
 * calorie + macro data the hero shows, but expanded — explicit
 * targets, remaining grams, percentage-to-goal, and (when
 * activity is recorded) the burn breakdown driving the calorie
 * target adjustment. Kept intentionally read-only — editing
 * targets still routes through Settings.
 */
export default function HeroDrillDownSheet({
  open,
  onOpenChange,
  selectedDate,
  isToday,
  dailyTotals,
  dailyTargets,
}: HeroDrillDownSheetProps) {
  const target = dailyTargets.finalTarget;
  const remaining = target - dailyTotals.calories;
  const consumedPct = clampPct(dailyTotals.calories, target);
  const showBurnBreakdown = dailyTargets.actualBurn > 0;

  const dateLabel = isToday
    ? "Today"
    : new Date(selectedDate + "T12:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Nutrition breakdown"
      description={dateLabel}
    >
      <div className="px-4 py-4 space-y-5 overflow-y-auto">
        {/* Calorie summary */}
        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
            Calories
          </p>
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono tabular-nums text-2xl font-extrabold text-foreground">
                {formatCalories(dailyTotals.calories)}
              </span>
              <span className="text-sm text-muted-foreground">
                / {formatCalories(target)} {CALORIE_UNIT}
              </span>
            </div>
            <span className="font-mono tabular-nums text-xs text-muted-foreground">
              {consumedPct}%
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: "rgba(0,0,0,0.06)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${consumedPct}%`,
                background: remaining < 0 ? THEME.semantic.nutrition : "var(--primary)",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {remaining > 0
              ? `${formatCalories(remaining)} ${CALORIE_UNIT} left`
              : `${formatCalories(-remaining)} ${CALORIE_UNIT} over target`}
          </p>
        </section>

        {/* Macros */}
        <section className="space-y-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
            Macros
          </p>
          <MacroRow
            label="Protein"
            consumed={dailyTotals.protein}
            target={dailyTargets.protein}
            color={THEME.macros.protein}
          />
          <MacroRow
            label="Carbs"
            consumed={dailyTotals.carbs}
            target={dailyTargets.carbs}
            color={THEME.macros.carbs}
          />
          <MacroRow
            label="Fat"
            consumed={dailyTotals.fat}
            target={dailyTargets.fat}
            color={THEME.macros.fat}
          />
        </section>

        {/* Burn breakdown — only when activity has been recorded.
            Explains why the calorie target is higher than the
            user's resting target on training days. Mirrors the
            caption logic on the hero card but expanded into a
            table the user can scan. */}
        {showBurnBreakdown && (
          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
              Activity adjustment
            </p>
            <div className="space-y-1.5 text-sm">
              {dailyTargets.actualLiftBurn > 0 && (
                <div className="flex justify-between">
                  <span className="text-foreground">Lifting</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    +{formatCalories(dailyTargets.actualLiftBurn)} {CALORIE_UNIT}
                  </span>
                </div>
              )}
              {dailyTargets.actualRunBurn > 0 && (
                <div className="flex justify-between">
                  <span className="text-foreground">Running</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    +{formatCalories(dailyTargets.actualRunBurn)} {CALORIE_UNIT}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 border-t border-border/40">
                <span className="font-semibold text-foreground">Total burn applied</span>
                <span className="font-mono tabular-nums font-semibold text-foreground">
                  +{formatCalories(dailyTargets.effectiveBonus)} {CALORIE_UNIT}
                </span>
              </div>
            </div>
          </section>
        )}
      </div>
    </BottomSheet>
  );
}
