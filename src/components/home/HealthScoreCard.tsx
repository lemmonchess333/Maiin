import { THEME } from "@/lib/theme";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useCountUp } from "@/hooks/useCountUp";
import { Heart, TrendingUp, TrendingDown } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { getScoreColor, getScoreLabel } from "@/lib/healthScore";

export default function HealthScoreCard({ healthScore, prevHealthScore }: {
  healthScore: number | null;
  prevHealthScore: number | null;
}) {
  const healthDisplay = useCountUp(healthScore ?? 0, { sessionKey: "health", duration: 1 });
  const scoreDelta = healthScore != null && prevHealthScore != null ? healthScore - prevHealthScore : null;
  const hasScore = healthScore != null;

  return (
    <Link to="/history?tab=health" onClick={function() { haptic(); }} className="block p-4 rounded-2xl bg-card active:scale-[0.98]">
      {(() => {
        const score = hasScore ? healthScore : 0;
        const zoneColor = hasScore ? getScoreColor(score) : THEME.text.muted;
        const radius = 40;
        const stroke = 7;
        const circumference = 2 * Math.PI * radius;
        const arcLength = circumference * 0.75;
        const offset = hasScore ? arcLength - (arcLength * Math.min(score, 100)) / 100 : arcLength;
        return (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Heart className="w-4 h-4" style={{ color: zoneColor }} />
              <p className="text-xs font-medium" style={{ color: THEME.text.muted }}>Health Score</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-[135deg]">
                  <circle cx="50" cy="50" r={radius} fill="none" stroke={zoneColor + "1A"} strokeWidth={stroke}
                    strokeDasharray={arcLength + " " + circumference} strokeLinecap="round" />
                  <motion.circle cx="50" cy="50" r={radius} fill="none" stroke={zoneColor} strokeWidth={stroke}
                    strokeDasharray={arcLength + " " + circumference} strokeLinecap="round"
                    initial={{ strokeDashoffset: arcLength }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1.2, ease: "easeOut" }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-display font-extrabold leading-none font-mono tabular-nums" style={{ color: zoneColor }}>
                    {hasScore ? <motion.span>{healthDisplay}</motion.span> : "--"}
                  </p>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                {healthScore != null ? (
                  <>
                    <p className="text-xs" style={{ color: THEME.text.muted }}>
                      Based on your recent consistency, nutrition, and activity
                    </p>
                    <motion.p
                      className="text-sm font-medium mt-0.5"
                      style={{ color: zoneColor, opacity: 0.8 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.8 }}
                      transition={{ delay: 1.2, duration: 0.2 }}
                    >
                      {getScoreLabel(healthScore)}
                    </motion.p>
                    {scoreDelta != null && scoreDelta !== 0 && (
                      <div className="mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-medium"
                          style={{
                            backgroundColor: (scoreDelta > 0 ? THEME.semantic.positive : THEME.semantic.vitals) + "1A",
                            color: scoreDelta > 0 ? THEME.semantic.positive : THEME.semantic.vitals,
                          }}>
                          {scoreDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {scoreDelta > 0 ? "+" : ""}{scoreDelta} from yesterday
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs" style={{ color: THEME.text.muted }}>
                    Log activity to see your health score
                  </p>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </Link>
  );
}
