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
 *   - the header: title at the real H1 scale, an optional leading tile,
 *     an optional subtitle with a reservable height, a right action
 *     cluster, and an optional controls row beneath (a segmented control)
 *   - the two deliberate header designs, kept as first-class options
 *     rather than flattened: Home's brand WORDMARK (`brand`), and Train's
 *     sport-tinted header zone (`accent`) whose colour makes the page
 *     answer to the active mode
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
  /** The page name. On Home this is the brand wordmark — pass `brand`. */
  title: ReactNode;
  /** Brand treatment for the wordmark: tracked uppercase rather than the
   *  H1 scale. Home only. */
  brand?: boolean;
  /** A small tile before the title — Train's sport icon. */
  leading?: ReactNode;
  /** A line beneath the title. */
  subtitle?: ReactNode;
  /** Reserve two lines of subtitle height so a subtitle that changes
   *  length (Train's is tab-aware) does not move everything below it.
   *  `line-clamp-2` caps it so it cannot grow to three and reintroduce
   *  the jump. */
  subtitleReserveLines?: 2;
  /** The right-hand action cluster: icon buttons, pills, a settings link. */
  actions?: ReactNode;
  /** A controls row inside the header zone, beneath the title —
   *  Train's Lift/Run switch. */
  controls?: ReactNode;
  /** A colour that tints the whole header zone at low alpha, so the
   *  header reads as belonging to the active mode. Train passes the
   *  sport colour; it cross-fades on tab change (a colour transition,
   *  which composites — never a filter). */
  accent?: string;
  /** Rendered above the header, inside the rhythm — the offline notices
   *  Food and Train show before their title. */
  banner?: ReactNode;
  /** Page sections. */
  children: ReactNode;
  className?: string;
}

export default function PageShell({
  title,
  brand = false,
  leading,
  subtitle,
  subtitleReserveLines,
  actions,
  controls,
  accent,
  banner,
  children,
  className,
  ...rest
}: PageShellProps) {
  const titleClass = brand
    ? "text-2xl font-extrabold tracking-[0.14em] uppercase leading-none text-foreground"
    : "text-h1 leading-tight tracking-tight font-extrabold text-foreground";

  return (
    <motion.div
      {...rest}
      className={cn("space-y-4", className)}
      initial="hidden"
      animate="visible"
      variants={pageStaggerContainer}
    >
      {banner}
      <motion.header
        variants={pageItemVariant}
        className={cn(
          accent &&
            "rounded-2xl px-3 pt-1.5 pb-2.5 transition-colors duration-300"
        )}
        style={accent ? { backgroundColor: `${accent}0F` } : undefined}
      >
        <div className="flex items-start justify-between gap-3 pt-1 pb-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {leading}
              <h1 className={titleClass}>{title}</h1>
            </div>
            {subtitle !== undefined && (
              <p
                className={cn(
                  "text-xs text-muted-foreground mt-1",
                  subtitleReserveLines === 2 && "line-clamp-2 min-h-[2rem]"
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
