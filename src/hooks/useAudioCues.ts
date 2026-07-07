import { useCallback, useEffect, useRef } from "react";
import { haptic } from "@/lib/haptic";
import { pickCoachVoice } from "@/lib/speechVoice";
import {
  splitCue,
  timeCue,
  paceAlertCue,
  halfwayCue,
  final500Cue,
  pbCue,
  phaseCue,
  type SplitComparison,
} from "@/lib/runCueCopy";

type CueFrequency = "every_500m" | "every_km" | "every_5min" | "off";

export interface AudioCueConfig {
  paceAlerts: boolean;
  voiceRate: number;
}

const DEFAULT_CUE_CONFIG: AudioCueConfig = {
  paceAlerts: true,
  voiceRate: 0.9,
};

export function useAudioCues(
  enabled: boolean,
  frequency: CueFrequency,
  config?: Partial<AudioCueConfig>
) {
  const lastDistanceCue = useRef(0);
  const lastTimeCue = useRef(0);
  const splitPaces = useRef<number[]>([]); // sec/km per split for comparison
  const primed = useRef(false);
  // Rotates the phrasing-variation pools in runCueCopy so back-to-back cues
  // don't repeat verbatim (deterministic — no Math.random).
  const cueVariant = useRef(0);
  // Voice list cache: Chrome returns [] from getVoices() until the async
  // `voiceschanged` event fires, which is why the old inline picker often
  // ran against an empty list and fell back to the engine default.
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => {
      voicesRef.current = speechSynthesis.getVoices();
    };
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  const halfwayAnnounced = useRef(false);
  const final500Announced = useRef(false);
  const paceAlertCooldown = useRef(0);

  const cueConfig = { ...DEFAULT_CUE_CONFIG, ...config };

  const prime = useCallback(() => {
    if (primed.current || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    speechSynthesis.speak(u);
    primed.current = true;
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || !("speechSynthesis" in window)) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = cueConfig.voiceRate;
      u.pitch = 1;
      u.volume = 1;
      u.lang = "en-GB";
      // Quality-ranked coach voice (speechVoice.ts): enhanced Siri-class on
      // iOS, Google network voices on Chrome, neural voices on Edge. The old
      // "name includes Google" pick never matched inside the iOS WKWebView.
      const preferred = pickCoachVoice(
        voicesRef.current.length
          ? voicesRef.current
          : speechSynthesis.getVoices()
      );
      if (preferred) u.voice = preferred;
      speechSynthesis.speak(u);
    },
    [enabled, cueConfig.voiceRate]
  );

  const checkDistanceCue = useCallback(
    (distance: number, pace: string) => {
      if (!enabled || frequency === "off" || frequency === "every_5min") return;
      const threshold = frequency === "every_500m" ? 500 : 1000;
      const currentMark = Math.floor(distance / threshold);
      if (currentMark <= lastDistanceCue.current || currentMark === 0) return;

      lastDistanceCue.current = currentMark;

      // Parse pace string "M:SS" → seconds
      const parts = pace.split(":");
      const mins = parseInt(parts[0]);
      const secs = parseInt(parts[1]);
      const currentPaceSec =
        parts.length === 2 && !isNaN(mins) && !isNaN(secs)
          ? mins * 60 + secs
          : 0;

      // Split comparison (copy lives in runCueCopy — warm + varied)
      let comparison: SplitComparison = null;
      const prevPaces = splitPaces.current;
      if (currentPaceSec > 0 && prevPaces.length > 0) {
        const lastPace = prevPaces[prevPaces.length - 1];
        const diff = lastPace - currentPaceSec; // positive = faster this split
        if (diff > 10) comparison = "faster";
        else if (diff < -10) comparison = "slower";
        else comparison = "steady";
      }

      if (currentPaceSec > 0) splitPaces.current.push(currentPaceSec);

      /* Haptic burst for split milestone. lib/haptic routes through
         Capacitor on iOS where navigator.vibrate is a no-op. */
      haptic([60, 40, 60]);

      cueVariant.current += 1;
      const km = frequency === "every_500m" ? currentMark * 0.5 : currentMark;
      speak(splitCue(km, pace, comparison, cueVariant.current));
    },
    [enabled, frequency, speak]
  );

  const checkTimeCue = useCallback(
    (elapsed: number, distance: number) => {
      if (!enabled || frequency !== "every_5min") return;
      const currentMark = Math.floor(elapsed / 300);
      if (currentMark > lastTimeCue.current && currentMark > 0) {
        lastTimeCue.current = currentMark;
        haptic([60, 40, 60]);
        speak(timeCue(currentMark * 5, distance / 1000));
      }
    },
    [enabled, frequency, speak]
  );

  /** Pace zone alert: fires when pace deviates ±15s/km from target for >30s */
  const checkPaceAlert = useCallback(
    (
      currentPaceSeconds: number,
      targetPaceSeconds: number,
      elapsed: number
    ) => {
      if (!enabled || !cueConfig.paceAlerts || !targetPaceSeconds) return;
      const deviation = currentPaceSeconds - targetPaceSeconds;
      if (
        Math.abs(deviation) > 15 &&
        elapsed - paceAlertCooldown.current > 30
      ) {
        paceAlertCooldown.current = elapsed;
        cueVariant.current += 1;
        speak(
          paceAlertCue(deviation > 0 ? "behind" : "ahead", cueVariant.current)
        );
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
        cueVariant.current += 1;
        speak(halfwayCue(cueVariant.current));
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
        cueVariant.current += 1;
        speak(final500Cue(cueVariant.current));
      }
    },
    [enabled, speak]
  );

  /** PB alert — call when a new personal best is detected */
  const announcePB = useCallback(
    (effortLabel: string) => {
      if (!enabled) return;
      speak(pbCue(effortLabel));
    },
    [enabled, speak]
  );

  const announcePhase = useCallback(
    (phase: string, rep?: number, totalReps?: number) => {
      if (!enabled) return;
      const text = phaseCue(phase, rep, totalReps);
      if (text) speak(text);
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

  return {
    prime,
    speak,
    checkDistanceCue,
    checkTimeCue,
    checkPaceAlert,
    checkHalfway,
    checkFinal500,
    announcePB,
    announcePhase,
    reset,
  };
}
