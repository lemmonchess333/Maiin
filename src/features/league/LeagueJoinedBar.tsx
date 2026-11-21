import { LEAGUE_LIGHT } from "./leaguePalettes";

/** How far the league is from starting: joined out of needed, in bronze,
 *  the tier everyone starts in. Drawn only beside a count said aloud
 *  (`showsJoinedCount`), so it never stands for a number the words keep
 *  back. */
export default function LeagueJoinedBar({
  joined,
  needed,
}: {
  joined: number;
  needed: number;
}) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full track-cut"
      role="progressbar"
      aria-label="People who have joined"
      aria-valuemin={0}
      aria-valuemax={needed}
      aria-valuenow={Math.min(joined, needed)}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, (100 * joined) / needed)}%`,
          background: LEAGUE_LIGHT.bronze,
        }}
      />
    </div>
  );
}
