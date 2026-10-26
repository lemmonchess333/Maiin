import { RANK_COLORS } from "../../lib/theme";
import Avatar from "../Avatar";
import BlockAwareAvatar from "./BlockAwareAvatar";

/**
 * The single leaderboard row (visual audit Phase 6 W6). Before this,
 * LeaderboardCard carried two near-identical 40-line copies of the row
 * markup (its <3 and ≥3 branches) and FullLeaderboard a third, each with
 * subtly different rank sizing (`w-5 text-xs` vs `w-6 text-sm`) and a
 * self-row that sometimes dropped its rank colour. One component, one
 * treatment:
 *   - rank: w-6, mono tabular, medal-coloured for the top 3 everywhere
 *   - "you" highlight: bg-primary/10 + border-primary/25 (the old /5+/15
 *     was near-invisible — the one row a user scans for didn't pop)
 */
export default function LeaderboardRow({
  rank,
  uid,
  name,
  photoURL,
  value,
  unit,
  isSelf,
  selfInitial,
}: {
  rank: number;
  uid: string;
  name: string;
  photoURL?: string;
  value: number;
  unit: string;
  isSelf: boolean;
  selfInitial?: string;
}) {
  return (
    <div
      /* flex-wrap: at large text sizes the score moves under the name,
         at the row's end, rather than off the screen. */
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 p-2 rounded-lg min-w-0 ${
        isSelf ? "bg-primary/10 border border-primary/25" : ""
      }`}
    >
      {/* The numeral is the rank and stays in the text colour; the medal
          metal rings it, a marker beside the words rather than the words,
          since gold and silver are near-invisible as text on a light card. */}
      <span
        className="min-w-6 h-6 px-1 rounded-full inline-flex items-center justify-center text-sm font-bold font-mono tabular-nums text-foreground shrink-0"
        style={
          rank <= 3
            ? { boxShadow: `inset 0 0 0 2px ${RANK_COLORS[rank - 1]}` }
            : undefined
        }
      >
        {rank}
      </span>
      {isSelf ? (
        <Avatar
          photoURL={photoURL}
          displayName="You"
          fallbackInitial={selfInitial}
          size="sm"
        />
      ) : (
        <BlockAwareAvatar
          uid={uid}
          photoURL={photoURL}
          displayName={name}
          size="sm"
        />
      )}
      {/* An explicit min-width alongside flex-1: a flex child's default
          min-width is `auto`, so without one a long name refuses to
          shrink below its content and pushes the score — the thing the
          row exists to rank — off the right edge. `truncate` alone cannot
          fix that, because the overflow happens at the flex layout step.
          3em rather than 0, so at large text sizes the score wraps
          under a name that is still readable.
          dir="auto" lets a right-to-left name truncate from its own end;
          text-left keeps a short one at the row's start, by its avatar. */}
      <span
        dir="auto"
        className="min-w-[min(3em,100%)] flex-1 truncate text-left text-sm font-medium"
      >
        {isSelf ? "You" : name}
      </span>
      {/* The score is what the row is scanned for, so it steps up a size
          (14 -> 16px) and never shrinks or breaks across lines. Weight deliberately
          stays 700, NOT 800: DESIGN_GUIDE reserves extrabold for hero
          numbers and page titles and forbids mixing 700/800 in one
          visual tier — the rank beside it is 700. Size carries the
          hierarchy here; weight would break the rule. */}
      <span className="ml-auto shrink-0 whitespace-nowrap text-body font-bold font-mono tabular-nums">
        {value.toLocaleString()}{" "}
        <span className="text-caption text-muted-foreground font-normal">
          {unit}
        </span>
      </span>
    </div>
  );
}
