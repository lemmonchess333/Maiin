import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { useBackDismiss } from "@/lib/backDismiss";
import { generateShareImage, shareImageFile } from "@/lib/shareCardGenerator";
import { THEME } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { SealPrompt, SealStage } from "@/features/streaks/SealCeremony";
import { useSealBreak } from "@/features/streaks/useSealBreak";
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

/* The ray fan's mask. `#000` is a MASK stop, not a colour: in a mask
   gradient the channel is alpha geometry and never renders (the same
   named home BadgeEarnedModal gives it). */
const RAY_MASK = "radial-gradient(circle, #000 0%, transparent 62%)";

/** The medal's width on the reveal, and the seal's; MedalArt is 3 wide
 *  to 4 tall. */
const MEDAL_W = 184;
const MEDAL_H = Math.round((MEDAL_W * 4) / 3);

/**
 * A medal's reveal (Soc15): the loud register DESIGN_GUIDE §14l allows
 * Social and rewards. A full screen on the dark stage, with the tier's
 * light behind it, opening as a new badge does (owner, 3 November 2026):
 * on the badges' sealed capsule in the medal's tier, which the person
 * taps open (SealStage and useSealBreak, the badge's own ceremony, so the
 * taps, sounds, haptics and confetti are the same). The medal is what is
 * inside: it blooms out of the shatter with the tier's rays, and its
 * title, figure and dates follow, with Share, which hands a square image
 * of it to the share sheet, and Done. Share and Done are there only once
 * the seal is broken; Escape and back close the reveal at any point.
 *
 * Under Reduce Motion one tap opens it, nothing shakes, shatters or is
 * thrown, and the rays hold still: the haptic, the chime and the words
 * carry it.
 *
 * The words and buttons under the seal are laid out from the start,
 * unseen, so breaking it moves nothing on the screen.
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
  const liftUnit = useLiftUnit();
  const distanceUnit = useDistanceUnit();
  const trapRef = useFocusTrap<HTMLDivElement>();
  // After the trap, so it has recorded what had focus before the seal took it.
  const seal = useSealBreak({
    tier: medal.tier,
    opening: true,
    confetti: true,
  });
  const { reduce, revealed } = seal;
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
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

  // The seal's button goes with the break, and focus would go with it:
  // it moves to the medal's title, so a screen reader says what was
  // inside before it reaches Share and Done.
  useEffect(() => {
    if (revealed) titleRef.current?.focus();
  }, [revealed]);

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
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-stage text-stage-foreground"
      data-testid="medal-reveal"
      // Until it breaks, a tap anywhere is a tap on the seal, as on the
      // badge's: the moment cannot be skipped by tapping beside it.
      onClick={revealed ? undefined : seal.tap}
    >
      {/* The tier's light behind the seal, and behind the medal after it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(circle at 50% 34%, ${tier}59, transparent 62%)`,
        }}
      />
      {/* Its rays, blooming in on the break. */}
      <AnimatePresence>
        {revealed && (
          <motion.div
            key="rays"
            aria-hidden="true"
            className="pointer-events-none fixed left-1/2 top-[34%] size-[560px] -ml-[280px] -mt-[280px]"
            style={{
              background: `repeating-conic-gradient(from 0deg, ${tier}00 0deg, ${tier}33 7deg, ${tier}00 14deg)`,
              maskImage: RAY_MASK,
              WebkitMaskImage: RAY_MASK,
            }}
            initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
            animate={{ opacity: 0.55, scale: 1, rotate: reduce ? 0 : 360 }}
            transition={{
              opacity: { duration: 0.4 },
              scale: { duration: 0.5 },
              rotate: { duration: 24, repeat: Infinity, ease: "linear" },
            }}
          />
        )}
      </AnimatePresence>

      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          revealed
            ? undefined
            : `New ${medal.tier} medal. Tap the seal to break it open`
        }
        aria-labelledby={revealed ? titleId : undefined}
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

        <SealStage
          seal={seal}
          prize={`new ${medal.tier} medal`}
          sealWidth={MEDAL_W}
          prizeWidth={MEDAL_W}
          prizeHeight={MEDAL_H}
          prizeHidden
        >
          <MedalArt
            {...medalFace(medal, liftUnit, distanceUnit)}
            size={MEDAL_W}
          />
        </SealStage>

        <div className="relative w-full">
          <SealPrompt seal={seal} className="absolute inset-x-0 top-0" />
          {/* Laid out from the start so the break moves nothing, and out
              of sight, reach and the accessibility tree until it. The
              buttons are disabled until then too, so the focus trap
              counts only the seal. */}
          <div
            className="w-full space-y-4"
            style={{ visibility: revealed ? "visible" : "hidden" }}
          >
            <motion.div
              className="w-full min-w-0 space-y-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: revealed ? 1 : 0 }}
              transition={{ delay: reduce ? 0 : 0.45, duration: 0.3 }}
            >
              <h2
                ref={titleRef}
                id={titleId}
                tabIndex={-1}
                className="text-h2 font-extrabold leading-tight text-balance break-words focus:outline-none"
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
              animate={{ opacity: revealed ? 1 : 0 }}
              transition={{ delay: reduce ? 0 : 0.6 }}
            >
              <Button
                variant="primary"
                fullWidth
                disabled={!revealed}
                loading={sharing}
                leftIcon={<Share2 className="size-4" />}
                onClick={() => void share()}
              >
                Share
              </Button>
              <Button
                variant="ghost"
                fullWidth
                disabled={!revealed}
                className="text-stage-foreground hover:bg-stage-raised"
                onClick={onDone}
              >
                Done
              </Button>
            </motion.div>
          </div>
        </div>
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
