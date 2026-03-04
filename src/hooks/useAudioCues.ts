import { useCallback, useRef } from 'react';

type CueFrequency = 'every_500m' | 'every_km' | 'every_5min' | 'off';

export function useAudioCues(enabled: boolean, frequency: CueFrequency) {
  const lastDistanceCue = useRef(0);
  const lastTimeCue = useRef(0);
  const splitPaces = useRef<number[]>([]); // sec/km per split for comparison
  const primed = useRef(false);

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
      u.rate = 0.88;
      u.pitch = 1;
      u.volume = 1;
      u.lang = 'en-GB';
      speechSynthesis.speak(u);
    },
    [enabled]
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
      const currentPaceSec = parts.length === 2
        ? parseInt(parts[0]) * 60 + parseInt(parts[1])
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

      // Haptic burst for split milestone
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);

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
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
        speak(`${currentMark * 5} minutes. Distance ${(distance / 1000).toFixed(1)} kilometres.`);
      }
    },
    [enabled, frequency, speak]
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
  }, []);

  return { prime, speak, checkDistanceCue, checkTimeCue, announcePhase, reset };
}