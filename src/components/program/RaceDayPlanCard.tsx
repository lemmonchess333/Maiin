/**
 * RaceDayPlanCard (roadmap A7) — race execution: A/B/C goals + the
 * negative-split table. Renders ONLY during taper + race week (the
 * `raceDayPlanVisible` phase gate) inside the race-goal overlay, below
 * the cockpit — training cards own the earlier weeks.
 *
 * All logic lives in the pure view model (`src/lib/raceDayPlan.ts`):
 * pacing source (goal vs fitness, long-shot-consistent with the training
 * gate), tier labelling, split conservation. This component only lays it
 * out. Static card — no interactive elements beyond the page's own flow.
 *
 * Palette: coral (running) accents on a standard card surface, numerals
 * in font-mono + tabular-nums (design-system invariants).
 */
import { Timer } from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { paceMinSec } from "@/lib/runLabels";
import {
  buildRaceDayPlan,
  raceDayPlanVisible,
  raceTimeLabel,
  type RaceDistance,
} from "@/lib/raceDayPlan";
import type { RunFitnessInput } from "@/lib/runPaces";

export default function RaceDayPlanCard({
  distance,
  targetTimeS,
  runFitness,
  currentWeek,
  totalWeeks,
}: {
  distance: RaceDistance;
  targetTimeS?: number | null;
  runFitness?: RunFitnessInput | null;
  currentWeek: number | null;
  totalWeeks: number | null;
}) {
  if (!raceDayPlanVisible(currentWeek, totalWeeks, distance)) return null;
  const vm = buildRaceDayPlan({ distance, targetTimeS, runFitness });
  if (!vm) return null;

  return (
    <section
      aria-label="Race-day pacing plan"
      className="rounded-2xl bg-card border border-border p-4 space-y-4 card-shadow"
    >
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider text-running">
          <Timer className="size-3.5" aria-hidden="true" />
          Race-day plan
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono tabular-nums font-semibold text-foreground">
            {raceTimeLabel(vm.planTimeS)}
          </span>
          {" · "}
          <span className="font-mono tabular-nums">
            {paceMinSec(vm.avgPaceS)}/km
          </span>{" "}
          average
        </p>
      </div>

      {/* A / B / C goal tiers. */}
      <div className="space-y-2">
        {vm.goals.map((g) => (
          <div key={g.tier} className="flex items-center gap-3">
            <span
              className="size-6 rounded-md flex items-center justify-center shrink-0 bg-running/10 text-running text-xs font-bold"
              aria-hidden="true"
            >
              {g.tier}
            </span>
            <span className="text-sm font-semibold font-mono tabular-nums text-foreground min-w-[72px]">
              {g.label}
            </span>
            <span className="text-xs text-muted-foreground min-w-0 truncate">
              {g.detail}
            </span>
          </div>
        ))}
      </div>

      {/* The split table. */}
      <div className="rounded-xl bg-muted/60 p-3 space-y-1.5">
        <SectionLabel tier="section">Splits</SectionLabel>
        <div className="space-y-1">
          {vm.splits.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-2 text-sm"
            >
              <span
                className={
                  row.label === "Finish"
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                }
              >
                {row.label}
              </span>
              <span className="flex-1 border-b border-dashed border-border/60 mx-1 translate-y-[-3px]" />
              <span className="text-xs text-muted-foreground font-mono tabular-nums">
                {paceMinSec(row.segmentPaceS)}/km
              </span>
              <span className="font-semibold font-mono tabular-nums text-foreground min-w-[64px] text-right">
                {raceTimeLabel(row.cumulativeS)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        {vm.note}
      </p>
    </section>
  );
}
