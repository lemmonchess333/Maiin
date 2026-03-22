import { useState } from 'react';

interface TreadmillModeProps {
  elapsed: number;
  formatTime: (s: number) => string;
  onSave: (distance: number) => void;
  onDiscard: () => void;
}

export default function TreadmillMode({ elapsed, formatTime, onSave, onDiscard }: TreadmillModeProps) {
  const [distance, setDistance] = useState('');

  return (
    <div className="space-y-6 px-6">
      <div className="text-center">
        <p className="text-[10px] text-white/50 uppercase tracking-widest">Treadmill Run</p>
        <p className="text-6xl font-mono tabular-nums font-bold mt-2">{formatTime(elapsed)}</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="treadmill-distance" className="text-sm text-white/60">Distance covered</label>
        <div className="flex items-center gap-2">
          <input
            id="treadmill-distance"
            type="number"
            step={0.01}
            min={0}
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            placeholder="0.00"
            className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-center text-2xl font-mono"
          />
          <span className="text-white/60 text-sm">km</span>
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => onSave(Number(distance) * 1000)}
          disabled={!distance || Number(distance) <= 0}
          className="w-full py-3.5 rounded-xl bg-purple-500 text-white font-medium disabled:opacity-40"
        >
          Save Treadmill Run
        </button>
        <button onClick={onDiscard} className="w-full py-2 text-sm text-red-400">
          Discard
        </button>
      </div>
    </div>
  );
}
