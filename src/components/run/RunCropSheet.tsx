import { useId, useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RangeInput } from "@/components/ui/RangeInput";
import { cropRunTrace } from "@/lib/runCrop";
import { saveCroppedRun } from "@/lib/runCropSave";
import type { RunLapSplit } from "@/lib/runLaps";
import { metresAlong } from "@/lib/segments";
import { distanceLabel2, nearDistanceLabel, paceMinSec } from "@/lib/runLabels";
import { paceUnitLabel, type DistanceUnit } from "@/lib/distanceUnits";
import { formatClock } from "@/utils/formatters";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import type { GPSPoint } from "@/lib/gps";

interface RunCropSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uid: string;
  runId: string;
  points: readonly GPSPoint[];
  weightKg: number;
  unit: DistanceUnit;
  /** The laps the run saved, which the crop recomputes. */
  lapSplits?: readonly RunLapSplit[];
  /** When the run's clock started, ms: the laps count from it. */
  recordingStartedAtMs?: number | null;
  /** The run saved a heart-rate summary, which a crop removes. */
  hasHeartRate?: boolean;
  onCropped: () => void;
}

export default function RunCropSheet({
  open,
  onOpenChange,
  uid,
  runId,
  points,
  weightKg,
  unit,
  lapSplits,
  recordingStartedAtMs,
  hasHeartRate = false,
  onCropped,
}: RunCropSheetProps) {
  const startId = useId();
  const endId = useId();
  const last = Math.max(1, points.length - 1);
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(last);
  const [saving, setSaving] = useState(false);

  const clampedStart = Math.min(startIndex, Math.max(0, last - 1));
  const clampedEnd = Math.max(clampedStart + 1, Math.min(endIndex, last));
  const along = useMemo(() => metresAlong(points), [points]);
  const preview = useMemo(
    () =>
      cropRunTrace(points, clampedStart, clampedEnd, weightKg, {
        lapSplits,
        recordingStartedAtMs,
      }),
    [
      points,
      clampedStart,
      clampedEnd,
      weightKg,
      lapSplits,
      recordingStartedAtMs,
    ]
  );

  const unchanged = clampedStart === 0 && clampedEnd === last;
  const at = (index: number) => nearDistanceLabel(along[index] ?? 0, unit);

  const handleSave = async () => {
    if (!preview.ok || unchanged || saving) return;
    setSaving(true);
    try {
      // The run and its shoe's distance, in one transaction (runCropSave).
      await saveCroppedRun(uid, runId, preview.data);
      haptic("light");
      toast.success("Route cropped");
      onOpenChange(false);
      onCropped();
    } catch (err) {
      logger.error("[RunCropSheet] failed to crop run", err);
      toast.error("Couldn’t save the cropped route. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      title="Crop route"
      description="Trim extra GPS points from the start or end of this run. Splits, laps, pace, and distance recalculate automatically."
    >
      <div className="space-y-4 px-4">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <label
                htmlFor={startId}
                className="font-semibold text-foreground"
              >
                Start
              </label>
              <span className="font-mono tabular-nums text-muted-foreground">
                {at(clampedStart)} in
              </span>
            </div>
            <RangeInput
              id={startId}
              min={0}
              max={Math.max(0, last - 1)}
              step={1}
              value={clampedStart}
              disabled={saving}
              aria-valuetext={`Start at ${at(clampedStart)} into the run`}
              onChange={(e) => {
                const next = Number(e.target.value);
                setStartIndex(Math.min(next, clampedEnd - 1));
              }}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <label htmlFor={endId} className="font-semibold text-foreground">
                End
              </label>
              <span className="font-mono tabular-nums text-muted-foreground">
                {at(clampedEnd)} in
              </span>
            </div>
            <RangeInput
              id={endId}
              min={1}
              max={last}
              step={1}
              value={clampedEnd}
              disabled={saving}
              aria-valuetext={`End at ${at(clampedEnd)} into the run`}
              onChange={(e) => {
                const next = Number(e.target.value);
                setEndIndex(Math.max(next, clampedStart + 1));
              }}
            />
          </div>
        </div>

        <Card size="compact" tone="muted" className="space-y-2">
          {preview.ok ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Distance</p>
                <p className="text-sm font-semibold font-mono tabular-nums text-foreground">
                  {distanceLabel2(preview.data.distance, unit)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Time</p>
                <p className="text-sm font-semibold font-mono tabular-nums text-foreground">
                  {formatClock(preview.data.duration)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg pace</p>
                <p className="text-sm font-semibold font-mono tabular-nums text-foreground">
                  {paceMinSec(preview.data.avgPace, unit)}{" "}
                  <span className="font-sans text-xs font-normal text-muted-foreground">
                    {paceUnitLabel(unit)}
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-warning-strong" role="alert">
              {preview.reason}
            </p>
          )}
        </Card>

        {hasHeartRate && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Cropping removes this run’s heart rate. Only its summary was kept,
            and a summary can’t be cropped.
          </p>
        )}

        <div className="space-y-2">
          <Button
            variant="sport"
            fullWidth
            loading={saving}
            disabled={!preview.ok || unchanged}
            onClick={() => void handleSave()}
          >
            Save crop
          </Button>
          <Button
            variant="ghost"
            fullWidth
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
