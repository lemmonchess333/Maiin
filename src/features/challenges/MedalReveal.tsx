import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useBackDismiss } from "@/lib/backDismiss";
import { haptic } from "@/lib/haptic";
import { generateShareImage, shareImageFile } from "@/lib/shareCardGenerator";
import { THEME } from "@/lib/theme";
import { toast } from "@/lib/toast";
import MedalArt from "./MedalArt";
import MedalShareCard from "./MedalShareCard";
import {
  medalEditionDates,
  medalEndsLine,
  medalFace,
  medalStillRunning,
  medalTitle,
  medalValueParts,
  type Medal,
} from "./medals";

const lazyConfetti = () => import("canvas-confetti").then((m) => m.default);

/* The ray fan's mask. `#000` is a MASK stop, not a colour: in a mask
   gradient the channel is alpha geometry and never renders (the same
   named home BadgeEarnedModal gives it). */
const RAY_MASK = "radial-gradient(circle, #000 0%, transparent 62%)";

/**
 * A medal's reveal (Soc15): the loud register DESIGN_GUIDE §14l allows
 * Social and rewards. A full screen on the dark stage, the tier's light
 * behind it, the medal swinging in on its ribbon, confetti, and the
 * medal's title, figure and dates. Share hands a square image of it to
 * the share sheet; Done closes it.
 *
 * Under Reduce Motion the medal fades in where it stays, the rays hold
 * still and nothing is thrown: the haptic and the words carry it.
 *
 * Shown once per medal and tier, by MedalRevealGate through the surface
 * coordinator (ADR-0004), never over another sheet.
 */
export default function MedalReveal({
  medal,
  onShown,
  onDone,
}: {
  medal: Medal;
  /** Called once the reveal has drawn, to record it as seen. */
  onShown?: () => void;
  onDone: () => void;
}) {
  const reduce = useReducedMotion();
  const liftUnit = useLiftUnit();
  const distanceUnit = useDistanceUnit();
  const trapRef = useFocusTrap<HTMLDivElement>();
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const tier = THEME.tier[medal.tier];
  const value = medalValueParts(medal, liftUnit, distanceUnit);

  useBackDismiss(true, onDone);

  useEffect(() => {
    onShown?.();
  }, [onShown]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDone]);

  // The moment lands once, as it opens.
  useEffect(() => {
    haptic("heavy");
    if (reduce) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    lazyConfetti()
      .then((confetti) => {
        if (cancelled) return;
        const colors = [tier, THEME.brand, THEME.brandLight, THEME.tier.gold];
        const shot = { colors, ticks: 260, gravity: 0.85, decay: 0.92 };
        timers.push(
          setTimeout(() => {
            confetti({
              ...shot,
              particleCount: 120,
              spread: 110,
              startVelocity: 44,
              origin: { y: 0.36 },
            });
          }, 380)
        );
      })
      .catch(() => {
        // No confetti where canvas is missing; the reveal stands on its own.
      });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [reduce, tier]);

  const share = useCallback(async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    try {
      const file = await generateShareImage(cardRef.current, {
        format: "square",
        background: "dark",
      });
      if (!file) {
        toast.error("Couldn't create the share image. Try again.");
        return;
      }
      const outcome = await shareImageFile(
        file,
        `${medalTitle(medal)} on Tropos`
      );
      if (outcome === "failed") toast.error("Couldn't share. Try again.");
    } finally {
      setSharing(false);
    }
  }, [medal, sharing]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 overflow-y-auto bg-stage text-stage-foreground"
      data-testid="medal-reveal"
    >
      {/* The tier's light behind the medal, and its rays. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(circle at 50% 34%, ${tier}59, transparent 62%)`,
        }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-[34%] size-[560px] -ml-[280px] -mt-[280px]"
        style={{
          background: `repeating-conic-gradient(from 0deg, ${tier}00 0deg, ${tier}33 7deg, ${tier}00 14deg)`,
          maskImage: RAY_MASK,
          WebkitMaskImage: RAY_MASK,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.55, rotate: reduce ? 0 : 360 }}
        transition={{
          opacity: { duration: 0.5, delay: reduce ? 0 : 0.3 },
          rotate: { duration: 24, repeat: Infinity, ease: "linear" },
        }}
      />

      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative mx-auto flex min-h-full w-full max-w-sm flex-col items-center justify-center gap-4 px-4 pt-[calc(var(--safe-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)] text-center"
      >
        <motion.p
          className="text-small font-semibold text-stage-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.15 }}
        >
          New medal
        </motion.p>

        <motion.div
          style={{ transformOrigin: "50% 0%" }}
          initial={
            reduce
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.35, rotate: -24, y: -60 }
          }
          animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
          transition={
            reduce
              ? { duration: 0.3 }
              : { type: "spring", stiffness: 170, damping: 11, mass: 0.9 }
          }
        >
          <MedalArt {...medalFace(medal, liftUnit, distanceUnit)} size={184} />
        </motion.div>

        <motion.div
          className="w-full min-w-0 space-y-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.45, duration: 0.3 }}
        >
          <h2
            id={titleId}
            className="text-h2 font-extrabold leading-tight text-balance break-words"
          >
            {medalTitle(medal)}
          </h2>
          <p className="text-h1 font-extrabold font-figure tabular-nums leading-tight break-words">
            {value.figure}
            {value.unit && (
              <span className="font-sans text-lg font-semibold text-stage-muted">
                {" "}
                {value.unit}
              </span>
            )}
          </p>
          <p className="text-small text-stage-muted text-pretty">
            {medalEditionDates(medal)}
            {medalStillRunning(medal)
              ? ` · Still running. ${medalEndsLine(medal)}`
              : ""}
          </p>
        </motion.div>

        <motion.div
          className="w-full space-y-2 pt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.6 }}
        >
          <Button
            variant="primary"
            fullWidth
            loading={sharing}
            leftIcon={<Share2 className="size-4" />}
            onClick={() => void share()}
          >
            Share
          </Button>
          <Button
            variant="ghost"
            fullWidth
            className="text-stage-foreground hover:bg-stage-raised"
            onClick={onDone}
          >
            Done
          </Button>
        </motion.div>
      </div>

      <MedalShareCard
        ref={cardRef}
        medal={medal}
        liftUnit={liftUnit}
        distanceUnit={distanceUnit}
      />
    </motion.div>
  );
}
