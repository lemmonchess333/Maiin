/**
 * Tropos design-system Button primitive.
 *
 * Sprint 1 — single source of truth for app buttons. Replaces ~60
 * hand-rolled Tailwind class strings across the app whose
 * active:scale values, rounded radii, padding, focus rings, and
 * minimum touch targets had drifted apart.
 *
 * Variants:
 *   - primary       filled brand colour (uses --primary-strong for AA contrast)
 *   - secondary     tinted on muted surface
 *   - destructive   filled --destructive (Sprint 0 token)
 *   - ghost         transparent with hover tint
 *   - outline       transparent with border
 *   - sport         coral-solid run CTA (Start/Go) — pairs with brand
 *                   purple `primary` for the 5-tier hierarchy from
 *                   Run7 Q4. Use whenever the action's discipline is
 *                   running (`/run`, "Start", "Go"). For lifting CTAs
 *                   continue using `primary` (brand purple = lift).
 *   - sport-tinted  coral-tinted run destructive (Skip-style) — used
 *                   when the action is sport-discipline AND non-
 *                   critical destructive (e.g. "Skip recovery early").
 *                   Distinct from the red `destructive` variant which
 *                   stays for genuinely destructive flows (delete
 *                   account, end subscription).
 *   - nutrition     orange-solid food CTA — the nutrition-domain analogue
 *                   of `sport`. Use SPARINGLY, only for genuinely
 *                   nutrition-PRIMARY, glanceable actions where orange IS
 *                   the meaning (a macro-target nudge, "Log under-target
 *                   protein"). Ordinary Food actions (Add, Save, Log) stay
 *                   on `primary` — orange is a domain/data identity, not a
 *                   per-screen button colour, so do NOT recolour every Food
 *                   button. (The scan affordance is its own special coral
 *                   case — the camera icon in FoodComposerCard.tsx, NOT
 *                   this variant.)
 *   - nutrition-tinted  orange-tinted nutrition surface — the nutrition
 *                   analogue of `sport-tinted`. Soft orange pill for
 *                   secondary/low-emphasis nutrition actions. Text uses the
 *                   AA-clearing nutrition-strong step.
 *
 * Sizes:
 *   - sm   36px tall — used for inline / compact contexts (chips,
 *          inline filters). NOTE: under the 44px touch-target floor.
 *          Only acceptable for non-critical actions or desktop-first
 *          layouts; the default is `md` and that's what most call
 *          sites should use.
 *   - md   44px tall — DEFAULT. Meets iOS HIG 44pt touch-target rule.
 *   - lg   52px tall — for hero CTAs.
 *
 * Loading state: pass `loading` to swap the content for a Loader2
 * spinner. Sets `aria-busy="true"` and `disabled` together; the
 * spinner is `aria-hidden` so screen readers announce the parent
 * button's busy state, not the spinner itself.
 *
 * Icon-only buttons: use the dedicated `<IconButton>` component
 * (./IconButton.tsx). It enforces `aria-label` at compile time, sets
 * a square 44px touch target by default, and applies the same
 * variant/loading semantics.
 *
 * Run-screen control surfaces (RunBottomSheet pause/stop/lock) are
 * intentionally NOT migrated to this primitive yet — they need a
 * dedicated `<RunControlButton>` with larger touch targets, less
 * playful animation, and locked-state semantics. Tracked for a later
 * sprint.
 */
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "destructive"
  | "ghost"
  | "outline"
  | "sport"
  | "sport-tinted"
  | "nutrition"
  | "nutrition-tinted";

export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const BASE_CLASSES = [
  // layout
  "inline-flex items-center justify-center",
  // shape + typography
  "rounded-xl font-semibold select-none",
  // press feedback (canonical 0.97 from the design system)
  "active:scale-[0.97] transition-transform duration-150",
  // disabled state
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
  // focus ring — focus-visible so mouse clicks don't draw the ring
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
].join(" ");

/**
 * Variant → classes. `bg-destructive` and `text-destructive-foreground`
 * resolve via the Sprint 0 @theme tokens; this file is the first
 * downstream consumer of that contract. If those tokens regress, the
 * theme-contract test (src/lib/__tests__/themeContract.test.ts)
 * catches it before this component renders the wrong colour.
 *
 * `bg-primary-strong` is used for the primary variant rather than
 * `bg-primary` because the lighter --primary brand purple is
 * borderline for white text contrast. The strong variant is the
 * AA-clearing CTA filled colour.
 */
/* The sport variants resolve via the --running token (DS1b): bg-running
 * is the full-saturation coral fill; bg-running/10 the 10% tint surface
 * (the prior `${THEME.running}1A` — 1A hex alpha ≈ 10%). The token is
 * theme-invariant — coral is a fixed sport-coding identity, identical in
 * light and dark. */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-strong text-primary-foreground hover:bg-primary-strong/90",
  secondary: "bg-muted text-foreground hover:bg-muted/80",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  ghost: "bg-transparent text-foreground hover:bg-muted",
  outline: "bg-transparent text-foreground border border-border hover:bg-muted",
  sport: "bg-running text-white",
  // 10% coral tint surface + full-saturation coral text — pairs with
  // the standard destructive variant for sport-discipline actions
  // that aren't genuinely destructive.
  "sport-tinted": "bg-running/10 text-running",
  // Nutrition domain CTA — filled uses the AA-clearing -strong step
  // (#B45309) for white text, mirroring how `primary` uses
  // -strong; the identity orange (#D9884E) is too light for white
  // text. The tinted surface is the identity orange at 10%, with the
  // -strong step as the AA-clearing text colour.
  nutrition: "bg-nutrition-strong text-white",
  "nutrition-tinted": "bg-nutrition/10 text-nutrition-strong",
};

/**
 * Size → height + padding + text + icon gap. `md` is the canonical
 * default and meets the 44px touch-target floor without padding tweaks.
 */
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[36px] px-3 text-xs gap-1.5",
  md: "min-h-[44px] px-4 text-sm gap-2",
  lg: "min-h-[52px] px-5 text-base gap-2",
};

function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled,
  leftIcon,
  rightIcon,
  children,
  className,
  type,
  style,
  ref,
  ...rest
}: ButtonProps) {
  const isInteractive = !disabled && !loading;
  return (
    <button
      ref={ref}
      // Default to type="button" so buttons inside forms don't
      // accidentally submit. Callers who want submit behaviour pass
      // type="submit" explicitly.
      type={type ?? "button"}
      disabled={!isInteractive}
      aria-busy={loading || undefined}
      className={cn(
        BASE_CLASSES,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && "w-full",
        className
      )}
      style={style}
      {...rest}
    >
      {loading ? (
        <Loader2
          aria-hidden="true"
          className={cn(
            "animate-spin",
            size === "sm" ? "size-3.5" : size === "lg" ? "size-5" : "size-4"
          )}
        />
      ) : (
        <>
          {leftIcon ? (
            <span aria-hidden="true" className="inline-flex shrink-0">
              {leftIcon}
            </span>
          ) : null}
          {children}
          {rightIcon ? (
            <span aria-hidden="true" className="inline-flex shrink-0">
              {rightIcon}
            </span>
          ) : null}
        </>
      )}
    </button>
  );
}

export { Button };
export default Button;
