import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import ShareCardRenderer from "@/components/share/ShareCardRenderer";
import { useAuth } from "@/lib/auth";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useBackDismiss } from "@/lib/backDismiss";
import { haptic } from "@/lib/haptic";
import { generateShareImage, shareImageFile } from "@/lib/shareCardGenerator";
import { THEME } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonthYear } from "@/utils/formatters";
import { anniversaryWords } from "@/lib/anniversaries";
import type { DueAnniversary } from "@/lib/anniversaryStore";

/* The ray fan's mask. `#000` is a MASK stop, not a colour: in a mask
   gradient the channel is alpha geometry and never renders (the league
   and medal reveals give it the same home). */
const RAY_MASK = "radial-gradient(circle, #000 0%, transparent 62%)";

/** The medallion's width: about half a phone's (§14m rule 30). */
const MEDALLION = 184;

/**
 * An earned anniversary (App1 Q58): the 50th or 100th session, a year of
 * Tropos or 1,000 km run, full screen on the dark stage the league and
 * medal reveals use (LeagueResultReveal, MedalReveal), over the finish
 * screen of the session that earned it.
 *
 * One object, a medallion holding the figure in the display register, in
 * the achievement's colour (§14m rules 30-31): the brand's purple for a
 * count of sessions or a year, as a streak's flame is, and the running
 * coral for kilometres. No confetti, which rule 32 keeps for a first, a
 * new best and a finished plan; a milestone of keeping at it is a
 * streak's kind. The headline names it in five words or fewer, the
 * sentence says what, how much and since when. Share hands a square
 * card of it to the share sheet (`ShareCardRenderer`'s anniversary card,
 * through `shareCardGenerator`, as the medal's Share does); Done, Escape
 * and back close it.
 *
 * Under Reduce Motion the medallion fades in where it stays and the rays
 * hold still. Focus is held inside and starts on the headline.
 */
export default function AnniversaryReveal({
  anniversary,
  onShown,
  onDone,
}: {
  anniversary: DueAnniversary;
  /** Called once the reveal has drawn, to record it as shown. */
  onShown?: () => void;
  onDone: () => void;
}) {
  const reduce = useReducedMotion();
  const trapRef = useFocusTrap<HTMLDivElement>();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const { profile } = useAuth();
  const unit = useDistanceUnit();
  const words = anniversaryWords(anniversary.kind, anniversary.since);
  const colour = words.tone === "running" ? THEME.running : THEME.brand;

  useBackDismiss(true, onDone);

  useEffect(() => {
    onShown?.();
  }, [onShown]);

  useEffect(() => {
    titleRef.current?.focus();
    haptic("success");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDone]);

  const share = useCallback(async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    try {
      const file = await generateShareImage(cardRef.current, {
        format: "square",
        background: "brand",
      });
      if (!file) {
        toast.error("Couldn’t create the share image. Try again.");
        return;
      }
      const outcome = await shareImageFile(file, `${words.headline} on Tropos`);
      if (outcome === "failed") toast.error("Couldn’t share. Try again.");
    } finally {
      setSharing(false);
    }
  }, [sharing, words.headline]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-stage text-stage-foreground"
      data-testid="anniversary-reveal"
      data-kind={anniversary.kind}
    >
      {/* The achievement's light. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(circle at 50% 34%, ${colour}59, transparent 62%)`,
        }}
      />
      {/* Its rays. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-[34%] size-[560px] -ml-[280px] -mt-[280px]"
        style={{
          background: `repeating-conic-gradient(from 0deg, ${colour}00 0deg, ${colour}33 7deg, ${colour}00 14deg)`,
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

      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative mx-auto flex min-h-full w-full max-w-sm flex-col items-center justify-center gap-4 px-4 pt-[calc(var(--safe-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)] text-center"
      >
        <p className="text-small font-semibold text-stage-muted">
          {words.kicker}
        </p>

        {/* The medallion: the figure, in the achievement's colour. */}
        <motion.div
          aria-hidden="true"
          className="flex flex-col items-center justify-center rounded-full"
          style={{
            width: MEDALLION,
            height: MEDALLION,
            border: `6px solid ${colour}`,
            boxShadow: `0 0 36px ${colour}66, inset 0 0 28px ${colour}33`,
          }}
          initial={
            reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -12 }
          }
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={
            reduce
              ? { duration: 0.3 }
              : { type: "spring", stiffness: 260, damping: 14, delay: 0.1 }
          }
        >
          <span
            className="font-figure font-black italic tabular-nums leading-none"
            style={{
              color: colour,
              fontSize: words.figure.length > 3 ? 52 : 72,
              fontStretch: "125%",
            }}
          >
            {words.figure}
          </span>
          <span className="mt-1 text-small font-semibold text-stage-muted">
            {words.unit}
          </span>
        </motion.div>

        <motion.div
          className="w-full min-w-0 space-y-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.35, duration: 0.3 }}
        >
          {/* Focused as the reveal opens, so a screen reader starts on
              it. Not a control, so no ring (LeagueResultReveal says why
              the outline is set inline). */}
          <h2
            ref={titleRef}
            id={titleId}
            tabIndex={-1}
            className="text-h2 font-extrabold leading-tight text-balance break-words"
            style={{ outline: "none" }}
          >
            {words.headline}
          </h2>
          <p className="text-body text-stage-foreground text-pretty">
            {words.line}
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

      <ShareCardRenderer
        ref={cardRef}
        data={{
          unit,
          template: "anniversary",
          format: "square",
          background: "brand",
          handle: profile?.displayName ?? "",
          date: formatDayMonthYear(parseLocalDate(anniversary.day)),
          headline: words.headline,
          line: words.line,
          tone: words.tone,
          figure: words.figure,
          figureUnit: words.unit,
        }}
      />
    </motion.div>
  );
}
