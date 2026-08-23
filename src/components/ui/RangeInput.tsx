import type { CSSProperties, InputHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";
import { rangeFillPct } from "@/lib/rangeFill";

/**
 * The app's only drag control, as a primitive.
 *
 * A bare `<input type="range" className="accent-primary">` cannot be made
 * to look right in both themes: `accent-color` paints the fill and the
 * thumb but leaves the groove to the UA, which uses one hard-coded grey in
 * both — near-invisible on light, and brighter than the fill on dark, so
 * the loudest mass on the control was the part you had NOT selected.
 * Chromium offers no seam for the groove alone, because the accent fill is
 * painted AS the track background.
 *
 * So the whole track is painted from tokens, with the fill as a
 * hard-stopped gradient. That needs the fill position in CSS, and the only
 * way in is a custom property — which is exactly the kind of plumbing a
 * call site forgets. Hence a component: `--range-pct` is computed here
 * from the same value/min/max the input already has, so it cannot drift
 * from the thumb it is supposed to sit under.
 *
 * Firefox needs none of that — it has a real `::-moz-range-progress` — but
 * routing every slider through here keeps one control to reason about.
 *
 * Everything else is a plain range input: all native props pass through,
 * and the caller still owns `value`/`onChange`.
 */
interface RangeInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  value: number;
  min: number;
  max: number;
  ref?: Ref<HTMLInputElement>;
}

function RangeInput({
  value,
  min,
  max,
  className,
  style,
  ref,
  ...rest
}: RangeInputProps) {
  return (
    <input
      ref={ref}
      type="range"
      value={value}
      min={min}
      max={max}
      className={cn("w-full", className)}
      style={
        {
          ...style,
          "--range-pct": rangeFillPct(value, Number(min), Number(max)),
        } as CSSProperties
      }
      {...rest}
    />
  );
}

export { RangeInput };
export default RangeInput;
