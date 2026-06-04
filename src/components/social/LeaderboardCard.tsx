import { Footprints, Dumbbell, Zap, ChevronRight } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../lib/auth";
import { getDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { THEME, RANK_COLORS } from "../../lib/theme";
import {
  buildLeaderboard,
  type LeaderboardEntry,
  type ChallengeType,
} from "../../lib/leaderboard";
import Avatar from "../Avatar";
import BlockAwareAvatar from "./BlockAwareAvatar";
import { Spinner } from "@/components/ui/Spinner";

interface EnrichedEntry extends LeaderboardEntry {
  photoURL?: string;
}

export default function LeaderboardCard({
  challenge = "weekly_hybrid",
  onViewFull,
}: {
  challenge?: ChallengeType;
  onViewFull?: () => void;
}) {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState<EnrichedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const challengeLabels: Record<
    ChallengeType,
    { title: string; unit: string; icon: string }
  > = {
    weekly_distance: {
      title: "Weekly Distance",
      unit: "km",
      icon: "footprints",
    },
    weekly_volume: { title: "Weekly Volume", unit: "kg", icon: "dumbbell" },
    weekly_hybrid: { title: "Hybrid Score", unit: "pts", icon: "zap" },
    weekly_workouts: { title: "Workouts", unit: "sessions", icon: "dumbbell" },
  };

  // Load leaderboard + enrich each UID with displayName + photoURL
  // from the PUBLIC profile projection. Pre-W1d this read
  // `users/{uid}` directly, which is owner-only — cross-user reads
  // silently failed and everyone rendered as "Athlete". Now sources
  // from `users/{uid}/public/profile` which IS cross-user readable.
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const raw = await buildLeaderboard(user.uid, challenge);
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
  }, [user, challenge]);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const { title, unit, icon } = challengeLabels[challenge];
  const top3 = entries.slice(0, 3);
  const selfEntry = entries.find((e) => e.uid === user?.uid);
  const selfInTop3 = top3.some((e) => e.uid === user?.uid);

  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        {icon === "footprints" ? (
          <Footprints className="size-5" style={{ color: THEME.running }} />
        ) : icon === "dumbbell" ? (
          <Dumbbell className="size-5" style={{ color: THEME.lifting }} />
        ) : (
          <Zap className="size-5" style={{ color: THEME.brand }} />
        )}
        <div className="flex-1">
          <h3 className="text-sm font-bold">{title}</h3>
        </div>
        <span className="text-xs text-muted-foreground">This Week</span>
      </div>

      <div className="space-y-1.5">
        {loading && (
          <div className="flex items-center justify-center py-3">
            <Spinner size="sm" variant="muted" label="Loading leaderboard" />
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="text-center py-6 space-y-2">
            <div
              className="size-10 rounded-xl flex items-center justify-center mx-auto"
              style={{ background: `${THEME.brand}15` }}
            >
              <Zap size={20} style={{ color: THEME.brand }} />
            </div>
            <p className="text-xs text-muted-foreground">
              Follow athletes to see the leaderboard
            </p>
          </div>
        )}

        {!loading && entries.length > 0 && entries.length < 3 && (
          <>
            {top3.map((entry) => (
              <div
                key={entry.uid}
                className={`flex items-center gap-2.5 p-2 rounded-lg ${
                  entry.uid === user?.uid
                    ? "bg-primary/5 border border-primary/15"
                    : ""
                }`}
              >
                <span
                  className="w-5 text-xs font-bold text-center shrink-0"
                  style={{ color: RANK_COLORS[entry.rank - 1] || undefined }}
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
                    {unit}
                  </span>
                </span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground text-center pt-2">
              Follow more athletes to grow the leaderboard
            </p>
          </>
        )}

        {!loading && entries.length >= 3 && (
          <>
            {top3.map((entry) => (
              <div
                key={entry.uid}
                className={`flex items-center gap-2.5 p-2 rounded-lg ${
                  entry.uid === user?.uid
                    ? "bg-primary/5 border border-primary/15"
                    : ""
                }`}
              >
                <span
                  className="w-5 text-xs font-bold text-center shrink-0"
                  style={{ color: RANK_COLORS[entry.rank - 1] }}
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
                    {unit}
                  </span>
                </span>
              </div>
            ))}

            {selfEntry && !selfInTop3 && (
              <>
                <div className="flex justify-center py-0.5">
                  <span className="text-xs text-muted-foreground">···</span>
                </div>
                <div className="flex items-center gap-2.5 p-2 rounded-lg bg-primary/5 border border-primary/15">
                  <span className="w-5 text-xs font-bold text-center shrink-0">
                    {selfEntry.rank}
                  </span>
                  <Avatar
                    photoURL={selfEntry.photoURL}
                    displayName="You"
                    fallbackInitial={
                      profile?.displayName?.charAt(0) ||
                      user?.displayName?.charAt(0)
                    }
                    size="sm"
                  />
                  <span className="text-sm font-medium flex-1 truncate">
                    You
                  </span>
                  <span className="text-sm font-mono tabular-nums font-bold">
                    {selfEntry.value.toLocaleString()}{" "}
                    <span className="text-xs text-muted-foreground font-normal">
                      {unit}
                    </span>
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {!loading && entries.length > 0 && onViewFull && (
        <button
          type="button"
          onClick={onViewFull}
          className="flex items-center justify-center gap-1 w-full mt-3 pt-3 border-t border-border/30 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          See Full Leaderboard
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}
