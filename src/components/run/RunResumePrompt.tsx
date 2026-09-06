/**
 * Phase B3 — chooser shown when an interrupted run snapshot exists in
 * localStorage on mount of /run.
 *
 *   - Resume: rehydrate timer + GPS, jump straight into the stored
 *     phase (active or paused). Suppression of the GPS-loss banner
 *     for ~5s is handled by the caller (Run.tsx owns the ref).
 *   - Start new: clear the stored snapshot and proceed to the
 *     RunSetupModal as if no run had been saved.
 *   - Discard: clear and bail back to home.
 *
 * Pure presentational — caller owns the storage clear + state
 * transitions so the chooser stays trivially testable.
 *
 * Renders via the Dialog primitive's dark + bottom variant (run flow is
 * always dark; bottom-on-mobile keeps the actions thumb-reachable). It's a
 * recoverable choice: Back/Escape leaves the snapshot untouched, while
 * starting over or discarding requires confirmation before clearing it.
 */

import { useState } from "react";
import { ArrowLeft, Play, Plus, Trash2 } from "lucide-react";
import { formatClock } from "@/utils/formatters";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { distanceUnitLabel } from "@/lib/distanceUnits";
import { distanceValue } from "@/lib/runLabels";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";

interface Props {
  /** Stored run's accumulated seconds at write-time. */
  accumulatedSeconds: number;
  /** Stored run's distance in metres (sum of haversine deltas across
   *  the persisted GPS buffer). 0 for treadmill / manual runs. */
  distanceMeters: number;
  /** ms epoch of the original run start. Used for the "started X
   *  hours ago" label. */
  startedAt: number;
  onResume: () => void;
  onStartNew: () => void;
  onDiscard: () => void;
  /** Leave setup without changing the recoverable snapshot. */
  onBack: () => void;
}

function formatElapsed(seconds: number): string {
  return formatClock(Math.floor(seconds));
}

function formatStartedAgo(startedAt: number): string {
  const ms = Date.now() - startedAt;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Started just now";
  if (mins < 60) return `Started ${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (remMins === 0)
    return `Started ${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `Started ${hours}h ${remMins}m ago`;
}

export default function RunResumePrompt({
  accumulatedSeconds,
  distanceMeters,
  startedAt,
  onResume,
  onStartNew,
  onDiscard,
  onBack,
}: Props) {
  const unit = useDistanceUnit();
  const distance = distanceValue(distanceMeters, unit, 2);
  const [pendingAction, setPendingAction] = useState<"new" | "discard" | null>(
    null
  );

  if (pendingAction) {
    return (
      <ConfirmDialog
        open
        overSheet
        title={
          pendingAction === "new"
            ? "Replace previous run?"
            : "Discard previous run?"
        }
        description="The previous run will be cleared from this device without being saved to your history. This cannot be undone."
        confirmLabel={
          pendingAction === "new" ? "Discard and start new" : "Discard run"
        }
        cancelLabel="Keep previous run"
        destructive
        onConfirm={pendingAction === "new" ? onStartNew : onDiscard}
        onCancel={() => setPendingAction(null)}
      />
    );
  }

  return (
    <Dialog
      open
      onClose={onBack}
      title="Resume previous run?"
      description={formatStartedAgo(startedAt)}
      tone="dark"
      position="bottom"
      size="md"
      closeOnBackdrop={false}
      overlayClassName="z-[60]"
      className="z-[60]"
    >
      <div className="space-y-4">
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <div>
            <p
              className="text-micro uppercase tracking-wider"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              Time
            </p>
            <p
              className="font-mono tabular-nums text-xl font-bold"
              style={{ color: "white" }}
            >
              {formatElapsed(accumulatedSeconds)}
            </p>
          </div>
          <div className="text-right">
            <p
              className="text-micro uppercase tracking-wider"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              Distance
            </p>
            <p
              className="font-mono tabular-nums text-xl font-bold"
              style={{ color: "white" }}
            >
              {distance} {distanceUnitLabel(unit)}
            </p>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <Button
            variant="sport"
            size="lg"
            fullWidth
            onClick={onResume}
            leftIcon={<Play size={16} />}
          >
            Resume run
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => setPendingAction("new")}
            className="bg-stage-foreground/10 text-stage-foreground hover:bg-stage-foreground/20"
            leftIcon={<Plus size={16} />}
          >
            Start new run
          </Button>
          <Button
            variant="ghost"
            fullWidth
            onClick={onBack}
            className="text-stage-foreground hover:bg-stage-foreground/10"
            leftIcon={<ArrowLeft size={16} />}
          >
            Back to Run
          </Button>
          <Button
            variant="ghost"
            fullWidth
            onClick={() => setPendingAction("discard")}
            className="text-stage-muted hover:bg-stage-foreground/10"
            leftIcon={<Trash2 size={14} />}
          >
            Discard previous run
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
