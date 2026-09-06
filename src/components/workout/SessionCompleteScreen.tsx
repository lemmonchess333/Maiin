import WeekPulseCard from "@/components/WeekPulseCard";
import InlineNumerals from "@/components/ui/InlineNumerals";
import CompletionExtras from "@/components/workout/CompletionExtras";
import SectionLabel from "@/components/ui/SectionLabel";
import { THEME } from "@/lib/theme";
import { Clock, Dumbbell, Target } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";
import { setPRDescription, type SetPR, type RepBucket } from "@/lib/prTracking";
import type { ProgramExercise } from "@/features/program/programTypes";

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
  sessionVariant?: "express45" | "express30" | "easier_today";
  completing: boolean;
  saved?: boolean;
  planContext?: { progress: string; next: string };
  onShare?: () => Promise<void>;
  onFinish: () => void;
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
  planContext,
  onShare,
  onFinish,
  onClose,
}: SessionCompleteScreenProps) {
  const durationDisplay =
    sessionDurationMinutes >= 60
      ? `${Math.floor(sessionDurationMinutes / 60)}h ${sessionDurationMinutes % 60}m`
      : `${sessionDurationMinutes}m`;

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

  const totalVolumeDisplay = Math.round(totalVolume).toLocaleString("en-GB");

  // WORKING sets only. This was the one header stat that did not exclude
  // warm-ups, so it counted the auto-generated ramp that VOLUME and the
  // per-exercise "n/m sets" rows both correctly leave out — a session showing
  // "Cable Crunch 2/2 sets" and 240kg reported SETS 4. Three numbers, one
  // session, two different definitions of a set.
  const totalSetsCompleted = setLogs
    .flat()
    .filter((s) => s.completed && s.type !== "warmup").length;

  const exerciseSummary = exercises
    .map((ex, exIdx) => {
      const logs = setLogs[exIdx].filter((s) => s.completed);
      const workingSets = logs.filter((s) => s.type !== "warmup");
      const bestSet =
        workingSets.length > 0
          ? workingSets.reduce(
              (best, s) =>
                s.weight * s.reps > best.weight * best.reps ? s : best,
              workingSets[0]
            )
          : null;
      return {
        name: ex.name,
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
          className="text-center space-y-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-2xl font-bold text-foreground">
            {dayName} · done
          </h2>
          {sessionVariant === "easier_today" ? (
            <p className="text-xs text-muted-foreground">
              Easier session. Your regular plan stays in place.
            </p>
          ) : sessionVariant ? (
            <p className="text-xs text-muted-foreground">
              Express {sessionVariant === "express45" ? "45" : "30"} — the
              essentials, done.
            </p>
          ) : null}
        </motion.div>

        <div className="space-y-2">
          <p
            role="status"
            className="text-center text-sm text-muted-foreground"
          >
            {saved ? "Saved" : completing ? "Saving workout…" : "Not saved yet"}
          </p>
          <Button
            fullWidth
            aria-label={saved ? "Done" : "Save Workout"}
            onClick={saved ? onClose : onFinish}
            loading={completing}
          >
            {saved ? "Done" : "Save Workout"}
          </Button>
          {!saved && (
            <Button
              fullWidth
              variant="ghost"
              onClick={onClose}
              disabled={completing}
            >
              Close without saving
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
        {saved && <CompletionExtras onShare={onShare} />}
        {prResults && prResults.size > 0 && (
          <div className="ds-card p-4 space-y-2">
            {[...prResults.entries()].map(([key, result]) => (
              <p key={key} className="text-sm text-muted-foreground">
                {key.slice(0, key.lastIndexOf(":"))} —{" "}
                <InlineNumerals>{setPRDescription(result)}</InlineNumerals>
              </p>
            ))}
          </div>
        )}
        <details className="space-y-4">
          <summary className="min-h-11 py-3 cursor-pointer text-sm font-semibold text-foreground">
            Session details
          </summary>
          {/* Stat Cards Row */}
          <motion.div
            className="grid grid-cols-3 gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="p-4 rounded-2xl bg-card text-center space-y-1">
              <Clock
                className="size-4 mx-auto"
                style={{ color: "hsl(var(--muted-foreground))" }}
              />
              <p className="text-lg font-bold font-mono tabular-nums text-foreground">
                {durationDisplay}
              </p>
              <SectionLabel>Duration</SectionLabel>
            </div>
            <div className="p-4 rounded-2xl bg-card text-center space-y-1">
              <Dumbbell className="size-4 mx-auto text-lifting" />
              <p className="text-lg font-bold font-mono tabular-nums text-foreground">
                {totalVolumeDisplay}
                <span
                  className="ml-1 text-xs font-normal font-sans"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  kg
                </span>
              </p>
              <SectionLabel>Volume</SectionLabel>
            </div>
            <div className="p-4 rounded-2xl bg-card text-center space-y-1">
              <Target
                className="size-4 mx-auto"
                style={{ color: THEME.semantic.positive }}
              />
              <p className="text-lg font-bold font-mono tabular-nums text-foreground">
                {totalSetsCompleted}
              </p>
              <SectionLabel>Sets</SectionLabel>
            </div>
          </motion.div>

          {/* Exercise Breakdown */}
          <motion.div
            className="rounded-2xl bg-card overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="px-4 pt-4 pb-2">
              <SectionLabel tier="section">Exercises</SectionLabel>
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
                        ? `${ex.bestWeight} kg × ${ex.bestReps}`
                        : `${ex.bestReps} reps`}
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
