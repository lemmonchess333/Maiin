import { motion } from "framer-motion";
import { Camera, Check, TrendingDown } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { ProPreviewFrame } from "./previewFrames";

interface Props {
  frames?: ProPreviewFrame[];
  variant?: "carousel" | "single";
  className?: string;
}

const SAMPLE_MACROS: { label: string; value: string; color: string }[] = [
  { label: "Protein", value: "38g", color: THEME.teal },
  { label: "Carbs", value: "52g", color: THEME.brand },
  { label: "Fat", value: "18g", color: THEME.semantic.nutrition },
];

/**
 * The scan, happening. One loop of three beats — the photo, Pro reading
 * it, the macros filling in — because a runner deciding whether to pay
 * wants to see the thing work, and a still of the result is a picture of
 * a feature rather than the feature. Not a video: an asset rots the moment
 * the real surface changes; this is the frame's own markup, timed.
 *
 * The glow recipe applies (WKWebView-safe): every layer animates ONLY
 * `opacity` and `transform` — never a filter, a size or a colour. It is
 * the one ambient loop on its surface (`LOOP` is defined once and shared
 * by every layer so there is one clock, not three). Reduced motion gets
 * the settled result — no entrance, no loop — which is also the state
 * the screen reader's label describes.
 */
const LOOP_S = 5.2;
/** Beat boundaries, seconds into the loop: photo → reading → result. */
const READING_AT = 1.4;
const RESULT_AT = 2.9;
const FADE_S = 0.25;
const LOOP = { duration: LOOP_S, repeat: Infinity, ease: "linear" } as const;

/** Opacity keyframes for a layer that is on between `from` and `to`. */
function on(from: number, to: number) {
  const t = (x: number) => Math.min(1, Math.max(0, x / LOOP_S));
  const rise = from === 0;
  const hold = to >= LOOP_S;
  return {
    opacity: rise
      ? [1, 1, 0, 0, 1]
      : hold
        ? [0, 0, 1, 1, 1]
        : [0, 0, 1, 1, 0, 0],
    times: rise
      ? [0, t(to), t(to + FADE_S), 1 - FADE_S / LOOP_S, 1]
      : hold
        ? [0, t(from), t(from + FADE_S), 1 - FADE_S / LOOP_S, 1]
        : [0, t(from), t(from + FADE_S), t(to), t(to + FADE_S), 1],
  };
}

function ScanFrame() {
  const live = !useReducedMotion();
  return (
    <div
      className="rounded-2xl border border-border bg-card overflow-hidden"
      role="img"
      aria-label="Sample: a meal photo, read by Pro as chicken, rice and greens — 540 kcal, 38g protein, 52g carbs, 18g fat"
    >
      {/* The photo slot. A wash, not a picture: meal photos are device-
          local by lock (Food9) and a stock plate would be an asset that
          ages. The camera glyph says what the slot is. */}
      <div
        className="relative h-28 flex items-center justify-center overflow-hidden"
        style={{
          background: `linear-gradient(160deg, ${THEME.food.scan}33, ${THEME.semantic.nutrition}1F 60%, ${THEME.brand}14)`,
        }}
        aria-hidden="true"
      >
        <span
          className="size-12 rounded-2xl flex items-center justify-center bg-card/80"
          style={{ color: THEME.food.scan }}
        >
          <Camera className="size-6" strokeWidth={2} />
        </span>
        {/* Beat 1 — the photo. Shown through the reading beat too. */}
        <motion.span
          data-beat={live ? "photo" : undefined}
          className="absolute top-2 left-2 text-caption font-semibold px-2 py-0.5 rounded-full bg-card/85 text-foreground"
          animate={live ? on(0, RESULT_AT) : undefined}
          transition={live ? LOOP : undefined}
          style={live ? undefined : { opacity: 1 }}
        >
          Photo
        </motion.span>
        {/* Beat 2 — Pro reading it: a pill and a scan line sweeping the
            slot. Absent under reduced motion; the settled state has no
            "reading" in it. */}
        {live && (
          <>
            <motion.span
              data-beat="reading"
              className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-caption font-semibold px-2 py-0.5 rounded-full bg-card/85 text-foreground"
              animate={on(READING_AT, RESULT_AT)}
              transition={LOOP}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ background: THEME.food.scan }}
              />
              Reading…
            </motion.span>
            <motion.span
              data-beat="reading"
              className="absolute inset-x-3 h-px rounded-full"
              style={{ background: THEME.food.scan, top: 12 }}
              animate={{
                ...on(READING_AT, RESULT_AT),
                y: [0, 0, 0, 88, 88, 0],
              }}
              transition={LOOP}
            />
          </>
        )}
        {/* Beat 3 — read. The settled badge. */}
        <motion.span
          data-beat={live ? "result" : undefined}
          className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-caption font-semibold px-2 py-0.5 rounded-full text-white"
          style={{ background: THEME.success }}
          animate={live ? on(RESULT_AT, LOOP_S) : undefined}
          transition={live ? LOOP : undefined}
        >
          <Check className="size-3" strokeWidth={3} />
          Read
        </motion.span>
      </div>
      <div className="p-3 space-y-2" aria-hidden="true">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-foreground leading-tight">
            Chicken, rice and greens
          </p>
          <motion.p
            data-beat={live ? "result" : undefined}
            className="text-base font-extrabold text-foreground font-mono tabular-nums shrink-0"
            animate={
              live
                ? { ...on(RESULT_AT, LOOP_S), y: [4, 4, 0, 0, 0] }
                : undefined
            }
            transition={live ? LOOP : undefined}
          >
            540
            <span className="text-xs font-medium text-muted-foreground">
              {" "}
              kcal
            </span>
          </motion.p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SAMPLE_MACROS.map((m) => (
            <div
              key={m.label}
              className="rounded-xl p-2 text-center"
              style={{ background: `${m.color}18` }}
            >
              <motion.p
                data-beat={live ? "result" : undefined}
                className="text-sm font-bold font-mono tabular-nums"
                style={{ color: m.color }}
                animate={
                  live
                    ? { ...on(RESULT_AT, LOOP_S), y: [4, 4, 0, 0, 0] }
                    : undefined
                }
                transition={live ? LOOP : undefined}
              >
                {m.value}
              </motion.p>
              <p className="text-caption text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TargetFrame() {
  return (
    <div
      className="rounded-2xl border border-border bg-card p-3 space-y-3"
      role="img"
      aria-label="Sample: a calorie target of 2,336 kcal, adapted down by 120 kcal this week from the weight trend"
    >
      <div aria-hidden="true">
        <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
          Calorie target
        </p>
        <p className="text-2xl font-extrabold text-foreground font-mono tabular-nums leading-tight">
          2,336
          <span className="text-xs font-medium text-muted-foreground">
            {" "}
            kcal
          </span>
        </p>
      </div>
      <div
        className="flex items-start gap-2 rounded-xl p-2.5"
        style={{ background: `${THEME.brand}14` }}
        aria-hidden="true"
      >
        <span
          className="size-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${THEME.brand}1F`, color: THEME.brand }}
        >
          <TrendingDown className="size-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground leading-snug">
            Adapted <span className="font-mono tabular-nums">−120 kcal</span>{" "}
            this week
          </p>
          <p className="text-caption text-muted-foreground leading-snug">
            Weight trend flat at your last target, so it moved.
          </p>
        </div>
      </div>
      <div className="space-y-1" aria-hidden="true">
        <div className="flex justify-between text-caption text-muted-foreground">
          <span>Logged today</span>
          <span className="font-mono tabular-nums">1,412 / 2,336</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: "60%", background: THEME.brand }}
          />
        </div>
      </div>
    </div>
  );
}

const FRAME: Record<ProPreviewFrame, () => React.JSX.Element> = {
  scan: ScanFrame,
  target: TargetFrame,
};

export default function ProPreview({
  frames = ["scan", "target"],
  variant = "carousel",
  className,
}: Props) {
  if (variant === "single") {
    const Frame = FRAME[frames[0] ?? "scan"];
    return (
      <div className={className}>
        <Frame />
      </div>
    );
  }
  return (
    <div
      className={cn(
        // The rail is the ONE element allowed to scroll sideways, inside
        // its own container; a snap point per frame, a peek of the next.
        "flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      aria-label="What Pro looks like"
      role="group"
    >
      {frames.map((key) => {
        const Frame = FRAME[key];
        return (
          <div key={key} className="snap-center shrink-0 w-[84%] max-w-[320px]">
            <Frame />
          </div>
        );
      })}
    </div>
  );
}
