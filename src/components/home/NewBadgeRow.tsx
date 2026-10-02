import { Award, ChevronRight } from "lucide-react";
import { BadgeHex } from "@/features/streaks/BadgeHex";
import { cardClasses } from "@/components/ui/cardClasses";
import { haptic } from "@/lib/haptic";

/**
 * A badge waiting on Home, as one row that opens it (an owner call,
 * ADR-0004's amendment).
 *
 * Badges opened over Home on their own before: a sealed badge to tap
 * open, then Nice to close, before the day's session could be seen. A
 * new account met six in its first four days, four of them that way.
 * A badge a session earns still opens on that session's finish screen;
 * any other waits here until it is wanted. The hexagon stays sealed
 * (grey) until it is opened.
 */
export default function NewBadgeRow({
  name,
  onOpen,
}: {
  name: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        onOpen();
      }}
      className={cardClasses({
        size: "compact",
        className:
          "w-full min-h-11 flex items-center gap-3 text-left active:scale-[0.97] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      })}
    >
      <BadgeHex Icon={Award} tier="bronze" earned={false} size={36} />
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-medium text-muted-foreground">
          New badge
        </span>
        <span className="block text-sm font-semibold text-foreground truncate">
          {name}
        </span>
      </span>
      <ChevronRight
        className="size-4 text-muted-foreground shrink-0"
        aria-hidden="true"
      />
    </button>
  );
}
