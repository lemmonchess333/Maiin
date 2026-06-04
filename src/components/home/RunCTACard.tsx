import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import {
  Footprints,
  Play,
  PersonStanding,
  Zap,
  RefreshCw,
  Wind,
  Route,
  Flag,
} from "lucide-react";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { ScheduledRunDay } from "@/features/program/runScheduler";
import {
  getScheduledRunStatus,
  isScheduledRunStartable,
} from "@/lib/scheduledRunStatus";

const RUN_ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  "person-standing": PersonStanding,
  zap: Zap,
  "refresh-cw": RefreshCw,
  wind: Wind,
  route: Route,
  flag: Flag,
};

export default function RunCTACard({
  todayRun,
  navigate,
  isFirst = false,
}: {
  todayRun: ScheduledRunDay | null;
  navigate: (p: string) => void;
  /** #972 cold-start framing: frame this as the user's first run. */
  isFirst?: boolean;
}) {
  const tmpl = todayRun
    ? RUN_TEMPLATES.find(function (t) {
        return t.id === (todayRun.userOverride || todayRun.templateId);
      })
    : null;
  const runLabel = tmpl ? tmpl.name : "Start a run";
  const runDesc = tmpl ? tmpl.description : "Easy run, tempo, or intervals";
  const runIcon = tmpl?.icon;
  // P0-6: pass scheduledRunId so Run.tsx can pin the exact runDay
  // being fulfilled. Falls back to ?template= alone for legacy
  // runDays without v2 ids (no id field on the schedule object).
  const params: string[] = [];
  if (tmpl) params.push("template=" + tmpl.id);
  if (todayRun?.id)
    params.push("scheduledRunId=" + encodeURIComponent(todayRun.id));
  const queryString = params.length ? "?" + params.join("&") : "";
  const RunIconComp =
    runIcon && RUN_ICON_MAP[runIcon] ? RUN_ICON_MAP[runIcon] : Footprints;

  const runKeyMetric = runDesc
    ? runDesc.match(/(\d+\.?\d*\s*k(?:m|ilom[ei]t[er]*))/i)?.[1] ||
      runDesc.match(/(\d+\.?\d*\s*mi(?:les?)?)/i)?.[1] ||
      null
    : null;

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={function () {
        haptic();
        trackHomeEvent("home_card_tapped", { card: "today_run" });
        navigate("/run" + queryString);
      }}
      className="w-full rounded-xl bg-card text-left p-4"
      style={{ backgroundColor: THEME.running + "14" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="size-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: THEME.running + "18" }}
        >
          <RunIconComp className="size-5" style={{ color: THEME.running }} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-semibold mb-0.5"
            style={{ color: THEME.running }}
          >
            {isFirst ? "Your first run" : "Today · Run day"}
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-sm font-bold text-foreground truncate">
              {runLabel}
            </p>
            {runKeyMetric && (
              <span
                className="text-sm font-bold font-mono tabular-nums"
                style={{ color: THEME.running }}
              >
                {runKeyMetric}
              </span>
            )}
          </div>
          <p className="text-micro text-muted-foreground truncate">{runDesc}</p>
        </div>
        <div
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${THEME.running}, ${THEME.runningLight})`,
            color: "white",
          }}
        >
          <Play className="size-3" fill="white" />
          {
            // PR-0b-iii: "Go" only when actually startable.
            // Terminal AND reconciliation states both surface as
            // "Done" (the user can't launch a fresh run flow).
            todayRun && isScheduledRunStartable(getScheduledRunStatus(todayRun))
              ? "Go"
              : todayRun
                ? "Done"
                : "Go"
          }
        </div>
      </div>
    </motion.button>
  );
}
