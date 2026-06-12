/**
 * Button class logic — extracted from Button.tsx so it can be shared
 * without tripping react-refresh's "only export components" rule (a
 * component file may not also export plain functions). `Button` consumes
 * `buttonClasses` for its own className; semantically-correct NON-button
 * controls (navigation <Link>/<a>) import it directly to wear the same
 * look with the correct variant.
 */
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "destructive"
  | "destructive-tinted"
  | "ghost"
  | "outline"
  | "sport"
  | "sport-tinted"
  | "nutrition"
  | "nutrition-tinted";

export type ButtonSize = "sm" | "md" | "lg";

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
  // 10% red tint + full-saturation red text — soft "danger zone" actions
  // that are gated by a confirm step, so a filled red would over-escalate.
  "destructive-tinted":
    "bg-destructive/10 text-destructive hover:bg-destructive/20",
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

/**
 * Shareable button class string — the single source of truth for the
 * canonical button look (base + variant + size + fullWidth). `Button`
 * consumes it, but it is exported so semantically-correct NON-button
 * controls can wear the same look without re-rendering as a <button>.
 * The motivating case: navigation CTAs must be <Link>/<a> for correct
 * semantics + middle-click/cmd-click, yet still need the variant colour
 * (coral run, orange nutrition) the primitive owns. Before this, such
 * call sites (e.g. EmptyState's href action) copy-pasted the class
 * string AND hardcoded primary-purple — drift on both axes.
 *
 *   <Link to="/run" className={buttonClasses({ variant: "sport" })}>Start</Link>
 *
 * This is NOT a licence to hand-roll buttons: for an actual button use
 * <Button>. Reach for buttonClasses only when the element must be an
 * anchor/Link (navigation) but should look like a button.
 */
export function buttonClasses(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}): string {
  const {
    variant = "primary",
    size = "md",
    fullWidth = false,
    className,
  } = opts ?? {};
  return cn(
    BASE_CLASSES,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth && "w-full",
    className
  );
}
