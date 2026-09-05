import { useCallback, useEffect, useRef } from "react";
import { haptic } from "@/lib/haptic";
import { pickCoachVoice } from "@/lib/speechVoice";
import {
  splitCue,
  timeCue,
  paceAlertCue,
  paceResolvedCue,
  halfwayCue,
  finalStretchCue,
  type SplitComparison,
} from "@/lib/runCueCopy";
import { paceMinSec } from "@/lib/runLabels";
import { lapMetresFor, finalStretchM } from "@/lib/distanceUnits";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";

type CueFrequency = "every_500m" | "every_km" | "every_5min" | "off";

/** Pace-alert nag budget: per off-pace stretch, spoken alerts are spaced
 *  30s → 60s → 120s and hard-capped at three; resolution needs the pace
 *  back in band and HELD there this long. */
const ALERT_SPACINGS = [30, 60, 120];
const MAX_ALERTS_PER_STRETCH = 3;
const RESOLVE_HOLD_SECONDS = 15;

export interface AudioCueConfig {
  paceAlerts: boolean;
  voiceRate: number;
  /** Starting offset for the phrasing-variation pools. Deterministic
   *  rotation means an unseeded run replays the SAME script every run —
   *  same first split line, same halfway line. A per-run seed starts each
   *  run at a different point in every pool; within-run rotation (and its
   *  no-back-to-back-repeat property) is unchanged by a constant offset. */
  variantSeed: number;
}

const DEFAULT_CUE_CONFIG: AudioCueConfig = {
  paceAlerts: true,
  voiceRate: 0.9,
  variantSeed: 0,
};

/* The local `formatPaceSeconds` here was a FOURTH copy of the M:SS logic,
   hardcoded per-kilometre. Its doc said it existed so "the spoken pace reads
   the same as the on-screen one" — which is now an argument for using the
   same function the screen uses, not a private twin of it. `paceMinSec`
   keeps the `--:--` behaviour for an unmeasurable split. */

export function useAudioCues(
  enabled: boolean,
  frequency: CueFrequency,
  config?: Partial<AudioCueConfig>
) {
  const unit = useDistanceUnit();
  const lastDistanceCue = useRef(0);
  const lastTimeCue = useRef(0);
  const splitPaces = useRef<number[]>([]); // sec/km per split for comparison
  // Cumulative distance + elapsed at the last announced marker, so each
  // split's pace is measured over that split rather than the whole run.
  const lastMarkDistance = useRef(0);
  const lastMarkElapsed = useRef(0);
  const primed = useRef(false);
  // Rotates the phrasing-variation pools in runCueCopy so back-to-back cues
  // don't repeat verbatim (deterministic — no Math.random). Starts at the
  // caller's per-run seed; null = not yet initialised from config.
  const cueVariant = useRef<number | null>(null);
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
  if (cueVariant.current === null) cueVariant.current = cueConfig.variantSeed;
  /** Post-init accessor so the checks below never re-widen to null.
   *  Ref-only, so the stable identity is honest. */
  const bumpVariant = useCallback((): number => {
    cueVariant.current = (cueVariant.current ?? 0) + 1;
    return cueVariant.current;
  }, []);

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
    (distance: number, elapsed: number) => {
      if (!enabled || frequency === "off" || frequency === "every_5min") return;
      /* One lap of the LISTENER's unit — a mile runner set to "every km"
          means every mile, and the cue counts the markers it triggered on.
          The stored enum is unit-neutral: it says whole-unit or half-unit,
          not which unit. */
      const lap = lapMetresFor(unit);
      const threshold = frequency === "every_500m" ? lap / 2 : lap;
      const currentMark = Math.floor(distance / threshold);
      if (currentMark <= lastDistanceCue.current || currentMark === 0) return;

      lastDistanceCue.current = currentMark;

      /* The pace for THIS split, measured between the previous marker and
         this one — not the whole-run average.

         The cue used to be handed `calculatePace(gps.distance, elapsed)`,
         which is cumulative, and then said "Pace 5:44 per kilometre" and
         "That split was quicker" about it. Both claims were wrong, and the
         second was wrong in a way that got worse the longer you ran:
         consecutive cumulative averages differ by roughly (split − average)
         / N, so a kilometre a full minute off pace moves the average by 12s
         at km 5 and 6s at km 10 — under the ±10s threshold. From about
         halfway, the cue said "Right on rhythm" to a runner who was fading.

         gps.ts already carries this lesson for the pace ALERT — "the
         whole-run average is dragged permanently slow by a warm-up… lags
         badly mid-run" — and `rollingPaceSeconds` was added to fix it
         there. The split cue was left on the average. */
      const segMeters = distance - lastMarkDistance.current;
      const segSeconds = elapsed - lastMarkElapsed.current;
      // Stays SECONDS PER KILOMETRE — the storage convention every pace
      // comparison here is against; `paceMinSec` converts at the moment of
      // speaking.
      const currentPaceSec =
        segMeters > 0 && segSeconds > 0 ? segSeconds / (segMeters / 1000) : 0;
      lastMarkDistance.current = distance;
      lastMarkElapsed.current = elapsed;

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

      const variant = bumpVariant();
      const count =
        frequency === "every_500m" ? currentMark * 0.5 : currentMark;
      speak(
        splitCue(
          count,
          unit,
          paceMinSec(currentPaceSec, unit),
          comparison,
          variant
        )
      );
    },
    [enabled, frequency, speak, unit, bumpVariant]
  );

  const checkTimeCue = useCallback(
    (elapsed: number, distance: number) => {
      if (!enabled || frequency !== "every_5min") return;
      const currentMark = Math.floor(elapsed / 300);
      if (currentMark > lastTimeCue.current && currentMark > 0) {
        lastTimeCue.current = currentMark;
        haptic([60, 40, 60]);
        speak(timeCue(currentMark * 5, distance, unit));
      }
    },
    [enabled, frequency, speak, unit]
  );

  /**
   * Pace zone alert — with a nag budget.
   *
   * The old shape was a metronome: a fixed 30-second cooldown for as long
   * as the deviation held, so a runner 20s/km off on a 40-minute tempo
   * heard the alert dozens of times — six phrasings cycling forever is
   * still the same sentence over and over, and no reference app does it
   * (Garmin beeps, Runna alerts sparingly, NRC doesn't target-nag at all).
   *
   * Now, per off-pace STRETCH (one continuous run of same-direction
   * deviation): at most three spoken alerts, at 30s, then 60s, then 120s
   * spacing — after which the app stays quiet and lets the split cues
   * carry the numbers. A direction flip starts a new stretch. And when
   * the pace comes back inside the band and HOLDS there (15s — one good
   * GPS sample must not count), one positive close-out is spoken, so
   * recovering is audibly different from being given up on.
   */
  const alertStreak = useRef(0);
  const alertDirection = useRef<"behind" | "ahead" | null>(null);
  const withinBandSince = useRef<number | null>(null);

  const checkPaceAlert = useCallback(
    (
      currentPaceSeconds: number,
      targetPaceSeconds: number,
      elapsed: number
    ) => {
      if (!enabled || !cueConfig.paceAlerts || !targetPaceSeconds) return;
      const deviation = currentPaceSeconds - targetPaceSeconds;

      if (Math.abs(deviation) <= 15) {
        // In band. Only interesting if an off-pace stretch was live.
        if (alertStreak.current === 0) return;
        if (withinBandSince.current === null) {
          withinBandSince.current = elapsed;
          return;
        }
        if (elapsed - withinBandSince.current >= RESOLVE_HOLD_SECONDS) {
          speak(paceResolvedCue(bumpVariant()));
          alertStreak.current = 0;
          alertDirection.current = null;
          withinBandSince.current = null;
        }
        return;
      }

      // Off pace. A dip back into the band that didn't hold long enough
      // to resolve does not restart the stretch.
      withinBandSince.current = null;
      const direction = deviation > 0 ? "behind" : "ahead";
      if (direction !== alertDirection.current) {
        alertDirection.current = direction;
        alertStreak.current = 0;
      }
      if (alertStreak.current >= MAX_ALERTS_PER_STRETCH) return;
      const spacing =
        ALERT_SPACINGS[
          Math.min(alertStreak.current, ALERT_SPACINGS.length - 1)
        ];
      if (elapsed - paceAlertCooldown.current <= spacing) return;

      paceAlertCooldown.current = elapsed;
      alertStreak.current += 1;
      speak(paceAlertCue(direction, bumpVariant()));
    },
    [enabled, cueConfig.paceAlerts, speak, bumpVariant]
  );

  /** Halfway announcement for distance targets */
  const checkHalfway = useCallback(
    (distance: number, targetDistance: number) => {
      if (!enabled || halfwayAnnounced.current || !targetDistance) return;
      if (distance >= targetDistance / 2) {
        halfwayAnnounced.current = true;
        speak(halfwayCue(bumpVariant()));
      }
    },
    [enabled, speak, bumpVariant]
  );

  /** Final 500m announcement */
  const checkFinal500 = useCallback(
    (distance: number, targetDistance: number) => {
      if (!enabled || final500Announced.current || !targetDistance) return;
      const stretch = finalStretchM(unit);
      if (distance >= targetDistance - stretch && distance < targetDistance) {
        final500Announced.current = true;
        speak(finalStretchCue(unit, bumpVariant()));
      }
    },
    [enabled, speak, unit, bumpVariant]
  );

  /* `announcePB` (and its `pbCue` copy) lived here with ZERO callers and
     no data source to have fed one: `prTracking.ts` is lifting-only (rep
     buckets, 1RM), and `calculatePaceTrend` judges a COMPLETED run's
     average against ≥8 comparable finished runs — there is no
     per-distance best-effort table an in-progress split could be compared
     against. Deleted 2026-08-12 rather than annotated, per the rule in
     `mirrorCrossTestGate`: anything genuinely orphaned should be deleted.

     Not a seam someone left, either. PB recognition IS on the roadmap —
     as a POST-run visual (`program-run-mockups-v7.html`'s gold "PB" pill)
     — and the plan file's P2d declined personal-best comparison outright
     as "easily demoralising" for users returning from injury. A mid-run
     audio announcement is on no roadmap; git history holds the copy if
     that ever changes. */

  const reset = useCallback(() => {
    lastDistanceCue.current = 0;
    lastTimeCue.current = 0;
    splitPaces.current = [];
    lastMarkDistance.current = 0;
    lastMarkElapsed.current = 0;
    halfwayAnnounced.current = false;
    final500Announced.current = false;
    paceAlertCooldown.current = 0;
    alertStreak.current = 0;
    alertDirection.current = null;
    withinBandSince.current = null;
    cueVariant.current = cueConfig.variantSeed;
  }, [cueConfig.variantSeed]);

  return {
    prime,
    speak,
    checkDistanceCue,
    checkTimeCue,
    checkPaceAlert,
    checkHalfway,
    checkFinal500,
    reset,
  };
}
