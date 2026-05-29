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
export function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
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
      <span
        className={cn(
          "w-10 h-6 rounded-full transition-colors relative block",
          checked ? "bg-primary" : "bg-muted border border-border"
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-white absolute top-1 shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-1"
          )}
        />
      </span>
    </button>
  );
}
