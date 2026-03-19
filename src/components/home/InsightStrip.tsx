import { THEME } from "@/lib/theme";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Flame, Zap, Dumbbell, Leaf, ChevronRight } from "lucide-react";

export default function InsightStrip({ title, bullet, loadBand }: { title: string; bullet: string; loadBand: string }) {
  const icon = loadBand === "overreach" ? <Flame size={20} className="text-orange-500" /> : loadBand === "high" ? <Zap size={20} className="text-yellow-500" /> : loadBand === "moderate" ? <Dumbbell size={20} className="text-orange-500" /> : <Leaf size={20} className="text-green-400" />;
  return (
    <Link to="/history?tab=performance">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="p-4 rounded-2xl bg-card flex items-start gap-3 active:scale-[0.99]">
        <span className="mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">{bullet}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <span className="text-[10px] text-primary font-medium">Details</span>
          <ChevronRight className="w-3.5 h-3.5 text-primary" />
        </div>
      </motion.div>
    </Link>
  );
}
