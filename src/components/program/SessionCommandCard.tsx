import InlineNumerals from "@/components/ui/InlineNumerals";
/**
 * SessionCommandCard — the Programme Run cockpit's "what do I do next"
 * command surface.
 *
 * Training-plan primitive (see CLAUDE.md → "Training plan primitives").
 * Replaces the old "Next · Pending" status row with a proper command
 * card: a clear title + meta, a single primary action (Start), and a
 * separate overflow that opens the DayCommandSheet. The whole card is
 * NOT the Start button — the primary action is its own control so the
 * overflow can live beside it without a nested-button violation.
 *
 * Sport-coded on its wash, eyebrow and picture: coral for running, purple
 * for lifting. Start is the `neutral` button, Home's (DS4). Tinted surface
 * only — no gradients, no new colours. 44px+ touch targets via the
 * Button/IconButton primitives.
 *
 * DS3: the sport wash is 12%, the Home Today card's, and the halo that sat
 * behind the icon corner is gone with the app's other glows. The title is
 * the card's one big line (the H2 step). A lift day passes `figure`, the
 * drawing of its main lift, which stands at the right. A run passes its
 * runner, the one Home's run card draws, so the two Today cards and
 * Train's two tabs share one layout.
 */

import type { ReactNode } from "react";
import { MoreHorizontal, Play, Footprints, Dumbbell } from "lucide-react";
import MetaLine from "@/components/ui/MetaLine";
import { cn } from "@/lib/utils";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { HeroLineRow } from "@/components/home/SessionHero";
import type { HeroLine } from "@/lib/homeHero";

interface SessionCommandCardProps {
  /** Temporal status label — "Up next", "Due today", "Tomorrow", "Pending". */
  eyebrow: string;
  title: string;
  description?: string;
  meta: string[];
  sport: "run" | "lift";
  /** Optional primary action. Omit for terminal / non-startable sessions
   *  (e.g. a completed or skipped lift day) — the card then shows the
   *  eyebrow + title + meta with no Start button. Run always passes both. */
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  /**
   * The primary action's icon and weight, when the action is not a start.
   *
   * The Lift card's slot carries "Start workout" on the startable day and
   * "Make this next" on an upcoming one — a cursor move, not a session
   * launch, so it takes its own icon and the `secondary` weight the row
   * already gave it rather than the filled Play CTA. Omitted, both fall
   * back to what Start has always used, which is what Run passes.
   */
  primaryActionIcon?: ReactNode;
  primaryActionVariant?: ButtonVariant;
  onManage?: () => void;
  /** A picture of the session, drawn at the right of the title in place
   *  of the sport icon tile. Lift passes its main lift's drawing (the
   *  muscles the day works when no lift is drawn), run its runner.
   *  Hidden from screen readers like the tile, since the title names the
   *  day: the muscle figure's own label speaks of muscles trained, which
   *  a day not yet done has not been. */
  figure?: ReactNode;
  /** Makes the picture a button that opens a guide to the session, as a
   *  lift row's drawing opens its form pictures; it is then named for
   *  screen readers by `figureLabel`. Where the picture gives way, the
   *  label is shown in words under the meta, so the guide stays in reach
   *  at the largest text. Run passes the running form guide. */
  onFigurePress?: () => void;
  figureLabel?: string;
  /** Drawn in the primary action's place: the day card carries the In
   *  progress strip there while its workout is under way. */
  action?: ReactNode;
  /** Keep the command prominent while leaving more room for a surrounding agenda. */
  compact?: boolean;
  /** Home's numbers line for the same session (`liftHeroLine`,
   *  `runHeroLine`): the lead lift's weight and reps against last time,
   *  or a first session's step. Drawn as Home's hero draws it, under the
   *  title and picture. */
  line?: HeroLine | null;
}

export default function SessionCommandCard({
  eyebrow,
  title,
  description,
  meta,
  sport,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionIcon,
  primaryActionVariant,
  onManage,
  figure,
  onFigurePress,
  figureLabel,
  action,
  compact = false,
  line,
}: SessionCommandCardProps) {
  const isRun = sport === "run";
  const Icon = isRun ? Footprints : Dumbbell;
  // DS1b: sport tint via tokens (both branches are in-scope sport colours).
  const surfaceClass = isRun ? "bg-running/12" : "bg-lifting/12";
  const tileClass = isRun ? "bg-running/12" : "bg-lifting/12";
  const accentText = isRun ? "text-running-strong" : "text-lifting-strong";

  return (
    <section
      aria-label={`${eyebrow} — ${title}`}
      className={cn(
        "relative overflow-hidden rounded-xl card-shadow",
        surfaceClass
      )}
    >
      <div
        className={cn(
          "@container relative",
          compact ? "space-y-3 p-3" : "space-y-3 p-4"
        )}
      >
        {/* The picture gives its room to the title under 14em of card
            (larger text on the phone), where beside it "Lat focus" ran
            past the card. */}
        <div className="flex items-start gap-3">
          {/* The description and the dose sit under the title, beside the
              picture: below it, a lift day's figure (taller than two lines
              of heading) left an empty band between the title and
              "~57 min". */}
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-bold", accentText)}>{eyebrow}</p>
            {/* The name at Home's hero size, 36px (DS4 §14m rule 2: the
                hero holds the screen's largest text), so one session has
                one size on Home and on Train. The plan page's compact
                card keeps the H2 step. */}
            <h3
              className={cn(
                "mt-1 font-extrabold tracking-tight text-foreground text-balance",
                compact ? "text-h2 leading-tight" : "text-hero leading-[1.05]"
              )}
            >
              {title}
            </h3>
            {/* The description and the dose take the foreground: on the
                sport wash the grey misses AA. */}
            {description && (
              <p className="mt-2 text-sm font-medium text-foreground">
                <InlineNumerals>{description}</InlineNumerals>
              </p>
            )}
            {meta.length > 0 && (
              <div className="mt-2">
                <MetaLine
                  items={meta}
                  className="font-medium text-foreground"
                />
              </div>
            )}
            {figure && onFigurePress && figureLabel && (
              <Button
                variant="ghost"
                className={cn(
                  "mt-1 -ml-4 hidden @max-[14em]:inline-flex",
                  accentText
                )}
                onClick={onFigurePress}
              >
                {figureLabel}
              </Button>
            )}
          </div>
          {figure && onFigurePress ? (
            <Button
              variant="ghost"
              className="h-auto shrink-0 -my-1 p-0 @max-[14em]:hidden"
              aria-label={figureLabel}
              onClick={onFigurePress}
            >
              <span aria-hidden="true">{figure}</span>
            </Button>
          ) : figure ? (
            <div
              className="shrink-0 -my-1 @max-[14em]:hidden"
              aria-hidden="true"
            >
              {figure}
            </div>
          ) : (
            <div
              className={cn(
                compact
                  ? "size-10 rounded-xl flex @max-[14em]:hidden items-center justify-center shrink-0"
                  : "size-12 rounded-lg flex @max-[14em]:hidden items-center justify-center shrink-0",
                tileClass
              )}
            >
              <Icon className={cn("size-6", accentText)} aria-hidden="true" />
            </div>
          )}
          {onManage && (
            <IconButton
              aria-label="Manage session"
              variant="ghost"
              size="sm"
              icon={<MoreHorizontal />}
              onClick={onManage}
              className="-mt-1 -mr-1"
            />
          )}
        </div>

        {line && <HeroLineRow line={line} sport={sport} onWash />}

        {action ??
          (primaryActionLabel && onPrimaryAction && (
            <Button
              /* The screen's one full-width filled button is neutral, as
                 Home's Start is (DS4, DESIGN_GUIDE §14i, §14m rule 12):
                 the sport keeps its colour on the card's wash, its eyebrow
                 and its picture, not on the button. */
              variant={primaryActionVariant ?? "neutral"}
              /* Home's height, 44: about 45 pt is the reference (§14m
                 rule 21), and Train's 52 was the one Start that differed. */
              size="md"
              className="text-base"
              fullWidth
              leftIcon={
                primaryActionIcon ?? (
                  <Play className="size-4" fill="currentColor" />
                )
              }
              onClick={onPrimaryAction}
            >
              {primaryActionLabel}
            </Button>
          ))}
      </div>
    </section>
  );
}
