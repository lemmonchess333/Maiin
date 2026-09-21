import { useMemo } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import UITooltip from "@/components/ui/Tooltip";

/* The metric's definition and the gaps legend, moved off the surface.
   The caveat that follows the chart stays visible — see the title row
   for why the two halves of that paragraph parted company. */
const CALORIE_BALANCE_EXPLAINER =
  "Estimated maintenance − logged food, with today excluded. A gap in the chart is a day with no food logged.";
import { Info } from "lucide-react";
import type { Meal } from "@/hooks/useMeals";
import { useAuth } from "@/lib/auth";
import { format, subDays } from "date-fns";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  Cell,
  Tooltip,
} from "recharts";
import { calcDayBalance, getBalanceColor } from "@/utils/calorieBalance";
import { calculateTDEE, type ActivityLevel } from "@/lib/tdee";
import { formatCalories, CALORIE_UNIT } from "@/utils/formatNutrition";
import { computeDataConfidence, T5_BARS_MIN_COUNT } from "@/lib/dataConfidence";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** The chart's window. Today is excluded — it is still in progress, and a
 *  partial log would read as a deficit — so the denominator beneath the
 *  chart is the window minus that day. Both used to be written out as
 *  literals in four places (14, 13, "14 days", "/ 13"), which is one
 *  number displayed from somewhere other than where it is decided. */
const WINDOW_DAYS = 14;
const PAST_DAYS = WINDOW_DAYS - 1;

export default function CalorieBalanceChart({ meals }: { meals: Meal[] }) {
  const { profile } = useAuth();
  const maintenance = calculateTDEE(
    profile?.weightKg ?? 70,
    profile?.heightCm ?? 175,
    profile?.age ?? 30,
    (profile?.activityLevel as ActivityLevel) ?? "moderate",
    "recomp",
    (profile?.sex as "male" | "female") ?? "male"
  ).tdee;
  const today = format(new Date(), "yyyy-MM-dd");
  const data = useMemo(() => {
    const now = new Date(today + "T12:00:00");
    return Array.from({ length: WINDOW_DAYS }, (_, i) => {
      const date = subDays(now, PAST_DAYS - i);
      const dateStr = format(date, "yyyy-MM-dd");
      const entries = meals.filter((meal) => meal.date === dateStr);
      const consumed = entries.reduce(
        (sum, meal) => sum + (meal.totalCalories || 0),
        0
      );
      const point = calcDayBalance(
        dateStr,
        format(date, "EEE"),
        consumed,
        maintenance
      );
      return {
        ...point,
        // No entry is unknown, not zero intake. Today is still in progress.
        // Even past days are estimates: a meal entry does not prove a full log.
        balance: entries.length > 0 && dateStr !== today ? point.balance : null,
      };
    });
  }, [meals, maintenance, today]);
  const loggedDays = data.filter((day) => day.balance !== null);
  const average = loggedDays.length
    ? Math.round(
        loggedDays.reduce((sum, day) => sum + (day.balance ?? 0), 0) /
          loggedDays.length
      )
    : null;

  /* Hist5d T5, through the shared gate. The lock reads "bar charts gated
     on >=3 bars (omit when fewer, no substitute)", and this card is the
     rule's FIRST consumer anywhere in the app — `hasBars` had been
     computed and read by nothing since it was written. So two logged
     days out of thirteen still drew the full plot: two posts, eleven
     gaps, and a y-axis scaled to whichever post was taller. Eleven gaps
     in a row read as a shape.

     The unit handed to the gate is LOGGED days, not charted ones. The
     window is fourteen points wide whatever the user has done, so
     `data.length` would answer 14 for an account with no food at all and
     the gate would never fire.

     Four of the five returned flags go unused, which is the shape
     `TrendWeight` already has for T3 — the point is that the threshold
     is decided in one place, not that a caller wants the whole object.
     Hist5d cross-cut pin 5 puts the per-surface wrapper here rather than
     in `dataConfidence.ts`. */
  const hasChart = computeDataConfidence({
    pointsInWindow: loggedDays.length,
    pointsInPriorWindow: 0,
    windowDays: WINDOW_DAYS,
  }).hasBars;
  const reduced = useReducedMotion();
  /* Pin 10: the day the third day lands, the caveat fades out and the
     chart fades in over 200ms. `initial={false}` keeps first paint
     instant — an entrance animation on every mount is not what the pin
     describes, and it would make the capture rig race its own frame. */
  const fade = reduced ? 0 : 0.2;

  return (
    <div className="p-4 rounded-2xl bg-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <SectionLabel>Calorie balance</SectionLabel>
          {/* What the bars are, on request. The DISCLOSURE below stays on
              the surface — a caveat that stops a reader concluding they
              are losing weight is not help text, and putting it behind a
              tap would be hiding it rather than tidying it. */}
          <UITooltip content={CALORIE_BALANCE_EXPLAINER}>
            <button
              type="button"
              aria-label="How calorie balance is measured"
              className="p-4 -m-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Info className="size-3" aria-hidden="true" />
            </button>
          </UITooltip>
        </div>
        <span className="text-xs text-muted-foreground">
          {WINDOW_DAYS} days
        </span>
      </div>
      {/* The plot area holds its height in both states, so the card does
          not jump when the third day lands and the capture rig does not
          film two different card sizes for the same surface. */}
      <div className="h-44">
        <AnimatePresence initial={false} mode="wait">
          {hasChart ? (
            <motion.div
              key="chart"
              className="h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: fade }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  aria-label="Calorie balance: estimated maintenance minus logged food, by day"
                  data={data}
                  margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
                >
                  <XAxis
                    dataKey="day"
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    axisLine={false}
                    tickLine={false}
                    interval={1}
                  />
                  <YAxis
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    axisLine={false}
                    tickLine={false}
                    width={35}
                    tickFormatter={(value) =>
                      Math.abs(value) >= 1000
                        ? `${(value / 1000).toFixed(1)}k`
                        : String(value)
                    }
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Tooltip
                    cursor={false}
                    content={(props) => {
                      if (!props.active || !props.payload?.length) return null;
                      const entry = props.payload[0];
                      if (entry.value == null) return null;
                      const value = Number(entry.value);
                      if (!Number.isFinite(value)) return null;
                      const point = entry.payload as { date: string };
                      return (
                        <div className="rounded-xl border border-border bg-card p-3 text-xs text-foreground shadow-sm">
                          <p className="font-semibold">
                            {format(
                              new Date(point.date + "T12:00:00"),
                              "d MMM yyyy"
                            )}
                          </p>
                          <p>
                            Estimated gap: {value > 0 ? "+" : ""}
                            {Math.round(value).toLocaleString()} {CALORIE_UNIT}
                          </p>
                          <p className="text-muted-foreground">
                            Based on logged food; entries may be incomplete.
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="balance" radius={[3, 3, 3, 3]} barSize={12}>
                    {data.map((entry) => (
                      <Cell
                        key={entry.date}
                        fill={getBalanceColor(
                          entry.balance ?? 0,
                          profile?.program?.goal
                        )}
                        opacity={0.75}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          ) : (
            /* Hist5d pin 4's ghost preview, verbatim: a `bg-muted` block
               with the caveat below it. The pin names what it is NOT —
               no dashed border, no diagonal stripes, no opacity tricks —
               and records why: a desaturated or half-transparent chart
               fails `prefers-contrast: more` and
               `prefers-reduced-transparency: reduce`. A solid token block
               is the treatment that survives both, which is also why pin
               5's boxed-empty-state fallback for those queries needs no
               separate branch here: there is no decorative treatment to
               fall back FROM.

               Not an `EmptyState` hexagon. T5's own words are "omit when
               fewer, NO SUBSTITUTE" — the chart goes, and nothing takes
               its place in the plot area. The figures stay below, which
               is pin 3 ("raw numbers always shown — suppression only
               abstracts visual decorations"). */
            <motion.div
              key="ghost"
              className="h-full flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: fade }}
            >
              <div className="flex-1 rounded-xl bg-muted" aria-hidden="true" />
              {/* Pin 6: one muted line, at most 30 characters. Pin 7:
                  action framing, because a bar chart is gated on what the
                  user does rather than on time passing.

                  `suppressionCaveatCopy("bars")` is NOT called, and the
                  reason is worth stating: it returns the hard-coded "Log
                  first run", which is right for a running chart and
                  nonsense here — a run does not unblock calorie bars.
                  Cross-cut pin 5 puts per-surface wrappers at the surface,
                  so the line is written here and held to the same budget
                  by this card's own test. */}
              <p className="text-xs text-muted-foreground pt-2">
                {`Log ${T5_BARS_MIN_COUNT} days to see the chart`}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-around border-t border-border/30 pt-2">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Average logged-day gap
          </p>
          <p className="text-sm font-bold font-mono tabular-nums text-foreground">
            {average === null
              ? "Not enough data"
              : `${average >= 0 ? "+" : ""}${formatCalories(average)} ${CALORIE_UNIT}`}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Past days with entries
          </p>
          <p className="text-sm font-bold font-mono tabular-nums text-foreground">
            {loggedDays.length} / {PAST_DAYS}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Partial logs can overstate a deficit, so this chart does not predict
        weight change or confirm progress toward your goal.
      </p>
    </div>
  );
}
