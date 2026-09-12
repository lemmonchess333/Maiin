import { useState } from "react";
import { THEME } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import {
  distanceIn,
  distanceToMetres,
  type DistanceUnit,
} from "@/lib/distanceUnits";

/**
 * Correct a manually-entered distance.
 *
 * Shared by the invalid-run review and the normal summary. Both need it:
 * InvalidRunReview renders only for sub-threshold and too-fast runs, so on
 * its own it leaves a treadmill run typed as 5 km when it was 6 with no
 * correction path — the number is wrong but not wrong ENOUGH to trip a
 * threshold, and the summary otherwise offers nothing but Save.
 *
 * One copy, so the 0.05-100 km bound (the same floor TreadmillMode uses)
 * cannot drift between the two surfaces.
 */
export default function EditDistance({
  distanceKm,
  onCommit,
  unit,
}: {
  distanceKm: number;
  onCommit: (meters: number) => void;
  unit: DistanceUnit;
}) {
  const [editing, setEditing] = useState(false);
  // Pre-filled with the current distance so the user adjusts rather than
  // re-enters.
  const [editValue, setEditValue] = useState<string>(() =>
    distanceIn(distanceKm * 1000, unit).toFixed(2)
  );
  const editValueNum = Number(editValue);
  const editMeters = distanceToMetres(editValueNum, unit);
  // Round input bounds inward to the hundredth so every offered value is valid.
  const minimum = Math.ceil(distanceIn(50, unit) * 100) / 100;
  const maximum = Math.floor(distanceIn(100000, unit) * 100) / 100;
  const editValid =
    editValue.trim() !== "" &&
    Number.isFinite(editValueNum) &&
    editMeters >= 50 &&
    editMeters <= 100000;

  if (!editing) {
    return (
      <Button
        variant="secondary"
        fullWidth
        onClick={() => {
          setEditValue(distanceIn(distanceKm * 1000, unit).toFixed(2));
          setEditing(true);
        }}
      >
        Edit distance
      </Button>
    );
  }
  return (
    <div className="p-3 rounded-xl border border-border bg-muted/40 space-y-2">
      <label htmlFor="edit-distance" className="text-xs text-muted-foreground">
        Distance ({unit})
      </label>
      <input
        id="edit-distance"
        type="number"
        step="0.01"
        min={minimum}
        max={maximum}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        className="w-full min-h-11 px-3 py-2 rounded-lg bg-background border border-border text-sm text-center font-mono tabular-nums"
      />
      {!editValid && editValue !== "" && (
        <p className="text-xs" style={{ color: THEME.running }}>
          Distance must be between {minimum} {unit} and {maximum} {unit}.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => setEditing(false)}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          variant="sport"
          onClick={() => {
            if (!editValid) return;
            onCommit(editMeters);
            setEditing(false);
          }}
          disabled={!editValid}
          className="flex-1"
        >
          Update
        </Button>
      </div>
    </div>
  );
}
