import { useMemo, useState, lazy, Suspense, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, Trophy, Search, Dumbbell } from "lucide-react";
import { useWorkouts } from "@/hooks/useWorkouts";
import { EXERCISES } from "@/lib/exercises";
import { epley1RMExact } from "@/lib/analytics";
import { formatDayMonth } from "@/utils/formatters";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { localDateString } from "@/lib/dateHelpers";

const ExerciseProgressChart = lazy(
  () => import("@/components/analytics/ExerciseProgressChart")
);
const ExerciseFormContent = lazy(
  () => import("@/components/ExerciseFormContent")
);

// Time ranges available on the chart. Mirrors History's main time-range
// pills so the mental model carries across pages.
const RANGE_DAYS: Record<string, number> = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  All: Infinity,
};
const RANGE_ORDER = ["1M", "3M", "6M", "1Y", "All"] as const;

// Which rep buckets to show in the PRs strip. Four is the sweet spot —
// 1/3/5/10 covers the most common programming targets without crowding
// the screen (Hevy shows six, but on mobile that wraps awkwardly).
const REP_BUCKETS = [1, 3, 5, 10] as const;

type Metric = "1RM" | "Max Weight" | "Volume";

interface SessionSummary {
  date: string;
  sets: { reps: number; weightKg: number }[];
  // Derived metrics per session.
  topSet: { reps: number; weightKg: number } | null;
  e1rm: number; // best estimated 1RM across the session
  maxWeight: number;
  volume: number;
  totalReps: number;
}

function topSetOf(
  sets: { reps: number; weightKg: number }[]
): { reps: number; weightKg: number } | null {
  if (sets.length === 0) return null;
  // Top set = highest e1rm. Ties broken by heaviest weight.
  let best: { reps: number; weightKg: number } = sets[0];
  let bestScore = epley1RMExact(best.weightKg, best.reps);
  for (const s of sets) {
    const score = epley1RMExact(s.weightKg, s.reps);
    if (
      score > bestScore ||
      (score === bestScore && s.weightKg > best.weightKg)
    ) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

function formatWeight(kg: number): string {
  if (kg === 0) return "BW";
  return `${kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(1)} kg`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return formatDayMonth(d);
}

export default function ExerciseHistory() {
  const params = useParams<{ name: string }>();
  const decodedName = params.name ? decodeURIComponent(params.name) : "";
  const { workouts, loading } = useWorkouts();
  const navigate = useNavigate();
  const location = useLocation();

  const [timeRange, setTimeRange] =
    useState<(typeof RANGE_ORDER)[number]>("3M");
  const [metric, setMetric] = useState<Metric>("1RM");
  // Top-level tab: "progress" (chart + sessions) or "form" (muscle
  // diagrams + instructions). Default depends on entry point — opening
  // from Program (where the user is asking "how do I do this?") starts
  // on Form; from History / PR list (where the user is asking "how am
  // I trending?") starts on Progress. The caller threads the intent
  // through `navigate(..., { state: { initialTab: "form" } })`.
  const initialTab = (
    location.state as { initialTab?: "progress" | "form" } | null
  )?.initialTab;
  const [tab, setTab] = useState<"progress" | "form">(initialTab ?? "progress");

  const exercise = useMemo(
    () => EXERCISES.find((e) => e.name === decodedName),
    [decodedName]
  );
  const isBodyweight = exercise?.equipment === "Bodyweight";

  // Build chronological session summary for this specific exercise from
  // every logged workout. Kept as one useMemo keyed on `workouts` so the
  // heavy traversal runs once per data update, not on every render.
  const allSessions: SessionSummary[] = useMemo(() => {
    const out: SessionSummary[] = [];
    for (const w of workouts) {
      const ex = w.exercises?.find((e) => e.exerciseName === decodedName);
      if (!ex || !ex.sets || ex.sets.length === 0) continue;
      const sets = ex.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg }));
      const top = topSetOf(sets);
      let e1rm = 0;
      let maxWeight = 0;
      let volume = 0;
      let totalReps = 0;
      for (const s of sets) {
        e1rm = Math.max(e1rm, epley1RMExact(s.weightKg, s.reps));
        maxWeight = Math.max(maxWeight, s.weightKg);
        volume += s.weightKg * s.reps;
        totalReps += s.reps;
      }
      out.push({
        date: w.date,
        sets,
        topSet: top,
        e1rm,
        maxWeight,
        volume,
        totalReps,
      });
    }
    // Ascending by date so chart + "previous session" lookups run forward.
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }, [workouts, decodedName]);

  // Rep-range PRs — heaviest weight ever lifted at exactly that rep
  // count. For bodyweight exercises this is the heaviest ADDED weight
  // (e.g. weighted pull-ups stored as `weightKg = 10` for +10 kg);
  // pure BW sessions store `weightKg = 0` and just show "BW" with the
  // most recent date that achieved exactly that rep count.
  const repRangePRs = useMemo(() => {
    const map: Record<number, { weightKg: number; date: string } | null> = {};
    for (const bucket of REP_BUCKETS) map[bucket] = null;
    for (const s of allSessions) {
      for (const set of s.sets) {
        for (const bucket of REP_BUCKETS) {
          if (set.reps !== bucket) continue;
          const existing = map[bucket];
          if (!existing || set.weightKg > existing.weightKg) {
            map[bucket] = { weightKg: set.weightKg, date: s.date };
          }
        }
      }
    }
    return map;
  }, [allSessions]);

  // Walk sessions chronologically tracking running best. Flag each session
  // whose top-set e1rm beats the previous running best — these get a
  // filled-star marker on the chart. Without this, the line is just a
  // trend with no "you made history here" signal.
  const prDates = useMemo(() => {
    const prs = new Set<string>();
    let runningBest = 0;
    for (const s of allSessions) {
      if (s.e1rm > runningBest) {
        runningBest = s.e1rm;
        prs.add(s.date);
      }
    }
    return prs;
  }, [allSessions]);

  // Previous-session delta: each session gets "+5 kg from last" etc.
  // Keyed by date → delta kg (top-set weight). Null when no previous
  // session exists.
  const prevDeltas = useMemo(() => {
    const map = new Map<string, number | null>();
    let prevWeight: number | null = null;
    for (const s of allSessions) {
      const topW = s.topSet?.weightKg ?? 0;
      map.set(s.date, prevWeight == null ? null : topW - prevWeight);
      prevWeight = topW;
    }
    return map;
  }, [allSessions]);

  // Filter by time range. "All" passes everything through.
  const filteredSessions = useMemo(() => {
    const days = RANGE_DAYS[timeRange];
    if (!Number.isFinite(days)) return allSessions;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    // `s.date` is a LOCAL "YYYY-MM-DD" string (workout.date), so the cutoff
    // must be the LOCAL date too. `cutoff.toISOString()` (UTC) can land on a
    // different calendar day than the user's local date (direction depends on
    // the offset + wall-clock hour), shifting the time-range boundary a day.
    const cutoffStr = localDateString(cutoff);
    return allSessions.filter((s) => s.date >= cutoffStr);
  }, [allSessions, timeRange]);

  // Header stat strip. Always over all-time data, not the filtered range,
  // so "all-time best" actually means all-time.
  const headerStats = useMemo(() => {
    const best1RM = allSessions.reduce((m, s) => Math.max(m, s.e1rm), 0);
    const maxReps = allSessions.reduce((m, s) => Math.max(m, s.totalReps), 0);
    const totalSets = allSessions.reduce((t, s) => t + s.sets.length, 0);
    return {
      best1RM: Math.round(best1RM),
      maxReps,
      totalSessions: allSessions.length,
      totalSets,
    };
  }, [allSessions]);

  // Chart series driven by the metric toggle. Y-axis semantics shift —
  // Recharts is fine with variable-scale data as long as each sub-array
  // is internally consistent.
  const chartData = useMemo(() => {
    return filteredSessions.map((s) => {
      let value = 0;
      if (isBodyweight) {
        value = metric === "Volume" ? s.volume : s.totalReps;
      } else if (metric === "1RM") {
        value = Math.round(s.e1rm);
      } else if (metric === "Max Weight") {
        value = s.maxWeight;
      } else {
        value = s.volume;
      }
      return { date: s.date, value, isPR: prDates.has(s.date) };
    });
  }, [filteredSessions, metric, isBodyweight, prDates]);

  // For BW exercises, the metric toggle simplifies to Reps / Volume — no
  // weight-based options make sense when the weight is implicit.
  const metricOptions: Metric[] = isBodyweight
    ? ["1RM", "Volume"]
    : ["1RM", "Max Weight", "Volume"];
  const displayMetric =
    isBodyweight && metric === "Max Weight" ? "1RM" : metric;

  const goBack = useCallback(() => {
    haptic("light");
    navigate(-1);
  }, [navigate]);

  if (loading) {
    return (
      <div className="space-y-4 pt-2">
        <div className="h-8 bg-muted/50 rounded animate-pulse" />
        <div className="h-24 bg-muted/50 rounded-2xl animate-pulse" />
        <div className="h-48 bg-muted/50 rounded-2xl animate-pulse" />
      </div>
    );
  }

  // Exercise name didn't match anything in the database (user renamed
  // an exercise, or a typo in the URL). Still handle gracefully — the
  // shared hexagon EmptyState carries the single back affordance, so the
  // separate top "Back" button is dropped here (it duplicated the action).
  if (!exercise && allSessions.length === 0) {
    return (
      <EmptyState
        icon={Search}
        accent={THEME.lifting}
        headline="Exercise not found"
        sub={`"${decodedName}" isn't in your logs or the exercise database.`}
        action={{ label: "Browse exercises", onClick: goBack }}
      />
    );
  }

  const hasNoSessions = allSessions.length === 0;
  const hasOnlyOneSession = allSessions.length === 1;

  return (
    <motion.div
      className="space-y-4 pt-2 pb-8"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="size-11 flex items-center justify-center rounded-full bg-card active:scale-90 transition-transform card-shadow"
        >
          <ChevronLeft className="size-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-extrabold text-foreground truncate">
            {decodedName}
          </h1>
          {exercise && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-caption font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-lifting/9 text-lifting">
                {exercise.muscleGroup}
              </span>
              <span className="text-xs text-muted-foreground">
                {exercise.equipment}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Stat strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 rounded-xl bg-card card-shadow">
          <p className="text-caption uppercase tracking-wider font-medium text-muted-foreground">
            {isBodyweight ? "Max reps" : "Best 1RM"}
          </p>
          <p className="text-lg font-extrabold font-mono tabular-nums text-foreground mt-1">
            {isBodyweight
              ? headerStats.maxReps || "—"
              : headerStats.best1RM
                ? `${headerStats.best1RM}`
                : "—"}
            {!isBodyweight && headerStats.best1RM > 0 && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                kg
              </span>
            )}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-card card-shadow">
          <p className="text-caption uppercase tracking-wider font-medium text-muted-foreground">
            Sessions
          </p>
          <p className="text-lg font-extrabold font-mono tabular-nums text-foreground mt-1">
            {headerStats.totalSessions}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-card card-shadow">
          <p className="text-caption uppercase tracking-wider font-medium text-muted-foreground">
            Total sets
          </p>
          <p className="text-lg font-extrabold font-mono tabular-nums text-foreground mt-1">
            {headerStats.totalSets}
          </p>
        </div>
      </div>

      {/* ── Tab toggle — Progress / Form. Shared SegmentedControl
            primitive (replaces a hand-rolled pill row that had no a11y —
            now a full WAI-ARIA radiogroup with roving tabindex + keyboard,
            and the same switch treatment as the Programme tabs). */}
      <SegmentedControl
        ariaLabel="Exercise view"
        value={tab}
        onChange={(value) => {
          haptic("light");
          setTab(value);
        }}
        options={[
          { value: "progress", label: "Progress" },
          { value: "form", label: "Form" },
        ]}
      />

      {tab === "form" ? (
        <div className="rounded-2xl bg-card p-4 card-shadow">
          <Suspense
            fallback={
              <div className="h-40 bg-muted/30 rounded animate-pulse" />
            }
          >
            <ExerciseFormContent exerciseName={decodedName} />
          </Suspense>
        </div>
      ) : hasNoSessions ? (
        <EmptyState
          icon={Dumbbell}
          accent={THEME.lifting}
          headline="No sessions logged yet"
          sub={`Log ${decodedName} on a workout to start tracking your progression here.`}
          action={{ label: "Go to Train", href: "/program" }}
        />
      ) : (
        <>
          {/* ── Rep-range PRs ───────────────────────────────────────── */}
          <div className="rounded-2xl bg-card p-4 space-y-3 card-shadow">
            <div className="flex items-center gap-2">
              <Trophy className="size-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground">
                {isBodyweight ? "Personal bests by reps" : "Rep-range PRs"}
              </h3>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {REP_BUCKETS.map((b) => {
                const pr = repRangePRs[b];
                return (
                  <div key={b} className="text-center">
                    <p className="text-caption uppercase tracking-wider text-muted-foreground font-medium">
                      {b}RM
                    </p>
                    <p className="text-sm font-bold font-mono tabular-nums text-foreground mt-0.5">
                      {pr
                        ? isBodyweight && pr.weightKg === 0
                          ? "BW"
                          : `${pr.weightKg}`
                        : "—"}
                      {pr && pr.weightKg > 0 && !isBodyweight && (
                        <span className="text-caption font-normal text-muted-foreground ml-0.5">
                          kg
                        </span>
                      )}
                    </p>
                    {pr && (
                      <p className="text-caption text-muted-foreground mt-0.5">
                        {formatDate(pr.date)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Time range — shared SegmentedControl (wrap layout). Was a
                row of sub-44px scroll pills (touch-target gap + no a11y); now
                the radiogroup primitive with proper targets + keyboard nav,
                matching the Progress/Form switch above. */}
          <SegmentedControl
            ariaLabel="Chart time range"
            layout="wrap"
            value={timeRange}
            onChange={(value) => {
              haptic("light");
              setTimeRange(value);
            }}
            options={RANGE_ORDER.map((r) => ({ value: r, label: r }))}
          />

          {/* ── Chart with metric toggle ────────────────────────────── */}
          {hasOnlyOneSession ? (
            <div className="p-4 rounded-2xl bg-card text-center py-8 card-shadow">
              <p className="text-sm text-muted-foreground">
                Log more sessions to see progression
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-card p-4 space-y-3 card-shadow">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                  Progression
                </p>
                <div className="flex gap-1 bg-muted rounded-full p-0.5">
                  {metricOptions.map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => {
                        haptic("light");
                        setMetric(m);
                      }}
                      className={`px-2 py-1 rounded-full text-caption font-semibold transition-colors ${
                        displayMetric === m
                          ? "bg-card text-foreground"
                          : "text-muted-foreground"
                      }`}
                      style={
                        displayMetric === m
                          ? { boxShadow: "var(--ds-shadow-card)" }
                          : undefined
                      }
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <Suspense
                fallback={
                  <div className="h-40 bg-muted/30 rounded animate-pulse" />
                }
              >
                <ExerciseProgressChart
                  data={chartData}
                  accent={THEME.lifting}
                />
              </Suspense>
            </div>
          )}

          {/* ── Recent sessions list ────────────────────────────────── */}
          <div className="rounded-2xl bg-card overflow-hidden card-shadow">
            <div className="px-4 pt-4 pb-3 border-b border-border/30">
              <h3 className="text-sm font-semibold text-foreground">
                Recent sessions
              </h3>
            </div>
            <div className="divide-y divide-border/20">
              {[...filteredSessions]
                .reverse()
                .slice(0, 20)
                .map((s) => {
                  const delta = prevDeltas.get(s.date);
                  const isPR = prDates.has(s.date);
                  return (
                    <div
                      key={s.date}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium text-foreground">
                            {formatDate(s.date)}
                          </p>
                          {isPR && (
                            <span
                              className="text-caption font-bold tracking-wider px-1.5 py-0.5 rounded-full"
                              style={{
                                backgroundColor: THEME.semantic.nutrition,
                                color: "white",
                              }}
                            >
                              PR
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.sets.length} set{s.sets.length !== 1 ? "s" : ""}
                          {" · "}
                          {isBodyweight
                            ? `${s.totalReps} reps total`
                            : `${Math.round(s.volume)} kg volume`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-bold font-mono tabular-nums text-foreground">
                          {s.topSet
                            ? `${formatWeight(s.topSet.weightKg)} × ${s.topSet.reps}`
                            : "—"}
                        </p>
                        {delta != null && delta !== 0 && (
                          <p
                            className="text-caption font-medium mt-0.5"
                            style={{
                              color:
                                delta > 0 ? THEME.success : THEME.text.muted,
                            }}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta} kg from last
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
