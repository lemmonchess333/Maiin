import { useState } from "react";
import { THEME } from "@/lib/theme";

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
}: {
  distanceKm: number;
  onCommit: (meters: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  // Pre-filled with the current distance so the user adjusts rather than
  // re-enters.
  const [editValue, setEditValue] = useState<string>(() =>
    distanceKm.toFixed(2)
  );
  const editValueNum = Number(editValue);
  const editValid =
    Number.isFinite(editValueNum) &&
    editValueNum >= 0.05 &&
    editValueNum <= 100;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setEditValue(distanceKm.toFixed(2));
          setEditing(true);
        }}
        className="w-full py-2.5 rounded-xl text-sm font-medium bg-muted text-foreground border border-border"
      >
        Edit distance
      </button>
    );
  }
  return (
    <div className="p-3 rounded-xl border border-border bg-muted/40 space-y-2">
      <label htmlFor="edit-distance" className="text-xs text-muted-foreground">
        Distance (km)
      </label>
      <input
        id="edit-distance"
        type="number"
        step="0.01"
        min="0.05"
        max="100"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-center"
      />
      {!editValid && editValue !== "" && (
        <p className="text-xs" style={{ color: THEME.running }}>
          Distance must be between 0.05 km and 100 km.
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="flex-1 py-2 rounded-lg text-xs font-medium bg-muted text-muted-foreground border border-border"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            if (!editValid) return;
            onCommit(editValueNum * 1000);
            setEditing(false);
          }}
          disabled={!editValid}
          className="flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
          style={{ background: THEME.lifting }}
        >
          Update
        </button>
      </div>
    </div>
  );
}
