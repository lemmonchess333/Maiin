import WeekPulseCard from "@/components/WeekPulseCard";
import InlineNumerals from "@/components/ui/InlineNumerals";
import CompletionExtras from "@/components/workout/CompletionExtras";
import SectionHeading from "@/components/ui/SectionHeading";
import StatFigure from "@/components/ui/StatFigure";
import { Card } from "@/components/ui/Card";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import MiniMuscleFigure, {
  hasMuscleFigure,
} from "@/components/social/MiniMuscleFigure";
import { CATEGORY_DISPLAY } from "@/components/analytics/muscleGroupTaxonomy";
import { movementCategoryLabel } from "@/lib/exerciseMovementCategory";
import { liftDayLine } from "@/lib/liftDayLabel";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";
import { setPRDescription, type SetPR, type RepBucket } from "@/lib/prTracking";
import type { ProgramExercise } from "@/features/program/programTypes";
import type { SessionShareAction } from "@/lib/sessionPost";

type SetType = "working" | "warmup" | "dropset" | "failure";

interface SetLog {
  reps: number;
  weight: number;
  completed: boolean;
  type: SetType;
  rpe?: number;
}

interface SessionCompleteScreenProps {
  dayName: string;
  exercises: ProgramExercise[];
  setLogs: SetLog[][];
  firedPRs: Map<string, RepBucket[]>;
  prResults?: Map<string, SetPR>;
  sessionDurationMinutes: number;
  /** PROGRAM-FLEX-01 / PROGRAM-ADAPT-01: acknowledge a reduced
   *  session positively but without pretending it was the full plan. */
  sessionVariant?: "express45" | "express30" | "easier_today" | "time_budget";
  completing: boolean;
  saved?: boolean;
  saveStatus?: "queued" | "synced" | "needs-attention";
  planContext?: { progress: string; next: string };
  /** The saved session's feed post. The finish screen asks once, posts
   *  automatically, or offers the one-off share (`SessionShareRow`). */
  share?: SessionShareAction;
  onFinish: () => void;
  onEdit?: () => void;
  onClose: () => void;
}

export default function SessionCompleteScreen({
  dayName,
  exercises,
  setLogs,
  prResults,
  sessionDurationMinutes,
  sessionVariant,
  completing,
  saved = false,
  saveStatus,
  planContext,
  share,
  onFinish,
  onEdit,
  onClose,
}: SessionCompleteScreenProps) {
  const heading =
    saveStatus === "queued"
      ? "Saved on this phone"
      : saved
        ? "Workout saved"
        : "Review workout";
  // The day as Train, Home and the workout screen name it: "Legs ·
  // Deadlift focus". A routine's own name, with no separator, is itself.
  const dayLabel = liftDayLine(dayName);

  const minutes = sessionDurationMinutes;
  /* Each figure is its number plus how to write it, so the finish can
     count up to it (DS3) and still write every step as the figure is
     written: "1:05" once past an hour, grouped thousands for weight. */
  const clock = (m: number) => {
    const whole = Math.round(m);
    return whole >= 60
      ? `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
      : String(whole);
  };
  const duration = {
    to: minutes,
    format: clock,
    // "1:00" is an hour and no minutes; under it, "hours" read as one
    // figure in hours ("1:00 hours").
    unit: minutes >= 60 ? "hr:min" : minutes === 1 ? "minute" : "minutes",
  };

  /* Timed exercises contribute no tonnage — a hold's `reps` is a
     DURATION, so weight × reps is not a weight moved. Every writer
     applies that rule (`repUnit === "seconds" ? 0 : …`) and so does the
     shared `workoutTonnageKg`, but this stat could not: flattening
     `setLogs` threw away the exercise each set belonged to, and `repUnit`
     lives on the exercise. The association was always here — `setLogs` is
     indexed by exercise, and `exercises` is right there — so the fix is
     to stop discarding it.

     The number is the VOLUME headline the user sees the moment they
     finish, and moments later the writer persists a `totalVolume` that
     DOES exclude holds. One session, two figures: a 20 kg / 60 s plank
     put 1,200 kg between them. */
  const totalVolume = setLogs.reduce((sum, logs, exIdx) => {
    if (exercises[exIdx]?.repUnit === "seconds") return sum;
    return (
      sum +
      logs
        .filter((s) => s.completed && s.type !== "warmup")
        .reduce((t, s) => t + s.weight * s.reps, 0)
    );
  }, 0);

  const grouped = (n: number) => Math.round(n).toLocaleString("en-GB");

  /* A bodyweight session lifts no load the app can weigh, and "0 kg
     lifted" over a set of pull-ups reads as nothing done. Its reps are
     the honest measure, so they take the middle number. Holds still
     count for neither: their `reps` are seconds. */
  const totalReps = setLogs.reduce((sum, logs, exIdx) => {
    if (exercises[exIdx]?.repUnit === "seconds") return sum;
    return (
      sum +
      logs
        .filter((s) => s.completed && s.type !== "warmup")
        .reduce((t, s) => t + s.reps, 0)
    );
  }, 0);
  const work =
    totalVolume > 0 || totalReps === 0
      ? { to: totalVolume, format: grouped, unit: "kg lifted" }
      : {
          to: totalReps,
          format: grouped,
          unit: totalReps === 1 ? "rep" : "reps",
        };

  // WORKING sets only. This was the one header stat that did not exclude
  // warm-ups, so it counted the auto-generated ramp that VOLUME and the
  // per-exercise "n/m sets" rows both correctly leave out — a session showing
  // "Cable Crunch 2/2 sets" and 240kg reported SETS 4. Three numbers, one
  // session, two different definitions of a set.
  const totalSetsCompleted = setLogs
    .flat()
    .filter((s) => s.completed && s.type !== "warmup").length;

  /* New bests (DS3: gold means a personal best and nothing else). A
     "best" beat the exercise's previous best; a "bucket-first" is the
     first set in a rep range, which the screen reports without the gold
     because the exercise's best stands. Keys are `${name}:${bucket}`, so
     the list, and its count, sum the session up: rising sets in one rep
     range are one new best here, shown against the best the lifter came
     in with, though each had its own moment against the set before it. */
  const prRows = [...(prResults ?? new Map<string, SetPR>()).entries()].map(
    ([key, result]) => {
      const name = key.slice(0, key.lastIndexOf(":"));
      return {
        key,
        name,
        exerciseId: exercises.find((ex) => ex.name === name)?.exerciseId,
        result,
      };
    }
  );
  const bests = prRows.filter(({ result }) => result.kind === "best");
  const firsts = prRows.filter(({ result }) => result.kind !== "best");

  /* Muscles worked: working sets per movement category, most first. The
     figure tints the same categories, from the front or the back as the
     session leans. */
  const setsByCategory = new Map<string, number>();
  exercises.forEach((ex, exIdx) => {
    const working = (setLogs[exIdx] ?? []).filter(
      (s) => s.completed && s.type !== "warmup"
    ).length;
    if (working > 0 && ex.movementCategory)
      setsByCategory.set(
        ex.movementCategory,
        (setsByCategory.get(ex.movementCategory) ?? 0) + working
      );
  });
  const muscleRows = [...setsByCategory.entries()].sort((a, b) => b[1] - a[1]);
  const muscleCategories = muscleRows.map(([category]) => category);

  const exerciseSummary = exercises
    .map((ex, exIdx) => {
      const logs = setLogs[exIdx].filter((s) => s.completed);
      const workingSets = logs.filter((s) => s.type !== "warmup");
      const bestSet =
        workingSets.length > 0
          ? workingSets.reduce((best, s) => {
              // Unweighted sets all have zero tonnage. Compare their
              // reps (or hold duration), keeping loaded-set ranking intact.
              const improves =
                s.weight === 0 && best.weight === 0
                  ? s.reps > best.reps
                  : s.weight * s.reps > best.weight * best.reps;
              return improves ? s : best;
            }, workingSets[0])
          : null;
      return {
        name: ex.name,
        repUnit: ex.repUnit,
        setsCompleted: workingSets.length,
        totalSets: ex.sets,
        bestWeight: bestSet?.weight || 0,
        bestReps: bestSet?.reps || 0,
      };
    })
    .filter((e) => e.setsCompleted > 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="region"
      aria-label="Session completion"
      className="fixed inset-0 z-50 bg-background overflow-y-auto safe-area-pb"
    >
      <div className="max-w-md mx-auto px-5 py-8 space-y-6">
        {/* Hero Section */}
        <motion.div
          className="text-center space-y-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-h1 font-extrabold tracking-tight text-foreground text-balance">
            {heading}
          </h2>
          <p className="text-base text-muted-foreground">{dayLabel}</p>
          {sessionVariant === "easier_today" ? (
            <p className="text-sm text-muted-foreground">
              Easier session. Your regular plan stays in place.
            </p>
          ) : sessionVariant === "time_budget" ? (
            <p className="text-sm text-muted-foreground">
              Session prepared for your usual time. Your full programme stays in
              place.
            </p>
          ) : sessionVariant ? (
            <p className="text-sm text-muted-foreground">
              Express {sessionVariant === "express45" ? "45" : "30"} — the
              essentials, done.
            </p>
          ) : null}
        </motion.div>

        {/* The result stays visible; only the exercise breakdown is optional. */}
        <motion.div
          className="grid grid-cols-3 divide-x divide-border"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <StatFigure size="lg" count={duration} unit={duration.unit} />
          <StatFigure size="lg" count={work} unit={work.unit} />
          <StatFigure
            size="lg"
            count={{ to: totalSetsCompleted, format: grouped }}
            unit={totalSetsCompleted === 1 ? "set" : "sets"}
          />
        </motion.div>

        {bests.length > 0 && (
          <section aria-labelledby="session-new-bests" className="space-y-2">
            <SectionHeading
              size="compact"
              id="session-new-bests"
              className="flex items-center gap-2"
            >
              New bests
              <span className="rounded-full bg-achievement/15 px-2 text-sm font-bold font-mono tabular-nums text-achievement-strong">
                {bests.length}
              </span>
            </SectionHeading>
            <Card padded={false} className="divide-y divide-border">
              {bests.map(({ key, name, exerciseId, result }) => (
                <div key={key} className="flex items-center gap-3 p-3">
                  <ExerciseThumb exerciseId={exerciseId ?? ""} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {name}
                    </p>
                    <p className="text-lg font-extrabold font-mono tabular-nums text-achievement-strong">
                      {result.weight} kg × {result.reps}
                    </p>
                    {result.bestBeforeSession && (
                      <p className="text-xs text-muted-foreground">
                        Was{" "}
                        <span className="font-mono tabular-nums">
                          {result.bestBeforeSession.weight} kg ×{" "}
                          {result.bestBeforeSession.reps}
                        </span>
                      </p>
                    )}
                  </div>
                  <Trophy
                    className="size-5 shrink-0 text-achievement"
                    aria-hidden="true"
                  />
                </div>
              ))}
            </Card>
          </section>
        )}

        {firsts.length > 0 && (
          <Card size="compact" tone="muted" className="space-y-1">
            {firsts.map(({ key, name, result }) => (
              <p key={key} className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{name}</span>
                {" · "}
                <InlineNumerals>{setPRDescription(result)}</InlineNumerals>
              </p>
            ))}
          </Card>
        )}

        {hasMuscleFigure(muscleCategories) && (
          <Card className="flex items-center gap-4">
            <MiniMuscleFigure
              categories={muscleCategories}
              className="h-32 w-auto shrink-0"
            />
            <div className="min-w-0 flex-1">
              <SectionHeading size="compact" as="h3">
                Muscles worked
              </SectionHeading>
              <ul className="mt-2 space-y-1">
                {muscleRows.slice(0, 4).map(([category, sets]) => (
                  <li
                    key={category}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="truncate text-foreground">
                      {CATEGORY_DISPLAY[category] ??
                        movementCategoryLabel(category)}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                      {sets} {sets === 1 ? "set" : "sets"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )}

        <div className="space-y-2">
          <p
            role="status"
            className="text-center text-sm text-muted-foreground"
          >
            {completing
              ? "Saving workout…"
              : saveStatus === "queued"
                ? "Waiting to sync"
                : saveStatus === "needs-attention"
                  ? "Needs attention · your session is here to retry"
                  : saved
                    ? "Synced"
                    : "Not saved yet"}
          </p>
          <Button
            fullWidth
            size="lg"
            aria-label={
              saved
                ? "Done"
                : saveStatus === "needs-attention"
                  ? "Retry sync"
                  : "Save workout"
            }
            onClick={saved ? onClose : onFinish}
            loading={completing}
          >
            {saved
              ? "Done"
              : saveStatus === "needs-attention"
                ? "Retry sync"
                : "Save workout"}
          </Button>
          {!saved && onEdit && (
            <Button
              fullWidth
              variant="secondary"
              onClick={onEdit}
              disabled={completing}
            >
              Edit workout
            </Button>
          )}
          {!saved && (
            <Button
              fullWidth
              variant="ghost"
              onClick={onClose}
              disabled={completing}
            >
              {saveStatus === "needs-attention"
                ? "Close"
                : "Close without saving"}
            </Button>
          )}
        </div>
        {saved && planContext && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <InlineNumerals>{planContext.progress}</InlineNumerals>
            </p>
            <p>
              <InlineNumerals>{planContext.next}</InlineNumerals>
            </p>
          </div>
        )}
        {saved && <WeekPulseCard />}
        {saved && <CompletionExtras share={share} />}
        <details className="space-y-4">
          <summary className="min-h-11 py-3 cursor-pointer text-sm font-semibold text-foreground">
            Session details
          </summary>
          {/* Exercise Breakdown */}
          <motion.div
            className="rounded-2xl bg-card overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="px-4 pt-4 pb-2">
              <SectionHeading size="compact">Exercises</SectionHeading>
            </div>
            <div className="divide-y divide-border/30">
              {exerciseSummary.map((ex, i) => (
                <motion.div
                  key={ex.name}
                  className="flex items-center justify-between px-4 py-3"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.05 }}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">
                      {ex.name}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-mono tabular-nums font-semibold text-lifting-strong">
                      {ex.bestWeight > 0
                        ? `${ex.bestWeight} kg × ${ex.bestReps}${ex.repUnit === "seconds" ? " s" : ""}`
                        : `${ex.bestReps} ${ex.repUnit === "seconds" ? "s" : "reps"}`}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "hsl(var(--muted-foreground))" }}
                    >
                      {ex.setsCompleted}/{ex.totalSets} sets
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </details>
      </div>
    </motion.div>
  );
}
