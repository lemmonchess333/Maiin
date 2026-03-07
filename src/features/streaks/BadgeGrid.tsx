import { motion } from "framer-motion";
import { useStreaks } from "./useStreaks";
import { CATEGORY_LABELS, TIER_COLORS, type BadgeDef } from "./badges";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function BadgeGrid() {
  const { streakData, earnedBadges } = useStreaks();

  const categories = Object.keys(CATEGORY_LABELS) as BadgeDef["category"][];

  return (
    <div className="space-y-6">
      {/* Streak summary */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="p-3 rounded-xl bg-card border border-border/50">
          <p className="text-2xl font-bold text-orange-500">{streakData.currentStreak}</p>
          <p className="text-[10px] text-muted-foreground">Current Streak</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border/50">
          <p className="text-2xl font-bold text-primary">{streakData.longestStreak}</p>
          <p className="text-[10px] text-muted-foreground">Longest Streak</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border/50">
          <p className="text-2xl font-bold text-foreground">{earnedBadges.length}</p>
          <p className="text-[10px] text-muted-foreground">Badges Earned</p>
        </div>
      </div>

      {/* Badges by category */}
      {categories.map((cat) => {
        const badges = streakData.badges.filter((b) => b.category === cat);
        if (badges.length === 0) return null;

        return (
          <div key={cat} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABELS[cat]}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {badges.map((badge, i) => {
                const tierColor = TIER_COLORS[badge.tier];
                const earned = !!badge.earnedAt;

                return (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "relative p-3 rounded-xl text-center transition-all overflow-hidden",
                      earned
                        ? "bg-card/80"
                        : "bg-muted/20 opacity-50"
                    )}
                    style={{
                      border: earned
                        ? `1.5px solid ${tierColor}40`
                        : "1px solid rgba(255,255,255,0.05)",
                      backgroundImage: earned
                        ? `linear-gradient(135deg, ${tierColor}08, transparent 60%)`
                        : undefined,
                    }}
                  >
                    {/* Tier dot */}
                    {earned && (
                      <div
                        className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: tierColor }}
                      />
                    )}

                    <div className="flex items-center justify-center text-2xl mb-1">
                      {earned ? badge.icon : <Lock className="w-5 h-5 text-muted-foreground/30" />}
                    </div>
                    <p className={cn(
                      "text-[10px] font-medium leading-tight",
                      earned ? "text-foreground" : "text-muted-foreground/50"
                    )}>
                      {badge.name}
                    </p>
                    {earned ? (
                      <p className="text-[9px] mt-0.5" style={{ color: tierColor }}>
                        {new Date(badge.earnedAt!).toLocaleDateString()}
                      </p>
                    ) : (
                      <p className="text-[9px] text-muted-foreground/40 mt-0.5 line-clamp-2">
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
