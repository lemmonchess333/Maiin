import { TrendingDown } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { ProPreviewFrame } from "./previewFrames";
import { CALORIE_UNIT } from "@/utils/formatNutrition";
import ScanDemo from "./ScanDemo";

interface Props {
  frames?: ProPreviewFrame[];
  variant?: "carousel" | "single";
  className?: string;
}

function TargetFrame() {
  return (
    <div
      className="rounded-2xl border border-border bg-card p-3 space-y-3"
      role="img"
      aria-label={`Sample: a calorie target of 2,336 ${CALORIE_UNIT}, adapted down by 120 ${CALORIE_UNIT} this week from the weight trend`}
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
            Adapted{" "}
            <span className="font-mono tabular-nums">−120 {CALORIE_UNIT}</span>{" "}
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
  scan: ScanDemo,
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
        // items-start: the scan demo is square and the target frame is
        // not, so a stretched row would pad the target card with blank.
        "flex items-start gap-3 overflow-x-auto snap-x snap-mandatory -mx-[16px] px-[16px] pb-1",
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
