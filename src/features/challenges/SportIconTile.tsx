import { cn } from "@/lib/utils";
import { SPORT_ACCENT, SPORT_TAG, type ChallengeSport } from "./challengeSport";

/**
 * A challenge row's leading tile: the sport's icon on a tint of its
 * colour, the same icon its tag carries. In px, so it keeps its size at
 * larger text and the words take the room.
 */
export default function SportIconTile({
  sport,
  className,
}: {
  sport: ChallengeSport;
  className?: string;
}) {
  const { Icon } = SPORT_TAG[sport];
  const accent = SPORT_ACCENT[sport];
  return (
    <div
      aria-hidden
      className={cn(
        "size-[40px] shrink-0 rounded-xl flex items-center justify-center",
        className
      )}
      style={{ background: `${accent}1F`, color: accent }}
    >
      <Icon className="size-5" />
    </div>
  );
}
