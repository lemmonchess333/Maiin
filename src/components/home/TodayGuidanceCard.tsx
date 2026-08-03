import { THEME } from "@/lib/theme";
import type { HybridGuidance } from "@/lib/hybridGuidance";

/**
 * Hybrid loop — the cross-discipline "today" card. Connects yesterday's
 * training to today's plan + fuel, the one-app differentiator made visible.
 * Calm by design: a single guidance line + the fuel rationale, accent-tinted
 * by tone. Renders nothing when there's no guidance (data still loading).
 */
const ACCENT: Record<HybridGuidance["tone"], string> = {
  fresh: THEME.success,
  steady: THEME.brand,
  ease: THEME.warning,
};

export default function TodayGuidanceCard({
  guidance,
}: {
  guidance: HybridGuidance | null;
}) {
  if (!guidance) return null;
  const accent = ACCENT[guidance.tone];
  return (
    <div className="rounded-2xl bg-card p-4 shadow-card flex gap-3">
      <div
        className="w-1 rounded-full shrink-0"
        style={{ background: accent }}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-micro uppercase tracking-wide text-muted-foreground">
          Today
        </p>
        <p className="text-sm font-semibold text-foreground mt-0.5">
          {guidance.line}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {guidance.fuelLine}
        </p>
      </div>
    </div>
  );
}
