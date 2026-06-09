import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface TreadmillModeProps {
  elapsed: number;
  formatTime: (s: number) => string;
  onSave: (distance: number) => void;
  onDiscard: () => void;
  /* The same component renders for both `activityType: 'treadmill'`
     (user picked Treadmill in the setup modal) and `'manual'` (GPS
     never locked outdoors and the user chose "Track without GPS").
     Branch only the user-visible copy — the input id stays
     `treadmill-distance` to keep accessibility selectors stable. */
  mode?: "treadmill" | "manual";
}

export default function TreadmillMode({
  elapsed,
  formatTime,
  onSave,
  onDiscard,
  mode = "treadmill",
}: TreadmillModeProps) {
  const [distance, setDistance] = useState("");
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  /* Mode-aware copy. Treadmill users read distance off the
     machine display; manual users (GPS-fallback "Track without
     GPS" path) recall distance covered themselves. The wording
     differs because the source differs — keeping treadmill copy
     in manual mode (or vice versa) reads wrong even when the
     underlying input is identical. The helper text below the
     input nudges the user toward the right action without making
     it feel like a tutorial. */
  const title = mode === "manual" ? "Manual Run" : "Treadmill Run";
  const saveLabel =
    mode === "manual" ? "Save Manual Run" : "Save Treadmill Run";
  const distanceLabel =
    mode === "manual" ? "Distance covered" : "Distance from treadmill";
  const helperCopy =
    mode === "manual"
      ? "Record time now, then enter distance covered."
      : "Enter the distance shown on the treadmill.";

  /* Confirm only when there's data at stake. A long timer running but
     no distance entered still counts (the elapsed time is the user's
     work). A typed distance even with elapsed under 30s also counts.
     Below both thresholds — fresh entry, accidental tap — discard
     immediately so the user isn't gated by a redundant confirm. */
  const hasDataAtStake =
    elapsed >= 30 || (distance !== "" && Number(distance) > 0);
  const handleDiscardClick = () => {
    if (hasDataAtStake) setShowDiscardConfirm(true);
    else onDiscard();
  };

  return (
    // w-full: the parent (Run.tsx) mounts this inside a `flex items-center`
    // row, where a block child shrink-fits to content width — that clipped the
    // distance input + Save button off the right edge at 393px (audit #4).
    // Filling the row keeps everything inside the viewport.
    <div className="w-full space-y-6 px-6">
      <div className="text-center">
        <p className="text-xs text-white/50 uppercase tracking-widest">
          {title}
        </p>
        <p className="text-6xl font-mono tabular-nums font-bold mt-2">
          {formatTime(elapsed)}
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="treadmill-distance" className="text-sm text-white/60">
          {distanceLabel}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="treadmill-distance"
            type="number"
            step={0.01}
            min={0.05}
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            placeholder="0.00"
            /* min-w-0: a flex item defaults to min-width:auto, so flex-1 alone
               can't shrink a number input below its intrinsic width — it
               overflowed the row at 393px. min-w-0 lets it actually flex. */
            className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-center text-2xl font-mono"
          />
          <span className="text-white/60 text-sm">km</span>
        </div>
        {/* Inline validation: empty input shows the helper copy
            (so the user knows what to do); below-floor input shows
            the validation copy (so they know what to fix). */}
        {distance && Number(distance) < 0.05 ? (
          <p className="text-xs text-white/50 mt-1">
            Distance must be at least 0.05km.
          </p>
        ) : (
          <p className="text-xs text-white/40 mt-1">{helperCopy}</p>
        )}
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onSave(Number(distance) * 1000)}
          disabled={!distance || Number(distance) < 0.05}
          /* Disabled state previously dropped the whole button to
             40% opacity, which made the white text unreadable
             against the faded purple. Distinct disabled style
             (grey background, dimmed text) keeps the affordance
             clearly disabled while the label remains legible —
             matches the iOS / app convention for disabled CTAs. */
          className="w-full py-3.5 rounded-xl font-medium transition-colors bg-purple-500 text-white disabled:bg-white/15 disabled:text-white/50 disabled:cursor-not-allowed"
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={handleDiscardClick}
          className="w-full py-2 text-sm text-red-400"
        >
          Discard
        </button>
      </div>
      <ConfirmDialog
        open={showDiscardConfirm}
        title="Discard this run?"
        description="This cannot be undone."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setShowDiscardConfirm(false);
          onDiscard();
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </div>
  );
}
