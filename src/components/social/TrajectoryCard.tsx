import { useEffect, useState, useCallback } from 'react';
import { Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { getPersonalTrajectory, type PersonalTrajectory } from '@/lib/personalTrajectory';
import { THEME } from '@/lib/theme';

/**
 * Solo-user alternative to LeaderboardCard. Surfaces this week's
 * hybrid score vs last week's so the "leaderboard slot" on the
 * Following tab stays useful for users who don't yet have enough
 * friends for a meaningful leaderboard.
 *
 * Keeps the same outer shape (p-4 rounded-2xl card with a header
 * row featuring Zap + title + "This Week" pill) as LeaderboardCard
 * so swapping between the two doesn't cause a layout shift.
 */
export default function TrajectoryCard() {
  const { user } = useAuth();
  const [data, setData] = useState<PersonalTrajectory | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const d = await getPersonalTrajectory(user.uid);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
  }, [load]);

  const thisWeek = data?.thisWeek;
  const lastWeek = data?.lastWeek;
  const deltaPct = data?.deltaPct ?? null;

  // Colour the delta: green = improvement, coral = regression,
  // muted grey = flat / no baseline.
  const deltaColor = deltaPct == null
    ? THEME.text.muted
    : deltaPct > 0
      ? THEME.success
      : deltaPct < 0
        ? THEME.running
        : THEME.text.muted;

  const DeltaIcon = deltaPct == null
    ? Minus
    : deltaPct > 0
      ? TrendingUp
      : deltaPct < 0
        ? TrendingDown
        : Minus;

  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-5 h-5" style={{ color: THEME.brand }} />
        <div className="flex-1">
          <h3 className="text-sm font-bold">Your trajectory</h3>
        </div>
        <span className="text-xs text-muted-foreground">This Week</span>
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground text-center py-6 animate-pulse">Loading...</p>
      )}

      {!loading && thisWeek && lastWeek && (
        <>
          {/* Hero row — this week's score + delta chip.
              Suppress the delta chip entirely when this week's score
              is 0 — showing "-100%" before the user has logged anything
              for the new week reads as a failure-state in red. The
              "Start your week" zero-state nudge below is the calmer
              prompt to action. */}
          <div className="flex items-baseline gap-3 mb-3">
            <span
              className="text-3xl font-mono tabular-nums font-extrabold"
              style={{ color: THEME.brand }}
            >
              {thisWeek.score === 0 ? '0' : thisWeek.score.toLocaleString()}
            </span>
            <span className="text-sm text-muted-foreground font-medium">pts</span>
            {thisWeek.score > 0 && (
              <span
                className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ backgroundColor: `${deltaColor}14`, color: deltaColor }}
              >
                <DeltaIcon size={12} />
                {deltaPct == null
                  ? 'new'
                  : `${deltaPct > 0 ? '+' : ''}${deltaPct}%`}
              </span>
            )}
          </div>

          {/* Last week baseline — kept even at zero so the user has
              a target to beat. */}
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
            <span>Last week</span>
            <span className="font-mono tabular-nums">{lastWeek.score.toLocaleString()} pts</span>
          </div>

          {/* Breakdown — km + kg split */}
          <div className="flex items-center gap-4 pt-3 border-t border-border/30">
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Running</p>
              <p className="text-sm font-mono tabular-nums font-bold mt-0.5">
                {thisWeek.km.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">km</span>
              </p>
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Lifting</p>
              <p className="text-sm font-mono tabular-nums font-bold mt-0.5">
                {thisWeek.kg.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">kg</span>
              </p>
            </div>
          </div>

          {/* Zero-state nudge — no lift, no run this week yet */}
          {thisWeek.score === 0 && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              {lastWeek.score > 0
                ? 'Start your week — beat last week'
                : 'Start your week with your first workout or run'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
