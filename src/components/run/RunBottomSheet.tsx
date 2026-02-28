import { Drawer } from 'vaul';
import { THEME } from '../../lib/theme';
import { calculatePace, totalElevationGain, estimateRunCalories } from '../../lib/gps';
import type { GPSPoint } from '../../lib/gps';

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
  weightKg: number;
}

export default function RunBottomSheet({
  elapsed, distance, points, formatTime,
  onPause, onLock, isPaused, onResume, onStop,
  weightKg,
}: RunBottomSheetProps) {
  const pace = calculatePace(distance, elapsed);
  const calories = estimateRunCalories(distance, weightKg);
  const elevation = totalElevationGain(points);

  return (
    <Drawer.Root
      open={true}
      dismissible={false}
      modal={false}
      snapPoints={[0.15, 0.5, 0.88]}
      activeSnapPoint={0.5}
    >
      <Drawer.Portal>
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-40 rounded-t-3xl outline-none"
          style={{ backgroundColor: THEME.surface }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* PEEK view: time / distance / pace */}
          <div className="px-6 pb-3">
            <div className="flex items-center justify-between">
              <div className="text-center">
                <p className="text-3xl font-mono tabular-nums font-bold text-white">
                  {formatTime(elapsed)}
                </p>
                <p className="text-[9px] text-white/30 uppercase tracking-wider">Time</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-mono tabular-nums font-bold" style={{ color: THEME.teal }}>
                  {(distance / 1000).toFixed(2)}
                </p>
                <p className="text-[9px] text-white/30 uppercase tracking-wider">km</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-mono tabular-nums font-bold text-white">
                  {pace}
                </p>
                <p className="text-[9px] text-white/30 uppercase tracking-wider">/km</p>
              </div>
            </div>
          </div>

          {/* HALF view: secondary stats */}
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
                <p className="text-lg font-mono tabular-nums text-white/60">{pace}</p>
                <p className="text-[9px] text-white/25">Avg Pace</p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-8 pt-4">
              {!isPaused ? (
                <>
                  <button onClick={onLock}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/15">
                    <span className="text-[10px] text-white/40 font-medium">Lock</span>
                  </button>
                  <button onClick={onPause}
                    className="w-16 h-16 rounded-full bg-white/15 backdrop-blur border-2 border-white/25 flex items-center justify-center active:scale-90 transition-transform">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-7 bg-white rounded-sm" />
                      <div className="w-2.5 h-7 bg-white rounded-sm" />
                    </div>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onTouchStart={() => {
                      const t = setTimeout(onStop, 2000);
                      (window as any).__stopT = t;
                    }}
                    onTouchEnd={() => clearTimeout((window as any).__stopT)}
                    onMouseDown={() => {
                      const t = setTimeout(onStop, 2000);
                      (window as any).__stopT = t;
                    }}
                    onMouseUp={() => clearTimeout((window as any).__stopT)}
                    className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center">
                    <div className="w-6 h-6 bg-red-500 rounded-md" />
                  </button>
                  <button onClick={onResume}
                    className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center active:scale-90 transition-transform shadow-lg shadow-green-500/20">
                    <div className="w-0 h-0 ml-1 border-l-[14px] border-l-white border-y-[9px] border-y-transparent" />
                  </button>
                </>
              )}
            </div>
            {isPaused && (
              <p className="text-center text-[9px] text-white/15 mt-3">Hold stop for 2 seconds to end</p>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
