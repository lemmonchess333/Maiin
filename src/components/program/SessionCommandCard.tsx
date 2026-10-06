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
 * Sport-coded: running uses coral (`sport` Button variant), lifting uses
 * brand purple (`primary`). Tinted surface only — no gradients, no new
 * colours. 44px+ touch targets via the Button/IconButton primitives.
 *
 * DS3: the sport wash is 12%, the Home Today card's, and the halo that sat
 * behind the icon corner is gone with the app's other glows. The title is
 * the card's one big line (the H2 step). A lift day passes `figure`, the
 * muscles the day works, which stands at the right. A run passes its
 * type's `icon`, drawn in a tile at the right, the way Home's run card
 * draws it, so the two Today cards and Train's two tabs share one layout.
 */

import type { ComponentType, ReactNode } from "react";
import { MoreHorizontal, Play, Footprints, Dumbbell } from "lucide-react";
import MetaLine from "@/components/ui/MetaLine";
import { cn } from "@/lib/utils";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

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
   *  of the sport icon tile. Lift passes the day's muscles. Hidden from
   *  screen readers like the tile, since the title names the day: the
   *  muscle figure's own label speaks of muscles trained, which a day not
   *  yet done has not been. */
  figure?: ReactNode;
  /** The tile's glyph when there is no figure: a run passes its type's
   *  (`runTemplateIcon`). Defaults to the sport's own icon. */
  icon?: ComponentType<{ className?: string }>;
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
  icon,
}: SessionCommandCardProps) {
  const isRun = sport === "run";
  const Icon = icon ?? (isRun ? Footprints : Dumbbell);
  // DS1b: sport tint via tokens (both branches are in-scope sport colours).
  const surfaceClass = isRun ? "bg-running/12" : "bg-lifting/12";
  const tileClass = isRun ? "bg-running/12" : "bg-lifting/12";
  const accentText = isRun ? "text-running-strong" : "text-lifting-strong";

  return (
    <section
      aria-label={`${eyebrow} — ${title}`}
      className={cn(
        "relative overflow-hidden rounded-2xl card-shadow",
        surfaceClass
      )}
    >
      <div className="@container relative space-y-4 p-4">
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
            <h3 className="mt-1 text-h2 font-extrabold leading-tight tracking-tight text-foreground text-balance">
              {title}
            </h3>
            {description && (
              <p className="mt-2 text-sm text-muted-foreground">
                <InlineNumerals>{description}</InlineNumerals>
              </p>
            )}
            {meta.length > 0 && (
              <div className="mt-2">
                <MetaLine items={meta} />
              </div>
            )}
          </div>
          {figure ? (
            <div
              className="shrink-0 -my-1 @max-[14em]:hidden"
              aria-hidden="true"
            >
              {figure}
            </div>
          ) : (
            <div
              className={cn(
                "size-12 rounded-2xl flex @max-[14em]:hidden items-center justify-center shrink-0",
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

        {primaryActionLabel && onPrimaryAction && (
          <Button
            variant={
              primaryActionVariant ?? (sport === "run" ? "sport" : "primary")
            }
            size="lg"
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
        )}
      </div>
    </section>
  );
}
