import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useBackDismiss } from "@/lib/backDismiss";
import { haptic } from "@/lib/haptic";
import { THEME } from "@/lib/theme";
import { LEAGUE_LIGHT } from "@/features/league/leaguePalettes";
import { resultTitle, weekOfLine, type LeagueResult } from "./league";
import { ordinal } from "./leagueRules";
import TierBadge from "./TierBadge";

const lazyConfetti = () => import("canvas-confetti").then((m) => m.default);

/* The ray fan's mask. `#000` is a MASK stop, not a colour: in a mask
   gradient the channel is alpha geometry and never renders (the medal
   reveal gives it the same home). */
const RAY_MASK = "radial-gradient(circle, #000 0%, transparent 62%)";

/** The badge's width on the reveal. */
const BADGE = 168;

function throwConfetti(tierColour: string) {
  lazyConfetti()
    .then((confetti) => {
      const colors = [
        tierColour,
        THEME.brand,
        THEME.brandLight,
        THEME.tier.gold,
      ];
      const defaults = { colors, ticks: 220, gravity: 0.9, decay: 0.92 };
      confetti({
        ...defaults,
        particleCount: 90,
        spread: 90,
        startVelocity: 40,
        origin: { y: 0.4 },
      });
    })
    .catch(() => {
      // No confetti where canvas is missing; the rise stands on its own.
    });
}

/**
 * A league week's result (Soc15 call 3), full screen on the dark stage the
 * medal reveal uses: the loud register DESIGN_GUIDE §14l allows Social.
 * The new tier's badge in its light, the result in a sentence ("You moved
 * up to Silver"), the place and points, and See your league and Done.
 *
 * A rise gets the tier's rays, the badge springing in and confetti; a
 * week held gets the light and the badge; a fall gets the badge settling
 * in under a softer light, and the words say only what happened. Under
 * Reduce Motion the badge fades in where it stays, the rays hold still
 * and nothing is thrown.
 *
 * Shown once per result per device, by LeagueResultGate through the
 * surface coordinator (ADR-0004), never over another sheet. Escape, back
 * and Done close it; focus is held inside and starts on the headline.
 */
export default function LeagueResultReveal({
  result,
  onShown,
  onDone,
}: {
  result: LeagueResult;
  /** Called once the reveal has drawn, to record it as seen. */
  onShown?: () => void;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const trapRef = useFocusTrap<HTMLDivElement>();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const tier = result.newTier;
  const metal = LEAGUE_LIGHT[tier];
  const rose = result.outcome === "up";
  const fell = result.outcome === "down";

  useBackDismiss(true, onDone);

  useEffect(() => {
    onShown?.();
  }, [onShown]);

  useEffect(() => {
    titleRef.current?.focus();
    haptic(rose ? "success" : "light");
    if (!rose || reduce) return;
    // On the badge's arrival, not before it: fired as the screen opened,
    // the confetti fell while the screen was still fading in and before
    // the badge's spring peaked (~315 ms). The finish screen waits the
    // same way (FinishHero).
    const timer = window.setTimeout(() => throwConfetti(metal), 300);
    return () => window.clearTimeout(timer);
    // Once, as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-stage text-stage-foreground"
      data-testid="league-result-reveal"
      data-outcome={result.outcome}
    >
      {/* The new tier's light. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(circle at 50% 34%, ${metal}${fell ? "33" : "59"}, transparent 62%)`,
        }}
      />
      {/* A rise's rays. */}
      <AnimatePresence>
        {rose && (
          <motion.div
            key="rays"
            aria-hidden="true"
            className="pointer-events-none fixed left-1/2 top-[34%] size-[560px] -ml-[280px] -mt-[280px]"
            style={{
              background: `repeating-conic-gradient(from 0deg, ${metal}00 0deg, ${metal}33 7deg, ${metal}00 14deg)`,
              maskImage: RAY_MASK,
              WebkitMaskImage: RAY_MASK,
            }}
            initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
            animate={{ opacity: 0.55, scale: 1, rotate: reduce ? 0 : 360 }}
            transition={{
              opacity: { duration: 0.4 },
              scale: { duration: reduce ? 0 : 0.5 },
              rotate: { duration: 24, repeat: Infinity, ease: "linear" },
            }}
          />
        )}
      </AnimatePresence>

      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative mx-auto flex min-h-full w-full max-w-sm flex-col items-center justify-center gap-4 px-4 pt-[calc(var(--safe-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)] text-center"
      >
        <p className="text-small font-semibold text-stage-muted">
          Your league week
        </p>

        <motion.div
          aria-hidden="true"
          initial={
            reduce
              ? { opacity: 0 }
              : rose
                ? { opacity: 0, scale: 0.4, rotate: -12 }
                : { opacity: 0, y: fell ? -16 : 8, scale: 0.92 }
          }
          animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
          transition={
            reduce
              ? { duration: 0.3 }
              : rose
                ? { type: "spring", stiffness: 260, damping: 14, delay: 0.1 }
                : { duration: 0.5, ease: "easeOut", delay: 0.1 }
          }
          style={{
            filter: `drop-shadow(0 0 28px ${metal}66)`,
          }}
        >
          <TierBadge tier={tier} size={BADGE} />
        </motion.div>

        <motion.div
          className="w-full min-w-0 space-y-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.35, duration: 0.3 }}
        >
          {/* Focused as the reveal opens, so a screen reader starts on
              the result. Not a control, so no ring: the global
              :focus-visible outline is unlayered and would draw one on a
              programmatic focus, which only an inline style outranks. */}
          <h2
            ref={titleRef}
            id={titleId}
            tabIndex={-1}
            className="text-h2 font-extrabold leading-tight text-balance break-words"
            style={{ outline: "none" }}
          >
            {resultTitle(result)}
          </h2>
          <p className="text-body font-semibold text-stage-foreground">
            <span className="font-figure tabular-nums">
              {ordinal(result.rank)}
            </span>{" "}
            of <span className="font-figure tabular-nums">{result.of}</span>
            {" · "}
            <span className="font-figure tabular-nums">
              {result.points}
            </span>{" "}
            {result.points === 1 ? "point" : "points"}
          </p>
          <p className="text-small text-stage-muted">
            {weekOfLine(result.weekKey)}
            {fell ? " · A new week has started" : ""}
          </p>
        </motion.div>

        <motion.div
          className="w-full space-y-2 pt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.5 }}
        >
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              onDone();
              navigate("/league");
            }}
          >
            See your league
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
    </motion.div>
  );
}
