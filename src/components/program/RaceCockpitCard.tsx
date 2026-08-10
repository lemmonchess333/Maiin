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

import { ChevronRight, Flag, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SectionLabel from "@/components/ui/SectionLabel";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { spaceDef } from "@/features/spaces/spaceDefs";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/dateHelpers";
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

  const dateLabel = (() => {
    try {
      return format(parseLocalDate(targetDate), "d MMM yyyy");
    } catch {
      return targetDate;
    }
  })();

  return (
    <section
      aria-label="Race plan"
      className="rounded-2xl bg-card border border-border p-4 space-y-4 card-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider text-running-strong">
            <Flag className="size-3.5" aria-hidden="true" />
            Race plan
          </div>
          <h3 className="text-2xl font-extrabold tracking-tight text-foreground leading-tight">
            {eventName || distanceLabel}
          </h3>
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
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit race goal"
          className="shrink-0 inline-flex items-center gap-0.5 min-h-[44px] px-2 -my-1 -mr-1 text-xs font-medium text-muted-foreground hover:text-foreground motion-safe:active:scale-[0.97] transition-transform rounded-md"
        >
          Edit
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {hasProgress && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-muted/60 p-3">
            <SectionLabel tier="section">Week</SectionLabel>
            <p className="text-lg font-semibold tabular-nums font-mono text-foreground">
              {currentWeek! + 1} / {totalWeeks!}
            </p>
          </div>
          <div className="rounded-xl bg-muted/60 p-3">
            <SectionLabel tier="section">Phase</SectionLabel>
            <p className="text-lg font-semibold text-foreground">
              {phaseLabel ?? "—"}
            </p>
          </div>
        </div>
      )}

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

      {/* PROGRAM-CIRCLE-01 (slice 4a) — hand the race plan off to a
          Circle. Running non-critical action → sport-tinted (coral).
          Privacy fence: ONLY the space type, a readable title and the
          race date travel — never routes, GPS, paces or plan internals. */}
      <Button
        variant="sport-tinted"
        fullWidth
        onClick={() => {
          haptic("light");
          navigate(
            `/social?circleCreate=race&circleTitle=${encodeURIComponent(
              `${distanceLabel} training`
            )}&circleDate=${targetDate}`
          );
        }}
      >
        Train together
      </Button>

      {raceSpaceLinked && (
        /* Races plan PR4 — cockpit → race space cross-link. Quiet row,
           not a second CTA: the community is a place to visit, not an
           action to take. */
        <button
          type="button"
          onClick={() => {
            haptic("light");
            navigate(`/space/${raceSpace!.id}`);
          }}
          className="w-full min-h-[44px] flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-3.5 text-sm font-medium text-foreground active:scale-[0.97] transition-transform"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Users className="size-4 shrink-0 text-running" aria-hidden />
            <span className="truncate">Race community</span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </button>
      )}

      {inTaper && (
        <SectionLabel tier="section" className="text-running-strong">
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
          this distance, so every session is easy running with no hard sessions.
          Aim to finish strong, not to PR.
        </p>
      ) : (
        compressed && (
          <p className="text-xs text-muted-foreground">
            Compressed plan — your target date is sooner than the ideal build
            for this distance, so interval work is trimmed and the long-run
            progression shortened to keep it safe.
          </p>
        )
      )}
    </section>
  );
}
