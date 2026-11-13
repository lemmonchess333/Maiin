import { Suspense, useEffect, useRef, useState } from "react";
import StartTimeSheet from "@/components/workout/StartTimeSheet";
import RenameWorkoutSheet from "@/components/workout/RenameWorkoutSheet";
import { startLabel } from "@/features/program/sessionStart";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import WeekPulseCard from "@/components/WeekPulseCard";
import InlineNumerals from "@/components/ui/InlineNumerals";
import CompletionExtras from "@/components/workout/CompletionExtras";
import RecoveryFoodButton from "@/components/workout/RecoveryFoodButton";
import OptionalSummaryBoundary from "@/components/OptionalSummaryBoundary";
import SessionBadge from "@/components/workout/SessionBadge";
import SectionHeading from "@/components/ui/SectionHeading";
import { Card } from "@/components/ui/Card";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import { formArtCutoutUrl, sessionLeadArt } from "@/lib/formArtCutouts";
import MiniMuscleFigure, {
  hasMuscleFigure,
} from "@/components/social/MiniMuscleFigure";
import { CATEGORY_DISPLAY } from "@/components/analytics/muscleGroupTaxonomy";
import { movementCategoryLabel } from "@/lib/exerciseMovementCategory";
import { liftDayLine } from "@/lib/liftDayLabel";
import { liftSessionDay } from "@/lib/liftCompletion";
import { sessionWork, setsFigure, workFigure } from "@/lib/liftFigures";
import { ChevronDown, ChevronRight, Share, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import { setPRDescription, type SetPR, type RepBucket } from "@/lib/prTracking";
import { formatKitLoad, kitLoadIn } from "@/features/program/loadSteps";
import { getFormArtCutout } from "@/lib/formArtCutouts";
import FinishHero from "@/components/workout/FinishHero";
import {
  finishKicker,
  finishRegister,
  rewardLine,
  summaryLine,
} from "@/lib/finishMoment";
import type { PostMoment } from "@/lib/postMoments";
import { liftUnitLabel } from "@/lib/liftLoad";
import { formatDuration } from "@/utils/formatters";
import { useAuth } from "@/lib/auth";
import { lazyRetry } from "@/lib/lazyRetry";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import type { ProgramExercise } from "@/features/program/programTypes";
import type { SessionShareAction } from "@/lib/sessionPost";

/* The share card's sheet loads when Share is tapped, never with the
   screen. */
const ShareCardSheet = lazyRetry(
  () => import("@/components/share/ShareCardSheet")
);
/* What the run's finish has and the lift's lacked (App1 Q30): the props
   prompt, once the session is saved, and the Circle share, whose sheet
   (and its Circle reads) loads only when it is opened. */
const SavedSessionKudos = lazyRetry(
  () => import("@/components/social/SavedSessionKudos"),
  { reloadOnChunkError: false }
);
const CircleShareSheet = lazyRetry(
  () => import("@/components/social/CircleShareSheet")
);

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
  /** Opens the food log for a recovery meal, once saved (App1 Q30). The
   *  page hosting the session says how it leaves, as for the workout. */
  onLogFood?: () => void;
  /** When the session started, in ms (Lift3 dates the workout by it). */
  startedAt?: number;
  /** Says it started earlier, for a lift recorded late (Mob2 call 12).
   *  Absent once the save is under way. */
  onChangeStart?: (startedAt: number) => void;
  /** A programme day: its start stays in the plan's week, and, as a
   *  planned session, it can be shared to a Circle once saved
   *  (CIRCLE-SESSION-01, as a planned run can). */
  planWeek?: boolean;
  /** When the account began, in ms: no start is said to be earlier. */
  accountStart?: number | null;
  /** Names an empty workout (Mob2 call 11). Absent for every other
   *  session, and once the save is under way. */
  onRename?: (name: string) => void;
  /** What the saved session's post says happened (`liftPostMoments`): a
   *  first, a new best, a streak milestone or a finished plan makes the
   *  saved screen the full-screen reward (DS4 call 3). Null until saved. */
  moments?: readonly PostMoment[] | null;
  /** The account's first workout though it has run before
   *  (`isFirstOfSport`): rewarded as a first. */
  firstOfSport?: boolean;
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
  onLogFood,
  startedAt,
  onChangeStart,
  planWeek = false,
  accountStart = null,
  onRename,
  moments = null,
  firstOfSport = false,
}: SessionCompleteScreenProps) {
  const today = useLocalDateKey();
  /* The detail being changed: when it started, or its name. */
  const [changing, setChanging] = useState<"start" | "name" | null>(null);
  const liftUnit = useLiftUnit();
  const { user, profile } = useAuth();
  const [shareOpen, setShareOpen] = useState(false);
  const [circleShareOpen, setCircleShareOpen] = useState(false);
  // The day as Train and the workout screen name it ("Legs B"), handed
  // down by the workout screen. A routine's own name is itself.
  const dayLabel = liftDayLine(dayName);
  /* Saved, the screen is the session done ("Pull A done"): a save's
     confirmation never heads it (CODING_STANDARDS' words rules); the
     save's state is the line under Done. */
  const heading = saved ? `${dayLabel} done` : "Review workout";
  const reduce = useReducedMotion();
  /* When the screen opened: the end of the kicker's time range. */
  const [openedAt] = useState(() => Date.now());

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
  const durationWords = formatDuration(sessionDurationMinutes * 60);

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
     put 1,200 kg between them.

     A bodyweight session's reps take the middle number (`workFigure`).
     Holds count for neither. The live workout's header adds up the same
     sets through the same `sessionWork`, so the figure it grew is this
     one. */
  const { volumeKg: totalVolume, reps: totalReps } = sessionWork(
    setLogs,
    exercises
  );
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
              // Holds compare duration even when their loads differ.
              // Unweighted rep sets compare reps; loaded rep sets use work.
              const improves =
                ex.repUnit === "seconds" ||
                (s.weight === 0 && best.weight === 0)
                  ? s.reps > best.reps
                  : s.weight * s.reps > best.weight * best.reps;
              return improves ? s : best;
            }, workingSets[0])
          : null;
      return {
        name: ex.name,
        exerciseId: ex.exerciseId,
        repUnit: ex.repUnit,
        setsCompleted: workingSets.length,
        totalSets: ex.sets,
        bestWeight: bestSet?.weight || 0,
        bestReps: bestSet?.reps || 0,
      };
    })
    .filter((e) => e.setsCompleted > 0);

  /* DS4 call 3: a first, a new best, a streak milestone or a finished
     plan makes the saved screen the reward; anything else, and the review
     before the save, is the calm summary (`finishRegister`). */
  const register = saved
    ? finishRegister(moments, "lift", { firstOfSport })
    : ({ register: "summary" } as const);
  const reward = register.register === "reward" ? register : null;
  const rewardPr = reward?.moment.kind === "pr" ? reward.moment : null;
  const rewardPrRow = rewardPr
    ? prRows.find(
        ({ name, result }) =>
          name === rewardPr.exercise &&
          result.kind === "best" &&
          result.weight === rewardPr.weightKg &&
          result.reps === rewardPr.reps
      )
    : undefined;
  const rewardExerciseId = rewardPrRow?.exerciseId;
  const bestBefore = rewardPrRow?.result.bestBeforeSession;
  const line = reward
    ? rewardLine(reward.moment, {
        sport: "lift",
        distanceUnit: "km",
        loadIn: (kg) => kitLoadIn(kg, liftUnit, rewardExerciseId),
        loadUnit: liftUnitLabel(liftUnit),
        prBefore: bestBefore
          ? { weightKg: bestBefore.weight, reps: bestBefore.reps }
          : null,
      })
    : null;
  /* The routine session's one line: a plan's week done, else what comes
     next. Either way it is said once on the screen. */
  const quietLine = saved
    ? (summaryLine(moments) ?? planContext?.next ?? null)
    : null;
  /* The first screen's line: a reward's, else the routine one. What comes
     next is said below whenever this line did not say it, so a new best
     or a first never takes it off the screen. */
  const heroLine = line ?? quietLine;
  const variantNote =
    sessionVariant === "easier_today"
      ? "Easier session. Your regular plan stays in place."
      : sessionVariant === "time_budget"
        ? "Session prepared for your usual time. Your full programme stays in place."
        : sessionVariant
          ? `Express ${sessionVariant === "express45" ? "45" : "30"}: the essentials, done.`
          : null;

  /* The object: a new best's own lift when it is drawn, else the day's
     main lift (`sessionLeadArt`), else the muscles it worked. */
  const prCutout =
    rewardPr && rewardExerciseId ? getFormArtCutout(rewardExerciseId) : null;
  const object =
    prCutout && rewardPr
      ? { cutout: prCutout, exerciseName: rewardPr.exercise }
      : leadArt;
  const picture = object ? (
    <img
      src={formArtCutoutUrl(object.cutout)}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      data-lead-drawing={object.exerciseName}
      className="exercise-drawing h-full max-h-80 w-[min(70%,17rem)] object-contain"
    />
  ) : hasMuscleFigure(muscleCategories) ? (
    <MiniMuscleFigure
      categories={muscleCategories}
      className="h-[85%] max-h-72 w-auto"
    />
  ) : null;

  /* Its end is its start and the time it took, as the caption counts it;
     without a start, the day the screen opened. */
  const endedAt =
    startedAt !== undefined
      ? startedAt + Math.round(sessionDurationMinutes * 60_000)
      : openedAt;
  const kicker = saved
    ? finishKicker(startedAt, endedAt)
    : `${dayLabel} · ${finishKicker(startedAt, endedAt)}`;

  return (
    <motion.div
      /* No fade under Reduce Motion: the screen is there at once, as every
         entrance inside it already is. */
      initial={reduce ? false : { opacity: 0 }}
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
          "max-w-md mx-auto px-5 min-h-full flex flex-col",
          !saved && "pb-[calc(2rem+var(--safe-bottom))]"
        )}
      >
        {/* The first screen (DS4, §14m rule 30): the kicker, the object,
            the session done, one figure and one line, then Share and Done
            pinned under them. Saved, it fills the screen above the footer
            (5.75rem) less 4.5rem, so the next section's heading and the top
            of its card peek above Share and Done as the cue that there is
            more (owner, 7 November 2026: no empty band, no seventh block).
            The object's area takes the height the rest leaves. */}
        <div
          className={cn(
            "flex flex-col pt-6",
            saved &&
              "min-h-[calc(100svh-var(--safe-top)-var(--safe-bottom)-10.25rem)]"
          )}
        >
          <FinishHero
            fill={saved}
            kicker={kicker}
            tone={reward?.tone ?? null}
            confetti={reward?.confetti ?? false}
            picture={picture}
            title={heading}
            figure={{ to: work.to, format: work.format }}
            caption={`${work.unit} in ${durationWords}`}
            line={heroLine ?? (saved ? null : variantNote)}
            lineIcon={
              reward?.tone === "achievement"
                ? "trophy"
                : reward?.moment.kind === "streak"
                  ? "flame"
                  : null
            }
          />
        </div>

        <div className="space-y-6 pt-6 pb-6">
          {/* Before saving, the decision comes before the session's
              detail. First what the save says about the session that can
              still be changed: when it started, and an empty workout's
              name. */}
          {!saved && (onChangeStart || onRename) && (
            <Card padded={false} className="divide-y divide-border">
              {onRename && (
                <DetailRow
                  label="Name"
                  value={dayLabel}
                  action="Rename"
                  disabled={completing}
                  onClick={() => setChanging("name")}
                />
              )}
              {onChangeStart && startedAt !== undefined && (
                <DetailRow
                  label="Started"
                  value={startLabel(startedAt, today)}
                  action="Change"
                  numeric
                  disabled={completing}
                  onClick={() => setChanging("start")}
                />
              )}
            </Card>
          )}
          {changing === "start" && onChangeStart && startedAt !== undefined && (
            <StartTimeSheet
              startedAt={startedAt}
              accountStart={accountStart}
              planWeek={planWeek}
              onSave={(at) => {
                onChangeStart(at);
                setChanging(null);
              }}
              onClose={() => setChanging(null)}
            />
          )}
          {changing === "name" && onRename && (
            <RenameWorkoutSheet
              name={dayName}
              onSave={(name) => {
                onRename(name);
                setChanging(null);
              }}
              onClose={() => setChanging(null)}
            />
          )}
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
                    {`${unticked} ${unticked === 1 ? "set" : "sets"} you haven’t ticked won’t be saved.`}
                  </InlineNumerals>
                </p>
              )}
              <Button
                fullWidth
                variant="neutral"
                aria-label={
                  saveStatus === "needs-attention"
                    ? "Retry sync"
                    : "Save workout"
                }
                onClick={onFinish}
                loading={completing}
              >
                {saveStatus === "needs-attention"
                  ? "Retry sync"
                  : "Save workout"}
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

          {/* Below the first screen: the session's new bests in full, the
              badge it earned, what comes next, the week, sharing, and the
              muscles it worked. The bests land a beat after the screen, a
              little large and settling, and their trophy after them
              (Pol1). */}
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
                        {formatKitLoad(result.weight, liftUnit, exerciseId)} ×{" "}
                        {result.reps}
                      </p>
                      {result.bestBeforeSession && (
                        <p className="text-xs text-muted-foreground">
                          Was{" "}
                          <span className="font-mono tabular-nums">
                            {formatKitLoad(
                              result.bestBeforeSession.weight,
                              liftUnit,
                              exerciseId
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

          {/* The badge this session earned sits with its new bests, the
              first thing under the first screen (Pol1, DS4). */}
          {saved && <SessionBadge />}

          {firsts.length > 0 && (
            <Card size="compact" tone="muted" className="space-y-1">
              {firsts.map(({ key, name, exerciseId, result }) => (
                <p key={key} className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{name}</span>
                  {" · "}
                  <InlineNumerals>
                    {setPRDescription(result, liftUnit, exerciseId)}
                  </InlineNumerals>
                </p>
              ))}
            </Card>
          )}

          {/* What comes next, when the first screen's line said something
              else; and a shorter session's note, said once. */}
          {saved && planContext && heroLine !== planContext.next && (
            <p className="text-sm text-muted-foreground">
              <InlineNumerals>{planContext.next}</InlineNumerals>
            </p>
          )}
          {saved && variantNote && (
            <p className="text-sm text-muted-foreground">{variantNote}</p>
          )}
          {/* The week the lift counts for: the day it started, which a
              session begun on Sunday night keeps past midnight. */}
          {saved && <WeekPulseCard sessionDay={liftSessionDay(startedAt)} />}
          {saved && (
            <CompletionExtras share={share} badge={false} kind="lift" />
          )}
          {/* Someone the lifter follows trained today too: give them
              props, as the run's finish offers (App1 Q30). Mounted once the
              session is saved; nothing shows otherwise. */}
          {saved && (
            <OptionalSummaryBoundary>
              <Suspense fallback={null}>
                <SavedSessionKudos
                  uid={user?.uid}
                  fromName={profile?.displayName}
                />
              </Suspense>
            </OptionalSummaryBoundary>
          )}

          {hasMuscleFigure(muscleCategories) && (
            <Card className="@container">
              {/* The session's drawing is the first screen's, so the
                  muscles figure stands here, unless it already stands up
                  there. At larger text sizes it goes above the list, so it
                  cannot squeeze the names or set counts out. */}
              <div className="flex items-center gap-4 @max-[16em]:flex-col @max-[16em]:items-stretch">
                {object && (
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
                    {muscleRows.slice(0, 4).map(([category, count]) => (
                      <li
                        key={category}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 break-words text-foreground">
                          {CATEGORY_DISPLAY[category] ??
                            movementCategoryLabel(category)}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                          {count} {count === 1 ? "set" : "sets"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          <details className="group space-y-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg py-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
              Session details
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            {/* Exercise Breakdown. No entrance: it sits in a closed
                <details>, so its rows played their stagger unseen. */}
            <div className="rounded-2xl bg-card overflow-hidden">
              <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-2">
                <SectionHeading size="compact">Exercises</SectionHeading>
                {/* Working sets only, as every set count here. */}
                <span
                  data-session-sets
                  className="text-sm font-mono tabular-nums text-muted-foreground"
                >
                  {sets.format(sets.to)} {sets.unit}
                </span>
              </div>
              <div className="divide-y divide-border/30">
                {exerciseSummary.map((ex) => (
                  <div
                    key={ex.name}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">
                        {ex.name}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-mono tabular-nums font-semibold text-lifting-strong">
                        {ex.bestWeight > 0
                          ? `${formatKitLoad(ex.bestWeight, liftUnit, ex.exerciseId)} × ${ex.bestReps}${ex.repUnit === "seconds" ? " s" : ""}`
                          : `${ex.bestReps} ${ex.repUnit === "seconds" ? "s" : "reps"}`}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "hsl(var(--muted-foreground))" }}
                      >
                        {ex.setsCompleted}/{ex.totalSets} sets
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </details>
          {/* The saved workout, where it can be changed or deleted, and the
              food log for a recovery meal, as after a run (App1 Q30). */}
          {saved && (onViewWorkout || onLogFood) && (
            <div className="space-y-2">
              {onViewWorkout && (
                <Button fullWidth variant="secondary" onClick={onViewWorkout}>
                  View workout
                </Button>
              )}
              {onLogFood && <RecoveryFoodButton onClick={onLogFood} />}
            </div>
          )}
        </div>

        {/* Saved, Share and Done come last and stay in thumb reach (Pol1):
            at the bottom of a short screen, pinned to the bottom of a long
            one, with the save's state under them. Done is the screen's one
            filled button, neutral (DS4 call 1a); Share is its outline, and
            opens the session's card. */}
        {saved && (
          <div className="sticky bottom-0 z-10 -mx-5 mt-auto bg-background px-5 pt-3 pb-[calc(0.5rem+var(--safe-bottom))]">
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShareOpen(true)}
                leftIcon={<Share className="size-4" aria-hidden="true" />}
              >
                Share
              </Button>
              <Button
                ref={doneRef}
                variant="neutral"
                className="flex-[1.4]"
                aria-label="Done"
                onClick={onClose}
              >
                Done
              </Button>
            </div>
            <p
              role="status"
              className="mt-2 text-center text-sm text-muted-foreground"
            >
              {status}
            </p>
          </div>
        )}
      </div>
      {shareOpen && (
        <Suspense fallback={null}>
          <ShareCardSheet
            open
            onOpenChange={setShareOpen}
            data={{
              template: "lift",
              handle: profile?.displayName || "Athlete",
              // The session's day, as the kicker and the saved workout
              // date it: by its start.
              date: finishKicker(undefined, startedAt ?? openedAt),
              totalVolumeKg: totalVolume,
              totalReps,
              exerciseCount: exerciseSummary.length,
              prCount: bests.length,
              prExercise: bests[0]?.name,
              durationSec: Math.round(sessionDurationMinutes * 60),
              headline: heading,
              line: line
                ? `${line.before}${line.figure}${line.after}`
                : undefined,
              tone: reward?.tone,
              artSrc: object ? formArtCutoutUrl(object.cutout) : undefined,
            }}
            /* CIRCLE-SESSION-01, as on the run's finish: a planned
               session, saved, can tell a Circle it was done. Only
               "completed a session" is shared, never a number. */
            extras={
              saved && planWeek && user ? (
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setShareOpen(false);
                    setCircleShareOpen(true);
                  }}
                >
                  Share to circle
                </Button>
              ) : undefined
            }
          />
        </Suspense>
      )}
      {saved && user && circleShareOpen && (
        <Suspense fallback={null}>
          <CircleShareSheet
            open
            onOpenChange={setCircleShareOpen}
            uid={user.uid}
          />
        </Suspense>
      )}
    </motion.div>
  );
}

/** A row of the review's details: what it is over its value, and the
 *  way to change it, which goes under them rather than squeezing them
 *  when the two no longer fit (larger text). */
function DetailRow({
  label,
  value,
  action,
  numeric = false,
  disabled,
  onClick,
}: {
  label: string;
  value: string;
  action: string;
  numeric?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label}: ${value}. ${action}`}
      className="flex min-h-[44px] w-full flex-wrap items-center gap-x-3 gap-y-1 px-[16px] py-[10px] text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-60"
    >
      <span className="block min-w-[min(100%,10em)] flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span
          className={cn(
            "block break-words text-sm font-medium text-foreground",
            numeric && "font-mono tabular-nums"
          )}
        >
          {value}
        </span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1 text-sm font-semibold text-lifting-strong">
        {action}
        <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
      </span>
    </button>
  );
}
