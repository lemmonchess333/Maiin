/**
 * Tropos design-system SegmentedControl primitive.
 *
 * A compact, single-select pill group — the iOS `UISegmentedControl`
 * shape: a row (or wrap) of equal-weight options where exactly one is
 * selected. Replaces the hand-rolled `<button>` pill rows that drifted
 * across the app (lift-days / race-distance selectors had NO a11y at
 * all; others hand-rolled `role="radio"` inconsistently). See
 * docs/adr/0003-ui-primitives-contract.md.
 *
 * NOT for the tall multi-part "option card" pickers (plan selectors,
 * report categories) — those are a different control and are already
 * accessible; don't force them through this API.
 *
 * Accessibility: implements the full WAI-ARIA radiogroup pattern —
 *   - container `role="radiogroup"` with a REQUIRED `ariaLabel`
 *   - each option `role="radio"` + `aria-checked`
 *   - roving tabindex (only the selected option is in the tab order)
 *   - Arrow/Home/End move selection AND focus, skipping disabled
 *     options and wrapping; Space/Enter commit the focused option
 *   - 44px touch-target floor, focus ring, reduced-motion-aware
 */
import { useRef } from "react";
import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Per-option disable (e.g. a split that needs more lift days). */
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Required accessible name for the radiogroup. */
  ariaLabel: string;
  /** Selected-fill colour. `brand` = purple (default), `running` = coral. */
  tone?: "brand" | "running";
  /** `fill` = equal-width row (default); `wrap` = auto-width pills. */
  layout?: "fill" | "wrap";
  /** Disable the whole group (e.g. a write in progress). */
  disabled?: boolean;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

const OPTION_BASE = [
  "min-h-[44px] rounded-xl text-sm font-semibold",
  "active:scale-[0.97] motion-safe:transition-colors",
  "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
].join(" ");

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  tone = "brand",
  layout = "fill",
  disabled = false,
  className,
  ref,
}: SegmentedControlProps<T>) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const isOptionEnabled = (i: number) => !disabled && !options[i]?.disabled;
  const enabled = options.map((_, i) => i).filter(isOptionEnabled);

  const selectedIndex = options.findIndex((o) => o.value === value);
  // Roving tabindex: the selected option holds tabIndex 0; if nothing is
  // selected, the first enabled option does, so the group is still reachable.
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : (enabled[0] ?? 0);

  function focusAndSelect(targetIndex: number) {
    const opt = options[targetIndex];
    if (!opt || !isOptionEnabled(targetIndex)) return;
    btnRefs.current[targetIndex]?.focus();
    if (opt.value !== value) onChange(opt.value);
  }

  function step(direction: 1 | -1, fromIndex: number) {
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(fromIndex);
    const base = pos === -1 ? (direction === 1 ? -1 : 0) : pos;
    const next = (base + direction + enabled.length) % enabled.length;
    focusAndSelect(enabled[next]);
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        step(1, index);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        step(-1, index);
        break;
      case "Home":
        e.preventDefault();
        if (enabled.length) focusAndSelect(enabled[0]);
        break;
      case "End":
        e.preventDefault();
        if (enabled.length) focusAndSelect(enabled[enabled.length - 1]);
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        focusAndSelect(index);
        break;
    }
  }

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "flex gap-1.5",
        layout === "wrap" && "flex-wrap",
        className
      )}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!isOptionEnabled(i)}
            tabIndex={i === tabbableIndex ? 0 : -1}
            onClick={() => focusAndSelect(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              OPTION_BASE,
              layout === "fill" ? "flex-1" : "px-4",
              selected
                ? tone === "running"
                  ? "bg-running text-white"
                  : "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
export default SegmentedControl;
