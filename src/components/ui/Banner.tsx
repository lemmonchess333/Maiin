/**
 * Tropos design-system Banner primitive.
 *
 * Severity-based inline notice surface. Used for state-derived
 * banners that live inside a page section (race-elapsed,
 * compressed-plan, recovery, etc.) — NOT for transient feedback,
 * which uses sonner toasts.
 *
 * Run7 Q10 contract:
 *   - info     → coral 6% tint surface, coral icon  (running / sport context)
 *   - warning  → amber 8% tint surface, amber icon  (calendar warnings, e.g.
 *                race date elapsed, schedule compression)
 *   - No `error` variant. Errors are surfaced via toasts (auth.tsx /
 *     sonner), never as a stacked banner.
 *
 * Dismissibility:
 *   - Dismissibility is action-prompting based, not severity-based.
 *     Pass `onDismiss` when the banner represents a transient prompt
 *     the user can acknowledge (e.g. race-elapsed). Omit it for
 *     state-derived banners (recovery, compressed) where the
 *     visibility tracks runPlan.phase — dismissing a state banner
 *     would just re-render it on the next load.
 *
 * Stacking:
 *   - Banners are designed to stack vertically with gap-2; the caller
 *     manages stacking order. Run7 Q10 prescribes severity-ordered
 *     stacking (warning > info) but enforcement is at the call site.
 *
 * Accessibility:
 *   - info     → role="status"   (polite, non-interruptive)
 *   - warning  → role="alert"    (assertive — user should see it)
 *   Both surfaces remain part of the DOM; `aria-live` is implicit via
 *   the role.
 *
 * Reduced motion:
 *   - First-render slide+fade is suppressed when the user has
 *     `prefers-reduced-motion: reduce` set at the OS level — see the
 *     `animate-banner-in` class in animations.css.
 */
import type { ReactNode } from "react";
import { Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";

export type BannerVariant = "info" | "warning";

interface BannerProps {
  variant: BannerVariant;
  title: string;
  description?: ReactNode;
  /** Inline action (button/link) rendered at the end of the body. */
  action?: ReactNode;
  /** Custom icon override; defaults to lucide Info / AlertTriangle by variant. */
  icon?: ReactNode;
  /** Optional dismiss handler — renders the close button when provided. */
  onDismiss?: () => void;
  /** ARIA label for the dismiss button. Required when `onDismiss` is set. */
  dismissLabel?: string;
  className?: string;
}

interface VariantStyle {
  /** Surface background — applied to the outer card via inline style
   *  so we can use computed alphas on top of the theme constant. */
  background: string;
  /** Icon + emphasis text colour. */
  accent: string;
  /** WAI-ARIA role for the live region. */
  role: "status" | "alert";
  /** Default icon rendered when `icon` prop is not supplied. */
  DefaultIcon: typeof Info;
}

/* Tint alphas:
 *   info    coral 6%  (Run7 Q7 + Q10) — running discipline neutral
 *   warning amber 8%  (Run7 Q10)
 *
 * Dark-mode visibility floor (12–15% per Q10) is applied via a class
 * suffix below — the inline alpha is the light-mode value; the
 * Tailwind `dark:` class layer bumps it up via a CSS variable when
 * needed. For now we leave the inline value as the light spec since
 * existing banners across the file follow the same pattern; the
 * dark-mode bump lands when banners migrate in B2.6. */
const VARIANT_STYLES: Record<BannerVariant, VariantStyle> = {
  info: {
    background: `${THEME.running}0F`, // 6% in hex
    accent: THEME.running,
    role: "status",
    DefaultIcon: Info,
  },
  warning: {
    background: `${THEME.amber}14`, // 8% in hex
    accent: THEME.amber,
    role: "alert",
    DefaultIcon: AlertTriangle,
  },
};

export function Banner({
  variant,
  title,
  description,
  action,
  icon,
  onDismiss,
  dismissLabel,
  className,
}: BannerProps) {
  const style = VARIANT_STYLES[variant];
  const IconComponent = style.DefaultIcon;
  return (
    <div
      role={style.role}
      className={cn(
        "relative flex gap-3 rounded-xl p-3 text-xs",
        // Border at higher alpha so the surface reads as a contained
        // element on white. Matches existing banner pattern in
        // ProgrammeRunSection (THEME.running}30 etc).
        "border",
        className
      )}
      style={{ background: style.background, borderColor: `${style.accent}30` }}
    >
      <span
        aria-hidden="true"
        className="flex-shrink-0 mt-0.5"
        style={{ color: style.accent }}
      >
        {icon ?? <IconComponent className="size-4" />}
      </span>
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="font-semibold text-foreground">{title}</p>
        {description ? (
          <div className="text-muted-foreground">{description}</div>
        ) : null}
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel ?? "Dismiss"}
          // 32px hit target — banners are ambient, this isn't a primary
          // action so we sit just below the 44px floor deliberately.
          className="flex-shrink-0 -m-1 p-1 rounded-md text-muted-foreground hover:text-foreground active:scale-95"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export default Banner;
