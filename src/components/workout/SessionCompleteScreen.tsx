import { useEffect, useRef } from "react";
import WeekPulseCard from "@/components/WeekPulseCard";
import InlineNumerals from "@/components/ui/InlineNumerals";
import CompletionExtras from "@/components/workout/CompletionExtras";
import SessionBadge from "@/components/workout/SessionBadge";
import SectionHeading from "@/components/ui/SectionHeading";
import StatFigure from "@/components/ui/StatFigure";
import { Card } from "@/components/ui/Card";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import { formArtCutoutUrl, sessionLeadArt } from "@/lib/formArtCutouts";
import MiniMuscleFigure, {
  hasMuscleFigure,
} from "@/components/social/MiniMuscleFigure";
import { CATEGORY_DISPLAY } from "@/components/analytics/muscleGroupTaxonomy";
import { movementCategoryLabel } from "@/lib/exerciseMovementCategory";
import { liftDayLine } from "@/lib/liftDayLabel";
import { durationFigure, setsFigure, workFigure } from "@/lib/liftFigures";
import { ChevronDown, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import { setPRDescription, type SetPR, type RepBucket } from "@/lib/prTracking";
import { formatLoad } from "@/lib/liftLoad";
import { useLiftUnit } from "@/hooks/useLiftUnit";
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
  planContext?: { next: string };
  /** The saved session's feed post. The finish screen asks once, posts
   *  automatically, or offers the one-off share (`SessionShareRow`). */
  share?: SessionShareAction;
  onFinish: () => void;
  onEdit?: () => void;
  onClose: () => void;
  onViewWorkout?: () => void;
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
  onViewWorkout,
}: SessionCompleteScreenProps) {
  const liftUnit = useLiftUnit();
  const heading =
    saveStatus === "queued"
      ? "Saved on this phone"
      : saved
        ? "Workout saved"
        : "Review workout";
  // The day as Train and the workout screen name it ("Legs B"), handed
  // down by the workout screen. A routine's own name is itself.
  const dayLabel = liftDayLine(dayName);
  const reduce = useReducedMotion();

  const status = completing
    ? "Saving workout…"
    : saveStatus === "queued"
      ? "Waiting to sync"
      : saveStatus === "needs-attention"
        ? "Needs attention · your session is here to retry"
        : saved
          ? "Saved"
          : "Not saved yet";

  /* Saving swaps the review's Save for the saved screen's Done, pinned at
     the bottom (Pol1). The button that had focus goes with the review, so
     a screen reader would start again from the top: focus moves to Done,
     unless something else on the screen already holds it. */
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!saved) return;
    const active = document.activeElement;
    if (!active || active === document.body)
      doneRef.current?.focus({ preventScroll: true });
  }, [saved]);

  /* The three figures are written by `liftFigures`, the rule the saved
     session's page uses too, so the page you come back to says what the
     finish said. */
  const duration = durationFigure(sessionDurationMinutes);

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

  /* A bodyweight session's reps take the middle number (`workFigure`).
     Holds count for neither: their `reps` are seconds. */
  const totalReps = setLogs.reduce((sum, logs, exIdx) => {
    if (exercises[exIdx]?.repUnit === "seconds") return sum;
    return (
      sum +
      logs
        .filter((s) => s.completed && s.type !== "warmup")
        .reduce((t, s) => t + s.reps, 0)
    );
  }, 0);
  const work = workFigure(totalVolume, totalReps, liftUnit);

  // WORKING sets only. This was the one header stat that did not exclude
  // warm-ups, so it counted the auto-generated ramp that VOLUME and the
  // per-exercise "n/m sets" rows both correctly leave out — a session showing
  // "Cable Crunch 2/2 sets" and 240kg reported SETS 4. Three numbers, one
  // session, two different definitions of a set.
  const totalSetsCompleted = setLogs
    .flat()
    .filter((s) => s.completed && s.type !== "warmup").length;
  const sets = setsFigure(totalSetsCompleted);
  /* Finishing early comes straight here, so the review says what the
     finish leaves out, beside Edit workout, which goes back for it. */
  const unticked = setLogs
    .flat()
    .filter((s) => !s.completed && s.type !== "warmup").length;

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
  /* The card's picture is the session's main lift, drawn, as Train and
     Home picture the day: the first exercise with a drawing that got a
     working set. The muscle figure stands in when none has one. */
  const leadArt = sessionLeadArt(
    exercises.filter((_, exIdx) =>
      (setLogs[exIdx] ?? []).some((s) => s.completed && s.type !== "warmup")
    )
  );

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
      className="fixed inset-0 z-50 bg-background overflow-y-auto pt-[var(--safe-top)]"
    >
      {/* A column at least the screen's height, so the saved screen's
          Done can sit at the bottom of a short one and stay pinned there
          on a long one. The footer owns the safe area once it shows. */}
      <div
        className={cn(
          "max-w-md mx-auto px-5 pt-8 min-h-full flex flex-col space-y-6",
          !saved && "pb-[calc(2rem+var(--safe-bottom))]"
        )}
      >
        {/* Hero Section */}
        <motion.div
          className="text-center space-y-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {/* A display heading (text-h2, bold), under the figures' weight:
              at the page-title size, centred over three hero figures, it
              outshouted them. */}
          <h2 className="text-h2 font-extrabold tracking-tight text-foreground text-balance">
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
          <StatFigure size="lg" count={sets} unit={sets.unit} />
        </motion.div>

        {/* The session's best moment lands a beat after the screen, a
            little large and settling, and its trophy after it (Pol1). */}
        {bests.length > 0 && (
          <motion.section
            aria-labelledby="session-new-bests"
            className="space-y-2 origin-top"
            initial={reduce ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: 0.45,
              duration: 0.46,
              ease: [0.34, 1.56, 0.64, 1],
            }}
          >
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
                    <p className="text-lg font-extrabold font-figure tabular-nums text-achievement-strong">
                      {formatLoad(result.weight, liftUnit)} × {result.reps}
                    </p>
                    {result.bestBeforeSession && (
                      <p className="text-xs text-muted-foreground">
                        Was{" "}
                        <span className="font-mono tabular-nums">
                          {formatLoad(
                            result.bestBeforeSession.weight,
                            liftUnit
                          )}{" "}
                          × {result.bestBeforeSession.reps}
                        </span>
                      </p>
                    )}
                  </div>
                  <motion.span
                    className="shrink-0"
                    initial={
                      reduce ? false : { opacity: 0, scale: 0.4, rotate: -18 }
                    }
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{
                      delay: 0.7,
                      duration: 0.52,
                      ease: [0.34, 1.56, 0.64, 1],
                    }}
                  >
                    <Trophy
                      className="size-5 text-achievement"
                      aria-hidden="true"
                    />
                  </motion.span>
                </div>
              ))}
            </Card>
          </motion.section>
        )}

        {/* The badge this session earned sits with its new bests, on the
            first screen (Pol1). Below Done, tapping Done (the obvious
            move) would send it to Home unopened. */}
        {saved && <SessionBadge />}

        {firsts.length > 0 && (
          <Card size="compact" tone="muted" className="space-y-1">
            {firsts.map(({ key, name, result }) => (
              <p key={key} className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{name}</span>
                {" · "}
                <InlineNumerals>
                  {setPRDescription(result, liftUnit)}
                </InlineNumerals>
              </p>
            ))}
          </Card>
        )}

        {hasMuscleFigure(muscleCategories) && (
          <Card className="@container">
            {/* At larger text sizes, keep the drawing above the list so
                it cannot squeeze the muscle names or set counts out. */}
            <div className="flex items-center gap-4 @max-[16em]:flex-col @max-[16em]:items-stretch">
              {leadArt ? (
                <img
                  src={formArtCutoutUrl(leadArt.cutout)}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  decoding="async"
                  data-lead-drawing={leadArt.exerciseName}
                  className="exercise-drawing h-32 w-28 shrink-0 self-center object-contain"
                />
              ) : (
                <MiniMuscleFigure
                  categories={muscleCategories}
                  className="h-32 w-auto shrink-0 self-center"
                />
              )}
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
                      <span className="min-w-0 break-words text-foreground">
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
            </div>
          </Card>
        )}

        {/* Before saving, the decision comes before the session's detail. */}
        {!saved && (
          <div className="space-y-2">
            <p
              role="status"
              className="text-center text-sm text-muted-foreground"
            >
              {status}
            </p>
            {onEdit && unticked > 0 && (
              <p className="text-center text-sm text-muted-foreground">
                <InlineNumerals>
                  {`${unticked} ${unticked === 1 ? "set" : "sets"} you haven't ticked won't be saved.`}
                </InlineNumerals>
              </p>
            )}
            <Button
              fullWidth
              size="lg"
              aria-label={
                saveStatus === "needs-attention" ? "Retry sync" : "Save workout"
              }
              onClick={onFinish}
              loading={completing}
            >
              {saveStatus === "needs-attention" ? "Retry sync" : "Save workout"}
            </Button>
            {onEdit && (
              <Button
                fullWidth
                variant="secondary"
                onClick={onEdit}
                disabled={completing}
              >
                Edit workout
              </Button>
            )}
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
          </div>
        )}
        {/* Only what comes next: the week's count is the card under it. */}
        {saved && planContext && (
          <p className="text-sm text-muted-foreground">
            <InlineNumerals>{planContext.next}</InlineNumerals>
          </p>
        )}
        {saved && <WeekPulseCard />}
        {saved && <CompletionExtras share={share} badge={false} />}
        <details className="group space-y-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg py-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
            Session details
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
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
                        ? `${formatLoad(ex.bestWeight, liftUnit)} × ${ex.bestReps}${ex.repUnit === "seconds" ? " s" : ""}`
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

        {/* Saved, Done comes last and stays in thumb reach (Pol1): at the
            bottom of a short screen, pinned to the bottom of a long one,
            with the save's state under it. */}
        {saved && (
          <div className="sticky bottom-0 z-10 -mx-5 mt-auto border-t border-border/50 bg-background px-5 pt-3 pb-[calc(1rem+var(--safe-bottom))]">
            {onViewWorkout && (
              <Button
                fullWidth
                variant="secondary"
                className="mb-2"
                onClick={onViewWorkout}
              >
                View workout
              </Button>
            )}
            <Button
              ref={doneRef}
              fullWidth
              size="lg"
              aria-label="Done"
              onClick={onClose}
            >
              Done
            </Button>
            <p
              role="status"
              className="mt-2 text-center text-sm text-muted-foreground"
            >
              {status}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
