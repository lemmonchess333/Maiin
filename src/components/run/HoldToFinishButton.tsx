/**
 * HoldToFinishButton — the active-run end affordance (run fast-launch arc,
 * PR-B, 2026-07).
 *
 * Kills the "Stop is hidden behind Pause → 3 taps to end" friction by putting
 * an end control back on the ACTIVE cluster as a press-and-hold: hold ≥1.5s and
 * the run finishes directly (the hold IS the confirmation — Strava/Runna "hold
 * to finish" parity). A radial ring fills via strokeDashoffset (transform/
 * opacity-class only — WKWebView-safe, no filter animation), with haptic ticks.
 *
 * Accessible + accidental-safe fallback: a plain tap, keyboard Enter/Space, or
 * a screen-reader activation opens the existing Stop confirm dialog instead
 * (via onRequestConfirm) — so hold users get the fast path and everyone else
 * (and every stray brush) gets the safe path. A completed hold ends the run
 * directly and swallows its trailing click. See spec `spec-run-fast-launch.md`
 * §12.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { RunControlButton } from "@/components/ui/RunControlButton";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";

const HOLD_MS = 1500;
const RING_R = 24;
const RING_C = 2 * Math.PI * RING_R;

interface HoldToFinishButtonProps {
  /** Completed hold → end the run directly (the same action the confirm
   *  dialog's "End Run" calls). */
  onFinish: () => void;
  /** Tap / keyboard / screen-reader activation → open the Stop confirm dialog
   *  (which also carries the Discard path). */
  onRequestConfirm: () => void;
  /** Hold duration in ms; overridable for tests. */
  holdMs?: number;
}

export default function HoldToFinishButton({
  onFinish,
  onRequestConfirm,
  holdMs = HOLD_MS,
}: HoldToFinishButtonProps) {
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const tickRef = useRef(0);
  const loopRef = useRef<(() => void) | null>(null);
  const [progress, setProgress] = useState(0);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    tickRef.current = 0;
    setProgress(0);
  }, []);

  // The hold loop lives in a ref so the rAF callback never references a
  // memoized function recursively (which the react-hooks rule forbids). The
  // effect refreshes the closure so it always sees the latest onFinish/holdMs.
  useEffect(() => {
    loopRef.current = () => {
      if (startRef.current == null) return;
      const p = Math.min(1, (performance.now() - startRef.current) / holdMs);
      setProgress(p);
      if (p >= 0.34 && tickRef.current < 1) {
        tickRef.current = 1;
        haptic("light");
      }
      if (p >= 0.67 && tickRef.current < 2) {
        tickRef.current = 2;
        haptic("light");
      }
      if (p >= 1) {
        completedRef.current = true;
        haptic("heavy");
        stop();
        onFinish();
        return;
      }
      rafRef.current = requestAnimationFrame(() => loopRef.current?.());
    };
  }, [holdMs, onFinish, stop]);

  const begin = useCallback(() => {
    completedRef.current = false;
    tickRef.current = 0;
    startRef.current = performance.now();
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => loopRef.current?.());
  }, []);

  // Release / slide-off / cancel before the threshold → abort silently. The
  // trailing click (from a tap) is handled by handleClick below.
  const cancel = useCallback(() => {
    if (completedRef.current) return;
    stop();
  }, [stop]);

  const handleClick = useCallback(() => {
    // A completed hold already ended the run during the pointer press; swallow
    // the trailing click so it doesn't also open the confirm dialog.
    if (completedRef.current) {
      completedRef.current = false;
      return;
    }
    onRequestConfirm();
  }, [onRequestConfirm]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  return (
    <RunControlButton
      aria-label="Finish run"
      label="HOLD"
      size="sm"
      variant="neutral"
      className="relative touch-none"
      onClick={handleClick}
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      icon={
        <>
          <svg
            className="absolute inset-0"
            width="56"
            height="56"
            viewBox="0 0 56 56"
            aria-hidden="true"
          >
            <circle
              cx="28"
              cy="28"
              r={RING_R}
              fill="none"
              stroke={THEME.running}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - progress)}
              transform="rotate(-90 28 28)"
              opacity={progress > 0 ? 1 : 0}
            />
          </svg>
          <Flag className="size-5" style={{ color: THEME.running }} />
        </>
      }
    />
  );
}
