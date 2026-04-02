import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import { Footprints, Play, PersonStanding, Zap, RefreshCw, Wind, Route, Flag } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { ScheduledRunDay } from "@/features/program/runScheduler";

const RUN_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'person-standing': PersonStanding,
  'zap': Zap,
  'refresh-cw': RefreshCw,
  'wind': Wind,
  'route': Route,
  'flag': Flag,
};

export default function RunCTACard({ todayRun, navigate }: {
  todayRun: ScheduledRunDay | null;
  navigate: (p: string) => void;
}) {
  const tmpl = todayRun ? RUN_TEMPLATES.find(function(t) { return t.id === (todayRun.userOverride || todayRun.templateId); }) : null;
  const runLabel = tmpl ? tmpl.name : "Start a run";
  const runDesc = tmpl ? tmpl.description : "Easy run, tempo, or intervals";
  const runIcon = tmpl?.icon;
  const templateParam = tmpl ? "?template=" + tmpl.id : "";
  const RunIconComp = runIcon && RUN_ICON_MAP[runIcon] ? RUN_ICON_MAP[runIcon] : Footprints;

  const runKeyMetric = runDesc ? (runDesc.match(/(\d+\.?\d*\s*k(?:m|ilom[ei]t[er]*))/i)?.[1] || runDesc.match(/(\d+\.?\d*\s*mi(?:les?)?)/i)?.[1] || null) : null;

  return (
    <motion.button whileTap={{ scale: 0.97 }}
      onClick={function() { haptic(); navigate("/run" + templateParam); }}
      className="w-full p-4 rounded-xl bg-card text-left"
      style={{ backgroundColor: THEME.running + "14", boxShadow: 'var(--ds-shadow-run-glow)' }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: THEME.running + "18" }}>
          <RunIconComp className="w-5 h-5" style={{ color: THEME.running }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-micro uppercase tracking-wider mb-0.5" style={{ color: THEME.running }}>Today · Run day</p>
          <div className="flex items-baseline gap-2">
            <p className="text-sm font-bold text-foreground truncate">{runLabel}</p>
            {runKeyMetric && (
              <span className="text-sm font-bold font-mono tabular-nums" style={{ color: THEME.running }}>{runKeyMetric}</span>
            )}
          </div>
          <p className="text-micro text-muted-foreground truncate">{runDesc}</p>
        </div>
        <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold" style={{ background: `linear-gradient(135deg, ${THEME.running}, ${THEME.runningLight})`, color: "white", boxShadow: 'var(--ds-shadow-cta-run)' }}>
          <Play className="w-3 h-3" fill="white" />{todayRun?.completed ? "Done" : "Go"}
        </div>
      </div>
    </motion.button>
  );
}
