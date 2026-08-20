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
      className={`flex items-center gap-2.5 p-2 rounded-lg min-w-0 ${
        isSelf ? "bg-primary/10 border border-primary/25" : ""
      }`}
    >
      <span
        className="w-6 text-sm font-bold font-mono tabular-nums text-center shrink-0"
        style={{ color: rank <= 3 ? RANK_COLORS[rank - 1] : undefined }}
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
      {/* min-w-0 alongside flex-1: a flex child's default min-width is
          `auto`, so without it a long name refuses to shrink below its
          content and pushes the score — the thing the row exists to
          rank — off the right edge. `truncate` alone cannot fix that,
          because the overflow happens at the flex layout step. */}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {isSelf ? "You" : name}
      </span>
      {/* The score is what the row is scanned for, so it steps up a size
          (14 -> 16px) and never shrinks or wraps. Weight deliberately
          stays 700, NOT 800: DESIGN_GUIDE reserves extrabold for hero
          numbers and page titles and forbids mixing 700/800 in one
          visual tier — the rank beside it is 700. Size carries the
          hierarchy here; weight would break the rule. */}
      <span className="shrink-0 whitespace-nowrap text-body font-bold font-mono tabular-nums">
        {value.toLocaleString()}{" "}
        <span className="text-caption text-muted-foreground font-normal">
          {unit}
        </span>
      </span>
    </div>
  );
}
