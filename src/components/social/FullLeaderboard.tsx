import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, Zap } from "lucide-react";
import { THEME } from "@/lib/theme";
import { useAuth } from "../../lib/auth";
import { getDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import {
  buildLeaderboard,
  type LeaderboardEntry,
  type ChallengeType,
} from "../../lib/leaderboard";
import { Skeleton } from "../LoadingSkeleton";
import LeaderboardRow from "./LeaderboardRow";
import EmptyState from "@/components/ui/EmptyState";
import { SOCIAL_GATES, shouldShowLeaderboard } from "@/lib/socialGates";
import { topPercent } from "@/features/challenges/useChallengePercentile";

interface EnrichedEntry extends LeaderboardEntry {
  photoURL?: string;
}

const TABS: { key: ChallengeType; label: string; unit: string }[] = [
  { key: "weekly_hybrid", label: "Hybrid Score", unit: "pts" },
  { key: "weekly_volume", label: "Lifting Volume", unit: "kg" },
  { key: "weekly_distance", label: "Running Distance", unit: "km" },
  { key: "weekly_workouts", label: "Workouts", unit: "sessions" },
];

export default function FullLeaderboard({ onBack }: { onBack: () => void }) {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<ChallengeType>("weekly_hybrid");
  const [entries, setEntries] = useState<EnrichedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Source from `users/{uid}/public/profile` (cross-user readable) —
  // pre-W1d this read `users/{uid}` (owner-only), which silently
  // failed for everyone except the current user and left them all
  // rendered as "Athlete".
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const raw = await buildLeaderboard(user.uid, activeTab);
      const enriched = await Promise.all(
        raw.map(async (e) => {
          try {
            const snap = await getDoc(
              doc(db, "users", e.uid, "public", "profile")
            );
            const data = snap.data() as
              | { displayName?: string; photoURL?: string }
              | undefined;
            return {
              ...e,
              name:
                data?.displayName || (e.uid === user.uid ? "You" : "Athlete"),
              photoURL: data?.photoURL,
            } as EnrichedEntry;
          } catch {
            return {
              ...e,
              name: e.uid === user.uid ? "You" : "Athlete",
            } as EnrichedEntry;
          }
        })
      );
      setEntries(enriched.filter((e) => e.value > 0));
    } finally {
      setLoading(false);
    }
  }, [user, activeTab]);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const currentUnit = TABS.find((t) => t.key === activeTab)?.unit || "pts";

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
        <h2 className="text-lg font-extrabold">Leaderboard</h2>
      </div>

      {/* Tab row */}
      <div
        data-no-page-swipe
        className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1"
      >
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeTab === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
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
        {!loading && cohortSize === 0 && (
          <EmptyState
            icon={Zap}
            headline="No activity this week"
            sub="Follow athletes and start training to see rankings."
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
              value={entry.value}
              unit={currentUnit}
              isSelf={entry.uid === user?.uid}
              selfInitial={
                profile?.displayName?.charAt(0) || user?.displayName?.charAt(0)
              }
            />
          ))}
      </div>
    </div>
  );
}
