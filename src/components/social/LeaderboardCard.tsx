import { Footprints, Dumbbell, Zap, ChevronRight } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { THEME } from "../../lib/theme";
import {
  CHALLENGE_LABELS,
  boardFigure,
  type ChallengeType,
} from "../../lib/leaderboard";
import { rankNamedBoard, useFriendsBoard } from "@/hooks/useFriendsBoard";
import LeaderboardRow from "./LeaderboardRow";
import ShowMyWeekRow from "./ShowMyWeekRow";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import EmptyState from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

/**
 * The friends board on the feed (Polish2 call 5): this week's sessions for
 * you and the people you follow who share their week, from the tally the
 * server keeps (friendsBoard/{uid}). Sessions is the card's measure, the
 * one that compares a lifter with a runner; the full board adds distance
 * and volume. Only people with something this week are ranked.
 */
export default function LeaderboardCard({
  challenge = "weekly_sessions",
  onViewFull,
}: {
  challenge?: ChallengeType;
  onViewFull?: () => void;
}) {
  const { user, profile } = useAuth();
  const { loading, failed, weeks, reload } = useFriendsBoard();
  const entries = rankNamedBoard(weeks, challenge);

  /* Name and unit come from `CHALLENGE_LABELS`; only the ICON is local,
     because the full view renders a tab row rather than a sport-coded
     glyph and has no use for it. */
  const challengeIcons: Record<ChallengeType, string> = {
    weekly_distance: "footprints",
    weekly_volume: "dumbbell",
    weekly_sessions: "zap",
    weekly_workouts: "dumbbell",
  };

  const { title } = CHALLENGE_LABELS[challenge];
  const liftUnit = useLiftUnit();
  const figure = (value: number) => boardFigure(challenge, value, liftUnit);
  const icon = challengeIcons[challenge];
  const top3 = entries.slice(0, 3);
  const selfEntry = entries.find((e) => e.uid === user?.uid);
  const selfInTop3 = top3.some((e) => e.uid === user?.uid);

  return (
    <div className="p-4 rounded-2xl bg-card card-shadow">
      <div className="flex items-center gap-2 mb-3">
        {icon === "footprints" ? (
          <Footprints className="size-5 text-running" />
        ) : icon === "dumbbell" ? (
          <Dumbbell className="size-5 text-lifting" />
        ) : (
          <Zap className="size-5" style={{ color: THEME.brand }} />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold truncate">{title}</h3>
        </div>
        {/* Quiet, and never the element that gives up room: the title is
            the variable-length half ("Running Distance" vs "Workouts"),
            so it truncates and this stays whole. */}
        {/* Two words and no digits — the numeral face buys nothing here.
            (The ROWS below it are where the figures live.) */}
        <span className="shrink-0 text-caption text-muted-foreground">
          This week
        </span>
      </div>

      <div className="space-y-1.5">
        {loading && (
          <div className="flex items-center justify-center py-3">
            <Spinner size="sm" variant="muted" label="Loading leaderboard" />
          </div>
        )}

        {!loading && failed && (
          <div className="flex flex-wrap items-center justify-between gap-3 py-1">
            <p className="text-xs text-muted-foreground">
              Couldn&rsquo;t load the board.
            </p>
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          </div>
        )}

        {!loading && !failed && entries.length === 0 && (
          <EmptyState
            compact
            icon={Zap}
            headline="Nothing to compare yet"
            sub="People you follow show here once they share their week."
            accent={THEME.brand}
          />
        )}

        {!loading && entries.length > 0 && (
          <>
            {top3.map((entry) => (
              <LeaderboardRow
                key={entry.uid}
                rank={entry.rank}
                uid={entry.uid}
                name={entry.name}
                photoURL={entry.photoURL}
                value={figure(entry.value).value}
                unit={figure(entry.value).unit}
                isSelf={entry.uid === user?.uid}
                selfInitial={
                  profile?.displayName?.charAt(0) ||
                  user?.displayName?.charAt(0)
                }
              />
            ))}

            {entries.length < 3 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                Follow more athletes to grow the leaderboard
              </p>
            )}

            {entries.length >= 3 && selfEntry && !selfInTop3 && (
              <>
                <div className="flex justify-center py-0.5">
                  <span className="text-xs text-muted-foreground">···</span>
                </div>
                <LeaderboardRow
                  rank={selfEntry.rank}
                  uid={selfEntry.uid}
                  name="You"
                  photoURL={selfEntry.photoURL}
                  value={figure(selfEntry.value).value}
                  unit={figure(selfEntry.value).unit}
                  isSelf
                  selfInitial={
                    profile?.displayName?.charAt(0) ||
                    user?.displayName?.charAt(0)
                  }
                />
              </>
            )}
          </>
        )}
        {!loading && !failed && <ShowMyWeekRow onShared={reload} />}
      </div>

      {!loading && entries.length > 0 && onViewFull && (
        <button
          type="button"
          onClick={onViewFull}
          className="flex items-center justify-center gap-1 w-full mt-3 pt-3 min-h-[44px] border-t border-border/30 text-xs font-medium text-lifting-strong hover:text-lifting-strong/80 transition-colors"
        >
          See full leaderboard
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}
