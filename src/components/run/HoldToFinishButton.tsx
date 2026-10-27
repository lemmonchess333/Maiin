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
 *
 * The paused screen's Stop is the same control at the large size, with its
 * own label and glyph: a hold there ends the run too, and a tap still opens
 * the dialog.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Flag } from "lucide-react";
import {
  RunControlButton,
  type RunControlSize,
} from "@/components/ui/RunControlButton";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";

const HOLD_MS = 1500;
/* The ring sits 4px inside the button's edge, at either size. */
const BUTTON_PX: Record<RunControlSize, number> = { sm: 56, lg: 76 };
const RING_INSET = 4;

interface HoldToFinishButtonProps {
  /** Completed hold → end the run directly (the same action the confirm
   *  dialog's "End run" calls). */
  onFinish: () => void;
  /** Tap / keyboard / screen-reader activation → open the Stop confirm dialog
   *  (which also carries the Discard path). */
  onRequestConfirm: () => void;
  /** Hold duration in ms; overridable for tests. */
  holdMs?: number;
  /** The caption under the button. Its word is in `ariaLabel` too. */
  label?: string;
  /** Names the gesture and contains `label` (WCAG 2.5.3). */
  ariaLabel?: string;
  size?: RunControlSize;
  /** The glyph inside the ring; the coral flag by default. */
  icon?: ReactNode;
}

export default function HoldToFinishButton({
  onFinish,
  onRequestConfirm,
  holdMs = HOLD_MS,
  label = "Finish",
  ariaLabel = "Hold to finish run",
  size = "sm",
  icon,
}: HoldToFinishButtonProps) {
  const box = BUTTON_PX[size];
  const ringR = box / 2 - RING_INSET;
  const ringC = 2 * Math.PI * ringR;
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
      /* The label says what the control does, as its siblings' do (Lock,
         Pause, Stop); the ring that fills under a press shows it wants a
         hold. The accessible name CONTAINS the label (WCAG 2.5.3 Label in
         Name), so a voice-control user saying "tap finish" reaches it, and
         it names the gesture for a screen-reader user. */
      aria-label={ariaLabel}
      label={label}
      size={size}
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
            width={box}
            height={box}
            viewBox={`0 0 ${box} ${box}`}
            aria-hidden="true"
          >
            <circle
              cx={box / 2}
              cy={box / 2}
              r={ringR}
              fill="none"
              stroke={THEME.running}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={ringC}
              strokeDashoffset={ringC * (1 - progress)}
              transform={`rotate(-90 ${box / 2} ${box / 2})`}
              opacity={progress > 0 ? 1 : 0}
            />
          </svg>
          {icon ?? <Flag className="size-5" style={{ color: THEME.running }} />}
        </>
      }
    />
  );
}
