/**
 * RaceCockpitCard — the Programme Run cockpit's race-prep identity card.
 *
 * Training-plan primitive (see CLAUDE.md → "Training plan primitives").
 * Replaces the plain RaceHeader one-liner with a proper command-centre
 * header that answers, at a glance: what race, how far away, what
 * week/phase, and how far through the cycle.
 *
 * Renders ONLY when a race goal is active (the race_goal overlay of the
 * locked 2-state model). It carries no mode language — there is no
 * user-facing freeform/structured/race_prep toggle (Run9a).
 *
 * Palette: coral (running) accents only, on a standard card surface. The
 * phase rail reflects the REAL engine phases (Base · Build · Taper ·
 * Race from getPhaseForWeek) — no invented "Peak" segment, so the active
 * highlight always corresponds to a phase the scheduler can emit.
 */

import type { ReactNode } from "react";
import {
  ChevronRight,
  Flag,
  SlidersHorizontal,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SectionLabel from "@/components/ui/SectionLabel";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { haptic } from "@/lib/haptic";
import { spaceDef } from "@/features/spaces/spaceDefs";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonthYear } from "@/utils/formatters";
import PhaseRail from "./PhaseRail";

interface RaceCockpitCardProps {
  /** Readable distance — "Marathon", "Half Marathon", "10K", "5K". */
  distanceLabel: string;
  /** Optional user-entered event name ("London Marathon 2026"). When
   *  present it becomes the card heading and the distance demotes into
   *  the meta sub-line; when absent, the distance stays the heading. */
  eventName?: string;
  /** Local "YYYY-MM-DD" target date. */
  targetDate: string;
  daysToRace: number;
  /** Stored 0-based week index (null when the plan has no counters). */
  currentWeek: number | null;
  totalWeeks: number | null;
  /** "Base" | "Build" | "Taper" | "Race" (null when no progress). */
  phaseLabel: string | null;
  inTaper: boolean;
  compressed: boolean;
  /** Finish-safely plan — implies `compressed` but gets its own copy, since
   *  a below-floor plan has no long-run progression to shorten. */
  belowFloor?: boolean;
  /** raceGoal.eventSpaceId (races plan PR4) — when it resolves to a
   *  known race space, the card offers a quiet "Race community" link.
   *  Manual goals lack the binding and render no row. */
  raceSpaceId?: string;
  /** The plan's coming weeks (`RaceWeeksAhead`, R23), under the phase
   *  rail: where the plan is, then what is ahead of it. */
  weeksAhead?: ReactNode;
  /** Opens the Adjust this week sheet. Omitted while the week cannot be
   *  adjusted (recovery, just after the race), and the row goes with it. */
  onAdjustWeek?: () => void;
  onEdit: () => void;
}

export default function RaceCockpitCard({
  distanceLabel,
  eventName,
  targetDate,
  daysToRace,
  currentWeek,
  totalWeeks,
  phaseLabel,
  inTaper,
  compressed,
  belowFloor = false,
  raceSpaceId,
  weeksAhead,
  onAdjustWeek,
  onEdit,
}: RaceCockpitCardProps) {
  const navigate = useNavigate();
  // Exact-id lookup (Q4): render the community row only when the
  // binding resolves to a real race space — a stale/unknown id (e.g.
  // a space merged away) degrades to no row, never a broken link.
  const raceSpace = raceSpaceId ? spaceDef(raceSpaceId) : undefined;
  const raceSpaceLinked = raceSpace?.kind === "race";
  const hasProgress = currentWeek != null && totalWeeks != null;
  const progress = hasProgress
    ? Math.min(100, Math.max(0, ((currentWeek! + 1) / totalWeeks!) * 100))
    : 0;

  // A key that does not parse shows as stored, rather than "Invalid Date".
  const target = parseLocalDate(targetDate);
  const dateLabel = Number.isNaN(target.getTime())
    ? targetDate
    : formatDayMonthYear(target);

  return (
    <section
      aria-label="Race plan"
      className="rounded-2xl bg-card border border-border p-4 space-y-4 card-shadow"
    >
      {/* "Edit run plan" drops under the heading, at the right, once the
          heading would be narrower than 9em (a long event name, or larger
          text on the phone). It is the Run tab's one way into the run plan
          editor while a race is set. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="space-y-1 min-w-[min(100%,9em)] flex-1">
          <SectionLabel
            as="span"
            className="inline-flex items-center gap-1.5 font-bold text-running-strong"
          >
            <Flag className="size-3.5" aria-hidden="true" />
            Race plan
          </SectionLabel>
          <h3 className="text-2xl font-extrabold tracking-tight text-foreground leading-tight">
            {eventName || distanceLabel}
          </h3>
          {/* The week sits on the date line. The rail below marks the
              phase, and the page header names the week too, so tiles for
              Week and Phase said both a third time. */}
          <p className="text-sm text-muted-foreground">
            {/* When the event name takes the heading, the distance demotes
                into this meta row. */}
            {eventName && (
              <>
                {distanceLabel}
                {" · "}
              </>
            )}
            {dateLabel}
            {" · "}
            <span className="font-medium text-foreground">
              {daysToRace} {daysToRace === 1 ? "day" : "days"} out
            </span>
            {hasProgress && (
              <>
                {" · "}
                <InlineNumerals>{`week ${currentWeek! + 1} of ${totalWeeks!}`}</InlineNumerals>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="ml-auto shrink-0 inline-flex items-center gap-0.5 min-h-[44px] px-2 -my-1 -mr-2 text-xs font-medium text-muted-foreground hover:text-foreground motion-safe:active:scale-[0.97] transition-transform rounded-md"
        >
          Edit run plan
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {hasProgress && (
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all bg-running"
              style={{ width: `${progress}%` }}
            />
          </div>
          <PhaseRail activePhase={phaseLabel} />
        </div>
      )}

      {weeksAhead}

      {/* The card's quiet rows, under the rail. A Circle and a race space
          are social, not a sport, so they are neutral rows rather than
          coral buttons.
          Adjust this week (Run13) opens the week's sheet. It lives here
          only: the race plan is what it adjusts, and the owner asked for
          one way into it.
          PROGRAM-CIRCLE-01 (slice 4a): Train together hands the race plan
          off to a Circle. Privacy fence: ONLY the space type, a readable
          title and the race date travel, never routes, GPS, paces or plan
          internals. */}
      <div className="space-y-2">
        {onAdjustWeek && (
          <CardRow
            icon={SlidersHorizontal}
            label="Adjust this week"
            onClick={onAdjustWeek}
          />
        )}
        <CardRow
          icon={UserPlus}
          label="Train together"
          onClick={() =>
            navigate(
              `/social?circleCreate=race&circleTitle=${encodeURIComponent(
                `${distanceLabel} training`
              )}&circleDate=${targetDate}`
            )
          }
        />
        {raceSpaceLinked && (
          /* Races plan PR4: cockpit → race space cross-link. The community
             is a place to visit, not an action to take. */
          <CardRow
            icon={Users}
            label="Race community"
            onClick={() => navigate(`/space/${raceSpace!.id}`)}
          />
        )}
      </div>

      {inTaper && (
        <SectionLabel className="text-running-strong">
          Taper week
          {" · "}
          race in {daysToRace} {daysToRace === 1 ? "day" : "days"}
        </SectionLabel>
      )}

      {/* belowFloor is checked FIRST: it implies `compressed`, but the two
          say different things. A below-floor plan has no long-run
          progression to shorten — every non-race week is easy running — so
          the compressed copy below would describe training it does not
          contain. Wording matches the realign toast (`realignCopy.ts`) so the
          transient message and the persistent one agree. */}
      {belowFloor ? (
        <p className="text-xs text-muted-foreground">
          Mostly-easy plan — there aren&apos;t enough weeks for a full build at
          this distance, so every session is easy running, with no quality
          sessions. Aim to finish strong, not to PR.
        </p>
      ) : (
        compressed && (
          /* RUN-EV-05: this line used to end "…the long-run progression
             shortened to keep it safe", which was wrong twice.

             The safety promise is the one the ledger asked to remove, and it
             WAS removed — from `realignCopy.ts`'s below-floor message in the
             2026-08-09 pass ("the old finish-safely / train-safely phrasing
             implied a safety promise") and from the below-floor branch above.
             This branch was missed, so the product went on promising safety in
             the one place it stayed persistent rather than transient.

             And the description was backwards. In the compressed-but-
             above-floor band the long-run progression is not shortened — it is
             the STEEPEST in the system, because the same build is packed into
             fewer weeks. Measured in racePlanSafetySweep.test.ts: a six-week
             marathon steps 12 km → 25 km in one week (+108%), a five-week half
             10 km → 20 km, against 25-33% steps with down weeks in a
             full-length plan.

             Whether that ramp should be capped is NOT settled here — RUN-EV-06
             holds the scheduler's long-run dose heuristics as an owner
             decision, and the handoff explicitly bars importing a universal
             10% rule as a default algorithm. So the dose is untouched and only
             the sentence describing it is corrected. Register matches
             realignCopy's "compressible" case ("a tighter build"). */
          <p className="text-xs text-muted-foreground">
            Compressed plan — your target date is sooner than the ideal build
            for this distance, so interval work is trimmed and the long-run
            build is packed into fewer weeks. Expect bigger jumps between long
            runs than a full-length plan would use.
          </p>
        )
      )}
    </section>
  );
}

/** One quiet row inside the card: a muted fill, an icon, the words and a
 *  chevron, 44px tall. For the card's ways out to somewhere else, which
 *  must not compete with the session card's one filled button. */
function CardRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        onClick();
      }}
      className="w-full min-h-[44px] flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-3.5 text-sm font-medium text-foreground active:scale-[0.97] transition-transform"
    >
      <span className="flex items-center gap-2 min-w-0">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </button>
  );
}
