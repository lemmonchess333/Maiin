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
 * Visual: the iOS "track" look as iOS draws it in dark mode — a
 * `bg-muted` track, the selected segment a filled pill under a white
 * label with no outline, unselected segments plain muted-foreground text.
 * This is the ONE segmented-control language across the app (Social
 * tabs/sub-tabs/sort, Analytics section tabs + time range, plus the
 * programme/run pickers).
 *
 * The fill carries the selected state, so it is held to WCAG 1.4.11's
 * 3:1 against the track it sits in, and its label to 4.5:1 on it
 * (controlBoundaries.test.ts measures both themes). The neutral fill is
 * `--segment-selected`; the sport tones take their sport's white-text
 * fill step (`--running-fill` coral, `--lifting-fill` purple), so the
 * Lift/Run switch keeps its sport coding. A coloured LABEL on a grey fill
 * cannot do that job: any fill bright enough to clear 3:1 on the dark
 * track leaves the -strong labels near 2:1 on it.
 * `layout="wrap"` drops the shared track and renders individual pills,
 * muted when unselected (a contiguous track can't wrap cleanly).
 * `layout="fill-wrap"` keeps the track and its equal parts, but a part
 * never gets narrower than its label: when the labels can no longer
 * share the row (large text on a narrow phone), the parts wrap onto a
 * second row instead of cutting the words.
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
  /** Selected value. `null`/`undefined` = nothing selected yet (a settings
   *  field the user hasn't set) — renders with no active segment. */
  value: T | null | undefined;
  onChange: (value: T) => void;
  /** Optional action when the selected option is clicked or activated with
   *  Space/Enter. Used by the Food composer to clear its meal target.
   *  Arrow/Home/End navigation never reactivates the selected option. */
  onReselect?: (value: T) => void;
  /** Required accessible name for the radiogroup. */
  ariaLabel: string;
  /** Selected-segment colour. `brand` = the neutral grey fill (default),
   *  `running` = the coral fill, `lifting` = the purple fill, each under
   *  a white label and (currentColor) icon, so the Programme Lift/Run
   *  switch reads its sport identity symmetrically. `nutrition` = the
   *  food orange fill, and exists for `emphasis="solid"`; on the track it
   *  takes the neutral fill, because `--nutrition-fill` is under 3:1
   *  against the dark track. */
  tone?: "brand" | "running" | "lifting" | "nutrition";
  /** `track` = the iOS track look (default). `solid` = rounded-full pills
   *  with the SELECTED one filled in the tone colour. Solid is for a
   *  domain whose colour IS the meaning — today that is the Food
   *  surface's meal slot, and `mealSlotPickerIdentity.test.tsx` pins it
   *  there. Reach for `track` everywhere else; a second solid group on a
   *  neutral surface is the drift this primitive exists to stop. */
  emphasis?: "track" | "solid";
  /** `fill` = equal-width row (default); `wrap` = auto-width pills;
   *  `fill-wrap` = the equal-width row, wrapping onto more rows rather
   *  than cutting a label short. */
  layout?: "fill" | "wrap" | "fill-wrap";
  /** Disable the whole group (e.g. a write in progress). */
  disabled?: boolean;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

// `scale-[0.97]` sets the `scale` property, which transition-colors leaves
// out, so the press would snap. The default list eases it with the
// colours, at DESIGN_GUIDE §8's 150ms curve.
const OPTION_BASE = [
  "min-h-[44px] rounded-lg text-sm font-semibold",
  "active:scale-[0.97] motion-safe:transition",
  "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
].join(" ");

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  onReselect,
  ariaLabel,
  tone = "brand",
  emphasis = "track",
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

  function focusAndSelect(targetIndex: number, activate = false) {
    const opt = options[targetIndex];
    if (!opt || !isOptionEnabled(targetIndex)) return;
    btnRefs.current[targetIndex]?.focus();
    if (opt.value !== value) onChange(opt.value);
    else if (activate) onReselect?.(opt.value);
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
        focusAndSelect(index, true);
        break;
    }
  }

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "flex",
        // Track look for the equal-width row; wrap mode can't share a
        // single contiguous track, so it drops the track and lets each
        // pill carry its own background below.
        emphasis === "solid"
          ? "flex-wrap items-center gap-2"
          : layout === "wrap"
            ? "flex-wrap gap-1.5"
            : cn(
                "gap-1 p-1 rounded-xl bg-muted",
                layout === "fill-wrap" && "flex-wrap"
              ),
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
            onClick={() => focusAndSelect(i, true)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              OPTION_BASE,
              emphasis === "solid"
                ? "rounded-full border px-4"
                : layout === "fill"
                  ? // Equal parts end a label in "…" when it no longer
                    // fits, as iOS's own segmented control does, rather
                    // than pushing the row off the screen at larger text
                    // ("Analytics PRs Badges" on a 320px phone).
                    "flex-1 min-w-0 truncate"
                  : layout === "fill-wrap"
                    ? // Equal parts from a zero basis, none narrower than
                      // its label: the row wraps where they can't share
                      // it. The inset is px so it doesn't grow with text.
                      "flex-1 min-w-max px-[8px]"
                    : "px-4",
              emphasis === "solid"
                ? selected
                  ? cn(
                      "border-transparent text-white",
                      tone === "nutrition" ? "bg-nutrition-fill" : "bg-primary"
                    )
                  : "border-border/80 bg-card text-muted-foreground hover:bg-muted/60"
                : selected
                  ? cn(
                      // The fill is the selected state: 3:1 or more
                      // against the track, white 4.5:1 or more on it.
                      "text-white",
                      tone === "running"
                        ? "bg-running-fill"
                        : tone === "lifting"
                          ? "bg-lifting-fill"
                          : "bg-segment-selected"
                    )
                  : // Unselected: transparent on the shared track (fill), or
                    // an individual muted pill when wrapped (no track behind).
                    layout === "wrap"
                    ? "bg-muted text-muted-foreground"
                    : "text-muted-foreground"
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
