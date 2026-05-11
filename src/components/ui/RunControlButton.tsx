/**
 * Tropos design-system RunControlButton primitive.
 *
 * Sprint 7 — dedicated control button for the active-run surface
 * (RunBottomSheet pause/resume/stop/lock). Distinct from the
 * regular Button + IconButton primitives because the run screen
 * has different design constraints:
 *
 *   - Larger touch targets (active-use surface where the user is
 *     moving, eyes off-screen). Sizes are 56px (sm, lock + tray
 *     toggles) and 76px (lg, pause / resume / stop).
 *   - Circular shape (rounded-full), NOT the app's rounded-xl.
 *     The visual language is iOS Workout / Apple Music control —
 *     big translucent puck on a dark background.
 *   - Calmer press scale (0.92) rather than the regular Button's
 *     0.97. The user is operating mid-activity; bouncy 0.97 +
 *     transform-spring feels wrong here.
 *   - Compile-time-required aria-label. Pre-Sprint-7 the run
 *     controls had no aria-labels — the "LOCK" / "PAUSE" / "STOP"
 *     visible text underneath each button was decorative (a
 *     separate <p>, not associated). Screen readers announced
 *     "button" with no name. RunControlButton makes the label a
 *     required TypeScript prop.
 *
 * Variants encode the run screen's existing colour vocabulary:
 *   - neutral   translucent white surface (lock, pause)
 *   - primary   THEME.teal filled (resume — go-action)
 *   - danger    red translucent + red icon (stop)
 *
 * The optional visible label below the button (e.g. "LOCK", "PAUSE")
 * is rendered when `label` is provided. The button's aria-label is
 * still required separately so screen readers get a clear action
 * name independent of visible decoration.
 */
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type RunControlVariant = "neutral" | "primary" | "danger";
export type RunControlSize = "sm" | "lg";

type RunControlButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  "aria-label": string;
  variant?: RunControlVariant;
  size?: RunControlSize;
  /** Visible label below the button (e.g. "PAUSE"). Decorative —
   *  the aria-label remains the screen-reader source of truth. */
  label?: string;
  /** The icon / glyph rendered inside the circle. Sized by the
   *  caller because run-control glyphs vary (lucide icons, raw
   *  SVG, two-rect pause symbol). */
  icon: ReactNode;
  /** When true, applies an outer glow that mirrors the visual
   *  emphasis of the active "Resume" button (THEME.teal). The
   *  variant already drives the colour; this gates the shadow on
   *  the call site. */
  glow?: boolean;
};

const BASE_BUTTON = [
  "rounded-full flex items-center justify-center",
  "select-none shrink-0",
  // Calmer press feedback for active-run use — 0.92 instead of the
  // regular Button's 0.97 + 150ms.
  "active:scale-[0.92] transition-transform duration-150",
  // Focus ring matches the rest of the design system so keyboard
  // users (rare on Run but possible via Bluetooth keyboard) get a
  // visible indicator.
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  // Disabled state for guarded transitions (e.g. mid-save).
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
].join(" ");

const SIZE_CLASSES: Record<RunControlSize, string> = {
  // sm = 56px (3.5rem). Lock + tray toggles + spacer placeholders.
  sm: "w-14 h-14",
  // lg = 76px. Pause / resume / stop — the dominant action.
  lg: "w-[76px] h-[76px]",
};

/**
 * Variant → inline-style shapes. These intentionally use inline
 * style not Tailwind because the run surface relies on specific
 * rgba(white) alphas + custom box-shadows that don't translate
 * cleanly to design-system tokens (the run screen is the one
 * deliberately-dark surface in the app regardless of OS theme).
 */
function variantStyle(
  variant: RunControlVariant,
  glow: boolean,
): React.CSSProperties {
  switch (variant) {
    case "primary":
      // THEME.teal filled — used on Resume. Glow always-on for this
      // variant because the user is looking for the go-action.
      return {
        background: "#52A3BD",
        boxShadow: glow
          ? "0 0 32px rgba(82, 163, 189, 0.4), 0 8px 24px rgba(0, 0, 0, 0.4)"
          : "0 8px 24px rgba(0, 0, 0, 0.4)",
      };
    case "danger":
      // Translucent red surface + red border. Used on Stop in the
      // paused state. The danger glyph caller supplies the inner
      // square / icon.
      return {
        background: "rgba(239, 68, 68, 0.12)",
        border: "2.5px solid #EF4444",
      };
    case "neutral":
    default:
      // Translucent white pill on the dark sheet surface. Used on
      // Lock + Pause.
      return {
        background: "rgba(255, 255, 255, 0.10)",
        border: "2.5px solid rgba(255, 255, 255, 0.28)",
        boxShadow:
          "0 0 0 1px rgba(255, 255, 255, 0.06), 0 8px 32px rgba(0, 0, 0, 0.4)",
      };
  }
}

const LABEL_CLASSES = [
  "uppercase tracking-widest leading-none",
  "select-none",
].join(" ");

const RunControlButton = forwardRef<HTMLButtonElement, RunControlButtonProps>(
  function RunControlButton(
    {
      variant = "neutral",
      size = "lg",
      glow = false,
      label,
      icon,
      type,
      className,
      ...rest
    },
    ref,
  ) {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          ref={ref}
          type={type ?? "button"}
          className={cn(BASE_BUTTON, SIZE_CLASSES[size], className)}
          style={variantStyle(variant, glow)}
          {...rest}
        >
          {/* Glyph is supplied by the caller. The wrapper is
              aria-hidden so the button's aria-label (required) is
              the only thing screen readers see. */}
          <span aria-hidden="true" className="inline-flex">
            {icon}
          </span>
        </button>
        {label ? (
          <p
            aria-hidden="true"
            className={LABEL_CLASSES}
            style={{
              fontSize: 9,
              color: "rgba(255, 255, 255, 0.28)",
              letterSpacing: "0.08em",
            }}
          >
            {label}
          </p>
        ) : null}
      </div>
    );
  },
);

export { RunControlButton };
export default RunControlButton;
