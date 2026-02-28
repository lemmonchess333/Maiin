import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGPS } from '../hooks/useGPS';
import { useRunTimer } from '../hooks/useRunTimer';
import { useWakeLock } from '../hooks/useWakeLock';
import { calculatePace, calculateSplits, paceAsNumber, totalElevationGain, estimateRunCalories } from '../lib/gps';
import RunMap from '../components/run/RunMap';
import RunSetupModal, { type RunConfig } from '../components/run/RunSetupModal';
import { useAudioCues } from '../hooks/useAudioCues';
import { useIntervalWorkout } from '../hooks/useIntervalWorkout';
import IntervalDisplay from '../components/run/IntervalDisplay';
import TreadmillMode from '../components/run/TreadmillMode';
import PaceZoneBar from '../components/run/PaceZoneBar';
import { useAuth } from '../lib/auth';

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
      <span className={`text-xs ${text}`}>{accuracy ? `±${Math.round(accuracy)}m` : ''}</span>
    </div>
  );
}

export default function Run() {
  const navigate = useNavigate();
  const timer = useRunTimer();
  const gps = useGPS(timer.elapsed);
  const wakeLock = useWakeLock();
  const { profile } = useAuth();
  const [phase, setPhase] = useState<RunPhase>('waiting');
  const [locked, setLocked] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [countdown, setCountdown] = useState(3);
  const [autoPaused, setAutoPaused] = useState(false);
  const [runConfig, setRunConfig] = useState<RunConfig | null>(null);
  const [treadmillDistance, setTreadmillDistance] = useState(0);
  const autoPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (phase === 'acquiring' && gps.points.length > 0) {
      setPhase('countdown');
      setCountdown(3);
    }
  }, [phase, gps.points.length]);

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
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center" onDoubleClick={() => setLocked(false)}>
        <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">🔒</div>
        <p className="text-5xl font-mono tabular-nums text-white/15 font-bold">{timer.formatTime(timer.elapsed)}</p>
        <p className="text-2xl font-mono tabular-nums text-white/10 mt-2">{((runConfig?.activityType === 'treadmill' ? treadmillDistance : gps.distance) / 1000).toFixed(2)} km</p>
        <p className="text-white/20 text-xs mt-10 animate-pulse">Double-tap to unlock</p>
      </div>
    );
  }

  const currentDistance = runConfig?.activityType === 'treadmill' ? treadmillDistance : gps.distance;

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 text-white flex flex-col">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <GPSIndicator accuracy={gps.gpsAccuracy} isTracking={gps.isTracking} pointCount={gps.points.length} />
        {(phase === 'active' || phase === 'paused') && (
          <button onClick={() => setLocked(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20">
            <span className="text-[10px] text-white/60 font-medium">Lock</span>
          </button>
        )}
      </div>

      {phase === 'waiting' && (
        <RunSetupModal
          onStart={handleStart}
          onCancel={() => navigate(-1)}
          savedPreferences={{ autoPause: true, audioCues: (profile as any)?.audioCues !== false }}
        />
      )}

      {phase === 'acquiring' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-16 h-16 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin mb-6" />
          <p className="text-lg font-semibold mb-1">Acquiring GPS Signal...</p>
          <p className="text-sm text-white/40 text-center">Stand still outdoors for best results</p>
          <p className="text-xs text-white/20 mt-4">{gps.gpsAccuracy ? `Accuracy: ±${Math.round(gps.gpsAccuracy)}m` : 'Searching...'}</p>
          <button onClick={() => { gps.stop(); setPhase('waiting'); }} className="mt-8 text-sm text-white/30">Cancel</button>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-9xl font-bold animate-pulse">{countdown || 'GO!'}</span>
        </div>
      )}

      {(phase === 'active' || phase === 'paused') && runConfig?.activityType === 'treadmill' && (
        <div className="flex-1 flex items-center">
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
        <>
          <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-6">
            <div className="text-center">
              <p className="text-[10px] text-white/30 uppercase tracking-widest">Time</p>
              <p className="text-6xl font-mono tabular-nums font-bold leading-none">{timer.formatTime(timer.elapsed)}</p>
            </div>

            <div className="flex items-start justify-center gap-14">
              <div className="text-center">
                <p className="text-[10px] text-white/30 uppercase tracking-widest">Distance</p>
                <p className="text-4xl font-mono tabular-nums font-bold leading-none">{(currentDistance / 1000).toFixed(2)}</p>
                <p className="text-[10px] text-white/20 mt-0.5">km</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-white/30 uppercase tracking-widest">Pace</p>
                <p className="text-4xl font-mono tabular-nums font-bold leading-none">{calculatePace(currentDistance, timer.elapsed)}</p>
                <p className="text-[10px] text-white/20 mt-0.5">/km</p>
              </div>
            </div>

            {runConfig?.activityType === 'intervals' && <IntervalDisplay state={intervals.state} />}
            {(runConfig?.activityType === 'tempo' || runConfig?.activityType === 'intervals') && (
              <PaceZoneBar
                currentPace={paceAsNumber(currentDistance, timer.elapsed)}
                targetPace={runConfig.intervals?.workPace || runConfig.target.value || 300}
                tolerance={15}
              />
            )}

            <div className="flex items-center gap-8 text-white/40">
              <div className="text-center">
                <p className="text-[10px]">Calories</p>
                <p className="text-base font-mono tabular-nums">{estimateRunCalories(currentDistance, 70)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px]">Elevation</p>
                <p className="text-base font-mono tabular-nums">{totalElevationGain(gps.points)}m</p>
              </div>
            </div>

            <button onClick={() => setShowMap(!showMap)} className="text-xs text-purple-400">{showMap ? 'Hide Map' : 'Show Map'}</button>
            {showMap && (
              <div className="w-full border border-white/10 rounded-xl overflow-hidden">
                <RunMap points={gps.points} currentPoint={gps.currentPoint} height="h-52" />
              </div>
            )}
          </div>

          {autoPaused && <div className="text-center py-2 bg-yellow-500/10"><p className="text-xs text-yellow-400/80">Auto-paused · start moving to resume</p></div>}

          <div className="px-6 py-8 pb-10">
            {phase === 'active' ? (
              <div className="flex flex-col items-center">
                <button onClick={handlePause} className="w-20 h-20 rounded-full bg-white/15 backdrop-blur border-2 border-white/30 flex items-center justify-center active:scale-90 transition-transform">
                  <div className="flex gap-2"><div className="w-3 h-8 bg-white rounded-sm" /><div className="w-3 h-8 bg-white rounded-sm" /></div>
                </button>
                <p className="text-[10px] text-white/20 mt-3">Tap to pause</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-12">
                  <div className="flex flex-col items-center">
                    <button
                      onTouchStart={() => { stopTimer.current = setTimeout(() => { haptic('success'); finishRun(); }, 2000); }}
                      onTouchEnd={() => { if (stopTimer.current) clearTimeout(stopTimer.current); }}
                      onMouseDown={() => { stopTimer.current = setTimeout(() => { haptic('success'); finishRun(); }, 2000); }}
                      onMouseUp={() => { if (stopTimer.current) clearTimeout(stopTimer.current); }}
                      className="w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center"
                    >
                      <div className="w-7 h-7 bg-red-500 rounded-md" />
                    </button>
                    <p className="text-[10px] text-red-400/60 mt-2">Hold to stop</p>
                  </div>

                  <div className="flex flex-col items-center">
                    <button onClick={handleResume} className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center active:scale-90 transition-transform shadow-lg shadow-green-500/30">
                      <div className="w-0 h-0 ml-1.5 border-l-[18px] border-l-white border-y-[12px] border-y-transparent" />
                    </button>
                    <p className="text-[10px] text-green-400/60 mt-2">Resume</p>
                  </div>
                </div>
                <p className="text-[10px] text-white/15 mt-6">Hold stop for 2 seconds to end run</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
