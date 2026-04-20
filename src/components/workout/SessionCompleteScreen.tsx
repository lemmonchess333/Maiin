import { useState, useRef } from "react";
import { THEME } from "@/lib/theme";
import { Trophy, Clock, Dumbbell, Target, Zap, Share2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { repBucketLabel, type RepBucket } from "@/lib/prTracking";
import ShareCard from "@/components/social/ShareCard";
import { generateAndShare } from "@/lib/shareCardGenerator";
import { getVolumeComparison } from "@/lib/funComparisons";
import type { ProgramExercise } from "@/features/program/programTypes";

type SetType = "working" | "warmup" | "dropset" | "failure";

interface SetLog {
  reps: number;
  weight: number;
  completed: boolean;
  type: SetType;
  rpe?: number;
}

interface SessionCompleteScreenProps {
  dayName: string;
  dayType: string;
  exercises: ProgramExercise[];
  setLogs: SetLog[][];
  firedPRs: Map<string, RepBucket[]>;
  sessionDurationMinutes: number;
  completing: boolean;
  onFinish: () => void;
  onClose: () => void;
}

export default function SessionCompleteScreen({
  dayName, dayType, exercises, setLogs, firedPRs,
  sessionDurationMinutes, completing, onFinish, onClose,
}: SessionCompleteScreenProps) {
  const { profile } = useAuth();
  const [showShareCard, setShowShareCard] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  const durationDisplay = sessionDurationMinutes >= 60
    ? `${Math.floor(sessionDurationMinutes / 60)}h ${sessionDurationMinutes % 60}m`
    : `${sessionDurationMinutes}m`;

  const totalVolume = setLogs.flat()
    .filter(s => s.completed && s.type !== 'warmup')
    .reduce((sum, s) => sum + (s.weight * s.reps), 0);

  const totalVolumeDisplay = totalVolume >= 1000
    ? `${(totalVolume / 1000).toFixed(1)}k`
    : `${Math.round(totalVolume)}`;

  const totalSetsCompleted = setLogs.flat().filter(s => s.completed).length;

  const prDetails = Array.from(firedPRs.entries()).flatMap(([name, buckets]) =>
    buckets.map(bucket => ({ name, label: repBucketLabel(bucket) }))
  );
  const prCount = prDetails.length;

  const exerciseSummary = exercises.map((ex, exIdx) => {
    const logs = setLogs[exIdx].filter(s => s.completed);
    const workingSets = logs.filter(s => s.type !== 'warmup');
    const bestSet = workingSets.length > 0
      ? workingSets.reduce((best, s) =>
          (s.weight * s.reps > best.weight * best.reps) ? s : best, workingSets[0])
      : null;
    return {
      name: ex.name,
      setsCompleted: workingSets.length,
      totalSets: ex.sets,
      bestWeight: bestSet?.weight || 0,
      bestReps: bestSet?.reps || 0,
      isPR: firedPRs.has(ex.name),
      prLabels: (firedPRs.get(ex.name) || []).map(b => repBucketLabel(b)),
    };
  }).filter(e => e.setsCompleted > 0);

  const funComparison = getVolumeComparison(totalVolume);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-background overflow-y-auto safe-area-pb"
    >
      <div className="max-w-md mx-auto px-5 py-8 space-y-6">

        {/* Hero Section */}
        <motion.div
          className="text-center space-y-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.2 }}
          >
            <Trophy className="w-14 h-14 text-yellow-500 mx-auto" />
          </motion.div>
          <h2 className="text-2xl font-bold text-foreground">Workout Complete</h2>
          <p className="text-sm text-muted-foreground">{dayName} · {dayType}</p>
        </motion.div>

        {/* Stat Cards Row */}
        <motion.div
          className="grid grid-cols-3 gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="p-4 rounded-2xl bg-card text-center space-y-1">
            <Clock className="w-4 h-4 mx-auto" style={{ color: THEME.text.muted }} />
            <p className="text-lg font-bold font-mono tabular-nums text-foreground">{durationDisplay}</p>
            <p className="text-xs uppercase tracking-wider" style={{ color: THEME.text.muted }}>Duration</p>
          </div>
          <div className="p-4 rounded-2xl bg-card text-center space-y-1">
            <Dumbbell className="w-4 h-4 mx-auto" style={{ color: THEME.lifting }} />
            <p className="text-lg font-bold font-mono tabular-nums text-foreground">{totalVolumeDisplay}<span className="text-xs font-normal" style={{ color: THEME.text.muted }}>kg</span></p>
            <p className="text-xs uppercase tracking-wider" style={{ color: THEME.text.muted }}>Volume</p>
          </div>
          <div className="p-4 rounded-2xl bg-card text-center space-y-1">
            <Target className="w-4 h-4 mx-auto" style={{ color: THEME.semantic.positive }} />
            <p className="text-lg font-bold font-mono tabular-nums text-foreground">{totalSetsCompleted}</p>
            <p className="text-xs uppercase tracking-wider" style={{ color: THEME.text.muted }}>Sets</p>
          </div>
        </motion.div>

        {/* PR Banner */}
        {prCount > 0 && (
          <motion.div
            className="p-4 rounded-2xl text-center space-y-2"
            style={{
              background: `linear-gradient(135deg, ${THEME.brand}15 0%, ${THEME.semantic.positive}10 100%)`,
              border: `1px solid ${THEME.brand}30`,
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
          >
            <div className="flex items-center justify-center gap-2">
              <Zap className="w-5 h-5" style={{ color: THEME.brand }} />
              <p className="text-sm font-bold text-foreground">
                {prCount} Personal Record{prCount > 1 ? "s" : ""}!
              </p>
            </div>
            <div className="space-y-0.5">
              {prDetails.map(pr => (
                <p key={`${pr.name}-${pr.label}`} className="text-xs text-muted-foreground">
                  {pr.name} — {pr.label}
                </p>
              ))}
            </div>
          </motion.div>
        )}

        {/* Fun Comparison */}
        {funComparison && (
          <motion.p
            className="text-center text-xs font-medium"
            style={{ color: THEME.text.muted }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {funComparison}
          </motion.p>
        )}

        {/* Exercise Breakdown */}
        <motion.div
          className="rounded-2xl bg-card overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="px-4 pt-4 pb-2">
            <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: THEME.text.muted }}>
              Exercises
            </p>
          </div>
          <div className="divide-y divide-border/30">
            {exerciseSummary.map((ex, i) => (
              <motion.div
                key={ex.name}
                className="flex items-center justify-between px-4 py-3"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.05 }}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {ex.isPR && (
                    <>
                      <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: THEME.brand }} fill={THEME.brand} />
                      {ex.prLabels.map(label => (
                        <span key={label} className="text-xs font-medium" style={{ color: THEME.brand }}>{label}</span>
                      ))}
                    </>
                  )}
                  <p className="text-sm text-foreground truncate">{ex.name}</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-mono tabular-nums font-semibold" style={{ color: THEME.lifting }}>
                    {ex.bestWeight > 0 ? `${ex.bestWeight} kg × ${ex.bestReps}` : `${ex.bestReps} reps`}
                  </p>
                  <p className="text-xs" style={{ color: THEME.text.muted }}>
                    {ex.setsCompleted}/{ex.totalSets} sets
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          className="space-y-3 pt-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <button
            onClick={onFinish}
            disabled={completing}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-[0.97]"
          >
            {completing ? "Saving..." : "Save Workout"}
          </button>

          <button
            onClick={() => setShowShareCard(true)}
            className="w-full py-3 rounded-xl border border-border/50 text-foreground font-medium text-sm active:scale-[0.97] flex items-center justify-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            Share Workout
          </button>

          <button
            onClick={onClose}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Close without saving
          </button>
        </motion.div>

      </div>

      {/* Share Card Modal */}
      <AnimatePresence>
        {showShareCard && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShareCard(false)}
              className="fixed inset-0 bg-black/50 z-50"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-card safe-area-pb"
            >
              <div className="max-w-md mx-auto p-5 space-y-4">
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                <ShareCard ref={shareRef} data={{
                  type: 'workout',
                  userName: profile?.displayName || 'Athlete',
                  date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                  exerciseCount: exerciseSummary.length,
                  totalVolume: totalVolume,
                  prsHit: prCount,
                }} />
                <div className="flex gap-3">
                  {(['dark', 'light', 'transparent'] as const).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => {
                        const node = shareRef.current;
                        if (node) {
                          generateAndShare(node, dayName, theme);
                        }
                      }}
                      className="flex-1 py-2.5 rounded-xl text-xs font-medium capitalize border border-border/50"
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
