import { useState } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { paceLabel } from "@/lib/runLabels";
import {
  paceTableFromFitness,
  vdotFromRace,
  parseRaceTimeToSeconds,
  type RaceDistanceKey,
} from "@/lib/runPaces";
import type { UserProfile } from "@/lib/auth";

/**
 * Adaptive Paces — "Your running fitness" settings card.
 *
 * Lets the user set a benchmark (a recent race / time-trial) from which all
 * training paces are derived, and shows the resulting personalized paces. The
 * benchmark is the locked-decision "ask" capture path (§10); the silent-derive
 * path lives in useRunFitnessAutoDerive. Free tier (paces are free; only the
 * adaptive Pace-Insights loop is Pro).
 *
 * Writes `profile.runFitness` through `updateProfile` (guarded write chain +
 * allow-list fixed in Phase 0). Distances in metres, paces in sec/km — the
 * canonical contracts.
 */

const RACE_OPTIONS: {
  value: RaceDistanceKey;
  label: string;
  meters: number;
}[] = [
  { value: "5k", label: "5K", meters: 5000 },
  { value: "10k", label: "10K", meters: 10000 },
  { value: "half", label: "Half", meters: 21097.5 },
  { value: "marathon", label: "Marathon", meters: 42195 },
];

export default function RunFitnessSection({
  profile,
  updateProfile,
}: {
  profile: UserProfile;
  updateProfile: (
    patch: Partial<UserProfile>,
    opts?: { throwOnError?: boolean; allowProtected?: boolean }
  ) => Promise<unknown>;
}) {
  const fitness = profile.runFitness ?? null;
  const paceTable = paceTableFromFitness(fitness);

  const [editing, setEditing] = useState(false);
  const [distance, setDistance] = useState<RaceDistanceKey>("5k");
  const [timeStr, setTimeStr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const seconds = parseRaceTimeToSeconds(timeStr);
    if (seconds === null) {
      setError("Enter a time like 22:30 (or 1:45:00 for longer races).");
      return;
    }
    const meters = RACE_OPTIONS.find((o) => o.value === distance)!.meters;
    const vdot = vdotFromRace(meters, seconds);
    if (vdot <= 0) {
      setError("That time doesn't look right — check it and try again.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateProfile(
        {
          runFitness: {
            benchmark: { distanceM: meters, timeS: seconds },
            vdot: Math.round(vdot * 10) / 10,
            source: "manual",
            updatedAt: new Date().toISOString(),
          },
        },
        { throwOnError: true }
      );
      haptic("success");
      setEditing(false);
      setTimeStr("");
    } catch {
      setError("Couldn't save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <SectionLabel tier="section">Your running fitness</SectionLabel>

      <div className="rounded-xl bg-card border border-border/40 p-3 space-y-3">
        {paceTable ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Personalized paces
                </p>
                <p className="text-xs text-muted-foreground">
                  From your{" "}
                  {fitness?.source === "derived"
                    ? "recent runs"
                    : "recent race"}{" "}
                  · VDOT{" "}
                  <span className="font-mono tabular-nums">
                    {paceTable.vdot}
                  </span>
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  haptic("light");
                  setEditing((v) => !v);
                  setError(null);
                }}
              >
                {editing ? "Cancel" : "Update"}
              </Button>
            </div>

            {/* Paces grid */}
            <div className="grid grid-cols-2 gap-2">
              <PaceRow label="Easy" band={paceTable.easy} />
              <PaceRow label="Threshold" band={paceTable.threshold} />
              <PaceRow label="Interval" band={paceTable.interval} />
              <PaceRow label="10K race" value={paceTable.race["10k"]} />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Set your fitness
              </p>
              <p className="text-xs text-muted-foreground">
                Add a recent race and we'll personalize every run pace to you.
              </p>
            </div>
            {!editing && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  haptic("light");
                  setEditing(true);
                }}
              >
                Add
              </Button>
            )}
          </div>
        )}

        {editing && (
          <div className="space-y-3 pt-1">
            <div>
              <SectionLabel as="span">Recent race distance</SectionLabel>
              <SegmentedControl
                ariaLabel="Benchmark race distance"
                value={distance}
                onChange={(v) => setDistance(v as RaceDistanceKey)}
                layout="fill"
                options={RACE_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
              />
            </div>
            <div>
              <label
                htmlFor="benchmark-time"
                className="text-caption uppercase tracking-wide text-muted-foreground"
              >
                Finish time
              </label>
              <input
                id="benchmark-time"
                type="text"
                inputMode="numeric"
                placeholder={distance === "5k" ? "22:30" : "1:45:00"}
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="mt-1 w-full rounded-lg bg-muted border border-border/40 px-3 py-2 text-sm font-mono tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button
              variant="sport"
              fullWidth
              loading={saving}
              onClick={handleSave}
            >
              Save fitness
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function PaceRow({
  label,
  band,
  value,
}: {
  label: string;
  band?: [number, number];
  value?: number;
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="text-caption uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold font-mono tabular-nums text-foreground">
        {band
          ? `${paceLabel(band[0])}–${paceLabel(band[1])}`
          : value
            ? `${paceLabel(value)}/km`
            : "—"}
      </p>
    </div>
  );
}
