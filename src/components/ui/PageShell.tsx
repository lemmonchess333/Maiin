/**
 * PageShell — the one page template.
 *
 * Every route-level page assembled its own header, its own column, its own
 * entrance stagger and its own vertical rhythm, and the measurements say
 * what that produced: five pages, three header idioms, page titles at
 * `text-xl` (20px — the H3 *card title* tier) while the `--text-h1` token
 * (~31px) went used once in the whole app, and Home alone on nine distinct
 * vertical gaps. The result is a card title outranking the page title on
 * the same screen and nothing reading as grouped, which is what "thrown
 * together" is.
 *
 * `Button` fixed the same class of drift for controls by being CODE the
 * pages render through rather than a paragraph they are asked to follow.
 * This is the page-level equivalent. What it owns:
 *
 *   - the header: title at the real H1 scale, an optional line above it
 *     (Home's date), an optional subtitle with a reservable height, a
 *     right action cluster, and an optional controls row beneath (a
 *     segmented control). Every page's header is the same plain one: DS3
 *     retired the two that differed, Home's uppercase TROPOS wordmark
 *     (`brand`) for the date and "Today", and Train's sport-tinted header
 *     zone (`accent`) with its icon tile (`leading`), because the Lift/Run
 *     switch and the page's own content already say which mode is on
 *   - the entrance stagger, which Food, Social and History each declared
 *     identically and Home inlined
 *   - the rhythm between page sections
 *
 * What it does NOT own, deliberately: the column and gutter. `Layout`'s
 * `<main>` already sets `max-w-md mx-auto px-4 py-6`, and a page that
 * re-declared those would render in a different column from its siblings.
 * (A full-screen overlay outside `<main>`, such as Social's people search,
 * legitimately sets its own.) Pages pass sections as children and nothing
 * else.
 */
import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { pageItemVariant, pageStaggerContainer } from "./pageMotion";

/* Root props pass straight through: Food pins its bottom padding to the
   `--page-bottom-pad` safe-area token, and Social and History spread their
   pull-to-refresh touch handlers onto the root. The shell owns the header
   and the rhythm, not the page's other responsibilities. */
type RootProps = Omit<
  HTMLMotionProps<"div">,
  "children" | "title" | "initial" | "animate" | "variants"
>;

export interface PageShellProps extends RootProps {
  /** The page name. */
  title: ReactNode;
  /** A short line above the title — Home's date. */
  eyebrow?: ReactNode;
  /** A line beneath the title. */
  subtitle?: ReactNode;
  /** Reserve a fixed subtitle height so a subtitle that changes length
   *  (Train's is tab-aware) does not move everything below it. The clamp
   *  caps it at the same number so it cannot grow and reintroduce the
   *  jump. Train reserves 1: every line it can render — Lift's split and
   *  day count, and all four Run variants — is at most 37 characters and
   *  fits one line at 393 px. */
  subtitleReserveLines?: 1 | 2;
  /** The right-hand action cluster: icon buttons, pills, a settings link. */
  actions?: ReactNode;
  /** A controls row inside the header zone, beneath the title —
   *  Train's Lift/Run switch. */
  controls?: ReactNode;
  /** Rendered above the header, inside the rhythm — the offline notices
   *  Food and Train show before their title. */
  banner?: ReactNode;
  /** Page sections. */
  children: ReactNode;
  className?: string;
}

export default function PageShell({
  title,
  eyebrow,
  subtitle,
  subtitleReserveLines,
  actions,
  controls,
  banner,
  children,
  className,
  ...rest
}: PageShellProps) {
  const titleClass =
    "text-h1 leading-tight tracking-tight font-extrabold text-foreground";

  return (
    <motion.div
      {...rest}
      className={cn("space-y-4", className)}
      initial={false}
      animate="visible"
      variants={pageStaggerContainer}
    >
      {banner}
      <motion.header variants={pageItemVariant}>
        <div className="flex items-start justify-between gap-3 pt-1 pb-1">
          <div className="min-w-0 flex-1">
            {eyebrow !== undefined && (
              <p className="text-sm font-semibold text-muted-foreground">
                {eyebrow}
              </p>
            )}
            <h1 className={titleClass}>{title}</h1>
            {subtitle !== undefined && (
              <p
                className={cn(
                  "text-sm text-muted-foreground mt-1",
                  subtitleReserveLines === 1 && "line-clamp-1 min-h-[1.25rem]",
                  subtitleReserveLines === 2 && "line-clamp-2 min-h-[2.5rem]"
                )}
              >
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {actions}
            </div>
          )}
        </div>
        {controls && <div className="pt-2">{controls}</div>}
      </motion.header>
      {children}
    </motion.div>
  );
}
