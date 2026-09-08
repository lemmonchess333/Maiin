import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/utils/formatters";
import type { SessionPlayer } from "@/hooks/useSessionPlayer";
import type { SessionSegment } from "@/lib/runSegments";
import { paceBandLabel } from "@/lib/runLabels";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import type { DistanceUnit } from "@/lib/distanceUnits";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { THEME } from "@/lib/theme";

/**
 * The in-run step shell (Runna teardown #3), STRUCT-SESS-02 edition:
 * a visible state machine over the canonical `SessionSegment[]` — no
 * longer intervals-only. Tempo (warmup → blocks → cooldown) and strided
 * easy runs render through exactly the same shell.
 *
 *  - segmented per-step strip (whole session at a glance, current filling)
 *  - the live segment's PRESCRIPTION as the headline, re-suffixed with the
 *    personalized BAND when the runner has one (#18's band-first rule)
 *  - big countdown / metres-left, "Up next", a step-complete flash,
 *    a manual "Skip step" override, and a terminal all-steps-done state
 *
 * Colour: the active-run cockpit's own language (see the original header
 * note) — TEAL family, work full-strength, easier segments half voltage,
 * recovery neutral. Pinned always-dark like GuidedRunOverlay; animation is
 * opacity/width only (WKWebView-safe); reduced motion gets settled states.
 */

const TEAL = THEME.teal;
const TYPE_COLOR: Record<string, string> = {
  warmup: `${TEAL}73`,
  easy: `${TEAL}73`,
  moderate: TEAL,
  hard: TEAL,
  recovery: "rgba(255,255,255,0.35)",
  cooldown: `${TEAL}73`,
};
const TYPE_EYEBROW: Record<string, string> = {
  warmup: `${TEAL}CC`,
  easy: `${TEAL}CC`,
  moderate: TEAL,
  hard: TEAL,
  recovery: "rgba(255,255,255,0.6)",
  cooldown: `${TEAL}CC`,
};

/** A countdown shows 0:01 until it reaches zero — ceil before formatting. */
function countdownLabel(remainingS: number): string {
  return formatClock(Math.ceil(remainingS));
}

/** The prescription line: band-first when the runner has a personalized
 *  band and the segment declares its bare effort; else the built label.
 *  A2: `pacePinned` segments keep their built label — their pace IS the
 *  prescription (the user's own goal pace), not a template default the
 *  fitness band should supersede. */
function headlineFor(
  seg: SessionSegment,
  unit: DistanceUnit,
  band?: [number, number]
): string {
  if (
    band &&
    seg.effort &&
    !seg.pacePinned &&
    (seg.type === "hard" || seg.type === "moderate")
  ) {
    return `${seg.effort} at ${paceBandLabel(band, unit)}`;
  }
  return seg.label;
}

function eyebrowFor(seg: SessionSegment): string {
  if (seg.eyebrow) return seg.eyebrow;
  if (seg.type === "hard" && seg.rep && seg.totalReps) {
    return `REP ${seg.rep}/${seg.totalReps}`;
  }
  if (seg.type === "recovery" && seg.rep && seg.totalReps) {
    return `AFTER REP ${seg.rep}/${seg.totalReps}`;
  }
  if (seg.type === "moderate" && seg.rep && seg.totalReps) {
    return `BLOCK ${seg.rep}/${seg.totalReps}`;
  }
  return seg.type.toUpperCase();
}

export default function IntervalStepShell({
  player,
  band,
  onSkip,
}: {
  player: SessionPlayer;
  band?: [number, number];
  onSkip: () => void;
}) {
  const unit = useDistanceUnit();
  const reduce = useReducedMotion();
  const { segments, state, current, next, isComplete } = player;
  const idx = state.index;

  // Step-complete flash: when the live index moves past a step, show its
  // headline with a check for a beat. Reduced motion skips the flash.
  const prevIdxRef = useRef(idx);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    const prev = prevIdxRef.current;
    prevIdxRef.current = idx;
    if (idx > prev && prev >= 0 && prev < segments.length && !reduce) {
      setFlash(headlineFor(segments[prev], unit, band));
      const t = setTimeout(() => setFlash(null), 2200);
      return () => clearTimeout(t);
    }
    // segments/band identities are stable per run config; idx is the
    // real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (idx < 0) return null;

  if (isComplete) {
    return (
      <div
        className="mx-4 p-4 rounded-2xl text-center"
        style={{
          background: `${THEME.success}1F`,
          border: `1px solid ${THEME.success}4D`,
        }}
      >
        <p className="text-lg font-bold" style={{ color: THEME.success }}>
          All steps complete
        </p>
        <p className="text-xs mt-1" style={{ color: `${THEME.success}B3` }}>
          Cruise home at whatever feels good — then finish the run to save it.
        </p>
      </div>
    );
  }

  if (!current) return null;
  const isDistanceBased = current.target.kind === "distance";
  const targetValue =
    current.target.kind === "distance"
      ? current.target.meters
      : current.target.seconds;
  const liveProgress = isDistanceBased
    ? Math.min(1, state.phaseDistanceCovered / Math.max(1, targetValue))
    : Math.min(1, state.phaseElapsed / Math.max(1, targetValue));

  return (
    <div
      className="mx-4 rounded-2xl overflow-hidden"
      style={{
        background: "rgba(18, 18, 20, 0.97)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      {/* Segmented per-step strip — the whole session at a glance. */}
      <div className="flex gap-1 px-3 pt-3" aria-hidden="true">
        {segments.map((s, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.10)" }}
          >
            <div
              className={
                reduce ? "h-full" : "h-full transition-all duration-1000"
              }
              style={{
                background: TYPE_COLOR[s.type],
                width:
                  i < idx
                    ? "100%"
                    : i === idx
                      ? `${liveProgress * 100}%`
                      : "0%",
              }}
            />
          </div>
        ))}
      </div>

      <div className="p-4 pt-3 space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          {flash ? (
            <p className="text-caption font-bold tracking-wider text-success-strong min-w-0 truncate">
              ✓ {flash.toUpperCase()} DONE
            </p>
          ) : (
            <p
              className="text-caption font-bold tracking-wider"
              style={{ color: TYPE_EYEBROW[current.type] }}
            >
              {eyebrowFor(current)}
            </p>
          )}
          <p className="text-2xl font-extrabold font-mono tabular-nums text-white shrink-0 leading-none">
            {isDistanceBased
              ? `${Math.max(0, Math.round(targetValue - state.phaseDistanceCovered))} m`
              : countdownLabel(targetValue - state.phaseElapsed)}
          </p>
        </div>

        {/* The prescription IS the headline — white for maximum contrast. */}
        <p className="text-lg font-extrabold leading-tight text-white">
          {headlineFor(current, unit, band)}
        </p>

        <div className="flex items-center justify-between gap-3 pt-0.5">
          <p className="text-xs text-white/50 min-w-0 truncate">
            {next ? (
              <>
                Up next:{" "}
                <span className="text-white/70 font-medium">
                  {headlineFor(next, unit, band)}
                </span>
              </>
            ) : (
              "Last step — bring it home."
            )}
          </p>
          <button
            type="button"
            onClick={onSkip}
            className="shrink-0 min-h-[44px] px-3 -my-2 text-xs font-semibold text-white/70 active:scale-[0.97]"
            aria-label="Skip to the next step"
          >
            Skip step
          </button>
        </div>
      </div>
    </div>
  );
}
