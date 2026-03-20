import { useState, useEffect, useRef, useCallback } from "react";
import type { ProgramExercise } from "@/features/program/programTypes";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import {
  Play,
  RotateCcw,
  Check,
  X,
  Dumbbell,
  Trophy,
  ChevronRight,
  Clock,
  Share2,
  Target,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { buildPRMap, checkSetPR, repBucketLabel, type PRMap, type RepBucket } from "@/lib/prTracking";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import ShareCard from "@/components/social/ShareCard";
import { generateAndShare } from "@/lib/shareCardGenerator";
import { getVolumeComparison } from "@/lib/funComparisons";
const lazyConfetti = () => import("canvas-confetti").then(m => m.default);

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.frequency.value = 523;
    osc2.frequency.value = 659;
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.15);
    osc1.stop(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 0.8);
  } catch {
    // AudioContext may not be available
  }
}

interface WorkoutDay {
  dayName: string;
  dayType: string;
  exercises: ProgramExercise[];
  completed: boolean;
}

type SetType = "working" | "warmup" | "dropset" | "failure";

const SET_TYPE_CONFIG: Record<SetType, { label: string; color: string; bg: string }> = {
  working: { label: "W", color: "text-foreground", bg: "" },
  warmup: { label: "W", color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30" },
  dropset: { label: "D", color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30" },
  failure: { label: "F", color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
};

const SET_TYPE_ORDER: SetType[] = ["working", "warmup", "dropset", "failure"];

const TYPE_COLORS: Record<SetType, string> = {
  working: "#a3a3a3",
  warmup: "#ca8a04",
  dropset: "#9333ea",
  failure: "#dc2626",
};

const TYPE_LABELS: Record<SetType, string> = {
  working: "Working",
  warmup: "Warmup",
  dropset: "Drop",
  failure: "Failure",
};

const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

interface SetLog {
  reps: number;
  weight: number;
  completed: boolean;
  type: SetType;
  rpe?: number;
}

interface Props {
  day: WorkoutDay;
  dayIndex: number;
  onLogExercise: (dayIndex: number, exIndex: number, reps: number, weight: number) => Promise<void>;
  onCompleteDay: (dayIndex: number) => Promise<void>;
  onClose: () => void;
}

export default function WorkoutSession({ day, dayIndex, onLogExercise, onCompleteDay, onClose }: Props) {
  const { user, profile, updateProfile } = useAuth();
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [setLogs, setSetLogs] = useState<SetLog[][]>(() =>
    day.exercises.map((ex) =>
      Array.from({ length: ex.sets }, () => ({
        reps: ex.reps,
        weight: ex.weight,
        completed: false,
        type: "working" as SetType,
      }))
    )
  );
  const [showRPE, setShowRPE] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const sessionStartRef = useRef(0);
  useEffect(() => { sessionStartRef.current = Date.now(); }, []);

  // Multi-rep-range PR tracking
  const [prMap, setPrMap] = useState<PRMap>({});
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [firedPRs, setFiredPRs] = useState<Map<string, RepBucket[]>>(new Map());

  // Pre-fill weights/reps from most recent previous session + build PR map
  useEffect(() => {
    if (!user?.uid || !day.exercises.length) return;

    const fetchPreviousWeights = async () => {
      const workoutsRef = collection(db, "users", user.uid, "workouts");
      const snap = await getDocs(query(workoutsRef, orderBy("date", "desc"), limit(50)));

      const prevWeights: Record<string, { weight: number; reps: number }[]> = {};

      snap.docs.forEach((d) => {
        const data = d.data();
        (data.exercises || []).forEach((ex: { exerciseName: string; sets?: { weightKg?: number; reps?: number }[] }) => {
          const name = ex.exerciseName;
          if (!prevWeights[name] && ex.sets?.length && ex.sets.length > 0) {
            prevWeights[name] = ex.sets.map((s) => ({
              weight: s.weightKg || 0,
              reps: s.reps || 0,
            }));
          }
        });
      });

      setSetLogs((prev) => {
        const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
        day.exercises.forEach((ex, i) => {
          const name = ex.name;
          const prevSets = prevWeights[name];
          if (prevSets && updated[i]) {
            updated[i] = updated[i].map((set, si) => ({
              ...set,
              weight: set.weight || (prevSets[si]?.weight ?? prevSets[0]?.weight ?? 0),
              reps: set.reps || (prevSets[si]?.reps ?? prevSets[0]?.reps ?? 0),
            }));
          }
        });
        return updated;
      });

      // Build multi-rep-range PR map from history
      // TODO: persist PR map to Firestore (users/{uid}/stats/prMap) for complete history beyond 50 sessions
      const history = snap.docs.map(d => {
        const data = d.data();
        return {
          date: data.date as string,
          exercises: (data.exercises || []).map((ex: { exerciseName: string; sets: { weightKg: number; reps: number }[] }) => ({
            exerciseName: ex.exerciseName,
            sets: (ex.sets || []).map(s => ({ weightKg: s.weightKg || 0, reps: s.reps || 0 })),
          })),
        };
      });
      setPrMap(buildPRMap(history));

      // Count sessions per exercise for 3-session minimum filter
      const counts: Record<string, number> = {};
      for (const w of history) {
        const seen = new Set<string>();
        for (const ex of w.exercises) {
          if (!seen.has(ex.exerciseName)) {
            counts[ex.exerciseName] = (counts[ex.exerciseName] || 0) + 1;
            seen.add(ex.exerciseName);
          }
        }
      }
      setSessionCounts(counts);
    };

    fetchPreviousWeights();
  }, [user?.uid, day.exercises]);

  // Rest timer
  const [restSeconds, setRestSeconds] = useState(0);
  const [restTarget, setRestTarget] = useState(90);
  const [isResting, setIsResting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chimeFiredRef = useRef(false);

  // Session state
  const [sessionComplete, setSessionComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(0);

  // Stall detection
  const [stallExercise, setStallExercise] = useState<{name: string, weight: number} | null>(null);
  const stallModalRef = useFocusTrap<HTMLDivElement>(!!stallExercise);

  // Undo last set
  const [lastCompleted, setLastCompleted] = useState<{ exIdx: number; setIdx: number } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentExercise = day.exercises[currentExIndex];
  const currentSets = setLogs[currentExIndex] ?? [];
  const completedSetsInExercise = currentSets.filter((s) => s.completed).length;
  const totalSetsCompleted = setLogs.flat().filter((s) => s.completed).length;
  const totalSetsTotal = setLogs.flat().length;

  // Haptic feedback helper
  const haptic = useCallback((pattern: number | number[]) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }, []);

  // Timer logic
  const startRest = useCallback(() => {
    setRestSeconds(0);
    setIsResting(true);
    chimeFiredRef.current = false;
    haptic(50);
  }, [haptic]);

  const stopRest = useCallback(() => {
    setIsResting(false);
    setRestSeconds(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isResting) {
      timerRef.current = setInterval(() => {
        setRestSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isResting]);

  // Auto-stop timer when it reaches target
  useEffect(() => {
    if (isResting && restSeconds >= restTarget && !chimeFiredRef.current) {
      chimeFiredRef.current = true;
      haptic([200, 100, 200]);
      playChime();
    }
  }, [isResting, restSeconds, restTarget, haptic]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const cycleSetType = (exIdx: number, setIdx: number) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      const current = updated[exIdx][setIdx].type;
      const currentIndex = SET_TYPE_ORDER.indexOf(current);
      updated[exIdx][setIdx].type = SET_TYPE_ORDER[(currentIndex + 1) % SET_TYPE_ORDER.length];
      return updated;
    });
  };

  const setSetType = (exIdx: number, setIdx: number, type: SetType) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx].type = type;
      return updated;
    });
  };

  const updateSetRPE = (exIdx: number, setIdx: number, rpe: number) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx].rpe = rpe;
      return updated;
    });
  };

  const addSet = (exIdx: number) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      const lastSet = updated[exIdx][updated[exIdx].length - 1];
      updated[exIdx].push({
        reps: lastSet?.reps ?? day.exercises[exIdx].reps,
        weight: lastSet?.weight ?? day.exercises[exIdx].weight,
        completed: false,
        type: "working",
      });
      return updated;
    });
  };

  const updateSetLog = (exIdx: number, setIdx: number, field: "reps" | "weight", value: number) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx][field] = value;
      return updated;
    });
  };

  const completeSet = async () => {
    const set = currentSets[currentSetIndex];
    if (!set) return;

    // Mark set complete
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[currentExIndex][currentSetIndex].completed = true;
      return updated;
    });

    haptic(100);

    // Multi-rep-range PR detection
    const exName = currentExercise.name;
    const prBucket = checkSetPR(exName, set.weight, set.reps, prMap, sessionCounts, 3);
    const alreadyFired = firedPRs.get(exName) || [];
    if (prBucket && !alreadyFired.includes(prBucket)) {
      setFiredPRs((prev) => {
        const updated = new Map(prev);
        updated.set(exName, [...(prev.get(exName) || []), prBucket]);
        return updated;
      });
      setPrMap((prev) => {
        const updated = { ...prev };
        if (!updated[exName]) updated[exName] = { '1rm': null, '3rm': null, '5rm': null, '8rm': null, '10rm': null };
        updated[exName] = { ...updated[exName], [prBucket]: { weight: set.weight, reps: set.reps, date: new Date().toISOString().split('T')[0] } };
        return updated;
      });
      lazyConfetti().then(confetti => {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        setTimeout(() => confetti({ particleCount: 30, spread: 90, origin: { y: 0.65 }, startVelocity: 15 }), 200);
      });
      haptic(50);
      toast.success(`New ${repBucketLabel(prBucket)}! ${set.weight}kg × ${set.reps} on ${exName}`);
    }

    // Track for undo
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setLastCompleted({ exIdx: currentExIndex, setIdx: currentSetIndex });
    undoTimeoutRef.current = setTimeout(() => setLastCompleted(null), 4000);

    const isLastSet = currentSetIndex >= currentSets.length - 1;
    const isLastExercise = currentExIndex >= day.exercises.length - 1;

    if (isLastSet) {
      // Log exercise performance (use last set's reps/weight)
      await onLogExercise(dayIndex, currentExIndex, set.reps, set.weight);

      if (isLastExercise) {
        setSessionDurationMinutes(Math.round((Date.now() - sessionStartRef.current) / 60000));
        setSessionComplete(true);
      } else {
        // Move to next exercise
        setCurrentExIndex((prev) => prev + 1);
        setCurrentSetIndex(0);
        startRest();
      }
    } else {
      // Move to next set, start rest timer
      setCurrentSetIndex((prev) => prev + 1);
      startRest();
    }
  };

  const handleUndo = () => {
    if (!lastCompleted) return;
    const { exIdx, setIdx } = lastCompleted;
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx].completed = false;
      return updated;
    });
    setCurrentExIndex(exIdx);
    setCurrentSetIndex(setIdx);
    stopRest();
    if (sessionComplete) setSessionComplete(false);
    setLastCompleted(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
  };

  // Cleanup undo timeout
  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  // Stall detection on session completion
  useEffect(() => {
    if (!sessionComplete || !user?.uid) return;

    const checkStalls = async () => {
      const workoutsRef = collection(db, "users", user.uid, "workouts");
      const snap = await getDocs(query(workoutsRef, orderBy("date", "desc"), limit(20)));
      const history = snap.docs.map(d => d.data());

      for (const ex of day.exercises) {
        // Check localStorage cooldown
        const cooldownKey = `tropos_stall_${ex.name}`;
        const lastPopup = localStorage.getItem(cooldownKey);
        if (lastPopup && Date.now() - Number(lastPopup) < 3 * 7 * 86400000) continue; // 3 weeks cooldown

        const lastThree = history
          .filter(w => (w.exercises || []).some((e: { exerciseName: string }) => e.exerciseName === ex.name))
          .slice(0, 3);

        if (lastThree.length < 3) continue;

        const weights = lastThree.map(w => {
          const found = (w.exercises || []).find((e: { exerciseName: string }) => e.exerciseName === ex.name);
          return found?.sets?.map((s: { weightKg?: number }) => s.weightKg).join(',') || '';
        });

        if (weights[0] && weights[0] === weights[1] && weights[1] === weights[2]) {
          const w = lastThree[0].exercises.find((e: { exerciseName: string }) => e.exerciseName === ex.name)?.sets?.[0]?.weightKg || 0;
          setStallExercise({ name: ex.name, weight: w });
          break;
        }
      }
    };

    checkStalls();
  }, [sessionComplete, user?.uid, day.exercises]);

  const handleFinish = async () => {
    setCompleting(true);
    await onCompleteDay(dayIndex);
    setCompleting(false);
    onClose();
  };

  // Session complete screen
  if (sessionComplete) {
    const durationDisplay = sessionDurationMinutes >= 60
      ? `${Math.floor(sessionDurationMinutes / 60)}h ${sessionDurationMinutes % 60}m`
      : `${sessionDurationMinutes}m`;

    const totalVolume = setLogs.flat()
      .filter(s => s.completed && s.type !== 'warmup')
      .reduce((sum, s) => sum + (s.weight * s.reps), 0);

    const totalVolumeDisplay = totalVolume >= 1000
      ? `${(totalVolume / 1000).toFixed(1)}k`
      : `${Math.round(totalVolume)}`;

    const prDetails = Array.from(firedPRs.entries()).flatMap(([name, buckets]) =>
      buckets.map(bucket => ({ name, label: repBucketLabel(bucket) }))
    );
    const prCount = prDetails.length;

    const exerciseSummary = day.exercises.map((ex, exIdx) => {
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
            <p className="text-sm text-muted-foreground">{day.dayName} · {day.dayType}</p>
          </motion.div>

          {/* Stat Cards Row */}
          <motion.div
            className="grid grid-cols-3 gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {/* Duration */}
            <div className="p-4 rounded-2xl bg-card text-center space-y-1">
              <Clock className="w-4 h-4 mx-auto" style={{ color: THEME.text.muted }} />
              <p className="text-lg font-bold font-mono tabular-nums text-foreground">{durationDisplay}</p>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: THEME.text.muted }}>Duration</p>
            </div>

            {/* Volume */}
            <div className="p-4 rounded-2xl bg-card text-center space-y-1">
              <Dumbbell className="w-4 h-4 mx-auto" style={{ color: THEME.lifting }} />
              <p className="text-lg font-bold font-mono tabular-nums text-foreground">{totalVolumeDisplay}<span className="text-xs font-normal" style={{ color: THEME.text.muted }}>kg</span></p>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: THEME.text.muted }}>Volume</p>
            </div>

            {/* Sets */}
            <div className="p-4 rounded-2xl bg-card text-center space-y-1">
              <Target className="w-4 h-4 mx-auto" style={{ color: THEME.semantic.positive }} />
              <p className="text-lg font-bold font-mono tabular-nums text-foreground">{totalSetsCompleted}</p>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: THEME.text.muted }}>Sets</p>
            </div>
          </motion.div>

          {/* PR Banner — only if PRs were hit */}
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
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: THEME.text.muted }}>
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
                          <span key={label} className="text-[9px] font-medium" style={{ color: THEME.brand }}>{label}</span>
                        ))}
                      </>
                    )}
                    <p className="text-sm text-foreground truncate">{ex.name}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-mono tabular-nums font-semibold" style={{ color: THEME.lifting }}>
                      {ex.bestWeight > 0 ? `${ex.bestWeight}kg × ${ex.bestReps}` : `${ex.bestReps} reps`}
                    </p>
                    <p className="text-[10px]" style={{ color: THEME.text.muted }}>
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
              onClick={handleFinish}
              disabled={completing}
              className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-[0.97] transition-transform"
            >
              {completing ? "Saving..." : "Save Workout"}
            </button>

            {/* Share Button */}
            <button
              onClick={() => setShowShareCard(true)}
              className="w-full py-3 rounded-xl border border-border/50 text-foreground font-medium text-sm active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
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

        {/* Stall detection modal — keep existing */}
        {stallExercise && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/40" role="button" tabIndex={0} aria-label="Close modal" onClick={() => setStallExercise(null)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setStallExercise(null); }} />
            <div ref={stallModalRef} role="dialog" aria-modal="true" className="relative rounded-2xl p-6 space-y-4 max-w-sm w-full bg-card/95 backdrop-blur-xl border border-border/50" style={{
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }}>
              <h3 className="text-lg font-bold text-foreground">Plateau detected</h3>
              <p className="text-sm text-muted-foreground">
                You've been at {stallExercise.weight}kg on {stallExercise.name} for 3 sessions.
                A small calorie increase (~150 cal/day) could help you break through.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    if (profile) {
                      const current = profile.customCalorieTarget || profile.targetCalories || 2200;
                      await updateProfile({ customCalorieTarget: current + 150 });
                      toast.success('Calorie target increased by 150');
                    }
                    localStorage.setItem(`tropos_stall_${stallExercise.name}`, String(Date.now()));
                    setStallExercise(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium"
                >
                  Adjust target (+150 cal)
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem(`tropos_stall_${stallExercise.name}`, String(Date.now()));
                    setStallExercise(null);
                  }}
                  className="px-4 py-2.5 text-sm text-muted-foreground"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        )}

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
                            generateAndShare(node, day.dayName, theme);
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


  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col safe-area-pb">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div>
          <p className="text-sm font-semibold text-foreground">{day.dayName}</p>
          <p className="text-[11px] text-muted-foreground">
            {totalSetsCompleted}/{totalSetsTotal} sets
          </p>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${totalSetsTotal > 0 ? (totalSetsCompleted / totalSetsTotal) * 100 : 0}%` }}
        />
      </div>

      {/* Exercise navigation pills */}
      <div className="relative">
        <div className="flex gap-1.5 px-4 py-3 overflow-x-auto">
          {day.exercises.map((ex, i) => {
            const setsForEx = setLogs[i] ?? [];
            const done = setsForEx.every((s) => s.completed);
            const active = i === currentExIndex;
            return (
              <button
                key={i}
                onClick={() => {
                  setCurrentExIndex(i);
                  const nextIncomplete = setsForEx.findIndex((s) => !s.completed);
                  setCurrentSetIndex(nextIncomplete >= 0 ? nextIncomplete : 0);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors shrink-0",
                  done
                    ? "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400"
                    : active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {ex.name.length > 15 ? ex.name.slice(0, 15) + "…" : ex.name}
              </button>
            );
          })}
        </div>
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent" />
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {/* Current exercise header */}
        <div className="text-center pt-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Dumbbell className="w-5 h-5" style={{ color: THEME.lifting }} />
            <h2 className="text-lg font-bold text-foreground">{currentExercise?.name}</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Set {currentSetIndex + 1} of {currentSets.length} · {completedSetsInExercise} done
          </p>
          {/* Previous performance hint */}
          {currentExercise?.lastPerformance && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium"
              style={{ background: `${THEME.lifting}18`, color: THEME.lifting }}>
              <ChevronRight className="w-3 h-3" />
              Last: {currentExercise.lastPerformance.sets}×{currentExercise.lastPerformance.reps}
              {currentExercise.lastPerformance.weight > 0 ? ` @ ${currentExercise.lastPerformance.weight}kg` : " @ Bodyweight"}
            </div>
          )}
        </div>

        {/* Rest Timer - circular */}
        <AnimatePresence>
          {isResting && (() => {
            const RADIUS = 54;
            const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
            const progress = Math.min(restSeconds / restTarget, 1);
            const dashOffset = CIRCUMFERENCE * (1 - progress);
            const isOver = restSeconds >= restTarget;
            return (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center gap-3 py-2"
              >
                {/* Circular timer */}
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
                    {/* Track */}
                    <circle cx="64" cy="64" r={RADIUS} fill="none"
                      stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                    {/* Progress */}
                    <circle cx="64" cy="64" r={RADIUS} fill="none"
                      stroke={isOver ? THEME.success : THEME.teal}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={CIRCUMFERENCE}
                      strokeDashoffset={dashOffset}
                      style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className={cn(
                      "text-3xl font-extrabold tabular-nums tracking-tight",
                      isOver ? "text-green-400" : "text-foreground"
                    )}>
                      {formatTime(restSeconds)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {isOver ? "GO!" : `/ ${formatTime(restTarget)}`}
                    </p>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                  <button onClick={stopRest}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-medium">
                    <RotateCcw className="w-3 h-3" /> Skip
                  </button>
                  <div className="flex gap-1">
                    {[60, 90, 120, 180].map((t) => (
                      <button key={t} onClick={() => setRestTarget(t)}
                        className={cn(
                          "px-2 py-1 rounded text-[10px] font-medium transition-colors",
                          restTarget === t ? "text-white" : "bg-muted text-muted-foreground"
                        )}
                        style={restTarget === t ? { background: THEME.teal } : undefined}
                      >
                        {t}s
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Set logging grid */}
        <div className="bg-card rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/50 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">Set</div>
            <div className="col-span-4">Weight (kg)</div>
            <div className="col-span-4">Reps</div>
            <div className="col-span-2 text-center">Done</div>
          </div>
          {currentSets.map((set, setIdx) => {
            const typeConfig = SET_TYPE_CONFIG[set.type];
            return (
              <div key={setIdx}>
                <div
                  className={cn(
                    "grid grid-cols-12 gap-2 items-center px-4 py-2.5 border-t border-border/30",
                    setIdx === currentSetIndex && !set.completed && "bg-primary/5",
                    set.completed && "opacity-60",
                    typeConfig.bg,
                  )}
                >
                  <div className="col-span-2 flex justify-center">
                    <button
                      onClick={() => cycleSetType(currentExIndex, setIdx)}
                      disabled={set.completed}
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                        typeConfig.color,
                        set.type !== "working" ? "border border-current" : "",
                      )}
                      title={`Set type: ${set.type}`}
                    >
                      {set.type === "working" ? setIdx + 1 : typeConfig.label}
                    </button>
                  </div>
                  <div className="col-span-4">
                    <input
                      type="number"
                      value={set.weight || ""}
                      placeholder={set.weight === 0 ? "BW" : ""}
                      aria-label={`Set ${setIdx + 1} weight`}
                      onChange={(e) => updateSetLog(currentExIndex, setIdx, "weight", Number(e.target.value) || 0)}
                      disabled={set.completed}
                      className="w-full px-2 py-1.5 rounded-lg bg-muted text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      type="number"
                      value={set.reps || ""}
                      aria-label={`Set ${setIdx + 1} reps`}
                      onChange={(e) => updateSetLog(currentExIndex, setIdx, "reps", Number(e.target.value) || 0)}
                      disabled={set.completed}
                      className="w-full px-2 py-1.5 rounded-lg bg-muted text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                    />
                  </div>
                  <div className="col-span-2 flex justify-center">
                    {set.completed ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-border" />
                    )}
                  </div>
                </div>
                {/* RPE selector for completed sets */}
                {showRPE && set.completed && (
                  <div className="flex gap-1 px-4 py-1.5 border-t border-border/20 bg-muted/30">
                    <span className="text-[10px] text-muted-foreground mr-1 self-center">RPE:</span>
                    {RPE_OPTIONS.map((rpe) => (
                      <button
                        key={rpe}
                        onClick={() => updateSetRPE(currentExIndex, setIdx, rpe)}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded transition-colors",
                          set.rpe === rpe
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {rpe}
                      </button>
                    ))}
                  </div>
                )}
                {/* Set type buttons for active (non-completed) current set */}
                {setIdx === currentSetIndex && !set.completed && (
                  <div className="flex gap-1.5 px-4 py-2 border-t border-border/20">
                    {(['working', 'warmup', 'dropset', 'failure'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setSetType(currentExIndex, setIdx, type)}
                        aria-label={`Set type: ${TYPE_LABELS[type]}`}
                        aria-pressed={set.type === type}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-primary",
                          set.type === type ? "opacity-100 ring-2 ring-current" : "opacity-40"
                        )}
                        style={{ color: TYPE_COLORS[type], backgroundColor: TYPE_COLORS[type] + '15' }}
                      >
                        {TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add Set button */}
          <button
            onClick={() => addSet(currentExIndex)}
            className="w-full py-2.5 border-t border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            + Add Set
          </button>
        </div>

        {/* Undo last set */}
        <AnimatePresence>
          {lastCompleted && (
            <motion.button
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onClick={handleUndo}
              className="mx-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-amber-500/15 text-amber-400 active:scale-95 transition-transform"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Undo last set
            </motion.button>
          )}
        </AnimatePresence>

        {/* RPE toggle */}
        <button
          onClick={() => setShowRPE(!showRPE)}
          className={cn(
            "text-xs px-3 py-1.5 rounded-lg transition-colors mx-auto block",
            showRPE ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {showRPE ? "Hide RPE" : "Show RPE"}
        </button>

        {/* Prescription hint */}
        {currentExercise && (
          <p className="text-xs text-muted-foreground text-center">
            Target: {currentExercise.sets}&times;{currentExercise.reps} @{" "}
            {currentExercise.weight > 0 ? `${currentExercise.weight}kg` : "Bodyweight"}
          </p>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="px-4 py-3 border-t border-border/50 bg-background">
        {isResting ? (
          <button
            onClick={stopRest}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Play className="w-4 h-4" /> Ready — Start Next Set
          </button>
        ) : (
          <button
            onClick={completeSet}
            disabled={!currentSets[currentSetIndex] || currentSets[currentSetIndex]?.completed}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {currentSetIndex >= currentSets.length - 1 && currentExIndex >= day.exercises.length - 1
              ? "Finish Last Set"
              : currentSetIndex >= currentSets.length - 1
                ? "Complete Exercise"
                : `Complete Set ${currentSetIndex + 1}`}
          </button>
        )}
      </div>
    </div>
  );
}

