import { useState } from "react";
import { ChevronLeft, Zap } from "lucide-react";
import { THEME } from "@/lib/theme";
import { useAuth } from "../../lib/auth";
import {
  CHALLENGE_LABELS,
  boardFigure,
  type ChallengeType,
} from "../../lib/leaderboard";
import { rankNamedBoard, useFriendsBoard } from "@/hooks/useFriendsBoard";
import { Skeleton } from "../LoadingSkeleton";
import LeaderboardRow from "./LeaderboardRow";
import ShowMyWeekRow from "./ShowMyWeekRow";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import EmptyState from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { SOCIAL_GATES, shouldShowLeaderboard } from "@/lib/socialGates";
import { topPercent } from "@/features/challenges/useChallengePercentile";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

/* Tab ORDER is this surface's own (sessions first, the one the card shows);
   the name and unit are not — they come from `CHALLENGE_LABELS` (the unit
   through `boardFigure`), which is the only copy. Two surfaces each carrying their own table is what let
   two of the four names drift apart unnoticed. */
const TAB_ORDER: ChallengeType[] = [
  "weekly_sessions",
  "weekly_distance",
  "weekly_volume",
];
const TABS = TAB_ORDER.map((key) => ({
  key,
  label: CHALLENGE_LABELS[key].title,
}));

/** The friends board in full (Polish2 call 5): one read of the week's
 *  tallies, ranked per tab, so a tab switch reads nothing new. */
export default function FullLeaderboard({ onBack }: { onBack: () => void }) {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<ChallengeType>("weekly_sessions");
  const { loading, failed, weeks, reload } = useFriendsBoard();
  const entries = rankNamedBoard(weeks, activeTab);

  const liftUnit = useLiftUnit();
  const figure = (value: number) => boardFigure(activeTab, value, liftUnit);

  // SOCIAL S4 — a vs-others leaderboard only earns its place at a ≥20
  // athlete cohort, and even then is percentile/neighbourhood-framed
  // (never a global absolute-rank list that exposes individuals). Below
  // the threshold we show a "unlocks at N" state instead.
  const cohortSize = entries.length;
  const leaderboardUnlocked = shouldShowLeaderboard(cohortSize);
  const myIndex = entries.findIndex((e) => e.uid === user?.uid);
  const myPercentile =
    myIndex >= 0 ? topPercent(entries[myIndex].rank, cohortSize) : null;
  // Neighbourhood: the 5 athletes above + you + 5 below. When you have no
  // ranked entry this week, fall back to the top 10 of the cohort.
  const visibleEntries = !leaderboardUnlocked
    ? []
    : myIndex >= 0
      ? entries.slice(Math.max(0, myIndex - 5), myIndex + 6)
      : entries.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="size-11 inline-flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
          aria-label="Back"
        >
          <ChevronLeft className="size-5" />
        </button>
        <h2 className="text-lg font-bold">Leaderboard</h2>
      </div>

      {/* Which board: one choice of three, as a radiogroup. */}
      <div data-no-page-swipe>
        <SegmentedControl
          ariaLabel="Board"
          value={activeTab}
          onChange={setActiveTab}
          options={TABS.map((t) => ({ value: t.key, label: t.label }))}
        />
      </div>

      {/* Entry list */}
      <div className="space-y-1.5">
        {loading && (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </>
        )}

        {/* Both empty states through the EmptyState primitive (visual audit
            W7 — these were the folder's only raw rgba(123,114,233,0.12)
            tiles, and its sibling card tinted the SAME tile a different
            purple). One primitive, one accent. */}
        {!loading && failed && (
          <div className="flex flex-wrap items-center justify-between gap-3 py-1">
            <p className="text-sm text-muted-foreground">
              Couldn&rsquo;t load the board.
            </p>
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          </div>
        )}

        {!loading && !failed && cohortSize === 0 && (
          <EmptyState
            icon={Zap}
            headline="No activity this week"
            sub="People you follow show here once they share their week."
            accent={THEME.brand}
          />
        )}

        {/* Sub-cohort gate: a ranked list among <20 athletes is meaningless
            and exposes individuals — show the unlock state instead. */}
        {!loading && cohortSize > 0 && !leaderboardUnlocked && (
          <EmptyState
            icon={Zap}
            headline={`Rankings unlock at ${SOCIAL_GATES.LEADERBOARD_MIN_COHORT} athletes`}
            sub={`${cohortSize} active this week — follow more athletes to fill the board.`}
            accent={THEME.brand}
          />
        )}

        {/* Percentile header — the always-on framing for an unlocked board. */}
        {!loading && leaderboardUnlocked && myPercentile !== null && (
          <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/15 px-3 py-2 mb-1.5">
            <span className="text-sm font-semibold text-foreground">
              You&apos;re in the top{" "}
              <span className="font-mono tabular-nums">{myPercentile}%</span>
            </span>
            <span className="text-xs text-muted-foreground font-mono tabular-nums">
              {cohortSize} athletes
            </span>
          </div>
        )}

        {!loading &&
          leaderboardUnlocked &&
          visibleEntries.map((entry) => (
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
                profile?.displayName?.charAt(0) || user?.displayName?.charAt(0)
              }
            />
          ))}

        {!loading && !failed && <ShowMyWeekRow onShared={reload} />}
      </div>
    </div>
  );
}
