import { useEffect, useId, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Flame, Trophy } from "lucide-react";
// The display register's face: Archivo's wide heavy italic, from the
// installed package, so the two-family rule holds (DESIGN_GUIDE §4). Only
// the finish screens set it, so it loads with them and not on first paint.
import "@fontsource-variable/archivo/wdth-italic.css";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { throwConfetti } from "@/lib/confetti";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { FinishTone, RewardLine } from "@/lib/finishMoment";

const STRONG: Record<FinishTone, string> = {
  achievement: "text-achievement-strong",
  lifting: "text-lifting-strong",
  running: "text-running-strong",
};

/** Confetti in the achievement's colours, a centre burst from the object. */
const CONFETTI: Record<FinishTone, string[]> = {
  achievement: [THEME.tier.gold, THEME.amberLight, THEME.textPrimary],
  lifting: [THEME.lifting, THEME.liftingLight, THEME.textPrimary],
  running: [THEME.running, THEME.runningLight, THEME.textPrimary],
};

/** Rule 32: confetti for a first, a new best and a finished plan, thrown
 *  once as the reward appears, and never under Reduce Motion. It leaves
 *  with the screen: Done stops it, so none of it falls on the next page. */
function useFinishConfetti(tone: FinishTone | null, on: boolean) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!on || !tone || reduce) return;
    let stop: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      stop = throwConfetti([
        {
          colors: CONFETTI[tone],
          particleCount: 90,
          spread: 90,
          startVelocity: 40,
          ticks: 220,
          gravity: 0.9,
          decay: 0.92,
          scalar: 0.9,
          origin: { y: 0.3 },
          disableForReducedMotion: true,
        },
      ]);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      stop?.();
    };
  }, [on, tone, reduce]);
}

export type FinishFigure =
  { to: number; format: (n: number) => string } | { value: string };

/** A figure longer than five characters steps down, so "12,345" fits a
 *  320 px screen in the wide cut. */
function displayScale(text: string): number {
  return text.length <= 5 ? 1 : text.length === 6 ? 0.86 : 0.74;
}

/**
 * The top of a finish screen (DS4, DESIGN_GUIDE §0 rule 12, §14m rules
 * 29-31): the date and time as a kicker, the session's picture (or a
 * run's map as a full-bleed band), the session's name, one display figure
 * with its caption, and one line.
 *
 * `tone` makes it the reward: the object stands in a glow of the
 * achievement's colour, the line's figure takes the colour, and
 * `confetti` throws once. Without a tone it is the calm summary, the same
 * structure on the plain page.
 */
export default function FinishHero({
  kicker,
  tone,
  confetti = false,
  picture,
  band,
  title,
  titleLevel = 2,
  figure,
  caption,
  line,
  lineIcon,
  fill = false,
}: {
  kicker: string;
  tone: FinishTone | null;
  confetti?: boolean;
  /** The object: the session's drawing, centred, about two thirds of the
   *  screen's width. */
  picture?: ReactNode;
  /** A full-bleed band in the picture's place: a run's map (rule 23). It
   *  is drawn to fill its area (`absolute inset-0`, wider for full bleed). */
  band?: ReactNode;
  title: string;
  titleLevel?: 1 | 2;
  figure: FinishFigure;
  caption: string;
  /** The reward's sentence, its figure drawn in the tone; or a plain line
   *  on the summary. */
  line?: RewardLine | string | null;
  lineIcon?: "trophy" | "flame" | null;
  /** Fill the height the page gives it: the object's area grows into the
   *  space, so the first screen has no empty band under its line (DS4,
   *  owner 7 November 2026). The page sizes it to leave the next section
   *  peeking above the pinned buttons. */
  fill?: boolean;
}) {
  const reduce = useReducedMotion();
  const titleId = useId();
  useFinishConfetti(tone, confetti);
  const figureText =
    "value" in figure ? figure.value : figure.format(figure.to);
  /* The achievement's light behind the object (`.ds-finish-glow`, its
     colour picked by `data-finish-glow`): the reward's colour is the
     object and its light, never a field (§14m rules 13, 14 and 31). */
  const glow = tone && (
    <div
      aria-hidden="true"
      data-finish-glow={tone}
      className="ds-finish-glow pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(100%,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-full"
    />
  );
  const Icon =
    lineIcon === "trophy" ? Trophy : lineIcon === "flame" ? Flame : null;
  const headingClass =
    "text-xl font-bold leading-tight tracking-tight text-foreground text-balance";

  return (
    <section
      aria-labelledby={titleId}
      data-finish-register={tone ? "reward" : "summary"}
      className={cn(
        "relative flex flex-col items-center text-center",
        fill && "flex-1"
      )}
    >
      {band && (
        <div
          className={cn(
            "relative w-full",
            fill ? "min-h-[38svh] flex-1" : "h-[38svh]"
          )}
        >
          {band}
        </div>
      )}
      <p className={cn("text-sm text-muted-foreground", band ? "mt-4" : "")}>
        <InlineNumerals>{kicker}</InlineNumerals>
      </p>
      {picture && (
        <div
          data-finish-object
          className={cn(
            "relative mt-2 flex w-full items-center justify-center",
            fill
              ? "min-h-[clamp(200px,34svh,300px)] flex-1"
              : "h-[clamp(200px,34svh,300px)]"
          )}
        >
          {glow}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={reduce ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.34, 1.4, 0.64, 1] }}
          >
            {picture}
          </motion.div>
        </div>
      )}
      <div className="relative mt-3 w-full">
        {!picture && glow}
        {titleLevel === 1 ? (
          <h1 id={titleId} className={cn("relative", headingClass)}>
            <InlineNumerals>{title}</InlineNumerals>
          </h1>
        ) : (
          <h2 id={titleId} className={cn("relative", headingClass)}>
            <InlineNumerals>{title}</InlineNumerals>
          </h2>
        )}
        <p
          data-finish-figure
          className="ds-display-figure relative mt-1 text-foreground"
          style={
            { "--display-scale": displayScale(figureText) } as CSSProperties
          }
        >
          {"value" in figure ? (
            figure.value
          ) : (
            <AnimatedNumber
              value={figure.to}
              format={figure.format}
              duration={0.6}
            />
          )}
        </p>
        <p
          data-finish-caption
          className="relative mt-1 text-base text-muted-foreground"
        >
          <InlineNumerals>{caption}</InlineNumerals>
        </p>
      </div>
      {line && (
        <motion.p
          data-finish-line
          className="mt-5 flex max-w-[22rem] items-start justify-center gap-2 text-base font-semibold leading-snug text-foreground text-balance"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          {Icon && tone && (
            <Icon
              aria-hidden="true"
              className={cn("mt-0.5 size-5 shrink-0", STRONG[tone])}
            />
          )}
          <span>
            {/* A plain line is read as one run of text, as it was
                written (the pace verdict, what comes next). */}
            {typeof line === "string" ? (
              line
            ) : (
              <>
                <InlineNumerals>{line.before}</InlineNumerals>
                <span className={cn(tone ? STRONG[tone] : undefined)}>
                  <InlineNumerals>{line.figure}</InlineNumerals>
                </span>
                <InlineNumerals>{line.after}</InlineNumerals>
              </>
            )}
          </span>
        </motion.p>
      )}
    </section>
  );
}
