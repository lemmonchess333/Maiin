import { useId, useMemo, useState } from "react";
import { doc } from "firebase/firestore";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RangeInput } from "@/components/ui/RangeInput";
import { db } from "@/lib/firebase";
import { updateDocGuarded } from "@/lib/firestoreWrite";
import { cropRunTrace } from "@/lib/runCrop";
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
    () => cropRunTrace(points, clampedStart, clampedEnd, weightKg),
    [points, clampedStart, clampedEnd, weightKg]
  );

  const unchanged = clampedStart === 0 && clampedEnd === last;
  const at = (index: number) => nearDistanceLabel(along[index] ?? 0, unit);

  const handleSave = async () => {
    if (!preview.ok || unchanged || saving) return;
    setSaving(true);
    try {
      await updateDocGuarded(doc(db, "users", uid, "runs", runId), {
        points: preview.data.points,
        distance: preview.data.distance,
        duration: preview.data.duration,
        avgPace: preview.data.avgPace,
        splits: preview.data.splits,
        elevationGain: preview.data.elevationGain,
        calories: preview.data.calories,
        bestEfforts: preview.data.bestEfforts,
        routePreview: preview.data.routePreview,
      });
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
      description="Trim extra GPS points from the start or end of this run. Splits, pace, and distance recalculate automatically."
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
