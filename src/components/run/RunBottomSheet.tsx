import { useMemo, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { THEME } from '../../lib/theme';
import { calculatePace, totalElevationGain, estimateRunCalories } from '../../lib/gps';
import type { GPSPoint } from '../../lib/gps';

function haptic(pattern: 'light' | 'medium' | 'heavy' | 'success') {
  if (!navigator.vibrate) return;
  if (pattern === 'light') navigator.vibrate(10);
  if (pattern === 'medium') navigator.vibrate(30);
  if (pattern === 'heavy') navigator.vibrate(50);
  if (pattern === 'success') navigator.vibrate([30, 50, 30]);
}

/** Hold-to-stop button with circular progress ring */
function HoldToStopButton({ onStop }: { onStop: () => void }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const HOLD_DURATION = 2000;

  const startHold = useCallback(() => {
    haptic('medium');
    setHolding(true);
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(elapsed / HOLD_DURATION, 1);
      setProgress(pct);
      if (pct >= 1) {
        haptic('success');
        onStop();
        clearInterval(timerRef.current!);
      }
    }, 16);
  }, [onStop]);

  const cancelHold = useCallback(() => {
    setHolding(false);
    setProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const circumference = 2 * Math.PI * 30;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="relative flex flex-col items-center">
      {/* SVG progress ring */}
      <svg className="absolute -inset-1 w-[72px] h-[72px]" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(239,68,68,0.15)" strokeWidth="3" />
        <circle
          cx="36" cy="36" r="30" fill="none"
          stroke={THEME.danger}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-[16ms] linear"
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
        />
      </svg>
      <button
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
        onTouchCancel={cancelHold}
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        className={`w-16 h-16 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center transition-all ${
          holding ? 'scale-95 border-red-500/60 bg-red-500/10' : 'active:scale-95'
        }`}
      >
        <div className="w-5 h-5 bg-red-400 rounded-sm" />
      </button>
      <span className="text-[9px] text-white/30 mt-1.5">Stop</span>
    </div>
  );
}

interface RunBottomSheetProps {
  elapsed: number;
  distance: number;
  points: GPSPoint[];
  formatTime: (s: number) => string;
  onPause: () => void;
  onLock: () => void;
  isPaused: boolean;
  onResume: () => void;
  onStop: () => void;
  intervalDisplay?: ReactNode;
  weightKg: number;
}

const snapPoints = [0.15, 0.5, 0.88] as const;

export default function RunBottomSheet({
  elapsed,
  distance,
  points,
  formatTime,
  onPause,
  onLock,
  isPaused,
  onResume,
  onStop,
  intervalDisplay,
  weightKg,
}: RunBottomSheetProps) {
  const [snap, setSnap] = useState<number>(1);
  const [startY, setStartY] = useState<number | null>(null);

  const pace = calculatePace(distance, elapsed);
  const calories = estimateRunCalories(distance, weightKg);
  const elevation = totalElevationGain(points);
  const top = useMemo(() => `${(1 - snapPoints[snap]) * 100}%`, [snap]);

  const handleStart = (clientY: number) => setStartY(clientY);
  const handleEnd = (clientY: number) => {
    if (startY == null) return;
    const diff = clientY - startY;
    if (diff > 30 && snap > 0) setSnap((s) => s - 1);
    if (diff < -30 && snap < snapPoints.length - 1) setSnap((s) => s + 1);
    setStartY(null);
  };

  return (
    <div
      className="fixed left-0 right-0 z-40 rounded-t-3xl outline-none transition-[top] duration-200"
      style={{ backgroundColor: THEME.surface, top }}
    >
      <div
        className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => handleStart(e.clientY)}
        onMouseUp={(e) => handleEnd(e.clientY)}
        onTouchStart={(e) => handleStart(e.touches[0].clientY)}
        onTouchEnd={(e) => handleEnd(e.changedTouches[0].clientY)}
      >
        <div className="w-10 h-1 rounded-full bg-white/20" />
      </div>

      <div className="px-6 pb-3">
        <div className="flex items-center justify-between">
          <div className="text-center">
            <p className="text-3xl font-mono tabular-nums font-bold text-white">{formatTime(elapsed)}</p>
            <p className="text-[9px] text-white/30 uppercase tracking-wider">Time</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-mono tabular-nums font-bold" style={{ color: THEME.teal }}>
              {(distance / 1000).toFixed(2)}
            </p>
            <p className="text-[9px] text-white/30 uppercase tracking-wider">km</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-mono tabular-nums font-bold text-white">{pace}</p>
            <p className="text-[9px] text-white/30 uppercase tracking-wider">/km</p>
          </div>
        </div>
      </div>

      <div className="px-6 pb-4">
        <div className="flex items-center justify-around py-3 border-t border-white/5">
          <div className="text-center">
            <p className="text-lg font-mono tabular-nums text-white/60">{calories}</p>
            <p className="text-[9px] text-white/25">Calories</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-mono tabular-nums text-white/60">{elevation}m</p>
            <p className="text-[9px] text-white/25">Elevation</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-mono tabular-nums text-white/60">{calculatePace(distance, elapsed)}</p>
            <p className="text-[9px] text-white/25">Avg Pace</p>
          </div>
        </div>

        {intervalDisplay}

        <div className="flex items-center justify-center gap-8 pt-4">
          {!isPaused ? (
            <>
              <div className="flex flex-col items-center">
                <button
                  onClick={() => { haptic('light'); onLock(); }}
                  className="w-12 h-12 rounded-full bg-white/10 border border-white/15 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </button>
                <span className="text-[9px] text-white/30 mt-1.5">Lock</span>
              </div>
              <div className="flex flex-col items-center">
                <button
                  onClick={() => { haptic('medium'); onPause(); }}
                  className="w-16 h-16 rounded-full bg-white/15 backdrop-blur border-2 border-white/25 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <div className="flex gap-1.5"><div className="w-2.5 h-7 bg-white rounded-sm" /><div className="w-2.5 h-7 bg-white rounded-sm" /></div>
                </button>
                <span className="text-[9px] text-white/30 mt-1.5">Pause</span>
              </div>
            </>
          ) : (
            <>
              <HoldToStopButton onStop={onStop} />
              <div className="flex flex-col items-center">
                <button
                  onClick={() => { haptic('medium'); onResume(); }}
                  className="w-16 h-16 rounded-full bg-white/15 backdrop-blur border-2 border-white/25 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <div className="w-0 h-0 ml-1 border-l-[14px] border-l-white border-y-[9px] border-y-transparent" />
                </button>
                <span className="text-[9px] text-white/30 mt-1.5">Resume</span>
              </div>
            </>
          )}
        </div>
        {isPaused && <p className="text-center text-[9px] text-white/20 mt-3">Hold stop to end run</p>}
      </div>
    </div>
  );
}
