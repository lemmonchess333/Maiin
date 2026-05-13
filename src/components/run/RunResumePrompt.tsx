/**
 * Phase B3 — chooser shown when an interrupted run snapshot exists in
 * localStorage on mount of /run. Three branches:
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
 */

import { THEME } from '../../lib/theme';
import { Play, Plus, Trash2 } from 'lucide-react';

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
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatStartedAgo(startedAt: number): string {
  const ms = Date.now() - startedAt;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Started just now';
  if (mins < 60) return `Started ${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (remMins === 0) return `Started ${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `Started ${hours}h ${remMins}m ago`;
}

export default function RunResumePrompt({
  accumulatedSeconds,
  distanceMeters,
  startedAt,
  onResume,
  onStartNew,
  onDiscard,
}: Props) {
  const km = (distanceMeters / 1000).toFixed(2);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-resume-title"
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 space-y-4"
        style={{ background: THEME.bg }}
      >
        <div className="space-y-1.5">
          <h2
            id="run-resume-title"
            className="text-lg font-semibold"
            style={{ color: '#FFFFFF' }}
          >
            Resume previous run?
          </h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {formatStartedAgo(startedAt)}
          </p>
        </div>

        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <div>
            <p className="text-micro uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Time
            </p>
            <p className="font-mono tabular-nums text-xl font-bold" style={{ color: '#FFFFFF' }}>
              {formatElapsed(accumulatedSeconds)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-micro uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Distance
            </p>
            <p className="font-mono tabular-nums text-xl font-bold" style={{ color: '#FFFFFF' }}>
              {km} km
            </p>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
            style={{ background: THEME.running, color: '#FFFFFF' }}
          >
            <Play size={16} aria-hidden="true" />
            Resume run
          </button>
          <button
            type="button"
            onClick={onStartNew}
            className="w-full py-3 rounded-2xl font-medium text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#FFFFFF' }}
          >
            <Plus size={16} aria-hidden="true" />
            Start new run
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="w-full py-2.5 text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
            style={{ color: 'rgba(255,120,120,0.9)' }}
          >
            <Trash2 size={14} aria-hidden="true" />
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
