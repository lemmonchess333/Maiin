import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useGPS } from '../hooks/useGPS';
import { useRunTimer } from '../hooks/useRunTimer';
import { useWakeLock } from '../hooks/useWakeLock';
import { calculatePace, calculateSplits, paceAsNumber, totalElevationGain } from '../lib/gps';
import RunMap from '../components/run/RunMapLazy';
import RunSetupModal, { type RunConfig } from '../components/run/RunSetupModal';
import { useAudioCues } from '../hooks/useAudioCues';
import { useIntervalWorkout } from '../hooks/useIntervalWorkout';
import IntervalDisplay from '../components/run/IntervalDisplay';
import TreadmillMode from '../components/run/TreadmillMode';
import PaceZoneBar from '../components/run/PaceZoneBar';
import RunBottomSheet from '../components/run/RunBottomSheet';
import GuidedRunOverlay from '../components/run/GuidedRunOverlay';
import { useGuidedRun } from '../hooks/useGuidedRun';
import { THEME } from '../lib/theme';
import { RUN_TEMPLATES } from '../lib/workoutTemplates';

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

  const guidedRun = useGuidedRun(
    runConfig?.activityType === 'guided' ? runConfig.guidedWorkout ?? null : null,
    phase === 'active'
  );

  const audioCues = useAudioCues(runConfig?.audioCues ?? true, runConfig?.audioCueFrequency ?? 'every_km', {
    paceAlerts: runConfig?.paceAlerts ?? true,
    voiceRate: runConfig?.voiceRate ?? 0.9,
  });
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
    gps.preWarm();
    gps.start();
  };

  // Auto-start without GPS if permission denied or geolocation unavailable
  useEffect(() => {
    if (phase === 'acquiring' && gps.error) {
      const transition = () => { setPhase('countdown'); setCountdown(3); };
      transition();
    }
  }, [phase, gps.error]);

  // Count seconds spent in acquiring phase
  useEffect(() => {
    if (phase !== 'acquiring') { const reset = () => { setAcquiringSeconds(0); }; reset(); return; }
    const t = setInterval(() => setAcquiringSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Transition from acquiring to countdown when we get a GPS point
  useEffect(() => {
    if (phase === 'acquiring' && gps.points.length > 0) {
      const transition = () => { setPhase('countdown'); setCountdown(3); };
      transition();
    }
  }, [phase, gps.points.length]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      const go = () => { setPhase('active'); timer.start(); audioCues.speak('Go!'); haptic('heavy'); };
      go();
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

    // Pace zone alerts for tempo/interval runs
    if (runConfig?.target?.type === 'pace' && runConfig.target.value) {
      const currentPaceSec = gps.distance > 0 ? (timer.elapsed / gps.distance) * 1000 : 0;
      audioCues.checkPaceAlert(currentPaceSec, runConfig.target.value, timer.elapsed);
    }

    // Halfway and final 500m for distance targets
    if (runConfig?.target?.type === 'distance' && runConfig.target.value) {
      const targetMeters = runConfig.target.value * 1000;
      audioCues.checkHalfway(gps.distance, targetMeters);
      audioCues.checkFinal500(gps.distance, targetMeters);
    }
  }, [gps.distance, timer.elapsed, phase, audioCues, runConfig]);

  useEffect(() => {
    if (phase !== 'active' || !runConfig?.autoPause || runConfig.activityType === 'treadmill') return;
    const speed = gps.currentPoint?.speed;
    if (speed !== null && speed !== undefined && speed < 0.5 && !autoPaused) {
      autoPauseTimer.current = setTimeout(() => {
        timer.pause();
        setAutoPaused(true);
      }, 5000);
    } else if (autoPaused && speed !== null && speed !== undefined && speed >= 1) {
      const resume = () => { timer.resume(); setAutoPaused(false); };
      resume();
    }
    return () => { if (autoPauseTimer.current) clearTimeout(autoPauseTimer.current); };
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
        <p className="text-5xl font-mono tabular-nums text-white/40 font-bold">{timer.formatTime(timer.elapsed)}</p>
        <p className="text-2xl font-mono tabular-nums text-white/30 mt-3">{((runConfig?.activityType === 'treadmill' ? treadmillDistance : gps.distance) / 1000).toFixed(2)} km</p>
        <div className="mt-12 flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><path d="M4 12h16M12 4v16" /></svg>
          </div>
          <p className="text-white/40 text-xs animate-pulse">Double-tap to unlock</p>
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
            savedPreferences={(() => {
              const prefs: Partial<RunConfig> = {
                autoPause: true,
                audioCues: profile?.audioCues !== false,
              };
              // Support ?type=tempo for direct type selection
              if (searchParams.get('type')) {
                prefs.activityType = searchParams.get('type') as RunConfig['activityType'];
              }
              // Support ?template=5x1k to pre-fill from a RUN_TEMPLATES entry
              const templateId = searchParams.get('template');
              if (templateId) {
                const tmpl = RUN_TEMPLATES.find(t => t.id === templateId);
                if (tmpl) {
                  prefs.activityType = tmpl.type as RunConfig['activityType'];
                  if (tmpl.config.targetDistance) {
                    prefs.target = { type: 'distance', value: tmpl.config.targetDistance };
                  } else if (tmpl.config.targetPace) {
                    prefs.target = { type: 'pace', value: tmpl.config.targetPace };
                  }
                  if (tmpl.config.intervals) {
                    prefs.intervals = {
                      reps: tmpl.config.intervals.reps,
                      workDistance: tmpl.config.intervals.workDistance,
                      workDuration: tmpl.config.intervals.workDuration,
                      restDuration: tmpl.config.intervals.restDuration,
                      warmupDuration: tmpl.config.intervals.warmupDuration,
                      cooldownDuration: tmpl.config.intervals.cooldownDuration,
                    };
                  }
                }
              }
              return prefs;
            })()}
          />
        </div>
      )}

      {phase === 'acquiring' && (() => {
        const acc = gps.gpsAccuracy;
        const quality = gps.signalQuality;
        const bars = quality === 'strong' ? 4 : quality === 'good' ? 3 : quality === 'fair' ? 2 : quality === 'weak' ? 1 : 0;
        const barColor = quality === 'strong' || quality === 'good' ? '#34D399' : quality === 'fair' ? '#FFB547' : '#EF4444';
        return (
          <div className="flex-1 flex flex-col items-center justify-center px-8" style={{ background: THEME.bg }}>
            {/* Signal rings */}
            <div className="relative w-28 h-28 flex items-center justify-center mb-8">
              <div className="absolute inset-0 rounded-full border-2 animate-ping" style={{ borderColor: `${THEME.teal}30`, animationDuration: '2s' }} />
              <div className="absolute inset-3 rounded-full border-2 animate-ping" style={{ borderColor: `${THEME.teal}40`, animationDuration: '2s', animationDelay: '0.4s' }} />
              <div className="absolute inset-6 rounded-full border-2 animate-ping" style={{ borderColor: `${THEME.teal}50`, animationDuration: '2s', animationDelay: '0.8s' }} />
              <div className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,212,170,0.12)', border: `2px solid ${THEME.teal}` }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={THEME.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                </svg>
              </div>
            </div>

            {/* Signal bars + accuracy */}
            <div className="flex items-end gap-1 mb-4">
              {[1,2,3,4].map(i => (
                <div key={i} style={{
                  width: 8, height: 6 + i * 5, borderRadius: 3,
                  background: i <= bars ? barColor : 'rgba(255,255,255,0.1)',
                  transition: 'background 0.3s',
                }} />
              ))}
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginLeft: 8, fontFamily: 'monospace' }}>
                {acc ? `\u00B1${Math.round(acc)}m` : '---'}
              </p>
            </div>

            <p className="text-white font-semibold text-lg mb-1">
              {quality === 'strong' || quality === 'good' ? 'GPS locked' : 'Acquiring GPS...'}
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 260 }}>
              {quality === 'weak' || quality === 'searching'
                ? 'Move to an open area away from buildings'
                : 'Getting accurate signal...'}
            </p>
            {gps.error && (
              <p className="text-xs text-red-400 mt-2 text-center">{gps.error}</p>
            )}

            <div className="mt-8 flex flex-col items-center gap-3 w-full">
              {acquiringSeconds >= 15 && (
                <button
                  onClick={() => { setPhase('countdown'); setCountdown(3); }}
                  className="w-full py-3.5 rounded-2xl font-semibold text-sm active:scale-95 transition-transform"
                  style={{ background: THEME.teal, color: '#000' }}>
                  Start without GPS {acc ? `(\u00B1${Math.round(acc)}m)` : ''}
                </button>
              )}
              <button
                onClick={() => { gps.stop(); setPhase('waiting'); }}
                style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

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
            onSave={(distance) => { setTreadmillDistance(distance); haptic('success'); finishRun(distance); }}
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

          {runConfig?.activityType === 'guided' && (
            <GuidedRunOverlay
              currentSegment={guidedRun.currentSegment}
              nextSegment={guidedRun.nextSegment}
              timeRemaining={guidedRun.timeRemaining}
              segmentProgress={guidedRun.segmentProgress}
              totalProgress={guidedRun.totalProgress}
              isComplete={guidedRun.isComplete}
            />
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
            onStop={() => { haptic('success'); finishRun(); }}
            onDiscard={() => { timer.pause(); gps.stop(); wakeLock.release(); navigate('/'); }}
            intervalDisplay={runConfig?.activityType === 'intervals' ? <IntervalDisplay state={intervals.state} /> : undefined}
            weightKg={profile?.weightKg || 70}
          />
        </div>
      )}
    </div>
  );
}