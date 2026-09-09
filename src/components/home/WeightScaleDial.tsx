import { useCallback, useEffect, useId, useRef, useState } from "react";
import { haptic } from "@/lib/haptic";
import { RangeInput } from "@/components/ui/RangeInput";

/* ── Tape geometry, in CSS pixels ─────────────────────────────────────
   The SVG carries NO viewBox, so one user unit is one CSS pixel and the
   markings track the finger exactly 1:1. A drum has no physical size and
   can scale its drag gain with the container; a ruler cannot — a tape
   that slides at a different rate from the finger dragging it is not a
   tape.

   Dropping the viewBox also fixes a latent bug in the arc this replaces.
   Its fixed `viewBox="0 0 360 128"` scaled with the container, so its
   `text-micro` labels rendered at ~11.4px on a 375 phone and ~9.6px on a
   320 one — under the documented 11px caption floor. Here 12px is 12px
   on every device.

   A fixed 600px span, absolutely centred inside an overflow-hidden
   parent, buys that with no measurement, no ResizeObserver, no fallback
   frame and no jsdom stub. It covers every real container (the sheet's
   max-w-sm 384px; the dev lab's max-w-lg 512px).

   PX_PER_TICK = 10 gives 100px per whole kg/lb and preserves the pinned
   drag arithmetic: the arc worked out to 332 * 1.7 * PI/180 = 9.8506
   px/tick, so a 100px swipe from 81.6 emitted 82.6. At 10px/tick it
   still does, which is why WeightScaleDial.test.tsx is unedited. */
const PX_PER_TICK = 10;
const TAPE_SPAN = 600;
const TAPE_CENTRE = TAPE_SPAN / 2;
const TAPE_H = 64;
const TICK_TOP = 8;
const MINOR_H = 14; // every 0.1
const MID_H = 20; // every 0.5
const MAJOR_H = 28; // every 1.0, labelled
const LABEL_Y = 50;
const NEEDLE_H = 32; // through the tick field, not hovering above it
const WINDOW = Math.ceil(TAPE_CENTRE / PX_PER_TICK) + 2;

/* Ticks may fade at the edges; LABELS may not. The mask erases by alpha
   across a 48px band, and a two-digit label is ~16px wide, so a label
   straddling that band loses a glyph and keeps the rest — "81" renders
   as a legible, wrong "1" beside a correct "82". Caught in the capture
   channel, which is the only place it is visible: every unit test asks
   what is in the DOM, and the stray label IS in the DOM.

   So labels are culled by distance from centre rather than faded. 14
   ticks = 140px is the conservative bound for the narrowest container
   this ships in (the sheet's max-w-sm, ~343px inner: opaque to 86% is
   147px from centre, less half a label). A wider container could show
   one more on each side; showing three everywhere is the honest trade,
   and three is what the spec budgeted. */
const LABEL_MAX_TICKS = 14;

/* An attempted SCROLL must not edit the weight. `touch-pan-y` hands
   vertical panning back to the browser (which then fires pointercancel,
   already handled by `settle`), and the gate below refuses to move the
   tape until the gesture has committed to the horizontal axis.

   Without both, this control silently corrupted data: the surface was
   `touch-none` across a full-width band inside the sheet's own
   `overflow-y-auto`, so a vertical swipe landing on it could not scroll,
   and `onPointerMove` took `(startX - clientX)` with no threshold and no
   axis lock — about 5px of sideways drift in that failed scroll crossed
   a detent and emitted a new weight. A 0.1-0.3 kg edit is exactly the
   magnitude that reads as a plausible weigh-in, so it would not be
   caught at the confirmation step. */
const AXIS_COMMIT_PX = 6;

/* Both ends dissolve rather than stopping at a hard edge — the same
   reason the arc faded, minus 45 per-tick opacity attributes. Applied to
   a layer spanning the VISIBLE width, not to the 600px sheet, where the
   fade zone would fall entirely off-screen. rgba() rather than hex keeps
   the inline-style hex rule (eslint.config.js) clean. */
const TAPE_FADE =
  "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 14%, rgba(0,0,0,1) 86%, rgba(0,0,0,0) 100%)";
const TAPE_MASK = { maskImage: TAPE_FADE, WebkitMaskImage: TAPE_FADE };

type Tier = "minor" | "mid" | "major";
const TICK_H: Record<Tier, number> = {
  minor: MINOR_H,
  mid: MID_H,
  major: MAJOR_H,
};
/* Length + weight + a real token carry the hierarchy. No opacity
   fractions: de-emphasis by alpha is the dodge the arc's edgeFade turned
   into a depth cue, and it is what made half its geometry invisible. */
const TICK_CLASS: Record<Tier, string> = {
  minor: "text-border",
  mid: "text-muted-foreground",
  major: "text-foreground",
};

/** A measuring tape: drag the markings beneath a fixed centre needle. */
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
    const previous = emitted.current;
    current.current = next;
    setPosition(next);
    const rounded = Math.round(next);
    if (rounded !== previous) {
      emitted.current = rounded;
      onChange(rounded / 10);
      /* A fast swipe crosses many detents; avoid flooding the native
         bridge. A whole-unit crossing always clicks, so the tape keeps a
         per-kg feel through a fling — it cannot flood, because at the
         0.12 tick/ms velocity clamp a whole unit takes >= 83ms. */
      const crossedUnit =
        Math.floor(rounded / 10) !== Math.floor(previous / 10);
      const now = performance.now();
      if (crossedUnit || now - lastHaptic.current >= 40) {
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

  /* Two ticks of overdraw either side, so a fractional `position` never
     exposes a gap at the edge of the sheet mid-drag. */
  const base = Math.floor(position);
  const ticks: { tick: number; x: number; tier: Tier }[] = [];
  for (let index = -WINDOW; index <= WINDOW; index += 1) {
    const tick = base + index;
    if (tick < minTick || tick > maxTick) continue;
    ticks.push({
      tick,
      x: TAPE_CENTRE + (tick - position) * PX_PER_TICK,
      tier: tick % 10 === 0 ? "major" : tick % 5 === 0 ? "mid" : "minor",
    });
  }

  const textValue =
    unit === "st"
      ? `${Math.floor(selectedTick / 140)} st ${(selectedTick % 140) / 10} lb`
      : `${(selectedTick / 10).toFixed(1)} ${unit}`;

  return (
    <div ref={root} className="min-w-0 w-full">
      <div
        className="relative w-full overflow-hidden rounded-xl select-none touch-pan-y cursor-grab active:cursor-grabbing focus-within:ring-2 focus-within:ring-primary"
        style={{ height: TAPE_H }}
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
               dropping it would make the tape lag the finger by the
               threshold on every drag. */
            active.x = active.originX;
          }
          if (!active.horizontal) return;

          const now = performance.now();
          /* 1:1 with the drawn tape — no width factor, because there is
             no viewBox to scale it. Drag left, the numbers grow. */
          const delta = (active.x - event.clientX) / PX_PER_TICK;
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
            dragging uses the much finer tape beside it. Must stay the
            DIRECT child of this surface: WeightScaleDial.test.tsx resolves
            the drag target as slider.parentElement, and the capture spec
            as slider.locator(".."). */}
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

        {/* The tape, masked at the VISIBLE edges. No shapeRendering hint:
            ticks sit at fractional x during a drag, and crispEdges would
            snap them between pixel columns, turning a slide into a
            stutter. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={TAPE_MASK}
        >
          <svg
            width={TAPE_SPAN}
            height={TAPE_H}
            className="absolute left-1/2 top-0 block -translate-x-1/2"
          >
            {ticks.map(({ tick, x, tier }) => {
              const whole = tick / 10;
              const stoneBoundary = unit === "st" && tick % 140 === 0;
              return (
                <g key={tick}>
                  <line
                    x1={x}
                    y1={TICK_TOP}
                    x2={x}
                    y2={TICK_TOP + TICK_H[tier]}
                    stroke="currentColor"
                    strokeWidth={tier === "major" ? 1.5 : 1}
                    className={TICK_CLASS[tier]}
                  />
                  {tier === "major" &&
                    Math.abs(tick - position) <= LABEL_MAX_TICKS && (
                      <text
                        x={x}
                        y={LABEL_Y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="currentColor"
                        className="text-micro font-mono tabular-nums text-muted-foreground"
                      >
                        {unit === "st"
                          ? stoneBoundary
                            ? whole / 14
                            : whole % 14
                          : whole}
                        {stoneBoundary && (
                          <tspan className="font-sans"> st</tspan>
                        )}
                      </text>
                    )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Fixed centre needle, deliberately OUTSIDE the mask so the fade
            cannot eat it. The bar runs down through the tick field
            (y 8-36) rather than stopping above it — the arc left an 8px
            void between its pointer and the markings it selected. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center"
        >
          <svg
            width="12"
            height="8"
            viewBox="0 0 12 8"
            className="block fill-primary"
          >
            <path d="M0 0 H12 L6 8 Z" />
          </svg>
          <span
            className="w-[2px] rounded-b-full bg-primary"
            style={{ height: NEEDLE_H }}
          />
        </div>
      </div>
      <p id={helpId} className="sr-only">
        {unit === "st"
          ? "Slide to adjust pounds, or tap the number to type"
          : "Slide the scale, or tap the number to type"}
      </p>
    </div>
  );
}
