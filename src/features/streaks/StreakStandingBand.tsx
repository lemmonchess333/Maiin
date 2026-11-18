import { Trophy } from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { cardClasses } from "@/components/ui/cardClasses";
import { cn } from "@/lib/utils";
import { BADGE_ART, BADGE_ICONS, TIER_COLORS } from "./badges";
import { BadgeHex } from "./BadgeHex";
import { ProgressRing } from "./BadgeProgressRing";
import type { StreakStanding } from "./streakStanding";

function daysWord(n: number): string {
  return n === 1 ? "day" : "days";
}

/**
 * The count against something (DS5 rule 46): the longest streak and how
 * far off beating it is, and the next tier with how far off it is, its
 * badge drawn as the badges page draws it, greyed with its progress until
 * it is earned. Two tiles side by side while they fit, one above the
 * other at larger text or on a narrow phone, written wide-first so a
 * phone without container queries (iOS 15) gets them side by side. Past
 * the last tier, the longest alone. No gold: it means a new best and
 * nothing else (`flameTiers.ts`).
 */
export default function StreakStandingBand({
  standing,
  current,
}: {
  standing: StreakStanding;
  current: number;
}) {
  const { longest, isLongest, next } = standing;
  return (
    <div className="@container">
      <div
        className={cn(
          "grid gap-3",
          next && "grid-cols-2 @max-[21em]:grid-cols-1"
        )}
      >
        <div className={cardClasses({ size: "compact", className: "min-w-0" })}>
          <SectionLabel>Longest</SectionLabel>
          <p className="mt-1 text-2xl font-extrabold font-figure tabular-nums leading-none text-foreground">
            {longest}{" "}
            <span className="text-sm font-semibold font-sans text-muted-foreground">
              {daysWord(longest)}
            </span>
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {isLongest ? (
              "This streak"
            ) : (
              <>
                <span className="font-mono tabular-nums">
                  {longest - current + 1}
                </span>{" "}
                {daysWord(longest - current + 1)} to beat it
              </>
            )}
          </p>
        </div>
        {next && (
          <div
            className={cardClasses({
              size: "compact",
              className: "flex min-w-0 items-center gap-3",
            })}
          >
            <div
              className="relative size-[48px] shrink-0"
              data-next-tier={next.earned ? "earned" : "locked"}
            >
              {!next.earned && (
                <ProgressRing
                  pct={Math.min(1, current / next.days)}
                  color={TIER_COLORS[next.badge.tier]}
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
            <div className="min-w-0">
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
