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
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import type { SavedRunDoc } from "@/hooks/useClaimMap";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import { IconButton } from "@/components/ui/IconButton";

/** Q5 P71 cap — DayPeekCard mirrors RunWeekStrip; up to 2 extras
 *  shown inline before an overflow "+N more" tap-through. */
const EXTRAS_VISIBLE_CAP = 2;

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
  const typeColor =
    st === "lift"
      ? THEME.lifting
      : st === "run"
        ? THEME.running
        : st === "both"
          ? THEME.lifting
          : THEME.textMuted;
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
  const hasM = dailyTotals.mealCount > 0;
  const hasRun = resolved.run.runDay !== null;
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
      <div className="pt-1 pb-0.5 px-1">
        <div className="rounded-2xl bg-card px-3 py-1.5 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
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
              size="sm"
              className="-m-1 text-muted-foreground"
              icon={<X />}
            />
          </div>
          {/* PR-1: secondary "Manage" CTA. Only rendered when the
              day has a matched lift or runDay AND a parent supplied
              onManage. Home remains glance-first: this is the only
              affordance that exposes day-level actions; the summary
              rows above stay informational. */}
          {onManage &&
            (resolved.run.runDay !== null ||
              resolved.lift.workout !== null) && (
              <button
                type="button"
                onClick={() => onManage(dateKey)}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary px-2 py-1 -ml-2 rounded-md active:scale-[0.97]"
              >
                <Settings2 className="w-3 h-3" />
                Manage day
              </button>
            )}
          {hasW || hasM || hasRun || hasExtras ? (
            <div className="space-y-1 text-xs">
              {hasW && (
                <div className="flex items-center gap-1.5">
                  <Dumbbell
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: THEME.lifting }}
                  />
                  <span className="text-foreground font-mono tabular-nums">
                    {workouts.length} session{workouts.length !== 1 ? "s" : ""}
                    {totalMinutes > 0 && (
                      <span className="text-muted-foreground">
                        {" · "}
                        {totalMinutes} min
                      </span>
                    )}
                    {tonnage > 0 && (
                      <span className="text-muted-foreground">
                        {" · "}
                        {tonnage >= 1000
                          ? (tonnage / 1000).toFixed(1) + "k kg"
                          : Math.round(tonnage) + " kg"}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {hasM && (
                <div className="flex items-center gap-1.5">
                  <ClipboardList
                    className="w-3.5 h-3.5 shrink-0"
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
                  <Footprints
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: THEME.running }}
                  />
                  <span className="text-foreground">
                    {resolved.run.isCompleted ? (
                      <span className="inline-flex items-center gap-1">
                        Run completed
                        <Check
                          className="w-3 h-3"
                          style={{ color: THEME.success }}
                        />
                      </span>
                    ) : resolved.run.status === "skipped" ? (
                      <span style={{ color: "hsl(var(--muted-foreground))" }}>
                        Run skipped
                      </span>
                    ) : resolved.run.status === "race_no_show" ? (
                      <span style={{ color: "hsl(var(--muted-foreground))" }}>
                        Race day passed
                      </span>
                    ) : (
                      <span>Run scheduled</span>
                    )}
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
                  onClick={() => navigate("/history")}
                  aria-label={`${overflowCount} more extra ${overflowCount === 1 ? "run" : "runs"} logged for this date — open History`}
                  className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground -ml-1 px-1 py-0.5 rounded-md active:scale-[0.97]"
                >
                  <Footprints
                    className="w-3.5 h-3.5 shrink-0 opacity-50"
                    style={{ color: THEME.running }}
                  />
                  <span>
                    +{overflowCount} more extra{" "}
                    {overflowCount === 1 ? "run" : "runs"}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No activity logged</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Q5 P70 — extras row rendering inside DayPeekCard. Mirrors the
 * RunWeekStrip pill's visual language for cross-surface coherence:
 * outlined / dimmed Footprints (vs the solid coral on the planned-
 * slot row), muted-foreground text. Whole `<button>` is the tap
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
  const distanceKm =
    typeof extra.distance === "number" && extra.distance > 0
      ? extra.distance / 1000
      : null;
  const distanceText =
    distanceKm === null
      ? "Run"
      : Number.isInteger(distanceKm)
        ? `${distanceKm}km`
        : `${distanceKm.toFixed(1)}km`;
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
      <Footprints
        className="w-3.5 h-3.5 shrink-0 opacity-50"
        style={{ color: THEME.running }}
      />
      <span className="text-muted-foreground">
        Extra: {distanceText} {bucketText}
      </span>
    </button>
  );
}
