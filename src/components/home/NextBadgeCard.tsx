/**
 * Home "Next badge" nudge — the goal-gradient pull on the daily-visited
 * screen. Research (Kivetz 2006 goal-gradient; Nunes & Drèze 2006 endowed
 * progress) is unambiguous that the strongest retention lever is showing the
 * user how close the NEXT reward is — but until now that lived only on the
 * History → Badges grid, which most users rarely open. This surfaces the
 * single nearest in-progress badge (a mini ring + "X / Y") right in the Today
 * section, deep-linking into the full grid.
 *
 * Renders nothing when nothing is mid-flight (nearestBadge returns null), so it
 * never shows an empty/placeholder state — an active user always has a near
 * goal; a brand-new user with no progress simply doesn't see it yet. Reads from
 * the shared <StreaksProvider> (no extra Firestore listeners).
 *
 * Complementary to the header streak pill: the pill shows the live flame +
 * count, this shows the SPECIFIC next badge with its progress arc (often a
 * non-streak goal the pill can't represent — a hybrid week, a balanced block).
 */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Trophy } from "lucide-react";
import { useStreaks } from "@/features/streaks/useStreaks";
import { nearestBadge } from "@/features/streaks/badgeProgress";
import { BadgeHex } from "@/features/streaks/BadgeHex";
import { ProgressRing } from "@/features/streaks/BadgeProgressRing";
import { BADGE_ART, BADGE_ICONS, TIER_COLORS } from "@/features/streaks/badges";

export default function NextBadgeCard() {
  const { allBadges, badgeProgressCtx } = useStreaks();

  const next = nearestBadge(
    allBadges.map((b) => ({ id: b.id, earnedAt: b.earnedAt, def: b })),
    badgeProgressCtx
  );
  if (!next) return null;

  const color = TIER_COLORS[next.def.tier];
  const Icon = BADGE_ICONS[next.def.lucideIcon] ?? Trophy;

  return (
    <Link
      to="/history"
      onClick={() => {
        // Force the Badges tab (History restores its last-viewed tab on mount).
        try {
          sessionStorage.setItem("history-tab", "badges");
        } catch {
          /* private mode — lands on the default tab, harmless */
        }
      }}
      aria-label={`Next badge — ${next.def.name}, ${next.progress.label}. View all badges.`}
      className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="relative flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/50 overflow-hidden"
        style={{
          backgroundImage: `radial-gradient(circle at 14% 30%, ${color}12, transparent 62%)`,
        }}
      >
        <div className="relative shrink-0" style={{ width: 56, height: 56 }}>
          <ProgressRing pct={next.progress.pct} color={color} size={56} />
          <div className="absolute inset-0 flex items-center justify-center">
            <BadgeHex
              Icon={Icon}
              tier={next.def.tier}
              earned={false}
              size={36}
              imageSrc={BADGE_ART[next.def.id]}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="text-caption font-semibold uppercase tracking-wider"
            style={{ color }}
          >
            Next badge
          </p>
          <p className="text-sm font-bold text-foreground leading-tight truncate">
            {next.def.name}
          </p>
          <p
            className="text-caption font-mono tabular-nums mt-0.5"
            style={{ color }}
          >
            {next.progress.label}
          </p>
        </div>

        <ChevronRight
          aria-hidden="true"
          className="size-4 text-muted-foreground/50 shrink-0"
        />
      </motion.div>
    </Link>
  );
}
