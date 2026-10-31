import { useState, type ComponentType, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMotionSafe } from "@/hooks/useMotionSafe";
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
  Dumbbell,
  CalendarDays,
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
import { challengeGoal, formatChallengeValue } from "./challengeFormat";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { Button } from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { challengeEditorialImage } from "@/lib/editorialImages";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";
import { useChallengePercentile } from "./useChallengePercentile";
import { challengeSport, SPORT_ACCENT, SPORT_BAR_FILL } from "./challengeSport";

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
  /** Off when another card already says how long this one has left:
   *  the monthly challenges all end on the same day. */
  showTimeLeft?: boolean;
}

const TIER_LABELS: Record<ChallengeTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

/* Below this many participants the meta row says nothing about who has
   joined: "0 joined" is the loudest empty-lobby signal on the Social tab
   and the most-seen state for every cold-start user. Counts are real or
   withheld, never inflated, and nothing stands in for one. */
const FOUNDING_COUNT_MIN = 3;

/** A tier's metal as a ring around something drawn in the text colour,
 *  the leaderboard's rank treatment: as a fill or as text, silver and gold
 *  all but vanish on a light card. */
const metalRing = (tier: ChallengeTier) => ({
  boxShadow: `inset 0 0 0 2px ${TIER_COLORS[tier]}`,
});

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
  dumbbell: Dumbbell,
  "calendar-days": CalendarDays,
  clock: Clock,
};

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
  const liftUnit = useLiftUnit();
  const distanceUnit = useDistanceUnit();
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
      {/* Achieved reads as FOREGROUND ink (vs muted for unachieved) — the
          tier metal stays on the marker dot above. As 12px text the raw
          metals fail light AA (bronze 3.14:1, silver 1.82, gold 1.40 —
          2026-08-22 frame sweep). */}
      <span
        className={`text-xs mt-0.5 font-medium font-mono tabular-nums whitespace-nowrap ${labelShift} ${achieved ? "text-foreground" : "text-muted-foreground"}`}
      >
        {formatChallengeValue(metric, value, liftUnit, distanceUnit)}
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
  showTimeLeft = true,
}: ChallengeCardProps) {
  const liftUnit = useLiftUnit();
  const distanceUnit = useDistanceUnit();
  const [expanded, setExpanded] = useState(false);
  const motionSafe = useMotionSafe();
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
  const timeLeft = showTimeLeft ? getTimeRemaining(challenge.endDate) : "";
  const goal = challengeGoal(challenge, liftUnit, distanceUnit);
  const joinedCount =
    challenge.participantCount >= FOUNDING_COUNT_MIN
      ? challenge.participantCount
      : null;
  /* The card wears its sport (`challengeSport`): the hero band, the icon,
     Join and the bar's fill. The tier metal never fills the bar. */
  const sport = challengeSport(challenge.metric);
  const accent = SPORT_ACCENT[sport];
  const barFill = SPORT_BAR_FILL[sport];

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
  const heroPhoto = challengeEditorialImage(challenge);

  return (
    <motion.div
      initial={motionSafe({ opacity: 0, y: 8 })}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-card border border-border/50 overflow-hidden"
    >
      {/* Hero band (Social uplift v2/v3) — same visual grammar as the
          ActivityCard hero panels; static everything (WKWebView rule);
          accent is the sport-coded metric colour so a km challenge
          reads coral and a volume challenge purple at a glance.
          v3: when an editorial photo exists for the metric
          (src/assets/editorial — Runna/Strava-style photography on
          editorial surfaces), it becomes the band: photo + sport tint
          wash + bottom scrim + white text. Without assets the v2
          ghosted-icon band renders — the designed fallback, not a
          degraded state. */}
      <div
        className={`relative overflow-hidden border-b border-border/50 ${heroPhoto ? "h-40" : "h-24"}`}
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
              style={
                challenge.type === "seasonal" ||
                challenge.id.startsWith("strength-monthly-")
                  ? { objectPosition: "center 20%" }
                  : undefined
              }
              loading="lazy"
              decoding="async"
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
        {/* Insets in px: in rem the reserve for the ghosted icon grew with
            the text and left "Distance" 64px at 320 px and 2× text. A
            photo band draws no icon, so it keeps no reserve. */}
        <div
          className={`absolute bottom-3 left-[16px] min-w-0 ${heroPhoto ? "right-[16px]" : "right-[80px]"}`}
        >
          {timeLeft && (
            <SectionLabel
              className={`flex items-center gap-1 ${heroPhoto ? "text-white/85" : ""}`}
            >
              <Clock className="size-3" aria-hidden />
              {timeLeft}
            </SectionLabel>
          )}
          {/* Two lines before it gives way: at 320 px and 135% text one
              line cut "July Distance Club" to "July Distan…". */}
          <p
            className={`text-lg font-bold leading-tight line-clamp-2 break-words mt-0.5 ${heroPhoto ? "text-white" : "text-foreground"}`}
          >
            {challenge.name}
          </p>
        </div>
        {/* The tier badge: the trophy in the text colour on the card,
            ringed in the tier's metal. White on gold was 1.4:1. */}
        {currentTier && (
          <div
            className="absolute top-3 right-3 size-6 rounded-full flex items-center justify-center bg-card text-foreground"
            style={metalRing(currentTier)}
            aria-label={`${TIER_LABELS[currentTier]} achieved`}
            role="img"
          >
            <Trophy className="size-3.5" />
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        {/* The goal, from the challenge's own target in the reader's
            units; the stored description only for a metric it cannot
            phrase. */}
        <p className="text-small text-muted-foreground">
          {goal ? (
            <InlineNumerals>{goal}</InlineNumerals>
          ) : (
            challenge.description
          )}
        </p>

        {/* Meta row: the facts (a real joined count, the season) on one
            line, and the person's STANDING as a status pill in the shared
            chip form. Drawn only when it has one of them. */}
        {(joinedCount !== null || challenge.season || percentile !== null) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted-foreground">
            {(joinedCount !== null || challenge.season) && (
              <span className="flex items-center gap-1">
                {joinedCount !== null && (
                  <>
                    <Users className="size-3.5" aria-hidden="true" />
                    <span>
                      <span className="font-mono tabular-nums">
                        {joinedCount.toLocaleString()}
                      </span>{" "}
                      joined
                    </span>
                  </>
                )}
                {joinedCount !== null && challenge.season && (
                  <span aria-hidden="true">·</span>
                )}
                {challenge.season && <span>{challenge.season}</span>}
              </span>
            )}
            {percentile !== null && (
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-lifting-strong text-xs font-semibold font-mono tabular-nums">
                Top {percentile}%
              </span>
            )}
          </div>
        )}

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
                    {p.rank ?? i + 1}
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
                    {formatChallengeValue(
                      challenge.metric,
                      p.currentValue,
                      liftUnit,
                      distanceUnit
                    )}
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
            variant={sport === "running" ? "sport" : "primary"}
            fullWidth
            onClick={handleJoin}
            loading={busy === "joining"}
          >
            {busy === "joining" ? "Joining…" : "Join challenge"}
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
            return (
              <div className="space-y-2">
                <div className="relative pt-1 pb-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${collPct}%` }}
                      transition={{ duration: 0.6 }}
                      /* The sport's colour, reached or not: a full bar says
                         it, and gold is kept for a new best. */
                      className={`h-full rounded-full ${barFill}`}
                    />
                  </div>
                </div>
                <p className="text-xs text-center font-mono tabular-nums text-muted-foreground">
                  <span className="text-foreground font-semibold">
                    {formatChallengeValue(
                      challenge.metric,
                      collectiveTotal,
                      liftUnit,
                      distanceUnit
                    )}
                  </span>{" "}
                  /{" "}
                  {formatChallengeValue(
                    challenge.metric,
                    target,
                    liftUnit,
                    distanceUnit
                  )}{" "}
                  together
                </p>
                <p className="text-caption text-center text-muted-foreground">
                  You contributed{" "}
                  {formatChallengeValue(
                    challenge.metric,
                    currentValue,
                    liftUnit,
                    distanceUnit
                  )}
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
             where a 0 currentValue means "no qualifying run yet".
             The goal line above already names the first tier's
             target, so a card with a goal adds nothing here; one
             without gets the next-tier hint. The full progress bar
             appears the moment the user has any progress to show. */
          goal ? null : (
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">
                {nextTier && nextValue
                  ? `${TIER_LABELS[nextTier]} at ${formatChallengeValue(challenge.metric, nextValue, liftUnit, distanceUnit)}`
                  : "Log your first qualifying activity to start the board"}
              </p>
            </div>
          )
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
                  /* The sport's colour at every tier. The tier shows on its
                     marker below and on the badge, never as the fill: a
                     bronze bar beside purple and coral read as food. */
                  className={`h-full rounded-full ${barFill}`}
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
                  {/* Gold as TEXT is 1.40:1 on white; the achievement
                      token is the same celebration register with a real
                      text step. The trophy keeps the metal. */}
                  <span className="font-semibold text-achievement-strong">
                    Gold achieved
                  </span>
                  {" · "}
                  {formatChallengeValue(
                    challenge.metric,
                    currentValue,
                    liftUnit,
                    distanceUnit
                  )}
                </span>
              ) : nextTier && nextValue ? (
                <span>
                  You&apos;re at{" "}
                  <span className="font-semibold text-foreground">
                    {formatChallengeValue(
                      challenge.metric,
                      currentValue,
                      liftUnit,
                      distanceUnit
                    )}
                  </span>
                  {" · "}
                  {TIER_LABELS[nextTier]} at{" "}
                  {formatChallengeValue(
                    challenge.metric,
                    nextValue,
                    liftUnit,
                    distanceUnit
                  )}
                </span>
              ) : (
                <span>
                  Progress:{" "}
                  {formatChallengeValue(
                    challenge.metric,
                    currentValue,
                    liftUnit,
                    distanceUnit
                  )}
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
            initial={motionSafe({ height: 0, opacity: 0 })}
            animate={{ height: "auto", opacity: 1 }}
            exit={motionSafe({ height: 0, opacity: 0 })}
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
                      {p.rank ?? i + 1}
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
                      {formatChallengeValue(
                        challenge.metric,
                        p.currentValue,
                        liftUnit,
                        distanceUnit
                      )}
                    </span>
                    {tier && (
                      <span
                        className="text-xs font-medium px-1.5 py-0.5 rounded-full text-foreground"
                        style={metalRing(tier)}
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
            {busy === "leaving" ? "Leaving…" : "Leave challenge"}
          </button>
        </div>
      )}
    </motion.div>
  );
}
