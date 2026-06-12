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
import {
  buttonClasses,
  type ButtonVariant,
  type ButtonSize,
} from "@/components/ui/buttonClasses";

// Re-exported so existing importers (`import { ButtonVariant } from
// "@/components/ui/Button"`) keep working after the class logic moved to
// ./buttonClasses. `buttonClasses` itself is NOT re-exported here — a
// component file may not export plain functions (react-refresh rule);
// import it from "@/components/ui/buttonClasses" directly.
export type { ButtonVariant, ButtonSize };

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

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
      className={buttonClasses({ variant, size, fullWidth, className })}
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
