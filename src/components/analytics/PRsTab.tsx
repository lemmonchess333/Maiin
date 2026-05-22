import { Link } from "react-router-dom";
import { Trophy, ChevronRight, Footprints } from "lucide-react";
import { THEME } from "@/lib/theme";
import { EXERCISES } from "@/lib/exercises";
import PRBadge from "@/components/analytics/PRBadge";
import PRCard from "@/components/analytics/PRCard";

/* Hist5b — dedicated PRs tab body. Migrates Running PRs +
   Lifetime Lift PRs off the Analytics scroll where they were
   awkwardly mixed-scope (Lift PRs were hardcoded "Last 7 days"
   inside a Lifting section that otherwise honoured the global
   TimeRangePills). Lifetime semantics fit a Tier 2 tab cleanly.

   Sport-coded section headers (Running coral + Lift purple)
   restore the visual identity that was contextual on the
   per-sport sections. PR 7b layers in Recent-bests subsection +
   Indoor PRs + cold-state design + return-link toast.

   Empty-state for now is a minimal CTA — PR 7b designs the
   onboarding-quality cold-state with return-link toast on
   PR-eligible save. */

interface RunningPR {
  label: string;
  value: string;
  date: string;
  isNew?: boolean;
}

interface PRsTabProps {
  runningPRs: RunningPR[];
  lifetimePRs: Array<{ name: string; weight: number; reps: number; date: string }>;
  hasAnyLifetimeWorkout: boolean;
  hasAnyLifetimeRun: boolean;
}

export default function PRsTab({
  runningPRs,
  lifetimePRs,
  hasAnyLifetimeWorkout,
  hasAnyLifetimeRun,
}: PRsTabProps) {
  const hasNoPRs = !hasAnyLifetimeRun && !hasAnyLifetimeWorkout;

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
          <p className="text-sm font-medium text-foreground">
            Your PRs will appear here
          </p>
          <p className="text-xs text-muted-foreground">
            Log your first run or workout to start tracking personal records.
          </p>
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
    <section aria-label="Personal Records" className="space-y-4 mt-4">
      {/* Running PRs — outdoor GPS only for v1. PR 7b layers in
          indoor / treadmill PRs as a separate sub-section. */}
      {hasAnyLifetimeRun && (
        <section aria-label="Running personal records">
          <p
            className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: THEME.running }}
          >
            Running
          </p>
          <PRCard
            title="Running PRs"
            subtitle="All-time · outdoor GPS only"
            prs={runningPRs}
            accentColor={THEME.running}
          />
        </section>
      )}

      {/* Lift PRs — lifetime, replacing the prior "Last 7 days"
          mixed-scope card on Analytics. Re-uses the same row
          layout the previous Analytics card used so users
          recognise the surface; only the framing + scope change. */}
      {hasAnyLifetimeWorkout && (
        <section aria-label="Lifting personal records">
          <p
            className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: THEME.lifting }}
          >
            Lifting
          </p>
          <div
            className="rounded-2xl bg-card overflow-hidden"
            style={{ boxShadow: "var(--ds-shadow-card)" }}
          >
            <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-border/30">
              <Trophy size={16} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground flex-1">
                Lift PRs
              </h3>
              <span className="text-xs text-muted-foreground">All-time</span>
            </div>
            {lifetimePRs.length > 0 ? (
              <div className="divide-y divide-border/20">
                {lifetimePRs.map((pr) => {
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
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {dateLabel}
                        </p>
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
                                  : (
                                      <span className="text-muted-foreground">
                                        — kg
                                      </span>
                                    )}
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
                })}
              </div>
            ) : (
              <div className="px-4 py-8 text-center space-y-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto"
                  style={{ background: `${THEME.lifting}15` }}
                >
                  <Trophy size={20} style={{ color: THEME.lifting }} />
                </div>
                <p className="text-xs font-medium text-foreground">
                  No lift PRs yet
                </p>
                <p className="text-xs text-muted-foreground">
                  Log your first workout to set your starting PRs.
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
