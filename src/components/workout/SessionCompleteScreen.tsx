import { useMemo } from "react";
import { THEME } from "@/lib/theme";
import { Trophy, Clock, Dumbbell, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { repBucketLabel, type RepBucket } from "@/lib/prTracking";
import { getVolumeComparison } from "@/lib/funComparisons";
import { usePostCompletionKudos } from "@/hooks/usePostCompletionKudos";
import PostCompletionKudos from "@/components/social/PostCompletionKudos";
import WeekPulseCard from "@/components/WeekPulseCard";
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
  sessionDurationMinutes: number;
  /** PROGRAM-FLEX-01 / PROGRAM-ADAPT-01: acknowledge a reduced
   *  session positively but without pretending it was the full plan. */
  sessionVariant?: "express45" | "express30" | "easier_today";
  completing: boolean;
  onFinish: () => void;
  onClose: () => void;
}

/**
 * NOTE ON SHARING (2026-08-04). This screen used to carry two share
 * controls — "Share Workout" (image card) and "Share to Circle" — and both
 * fired BEFORE the save, because "Save Workout" is a separate button. So
 * "Share to Circle" → "Close without saving" published a `session_completed`
 * event for a session with no record behind it.
 *
 * Both moved to `/workout/:id`, where the record already exists and the
 * phantom post is structurally impossible. That also ended sharing's
 * one-shot lifetime: this screen unmounts on save, so anything anchored to
 * it could only ever be done in that one moment.
 *
 * Keep this screen to Save and Close. A new share affordance here would
 * re-create both problems.
 */
export default function SessionCompleteScreen({
  dayName,
  exercises,
  setLogs,
  firedPRs,
  sessionDurationMinutes,
  sessionVariant,
  completing,
  onFinish,
  onClose,
}: SessionCompleteScreenProps) {
  const { profile } = useAuth();
  const kudos = usePostCompletionKudos({
    uid: profile?.uid,
    fromName: profile?.displayName,
  });

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

  const totalVolumeDisplay =
    totalVolume >= 1000
      ? `${(totalVolume / 1000).toFixed(1)}k`
      : `${Math.round(totalVolume)}`;

  // WORKING sets only. This was the one header stat that did not exclude
  // warm-ups, so it counted the auto-generated ramp that VOLUME and the
  // per-exercise "n/m sets" rows both correctly leave out — a session showing
  // "Cable Crunch 2/2 sets" and 240kg reported SETS 4. Three numbers, one
  // session, two different definitions of a set.
  const totalSetsCompleted = setLogs
    .flat()
    .filter((s) => s.completed && s.type !== "warmup").length;

  const prDetails = Array.from(firedPRs.entries()).flatMap(([name, buckets]) =>
    buckets.map((bucket) => ({ name, label: repBucketLabel(bucket) }))
  );
  const prCount = prDetails.length;

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
        isPR: firedPRs.has(ex.name),
        prLabels: (firedPRs.get(ex.name) || []).map((b) => repBucketLabel(b)),
      };
    })
    .filter((e) => e.setsCompleted > 0);

  /* Memoised for the same reason as the run twin in RunSummary:
     `getVolumeComparison` picks at random among the eligible lines, so
     recomputing in the render body reshuffles the text on any
     re-render. */
  const funComparison = useMemo(
    () => getVolumeComparison(totalVolume),
    [totalVolume]
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
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
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 12,
              delay: 0.2,
            }}
          >
            <Trophy className="size-14 text-yellow-500 mx-auto" />
          </motion.div>
          <h2 className="text-2xl font-bold text-foreground">
            Workout Complete
          </h2>
          <p className="text-sm text-muted-foreground">{dayName}</p>
          {sessionVariant === "easier_today" ? (
            <p className="text-xs text-muted-foreground">
              Easier today — you showed up and kept it honest. The plan stays
              exactly on track.
            </p>
          ) : sessionVariant ? (
            <p className="text-xs text-muted-foreground">
              Express {sessionVariant === "express45" ? "45" : "30"} — the
              essentials, done. Better than a skipped session.
            </p>
          ) : null}
        </motion.div>

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
            <p
              className="text-xs uppercase tracking-wider"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Duration
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-card text-center space-y-1">
            <Dumbbell className="size-4 mx-auto text-lifting" />
            <p className="text-lg font-bold font-mono tabular-nums text-foreground">
              {totalVolumeDisplay}
              <span
                className="text-xs font-normal"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                kg
              </span>
            </p>
            <p
              className="text-xs uppercase tracking-wider"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Volume
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-card text-center space-y-1">
            <Target
              className="size-4 mx-auto"
              style={{ color: THEME.semantic.positive }}
            />
            <p className="text-lg font-bold font-mono tabular-nums text-foreground">
              {totalSetsCompleted}
            </p>
            <p
              className="text-xs uppercase tracking-wider"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Sets
            </p>
          </div>
        </motion.div>

        {/* PR Banner */}
        {prCount > 0 && (
          <motion.div
            className="p-4 rounded-2xl text-center space-y-2"
            style={{
              background: `linear-gradient(135deg, ${THEME.brand}15 0%, ${THEME.semantic.positive}10 100%)`,
              border: `1px solid ${THEME.brand}30`,
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
          >
            <div className="flex items-center justify-center gap-2">
              <Zap className="size-5" style={{ color: THEME.brand }} />
              <p className="text-sm font-bold text-foreground">
                {prCount} Personal Record{prCount > 1 ? "s" : ""}!
              </p>
            </div>
            <div className="space-y-0.5">
              {prDetails.map((pr) => (
                <p
                  key={`${pr.name}-${pr.label}`}
                  className="text-xs text-muted-foreground"
                >
                  {pr.name} — {pr.label}
                </p>
              ))}
            </div>
          </motion.div>
        )}

        {/* Fun Comparison */}
        {funComparison && (
          <motion.p
            className="text-center text-xs font-medium"
            style={{ color: "hsl(var(--muted-foreground))" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {funComparison}
          </motion.p>
        )}

        {/* Exercise Breakdown */}
        <motion.div
          className="rounded-2xl bg-card overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="px-4 pt-4 pb-2">
            <p
              className="text-sm font-semibold uppercase tracking-wider"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Exercises
            </p>
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
                  {ex.isPR && (
                    <>
                      <Zap
                        className="size-3.5 shrink-0"
                        style={{ color: THEME.brand }}
                        fill={THEME.brand}
                      />
                      {ex.prLabels.map((label) => (
                        <span
                          key={label}
                          className="text-xs font-medium"
                          style={{ color: THEME.brand }}
                        >
                          {label}
                        </span>
                      ))}
                    </>
                  )}
                  <p className="text-sm text-foreground truncate">{ex.name}</p>
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

        {/* Post-completion kudos (Phase 2) — social AFTER achievement, never
            before action. Renders nothing unless someone the user follows
            also trained today; once/day; fully dismissible. */}
        {/* Rev1 PR2 — what this session did to your week. Renders null
            until its one fetch resolves; no jank on the celebration. */}
        {/* This screen renders BEFORE its own save is dispatched (the
            "Save Workout" button below does it) and unmounts the moment the
            save resolves — so the just-finished session has to be counted
            explicitly or the user reads "0 of 6 lifts" right after doing one. */}
        <WeekPulseCard pendingLifts={1} />

        <PostCompletionKudos
          candidate={kudos.candidate}
          sending={kudos.sending}
          sent={kudos.sent}
          onSend={kudos.sendKudos}
          onDismiss={kudos.dismiss}
        />

        {/* Action Buttons */}
        <motion.div
          className="space-y-3 pt-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Button fullWidth onClick={onFinish} disabled={completing}>
            {completing ? "Saving..." : "Save Workout"}
          </Button>

          <button
            type="button"
            onClick={onClose}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Close without saving
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
