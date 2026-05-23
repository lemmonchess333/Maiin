import { useCallback, useRef } from 'react';
import { haptic } from '@/lib/haptic';

type CueFrequency = 'every_500m' | 'every_km' | 'every_5min' | 'off';

export interface AudioCueConfig {
  paceAlerts: boolean;
  voiceRate: number;
}

const DEFAULT_CUE_CONFIG: AudioCueConfig = {
  paceAlerts: true,
  voiceRate: 0.9,
};

export function useAudioCues(enabled: boolean, frequency: CueFrequency, config?: Partial<AudioCueConfig>) {
  const lastDistanceCue = useRef(0);
  const lastTimeCue = useRef(0);
  const splitPaces = useRef<number[]>([]); // sec/km per split for comparison
  const primed = useRef(false);
  const halfwayAnnounced = useRef(false);
  const final500Announced = useRef(false);
  const paceAlertCooldown = useRef(0);

  const cueConfig = { ...DEFAULT_CUE_CONFIG, ...config };

  const prime = useCallback(() => {
    if (primed.current || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    speechSynthesis.speak(u);
    primed.current = true;
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || !('speechSynthesis' in window)) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = cueConfig.voiceRate;
      u.pitch = 1;
      u.volume = 1;
      u.lang = 'en-GB';
      // Try to pick a clear English voice
      const voices = speechSynthesis.getVoices();
      const preferred = voices.find((v) => v.lang.startsWith('en') && v.name.includes('Google')) || voices.find((v) => v.lang.startsWith('en-GB'));
      if (preferred) u.voice = preferred;
      speechSynthesis.speak(u);
    },
    [enabled, cueConfig.voiceRate]
  );

  const checkDistanceCue = useCallback(
    (distance: number, pace: string) => {
      if (!enabled || frequency === 'off' || frequency === 'every_5min') return;
      const threshold = frequency === 'every_500m' ? 500 : 1000;
      const currentMark = Math.floor(distance / threshold);
      if (currentMark <= lastDistanceCue.current || currentMark === 0) return;

      lastDistanceCue.current = currentMark;

      // Parse pace string "M:SS" → seconds
      const parts = pace.split(':');
      const mins = parseInt(parts[0]);
      const secs = parseInt(parts[1]);
      const currentPaceSec = parts.length === 2 && !isNaN(mins) && !isNaN(secs)
        ? mins * 60 + secs
        : 0;

      // Build split comparison phrase
      let comparison = '';
      const prevPaces = splitPaces.current;
      if (currentPaceSec > 0 && prevPaces.length > 0) {
        const lastPace = prevPaces[prevPaces.length - 1];
        const diff = lastPace - currentPaceSec; // positive = faster this split
        if (diff > 10) comparison = ' Faster than last split.';
        else if (diff < -10) comparison = ' Slower than last split.';
        else comparison = ' On pace.';
      }

      if (currentPaceSec > 0) splitPaces.current.push(currentPaceSec);

      /* Haptic burst for split milestone. lib/haptic routes through
         Capacitor on iOS where navigator.vibrate is a no-op. */
      haptic([60, 40, 60]);

      if (frequency === 'every_500m') {
        speak(`${(currentMark * 0.5).toFixed(1)} kilometres. Pace ${pace} per K.${comparison}`);
      } else {
        const km = currentMark;
        speak(`${km} kilometre${km > 1 ? 's' : ''}. Pace ${pace} per K.${comparison}`);
      }
    },
    [enabled, frequency, speak]
  );

  const checkTimeCue = useCallback(
    (elapsed: number, distance: number) => {
      if (!enabled || frequency !== 'every_5min') return;
      const currentMark = Math.floor(elapsed / 300);
      if (currentMark > lastTimeCue.current && currentMark > 0) {
        lastTimeCue.current = currentMark;
        haptic([60, 40, 60]);
        speak(`${currentMark * 5} minutes. Distance ${(distance / 1000).toFixed(1)} kilometres.`);
      }
    },
    [enabled, frequency, speak]
  );

  /** Pace zone alert: fires when pace deviates ±15s/km from target for >30s */
  const checkPaceAlert = useCallback(
    (currentPaceSeconds: number, targetPaceSeconds: number, elapsed: number) => {
      if (!enabled || !cueConfig.paceAlerts || !targetPaceSeconds) return;
      const deviation = currentPaceSeconds - targetPaceSeconds;
      if (Math.abs(deviation) > 15 && elapsed - paceAlertCooldown.current > 30) {
        paceAlertCooldown.current = elapsed;
        if (deviation > 0) {
          speak('Pick up the pace. You\'re falling behind target.');
        } else {
          speak('Ease up. You\'re ahead of target pace.');
        }
      }
    },
    [enabled, cueConfig.paceAlerts, speak]
  );

  /** Halfway announcement for distance targets */
  const checkHalfway = useCallback(
    (distance: number, targetDistance: number) => {
      if (!enabled || halfwayAnnounced.current || !targetDistance) return;
      if (distance >= targetDistance / 2) {
        halfwayAnnounced.current = true;
        speak('Halfway there! Keep it up.');
      }
    },
    [enabled, speak]
  );

  /** Final 500m announcement */
  const checkFinal500 = useCallback(
    (distance: number, targetDistance: number) => {
      if (!enabled || final500Announced.current || !targetDistance) return;
      if (distance >= targetDistance - 500 && distance < targetDistance) {
        final500Announced.current = true;
        speak('Final 500 metres. Bring it home!');
      }
    },
    [enabled, speak]
  );

  /** PB alert — call when a new personal best is detected */
  const announcePB = useCallback(
    (effortLabel: string) => {
      if (!enabled) return;
      speak(`New personal best for ${effortLabel}! Amazing!`);
    },
    [enabled, speak]
  );

  const announcePhase = useCallback(
    (phase: string, rep?: number, totalReps?: number) => {
      if (!enabled) return;
      if (phase === 'warmup') speak('Warm up. Easy pace.');
      if (phase === 'work') speak(`Rep ${rep} of ${totalReps}. Go!`);
      if (phase === 'rest') speak('Rest. Recovery jog.');
      if (phase === 'cooldown') speak('Cool down. Easy pace.');
      if (phase === 'complete') speak('Workout complete. Great job!');
    },
    [enabled, speak]
  );

  const reset = useCallback(() => {
    lastDistanceCue.current = 0;
    lastTimeCue.current = 0;
    splitPaces.current = [];
    halfwayAnnounced.current = false;
    final500Announced.current = false;
    paceAlertCooldown.current = 0;
  }, []);

  return { prime, speak, checkDistanceCue, checkTimeCue, checkPaceAlert, checkHalfway, checkFinal500, announcePB, announcePhase, reset };
}
