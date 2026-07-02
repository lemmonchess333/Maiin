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
      className={`flex items-center gap-2.5 p-2 rounded-lg ${
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
      <span className="text-sm font-medium flex-1 truncate">
        {isSelf ? "You" : name}
      </span>
      <span className="text-sm font-mono tabular-nums font-bold">
        {value.toLocaleString()}{" "}
        <span className="text-xs text-muted-foreground font-normal">
          {unit}
        </span>
      </span>
    </div>
  );
}
