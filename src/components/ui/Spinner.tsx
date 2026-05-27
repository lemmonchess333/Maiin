/**
 * Tropos design-system Spinner primitive.
 *
 * Sprint 4 — single source of truth for in-flight indicators outside
 * of <Button loading> (which has its own embedded spinner). Replaces
 * ~29 hand-rolled spinners across the app — a mix of inline
 * <Loader2 className="animate-spin" /> from lucide-react and
 * "border-2 border-primary border-t-transparent rounded-full
 * animate-spin" ring-spinner divs. The two shapes had drifted into
 * different idioms in different files; this primitive pins one
 * visual language (Loader2 from lucide, matching Button.tsx's
 * embedded spinner).
 *
 * Sizes:
 *   - xs   12px — inside tight inline elements
 *   - sm   16px — DEFAULT. Most common inline use (action chips,
 *                 inline status indicators).
 *   - md   24px — section-level "loading this card" indicator.
 *   - lg   32px — full-page / hero / lazy-route fallback.
 *
 * Variants:
 *   - primary  text-primary (purple brand) — DEFAULT.
 *   - inverse  text-white  — used on the dark run-screen surfaces.
 *   - muted    text-muted-foreground — when the spinner sits in a
 *              muted context and shouldn't compete with primary
 *              content for attention.
 *
 * Accessibility:
 *   The wrapper carries role="status" + an aria-label (default
 *   "Loading"). The Loader2 glyph is aria-hidden so SR users hear
 *   the label once, not "image, image, image" or similar. Pass a
 *   more specific label when context matters ("Loading runs",
 *   "Uploading photo", etc.).
 */
import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SpinnerSize = "xs" | "sm" | "md" | "lg";
export type SpinnerVariant = "primary" | "inverse" | "muted";

interface SpinnerProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "aria-label"
> {
  size?: SpinnerSize;
  variant?: SpinnerVariant;
  /** Accessible label announced by screen readers. Defaults to "Loading". */
  label?: string;
}

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  xs: "size-3",
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
};

const VARIANT_CLASSES: Record<SpinnerVariant, string> = {
  primary: "text-primary",
  inverse: "text-white",
  muted: "text-muted-foreground",
};

const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = "sm", variant = "primary", label = "Loading", className, ...rest },
  ref
) {
  return (
    <span
      ref={ref}
      role="status"
      aria-label={label}
      className={cn("inline-flex items-center justify-center", className)}
      {...rest}
    >
      <Loader2
        aria-hidden="true"
        className={cn(
          "animate-spin",
          SIZE_CLASSES[size],
          VARIANT_CLASSES[variant]
        )}
      />
    </span>
  );
});

export { Spinner };
export default Spinner;
