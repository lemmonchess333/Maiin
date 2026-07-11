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
 * Replaces the inline `<button role="switch">…</button>` markup that was
 * duplicated across settings/run surfaces (each rendering a sub-44px
 * 40×24 tap target).
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  className,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "size-11 -my-2.5 shrink-0 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    >
      {/* The thumb is a normal FLEX CHILD of the track, not an
          absolutely-positioned + translated overlay. The earlier
          transform-based thumb rendered 2× its intended travel on real
          devices (thumb fully outside the track — reported three times),
          so the geometry is now containment-by-construction: a flow child
          physically cannot leave its padded container, in any engine. */}
      <span
        className={cn(
          "w-10 h-6 rounded-full transition-colors flex items-center px-1",
          checked
            ? "bg-primary justify-end"
            : "bg-muted border border-border justify-start"
        )}
      >
        <span
          // eslint-disable-next-line no-restricted-syntax -- iOS-style switch thumb is white in BOTH themes; the track (bg-primary / bg-muted) carries the theme.
          className="size-4 rounded-full bg-white shadow-sm"
        />
      </span>
    </button>
  );
}
