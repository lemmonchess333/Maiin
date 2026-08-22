import { Suspense, useEffect, useState } from "react";
import type { CalorieRingMode } from "./CalorieRing";
import { barFillPct, barLabelPct } from "@/lib/calorieRingFill";
import { useCalorieRingMode } from "@/hooks/useCalorieRingMode";
import { lazyRetry } from "@/lib/lazyRetry";
import { Lock } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { useSubscription } from "@/lib/subscription";
import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import {
  formatCalories,
  formatMacro,
  CALORIE_UNIT,
} from "@/utils/formatNutrition";
import { clampPct } from "@/lib/percentageHelpers";
import { resolveMicroTargets, type MicroKind } from "@/lib/microTargets";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";

const ProModal = lazyRetry(() => import("@/components/ProModal"));

interface DailyTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

// Micro reference colours (tokens only): fiber = positive green (a goal to
// reach), sugar = carb gold (sugar is a carbohydrate), sodium = hydration
// teal (a distinct calm mineral tone). Over-limit switches to the amber
// warning register in MicroRow.
const MICRO_COLORS: Record<"fiber" | "sugar" | "sodium", string> = {
  fiber: THEME.semantic.positive,
  sugar: THEME.macros.carbs,
  sodium: THEME.semantic.hydration,
};

interface HeroDrillDownSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  isToday: boolean;
  dailyTotals: DailyTotals;
  dailyTargets: EffectiveTargets;
}

interface MacroRowProps {
  label: string;
  consumed: number;
  target: number;
  color: string;
  mode: CalorieRingMode;
}

function MacroRow({ label, consumed, target, color, mode }: MacroRowProps) {
  const pct = clampPct(consumed, target);
  const remaining = Math.max(0, Math.round(target - consumed));
  /* Lockstep with the tile that opened this sheet. `MacroColumn` documents
     the bar as moving the same direction as the big number beside it; this
     row never received the mode, so it drew consumed% unconditionally and
     the same protein data read as a 9%-full bar on the tile and an
     89%-full bar here, one tap apart. */
  const fillPct = barFillPct(pct, mode, consumed > target && target > 0);
  const shownPct = barLabelPct(pct, mode);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-caption uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          {label}
        </span>
        <span className="font-mono tabular-nums text-sm">
          <span className="font-semibold text-foreground">
            {formatMacro(consumed)}
          </span>
          <span className="text-muted-foreground">
            {" / "}
            {formatMacro(target)}g
          </span>
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${fillPct}%`, background: color }}
        />
      </div>
      <p className="text-caption text-muted-foreground font-mono tabular-nums">
        {remaining > 0
          ? `${formatMacro(remaining)}g left`
          : `${formatMacro(consumed - target)}g over`}
        {" · "}
        {shownPct}%
      </p>
    </div>
  );
}

interface MicroRowProps {
  label: string;
  consumed: number;
  target: number;
  unit: "g" | "mg";
  kind: MicroKind;
  color: string;
}

// Fiber/sugar/sodium row. Unlike a macro, the KIND matters: a "goal"
// (fiber) fills toward 100% and reads as a win when met; a "limit"
// (sodium, sugar) is fine until exceeded, then flips to the amber warning
// register — over is the caution state, not the achievement.
function MicroRow({
  label,
  consumed,
  target,
  unit,
  kind,
  color,
}: MicroRowProps) {
  const pct = clampPct(consumed, target);
  const isLimit = kind === "limit";
  const over = consumed > target;
  const warn = isLimit && over;
  const barColor = warn ? THEME.amber : color;
  const remaining = Math.max(0, Math.round(target - consumed));
  const overBy = Math.max(0, Math.round(consumed - target));
  const note = isLimit
    ? over
      ? `${formatMacro(overBy)}${unit} over limit`
      : `${formatMacro(remaining)}${unit} left · ${pct}%`
    : consumed >= target
      ? `Goal reached · ${formatMacro(consumed)}${unit}`
      : `${formatMacro(remaining)}${unit} to goal · ${pct}%`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-caption uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          {label}
          {isLimit && (
            <span className="ml-1.5 normal-case tracking-normal text-[10px] text-muted-foreground">
              limit
            </span>
          )}
        </span>
        <span className="font-mono tabular-nums text-sm">
          <span
            className="font-semibold text-foreground"
            style={warn ? { color: THEME.amber } : undefined}
          >
            {formatMacro(consumed)}
          </span>
          <span className="text-muted-foreground">
            {" / "}
            {formatMacro(target)}
            {unit}
          </span>
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <p
        className="text-caption text-muted-foreground font-mono tabular-nums"
        style={warn ? { color: THEME.amber } : undefined}
      >
        {note}
      </p>
    </div>
  );
}

/**
 * Food6 a2: tap-on-hero drill-down sheet. Surfaces the same
 * calorie + macro data the hero shows, but expanded — explicit
 * targets, remaining grams, percentage-to-goal, and (when
 * activity is recorded) an informational summary of calories burned.
 * Kept intentionally read-only — editing targets still routes
 * through Settings.
 */
export default function HeroDrillDownSheet({
  open,
  onOpenChange,
  selectedDate,
  isToday,
  dailyTotals,
  dailyTargets,
}: HeroDrillDownSheetProps) {
  /* The same mode the hero tile is showing. Read from the shared store
     rather than passed as a prop: this sheet renders from Food.tsx, a
     SIBLING of the hero card, so there was no prop path to thread — which
     is why the divergence existed at all. */
  const mode = useCalorieRingMode();
  const target = dailyTargets.finalTarget;
  const remaining = target - dailyTotals.calories;
  const consumedPct = clampPct(dailyTotals.calories, target);
  const showBurnBreakdown = dailyTargets.actualBurn > 0;

  const { isPro } = useSubscription();
  const { profile } = useAuth();
  const micros = resolveMicroTargets(profile?.sex, dailyTargets.finalTarget);
  const [showMacroPaywall, setShowMacroPaywall] = useState(false);
  const [macroPaywallQueued, setMacroPaywallQueued] = useState(false);
  const fuel = dailyTargets.trainingFuel;

  // React batches the CTA click, so setting showMacroPaywall in the same
  // handler doesn't prove the BottomSheet focus trap has released. Queue it
  // and only mount ProModal once the controlled `open` prop is observed false
  // — avoiding nested focus traps. If the parent never closes the sheet, the
  // paywall stays queued rather than stacking.
  useEffect(() => {
    if (!open && macroPaywallQueued) {
      setMacroPaywallQueued(false);
      setShowMacroPaywall(true);
    }
  }, [open, macroPaywallQueued]);

  const dateLabel = isToday
    ? "Today"
    : new Date(selectedDate + "T12:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title="Nutrition breakdown"
        description={dateLabel}
      >
        <div className="p-4 space-y-5 overflow-y-auto">
          {/* Calorie summary */}
          <section className="space-y-2">
            <p className="text-caption uppercase tracking-[0.14em] text-muted-foreground font-semibold">
              Calories
            </p>
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono tabular-nums text-2xl font-extrabold text-foreground">
                  {formatCalories(dailyTotals.calories)}
                </span>
                <span className="text-sm text-muted-foreground font-mono tabular-nums">
                  / {formatCalories(target)} {CALORIE_UNIT}
                </span>
              </div>
              <span className="font-mono tabular-nums text-xs text-muted-foreground">
                {barLabelPct(consumedPct, mode)}%
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${barFillPct(consumedPct, mode, remaining < 0)}%`,
                  background:
                    remaining < 0 ? THEME.semantic.nutrition : "var(--primary)",
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground font-mono tabular-nums">
              {remaining > 0
                ? `${formatCalories(remaining)} ${CALORIE_UNIT} left`
                : `${formatCalories(-remaining)} ${CALORIE_UNIT} over target`}
            </p>
          </section>

          {/* Training-aware fuel — explains WHY today's grams differ. Only when
            a real training/taper context exists. Pro shows the exact applied
            delta at steady calories; free gets an honest capability gate that
            never claims an unapplied change. */}
          {fuel.eligible && (
            <section
              aria-label="Training-aware fuel"
              className="rounded-xl bg-muted/50 p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Fuel for today's training
                </p>
                {!isPro && (
                  <span className="inline-flex items-center gap-1 text-caption font-semibold text-primary">
                    <Lock className="size-3.5" aria-hidden="true" />
                    Pro
                  </span>
                )}
              </div>

              {isPro ? (
                fuel.carbDeltaG > 0 ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Calories stay at{" "}
                    <span className="font-mono tabular-nums">
                      {formatCalories(dailyTargets.finalTarget)}
                    </span>
                    . Today uses{" "}
                    <span className="font-mono tabular-nums">
                      -{fuel.fatDeltaG}g fat
                    </span>{" "}
                    to add{" "}
                    <span className="font-mono tabular-nums">
                      +{fuel.carbDeltaG}g carbs
                    </span>
                    {fuel.proteinDeltaG > 0 && (
                      <>
                        {" "}
                        and restore{" "}
                        <span className="font-mono tabular-nums">
                          +{fuel.proteinDeltaG}g protein
                        </span>
                      </>
                    )}
                    .
                  </p>
                ) : fuel.proteinDeltaG > 0 && fuel.fatDeltaG > 0 ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Calories stay at{" "}
                    <span className="font-mono tabular-nums">
                      {formatCalories(dailyTargets.finalTarget)}
                    </span>
                    . The target is tight, so today uses{" "}
                    <span className="font-mono tabular-nums">
                      -{fuel.fatDeltaG}g fat
                    </span>{" "}
                    to protect{" "}
                    <span className="font-mono tabular-nums">
                      +{fuel.proteinDeltaG}g protein
                    </span>
                    ; there isn't room for extra carbs.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Protein and essential fat are already protected, so today's
                    split stays steady.
                  </p>
                )
              ) : (
                <>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {dailyTargets.targetTooAggressive
                      ? "Your plan knows today is a training day. Pro first protects protein and essential fat within a tight calorie target."
                      : "Your plan knows today is a training day. Pro shifts carbs up and fat down while keeping calories steady."}
                  </p>
                  <Button
                    variant="ghost"
                    fullWidth
                    leftIcon={<Lock className="size-4" aria-hidden="true" />}
                    onClick={() => {
                      setMacroPaywallQueued(true);
                      onOpenChange(false);
                    }}
                  >
                    See training-aware macros
                  </Button>
                </>
              )}
            </section>
          )}

          {/* Macros */}
          <section className="space-y-4">
            <p className="text-caption uppercase tracking-[0.14em] text-muted-foreground font-semibold">
              Macros
            </p>
            <MacroRow
              label="Protein"
              consumed={dailyTotals.protein}
              target={dailyTargets.protein}
              color={THEME.macros.protein}
              mode={mode}
            />
            <MacroRow
              label="Carbs"
              consumed={dailyTotals.carbs}
              target={dailyTargets.carbs}
              color={THEME.macros.carbs}
              mode={mode}
            />
            <MacroRow
              label="Fat"
              consumed={dailyTotals.fat}
              target={dailyTargets.fat}
              color={THEME.macros.fat}
              mode={mode}
            />
          </section>

          {/* Other nutrients — fiber (a goal), sugar + sodium (limits).
              Totals are already aggregated per-meal by mealTotals; the
              reference targets come from microTargets (not personalised the
              way calories/macros are — there's no engine for these). */}
          <section className="space-y-4">
            <p className="text-caption uppercase tracking-[0.14em] text-muted-foreground font-semibold">
              Other nutrients
            </p>
            {micros.map((m) => (
              <MicroRow
                key={m.key}
                label={m.label}
                consumed={dailyTotals[m.key]}
                target={m.target}
                unit={m.unit}
                kind={m.kind}
                color={MICRO_COLORS[m.key]}
              />
            ))}
          </section>

          {/* Activity today — only when activity has been recorded.
            Nutr1 (expenditure-inclusive): this is INFORMATIONAL. The
            calorie target already accounts for activity, so burned
            calories are shown for context, NOT added back to the target. */}
          {showBurnBreakdown && (
            <section className="space-y-2">
              <p className="text-caption uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                Activity today
              </p>
              <div className="space-y-1.5 text-sm">
                {dailyTargets.actualLiftBurn > 0 && (
                  <div className="flex justify-between">
                    <span className="text-foreground">Lifting</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {formatCalories(dailyTargets.actualLiftBurn)}{" "}
                      {CALORIE_UNIT}
                    </span>
                  </div>
                )}
                {dailyTargets.actualRunBurn > 0 && (
                  <div className="flex justify-between">
                    <span className="text-foreground">Running</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {formatCalories(dailyTargets.actualRunBurn)}{" "}
                      {CALORIE_UNIT}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1.5 border-t border-border/40">
                  <span className="font-semibold text-foreground">Burned</span>
                  <span className="font-mono tabular-nums font-semibold text-foreground">
                    {formatCalories(dailyTargets.actualBurn)} {CALORIE_UNIT}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                  Already counted in your target — no need to eat it back.
                </p>
              </div>
            </section>
          )}
        </div>
      </BottomSheet>
      {showMacroPaywall && (
        <Suspense fallback={null}>
          <ProModal
            featureKey="adaptive_macros"
            onClose={() => setShowMacroPaywall(false)}
          />
        </Suspense>
      )}
    </>
  );
}
