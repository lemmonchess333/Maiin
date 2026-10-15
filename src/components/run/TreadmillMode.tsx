import { useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { RunControlButton } from "@/components/ui/RunControlButton";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { distanceIn, distanceUnitLabel } from "@/lib/distanceUnits";
import {
  manualDistanceMetres,
  type ManualDistanceDraft,
} from "@/lib/manualDistanceDraft";
import { THEME } from "@/lib/theme";

interface TreadmillModeProps {
  elapsed: number;
  formatTime: (s: number) => string;
  onSave: (distance: number) => void;
  onDiscard: () => void;
  distanceDraft: ManualDistanceDraft | null;
  onDistanceDraftChange: (draft: ManualDistanceDraft) => void;
  sessionGuidance?: ReactNode;
  isPaused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  /* The same component renders for both a treadmill run (the setup's
     "On a treadmill" switch, `place: 'treadmill'`, whatever the run's
     type, Pgm8) and `activityType: 'manual'` (GPS never locked outdoors
     and the user chose "Track without GPS").
     Branch only the user-visible copy — the input id stays
     `treadmill-distance` to keep accessibility selectors stable. */
  mode?: "treadmill" | "manual";
}

export default function TreadmillMode({
  elapsed,
  formatTime,
  onSave,
  onDiscard,
  distanceDraft,
  onDistanceDraftChange,
  sessionGuidance,
  isPaused = false,
  onPause,
  onResume,
  mode = "treadmill",
}: TreadmillModeProps) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const preferredUnit = useDistanceUnit();
  const distance = distanceDraft?.raw ?? "";
  // Never reinterpret nonempty restored text under a changed preference.
  const unit = distance ? distanceDraft!.unit : preferredUnit;
  const unitLabel = distanceUnitLabel(unit);
  const distanceMetres = manualDistanceMetres(distance, unit);
  // Same physical bounds as the summary's EditDistance. Offer hundredths
  // inside those bounds, independent of the runner's display preference.
  const minimum = Math.ceil(distanceIn(50, unit) * 100) / 100;
  const maximum = Math.floor(distanceIn(100000, unit) * 100) / 100;
  const distanceValid = distanceMetres !== null;

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
  const hasDataAtStake = elapsed >= 30 || distance.trim() !== "";
  const saveDisabled = !distanceValid;
  const handleDiscardClick = () => {
    if (hasDataAtStake) setShowDiscardConfirm(true);
    else onDiscard();
  };

  return (
    <div className="w-full max-w-lg mx-auto space-y-6 px-4 py-6 pb-[calc(1.5rem+var(--safe-bottom))]">
      <div className="text-center">
        <p className="text-xs text-white/50 uppercase tracking-widest">
          {title}
        </p>
        <p
          role="timer"
          aria-label="Elapsed time"
          className="text-6xl font-mono tabular-nums font-bold mt-2"
        >
          {formatTime(elapsed)}
        </p>
        {onPause && onResume && (
          <div className="flex justify-center mt-4">
            <RunControlButton
              size="sm"
              variant={isPaused ? "primary" : "neutral"}
              aria-label={isPaused ? "Resume run" : "Pause run"}
              label={isPaused ? "Resume" : "Pause"}
              icon={
                isPaused ? (
                  <Play aria-hidden="true" />
                ) : (
                  <Pause aria-hidden="true" />
                )
              }
              onClick={isPaused ? onResume : onPause}
            />
          </div>
        )}
      </div>

      {sessionGuidance}

      <div className="space-y-2">
        <label htmlFor="treadmill-distance" className="text-sm text-white/60">
          {distanceLabel}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="treadmill-distance"
            type="text"
            inputMode="decimal"
            value={distance}
            onChange={(e) =>
              onDistanceDraftChange({ version: 1, raw: e.target.value, unit })
            }
            placeholder="0.00"
            aria-describedby="treadmill-distance-help treadmill-distance-unit"
            aria-invalid={distance !== "" && !distanceValid ? true : undefined}
            /* min-w-0: a flex item defaults to min-width:auto, so flex-1 alone
               can't shrink a number input below its intrinsic width — it
               overflowed the row at 393px. min-w-0 lets it actually flex. */
            className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-center text-2xl font-mono"
          />
          <span id="treadmill-distance-unit" className="text-white/60 text-sm">
            {unitLabel}
          </span>
        </div>
        {/* Inline validation: empty input shows the helper copy
            (so the user knows what to do); below-floor input shows
            the validation copy (so they know what to fix). */}
        {distance && !distanceValid ? (
          <p
            id="treadmill-distance-help"
            className="text-xs text-white/70 mt-1"
          >
            Distance must be between {minimum} {unitLabel} and {maximum}{" "}
            {unitLabel}.
          </p>
        ) : (
          <p
            id="treadmill-distance-help"
            className="text-xs text-white/70 mt-1"
          >
            {helperCopy}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Button
          variant="sport"
          size="lg"
          fullWidth
          onClick={() => {
            if (distanceMetres !== null) onSave(distanceMetres);
          }}
          disabled={saveDisabled}
          className="disabled:opacity-100 disabled:bg-white/15 disabled:text-white/50"
        >
          {saveLabel}
        </Button>
        <Button
          variant="ghost"
          fullWidth
          onClick={handleDiscardClick}
          /* Fixed destructive red for the same always-dark reason —
             THEME.swipe.destructive is the one fixed destructive value
             in the palette (≈5.4:1 on this ground; the old red-400 was
             raw Tailwind palette, and a theme-aware token would hand
             light-mode users the dark-red light step on black). */
          className="hover:bg-white/10"
          style={{ color: THEME.swipe.destructive }}
        >
          Discard
        </Button>
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
