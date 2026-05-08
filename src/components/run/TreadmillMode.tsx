import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

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
  mode?: 'treadmill' | 'manual';
}

export default function TreadmillMode({ elapsed, formatTime, onSave, onDiscard, mode = 'treadmill' }: TreadmillModeProps) {
  const [distance, setDistance] = useState('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const title = mode === 'manual' ? 'Manual Run' : 'Treadmill Run';
  const saveLabel = mode === 'manual' ? 'Save Manual Run' : 'Save Treadmill Run';

  /* Confirm only when there's data at stake. A long timer running but
     no distance entered still counts (the elapsed time is the user's
     work). A typed distance even with elapsed under 30s also counts.
     Below both thresholds — fresh entry, accidental tap — discard
     immediately so the user isn't gated by a redundant confirm. */
  const hasDataAtStake = elapsed >= 30 || (distance !== '' && Number(distance) > 0);
  const handleDiscardClick = () => {
    if (hasDataAtStake) setShowDiscardConfirm(true);
    else onDiscard();
  };

  return (
    <div className="space-y-6 px-6">
      <div className="text-center">
        <p className="text-xs text-white/50 uppercase tracking-widest">{title}</p>
        <p className="text-6xl font-mono tabular-nums font-bold mt-2">{formatTime(elapsed)}</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="treadmill-distance" className="text-sm text-white/60">Distance covered</label>
        <div className="flex items-center gap-2">
          <input
            id="treadmill-distance"
            type="number"
            step={0.01}
            min={0.05}
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            placeholder="0.00"
            className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-center text-2xl font-mono"
          />
          <span className="text-white/60 text-sm">km</span>
        </div>
        {/* 50m floor matches MIN_TREADMILL_DISTANCE_KM in
            src/lib/runGuards.ts. Defending at the input means users
            see feedback immediately instead of after they tap Save and
            land in InvalidRunReview. Empty input shows nothing — only
            below-floor entries trigger the message. */}
        {distance && Number(distance) < 0.05 && (
          <p className="text-xs text-white/50 mt-1">
            Distance must be at least 0.05km.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <button
          onClick={() => onSave(Number(distance) * 1000)}
          disabled={!distance || Number(distance) < 0.05}
          className="w-full py-3.5 rounded-xl bg-purple-500 text-white font-medium disabled:opacity-40"
        >
          {saveLabel}
        </button>
        <button onClick={handleDiscardClick} className="w-full py-2 text-sm text-red-400">
          Discard
        </button>
      </div>
      <ConfirmDialog
        open={showDiscardConfirm}
        title="Discard this run?"
        description="This cannot be undone."
        confirmLabel="Discard"
        destructive
        onConfirm={() => { setShowDiscardConfirm(false); onDiscard(); }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </div>
  );
}
