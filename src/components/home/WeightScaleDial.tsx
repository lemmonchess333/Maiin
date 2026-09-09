import { useCallback, useEffect, useId, useRef, useState } from "react";
import { haptic } from "@/lib/haptic";
import { RangeInput } from "@/components/ui/RangeInput";

const ANGLE_PER_TICK = 1.7;
const RADIUS = 332;
const CENTRE_X = 180;
const CENTRE_Y = 365;

/* An attempted SCROLL must not edit the weight. `touch-pan-y` hands
   vertical panning back to the browser (which then fires pointercancel,
   already handled by `settle`), and the gate in onPointerMove refuses to
   turn the drum until the gesture has committed to the horizontal axis.

   Without both, this control silently corrupted data: the surface was
   `touch-none` across a full-width band inside the sheet's own
   `overflow-y-auto`, so a vertical swipe landing on it could not scroll,
   and the move handler took `(startX - clientX)` with no threshold and
   no axis lock — about 5px of sideways drift in that failed scroll
   crossed a detent and emitted a new weight. A 0.1-0.3 kg edit is
   exactly the magnitude that reads as a plausible weigh-in, so it would
   not be caught at the confirmation step; it lands in bodyweightLogs and
   feeds trend weight. */
const AXIS_COMMIT_PX = 6;

/** A physical scale: drag the markings beneath a fixed pointer. */
export default function WeightScaleDial({
  value,
  minimum,
  maximum,
  unit,
  disabled = false,
  onChange,
}: {
  value: number;
  minimum: number;
  maximum: number;
  unit: "kg" | "lb" | "st";
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const minTick = Math.ceil(minimum * 10);
  const maxTick = Math.floor(maximum * 10);
  const clamp = (tick: number) => Math.min(maxTick, Math.max(minTick, tick));
  const selectedTick = clamp(Math.round(value * 10));
  const [position, setPosition] = useState(selectedTick);
  const root = useRef<HTMLDivElement>(null);
  const current = useRef(selectedTick);
  const emitted = useRef(selectedTick);
  const frame = useRef<number | null>(null);
  const lastHaptic = useRef(-Infinity);
  const drag = useRef<{
    id: number;
    x: number;
    time: number;
    velocity: number;
    /** Gesture origin, for the axis decision. */
    originX: number;
    originY: number;
    /** null until the gesture commits to an axis. */
    horizontal: boolean | null;
  } | null>(null);
  const helpId = useId();

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    drag.current = null;
  }, []);
  const settle = useCallback(() => {
    stop();
    current.current = Math.round(current.current);
    setPosition(current.current);
  }, [stop]);

  useEffect(() => {
    // Parent changes (typing / units) win; our own rounded emissions must
    // not interrupt a continuous drag or its short coast between detents.
    if (selectedTick === emitted.current) return;
    stop();
    emitted.current = selectedTick;
    current.current = selectedTick;
    setPosition(selectedTick);
  }, [selectedTick, stop]);
  useEffect(() => {
    if (disabled) settle();
  }, [disabled, settle]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) settle();
    };
    const hidden = () => {
      if (document.hidden) settle();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", settle);
    return () => {
      stop();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", settle);
    };
  }, [settle, stop]);

  const moveTo = (tick: number) => {
    const next = clamp(tick);
    current.current = next;
    setPosition(next);
    const rounded = Math.round(next);
    if (rounded !== emitted.current) {
      emitted.current = rounded;
      onChange(rounded / 10);
      // A fast swipe crosses many detents; avoid flooding the native bridge.
      const now = performance.now();
      if (now - lastHaptic.current >= 40) {
        haptic("light");
        lastHaptic.current = now;
      }
    }
  };
  const finish = (velocity: number) => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduceMotion || Math.abs(velocity) < 0.005) {
      settle();
      return;
    }
    let previous = performance.now();
    const started = previous;
    const coast = (now: number) => {
      const elapsed = Math.min(32, now - previous);
      previous = now;
      const next = current.current + velocity * elapsed;
      moveTo(next);
      velocity *= Math.exp(-0.008 * elapsed);
      if (
        Math.abs(velocity) < 0.005 ||
        now - started > 500 ||
        next <= minTick ||
        next >= maxTick
      ) {
        settle();
        return;
      }
      frame.current = requestAnimationFrame(coast);
    };
    frame.current = requestAnimationFrame(coast);
  };
  const ticks = Array.from(
    { length: 45 },
    (_, index) => Math.floor(position) - 22 + index
  ).filter((tick) => tick >= minTick && tick <= maxTick);

  const textValue =
    unit === "st"
      ? `${Math.floor(selectedTick / 140)} st ${(selectedTick % 140) / 10} lb`
      : `${(selectedTick / 10).toFixed(1)} ${unit}`;
  return (
    <div ref={root} className="min-w-0 w-full">
      <div
        className="relative w-full rounded-xl select-none touch-pan-y cursor-grab active:cursor-grabbing focus-within:ring-2 focus-within:ring-primary"
        data-vaul-no-drag
        onPointerDown={(event) => {
          if (
            disabled ||
            !event.isPrimary ||
            (event.pointerType === "mouse" && event.button !== 0)
          )
            return;
          stop();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            time: performance.now(),
            velocity: 0,
            originX: event.clientX,
            originY: event.clientY,
            /* A mouse has no competing pan gesture, so it commits
               immediately; only touch has a scroll to disambiguate. */
            horizontal: event.pointerType === "mouse" ? true : null,
          };
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.id !== event.pointerId) return;

          if (active.horizontal === null) {
            const dx = event.clientX - active.originX;
            const dy = event.clientY - active.originY;
            if (Math.abs(dy) > AXIS_COMMIT_PX && Math.abs(dy) >= Math.abs(dx)) {
              // A scroll. Own nothing further in this gesture.
              active.horizontal = false;
              return;
            }
            if (Math.abs(dx) <= AXIS_COMMIT_PX) return;
            active.horizontal = true;
            /* Apply from the ORIGIN, not from the last sample: the
               pre-commit travel is real movement the user made, and
               dropping it would make the drum lag the finger by the
               threshold on every turn. */
            active.x = active.originX;
          }
          if (!active.horizontal) return;

          const now = performance.now();
          const width =
            event.currentTarget.getBoundingClientRect().width || 360;
          const pixelsPerTick =
            ((width / 360) * RADIUS * ANGLE_PER_TICK * Math.PI) / 180;
          const delta = (active.x - event.clientX) / pixelsPerTick;
          const velocity = delta / Math.max(8, now - active.time);
          moveTo(current.current + delta);
          drag.current = {
            ...active,
            x: event.clientX,
            time: now,
            velocity: Math.max(-0.12, Math.min(0.12, velocity)),
          };
        }}
        onPointerUp={(event) => {
          const active = drag.current;
          if (!active || active.id !== event.pointerId) return;
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          if (active.horizontal !== true) return;
          finish(performance.now() - active.time > 80 ? 0 : active.velocity);
        }}
        onPointerCancel={settle}
        onLostPointerCapture={() => {
          if (drag.current) settle();
        }}
      >
        {/* Native range supplies keyboard and VoiceOver adjustment; pointer
            dragging uses the much finer physical scale above it. */}
        <RangeInput
          className="sr-only"
          aria-label="Weight scale"
          aria-valuetext={textValue}
          aria-describedby={helpId}
          min={minTick / 10}
          max={maxTick / 10}
          step="0.1"
          value={selectedTick / 10}
          disabled={disabled}
          onChange={(event) => {
            stop();
            moveTo(Number(event.target.value) * 10);
          }}
          onKeyDown={(event) => {
            /* Chromium's native page step over a 20-350 range is 33 kg,
               which is useless. One whole unit is the coarse step that
               keeps a 10:1 relationship with the arrow keys. */
            const jump =
              event.key === "PageUp" ? 10 : event.key === "PageDown" ? -10 : 0;
            if (!jump || disabled) return;
            event.preventDefault();
            stop();
            moveTo(current.current + jump);
          }}
        />
        <svg
          viewBox="0 0 360 128"
          className="block w-full overflow-hidden"
          aria-hidden="true"
        >
          <path d="M 175 13 L 185 13 L 180 25 Z" className="fill-primary" />
          {ticks.map((tick) => {
            const angle = (tick - position) * ANGLE_PER_TICK;
            const radians = (angle * Math.PI) / 180;
            /* Fade the drum out towards its edges. The window is 22 ticks
               either side of centre, so the outermost markings sit at
               ~37 degrees: far enough round that they render as long,
               steeply-rotated strokes with their labels stranded below
               the arc, which reads as the scale breaking rather than
               curving away. Every physical scale this imitates dissolves
               at the edge for the same reason. Full strength through the
               readable middle, gone by the rim. */
            const edgeFade = Math.max(
              0,
              Math.min(1, (34 - Math.abs(angle)) / 16)
            );
            const major = tick % 10 === 0;
            const middle = tick % 5 === 0;
            const inner = RADIUS - (major ? 24 : middle ? 17 : 10);
            const labelRadius = RADIUS - 45;
            const whole = tick / 10;
            const stoneBoundary = unit === "st" && tick % 140 === 0;
            const label =
              unit === "st" ? (stoneBoundary ? whole / 14 : whole % 14) : whole;
            return (
              <g key={tick}>
                <line
                  x1={CENTRE_X + RADIUS * Math.sin(radians)}
                  y1={CENTRE_Y - RADIUS * Math.cos(radians)}
                  x2={CENTRE_X + inner * Math.sin(radians)}
                  y2={CENTRE_Y - inner * Math.cos(radians)}
                  stroke="currentColor"
                  strokeWidth={major ? 1.5 : 1}
                  opacity={edgeFade}
                  className={
                    major ? "text-foreground" : "text-muted-foreground"
                  }
                />
                {major && (
                  <text
                    x={CENTRE_X + labelRadius * Math.sin(radians)}
                    y={CENTRE_Y - labelRadius * Math.cos(radians)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="currentColor"
                    opacity={edgeFade}
                    className="text-micro text-muted-foreground font-mono tabular-nums"
                  >
                    {label}
                    {stoneBoundary && <tspan className="font-sans"> st</tspan>}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p id={helpId} className="sr-only">
        {unit === "st"
          ? "Spin to adjust pounds, or tap the number to type"
          : "Spin the scale, or tap the number to type"}
      </p>
    </div>
  );
}
