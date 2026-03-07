import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useGPS } from '../hooks/useGPS';
import { useRunTimer } from '../hooks/useRunTimer';
import { useWakeLock } from '../hooks/useWakeLock';
import { calculatePace, calculateSplits, paceAsNumber, totalElevationGain } from '../lib/gps';
import RunMap from '../components/run/RunMap';
import RunSetupModal, { type RunConfig } from '../components/run/RunSetupModal';
import { useAudioCues } from '../hooks/useAudioCues';
import { useIntervalWorkout } from '../hooks/useIntervalWorkout';
import IntervalDisplay from '../components/run/IntervalDisplay';
import TreadmillMode from '../components/run/TreadmillMode';
import PaceZoneBar from '../components/run/PaceZoneBar';
import RunBottomSheet from '../components/run/RunBottomSheet';
import { THEME } from '../lib/theme';

type RunPhase = 'waiting' | 'acquiring' | 'countdown' | 'active' | 'paused' | 'finished';

function haptic(pattern: 'light' | 'medium' | 'heavy' | 'success') {
  if (!navigator.vibrate) return;
  if (pattern === 'light') navigator.vibrate(10);
  if (pattern === 'medium') navigator.vibrate(30);
  if (pattern === 'heavy') navigator.vibrate(50);
  if (pattern === 'success') navigator.vibrate([30, 50, 30]);
}

function GPSIndicator({ accuracy, isTracking, pointCount }: { accuracy: number | null; isTracking: boolean; pointCount: number }) {
  if (!isTracking) return null;
  if (pointCount === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
        <span className="text-xs text-yellow-400/80">Acquiring GPS...</span>
      </div>
    );
  }
  const quality = accuracy && accuracy < 10 ? 'strong' : accuracy && accuracy < 20 ? 'good' : accuracy && accuracy < 30 ? 'fair' : 'weak';
  const color = quality === 'strong' || quality === 'good' ? 'bg-green-400' : quality === 'fair' ? 'bg-yellow-400' : 'bg-red-400';
  const text = quality === 'weak' ? 'text-red-400/80' : quality === 'fair' ? 'text-yellow-400/80' : 'text-green-400/80';

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-end gap-0.5 h-3">
        <div className={`w-1 h-1 rounded-sm ${color}`} />
        <div className={`w-1 h-1.5 rounded-sm ${quality !== 'weak' ? color : 'bg-white/20'}`} />
        <div className={`w-1 h-2 rounded-sm ${quality === 'strong' || quality === 'good' ? color : 'bg-white/20'}`} />
        <div className={`w-1 h-3 rounded-sm ${quality === 'strong' ? color : 'bg-white/20'}`} />
      </div>
      <span className={`text-xs ${text}`}>{accuracy ? `\u00B1${Math.round(accuracy)}m` : ''}</span>
    </div>
  );
}

export default function Run() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const timer = useRunTimer();
  const gps = useGPS(timer.elapsed);
  const wakeLock = useWakeLock();
  const { profile } = useAuth();
  const [phase, setPhase] = useState<RunPhase>('waiting');
  const [locked, setLocked] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [autoPaused, setAutoPaused] = useState(false);
  const [runConfig, setRunConfig] = useState<RunConfig | null>(null);
  const [treadmillDistance, setTreadmillDistance] = useState(0);
  const [acquiringSeconds, setAcquiringSeconds] = useState(0);
  const autoPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const audioCues = useAudioCues(runConfig?.audioCues ?? true, runConfig?.audioCueFrequency ?? 'every_km');
  const intervals = useIntervalWorkout(runConfig?.activityType === 'intervals' ? runConfig.intervals : undefined);
  const intervalPhaseRef = useRef('idle');

  const handleStart = async (config: RunConfig) => {
    audioCues.prime();
    await wakeLock.request();
    setRunConfig(config);
    if (config.activityType === 'treadmill') {
      setPhase('active');
      timer.start();
      haptic('heavy');
      return;
    }
    setPhase('acquiring');
    gps.start();
  };

  // Auto-start without GPS if permission denied or geolocation unavailable
  useEffect(() => {
    if (phase === 'acquiring' && gps.error) {
      setPhase('countdown');
      setCountdown(3);
    }
  }, [phase, gps.error]);

  // Count seconds spent in acquiring phase
  useEffect(() => {
    if (phase !== 'acquiring') { setAcquiringSeconds(0); return; }
    const t = setInterval(() => setAcquiringSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Transition from acquiring to countdown when we get a GPS point
  useEffect(() => {
    if (phase === 'acquiring' && gps.points.length > 0) {
      setPhase('countdown');
      setCountdown(3);
    }
  }, [phase, gps.points.length]);

  // Force-start after 10s if GPS still hasn't locked
  useEffect(() => {
    if (phase === 'acquiring' && acquiringSeconds >= 10 && gps.points.length === 0) {
      setPhase('countdown');
      setCountdown(3);
    }
  }, [phase, acquiringSeconds, gps.points.length]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      setPhase('active');
      timer.start();
      audioCues.speak('Go!');
      haptic('heavy');
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, timer, audioCues]);

  useEffect(() => {
    if (phase !== 'active') return;
    const pace = calculatePace(gps.distance, timer.elapsed);
    audioCues.checkDistanceCue(gps.distance, pace);
    audioCues.checkTimeCue(timer.elapsed, gps.distance);
  }, [gps.distance, timer.elapsed, phase, audioCues]);

  useEffect(() => {
    if (phase !== 'active' || !runConfig?.autoPause || runConfig.activityType === 'treadmill') return;
    const speed = gps.currentPoint?.speed;
    if (speed !== null && speed !== undefined && speed < 0.5 && !autoPaused) {
      autoPauseTimer.current = setTimeout(() => {
        timer.pause();
        setAutoPaused(true);
      }, 5000);
    } else if (autoPaused && speed !== null && speed !== undefined && speed >= 1) {
      timer.resume();
      setAutoPaused(false);
    }
    return () => {
      if (autoPauseTimer.current) clearTimeout(autoPauseTimer.current);
    };
  }, [gps.currentPoint, phase, autoPaused, runConfig?.autoPause, runConfig?.activityType, timer]);

  useEffect(() => {
    if (phase === 'active' && runConfig?.activityType === 'intervals') intervals.start();
  }, [phase, runConfig?.activityType, intervals]);

  useEffect(() => {
    if (phase === 'active' && runConfig?.activityType === 'intervals') intervals.tick(timer.elapsed, gps.distance);
  }, [timer.elapsed, gps.distance, phase, runConfig?.activityType, intervals]);

  useEffect(() => {
    if (runConfig?.activityType !== 'intervals') return;
    if (intervals.state.phase !== intervalPhaseRef.current) {
      intervalPhaseRef.current = intervals.state.phase;
      audioCues.announcePhase(intervals.state.phase, intervals.state.currentRep, intervals.state.totalReps);
      if (intervals.state.phase === 'work' || intervals.state.phase === 'rest') haptic('medium');
    }
  }, [intervals.state, audioCues, runConfig?.activityType]);

  const finishRun = (distanceOverride?: number) => {
    timer.pause();
    gps.stop();
    wakeLock.release();
    setPhase('finished');

    const finalDistance = distanceOverride ?? gps.distance;
    navigate('/run-summary', {
      state: {
        points: gps.getPoints(),
        distance: finalDistance,
        elapsed: timer.elapsed,
        splits: calculateSplits(gps.getPoints()),
        elevationGain: totalElevationGain(gps.getPoints()),
        runConfig,
        intervalData: runConfig?.activityType === 'intervals' ? runConfig.intervals : undefined,
      },
    });
  };

  const handlePause = () => {
    haptic('medium');
    timer.pause();
    if (runConfig?.activityType !== 'treadmill') gps.stop();
    setPhase('paused');
  };

  const handleResume = () => {
    haptic('medium');
    if (runConfig?.activityType !== 'treadmill') gps.start();
    timer.resume();
    setPhase('active');
  };

  if (locked && (phase === 'active' || phase === 'paused')) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center"
        style={{ backgroundColor: THEME.bg }}
        onDoubleClick={() => { setLocked(false); haptic('light'); }}
      >
        <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-8">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="text-5xl font-mono tabular-nums text-white/20 font-bold">{timer.formatTime(timer.elapsed)}</p>
        <p className="text-2xl font-mono tabular-nums text-white/12 mt-3">{((runConfig?.activityType === 'treadmill' ? treadmillDistance : gps.distance) / 1000).toFixed(2)} km</p>
        <div className="mt-12 flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2"><path d="M4 12h16M12 4v16" /></svg>
          </div>
          <p className="text-white/20 text-xs animate-pulse">Double-tap to unlock</p>
        </div>
      </div>
    );
  }

  const currentDistance = runConfig?.activityType === 'treadmill' ? treadmillDistance : gps.distance;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {phase === 'waiting' && (
        <div className="flex-1 flex flex-col bg-background text-foreground">
          <RunSetupModal
            onStart={handleStart}
            onCancel={() => navigate(-1)}
            savedPreferences={{
              autoPause: true,
              audioCues: (profile as any)?.audioCues !== false,
              ...(searchParams.get('type') ? { activityType: searchParams.get('type') as RunConfig['activityType'] } : {}),
            }}
          />
        </div>
      )}

      {phase === 'acquiring' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 bg-background text-foreground">
          <div className="w-16 h-16 rounded-full border-4 border-primary/30 border-t-primary animate-spin mb-6" />
          <p className="text-lg font-semibold mb-1">Acquiring GPS Signal...</p>
          <p className="text-sm text-muted-foreground text-center">Stand still outdoors for best results</p>
          <p className="text-[10px] text-muted-foreground/40 mt-1">For best tracking, keep your screen on during the run</p>
          <p className="text-xs text-muted-foreground/60 mt-4">{gps.gpsAccuracy ? `Accuracy: \u00B1${Math.round(gps.gpsAccuracy)}m` : 'Searching...'}</p>
          {gps.error && <p className="text-xs text-red-400 mt-2">{gps.error}</p>}
          {acquiringSeconds >= 8 && (
            <button
              onClick={() => { setPhase('countdown'); setCountdown(3); }}
              className="mt-6 px-6 py-2.5 rounded-full bg-muted text-sm font-medium text-foreground active:scale-95 transition-transform"
            >
              Start without GPS
            </button>
          )}
          <button onClick={() => { gps.stop(); setPhase('waiting'); }} className="mt-4 text-sm text-muted-foreground">Cancel</button>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="h-full flex items-center justify-center text-white" style={{ backgroundColor: THEME.bg }}>
          <span className="text-9xl font-bold animate-pulse">{countdown || 'GO!'}</span>
        </div>
      )}

      {(phase === 'active' || phase === 'paused') && runConfig?.activityType === 'treadmill' && (
        <div className="flex-1 flex items-center text-white" style={{ backgroundColor: THEME.bg }}>
          <TreadmillMode
            elapsed={timer.elapsed}
            formatTime={timer.formatTime}
            onSave={(distance) => {
              setTreadmillDistance(distance);
              haptic('success');
              finishRun(distance);
            }}
            onDiscard={() => navigate('/')}
          />
        </div>
      )}

      {(phase === 'active' || phase === 'paused') && runConfig?.activityType !== 'treadmill' && (
        <div className="fixed inset-0 z-50 text-white" style={{ backgroundColor: THEME.bg }}>
          <div className="absolute top-3 left-4 z-50">
            <GPSIndicator accuracy={gps.gpsAccuracy} isTracking={gps.isTracking} pointCount={gps.points.length} />
          </div>

          {(runConfig?.activityType === 'tempo' || runConfig?.activityType === 'intervals') && (
            <div className="absolute top-10 left-4 right-4 z-50">
              <PaceZoneBar
                currentPace={paceAsNumber(currentDistance, timer.elapsed)}
                targetPace={runConfig.intervals?.workPace || runConfig.target.value || 300}
                tolerance={15}
              />
            </div>
          )}

          <RunMap points={gps.points} currentPoint={gps.currentPoint} interactive={false} height="h-full" className="absolute inset-0" />

          {autoPaused && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 text-center py-2 px-3 rounded-full bg-yellow-500/20">
              <p className="text-xs text-yellow-300">Auto-paused · start moving to resume</p>
            </div>
          )}

          <RunBottomSheet
            elapsed={timer.elapsed}
            distance={currentDistance}
            points={gps.points}
            formatTime={timer.formatTime}
            onPause={handlePause}
            onLock={() => setLocked(true)}
            isPaused={phase === 'paused'}
            onResume={handleResume}
            onStop={() => {
              haptic('success');
              finishRun();
            }}
            intervalDisplay={runConfig?.activityType === 'intervals' ? <IntervalDisplay state={intervals.state} /> : undefined}
            weightKg={profile?.weightKg || 70}
          />
        </div>
      )}
    </div>
  );
}
