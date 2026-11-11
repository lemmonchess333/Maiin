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
 *   - the section variants, which Food, Social and History each declared
 *     identically and Home inlined. The page starts settled
 *     (`initial={false}`): switching tabs is the most frequent thing in the
 *     app, and restaggering every section on each switch only slowed it
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
  /** The page name for screen readers only: a screen whose hero names it
   *  draws no large title above the hero (DS4, DESIGN_GUIDE §14m) and
   *  keeps its h1 for a reader landing on the page. Home's. */
  titleHidden?: boolean;
  /** A short line above the title — Home's date. */
  eyebrow?: ReactNode;
  /** A control in the title's place, beside the actions, for a screen
   *  whose title is hidden: Social's Together/Feed switch. The header is
   *  then one row, the control and the actions (DS4, DESIGN_GUIDE §14m:
   *  no large title above a hero, one control row of 32-40pt). */
  lead?: ReactNode;
  /** A line beneath the title. It wraps rather than truncating. */
  subtitle?: ReactNode;
  /** The other lines a switching subtitle can show (Train's is
   *  tab-aware). Each is laid in the subtitle's own place, unseen and
   *  unread, so the header is as tall as the tallest of them at any
   *  width and text size, and switching moves nothing below it. */
  subtitleAlternates?: ReactNode[];
  /** Lays the subtitle under the title and the actions, the header's full
   *  width, rather than in the title's column beside the actions. Train's:
   *  in the column its line ran to two at 393pt and three at 320. */
  subtitleBelow?: boolean;
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
  titleHidden = false,
  eyebrow,
  lead,
  subtitle,
  subtitleAlternates,
  subtitleBelow = false,
  actions,
  controls,
  banner,
  children,
  className,
  ...rest
}: PageShellProps) {
  const titleClass =
    "text-h1 leading-tight tracking-tight font-extrabold text-foreground";

  /* Under the title row, which is the actions' 44pt and so already
     leaves room below the title's 39, the line needs no gap of its own. */
  const subtitleGap = subtitleBelow ? "mt-0" : "mt-1";
  const subtitleLine =
    subtitle === undefined ? null : subtitleAlternates?.length ? (
      /* One grid cell holds every line: the shown one, and the others
         invisible beneath it, so the cell is the height of the tallest. */
      <p className={cn("grid text-sm text-muted-foreground", subtitleGap)}>
        <span className="col-start-1 row-start-1">{subtitle}</span>
        {subtitleAlternates.map((line, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="invisible col-start-1 row-start-1"
          >
            {line}
          </span>
        ))}
      </p>
    ) : (
      <p className={cn("text-sm text-muted-foreground", subtitleGap)}>
        {subtitle}
      </p>
    );

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
        {/* The title's column is never narrower than its longest word,
            and the row wraps: at large text, actions that no longer fit
            beside the title (Food's date switcher) move under it rather
            than being drawn over it. */}
        <div
          className={cn(
            "flex flex-wrap justify-between gap-x-3 gap-y-2 pt-1 pb-1",
            /* With no title the row is the eyebrow or the lead control
               beside the actions, so the two share a centre line. */
            titleHidden ? "items-center" : "items-start"
          )}
        >
          <div className="min-w-min flex-1">
            {eyebrow !== undefined && (
              <p className="text-sm font-semibold text-muted-foreground">
                {eyebrow}
              </p>
            )}
            {lead !== undefined && <div>{lead}</div>}
            <h1 className={titleHidden ? "sr-only" : titleClass}>{title}</h1>
            {!subtitleBelow && subtitleLine}
          </div>
          {actions && (
            <div className="ml-auto flex items-center gap-1 flex-shrink-0">
              {actions}
            </div>
          )}
        </div>
        {subtitleBelow && subtitleLine}
        {controls && <div className="pt-2">{controls}</div>}
      </motion.header>
      {children}
    </motion.div>
  );
}
