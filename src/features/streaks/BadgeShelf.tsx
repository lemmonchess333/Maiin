import { Suspense, useEffect, useRef } from "react";
import { Trophy } from "lucide-react";
import { lazyRetry } from "@/lib/lazyRetry";
import { Button } from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import { Skeleton } from "@/components/LoadingSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { BADGE_ART, BADGE_ICONS, type EarnedBadge } from "./badges";
import { BadgeHex } from "./BadgeHex";

/* The whole collection: the next badge, the streak figures and every
   badge with its progress. Loaded when someone asks for it, as it was
   when it was a tab. */
const BadgeGrid = lazyRetry(() =>
  import("./BadgeGrid").then((m) => ({ default: m.BadgeGrid }))
);

/**
 * A person's badges on their profile, above their medals: the two
 * together are the one shelf (Trim1 call 3(c), 11 November 2026).
 *
 * Badges had a tab of their own under Analytics, a screen about training
 * figures, while medals sat on the profile and the profile already showed
 * the newest four badges. Hist5b said the tab was an interim place and
 * that badges would move to the profile; this is that move.
 *
 * On anyone's profile it is the newest badges, as before. On your own,
 * "See all" opens the whole collection in place, the way the medals'
 * case opens: what is next, your streaks and each badge's progress, which
 * are yours alone and so are never drawn on someone else's profile.
 */
export default function BadgeShelf({
  badges,
  failed,
  ready,
  isOwn,
  open = false,
  onToggle,
  settled = true,
}: {
  /** The newest earned badges, already cut to the few a profile shows. */
  badges: readonly EarnedBadge[];
  /** The read of them failed. */
  failed: boolean;
  /** The read of them has answered. Until then an empty list says
   *  nothing, and "earn your first" is not said to someone with badges. */
  ready: boolean;
  isOwn: boolean;
  /** Your own profile only: the whole collection is open. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  /** What is drawn above the shelf has reached its final height. The
   *  page's week card changes height when its sessions arrive, and a
   *  scroll made before that lands the heading about 25 px off. */
  settled?: boolean;
}) {
  const showAll = isOwn && open;
  const ref = useRef<HTMLElement>(null);
  /* Arriving on the open collection (the streak sheet's "See your
     badges", a saved link to the old tab) brings it to the top: it sits
     under the profile's header and week. Once, when what is above it has
     settled. Opening it by hand moves nothing. */
  const arrivedOpen = useRef(showAll);
  const broughtUp = useRef(false);
  useEffect(() => {
    if (!arrivedOpen.current || broughtUp.current || !settled) return;
    broughtUp.current = true;
    // No behaviour: the stylesheet picks smooth, or instant under Reduce
    // Motion.
    ref.current?.scrollIntoView?.({ block: "start" });
  }, [settled]);

  // Someone else's profile with nothing earned: no section.
  if (!isOwn && badges.length === 0 && !failed) return null;

  return (
    <section
      ref={ref}
      className="space-y-2 scroll-mt-4"
      aria-labelledby="profile-badges"
    >
      <SectionHeading
        id="profile-badges"
        action={
          isOwn ? (
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2 min-h-[44px] text-primary-strong"
              aria-expanded={showAll}
              onClick={() => onToggle?.(!showAll)}
            >
              {showAll ? "Show fewer" : "See all"}
            </Button>
          ) : undefined
        }
      >
        Badges
      </SectionHeading>

      {showAll ? (
        <SectionErrorBoundary sectionName="profile-badges">
          {/* The page says it shows your profile as other people see it.
              This part is the exception, so it says so. */}
          <p className="text-small text-muted-foreground">
            Only you see this. Other people see the badges you have earned.
          </p>
          <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
            <BadgeGrid />
          </Suspense>
        </SectionErrorBoundary>
      ) : (
        <>
          {failed && (
            <p className="text-small text-muted-foreground">
              Couldn’t load badges.
            </p>
          )}
          {badges.length > 0 ? (
            <ul className="grid grid-cols-4 gap-2" aria-label="Recent badges">
              {badges.map((badge) => (
                <li key={badge.id} className="flex flex-col items-center gap-1">
                  <BadgeHex
                    Icon={BADGE_ICONS[badge.lucideIcon] ?? Trophy}
                    tier={badge.tier}
                    earned
                    size={56}
                    imageSrc={BADGE_ART[badge.id]}
                  />
                  <span className="text-xs text-muted-foreground text-center leading-tight">
                    {badge.name}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            ready &&
            !failed && (
              <p className="text-small text-muted-foreground">
                Log a meal or a workout to earn your first.
              </p>
            )
          )}
        </>
      )}
    </section>
  );
}
