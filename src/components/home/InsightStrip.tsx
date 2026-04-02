import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Flame, Zap, Dumbbell, Leaf, ChevronRight } from "lucide-react";
import { THEME } from "@/lib/theme";

export default function InsightStrip({ title, bullet, loadBand }: { title: string; bullet: string; loadBand: string }) {
  const iconColor = loadBand === "overreach" ? THEME.danger : loadBand === "high" ? THEME.warning : loadBand === "moderate" ? THEME.lifting : THEME.semantic.positive;
  const iconEl = loadBand === "overreach" ? <Flame className="w-5 h-5" /> : loadBand === "high" ? <Zap className="w-5 h-5" /> : loadBand === "moderate" ? <Dumbbell className="w-5 h-5" /> : <Leaf className="w-5 h-5" />;
  const iconLabel = loadBand === "overreach" ? "Overreach — consider a deload" : loadBand === "high" ? "High training load" : loadBand === "moderate" ? "Moderate training load" : "Light training load";
  return (
    <Link to="/history?tab=performance">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="p-4 rounded-2xl bg-card flex items-start gap-3 active:scale-[0.98]"
        style={{ boxShadow: `inset 3px 0 0 ${iconColor}40, var(--ds-shadow-card)`, backgroundColor: `${iconColor}06` }}>
        <span className="mt-0.5" style={{ color: iconColor }} role="img" aria-label={iconLabel}>{iconEl}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">{bullet}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <span className="text-xs text-primary font-medium">Details</span>
          <ChevronRight className="w-3.5 h-3.5 text-primary" />
        </div>
      </motion.div>
    </Link>
  );
}
