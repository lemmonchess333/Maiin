/**
 * Tropos design-system IconButton primitive.
 *
 * Square tap-target wrapper around a single Lucide icon. Used for
 * header chrome (back / settings / menu / close), inline icon
 * affordances (eye toggle, sort toggle), and any other button
 * whose semantics are "icon + aria-label" with no visible text.
 *
 * Pre-Sprint-1 the app had ~12 different hand-rolled icon-button
 * patterns: `p-1`, `p-1.5`, `p-2`, `p-2 -m-0.5`, etc. Most landed
 * under the 44px iOS HIG touch-target floor (`p-2` around a `w-4`
 * icon ≈ 32px). IconButton bakes the floor in.
 *
 * TypeScript enforces `aria-label` at compile time. There is no path
 * to a working IconButton without it — the type signature requires
 * the prop and rejects undefined. This catches the most common a11y
 * regression (icon-only buttons with no accessible name) at the
 * compiler level rather than at axe-audit time.
 *
 * Sizes (square):
 *   - sm   36px — inline icon affordances (under 44px floor; only
 *          acceptable where the parent row provides additional tap
 *          target, e.g. swipe-to-delete row affordance, or where
 *          surrounding padding makes the actual hit area larger)
 *   - md   44px — DEFAULT. Header chrome, close buttons.
 *   - lg   52px — hero close (e.g. ProModal hero close)
 */
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  ReactNode,
  Ref,
} from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import type { ButtonVariant } from "./Button";

export type IconButtonSize = "sm" | "md" | "lg";

/**
 * `aria-label` is REQUIRED (TypeScript intersects the base button
 * props with `{ "aria-label": string }`). Omitting it fails
 * compilation — the most reliable way to prevent unlabelled icon
 * buttons shipping to production.
 */
type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  "aria-label": string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

const BASE_CLASSES = [
  "inline-flex items-center justify-center shrink-0",
  "rounded-xl select-none",
  "active:scale-[0.97] transition-transform duration-150",
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
].join(" ");

/**
 * Same variant palette as <Button>. IconButtons default to `ghost`
 * because the dominant use case (header chrome, close buttons) is
 * unfilled. Filled variants exist for destructive deletes etc.
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-strong text-primary-foreground hover:bg-primary-strong/90",
  secondary: "bg-muted text-foreground hover:bg-muted/80",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  ghost: "bg-transparent text-foreground hover:bg-muted",
  outline: "bg-transparent text-foreground border border-border hover:bg-muted",
  sport: "text-white",
  "sport-tinted": "",
};

// Mirrors Button.tsx — see comment there about why sport variants use
// inline style rather than Tailwind classes.
const VARIANT_INLINE_STYLES: Partial<Record<ButtonVariant, CSSProperties>> = {
  sport: { backgroundColor: THEME.running },
  "sport-tinted": {
    backgroundColor: `${THEME.running}1A`,
    color: THEME.running,
  },
};

/**
 * Square hit-area sizes. The icon inside scales independently — the
 * outer square is the touch target, the icon visual is centred.
 */
const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: "size-9",
  md: "size-11",
  lg: "size-12",
};

const ICON_SIZE_CLASS: Record<IconButtonSize, string> = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

function IconButton({
  variant = "ghost",
  size = "md",
  loading = false,
  disabled,
  icon,
  className,
  type,
  style,
  ref,
  ...rest
}: IconButtonProps) {
  const isInteractive = !disabled && !loading;
  const variantStyle = VARIANT_INLINE_STYLES[variant];
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={!isInteractive}
      aria-busy={loading || undefined}
      className={cn(
        BASE_CLASSES,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      style={variantStyle ? { ...variantStyle, ...style } : style}
      {...rest}
    >
      {loading ? (
        <Loader2
          aria-hidden="true"
          className={cn("animate-spin", ICON_SIZE_CLASS[size])}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn("inline-flex", ICON_SIZE_CLASS[size])}
        >
          {icon}
        </span>
      )}
    </button>
  );
}

export { IconButton };
