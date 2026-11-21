import { Trophy } from "lucide-react";
import { cardClasses } from "@/components/ui/cardClasses";
import { THEME } from "@/lib/theme";
import { BADGE_ART, BADGE_ICONS, type BadgeDef } from "./badges";
import { BadgeHex } from "./BadgeHex";
import { ProgressRing } from "./BadgeProgressRing";
import { standingLines, type StreakStanding } from "./streakStanding";

/**
 * The count against something (DS5 rule 46): the next tier and how far
 * off it is, with a bar, and the longest streak and how far off passing
 * it is. One row whose largest words are smaller than the sheet's title,
 * which is the screen's one hero (DS4): the tier's badge as the badges
 * page draws it, greyed with the streak's progress in a ring until it is
 * earned; a tier already held from a longer streak is drawn earned and
 * said in words. Past the last tier, that badge and the longest. No gold:
 * it means a new best and nothing else (`flameTiers.ts`), so the ring and
 * the bar are the streak's purple. The text wraps at larger sizes and is
 * never cut off.
 */
export default function StreakStandingBand({
  standing,
  current,
}: {
  standing: StreakStanding;
  current: number;
}) {
  const { next, lastTier } = standing;
  const lines = standingLines(standing, current);
  const art: { badge: BadgeDef; earned: boolean } | null = next ?? lastTier;
  const pct = next ? Math.min(1, current / next.days) : 1;
  const sentence = [lines.title, lines.progress, lines.best]
    .filter(Boolean)
    .join(". ");
  return (
    // The art beside the words down to 15em of band (a 320 pt phone at
    // the standard text size keeps the row); above them under that, at
    // larger text on a narrow phone. Wide-first, so a phone without
    // container queries (iOS 15) keeps the row.
    <div className="@container">
      {/* One stop for VoiceOver: the band's sentence, not its lines one
          by one. */}
      <div
        role="group"
        aria-label={`${sentence}.`}
        className={cardClasses({
          size: "compact",
          className:
            "flex min-w-0 items-center gap-3 @max-[15em]:flex-col @max-[15em]:items-start",
        })}
      >
        {art && (
          <div
            className="relative size-[48px] shrink-0"
            data-next-tier={art.earned ? "earned" : "locked"}
            aria-hidden="true"
          >
            {/* The streak's own purple, not the tier's metal: gold, the
                metal of the 30 and 60 day badges, means a new best and
                nothing else (`flameTiers.ts`). The art keeps its metal. */}
            {!art.earned && (
              <ProgressRing
                pct={pct}
                color={THEME.brand}
                size={48}
                strokeWidth={2.5}
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <BadgeHex
                Icon={BADGE_ICONS[art.badge.lucideIcon] ?? Trophy}
                tier={art.badge.tier}
                earned={art.earned}
                size={art.earned ? 48 : 34}
                imageSrc={BADGE_ART[art.badge.id]}
              />
            </div>
          </div>
        )}
        <div className="w-full min-w-0 flex-1" aria-hidden="true">
          <p className="text-sm font-semibold text-foreground break-words">
            {lines.title}
          </p>
          {next && (
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
              data-streak-bar
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${pct * 100}%`, background: THEME.brand }}
              />
            </div>
          )}
          {lines.progress && (
            <p className="mt-1 text-xs tabular-nums text-muted-foreground break-words">
              {lines.progress}
            </p>
          )}
          {lines.best && (
            <p className="text-xs tabular-nums text-muted-foreground break-words">
              {lines.best}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
