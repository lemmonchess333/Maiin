import { motion } from "framer-motion";
import { THEME } from "@/lib/theme";
import { useStreaks } from "./useStreaks";
import {
  BADGE_ART,
  BADGE_ICONS,
  CATEGORY_LABELS,
  TIER_COLORS,
  type BadgeDef,
} from "./badges";
import { BadgeHex } from "./BadgeHex";
import { ProgressRing } from "./BadgeProgressRing";
import { badgeProgress, nearestBadge } from "./badgeProgress";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Thin tier-tinted progress track + "X / Y" label, for in-progress badges. */
function ProgressBar({
  pct,
  label,
  color,
}: {
  pct: number;
  label: string;
  color: string;
}) {
  return (
    <div className="mt-1 space-y-1">
      <div
        className="h-1 rounded-full overflow-hidden"
        style={{ background: `${color}1f` }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.round(pct * 100)}%`, background: color }}
        />
      </div>
      <p className="text-caption font-mono tabular-nums" style={{ color }}>
        {label}
      </p>
    </div>
  );
}

export function BadgeGrid() {
  const {
    currentStreak,
    longestStreak,
    allBadges,
    earnedBadges,
    badgeProgressCtx,
  } = useStreaks();

  const categories = Object.keys(CATEGORY_LABELS) as BadgeDef["category"][];

  // The single nearest in-progress badge — the goal-gradient nudge.
  const next = nearestBadge(
    allBadges.map((b) => ({ id: b.id, earnedAt: b.earnedAt, def: b })),
    badgeProgressCtx
  );
  const nextColor = next ? TIER_COLORS[next.def.tier] : "";
  const nextIconKey = next?.def.lucideIcon ?? "Trophy";

  return (
    <div className="space-y-6">
      {/* Next badge — surfaced so there's always a near goal to chase. */}
      {next && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/50 overflow-hidden"
          style={{
            backgroundImage: `radial-gradient(circle at 16% 30%, ${nextColor}14, transparent 60%)`,
          }}
        >
          <div className="relative shrink-0" style={{ width: 96, height: 96 }}>
            <ProgressRing pct={next.progress.pct} color={nextColor} />
            <div className="absolute inset-0 flex items-center justify-center">
              <BadgeHex
                Icon={BADGE_ICONS[nextIconKey] ?? Trophy}
                tier={next.def.tier}
                earned={false}
                size={60}
                imageSrc={BADGE_ART[next.def.id]}
              />
            </div>
          </div>
          <div className="min-w-0">
            <p
              className="text-caption font-semibold uppercase tracking-wider"
              style={{ color: nextColor }}
            >
              Next badge
            </p>
            <p className="text-base font-bold text-foreground leading-tight">
              {next.def.name}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {next.def.description}
            </p>
            <ProgressBar
              pct={next.progress.pct}
              label={next.progress.label}
              color={nextColor}
            />
          </div>
        </motion.div>
      )}

      {/* Streak summary. */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="p-3 rounded-xl bg-card border border-border/50">
          <p
            className="text-3xl font-extrabold font-mono tabular-nums"
            style={{ color: THEME.amberLight }}
          >
            {currentStreak}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Current Streak</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border/50">
          <p className="text-3xl font-extrabold font-mono tabular-nums text-primary">
            {Number.isFinite(longestStreak) ? longestStreak : 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Longest Streak</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border/50">
          <p className="text-3xl font-extrabold font-mono tabular-nums text-foreground">
            {earnedBadges.length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Badges Earned</p>
        </div>
      </div>

      {/* Badges by category. */}
      {categories.map((cat) => {
        const badges = allBadges.filter((b) => b.category === cat);
        if (badges.length === 0) return null;

        return (
          <div key={cat} className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABELS[cat]}
            </p>
            <div
              className="grid grid-cols-3 gap-2"
              style={{ perspective: "800px" }}
            >
              {badges.map((badge, i) => {
                const tierColor = TIER_COLORS[badge.tier];
                const earned = !!badge.earnedAt;
                const Icon = BADGE_ICONS[badge.lucideIcon] ?? Trophy;
                // In-progress (locked + started) → show a bar instead of the
                // static description. Earned → date. Locked-no-progress →
                // description (milestone; earns server-side later).
                const progress = earned
                  ? null
                  : badgeProgress(badge, badgeProgressCtx);

                return (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    whileHover={
                      earned
                        ? { rotateY: 6, rotateX: -4, scale: 1.04, y: -2 }
                        : { scale: 1.02 }
                    }
                    whileTap={{ scale: 0.95 }}
                    className="relative p-3 rounded-xl bg-card border border-border/50 text-center"
                    style={{
                      transformStyle: "preserve-3d",
                      // Earned keeps the radial tier tint; the glow itself
                      // moved onto the badge art (BadgeHex) where it reads
                      // at grid size — the card-level box-shadow didn't.
                      backgroundImage: earned
                        ? `radial-gradient(circle at 50% 18%, ${tierColor}1a, transparent 65%)`
                        : undefined,
                    }}
                  >
                    <div className="flex items-center justify-center py-1 mb-2">
                      <BadgeHex
                        Icon={Icon}
                        tier={badge.tier}
                        earned={earned}
                        size={64}
                        imageSrc={BADGE_ART[badge.id]}
                      />
                    </div>

                    <p
                      className={cn(
                        "text-xs font-semibold leading-tight",
                        earned ? "text-foreground" : "text-muted-foreground/70"
                      )}
                    >
                      {badge.name}
                    </p>
                    {earned ? (
                      <p
                        className="text-caption font-mono tabular-nums mt-1"
                        style={{ color: tierColor }}
                      >
                        {new Date(badge.earnedAt!).toLocaleDateString()}
                      </p>
                    ) : progress && progress.pct > 0 ? (
                      <ProgressBar
                        pct={progress.pct}
                        label={progress.label}
                        color={tierColor}
                      />
                    ) : (
                      <p className="text-caption text-muted-foreground/50 mt-1 line-clamp-2">
                        {badge.description}
                      </p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
