import { THEME } from "@/lib/theme";
import { Target } from "lucide-react";
import { formatVolume, formatStat } from "@/utils/formatters";
import { motion } from "framer-motion";
import { useCountUp } from "@/hooks/useCountUp";

export default function WeeklySnapshotCompact({ liftSessions, runSessions, liftTonnage, runKm, adherenceScore }: {
  liftSessions: number; runSessions: number; liftTonnage: number; runKm: number; adherenceScore: number | null;
}) {
  const allZero = liftSessions === 0 && runSessions === 0 && liftTonnage === 0 && runKm === 0 && adherenceScore == null;
  const vol = formatVolume(liftTonnage);
  const totalSessions = liftSessions + runSessions;
  const sessionsDisplay = useCountUp(totalSessions, { sessionKey: "sessions", duration: 0.5 });
  const volumeDisplay = useCountUp(liftTonnage, {
    sessionKey: "volume",
    duration: 0.7,
    decimals: liftTonnage >= 1000 ? 1 : 0,
    suffix: liftTonnage >= 1000 ? "k" : "",
  });
  const volumeUnit = liftTonnage >= 1000 ? "" : vol.unit ? " " + vol.unit : "";
  const staticStats = [
    { label: "Distance", value: runKm > 0 ? runKm.toFixed(1) + "km" : "\u2014", color: THEME.running },
    { label: "Adherence", value: adherenceScore != null ? adherenceScore + "%" : "\u2014", color: THEME.success },
  ];
  return (
    <div className="p-4 rounded-2xl bg-card">
      <p className="text-[11px] uppercase tracking-[0.5px] font-medium mb-3" style={{ color: THEME.text.muted }}>This Week</p>
      {allZero ? (
        <div className="text-center py-4 space-y-1.5 bg-gradient-to-br from-muted/30 to-transparent rounded-xl">
          <p className="text-lg"><Target size={24} className="text-purple-500" /></p>
          <p className="text-sm font-semibold text-foreground">Fresh week</p>
          <p className="text-[11px] text-muted-foreground">Log a workout or run to see your weekly stats</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-xl" style={{ background: THEME.brand + "10" }}>
            <p className="text-base font-bold font-mono tabular-nums leading-none" style={{ color: THEME.brand }}>
              {totalSessions > 0 ? <motion.span>{sessionsDisplay}</motion.span> : formatStat(totalSessions)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">Sessions</p>
          </div>
          <div className="text-center p-2 rounded-xl" style={{ background: THEME.lifting + "10" }}>
            <p className="text-base font-bold font-mono tabular-nums leading-none" style={{ color: THEME.lifting }}>
              {liftTonnage > 0 ? <><motion.span>{volumeDisplay}</motion.span>{volumeUnit}</> : vol.value + (vol.unit ? " " + vol.unit : "")}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">Volume</p>
          </div>
          {staticStats.map(function(s) {
            return (
              <div key={s.label} className="text-center p-2 rounded-xl" style={{ background: s.color + "10" }}>
                <p className="text-base font-bold font-mono tabular-nums leading-none" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{s.label}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
