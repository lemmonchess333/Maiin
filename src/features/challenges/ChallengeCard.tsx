import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Clock, Trophy, ChevronDown, ChevronUp, LogOut } from "lucide-react";
import type { Challenge, ChallengeParticipant, ChallengeTier } from "./useChallenges";
import { TIER_COLORS, computeTier, getTimeRemaining } from "./useChallenges";
import { THEME } from "@/lib/theme";

interface ChallengeCardProps {
  challenge: Challenge;
  myProgress?: ChallengeParticipant;
  leaderboard?: ChallengeParticipant[];
  joined: boolean;
  onJoin: () => void;
  onLeave: () => void;
}

const TIER_LABELS: Record<ChallengeTier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };

function TierMarker({ tier, value, max, achieved }: { tier: ChallengeTier; value: number; max: number; achieved: boolean }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{ left: `${pct}%` }}>
      <div
        className="w-2.5 h-2.5 rounded-full border-2 border-background"
        style={{ backgroundColor: achieved ? TIER_COLORS[tier] : "rgba(255,255,255,0.2)" }}
      />
      <span className="text-xs mt-0.5 font-medium" style={{ color: achieved ? TIER_COLORS[tier] : "rgba(255,255,255,0.35)" }}>
        {value}
      </span>
    </div>
  );
}

export function ChallengeCard({ challenge, myProgress, leaderboard = [], joined, onJoin, onLeave }: ChallengeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const currentValue = myProgress?.currentValue || 0;
  const currentTier = myProgress?.tierAchieved;
  const maxTier = challenge.tiers.gold;
  const pct = Math.min((currentValue / maxTier) * 100, 100);
  const timeLeft = getTimeRemaining(challenge.endDate);

  const nextTier: ChallengeTier | null = !currentTier ? "bronze" : currentTier === "bronze" ? "silver" : currentTier === "silver" ? "gold" : null;
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
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
            style={{ backgroundColor: THEME.brand + "20" }}
          >
            {challenge.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{challenge.name}</p>
            <p className="text-xs text-muted-foreground">{challenge.description}</p>
          </div>
          {currentTier && (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: TIER_COLORS[currentTier] }}
            >
              <Trophy className="w-3.5 h-3.5 text-white" />
            </div>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {timeLeft}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {challenge.participantCount} joined
          </span>
          {challenge.season && (
            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">
              {challenge.season}
            </span>
          )}
        </div>

        {/* Top 3 leaderboard preview */}
        {leaderboard.length > 0 && (
          <div className="space-y-1">
            {leaderboard.slice(0, 3).map((p, i) => {
              const tier = computeTier(p.currentValue, challenge.tiers);
              return (
                <div key={p.uid || i} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-right font-medium text-muted-foreground">{i + 1}</span>
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                    {(p.displayName || "?").charAt(0)}
                  </div>
                  <span className="flex-1 truncate text-foreground">{p.displayName || "Athlete"}</span>
                  <span className="font-medium tabular-nums">{p.currentValue}</span>
                  {tier && (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TIER_COLORS[tier] }} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Join button or progress */}
        {!joined ? (
          <button
            onClick={onJoin}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: THEME.brand }}
          >
            Join Challenge
          </button>
        ) : (
          <div className="space-y-2">
            {/* Tiered progress bar */}
            <div className="relative pt-1 pb-5">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6 }}
                  className="h-full rounded-full"
                  style={{
                    backgroundColor: currentTier ? TIER_COLORS[currentTier] : THEME.brand,
                  }}
                />
              </div>
              {/* Tier markers */}
              <div className="relative mt-1">
                <TierMarker tier="bronze" value={challenge.tiers.bronze} max={maxTier} achieved={currentValue >= challenge.tiers.bronze} />
                <TierMarker tier="silver" value={challenge.tiers.silver} max={maxTier} achieved={currentValue >= challenge.tiers.silver} />
                <TierMarker tier="gold" value={challenge.tiers.gold} max={maxTier} achieved={currentValue >= challenge.tiers.gold} />
              </div>
            </div>

            {/* Personal stat */}
            <p className="text-xs text-muted-foreground text-center">
              {currentTier === "gold" ? (
                <span>
                  <Trophy size={14} className="inline text-yellow-500" /> <span className="font-semibold" style={{ color: TIER_COLORS.gold }}>Gold achieved!</span> — {currentValue} {challenge.metric.replace("_", " ")}
                </span>
              ) : nextTier && nextValue ? (
                <span>
                  You're at <span className="font-semibold text-foreground">{currentValue}</span> — {TIER_LABELS[nextTier]} at {nextValue}
                </span>
              ) : (
                <span>Progress: {currentValue}</span>
              )}
            </p>
          </div>
        )}

        {/* Expand toggle */}
        {joined && leaderboard.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground mx-auto hover:text-foreground transition-colors"
          >
            {expanded ? "Hide" : "Full"} leaderboard
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
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
                const tier = computeTier(p.currentValue, challenge.tiers);
                return (
                  <div key={p.uid || i} className="flex items-center gap-2 text-xs">
                    <span className="w-5 text-right font-medium text-muted-foreground">{i + 1}</span>
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {(p.displayName || "?").charAt(0)}
                    </div>
                    <span className="flex-1 truncate text-foreground">{p.displayName || "Athlete"}</span>
                    <span className="font-medium tabular-nums">{p.currentValue}</span>
                    {tier && (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: TIER_COLORS[tier] + "20", color: TIER_COLORS[tier] }}>
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
            onClick={onLeave}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors mx-auto"
          >
            <LogOut className="w-3 h-3" />
            Leave Challenge
          </button>
        </div>
      )}
    </motion.div>
  );
}
