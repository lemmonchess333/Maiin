import { useMemo, useState, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, ChevronDown, ChevronUp, Info } from "lucide-react";
import { calculateHealthScore, getScoreColor, getScoreLabel } from "@/lib/healthScore";
import { useMeals } from "@/hooks/useMeals";
import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import { format } from "date-fns";
import Tooltip from "@/components/ui/Tooltip";

/* Distilled from `src/lib/healthScore.ts`'s 35/30/15/20 split (workouts /
 * nutrition / water / activity). Names the four inputs without leaking
 * the exact weights — the breakdown drawer below already shows users
 * how they're scoring on each, which is the more useful signal. */
const HEALTH_SCORE_EXPLAINER =
  "0–100 daily score from your workouts, nutrition, water, and activity. Tap the card to see how each contributes today.";

export function HealthScoreCard() {
  const { profile } = useAuth();
  const { getDailyTotals } = useMeals();
  const [expanded, setExpanded] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");
  const totals = getDailyTotals(today);

  const { score, breakdown } = useMemo(() => {
    return calculateHealthScore(
      {
        calories: totals.calories,
        protein: totals.protein,
        mealCount: totals.mealCount,
      },
      {
        calories: profile?.targetCalories || 2200,
        protein: profile?.targetProtein || 160,
      }
    );
  }, [totals, profile]);

  const scoreColor = score != null ? getScoreColor(score) : undefined;

  const breakdownItems = [
    { label: "Workouts", pts: breakdown.workouts, max: 35 },
    { label: "Nutrition", pts: breakdown.nutrition, max: 30 },
    { label: "Water", pts: breakdown.water, max: 15 },
    { label: "Activity", pts: breakdown.activity, max: 20 },
  ];

  /* Outer card was a single <button> wrapping all content; we needed
     to nest a real <button> for the Info / tooltip trigger and that
     would have produced invalid HTML. Switching to <div role="button">
     with explicit keyboard handlers preserves the same UX (tap or
     Enter/Space toggles the breakdown) while letting Info sit inside
     as a sibling button without nesting. */
  const toggle = () => {
    if (score != null) setExpanded(!expanded);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (score == null) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setExpanded(!expanded);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-card">
      <div
        role={score != null ? "button" : undefined}
        tabIndex={score != null ? 0 : -1}
        aria-expanded={score != null ? expanded : undefined}
        onClick={toggle}
        onKeyDown={onKey}
        className="w-full flex items-center gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-xl"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.iconBg }}>
          <Heart className="w-5 h-5" style={{ color: THEME.semantic.vitals }} />
        </div>

        <div className="flex-1 text-left">
          <div className="flex items-center gap-1">
            <p className="text-xs uppercase tracking-wider font-medium" style={{ color: THEME.text.muted }}>Health Score</p>
            <Tooltip content={HEALTH_SCORE_EXPLAINER}>
              <button
                type="button"
                aria-label="About Health Score"
                onClick={(e) => e.stopPropagation()}
                className="p-0.5 -m-0.5 text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              >
                <Info className="w-3 h-3" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          {score != null ? (
            <div className="flex items-center gap-2">
              <p className="text-3xl font-extrabold leading-none font-mono tabular-nums" style={{ color: scoreColor }}>
                {score}
              </p>
              <p className="text-xs text-muted-foreground">{getScoreLabel(score)}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Log activity to see score</p>
          )}
        </div>

        {score != null && (
          <>
            {/* Mini progress bar */}
            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${score}%` }}
                transition={{ duration: 0.6 }}
                className="h-full rounded-full"
                style={{ backgroundColor: scoreColor }}
              />
            </div>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {expanded && score != null && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-3 border-t border-border/30 space-y-2">
              {breakdownItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20">{item.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(item.pts / item.max) * 100}%`,
                        backgroundColor: scoreColor,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground font-mono w-8 text-right">
                    {item.pts}/{item.max}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
