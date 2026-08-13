import { useState } from "react";
import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import {
  Dumbbell,
  ClipboardList,
  Footprints,
  X,
  Check,
  Settings2,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import { resolveTrainingDayForDate } from "@/lib/trainingResolver";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  getCompletionKind,
  type ClaimState,
} from "@/lib/scheduledRunCompletion";
import type { SavedRunDoc } from "@/hooks/useClaimMap";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/IconButton";
import ExtrasExpandSheet from "@/components/program/ExtrasExpandSheet";
import { workoutTitle } from "@/hooks/useWorkouts";
import { distanceIn, distanceUnitLabel } from "@/lib/distanceUnits";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";

/** Q5 P71 cap — DayPeekCard mirrors RunWeekStrip; up to 2 extras
 *  shown inline before an overflow "+N more" tap-through. */
const EXTRAS_VISIBLE_CAP = 2;

/**
 * The lift summary row — a button when it has somewhere to go, a plain row
 * when it doesn't.
 *
 * Both shapes are needed. A day can show this row for a PLANNED lift with
 * nothing saved yet (there's no record to open), and for several saved
 * sessions collapsed into one line (no single honest destination). Rendering
 * a button in those cases would be an affordance that does nothing, which is
 * worse than no affordance — so the element type follows the destination
 * rather than the row always being pressable.
 */
function LiftRowShell({
  workoutId,
  label,
  children,
}: {
  workoutId: string | null;
  label?: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  if (!workoutId) {
    return <div className="flex items-center gap-1.5">{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        // The whole card is itself a tap target (expand/collapse) — without
        // this the row's navigation and the card's toggle both fire.
        e.stopPropagation();
        navigate(`/workout/${workoutId}`);
      }}
      aria-label={`Open ${label ?? "workout"} details`}
      className="flex items-center gap-1.5 w-full text-left rounded-md -mx-1 px-1 py-0.5 active:scale-[0.98] transition-transform"
    >
      {children}
    </button>
  );
}

export default function DayPeekCard({
  dateKey,
  profile,
  programState,
  claimMap,
  extras,
  workouts,
  dailyTotals,
  onClose,
  onManage,
}: {
  dateKey: string;
  /** P1-4 / PR-0c: profile + programState replace the previous
   *  `schedule` + `runDays` props. The peek calls the shared
   *  training resolver which enforces date/weekKey-aware runDay
   *  matching — so tapping next Monday on the strip can no longer
   *  inherit this Monday's runDay status (the old
   *  `runDays.find(r => r.dayIndex === dow)` bug). */
  profile: UserProfile | null;
  programState: ProgramState | null;
  /** PR-J Q3 chunk B3c — derived completion source of truth.
   *  Forwarded to the resolver so the "Run completed" copy and
   *  Check icon track manual / saved-run-claim / legacy
   *  completions uniformly. Wired via `useClaimMap` in Home. */
  claimMap: Map<string, ClaimState>;
  /** PR-J Q5 chunk B3g — unclaimed saved runs for this date.
   *  Rendered as tap-through rows so a logged extra run shows on
   *  the Home day peek alongside the planned slot. Wired via
   *  `useClaimMap().unclaimedByDate.get(dateKey)` in Home. */
  extras: SavedRunDoc[];
  workouts: {
    /** Firestore doc id — the /workout/:id destination for the lift row.
     *  Optional because callers historically passed a projection; a row
     *  without one simply isn't tappable. */
    id?: string;
    /** Session identity, used to label a day's rows when it holds more than
     *  one saved workout. Titled through the shared `workoutTitle`. */
    notes?: string;
    exercises?: { sets?: { weightKg?: number; reps?: number }[] }[];
    durationMinutes?: number;
  }[];
  dailyTotals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    mealCount: number;
  };
  onClose: () => void;
  /** PR-1: opens DayActionSheet for this date. Only rendered as a
   *  secondary CTA when there's actionable training for the day
   *  (matched lift or runDay). Home remains glance-first — the
   *  inline rows above stay summary copy, not buttons. */
  onManage?: (dateKey: string) => void;
}) {
  const navigate = useNavigate();
  // Q5 P71 — overflow expand-sheet state. Mirrors RunWeekStrip's
  // local handling (the parent doesn't need to know about overflow).
  const [extrasSheetOpen, setExtrasSheetOpen] = useState(false);
  const resolved = resolveTrainingDayForDate({
    dateKey,
    profile,
    programState,
    currentWeekKey: localWeekKey(new Date()),
    claimMap,
  });
  const st = resolved.scheduleType;
  const dayLabel = format(parseLocalDate(dateKey), "EEE d MMM");
  const typeLabel =
    st === "lift"
      ? "Lift day"
      : st === "run"
        ? "Run day"
        : st === "both"
          ? "Lift + Run day"
          : "Rest day";
  // DS1b: typeColor stays inline — the rest-day branch is THEME.text.muted
  // (#8E8E93), whose match to --muted-foreground isn't guaranteed, so the
  // lift/run/both sport branches ride along inline rather than risk the rest
  // pill shifting.
  const typeColor =
    st === "lift"
      ? THEME.lifting
      : st === "run"
        ? THEME.running
        : st === "both"
          ? THEME.lifting
          : THEME.text.muted;
  let tonnage = 0;
  let totalMinutes = 0;
  workouts.forEach(function (w) {
    totalMinutes += w.durationMinutes || 0;
    (w.exercises || []).forEach(function (ex) {
      (ex.sets || []).forEach(function (s) {
        tonnage += (s.weightKg || 0) * (s.reps || 0);
      });
    });
  });
  const hasW = workouts.length > 0;
  /** More than one saved session on this date — each gets its own named row
   *  instead of the ambiguous "N sessions" collapse. */
  const multiSession = workouts.length > 1;
  const hasM = dailyTotals.mealCount > 0;
  const hasRun = resolved.run.runDay !== null;
  // Cal-A: surface the PLANNED session by name so tapping a day tells
  // you WHICH lift / run it is (not a generic "Lift + Run day"). Lift
  // name from the scheduled WorkoutDay; run name from its template
  // (honouring a per-day override).
  const plannedLiftName = resolved.lift.workout?.dayName ?? null;
  const runTemplateId =
    resolved.run.runDay?.userOverride || resolved.run.runDay?.templateId;
  const runName =
    (runTemplateId &&
      RUN_TEMPLATES.find((t) => t.id === runTemplateId)?.name) ||
    "Run";
  // Q5 P69 — extras on the Home peek surface. Cap-at-2 (P71)
  // mirrors the RunWeekStrip pattern; overflow taps through to
  // /history. Counts toward the activity-section gate so a
  // rest-day-with-extras doesn't fall through to "No activity
  // logged."
  const visibleExtras = extras.slice(0, EXTRAS_VISIBLE_CAP);
  const overflowCount = Math.max(0, extras.length - EXTRAS_VISIBLE_CAP);
  const hasExtras = extras.length > 0;
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      {/*
        Padding, hierarchy and a tie back to the strip.

        This card was `py-1.5` — 6px — where every other card in the app
        uses 12-16px, and its three tiers of information (the date, the
        day-type pill, the session rows) were all `text-xs`, so nothing
        told the eye what to read first. Reported simply as "it looks
        bad", which it did: squeezed against its own edges and flat.

        `py-3` matches the documented compact-card padding, and the date
        steps up to `text-sm` so there is one clear heading above the
        rows. The caret is the other half: the card appears below a week
        strip you just tapped, and nothing connected the two — it read as
        an unrelated box that showed up. Pointing at the row it came from
        makes the relationship obvious without a word of copy.
      */}
      <div className="pt-1 pb-0.5 px-1">
        <div
          aria-hidden="true"
          className="mx-auto size-2.5 rotate-45 rounded-[2px] bg-card -mb-1.5"
        />
        <div className="relative rounded-2xl bg-card px-3 py-3 space-y-2 card-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {dayLabel}
              </span>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: typeColor + "18", color: typeColor }}
              >
                {typeLabel}
              </span>
            </div>
            <IconButton
              onClick={onClose}
              aria-label="Close day details"
              size="md"
              className="-m-1 text-muted-foreground"
              icon={<X />}
            />
          </div>
          {hasW || hasM || hasRun || hasExtras || plannedLiftName ? (
            <div className="space-y-1 text-xs">
              {/* Several sessions on one day get one row EACH, mirroring how
                  the run extras below render per-run rather than collapsing.
                  The old "N sessions" line had no honest single destination,
                  so it wasn't tappable at all — but the answer to "which one?"
                  is to stop asking the question, not to leave both unreachable.
                  Each row is named and goes to its own workout. */}
              {multiSession
                ? workouts.map((w, i) => (
                    <LiftRowShell
                      key={w.id ?? i}
                      workoutId={w.id ?? null}
                      label={workoutTitle(w)}
                    >
                      <Dumbbell className="size-3.5 shrink-0 text-lifting" />
                      <span className="text-foreground truncate">
                        {workoutTitle(w)}
                        {(w.durationMinutes ?? 0) > 0 && (
                          <span className="text-muted-foreground font-mono tabular-nums">
                            {" · "}
                            {w.durationMinutes} min
                          </span>
                        )}
                      </span>
                    </LiftRowShell>
                  ))
                : null}
              {(plannedLiftName || hasW) && !multiSession && (
                /* Tap-through to the saved session, matching the run rows
                   below (which have navigated to /run/:runId since Q5).
                   Lifts had no detail route until 2026-08-04, so this row
                   was informational-only — the asymmetry was the reason,
                   not a design choice.

                   Still not a button when the day is PLANNED with nothing
                   saved: there is no record to open yet, and an affordance
                   that does nothing is worse than none. */
                <LiftRowShell
                  workoutId={
                    workouts.length === 1 ? (workouts[0].id ?? null) : null
                  }
                  label={plannedLiftName ?? undefined}
                >
                  <Dumbbell className="size-3.5 shrink-0 text-lifting" />
                  <span className="text-foreground">
                    {/* Cal-A: the lift's actual name (e.g. "Push — Chest
                        Focus"), not a generic "N sessions". Logged
                        min/volume append in mono when the day is done. */}
                    {plannedLiftName ??
                      `${workouts.length} session${workouts.length !== 1 ? "s" : ""}`}
                    {resolved.lift.status === "completed" && (
                      <Check
                        className="inline size-3 ml-1 align-[-1px]"
                        style={{ color: THEME.success }}
                      />
                    )}
                    {resolved.lift.status === "skipped" && (
                      <span className="text-muted-foreground"> · skipped</span>
                    )}
                    {hasW && (totalMinutes > 0 || tonnage > 0) && (
                      <span className="text-muted-foreground font-mono tabular-nums">
                        {" · "}
                        {totalMinutes > 0 ? `${totalMinutes} min` : ""}
                        {totalMinutes > 0 && tonnage > 0 ? " · " : ""}
                        {tonnage > 0
                          ? tonnage >= 1000
                            ? (tonnage / 1000).toFixed(1) + "k kg"
                            : Math.round(tonnage) + " kg"
                          : ""}
                      </span>
                    )}
                  </span>
                </LiftRowShell>
              )}
              {hasM && (
                <div className="flex items-center gap-1.5">
                  <ClipboardList
                    className="size-3.5 shrink-0"
                    style={{ color: THEME.success }}
                  />
                  <span className="text-foreground font-mono tabular-nums">
                    {dailyTotals.calories.toLocaleString()} cal {"·"}{" "}
                    {Math.round(dailyTotals.protein)}g protein
                  </span>
                </div>
              )}
              {/* PR-0c: run-day status row. Resolver delivers a
                  status-aware view — when no runDay matches this
                  date (freeform user, future strip day, etc.) we
                  skip the row entirely rather than render a fake
                  "Run scheduled" line for an inherited slot. */}
              {hasRun && (
                <div className="flex items-center gap-1.5">
                  <Footprints className="size-3.5 shrink-0 text-running" />
                  {/* Cal-A: lead with the run's actual name (e.g. "Easy
                      30", "5×1K Intervals") — the status is an adornment,
                      not the whole line. A scheduled future run is just
                      its name. */}
                  <span className="text-foreground">
                    {runName}
                    {resolved.run.isCompleted ? (
                      // Q2 P24 — distinguish real vs manual ✅. Manual keeps
                      // a "· manual" tag + dimmed check so the credit kind
                      // is still legible now that the name leads the line.
                      (() => {
                        const runDayId = resolved.run.runDay?.id;
                        const completionKind = runDayId
                          ? getCompletionKind(runDayId, claimMap)
                          : null;
                        const isManual = completionKind === "manual";
                        return (
                          <>
                            {isManual && (
                              <span className="text-muted-foreground">
                                {" "}
                                · manual
                              </span>
                            )}
                            <Check
                              className={cn(
                                "inline size-3 ml-1 align-[-1px]",
                                isManual && "opacity-50"
                              )}
                              style={{ color: THEME.success }}
                            />
                          </>
                        );
                      })()
                    ) : resolved.run.status === "skipped" ? (
                      <span className="text-muted-foreground"> · skipped</span>
                    ) : resolved.run.status === "race_no_show" ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · race day passed
                      </span>
                    ) : null}
                  </span>
                </div>
              )}
              {/* Q5 P69/P70/P71 — extras rows. Mirrored from
                  RunWeekStrip: outlined Footprints icon + dimmed
                  text to differentiate from the planned-slot row
                  above. Tap → RunDetail. Overflow tap → /history. */}
              {visibleExtras.map((extra) => (
                <ExtraRunRow
                  key={extra.id}
                  extra={extra}
                  onTap={() => navigate(`/run/${extra.id}`)}
                />
              ))}
              {overflowCount > 0 && (
                <button
                  type="button"
                  onClick={() => setExtrasSheetOpen(true)}
                  aria-label={`${overflowCount} more extra ${overflowCount === 1 ? "run" : "runs"} logged for this date — open all`}
                  className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground -ml-1 px-1 py-0.5 rounded-md active:scale-[0.97]"
                >
                  <Footprints className="size-3.5 shrink-0 opacity-50 text-running" />
                  <span>
                    +{overflowCount} more extra{" "}
                    {overflowCount === 1 ? "run" : "runs"}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No activity logged
            </p>
          )}
          {/* PR-1: secondary "Manage" CTA. Only rendered when the
              day has a matched lift or runDay AND a parent supplied
              onManage. Home remains glance-first: this is the only
              affordance that exposes day-level actions; the summary
              rows above stay informational.

              Sits BELOW the sessions, not between them and the heading.
              Above, it put a verb where the eye expects the day's
              content — you read "Wed 12 Aug / Manage day / Legs — Squat
              Focus" — and it claimed a full 44px row while rendering as
              the smallest text on the card. Content first, action last
              is both the conventional card order and the one that stops
              a 44px touch target reading as an accident. */}
          {onManage &&
            (resolved.run.runDay !== null ||
              resolved.lift.workout !== null) && (
              <div className="pt-1 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => onManage(dateKey)}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-primary px-2 min-h-[44px] rounded-lg active:scale-[0.97]"
                >
                  <Settings2 className="size-3.5" />
                  Manage day
                </button>
              </div>
            )}
        </div>
      </div>
      <ExtrasExpandSheet
        open={extrasSheetOpen}
        onClose={() => setExtrasSheetOpen(false)}
        dateKey={dateKey}
        extras={extras}
      />
    </motion.div>
  );
}

/**
 * Q5 P70 — extras row rendering inside DayPeekCard. Mirrors the
 * RunWeekStrip pill's visual language for cross-surface coherence:
 * outlined / dimmed Footprints (vs the solid coral on the planned-
 * slot row), muted-foreground text. Whole `<button type="button">` is the tap
 * target so the row meets the iOS HIG touch floor inside the card.
 *
 * Distance label format: "5km" when whole-km, "5.4km" otherwise.
 * Bucket text falls back from `type` to "run" so the aria-label
 * always has something to announce.
 */
function ExtraRunRow({
  extra,
  onTap,
}: {
  extra: SavedRunDoc;
  onTap: () => void;
}) {
  const unit = useDistanceUnit();
  const dist =
    typeof extra.distance === "number" && extra.distance > 0
      ? distanceIn(extra.distance, unit)
      : null;
  const distanceText =
    dist === null
      ? "Run"
      : `${Number.isInteger(dist) ? dist : dist.toFixed(1)}${distanceUnitLabel(unit)}`;
  const bucketText =
    typeof extra.type === "string" && extra.type.length > 0
      ? extra.type
      : "run";
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Extra run: ${distanceText} ${bucketText}, tap to open`}
      className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-md text-foreground/80 hover:text-foreground active:scale-[0.97]"
    >
      <Footprints className="size-3.5 shrink-0 opacity-50 text-running" />
      <span className="text-muted-foreground">
        Extra: {distanceText} {bucketText}
      </span>
    </button>
  );
}
