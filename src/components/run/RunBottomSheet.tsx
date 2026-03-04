import { useMemo, useState, useRef, useEffect, type ReactNode } from 'react';
import { THEME } from '../../lib/theme';
import { calculatePace, totalElevationGain, estimateRunCalories, calculateSplits } from '../../lib/gps';
import type { GPSPoint, Split } from '../../lib/gps';

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

// Sheet height as fraction of viewport: full, mid, compact
const SNAPS: [number, number, number] = [0.13, 0.4, 0.91];
const HOLD_MS = 2000;

function haptic(type: 'light' | 'medium' | 'heavy') {
  if (!navigator.vibrate) return;
  navigator.vibrate(type === 'light' ? 12 : type === 'medium' ? 35 : 65);
}

// ── Hold-to-stop with animated SVG ring ──────────────────────────────────────
function HoldStop({ onStop }: { onStop: () => void }) {
  const [progress, setProgress] = useState(0);
  const [pressing, setPressing] = useState(false);
  const raf = useRef<number | null>(null);
  const t0 = useRef<number | null>(null);
  const R = 30;
  const C = 2 * Math.PI * R;

  const begin = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressing(true);
    haptic('light');
    t0.current = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0.current!) / HOLD_MS, 1);
      setProgress(p);
      if (p < 1) { raf.current = requestAnimationFrame(tick); }
      else { haptic('heavy'); onStop(); }
    };
    raf.current = requestAnimationFrame(tick);
  };

  const cancel = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    setPressing(false);
    setProgress(0);
    t0.current = null;
  };

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onPointerDown={begin}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        style={{ userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none',
          transform: pressing ? 'scale(0.9)' : 'scale(1)',
          transition: pressing ? 'transform 0.06s' : 'transform 0.25s ease' }}
        className="relative w-[76px] h-[76px] flex items-center justify-center"
      >
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 76 76" width="76" height="76">
          {/* Track */}
          <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(239,68,68,0.18)" strokeWidth="3.5" />
          {/* Fill ring */}
          {progress > 0 && (
            <circle cx="38" cy="38" r={R} fill="none" stroke="#EF4444" strokeWidth="3.5"
              strokeDasharray={`${C * progress} ${C}`} strokeLinecap="round" />
          )}
        </svg>
        {/* Inner button */}
        <div style={{
          width: 54, height: 54, borderRadius: '50%',
          background: pressing ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.12)',
          border: '2px solid #EF4444',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.12s',
        }}>
          <div style={{
            width: 20, height: 20, background: '#EF4444',
            borderRadius: pressing ? '50%' : 5,
            transition: 'border-radius 0.18s',
          }} />
        </div>
      </button>
      <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em' }}>
        {pressing ? 'RELEASE TO CANCEL' : 'HOLD TO STOP'}
      </p>
    </div>
  );
}

// ── Live splits strip (last 3) ────────────────────────────────────────────────
function SplitsStrip({ splits }: { splits: Split[] }) {
  if (splits.length === 0) return null;
  const last3 = splits.slice(-3);
  // Best pace across all splits to determine colour
  const bestPace = Math.min(...splits.map(s => s.paceSeconds));

  return (
    <div className="flex gap-2 justify-center mt-1">
      {last3.map((s, i) => {
        const isBest = s.paceSeconds === bestPace;
        const isFast = s.paceSeconds < (splits.reduce((a, b) => a + b.paceSeconds, 0) / splits.length) - 5;
        const color = isBest ? THEME.teal : isFast ? THEME.success : 'rgba(255,255,255,0.5)';
        return (
          <div key={i} className="text-center px-3 py-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
              {s.pace}
            </p>
            <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>km {s.km}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Current km progress bar ───────────────────────────────────────────────────
function KmProgress({ distance }: { distance: number }) {
  const kmDone = Math.floor(distance / 1000);
  const progress = (distance % 1000) / 1000;
  const next = kmDone + 1;
  return (
    <div className="flex items-center gap-2 px-1">
      <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {kmDone}km
      </p>
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${THEME.teal}, ${THEME.brand})` }} />
      </div>
      <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 28, fontVariantNumeric: 'tabular-nums' }}>
        {next}km
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RunBottomSheet({
  elapsed, distance, points, formatTime,
  onPause, onLock, isPaused, onResume, onStop,
  intervalDisplay, weightKg,
}: RunBottomSheetProps) {
  const [snapIdx, setSnapIdx] = useState<0 | 1 | 2>(2);
  const dragY = useRef<number | null>(null);
  const isExpanded = snapIdx === 2;

  const pace = calculatePace(distance, elapsed);
  const calories = estimateRunCalories(distance, weightKg);
  const elevation = totalElevationGain(points);
  const splits = useMemo(() => calculateSplits(points), [points]);
  const sheetTop = `${(1 - SNAPS[snapIdx]) * 100}vh`;

  const dragStart = (y: number) => { dragY.current = y; };
  const dragEnd = (y: number) => {
    if (dragY.current === null) return;
    const d = y - dragY.current;
    dragY.current = null;
    if (d > 55 && snapIdx > 0) { setSnapIdx((s) => (s - 1) as 0|1|2); haptic('light'); }
    else if (d < -55 && snapIdx < 2) { setSnapIdx((s) => (s + 1) as 0|1|2); haptic('light'); }
  };

  return (
    <>
      {/* Tap map to re-expand */}
      {!isExpanded && (
        <div className="fixed inset-0 z-30" style={{ bottom: `${SNAPS[snapIdx] * 100}vh` }}
          onClick={() => { setSnapIdx(2); haptic('light'); }} />
      )}

      <div className="fixed left-0 right-0 bottom-0 z-40 flex flex-col rounded-t-[28px]"
        style={{
          top: sheetTop,
          background: `linear-gradient(180deg, ${THEME.surface} 0%, ${THEME.bg} 100%)`,
          transition: 'top 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          boxShadow: '0 -12px 60px rgba(0,0,0,0.7)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing select-none flex-shrink-0"
          onMouseDown={e => dragStart(e.clientY)} onMouseUp={e => dragEnd(e.clientY)}
          onTouchStart={e => dragStart(e.touches[0].clientY)}
          onTouchEnd={e => dragEnd(e.changedTouches[0].clientY)}
        >
          <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        {/* ── EXPANDED VIEW ── */}
        {isExpanded && (
          <div className="flex-1 flex flex-col px-6 pb-6 overflow-hidden">
            {/* Primary stats */}
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              {/* Time — hero number */}
              <div className="text-center">
                <p style={{
                  fontSize: 68, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  fontFamily: 'monospace', color: THEME.teal, lineHeight: 1,
                  letterSpacing: '-2px', textShadow: `0 0 40px ${THEME.teal}55`
                }}>
                  {formatTime(elapsed)}
                </p>
                <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.12em', marginTop: 4 }}>TIME</p>
              </div>

              {/* Distance + Pace */}
              <div className="flex gap-12 items-end">
                <div className="text-center">
                  <p style={{ fontSize: 46, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace', lineHeight: 1 }}>
                    {(distance / 1000).toFixed(2)}
                  </p>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.12em', marginTop: 3 }}>KM</p>
                </div>
                <div className="text-center">
                  <p style={{ fontSize: 46, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace', lineHeight: 1 }}>
                    {pace}
                  </p>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.12em', marginTop: 3 }}>/KM</p>
                </div>
              </div>

              {/* km progress bar */}
              {distance > 0 && <KmProgress distance={distance} />}

              {/* Live splits (last 3) */}
              <SplitsStrip splits={splits} />
            </div>

            {/* Secondary stats pill */}
            <div className="flex items-center justify-around py-3 mb-5 rounded-2xl flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-center">
                <p style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.65)', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>{calories}</p>
                <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', marginTop: 2 }}>CAL</p>
              </div>
              <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)' }} />
              <div className="text-center">
                <p style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.65)', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>{elevation}m</p>
                <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', marginTop: 2 }}>ELEV</p>
              </div>
              <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)' }} />
              <div className="text-center">
                <p style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.65)', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>{splits.length}</p>
                <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', marginTop: 2 }}>SPLITS</p>
              </div>
            </div>

            {intervalDisplay}

            {/* Controls */}
            {!isPaused ? (
              <div className="flex items-center justify-center gap-10 flex-shrink-0">
                {/* Lock */}
                <div className="flex flex-col items-center gap-2">
                  <button onClick={() => { onLock(); haptic('light'); }}
                    className="w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.14)' }}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </button>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em' }}>LOCK</p>
                </div>

                {/* Pause — big centre */}
                <div className="flex flex-col items-center gap-2">
                  <button onClick={() => { onPause(); haptic('medium'); }}
                    className="w-[76px] h-[76px] rounded-full flex items-center justify-center active:scale-[0.88] transition-transform"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '2.5px solid rgba(255,255,255,0.28)',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.4)' }}>
                    <div className="flex gap-[7px]">
                      <div style={{ width: 11, height: 30, background: 'white', borderRadius: 6 }} />
                      <div style={{ width: 11, height: 30, background: 'white', borderRadius: 6 }} />
                    </div>
                  </button>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em' }}>PAUSE</p>
                </div>

                {/* Spacer */}
                <div className="w-14 h-14" />
              </div>
            ) : (
              <div className="flex items-center justify-center gap-12 flex-shrink-0">
                <HoldStop onStop={onStop} />

                {/* Resume */}
                <div className="flex flex-col items-center gap-2">
                  <button onClick={() => { onResume(); haptic('medium'); }}
                    className="w-[76px] h-[76px] rounded-full flex items-center justify-center active:scale-[0.88] transition-transform"
                    style={{ background: THEME.teal,
                      boxShadow: `0 0 32px ${THEME.teal}60, 0 8px 24px rgba(0,0,0,0.4)` }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                      <polygon points="6,3 20,12 6,21" />
                    </svg>
                  </button>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em' }}>RESUME</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── COLLAPSED BAR ── */}
        {!isExpanded && (
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
            <div className="text-center">
              <p style={{ fontSize: 22, fontWeight: 700, color: 'white', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
                {formatTime(elapsed)}
              </p>
              <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>TIME</p>
            </div>
            <div className="text-center">
              <p style={{ fontSize: 22, fontWeight: 700, color: THEME.teal, fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
                {(distance / 1000).toFixed(2)}
              </p>
              <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>KM</p>
            </div>
            <div className="text-center">
              <p style={{ fontSize: 22, fontWeight: 700, color: 'white', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>{pace}</p>
              <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>/KM</p>
            </div>
            <button
              onClick={() => { isPaused ? onResume() : onPause(); haptic('medium'); }}
              className="w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: isPaused ? THEME.teal : 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.18)' }}>
              {isPaused
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="6,3 20,12 6,21" /></svg>
                : <div className="flex gap-1"><div style={{ width: 5, height: 18, background: 'white', borderRadius: 3 }} /><div style={{ width: 5, height: 18, background: 'white', borderRadius: 3 }} /></div>
              }
            </button>
          </div>
        )}
      </div>
    </>
  );
}