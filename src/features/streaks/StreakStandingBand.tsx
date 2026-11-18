import { Trophy } from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { cardClasses } from "@/components/ui/cardClasses";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { BADGE_ART, BADGE_ICONS } from "./badges";
import { BadgeHex } from "./BadgeHex";
import { ProgressRing } from "./BadgeProgressRing";
import type { StreakStanding } from "./streakStanding";

function daysWord(n: number): string {
  return n === 1 ? "day" : "days";
}

/**
 * The count against something (DS5 rule 46): the longest streak and how
 * far off passing it is, and the next tier with how far off it is, its
 * badge drawn as the badges page draws it, greyed with the streak's
 * progress until it is earned, and said in words when it is. Two tiles
 * side by side while they fit (from 22em of sheet, a 393 pt phone at the
 * standard size), one above the other at larger text or on a narrower
 * phone, written wide-first so a phone without container queries (iOS 15)
 * gets them side by side. Past the last tier, the longest alone. No gold:
 * it means a new best and nothing else (`flameTiers.ts`).
 */
export default function StreakStandingBand({
  standing,
  current,
}: {
  standing: StreakStanding;
  current: number;
}) {
  const { longest, isLongest, next } = standing;
  const toPass = longest - current + 1;
  const longestLine = isLongest
    ? "This is your longest"
    : `${toPass} ${daysWord(toPass)} to pass it`;
  return (
    <div className="@container">
      <div
        className={cn(
          "grid gap-3",
          next && "grid-cols-2 @max-[22em]:grid-cols-1"
        )}
      >
        {/* One stop each for VoiceOver: the tile's sentence, not its
            three lines read one by one. */}
        <div
          role="group"
          aria-label={`Longest, ${longest} ${daysWord(longest)}, ${longestLine}`}
          className={cardClasses({ size: "compact", className: "min-w-0" })}
        >
          <div aria-hidden="true">
            <SectionLabel>Longest</SectionLabel>
            <p className="mt-1 text-2xl font-extrabold font-figure tabular-nums leading-none text-foreground">
              {longest}{" "}
              <span className="text-sm font-semibold font-sans text-muted-foreground">
                {daysWord(longest)}
              </span>
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {isLongest ? (
                longestLine
              ) : (
                <>
                  <span className="font-mono tabular-nums">{toPass}</span>{" "}
                  {daysWord(toPass)} to pass it
                </>
              )}
            </p>
          </div>
        </div>
        {next && (
          <div
            role="group"
            aria-label={`Next, ${next.days} days, ${next.badge.name}${next.earned ? ", already earned" : ""}, ${next.toGo} ${daysWord(next.toGo)} to go`}
            className={cardClasses({
              size: "compact",
              className: "flex min-w-0 items-center gap-3",
            })}
          >
            <div
              className="relative size-[48px] shrink-0"
              data-next-tier={next.earned ? "earned" : "locked"}
              aria-hidden="true"
            >
              {/* The streak's own purple, not the tier's metal: gold, the
                  metal of the 30 and 60 day badges, means a new best and
                  nothing else (`flameTiers.ts`). The art keeps its metal. */}
              {!next.earned && (
                <ProgressRing
                  pct={Math.min(1, current / next.days)}
                  color={THEME.brand}
                  size={48}
                  strokeWidth={2.5}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <BadgeHex
                  Icon={BADGE_ICONS[next.badge.lucideIcon] ?? Trophy}
                  tier={next.badge.tier}
                  earned={next.earned}
                  size={next.earned ? 48 : 34}
                  imageSrc={BADGE_ART[next.badge.id]}
                />
              </div>
            </div>
            <div className="min-w-0" aria-hidden="true">
              <SectionLabel>Next</SectionLabel>
              <p className="mt-1 text-2xl font-extrabold font-figure tabular-nums leading-none text-foreground">
                {next.days}{" "}
                <span className="text-sm font-semibold font-sans text-muted-foreground">
                  days
                </span>
              </p>
              <p className="mt-1.5 text-xs font-semibold text-foreground break-words">
                {next.badge.name}
              </p>
              {next.earned && (
                <p className="text-xs text-muted-foreground">Already earned</p>
              )}
              <p className="text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{next.toGo}</span>{" "}
                {daysWord(next.toGo)} to go
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
