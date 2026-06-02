import { THEME } from "@/lib/theme";

/**
 * Nutr2 / #981 — the "Personalizing your metabolism" warmup indicator.
 *
 * Tier-1 ambient/inline (NOT a popup or toast): a thin progress bar that
 * annotates the calorie target while the adaptive-TDEE estimator collects
 * enough data. `fraction` is the gate-completeness (0..1) and only reaches 1
 * when the gate truly clears, so the bar can't promise an unlock it won't
 * honor. `stalled` (the user has fallen behind the rolling window) swaps the
 * sub-label for a gentle "keep logging" nudge.
 *
 * Purely presentational — all logic lives in `useAdaptiveTdee` + the pure
 * `adaptiveTdee`/`adaptiveTarget` helpers.
 */
export default function AdaptiveWarmupBar({
  fraction,
  stalled,
}: {
  /** 0..1 fill (already latched/clamped upstream). */
  fraction: number;
  /** True when progress has slipped behind the window. */
  stalled: boolean;
}) {
  const pct = Math.round(Math.max(0, Math.min(fraction, 1)) * 100);

  return (
    <div className="mt-2" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] font-medium text-muted-foreground/80">
          Personalizing your metabolism
        </span>
        <span
          className="text-[10px] font-mono tabular-nums text-muted-foreground/60"
          aria-hidden="true"
        >
          {pct}%
        </span>
      </div>
      <div
        className="h-1 rounded-full overflow-hidden"
        style={{ background: "rgba(123, 114, 233, 0.12)" }}
      >
        <div
          className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
          style={{ width: `${pct}%`, background: THEME.brand }}
        />
      </div>
      {stalled && (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          Keep logging meals + weigh-ins to keep personalizing.
        </p>
      )}
    </div>
  );
}
