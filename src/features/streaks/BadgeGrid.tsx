import { motion } from "framer-motion";
import { useStreaks } from "./useStreaks";
import {
  BADGE_ART,
  BADGE_ICONS,
  CATEGORY_LABELS,
  TIER_COLORS,
  type BadgeDef,
} from "./badges";
import { BadgeHex } from "./BadgeHex";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export function BadgeGrid() {
  const { currentStreak, longestStreak, allBadges, earnedBadges } =
    useStreaks();

  const categories = Object.keys(CATEGORY_LABELS) as BadgeDef["category"][];

  return (
    <div className="space-y-6">
      {/* Streak summary — text-3xl / font-extrabold / font-mono / tabular-nums
          matches the StatCard component used elsewhere on History (Avg
          Calories, Weekly Volume, Sessions). Keeps the numeric hero scale
          consistent across every History stat card. */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="p-3 rounded-xl bg-card border border-border/50">
          <p className="text-3xl font-extrabold font-mono tabular-nums text-orange-500">
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

      {/* Badges by category */}
      {categories.map((cat) => {
        const badges = allBadges.filter((b) => b.category === cat);
        if (badges.length === 0) return null;

        return (
          <div key={cat} className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABELS[cat]}
            </p>
            {/* Perspective on the grid so child rotate transforms get a
                proper 3D foreshortening when the user hovers a card. */}
            <div
              className="grid grid-cols-3 gap-2"
              style={{ perspective: "800px" }}
            >
              {badges.map((badge, i) => {
                const tierColor = TIER_COLORS[badge.tier];
                const earned = !!badge.earnedAt;
                const Icon = BADGE_ICONS[badge.lucideIcon] ?? Trophy;

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
                      // Soft tier-tinted radial glow behind the hex on
                      // earned cards — subtle always-on premium signal
                      // that makes earned vs locked feel different at a
                      // glance, without needing a coloured border.
                      backgroundImage: earned
                        ? `radial-gradient(circle at 50% 18%, ${tierColor}1a, transparent 65%)`
                        : undefined,
                      boxShadow: earned
                        ? `0 4px 14px -6px ${tierColor}55`
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
