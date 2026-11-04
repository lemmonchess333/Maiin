import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { BadgeTier } from "./badges";

const lazyConfetti = () => import("canvas-confetti").then((m) => m.default);

/** Taps the seal takes to break open. Reduce Motion takes one. */
export const SEAL_TAPS = 3;

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.frequency.value = 523; // C5
    osc2.frequency.value = 659; // E5
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.15);
    osc1.stop(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 0.8);
  } catch {
    // AudioContext may not be available
  }
}

// A short rising "tick" per crack — escalating pitch builds anticipation as the
// seal weakens. Separate from the C/E reveal chime so the break reads as impact.
function playCrack(step: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 320 + step * 90; // rises each tap
    gain.gain.value = 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // AudioContext may not be available
  }
}

function throwConfetti(tierColor: string) {
  lazyConfetti()
    .then((confetti) => {
      // Palette tells the prize's story: the earned tier + brand purples +
      // celebratory gold (tier token) — no off-palette green/amber.
      const colors = [
        tierColor,
        THEME.brand,
        THEME.brandLight,
        THEME.tier.gold,
      ];
      // Higher ticks + softer gravity = a slower, more graceful fall than
      // the old single hard pop.
      const defaults = { colors, ticks: 240, gravity: 0.85, decay: 0.92 };
      // Centre pop from the prize itself…
      confetti({
        ...defaults,
        particleCount: 110,
        spread: 100,
        startVelocity: 42,
        scalar: 1.05,
        origin: { y: 0.42 },
      });
      // …then two angled side volleys a beat apart (award-ceremony shape),
      // so the moment reads as a sequence rather than one flat burst.
      setTimeout(() => {
        confetti({
          ...defaults,
          particleCount: 40,
          angle: 60,
          spread: 55,
          startVelocity: 52,
          origin: { x: 0, y: 0.62 },
        });
      }, 160);
      setTimeout(() => {
        confetti({
          ...defaults,
          particleCount: 40,
          angle: 120,
          spread: 55,
          startVelocity: 52,
          origin: { x: 1, y: 0.62 },
        });
      }, 320);
    })
    .catch(() => {
      // No confetti where canvas is missing; the break stands on its own.
    });
}

/** Where a seal's ceremony stands, for `SealStage` and `SealPrompt` to draw
 *  and for the surface around them to read. */
export interface SealBreak {
  tier: BadgeTier;
  reduce: boolean;
  taps: number;
  tapsNeeded: number;
  /** Taps so far, capped at the taps needed. */
  stage: number;
  revealed: boolean;
  /** One hit on the seal; the last one breaks it. */
  tap: () => void;
  /** The seal's button, for focus. */
  buttonRef: RefObject<HTMLButtonElement | null>;
}

/**
 * The seal ceremony a badge and a medal both open with (BadgeEarnedModal,
 * MedalReveal): the person taps the sealed capsule several times, each tap
 * a crack, a rising tick and a haptic, until the last one breaks it with
 * the chime, a heavy haptic and confetti. Reduce Motion collapses it to
 * one tap and throws nothing. The drawing is SealCeremony.tsx.
 *
 * Call it after the surface's `useFocusTrap`: with `opening`, its effect
 * focuses the seal, and the trap has to have recorded what had focus
 * before then so it can give focus back on close.
 */
export function useSealBreak({
  tier,
  opening,
  confetti,
  onDismiss,
}: {
  tier: BadgeTier;
  /** Opened over the page as a moment of its own: a light haptic as the
   *  seal arrives, and keyboard focus on it. */
  opening: boolean;
  /** Throw confetti on the break (never under Reduce Motion). */
  confetti: boolean;
  /** A tap that lands after the break; the badge's card closes on it. */
  onDismiss?: () => void;
}): SealBreak {
  const reduce = useReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [taps, setTaps] = useState(0);
  const [revealed, setRevealed] = useState(false);

  // Reduced motion collapses the ceremony to a single tap (no shake / shatter).
  const tapsNeeded = reduce ? 1 : SEAL_TAPS;
  const stage = Math.min(taps, tapsNeeded);

  useEffect(() => {
    if (opening) {
      haptic("light");
      buttonRef.current?.focus();
    }
  }, [opening]);

  const fireReveal = useCallback(() => {
    haptic("heavy");
    playChime();
    // Reduced motion: the ceremony is already collapsed to a single tap —
    // particle rain contradicts that intent, so the reveal is haptic +
    // chime + bloom only. (Previously still fired 60 particles.)
    if (reduce || !confetti) return;
    throwConfetti(THEME.tier[tier]);
  }, [reduce, tier, confetti]);

  // Each tap cracks the seal a little more; the last tap breaks it open and
  // blooms the prize. Idempotent once revealed (extra taps dismiss instead).
  const tap = useCallback(() => {
    if (revealed) {
      onDismiss?.();
      return;
    }
    setTaps((prev) => {
      const next = prev + 1;
      if (next >= tapsNeeded) {
        setRevealed(true);
        fireReveal();
      } else {
        haptic(next === 1 ? "light" : "medium");
        playCrack(next);
      }
      return next;
    });
  }, [revealed, tapsNeeded, fireReveal, onDismiss]);

  return { tier, reduce, taps, tapsNeeded, stage, revealed, tap, buttonRef };
}
