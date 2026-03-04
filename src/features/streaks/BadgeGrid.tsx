import { motion } from "framer-motion";
import { useStreaks } from "./useStreaks";
import { CATEGORY_LABELS, type BadgeDef } from "./badges";
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
              {badges.map((badge) => (
                <motion.div
                  key={badge.id}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "p-3 rounded-xl border text-center transition-all",
                    badge.earnedAt
                      ? "bg-card border-primary/30"
                      : "bg-muted/30 border-border/20 opacity-40"
                  )}
                >
                  <div className="flex items-center justify-center text-2xl mb-1">
                    {badge.earnedAt ? badge.icon : <Lock className="w-5 h-5 text-muted-foreground/50" />}
                  </div>
                  <p className={cn(
                    "text-[10px] font-medium leading-tight",
                    badge.earnedAt ? "text-foreground" : "text-muted-foreground/70"
                  )}>
                    {badge.name}
                  </p>
                  {badge.earnedAt ? (
                    <p className="text-[9px] text-primary mt-0.5">
                      {new Date(badge.earnedAt).toLocaleDateString()}
                    </p>
                  ) : (
                    <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2">
                      {badge.description}
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
