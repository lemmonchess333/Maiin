import { Sparkles, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useScanUsage } from "@/hooks/useScanUsage";

/**
 * F1b lock pin #6 — Settings page daily-usage pill.
 *
 * Shows the user's per-action AI scan counters (text_ai +
 * image_ai). Free users see their text-AI counter and a Pro-only
 * hint for image-AI; the row is tappable and routes to /upgrade.
 * Pro users see both counters with no upgrade CTA.
 *
 * The hook (`useScanUsage`) is the source of truth for the
 * limit + remaining values; the row only renders the display.
 * The server-side counter (`functions/lib/aiScanQuota.js`) is
 * authoritative for the actual gate — this pill is informational.
 *
 * Trial users (isInTrial=true) are treated as Pro by the hook so
 * they see the Pro view here as well — the trial experience
 * showcases the value Sub1a P1 set up for them.
 */
export default function AiUsageSection() {
  const navigate = useNavigate();
  const textAi = useScanUsage("text_ai");
  const imageAi = useScanUsage("image_ai");

  if (textAi.loading || imageAi.loading) {
    // Skeleton stays in shape with the rendered row so layout
    // doesn't jump when the snapshot arrives.
    return (
      <div
        className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card"
        aria-busy="true"
      >
        <Sparkles className="size-5 text-muted-foreground" aria-hidden="true" />
        <div className="flex-1 h-5 rounded bg-muted/40" />
      </div>
    );
  }

  // isUnlimited === Pro or trial. Hook handles the resolution; we
  // don't re-derive here so the trial bypass stays single-source.
  const isPro = textAi.isUnlimited;

  if (isPro) {
    return (
      <div
        className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card"
        role="group"
        aria-label="AI usage today"
      >
        <Sparkles className="size-5 text-primary" aria-hidden="true" />
        <div className="text-left">
          <p className="text-sm font-medium text-foreground">AI usage today</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            Text: {textAi.used} / {textAi.limit} · Image: {imageAi.used} /{" "}
            {imageAi.limit}
          </p>
        </div>
      </div>
    );
  }

  // Free user: text counter visible + image is Pro-only. Whole row
  // taps through to /upgrade — F1b lock pin #6 says "tap → upgrade
  // flow for free users".
  return (
    <button
      type="button"
      onClick={() => navigate("/upgrade")}
      className="w-full flex items-center justify-between p-4 rounded-2xl bg-card"
      aria-label="AI usage today — upgrade to Pro"
    >
      <div className="flex items-center gap-3">
        <Sparkles className="size-5 text-primary" aria-hidden="true" />
        <div className="text-left">
          <p className="text-sm font-medium text-foreground">AI usage today</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            Text: {textAi.used} / {textAi.limit} · Image is Pro-only
          </p>
        </div>
      </div>
      <ChevronRight
        className="size-4 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}
