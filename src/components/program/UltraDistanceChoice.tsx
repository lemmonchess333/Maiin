import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type {
  RaceDistance,
  UltraRaceDistance,
} from "@/features/program/programTypes";
import {
  getRaceMinWeeks,
  isUltraDistance,
} from "@/features/program/runPlanTiming";

/** The ultras, by the names a race lists them under, each with its length
 *  as the road races' cards give theirs. */
const ULTRA_OPTIONS: { value: UltraRaceDistance; label: string; km: string }[] =
  [
    { value: "50k", label: "50K", km: "50 km" },
    { value: "50mi", label: "50 mi", km: "80.5 km" },
    { value: "100k", label: "100K", km: "100 km" },
  ];

/**
 * Run26 (2): the ultras, under the road races in setup and the run-plan
 * editor: one row, none chosen while the race is a road one. 100 miles is
 * named as not offered, since a runner choosing an ultra looks for it.
 */
export default function UltraDistanceChoice({
  distance,
  onChange,
  labelClassName = "text-sm",
}: {
  distance: RaceDistance;
  onChange: (next: UltraRaceDistance) => void;
  labelClassName?: string;
}) {
  const chosen = isUltraDistance(distance) ? distance : null;
  return (
    <div className="space-y-2">
      <p className={labelClassName}>Ultra</p>
      <SegmentedControl<UltraRaceDistance>
        ariaLabel="Ultra distance"
        value={chosen}
        onChange={onChange}
        options={ULTRA_OPTIONS.map(({ value, label }) => ({ value, label }))}
      />
      <p className="text-xs text-muted-foreground text-pretty">
        {chosen
          ? `${ULTRA_OPTIONS.find((o) => o.value === chosen)?.km} · ${getRaceMinWeeks(chosen)}+ weeks. No 100-mile plan yet.`
          : "No 100-mile plan yet."}
      </p>
    </div>
  );
}
