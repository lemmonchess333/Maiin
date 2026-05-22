import { Link } from "react-router-dom";
import { Trophy, ChevronRight, Footprints } from "lucide-react";
import { THEME } from "@/lib/theme";
import { EXERCISES } from "@/lib/exercises";
import PRBadge from "@/components/analytics/PRBadge";
import PRCard from "@/components/analytics/PRCard";

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
  const e1rm = Math.round(pr.weight * (1 + pr.reps / 30));
  const dateLabel = new Date(pr.date + "T12:00:00").toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short" },
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
          <p
            className="text-sm font-bold font-mono tabular-nums"
            style={{ color: THEME.lifting }}
          >
            {isBW && pr.weight === 0
              ? "BW"
              : isBW && pr.weight > 0
                ? `+${pr.weight} kg`
                : pr.weight > 0
                  ? `${pr.weight} kg`
                  : <span className="text-muted-foreground">— kg</span>}
            {" "}× {pr.reps}
          </p>
          {isBW && pr.weight === 0 ? null : pr.weight > 0 ? (
            <p className="text-xs text-muted-foreground">
              ~{e1rm} kg 1RM
            </p>
          ) : null}
        </div>
        <ChevronRight
          className="w-4 h-4 text-muted-foreground/60 shrink-0"
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
}: {
  prs: LiftPR[];
  title: string;
  subtitle: string;
  emptyText?: string;
}) {
  return (
    <div
      className="rounded-2xl bg-card overflow-hidden"
      style={{ boxShadow: "var(--ds-shadow-card)" }}
    >
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-border/30">
        <Trophy size={16} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground flex-1">{title}</h3>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      {prs.length > 0 ? (
        <div className="divide-y divide-border/20">
          {prs.map((pr) => <LiftPRRow key={pr.name} pr={pr} />)}
        </div>
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
            className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto"
            style={{ background: `${THEME.brand}15` }}
          >
            <Trophy size={24} style={{ color: THEME.brand }} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Your PRs will appear here
            </p>
            <p className="text-xs text-muted-foreground">
              Log your first run or workout to set your starting personal records.
            </p>
          </div>
          <div className="flex gap-2 justify-center pt-1">
            <Link
              to="/run"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: THEME.running }}
            >
              <Footprints className="w-3.5 h-3.5 inline-block mr-1" aria-hidden="true" />
              Start Run
            </Link>
            <Link
              to="/program"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: THEME.lifting }}
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
          <p
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: THEME.running }}
          >
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
          <p
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: THEME.lifting }}
          >
            Lifting
          </p>
          <LiftPRList
            prs={lifetimePRs}
            title="Lift PRs"
            subtitle="All-time"
            emptyText="Log your first workout to set your starting PRs."
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
