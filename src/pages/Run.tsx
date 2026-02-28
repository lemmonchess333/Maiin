import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useGPS } from '../hooks/useGPS';
import { useRunTimer } from '../hooks/useRunTimer';
import { useWakeLock } from '../hooks/useWakeLock';
import { calculatePace, calculateSplits, totalElevationGain } from '../lib/gps';
import { THEME } from '../lib/theme';
import RunMap from '../components/run/RunMap';
import RunBottomSheet from '../components/run/RunBottomSheet';

type RunPhase = 'waiting' | 'countdown' | 'active' | 'paused' | 'finished';

export default function Run() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const gps = useGPS();
  const timer = useRunTimer();
  const wakeLock = useWakeLock();
  const [phase, setPhase] = useState<RunPhase>('waiting');
  const [locked, setLocked] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [autoPaused, setAutoPaused] = useState(false);
  const lastAnnouncedKm = useRef(0);
  const autoPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    <div className="fixed inset-0 z-50" style={{ backgroundColor: THEME.bg }}>
      {/* WAITING */}
      {phase === 'waiting' && (
        <div className="h-full flex flex-col items-center justify-center px-6 text-white">
          <div className="absolute top-3 left-4 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              gps.gpsAccuracy && gps.gpsAccuracy < 10 ? 'bg-green-400' :
              gps.gpsAccuracy && gps.gpsAccuracy < 20 ? 'bg-yellow-400' : 'bg-red-400'
            }`} />
            <span className="text-xs text-white/40">
              GPS {gps.gpsAccuracy ? `±${Math.round(gps.gpsAccuracy)}m` : '...'}
            </span>
          </div>

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
        <div className="h-full flex items-center justify-center text-white">
          <span className="text-9xl font-bold animate-pulse">{countdown || 'GO!'}</span>
        </div>
      )}

      {/* ACTIVE / PAUSED — Full-screen map + bottom sheet */}
      {(phase === 'active' || phase === 'paused') && (
        <>
          {/* GPS indicator — top left */}
          <div className="absolute top-3 left-4 z-50 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              gps.gpsAccuracy && gps.gpsAccuracy < 10 ? 'bg-green-400' :
              gps.gpsAccuracy && gps.gpsAccuracy < 20 ? 'bg-yellow-400' : 'bg-red-400'
            }`} />
            <span className="text-xs text-white/40">
              GPS {gps.gpsAccuracy ? `±${Math.round(gps.gpsAccuracy)}m` : '...'} · {gps.points.length} pts
            </span>
          </div>

          {/* Full-screen map background */}
          <RunMap
            points={gps.points}
            currentPoint={gps.currentPoint}
            interactive={false}
            height="h-full"
            className="absolute inset-0"
          />

          {/* Auto-pause banner */}
          {autoPaused && (
            <div className="absolute top-12 left-4 right-4 z-50 text-center py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-xs text-yellow-400/80">Auto-paused · start moving to resume</p>
            </div>
          )}

          {/* Bottom sheet with stats + controls */}
          <RunBottomSheet
            elapsed={timer.elapsed}
            distance={gps.distance}
            points={gps.points}
            formatTime={timer.formatTime}
            onPause={handlePause}
            onLock={() => setLocked(true)}
            isPaused={phase === 'paused'}
            onResume={handleResume}
            onStop={handleStop}
            weightKg={profile?.weightKg || 70}
          />
        </>
      )}
    </div>
  );
}
