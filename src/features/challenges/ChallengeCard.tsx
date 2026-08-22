import { useState, type ComponentType, type CSSProperties } from "react";
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
import { Button } from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import { challengeEditorialImage } from "@/lib/editorialImages";
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

/* SOC-P1a — founding state. Below this many participants the meta row
   withholds the number and reads as a founding invitation instead:
   "0 joined" (the loudest locked-lobby signal on the Social tab, and
   the most-seen state for every cold-start user) never renders. Counts
   are real or withheld — never inflated. */
const FOUNDING_COUNT_MIN = 3;

/* Sport-coding by metric (visual polish, 2026-07). Every challenge card
   used to wear brand purple regardless of discipline — a km challenge and
   a volume challenge looked identical, ignoring the app's strongest visual
   language (coral = running, purple = lifting, brand = hybrid/other).
   The accent drives the icon tile, the progress fill pre-tier, and the
   Join CTA variant. */
const METRIC_ACCENT: Record<string, string> = {
  total_km: THEME.running,
  fastest_effort: THEME.running,
  total_volume: THEME.lifting,
  workout_count: THEME.lifting,
  hybrid_score: THEME.brand,
};

/* Icon map for challenge cards. The seed definitions in
   useChallenges.ts store lucide icon names as strings ("footprints",
   "trophy", etc.) — the previous render just printed those strings
   as text inside the icon container, producing visible "ootprints"
   leakage on the Together tab once challenges actually started seeding. */
const CHALLENGE_ICON_MAP: Record<
  string,
  ComponentType<{
    size?: number;
    className?: string;
    style?: CSSProperties;
    "aria-hidden"?: boolean;
  }>
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
  metric,
  achieved,
}: {
  tier: ChallengeTier;
  value: number;
  max: number;
  metric: string;
  achieved: boolean;
}) {
  /* fastest_effort is lower-is-better: gold is the SMALLEST threshold and
     `max` (= tiers.gold) is below every other tier, so the higher-is-better
     `value / max` put bronze at 140% and silver at 120% — clamped, all
     three markers and labels overprinted at left:100% (probe-measured on
     the production Fastest 5K tiers, 2026-08-08). The bar FILL got its
     lower-is-better branch (`maxTier / currentValue`) in an earlier pass;
     the markers were the oversight. `max / value` is the same scale as
     that fill, so the fill edge crosses each marker exactly at its
     threshold: bronze 71.4%, silver 83.3%, gold 100%. */
  const pct =
    metric === "fastest_effort"
      ? Math.min((max / Math.max(value, 1)) * 100, 100)
      : Math.min((value / max) * 100, 100);
  /* The unachieved fallback used to be a hardcoded
     `rgba(255,255,255,0.2)` which rendered invisibly on the white
     light-mode card surface (white on white). Switching the
     unachieved state to a theme-aware muted pair fixes the bug where
     the bronze/silver/gold tick marks effectively disappeared on
     light mode — the markers should always be visible, just dim
     until they're achieved. */
  /* The label is centred on its threshold, so a marker at either extreme
     hangs half its text past the bar. Gold sits at exactly 100% by
     construction (it IS `max`), so "15,000" was clipped at the screen edge
     on every tiered challenge — the August Hybrid Hero card renders
     "15,00" and then the viewport.
     Only the LABEL moves: the dot has to stay centred on its threshold,
     because its whole job is marking where the fill edge crosses. */
  const EDGE = 6; // % within which a label would overhang the bar
  /* The wrapper is centred on the threshold, so the label already sits half
     its own width either side of it. At the right edge it must move LEFT by
     that half (ending ON the tick); at the left edge, right by the same. */
  const labelShift =
    pct >= 100 - EDGE
      ? "-translate-x-1/2"
      : pct <= EDGE
        ? "translate-x-1/2"
        : "";
  return (
    <div
      className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
      style={{ left: `${pct}%` }}
    >
      <div
        className={`size-2.5 rounded-full border-2 border-card ${achieved ? "" : "bg-muted-foreground/30"}`}
        style={achieved ? { backgroundColor: TIER_COLORS[tier] } : undefined}
      />
      <span
        className={`text-xs mt-0.5 font-medium font-mono tabular-nums whitespace-nowrap ${labelShift} ${achieved ? "" : "text-muted-foreground/60"}`}
        style={achieved ? { color: TIER_COLORS[tier] } : undefined}
      >
        {formatChallengeValue(metric, value)}
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
  const accent = METRIC_ACCENT[challenge.metric] ?? THEME.brand;

  const nextTier: ChallengeTier | null = !currentTier
    ? "bronze"
    : currentTier === "bronze"
      ? "silver"
      : currentTier === "silver"
        ? "gold"
        : null;
  const nextValue = nextTier ? challenge.tiers[nextTier] : null;

  /* Unknown icon name → fall back to a Trophy so the card doesn't
     render bare text in the slot. Adding a new challenge with an
     unmapped icon name degrades gracefully instead of leaking the
     string. */
  const HeroIcon = CHALLENGE_ICON_MAP[challenge.icon] ?? Trophy;
  const heroPhoto = challengeEditorialImage(challenge.metric);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-card border border-border/50 overflow-hidden"
    >
      {/* Hero band (Social uplift v2/v3) — same visual grammar as the
          ActivityCard hero panels; static everything (WKWebView rule);
          accent is the sport-coded metric colour so a km challenge
          reads coral and a volume challenge purple at a glance.
          v3: when a licensed editorial photo exists for the metric
          (src/assets/editorial — Runna/Strava-style photography on
          editorial surfaces), it becomes the band: photo + sport tint
          wash + bottom scrim + white text. Without assets the v2
          ghosted-icon band renders — the designed fallback, not a
          degraded state. */}
      <div
        className={`relative overflow-hidden border-b border-border/50 ${heroPhoto ? "h-28" : "h-24"}`}
        style={
          heroPhoto
            ? undefined
            : {
                background: `linear-gradient(150deg, ${accent}24 0%, ${accent}0A 55%, ${accent}12 100%)`,
              }
        }
      >
        {heroPhoto ? (
          <>
            <img
              src={heroPhoto}
              alt=""
              aria-hidden
              className="absolute inset-0 size-full object-cover"
            />
            {/* Sport duotone wash — ties mismatched stock into the
                closed palette so the photo reads owned, not pasted. */}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(150deg, ${accent}59 0%, ${accent}1F 60%, transparent 100%)`,
              }}
            />
            {/* Text scrim — theme-independent (the photo is the
                surface, so overlay text is white in both themes). */}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to top, ${THEME.scrim} 0%, ${THEME.scrimSoft} 45%, transparent 70%)`,
              }}
            />
          </>
        ) : (
          <HeroIcon
            size={104}
            className="absolute -right-2 -bottom-5"
            style={{
              color: accent,
              opacity: 0.16,
              transform: "rotate(-10deg)",
            }}
            aria-hidden
          />
        )}
        <div className="absolute bottom-3 left-4 right-20 min-w-0">
          <SectionLabel
            className={`flex items-center gap-1 ${heroPhoto ? "text-white/85" : ""}`}
          >
            <Clock className="size-3" aria-hidden />
            {timeLeft}
          </SectionLabel>
          <p
            className={`text-lg font-bold leading-tight truncate mt-0.5 ${heroPhoto ? "text-white" : "text-foreground"}`}
          >
            {challenge.name}
          </p>
        </div>
        {currentTier && (
          <div
            className="absolute top-3 right-3 size-6 rounded-full flex items-center justify-center"
            style={{ backgroundColor: TIER_COLORS[currentTier] }}
            aria-label={`${TIER_LABELS[currentTier]} achieved`}
            role="img"
          >
            <Trophy className="size-3.5 text-white" />
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        <p className="text-small text-muted-foreground">
          {challenge.description}
        </p>

        {/* Meta row — timeLeft lives on the hero band now */}
        <div className="flex items-center gap-3 text-small text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="size-3.5" />
            {challenge.participantCount >= FOUNDING_COUNT_MIN
              ? `${challenge.participantCount} joined`
              : joined
                ? "You're in — founding member"
                : "Just launched · founding spots open"}
          </span>
          {percentile !== null && (
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono tabular-nums font-medium">
              Top {percentile}%
            </span>
          )}
          {challenge.season && (
            <span
              className="px-1.5 py-0.5 rounded font-medium"
              style={{ background: `${THEME.brand}14`, color: THEME.brand }}
            >
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
                  <span className="font-medium font-mono tabular-nums">
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
          /* Canonical CTA mapping: running challenges take the sport
             (coral) variant, everything else the primary. The primitive
             also supplies the 44px floor the old py-2.5 button missed. */
          <Button
            variant={accent === THEME.running ? "sport" : "primary"}
            fullWidth
            onClick={handleJoin}
            loading={busy === "joining"}
          >
            {busy === "joining" ? "Joining…" : "Join Challenge"}
          </Button>
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
                        backgroundColor: reached ? TIER_COLORS.gold : accent,
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
            {/* pb-7, not pb-5: the labels hang below the marker layer and
                were overrunning the container by roughly a line's descent,
                which is why "20.0km / 40.0km / 75.0km" sat jammed against
                the "You're at …" line beneath while a gap opened above the
                bar. */}
            <div className="relative pt-1 pb-7">
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
                      : accent,
                  }}
                />
              </div>
              {/* Tier markers — `isTierAchieved` encapsulates the
                  lower-is-better semantic for fastest_effort so each
                  marker is just a comparison instead of repeating the
                  metric branch three times. */}
              {/* The dot is centred ON the bar, not floating beneath it.
                  `mt-1` put the marker layer 4px BELOW the bar's bottom
                  edge, so the dots read as a second empty track and the
                  `border-card` ring — whose whole job is punching the dot
                  out of the fill — had nothing to separate it from. The
                  offset lands the 10px dot's centre on the 8px bar's
                  centreline: bar top 4px (pt-1) + 4px = 8px, dot top
                  8 - 5 = 3px, i.e. 9px above the bar's bottom edge. */}
              <div className="relative -mt-[9px]">
                <TierMarker
                  tier="bronze"
                  value={challenge.tiers.bronze}
                  max={maxTier}
                  metric={challenge.metric}
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
                  metric={challenge.metric}
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
                  metric={challenge.metric}
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
                  <Trophy
                    size={14}
                    className="inline"
                    style={{ color: TIER_COLORS.gold }}
                  />{" "}
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
            className="flex items-center gap-1 min-h-[44px] text-xs text-muted-foreground mx-auto hover:text-foreground transition-colors"
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
                    <span className="font-medium font-mono tabular-nums">
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
            className="flex items-center gap-1 min-h-[44px] text-xs text-muted-foreground hover:text-destructive-strong transition-colors mx-auto disabled:opacity-60"
          >
            <LogOut className="size-3" />
            {busy === "leaving" ? "Leaving…" : "Leave Challenge"}
          </button>
        </div>
      )}
    </motion.div>
  );
}
