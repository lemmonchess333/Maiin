import { useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, ChevronRight, Footprints } from "lucide-react";
import { THEME } from "@/lib/theme";
import { EXERCISES } from "@/lib/exercises";
import { epley1RM } from "@/lib/analytics";
import PRBadge from "@/components/analytics/PRBadge";
import PRCard from "@/components/analytics/PRCard";

/* PR 7b follow-up — collapse the lifetime Lift PRs list to the
   most-recently-set N entries by default. A serious lifter logs
   30-60+ distinct exercises over time; rendering all of them
   produces a wall of rows that's not glanceable. Default N shows
   the lifts with momentum (recent date); a "Show all" tap expands
   the rest. Recent-bests (rolling 30d) already has its own scope
   limit so isn't affected. */
const LIFT_PR_DEFAULT_LIMIT = 8;

/* Hist5b pin 4 + 5 — dedicated PRs tab body. Two sport-coded
   sections (Running + Lifting), each with up to three sublabeled
   subsections:

     Lifetime    — all-time best per distance / exercise. Unit-true
                   (Hist5d Stress 20 / 36): one PR per slot, no
                   "previous best" indicator (drill-down → exercise
                   history shows the progression timeline).
     Last 30 days — rolling 30-day window so power users see recent
                   momentum without losing the lifetime anchor.
     Indoor      — treadmill / manual-distance running PRs, separate
                   from the outdoor GPS lifetime / recent lists.
                   Sublabel keeps the input-source distinct so the
                   user doesn't conflate user-entered pace with
                   GPS-verified pace.

   PR 7b layered the Recent + Indoor + cold-state design on top of
   PR 7a's lifetime-only skeleton. Cold-state return-link toast
   (PR-eligible save → toast → tap → PRs tab) lives in RunSummary
   + workout-save flows, not here. */

interface RunningPR {
  label: string;
  value: string;
  date: string;
  isNew?: boolean;
}

interface RunningPRBuckets {
  lifetime: RunningPR[];
  recent30d: RunningPR[];
  indoor: RunningPR[];
  hasAnyIndoor: boolean;
  hasAnyRecent: boolean;
}

interface LiftPR {
  name: string;
  weight: number;
  reps: number;
  date: string;
}

interface PRsTabProps {
  runningPRs: RunningPRBuckets;
  lifetimePRs: LiftPR[];
  recentLiftPRs: LiftPR[];
  hasAnyLifetimeWorkout: boolean;
  hasAnyLifetimeRun: boolean;
}

function LiftPRRow({ pr }: { pr: LiftPR }) {
  /* Use the shared epley1RM from lib/analytics so a future tweak
     to the formula (e.g. swapping to Brzycki / Lombardi) lands in
     one place. The shared helper also guards reps<=0 / weight<=0
     which can't happen for a real PR but defends against bad data. */
  const e1rm = epley1RM(pr.weight, pr.reps);
  const dateLabel = new Date(pr.date + "T12:00:00").toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short" }
  );
  const exercise = EXERCISES.find((e) => e.name === pr.name);
  const isBW = exercise?.equipment === "Bodyweight";
  return (
    <Link
      key={pr.name}
      to={`/history/exercise/${encodeURIComponent(pr.name)}`}
      className="flex items-center justify-between px-4 py-3 active:bg-muted/40 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <PRBadge isNew={false} />
          <p className="text-xs font-medium text-foreground truncate">
            {pr.name}
          </p>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>
      </div>
      <div className="text-right flex-shrink-0 ml-3 flex items-center gap-2">
        <div>
          <p className="text-sm font-bold font-mono tabular-nums text-lifting">
            {isBW && pr.weight === 0 ? (
              "BW"
            ) : isBW && pr.weight > 0 ? (
              `+${pr.weight} kg`
            ) : pr.weight > 0 ? (
              `${pr.weight} kg`
            ) : (
              <span className="text-muted-foreground">— kg</span>
            )}{" "}
            × {pr.reps}
          </p>
          {isBW && pr.weight === 0 ? null : pr.weight > 0 ? (
            <p className="text-xs text-muted-foreground">~{e1rm} kg 1RM</p>
          ) : null}
        </div>
        <ChevronRight
          className="size-4 text-muted-foreground/60 shrink-0"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

function LiftPRList({
  prs,
  title,
  subtitle,
  emptyText,
  /** Optional cap on visible rows. When the list exceeds the cap,
   *  shows a "Show all (N)" toggle that expands the rest. Recent-
   *  bests doesn't pass this (lists are bounded by their 30-day
   *  scope); Lifetime does (a serious lifter accumulates dozens
   *  of distinct exercises). */
  collapseAfter,
}: {
  prs: LiftPR[];
  title: string;
  subtitle: string;
  emptyText?: string;
  collapseAfter?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapsed =
    collapseAfter != null && !expanded && prs.length > collapseAfter;
  const visible = collapsed ? prs.slice(0, collapseAfter) : prs;
  const hiddenCount = prs.length - visible.length;

  return (
    <div className="rounded-2xl bg-card overflow-hidden card-shadow">
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-border/30">
        <Trophy size={16} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground flex-1">
          {title}
        </h3>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      {prs.length > 0 ? (
        <>
          <div className="divide-y divide-border/20">
            {visible.map((pr) => (
              <LiftPRRow key={pr.name} pr={pr} />
            ))}
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full px-4 py-3 text-xs font-medium border-t border-border/20 active:bg-muted/40 transition-colors text-lifting"
            >
              Show all ({prs.length})
            </button>
          )}
          {expanded && prs.length > (collapseAfter ?? Infinity) && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="w-full px-4 py-3 text-xs font-medium text-muted-foreground border-t border-border/20 active:bg-muted/40 transition-colors"
            >
              Show fewer
            </button>
          )}
        </>
      ) : emptyText ? (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">{emptyText}</p>
        </div>
      ) : null}
    </div>
  );
}

export default function PRsTab({
  runningPRs,
  lifetimePRs,
  recentLiftPRs,
  hasAnyLifetimeWorkout,
  hasAnyLifetimeRun,
}: PRsTabProps) {
  const hasNoPRs = !hasAnyLifetimeRun && !hasAnyLifetimeWorkout;

  /* Hist5d Stress 6 — cold-state designed as onboarding, not as a
     fallback. Cohesive single surface (not stacked empty cards)
     with both Start Run + Start Lift CTAs side-by-side. The
     return-link toast on PR-eligible save (Hist5d Stress 19) lives
     in RunSummary + workout-save flows, not here — that's how the
     user comes BACK to this tab to celebrate their first PR. */
  if (hasNoPRs) {
    return (
      <section aria-label="Personal Records" className="space-y-3 mt-4">
        <div className="p-6 rounded-2xl bg-card text-center space-y-3">
          <div
            className="size-12 rounded-xl flex items-center justify-center mx-auto"
            style={{ background: `${THEME.brand}15` }}
          >
            <Trophy size={24} style={{ color: THEME.brand }} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Your PRs will appear here
            </p>
            <p className="text-xs text-muted-foreground">
              Log your first run or workout to set your starting personal
              records.
            </p>
          </div>
          <div className="flex gap-2 justify-center pt-1">
            <Link
              to="/run"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-running"
            >
              <Footprints
                className="size-3.5 inline-block mr-1"
                aria-hidden="true"
              />
              Start Run
            </Link>
            <Link
              to="/program"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-lifting"
            >
              Start Lift
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Personal Records" className="space-y-5 mt-4">
      {/* Running PRs — three subsections per Hist5b pin 4 + 5:
          Lifetime (outdoor GPS, always shown when user has run),
          Last 30 days (only when user has recent activity),
          Indoor (only when user has treadmill / manual runs). */}
      {hasAnyLifetimeRun && (
        <section aria-label="Running personal records" className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-running">
            Running
          </p>
          <PRCard
            title="Running PRs"
            subtitle="All-time · outdoor GPS only"
            prs={runningPRs.lifetime}
            accentColor={THEME.running}
          />
          {runningPRs.hasAnyRecent && (
            <PRCard
              title="Recent bests"
              subtitle="Last 30 days · outdoor GPS only"
              prs={runningPRs.recent30d}
              accentColor={THEME.running}
            />
          )}
          {runningPRs.hasAnyIndoor && (
            <PRCard
              title="Indoor PRs"
              subtitle="All-time · treadmill / manual"
              prs={runningPRs.indoor}
              accentColor={THEME.running}
            />
          )}
        </section>
      )}

      {/* Lift PRs — two subsections: Lifetime + Last 30 days.
          Lifting has no "indoor" analogue — every workout counts.
          Recent bests subsection suppresses when no lifts in the
          last 30 days (returning users see lifetime only without
          a confusing empty recent-window). */}
      {hasAnyLifetimeWorkout && (
        <section aria-label="Lifting personal records" className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-lifting">
            Lifting
          </p>
          <LiftPRList
            prs={lifetimePRs}
            title="Lift PRs"
            subtitle="All-time"
            emptyText="Log your first workout to set your starting PRs."
            collapseAfter={LIFT_PR_DEFAULT_LIMIT}
          />
          {recentLiftPRs.length > 0 && (
            <LiftPRList
              prs={recentLiftPRs}
              title="Recent bests"
              subtitle="Last 30 days"
            />
          )}
        </section>
      )}
    </section>
  );
}
