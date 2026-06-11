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
import { RANK_COLORS } from "../../lib/theme";
import Avatar from "../Avatar";
import BlockAwareAvatar from "./BlockAwareAvatar";
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

        {!loading && cohortSize === 0 && (
          <div className="text-center py-10 space-y-2">
            <div
              className="size-12 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: "rgba(123,114,233,0.12)" }}
            >
              <Zap size={24} style={{ color: THEME.lifting }} />
            </div>
            <p className="text-sm font-medium text-foreground">
              No activity this week
            </p>
            <p className="text-xs text-muted-foreground">
              Follow athletes and start training to see rankings
            </p>
          </div>
        )}

        {/* Sub-cohort gate: a ranked list among <20 athletes is meaningless
            and exposes individuals — show the unlock state instead. */}
        {!loading && cohortSize > 0 && !leaderboardUnlocked && (
          <div className="text-center py-10 space-y-2">
            <div
              className="size-12 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: "rgba(123,114,233,0.12)" }}
            >
              <Zap size={24} style={{ color: THEME.lifting }} />
            </div>
            <p className="text-sm font-medium text-foreground">
              Rankings unlock at {SOCIAL_GATES.LEADERBOARD_MIN_COHORT} athletes
            </p>
            <p className="text-xs text-muted-foreground">
              {cohortSize} active this week — follow more athletes to fill the
              board
            </p>
          </div>
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
            <div
              key={entry.uid}
              className={`flex items-center gap-3 p-2.5 rounded-lg ${
                entry.uid === user?.uid
                  ? "bg-primary/5 border border-primary/15"
                  : ""
              }`}
            >
              <span
                className="w-6 text-sm font-bold text-center shrink-0"
                style={{
                  color:
                    entry.rank <= 3 ? RANK_COLORS[entry.rank - 1] : undefined,
                }}
              >
                {entry.rank}
              </span>
              {entry.uid === user?.uid ? (
                <Avatar
                  photoURL={entry.photoURL}
                  displayName="You"
                  fallbackInitial={
                    profile?.displayName?.charAt(0) ||
                    user?.displayName?.charAt(0)
                  }
                  size="sm"
                />
              ) : (
                <BlockAwareAvatar
                  uid={entry.uid}
                  photoURL={entry.photoURL}
                  displayName={entry.name}
                  size="sm"
                />
              )}
              <span className="text-sm font-medium flex-1 truncate">
                {entry.uid === user?.uid ? "You" : entry.name}
              </span>
              <span className="text-sm font-mono tabular-nums font-bold">
                {entry.value.toLocaleString()}{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  {currentUnit}
                </span>
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
