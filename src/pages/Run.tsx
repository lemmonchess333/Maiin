import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGPS } from '../hooks/useGPS';
import { useRunTimer } from '../hooks/useRunTimer';
import { useWakeLock } from '../hooks/useWakeLock';
import { calculatePace, calculateSplits, totalElevationGain, estimateRunCalories } from '../lib/gps';
import RunMap from '../components/run/RunMap';

type RunPhase = 'waiting' | 'countdown' | 'active' | 'paused' | 'finished';

export default function Run() {
  const navigate = useNavigate();
  const gps = useGPS();
  const timer = useRunTimer();
  const wakeLock = useWakeLock();
  const [phase, setPhase] = useState<RunPhase>('waiting');
  const [locked, setLocked] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [autoPaused, setAutoPaused] = useState(false);
  const lastAnnouncedKm = useRef(0);
  const autoPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speak = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.9;
      speechSynthesis.speak(u);
    }
  }, []);

  const handleStart = async () => {
    await wakeLock.request();
    setPhase('countdown');
    setCountdown(3);
  };

  // 3-2-1-Go countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      setPhase('active');
      gps.start();
      timer.start();
      speak('Go!');
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // Km audio cues
  useEffect(() => {
    if (phase !== 'active') return;
    const currentKm = Math.floor(gps.distance / 1000);
    if (currentKm > lastAnnouncedKm.current && currentKm > 0) {
      lastAnnouncedKm.current = currentKm;
      const pace = calculatePace(gps.distance, timer.elapsed);
      speak(`${currentKm} kilometre${currentKm > 1 ? 's' : ''}. Pace: ${pace} per K.`);
    }
  }, [gps.distance, timer.elapsed, phase]);

  // Auto-pause when stationary
  useEffect(() => {
    if (phase !== 'active') return;
    const speed = gps.currentPoint?.speed;
    if (speed !== null && speed !== undefined && speed < 0.5 && !autoPaused) {
      autoPauseTimer.current = setTimeout(() => {
        timer.pause();
        setAutoPaused(true);
      }, 5000);
    } else if (autoPaused && speed !== null && speed !== undefined && speed >= 1.0) {
      timer.resume();
      setAutoPaused(false);
    }
    return () => { if (autoPauseTimer.current) clearTimeout(autoPauseTimer.current); };
  }, [gps.currentPoint, phase, autoPaused]);

  const handlePause = () => { timer.pause(); gps.stop(); setPhase('paused'); };
  const handleResume = () => { gps.start(); timer.resume(); setPhase('active'); };
  const handleStop = () => {
    timer.pause(); gps.stop(); wakeLock.release(); setPhase('finished');
    navigate('/run-summary', { state: {
      points: gps.getPoints(), distance: gps.distance, elapsed: timer.elapsed,
      splits: calculateSplits(gps.getPoints()),
      elevationGain: totalElevationGain(gps.getPoints()),
    }});
  };

  // Locked screen overlay
  if (locked && (phase === 'active' || phase === 'paused')) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center"
        onDoubleClick={() => setLocked(false)}>
        <p className="text-white/30 text-xs mb-8">Double-tap to unlock</p>
        <p className="text-5xl font-mono tabular-nums text-white/20 font-bold">
          {timer.formatTime(timer.elapsed)}
        </p>
        <p className="text-2xl font-mono tabular-nums text-white/15 mt-2">
          {(gps.distance / 1000).toFixed(2)} km
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            gps.gpsAccuracy && gps.gpsAccuracy < 10 ? 'bg-green-400' :
            gps.gpsAccuracy && gps.gpsAccuracy < 20 ? 'bg-yellow-400' : 'bg-red-400'
          }`} />
          <span className="text-xs text-white/40">
            GPS {gps.gpsAccuracy ? `±${Math.round(gps.gpsAccuracy)}m` : '...'}
          </span>
        </div>
        {(phase === 'active' || phase === 'paused') && (
          <button onClick={() => setLocked(true)} className="p-2 text-white/40 text-lg">🔒</button>
        )}
      </div>

      {/* WAITING */}
      {phase === 'waiting' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <p className="text-2xl font-bold mb-2">Ready to Run?</p>
          <p className="text-white/40 text-sm mb-8">Keep your screen on during the run</p>
          {!wakeLock.isSupported && (
            <p className="text-yellow-400/80 text-xs mb-4 text-center px-8">
              Wake Lock not supported — your screen may dim during the run.
            </p>
          )}
          <button onClick={handleStart}
            className="w-32 h-32 rounded-full bg-green-500 flex items-center justify-center text-3xl font-bold active:scale-95 transition-transform shadow-lg shadow-green-500/30">
            GO
          </button>
          <button onClick={() => navigate(-1)} className="mt-8 text-white/30 text-sm">Cancel</button>
        </div>
      )}

      {/* COUNTDOWN */}
      {phase === 'countdown' && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-9xl font-bold animate-pulse">{countdown || 'GO!'}</span>
        </div>
      )}

      {/* ACTIVE / PAUSED */}
      {(phase === 'active' || phase === 'paused') && (
        <>
          <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-6">
            <div className="text-center">
              <p className="text-[10px] text-white/30 uppercase tracking-widest">Time</p>
              <p className="text-6xl font-mono tabular-nums font-bold leading-none">
                {timer.formatTime(timer.elapsed)}
              </p>
            </div>

            <div className="flex items-start justify-center gap-14">
              <div className="text-center">
                <p className="text-[10px] text-white/30 uppercase tracking-widest">Distance</p>
                <p className="text-4xl font-mono tabular-nums font-bold leading-none">
                  {(gps.distance / 1000).toFixed(2)}
                </p>
                <p className="text-[10px] text-white/20 mt-0.5">km</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-white/30 uppercase tracking-widest">Pace</p>
                <p className="text-4xl font-mono tabular-nums font-bold leading-none">
                  {calculatePace(gps.distance, timer.elapsed)}
                </p>
                <p className="text-[10px] text-white/20 mt-0.5">/km</p>
              </div>
            </div>

            <div className="flex items-center gap-8 text-white/40">
              <div className="text-center">
                <p className="text-[10px]">Calories</p>
                <p className="text-base font-mono tabular-nums">{estimateRunCalories(gps.distance, 70)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px]">Elevation</p>
                <p className="text-base font-mono tabular-nums">{totalElevationGain(gps.points)}m</p>
              </div>
            </div>

            <button onClick={() => setShowMap(!showMap)} className="text-xs text-purple-400">
              {showMap ? 'Hide Map' : 'Show Map'}
            </button>
            {showMap && (
              <div className="w-full border border-white/10 rounded-xl overflow-hidden">
                <RunMap points={gps.points} currentPoint={gps.currentPoint} height="h-40" />
              </div>
            )}
          </div>

          {autoPaused && (
            <div className="text-center py-2 bg-yellow-500/10">
              <p className="text-xs text-yellow-400/80">Auto-paused · start moving to resume</p>
            </div>
          )}

          <div className="px-6 py-8 pb-10">
            {phase === 'active' ? (
              <div className="flex justify-center">
                <button onClick={handlePause}
                  className="w-20 h-20 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center active:scale-95">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-7 bg-white rounded-sm" />
                    <div className="w-2.5 h-7 bg-white rounded-sm" />
                  </div>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-10">
                <button
                  onTouchStart={() => { stopTimer.current = setTimeout(handleStop, 2000); }}
                  onTouchEnd={() => { if (stopTimer.current) clearTimeout(stopTimer.current); }}
                  onMouseDown={() => { stopTimer.current = setTimeout(handleStop, 2000); }}
                  onMouseUp={() => { if (stopTimer.current) clearTimeout(stopTimer.current); }}
                  className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/60 flex items-center justify-center">
                  <div className="w-6 h-6 bg-red-500 rounded-sm" />
                </button>
                <button onClick={handleResume}
                  className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center active:scale-95 shadow-lg shadow-green-500/20">
                  <div className="w-0 h-0 border-l-[16px] border-l-white border-y-[10px] border-y-transparent ml-1.5" />
                </button>
              </div>
            )}
            {phase === 'paused' && (
              <p className="text-center text-[10px] text-white/20 mt-4">Hold stop for 2 seconds to end</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
