import { Camera, Check, TrendingDown } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * ProPreview — the product, shown doing the thing the paywall sells.
 *
 * The paywall used to sell Pro with a bullet list and a blurred fake
 * card. Every reference paywall (Cal AI, MacroFactor, Runna) leads with
 * the app itself — the scan result, the dashboard — because a runner
 * deciding whether to pay wants to see what they get, not read about it.
 *
 * Two frames, both drawn from tokens rather than screenshots (a PNG
 * rots the moment the real surface changes, and the capture rig cannot
 * be committed into the bundle): the AI scan result, and the adaptive
 * calorie target. Static sample data, clearly a sample — the aria copy
 * says so. Numerals take the numeral font + tabular figures per the
 * design-system invariant.
 *
 * `variant="carousel"` lays the frames out as a horizontal scroll-snap
 * rail (the Cal AI pattern) inside its OWN overflow container, so the
 * page body never scrolls sideways. `variant="single"` renders one frame
 * at full width for the contextual sheet.
 */
export type ProPreviewFrame = "scan" | "target";

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

function ScanFrame() {
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
        className="relative h-28 flex items-center justify-center"
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
        <span className="absolute top-2 left-2 text-caption font-semibold px-2 py-0.5 rounded-full bg-card/85 text-foreground">
          Photo
        </span>
        <span
          className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-caption font-semibold px-2 py-0.5 rounded-full text-white"
          style={{ background: THEME.success }}
        >
          <Check className="size-3" strokeWidth={3} />
          Read
        </span>
      </div>
      <div className="p-3 space-y-2" aria-hidden="true">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-foreground leading-tight">
            Chicken, rice and greens
          </p>
          <p className="text-base font-extrabold text-foreground font-mono tabular-nums shrink-0">
            540
            <span className="text-xs font-medium text-muted-foreground">
              {" "}
              kcal
            </span>
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SAMPLE_MACROS.map((m) => (
            <div
              key={m.label}
              className="rounded-xl p-2 text-center"
              style={{ background: `${m.color}18` }}
            >
              <p
                className="text-sm font-bold font-mono tabular-nums"
                style={{ color: m.color }}
              >
                {m.value}
              </p>
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
