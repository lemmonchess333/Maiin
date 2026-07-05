import { Link } from "react-router-dom";
import { Timer } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  predictedRaceTimesFromFitness,
  type RaceDistanceKey,
} from "@/lib/runPaces";
import { paceMinSec, finishTimeLabel } from "@/lib/runLabels";
import { THEME } from "@/lib/theme";
import EmptyState from "@/components/ui/EmptyState";

/**
 * Race predictions — "Your predicted 5K / 10K / Half / Marathon" from the
 * Adaptive Paces engine (Riegel off the user's `runFitness` benchmark).
 * Strava sells this as a headline paid feature; Runna hero-places it in the
 * Plan tab. Tropos has computed it since the paces engine landed — this card
 * is the surface.
 *
 * Lives in the Analytics Running section. Like the heat map's recovery chips
 * (Hist5c carve-out pattern), predictions are a TODAY snapshot — the footnote
 * says so explicitly, so the card doesn't pretend to follow the range pills.
 *
 * Cold start is a designed state, not a hidden one: without a benchmark the
 * card explains the two unlock paths (auto-derive after 3 outdoor runs — the
 * locked §10 silent-derive — or set a race time in Settings → Training).
 */

const ROWS: { key: RaceDistanceKey; label: string; km: number }[] = [
  { key: "5k", label: "5K", km: 5 },
  { key: "10k", label: "10K", km: 10 },
  { key: "half", label: "Half", km: 21.0975 },
  { key: "marathon", label: "Marathon", km: 42.195 },
];

const SOURCE_LABEL: Record<string, string> = {
  derived: "derived from your best run",
  manual: "set by you",
  race: "from a race result",
  estimate: "estimated",
};

export default function RacePredictionsCard() {
  const { profile } = useAuth();
  const fitness = profile?.runFitness ?? null;
  const times = predictedRaceTimesFromFitness(fitness);

  if (!times) {
    return (
      <div className="p-4 rounded-2xl bg-card card-shadow mt-2">
        <EmptyState
          compact
          icon={Timer}
          accent={THEME.running}
          headline="Race predictions unlock after a few runs"
          sub="Log three outdoor runs and Tropos derives your fitness benchmark automatically — or set a recent race time yourself."
          action={{
            label: "Set a race time",
            href: "/settings/training",
            variant: "sport-tinted",
          }}
        />
      </div>
    );
  }

  const benchmark = fitness?.benchmark ?? null;
  const sourceLabel = fitness?.source ? SOURCE_LABEL[fitness.source] : null;

  return (
    <div className="p-4 rounded-2xl bg-card card-shadow mt-2">
      <div className="flex items-center gap-2 mb-3">
        <Timer className="size-4 text-running" aria-hidden="true" />
        <h3 className="text-sm font-bold text-foreground">Race predictions</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {ROWS.map(({ key, label, km }) => (
          <div key={key} className="rounded-xl bg-muted p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="text-lg font-bold font-mono tabular-nums text-foreground mt-0.5">
              {finishTimeLabel(times[key])}
            </p>
            <p className="text-xs text-muted-foreground font-mono tabular-nums">
              {paceMinSec(Math.round(times[key] / km))} /km
            </p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        {benchmark ? (
          <>
            Based on{" "}
            <span className="font-mono tabular-nums">
              {(benchmark.distanceM / 1000).toFixed(1)} km
            </span>{" "}
            in{" "}
            <span className="font-mono tabular-nums">
              {finishTimeLabel(benchmark.timeS)}
            </span>
            {sourceLabel ? ` — ${sourceLabel}` : ""}.{" "}
          </>
        ) : (
          <>Based on your stored fitness level. </>
        )}
        {/* inline-block + negative-margin padding: keeps the footnote rhythm
            while clearing the 44px touch floor for the only tap target */}
        <Link
          to="/settings/training"
          className="underline underline-offset-2 text-running inline-block px-2 py-3 -mx-2 -my-3"
        >
          Update
        </Link>
      </p>
      {/* Range carve-out (Hist5c): predictions are a today-snapshot. */}
      <p className="text-[10px] text-muted-foreground mt-1">
        As of today — independent of the selected range.
      </p>
    </div>
  );
}
