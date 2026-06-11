import { useState, type ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Clock,
  Trophy,
  ChevronDown,
  ChevronUp,
  LogOut,
  Footprints,
  Sprout,
  Sun,
  Leaf,
  Snowflake,
} from "lucide-react";
import type {
  Challenge,
  ChallengeParticipant,
  ChallengeTier,
} from "./useChallenges";
import {
  TIER_COLORS,
  resolveTier,
  getTimeRemaining,
  isTierAchieved,
} from "./useChallenges";
import { THEME } from "@/lib/theme";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";
import { useChallengePercentile } from "./useChallengePercentile";

interface ChallengeCardProps {
  challenge: Challenge;
  myProgress?: ChallengeParticipant;
  leaderboard?: ChallengeParticipant[];
  joined: boolean;
  /* Both action callbacks may return a promise. The card awaits it
     to flip the local busy flag, so the button label becomes
     "Joining…" / "Leaving…" and double-tap is suppressed. */
  onJoin: () => void | Promise<void>;
  onLeave: () => void | Promise<void>;
}

const TIER_LABELS: Record<ChallengeTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

/* Icon map for challenge cards. The seed definitions in
   useChallenges.ts store lucide icon names as strings ("footprints",
   "trophy", etc.) — the previous render just printed those strings
   as text inside the icon container, producing visible "ootprints"
   leakage on the Crews tab once challenges actually started seeding. */
const CHALLENGE_ICON_MAP: Record<
  string,
  ComponentType<{ size?: number; className?: string }>
> = {
  trophy: Trophy,
  footprints: Footprints,
  sprout: Sprout,
  sun: Sun,
  leaf: Leaf,
  snowflake: Snowflake,
};

/** Format a challenge progress value with units appropriate to the
 *  metric. PR 5 introduces fastest_effort (seconds → mm:ss) and
 *  group_goal (still numeric km, just summed collectively). */
function formatChallengeValue(metric: string, value: number): string {
  if (metric === "fastest_effort") {
    if (value <= 0) return "—";
    const m = Math.floor(value / 60);
    const s = Math.round(value % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  if (metric === "total_km") return `${value.toFixed(1)}km`;
  if (metric === "total_volume")
    return `${Math.round(value).toLocaleString()}kg`;
  return Math.round(value).toLocaleString();
}

function TierMarker({
  tier,
  value,
  max,
  achieved,
}: {
  tier: ChallengeTier;
  value: number;
  max: number;
  achieved: boolean;
}) {
  const pct = Math.min((value / max) * 100, 100);
  /* The unachieved fallback used to be a hardcoded
     `rgba(255,255,255,0.2)` which rendered invisibly on the white
     light-mode card surface (white on white). Switching the
     unachieved state to a theme-aware muted pair fixes the bug where
     the bronze/silver/gold tick marks effectively disappeared on
     light mode — the markers should always be visible, just dim
     until they're achieved. */
  return (
    <div
      className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
      style={{ left: `${pct}%` }}
    >
      <div
        className={`size-2.5 rounded-full border-2 border-background ${achieved ? "" : "bg-muted-foreground/30"}`}
        style={achieved ? { backgroundColor: TIER_COLORS[tier] } : undefined}
      />
      <span
        className={`text-xs mt-0.5 font-medium ${achieved ? "" : "text-muted-foreground/60"}`}
        style={achieved ? { color: TIER_COLORS[tier] } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export function ChallengeCard({
  challenge,
  myProgress,
  leaderboard = [],
  joined,
  onJoin,
  onLeave,
}: ChallengeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<"joining" | "leaving" | null>(null);
  const handleJoin = async () => {
    if (busy) return;
    setBusy("joining");
    try {
      await onJoin();
    } finally {
      setBusy(null);
    }
  };
  const handleLeave = async () => {
    if (busy) return;
    setBusy("leaving");
    try {
      await onLeave();
    } finally {
      setBusy(null);
    }
  };
  const currentValue = myProgress?.currentValue || 0;
  const currentTier = myProgress?.tierAchieved;
  // SOCIAL S4 — percentile line, gated to ≥50 participants (else null).
  const percentile = useChallengePercentile({
    challengeId: challenge.id,
    participantCount: challenge.participantCount,
    metric: challenge.metric,
    myValue: currentValue,
    joined,
  });
  const maxTier = challenge.tiers.gold;
  const pct = Math.min((currentValue / maxTier) * 100, 100);
  const timeLeft = getTimeRemaining(challenge.endDate);

  const nextTier: ChallengeTier | null = !currentTier
    ? "bronze"
    : currentTier === "bronze"
      ? "silver"
      : currentTier === "silver"
        ? "gold"
        : null;
  const nextValue = nextTier ? challenge.tiers[nextTier] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-card border border-border/50 overflow-hidden"
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className="size-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: THEME.brand + "20" }}
          >
            {(() => {
              const IconComp = CHALLENGE_ICON_MAP[challenge.icon];
              return IconComp ? (
                <IconComp size={18} className="text-primary" />
              ) : (
                /* Unknown icon name → fall back to a Trophy so the card
                   doesn't render bare text in the slot. Adding a new
                   challenge with an unmapped icon name now degrades
                   gracefully instead of leaking the string. */
                <Trophy size={18} className="text-primary" />
              );
            })()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {challenge.name}
            </p>
            <p className="text-small text-muted-foreground">
              {challenge.description}
            </p>
          </div>
          {currentTier && (
            <div
              className="size-6 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: TIER_COLORS[currentTier] }}
            >
              <Trophy className="size-3.5 text-white" />
            </div>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-small text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {timeLeft}
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3.5" />
            {challenge.participantCount} joined
          </span>
          {percentile !== null && (
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono tabular-nums font-medium">
              Top {percentile}%
            </span>
          )}
          {challenge.season && (
            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">
              {challenge.season}
            </span>
          )}
        </div>

        {/* Top 3 leaderboard preview.
            Only rendered for *joined and progressing* participants.
            Available (not-joined) cards drop it to stay compact —
            the leaderboard is a goal-state preview, not a sales tool
            for joining; without context for the numbers it just adds
            visual weight. Joined-but-zero also drops it (the
            half-empty board competes with the single "next tier" hint). */}
        {leaderboard.length > 0 && joined && currentValue > 0 && (
          <div className="space-y-1">
            {leaderboard.slice(0, 3).map((p, i) => {
              const tier = resolveTier(
                p.currentValue,
                challenge.tiers,
                challenge.metric
              );
              return (
                <div
                  key={p.uid || i}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="w-4 text-right font-medium text-muted-foreground">
                    {i + 1}
                  </span>
                  <BlockAwareAvatar
                    uid={p.uid}
                    photoURL={p.photoURL}
                    displayName={p.displayName || "Athlete"}
                    size="xs"
                  />
                  <span className="flex-1 truncate text-foreground">
                    {p.displayName || "Athlete"}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatChallengeValue(challenge.metric, p.currentValue)}
                  </span>
                  {tier && (
                    <div
                      className="size-2 rounded-full"
                      style={{ backgroundColor: TIER_COLORS[tier] }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Join button or progress */}
        {!joined ? (
          <button
            type="button"
            onClick={handleJoin}
            disabled={busy === "joining"}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: THEME.brandStrong }}
          >
            {busy === "joining" ? "Joining…" : "Join Challenge"}
          </button>
        ) : challenge.collectiveTarget && challenge.collectiveTarget > 0 ? (
          /* PR 5: group_goal challenge.
             Renders a single collective progress bar instead of the
             per-user tier ladder. Total = sum of every participant's
             currentValue (we have it in `leaderboard`); target lives
             on `challenge.collectiveTarget`. The user's individual
             contribution is surfaced underneath as a "you contributed"
             line so the personal stake is still legible. */
          (() => {
            const collectiveTotal = leaderboard.reduce(
              (s, p) => s + (p.currentValue || 0),
              0
            );
            const target = challenge.collectiveTarget!;
            const collPct = Math.min((collectiveTotal / target) * 100, 100);
            const reached = collectiveTotal >= target;
            return (
              <div className="space-y-2">
                <div className="relative pt-1 pb-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${collPct}%` }}
                      transition={{ duration: 0.6 }}
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: reached
                          ? TIER_COLORS.gold
                          : THEME.brand,
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-center font-mono tabular-nums text-muted-foreground">
                  <span className="text-foreground font-semibold">
                    {formatChallengeValue(challenge.metric, collectiveTotal)}
                  </span>{" "}
                  / {formatChallengeValue(challenge.metric, target)} together
                </p>
                <p className="text-caption text-center text-muted-foreground/70">
                  You contributed{" "}
                  {formatChallengeValue(challenge.metric, currentValue)}
                </p>
              </div>
            );
          })()
        ) : currentValue === 0 ? (
          /* Compact zero-progress state.
             When the user has joined but logged nothing toward the
             challenge yet, the full tiered progress bar + leaderboard
             slot reads as broken (an empty bar, "You're at 0",
             markers with no fill). Especially loud on fastest_effort
             where a 0 currentValue means "no qualifying run yet" —
             the rest of the chrome is irrelevant until they log one.
             Compact variant: just the next-tier hint + leave action,
             so the card stays informative without occupying half a
             screen. The full progress bar reappears the moment the
             user has any progress to show. */
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">
              {nextTier && nextValue
                ? `${TIER_LABELS[nextTier]} at ${formatChallengeValue(challenge.metric, nextValue)}`
                : "Log your first qualifying activity to start the board"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Tiered progress bar.
                For fastest_effort the metric is "lower is better" —
                tier "achievement" is currentValue <= tier threshold,
                NOT >=. Sync logic in the Cloud Function already
                computes tierAchieved correctly; we just stop the
                progress bar from rendering nonsense width when
                currentValue is 0 (no qualifying run yet). */}
            <div className="relative pt-1 pb-5">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width:
                      challenge.metric === "fastest_effort"
                        ? `${currentValue > 0 ? Math.min((maxTier / Math.max(currentValue, 1)) * 100, 100) : 0}%`
                        : `${pct}%`,
                  }}
                  transition={{ duration: 0.6 }}
                  className="h-full rounded-full"
                  style={{
                    backgroundColor: currentTier
                      ? TIER_COLORS[currentTier]
                      : THEME.brand,
                  }}
                />
              </div>
              {/* Tier markers — `isTierAchieved` encapsulates the
                  lower-is-better semantic for fastest_effort so each
                  marker is just a comparison instead of repeating the
                  metric branch three times. */}
              <div className="relative mt-1">
                <TierMarker
                  tier="bronze"
                  value={challenge.tiers.bronze}
                  max={maxTier}
                  achieved={isTierAchieved(
                    currentValue,
                    challenge.tiers.bronze,
                    challenge.metric
                  )}
                />
                <TierMarker
                  tier="silver"
                  value={challenge.tiers.silver}
                  max={maxTier}
                  achieved={isTierAchieved(
                    currentValue,
                    challenge.tiers.silver,
                    challenge.metric
                  )}
                />
                <TierMarker
                  tier="gold"
                  value={challenge.tiers.gold}
                  max={maxTier}
                  achieved={isTierAchieved(
                    currentValue,
                    challenge.tiers.gold,
                    challenge.metric
                  )}
                />
              </div>
            </div>

            {/* Personal stat. Uses formatChallengeValue so each metric
                renders with its native units (kg / km / sessions / mm:ss). */}
            <p className="text-xs text-muted-foreground text-center">
              {currentTier === "gold" ? (
                <span>
                  <Trophy size={14} className="inline text-yellow-500" />{" "}
                  <span
                    className="font-semibold"
                    style={{ color: TIER_COLORS.gold }}
                  >
                    Gold achieved!
                  </span>
                  {" — "}
                  {formatChallengeValue(challenge.metric, currentValue)}
                </span>
              ) : nextTier && nextValue ? (
                <span>
                  You&apos;re at{" "}
                  <span className="font-semibold text-foreground">
                    {formatChallengeValue(challenge.metric, currentValue)}
                  </span>
                  {" — "}
                  {TIER_LABELS[nextTier]} at{" "}
                  {formatChallengeValue(challenge.metric, nextValue)}
                </span>
              ) : (
                <span>
                  Progress:{" "}
                  {formatChallengeValue(challenge.metric, currentValue)}
                </span>
              )}
            </p>
          </div>
        )}

        {/* Expand toggle */}
        {joined && leaderboard.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground mx-auto hover:text-foreground transition-colors"
          >
            {expanded ? "Hide" : "Full"} leaderboard
            {expanded ? (
              <ChevronUp className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </button>
        )}
      </div>

      {/* Expanded leaderboard */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/50"
          >
            <div className="p-4 space-y-1.5 max-h-60 overflow-y-auto">
              {leaderboard.map((p, i) => {
                const tier = resolveTier(
                  p.currentValue,
                  challenge.tiers,
                  challenge.metric
                );
                return (
                  <div
                    key={p.uid || i}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="w-5 text-right font-medium text-muted-foreground">
                      {i + 1}
                    </span>
                    <BlockAwareAvatar
                      uid={p.uid}
                      photoURL={p.photoURL}
                      displayName={p.displayName || "Athlete"}
                      size="xs"
                    />
                    <span className="flex-1 truncate text-foreground">
                      {p.displayName || "Athlete"}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatChallengeValue(challenge.metric, p.currentValue)}
                    </span>
                    {tier && (
                      <span
                        className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: TIER_COLORS[tier] + "20",
                          color: TIER_COLORS[tier],
                        }}
                      >
                        {TIER_LABELS[tier]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leave button */}
      {joined && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={handleLeave}
            disabled={busy === "leaving"}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors mx-auto disabled:opacity-60"
          >
            <LogOut className="size-3" />
            {busy === "leaving" ? "Leaving…" : "Leave Challenge"}
          </button>
        </div>
      )}
    </motion.div>
  );
}
