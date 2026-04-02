import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ChevronRight, Dumbbell, Footprints } from "lucide-react";
import { THEME } from "@/lib/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface Props {
  liftSessions: number;
  runSessions: number;
  liftTonnage: number;
  runKm: number;
  targetLiftSessions: number;
  targetRunSessions: number;
}

export default function HybridBalanceCard({ liftSessions, runSessions, liftTonnage, runKm, targetLiftSessions, targetRunSessions }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const totalSessions = liftSessions + runSessions;
  if (totalSessions === 0 && liftTonnage === 0 && runKm === 0) {
    return (
      <div className="p-4 rounded-2xl bg-card">
        <p className="text-sm font-bold text-foreground mb-3">This Week</p>
        <div className="text-center py-4 space-y-1.5 bg-gradient-to-br from-muted/30 to-transparent rounded-xl">
          <Dumbbell className="w-6 h-6 mx-auto" style={{ color: THEME.lifting }} />
          <p className="text-sm font-semibold text-foreground">Fresh week</p>
          <p className="text-xs text-muted-foreground">
            {targetLiftSessions > 0 && targetRunSessions > 0
              ? `${targetLiftSessions} lift${targetLiftSessions !== 1 ? 's' : ''} · ${targetRunSessions} run${targetRunSessions !== 1 ? 's' : ''} planned`
              : targetLiftSessions > 0
              ? `${targetLiftSessions} lift session${targetLiftSessions !== 1 ? 's' : ''} planned`
              : targetRunSessions > 0
              ? `${targetRunSessions} run${targetRunSessions !== 1 ? 's' : ''} planned`
              : 'Log a workout or run to see your hybrid balance'}
          </p>
        </div>
      </div>
    );
  }

  const liftPct = totalSessions > 0 ? Math.round((liftSessions / totalSessions) * 100) : 0;
  const runPct = totalSessions > 0 ? 100 - liftPct : 0;

  const totalTarget = targetLiftSessions + targetRunSessions;
  const targetLiftPct = totalTarget > 0 ? Math.round((targetLiftSessions / totalTarget) * 100) : 50;

  // Balance assessment
  const liftDiff = liftSessions - targetLiftSessions;
  const runDiff = runSessions - targetRunSessions;
  let balanceLabel: string;
  let balanceColor: string;

  if (liftDiff >= 0 && runDiff >= 0) {
    balanceLabel = "On track";
    balanceColor = THEME.semantic.positive;
  } else if (Math.abs(liftDiff) <= 1 && Math.abs(runDiff) <= 1) {
    balanceLabel = "Nearly there";
    balanceColor = THEME.semantic.positive;
  } else if (liftDiff < -1 && runDiff >= 0) {
    balanceLabel = "More lifting needed";
    balanceColor = THEME.lifting;
  } else if (runDiff < -1 && liftDiff >= 0) {
    balanceLabel = "More running needed";
    balanceColor = THEME.running;
  } else {
    balanceLabel = "Behind this week";
    balanceColor = THEME.warning;
  }

  // Volume display — show tonnes for 1000+, otherwise kg
  const volumeDisplay = liftTonnage >= 1000
    ? `${(liftTonnage / 1000).toFixed(1)}t`
    : `${Math.round(liftTonnage)} kg`;

  return (
    <Link to="/history?tab=performance">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="p-4 rounded-2xl bg-card space-y-3"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-foreground">This Week</p>
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium" style={{ color: balanceColor }}>{balanceLabel}</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>

        {/* Balance bar */}
        <div className="space-y-1.5">
          <div className="h-2.5 rounded-full overflow-hidden flex" style={{ backgroundColor: `${THEME.text.muted}10` }}>
            {liftPct > 0 && (
              <motion.div
                className="h-full"
                style={{ backgroundColor: THEME.lifting, borderRadius: runPct > 0 ? '9999px 0 0 9999px' : '9999px' }}
                initial={prefersReducedMotion ? { width: `${liftPct}%` } : { width: 0 }}
                animate={{ width: `${liftPct}%` }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6, ease: "easeOut", delay: 0.2 }}
              />
            )}
            {runPct > 0 && (
              <motion.div
                className="h-full"
                style={{ backgroundColor: THEME.running, borderRadius: liftPct > 0 ? '0 9999px 9999px 0' : '9999px' }}
                initial={prefersReducedMotion ? { width: `${runPct}%` } : { width: 0 }}
                animate={{ width: `${runPct}%` }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6, ease: "easeOut", delay: 0.3 }}
              />
            )}
          </div>

          {/* Target indicator tick */}
          <div className="relative h-1">
            <div
              className="absolute w-1 h-3 rounded-full -translate-y-0.5"
              aria-label={`Target balance: ${targetLiftPct}% lifting, ${100 - targetLiftPct}% running`}
              style={{
                left: `${targetLiftPct}%`,
                backgroundColor: THEME.text.muted,
                opacity: 0.5,
              }}
            />
          </div>
        </div>

        {/* Stats row — sessions + volume/distance with labels */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <Dumbbell className="w-3 h-3" style={{ color: THEME.lifting }} />
            <span className="text-muted-foreground">Lifts</span>
            <span className="font-mono tabular-nums">
              <span className="font-semibold text-foreground">{liftSessions}</span><span className="text-muted-foreground">/{targetLiftSessions}</span>
            </span>
            {liftTonnage > 0 && <span className="text-muted-foreground font-mono tabular-nums">· {volumeDisplay}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <Footprints className="w-3 h-3" style={{ color: THEME.running }} />
            <span className="text-muted-foreground">Runs</span>
            <span className="font-mono tabular-nums">
              <span className="font-semibold text-foreground">{runSessions}</span><span className="text-muted-foreground">/{targetRunSessions}</span>
            </span>
            {runKm > 0 && <span className="text-muted-foreground font-mono tabular-nums">· {runKm.toFixed(1)} km</span>}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
