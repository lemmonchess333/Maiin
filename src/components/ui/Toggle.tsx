import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ToggleProps {
  /** Current on/off state. */
  checked: boolean;
  /** Fired on tap. Call sites keep their own optimistic-update /
   *  persistence / analytics logic — this primitive owns only the
   *  visual + the touch target. */
  onChange: () => void;
  /** Accessible name (required — switches are icon-only). */
  label: string;
  disabled?: boolean;
  /** Layout passthrough on the hit-area button (e.g. `ml-3`). */
  className?: string;
}

/**
 * Accessible switch. The clickable button is a 44px square (iOS HIG
 * touch-target floor) wrapping a 40×24 visual track, so the tap target
 * meets the floor while the switch stays visually compact. `-my-2.5`
 * absorbs the hit-area height inside a typical settings row so the row
 * height is unchanged.
 *
 * Sized in px, as iOS sizes its switch: it is a control, and a control
 * keeps its size when the phone's text grows (systemTextSize.ts). In rem
 * it doubled at the largest text sizes and squeezed every label beside
 * it.
 *
 * Replaces the inline `<button role="switch">…</button>` markup that was
 * duplicated across settings/run surfaces (each rendering a sub-44px
 * 40×24 tap target).
 */

/* The knob's travel when the switch is tapped: a move between two places
   on screen, so the strong ease-in-out, inside a control's 200ms. */
const KNOB_SLIDE: KeyframeAnimationOptions = {
  duration: 200,
  easing: "cubic-bezier(0.77, 0, 0.175, 1)",
};

/** How long after a tap a change of `checked` is still that tap's. A switch
 *  whose call site asks first (a permission, a consent sheet) flips after
 *  the question, where the knob just shows its new place. */
const TAP_WINDOW_MS = 1000;

/** The knob's left edge from the track's, as drawn (a running slide
 *  included). */
function knobX(track: HTMLElement | null, knob: HTMLElement | null) {
  if (!track || !knob) return null;
  return knob.getBoundingClientRect().left - track.getBoundingClientRect().left;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  className,
}: ToggleProps) {
  const trackRef = useRef<HTMLSpanElement>(null);
  const knobRef = useRef<HTMLSpanElement>(null);
  /* Where the knob was on screen when the switch was tapped, if it was. */
  const tap = useRef<{ x: number; at: number } | null>(null);
  const slide = useRef<Animation | null>(null);

  /* A tap's change slides the knob from where it was to its new place; a
     state that arrives with the page, or after a question the call site
     asked, just shows (Pol1). Measured on screen, so a second tap mid-slide
     carries on from where the knob is. */
  useLayoutEffect(() => {
    const from = tap.current;
    tap.current = null;
    const knob = knobRef.current;
    if (!from || !knob || typeof knob.animate !== "function") return;
    if (performance.now() - from.at > TAP_WINDOW_MS) return;
    slide.current?.cancel();
    const to = knobX(trackRef.current, knob);
    if (to === null || to === from.x) return;
    slide.current = knob.animate(
      [{ transform: `translateX(${from.x - to}px)` }, { transform: "none" }],
      KNOB_SLIDE
    );
  }, [checked]);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        const x = knobX(trackRef.current, knobRef.current);
        const still = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;
        tap.current = x === null || still ? null : { x, at: performance.now() };
        onChange();
      }}
      className={cn(
        "size-[44px] -my-[10px] shrink-0 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    >
      {/* The thumb is a normal FLEX CHILD of the track, not an
          absolutely-positioned + translated overlay. The earlier
          transform-based thumb rendered 2× its intended travel on real
          devices (thumb fully outside the track — reported three times),
          so the geometry is now containment-by-construction: a flow child
          physically cannot leave its padded container, in any engine.
          The slide above keeps that: it is a transform only while the
          knob moves, ending at none, so a still knob is placed by the
          flex row alone. The track's colour takes the slide's 200ms. */}
      <span
        ref={trackRef}
        className={cn(
          "w-[40px] h-[24px] rounded-full transition-colors duration-200 flex items-center px-[4px]",
          checked
            ? "bg-primary justify-end"
            : // The off track's edge is the switch's boundary: 3:1 against
              // the white card in light (muted-foreground/80), while the
              // dark track already clears it with its own hairline.
              "bg-muted border border-muted-foreground/80 dark:border-border justify-start"
        )}
      >
        <span
          ref={knobRef}
          // eslint-disable-next-line no-restricted-syntax -- iOS-style switch thumb is white in BOTH themes; the track (bg-primary / bg-muted) carries the theme.
          className="size-[16px] rounded-full bg-white shadow-sm"
        />
      </span>
    </button>
  );
}
